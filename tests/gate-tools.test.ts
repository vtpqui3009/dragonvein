/**
 * The determinism and layer gates, exercised against fixtures.
 *
 * Both tools have only ever been observed passing, on a tree with no `src/sim` and no
 * `src/ui` — they print OK and exit 0 because there is nothing to scan. A gate nobody has
 * watched fail is a gate that might not work. These tests build a throwaway tree, run the
 * real tool in it, and assert the exit code and the message.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns the fixture root; files are written relative to it. */
const fixtures: string[] = [];
function makeTree(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dragonvein-gate-'));
  fixtures.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}
afterEach(() => {
  while (fixtures.length) {
    const dir = fixtures.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function runTool(tool: string, cwd: string): { code: number; output: string } {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool)], {
    cwd, encoding: 'utf8',
  });
  return { code: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('check:determinism', () => {
  it('accepts a clean sim module', () => {
    const dir = makeTree({
      'src/sim/tick.ts': 'export function step(n: number): number {\n  return n + 1;\n}\n',
    });
    const r = runTool('check-determinism.mjs', dir);
    expect(r.output).toContain('check:determinism OK');
    expect(r.code).toBe(0);
  });

  it.each([
    ['Math.random', 'export const r = () => Math.random();\n'],
    ['Date.now', 'export const t = () => Date.now();\n'],
    ['performance.now', 'export const t = () => performance.now();\n'],
    ['new Date', 'export const t = () => new Date();\n'],
    ['document', 'export const el = () => document.body;\n'],
    ['window', 'export const w = () => window.innerWidth;\n'],
  ])('rejects %s in src/sim', (needle, body) => {
    const dir = makeTree({ 'src/sim/bad.ts': body });
    const r = runTool('check-determinism.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('NON-DETERMINISTIC');
    expect(r.output).toContain(needle);
  });

  it('reports the file and line so the failure is actionable', () => {
    const dir = makeTree({
      'src/sim/deep/nested.ts': 'export const a = 1;\nexport const b = Math.random();\n',
    });
    const r = runTool('check-determinism.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain(path.join('src', 'sim', 'deep', 'nested.ts') + ':2');
  });
});

describe('check:layers', () => {
  it('accepts imports a layer is allowed to make', () => {
    const dir = makeTree({
      'src/ui/panel.ts': "import { fmt } from '../core/fmt';\nexport const p = fmt;\n",
      'src/sim/world.ts': "import { Rng } from '../core/rng';\nexport const r = Rng;\n",
      'src/render/wind.ts': "import * as THREE from 'three';\nimport { Rng } from '../core/rng';\n" +
        "import { m } from '../assets/dragon/mesher';\nexport const x = [THREE, Rng, m];\n",
    });
    const r = runTool('check-layers.mjs', dir);
    expect(r.output).toContain('check:layers OK');
    expect(r.code).toBe(0);
  });

  it.each([
    ['src/ui/panel.ts', "import * as THREE from 'three';\nexport const t = THREE;\n", 'three'],
    ['src/sim/world.ts', "import { r } from '../render/scene';\nexport const x = r;\n", '../render/scene'],
    ['src/core/util.ts', "import { s } from '../sim/world';\nexport const x = s;\n", '../sim/world'],
    ['src/content/items.ts', "import { a } from '../audio/bus';\nexport const x = a;\n", '../audio/bus'],
    ['src/render/scene.ts', "import { w } from '../sim/world';\nexport const x = w;\n", '../sim/world'],
    ['src/render/hud.ts', "import { p } from '../ui/panel';\nexport const x = p;\n", '../ui/panel'],
  ])('rejects %s importing %s', (file, body, spec) => {
    const dir = makeTree({ [file]: body });
    const r = runTool('check-layers.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('LAYER VIOLATION');
    expect(r.output).toContain(spec);
  });

  // docs/ARCHITECTURE.md §Ownership: "src/sim may import `core`" and "src/core … nothing".
  // A forbid-list passed every one of these until M8a; the allow-list catches them.
  it('accepts sim importing core and itself, in every import form', () => {
    const dir = makeTree({
      'src/sim/world.ts': "import { Rng } from '../core/rng';\n" +
        "import type {\n  GenomeJson,\n} from '../core/genome';\n" +
        "export { step } from './step';\nexport const r = [Rng] as unknown as GenomeJson;\n" +
        "export const later = () => import('./roster');\n",
      'src/sim/step.ts': 'export const step = 1;\n',
      'src/sim/roster.ts': 'export const roster = 1;\n',
      'src/core/rng.ts': "import { py } from './py';\nexport const Rng = py;\n",
      'src/core/py.ts': 'export const py = 1;\n',
    });
    const r = runTool('check-layers.mjs', dir);
    expect(r.output).toContain('check:layers OK');
    expect(r.code).toBe(0);
  });

  it.each([
    ['src/sim/world.ts', '../content/items', "import { items } from '../content/items';\nexport const x = items;\n"],
    ['src/sim/world.ts', 'node:fs', "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n"],
    ['src/sim/world.ts', 'zod', "import { z } from 'zod';\nexport const x = z;\n"],
    ['src/sim/world.ts', '../main', "import { boot } from '../main';\nexport const x = boot;\n"],
    ['src/sim/world.ts', '../render/scene', "export { scene } from '../render/scene';\n"],
    ['src/sim/world.ts', '../ui/panel', "export const x = () => import('../ui/panel');\n"],
    ['src/sim/world.ts', '../audio/bus', "import '../audio/bus';\n"],
    ['src/sim/deep/a.ts', '../../dragon-view', "import { v } from '../../dragon-view';\nexport const x = v;\n"],
    ['src/core/save.ts', 'idb', "import { idb } from 'idb';\nexport const x = idb;\n"],
  ])('allow-list: rejects %s importing %s', (file, spec, body) => {
    const dir = makeTree({ [file]: body });
    const r = runTool('check-layers.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('LAYER VIOLATION');
    expect(r.output).toContain(spec);
    // One bad import is one violation, even where the forbid-list caught it as well.
    expect(r.output).toContain('1 layer violation(s)');
  });
});

describe('check:assets', () => {
  it('rejects a shipped asset that names no generator script', () => {
    const dir = makeTree({
      'public/assets/MANIFEST.json': JSON.stringify({ assets: {} }),
      'public/assets/rock/boulder.lod0.glb': 'not really a glb',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('UNDECLARED ASSET');
  });

  it('accepts an asset whose binaries are pinned, counted and inside budget', () => {
    const lod0 = glb(4);
    const lod1 = glb(2);
    const dir = makeTree({
      'public/assets/MANIFEST.json': manifest({ lod0: [lod0, 4], lod1: [lod1, 2] }),
      'public/assets/rock/boulder.lod0.glb': lod0,
      'public/assets/rock/boulder.lod1.glb': lod1,
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.output).toContain('check:assets OK');
    expect(r.code).toBe(0);
  });

  it('rejects a binary the manifest does not pin by hash', () => {
    const dir = makeTree({
      'public/assets/MANIFEST.json': JSON.stringify({
        assets: { 'rock/boulder': { script: 'assetgen/rock/boulder.py' } },
      }),
      'public/assets/rock/boulder.lod0.glb': glb(4),
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('UNPINNED BINARY');
  });

  it('rejects a binary whose bytes changed after the build', () => {
    const lod0 = glb(4);
    const tampered = Buffer.from(lod0);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 0xff, tampered.length - 1);
    const dir = makeTree({
      'public/assets/MANIFEST.json': manifest({ lod0: [lod0, 4] }),
      'public/assets/rock/boulder.lod0.glb': tampered,
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('HASH MISMATCH');
  });

  it('counts triangles from the bytes, not from the manifest\'s claim', () => {
    const lod0 = glb(4);
    const dir = makeTree({
      'public/assets/MANIFEST.json': manifest({ lod0: [lod0, 3] }),
      'public/assets/rock/boulder.lod0.glb': lod0,
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('TRI COUNT');
  });

  it('rejects a LOD chain that does not get cheaper, and a level over budget', () => {
    const big = glb(4);
    const same = glb(4);
    const dir = makeTree({
      'public/assets/MANIFEST.json': manifest({ lod0: [big, 4], lod1: [same, 4] }, { lod0: 3, lod1: 10 }),
      'public/assets/rock/boulder.lod0.glb': big,
      'public/assets/rock/boulder.lod1.glb': same,
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('LOD CHAIN');
    expect(r.output).toContain('OVER BUDGET');
  });
});

/** A minimal valid glTF 2.0 binary: one TRIANGLES primitive with `tris` triangles. */
function glb(tris: number): Buffer {
  const verts = tris * 3;
  const bin = Buffer.alloc(verts * 12);
  for (let i = 0; i < verts; i++) bin.writeFloatLE(i, i * 12);
  const text = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteLength: bin.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: verts, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  });
  // GLB chunks are 4-byte aligned; the JSON chunk pads with spaces (glTF 2.0 §4.4.3.1).
  const jsonChunk = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const ch = (len: number, type: number) => {
    const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b;
  };
  return Buffer.concat([header, ch(jsonChunk.length, 0x4e4f534a), jsonChunk, ch(bin.length, 0x004e4942), bin]);
}

function manifest(
  lods: Record<string, [Buffer, number]>,
  triBudget: Record<string, number> = { lod0: 100, lod1: 100 },
): string {
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  return JSON.stringify({
    assets: {
      'rock/boulder': {
        script: 'assetgen/rock/boulder.py',
        triBudget,
        lods: Object.fromEntries(Object.entries(lods).map(([lod, [bytes, tris]]) =>
          [lod, { file: `rock/boulder.${lod}.glb`, tris, sha256: sha(bytes) }])),
      },
    },
  });
}

describe('the gate scripts themselves are runnable', () => {
  it('every tool parses under this node', () => {
    for (const tool of [
      'check-assets.mjs', 'check-determinism.mjs', 'check-layers.mjs', 'glb.mjs', 'variant-probe.mjs',
      'gate-meshgen.mjs', 'gate-parity.mjs', 'gate-perf.mjs', 'playtest.mjs', 'png.mjs',
      'preview-server.mjs', 'rasteriser-cap.mjs', 'site-config.mjs', 'strip-sourcemaps.mjs',
    ]) {
      expect(() => execFileSync(process.execPath, ['--check', path.join(ROOT, 'tools', tool)]))
        .not.toThrow();
    }
  });
});

/**
 * The cap decides whether `gate:perf` enforces the main-thread tail, so its pure parts
 * are worth pinning down. The impure half — pinning real threads and reading their masks
 * back — is exercised by `gate:perf` itself on every run and reported in
 * `perf.json.rasteriserCap`.
 */
describe('the rasteriser cap partitions cores the way the budget needs', () => {
  it('splits cores into two non-empty disjoint halves, page first', async () => {
    const { partition, CAP_MIN_CPUS } = await import('../tools/rasteriser-cap.mjs');
    const four = partition(4);
    expect(four).toEqual({ page: [0, 1], rest: [2, 3] });

    for (const n of [4, 5, 8, 16]) {
      const p = partition(n);
      expect(p).not.toBeNull();
      if (!p) continue;
      expect(p.page.length).toBeGreaterThan(1);   // see CAP_MIN_CPUS: one is not enough
      expect(p.rest.length).toBeGreaterThan(0);
      expect(p.page.filter((c) => p.rest.includes(c))).toEqual([]);
      expect([...p.page, ...p.rest]).toHaveLength(n);
    }
    // Below the floor it declines rather than guessing: with the page on a single core
    // its own compositor thread becomes the competitor and the tail got worse than
    // uncapped (p95 1.9-2.3 against 1.6-1.8).
    expect(CAP_MIN_CPUS).toBe(4);
    for (const n of [0, 1, 2, 3]) expect(partition(n)).toBeNull();
  });

  it('reads affinity masks back in every format /proc writes them', async () => {
    const { parseCpuList } = await import('../tools/rasteriser-cap.mjs');
    expect(parseCpuList('0-3')).toEqual([0, 1, 2, 3]);
    expect(parseCpuList('2')).toEqual([2]);
    expect(parseCpuList('0,2-3')).toEqual([0, 2, 3]);
    expect(parseCpuList('2-3')).toEqual([2, 3]);
    // A mask that cannot be read must not come back looking like "pinned to cpu 0".
    expect(parseCpuList('')).toEqual([]);
  });

  it('declines the cap on a real GPU instead of pinning anything', async () => {
    const { applyRasteriserCap } = await import('../tools/rasteriser-cap.mjs');
    const cap = await applyRasteriserCap({ rootPid: process.pid, software: false });
    expect(cap.applied).toBe(false);
    expect(cap.verified).toBe(false);
    expect(cap.reason).toContain('not needed');
    // Nothing was touched, so there is nothing to report as pinned.
    expect(cap.processes).toEqual([]);
  });

  it('never reports an unapplied cap as verified', async () => {
    const { verifyRasteriserCap } = await import('../tools/rasteriser-cap.mjs');
    const notApplied = await verifyRasteriserCap({
      applied: false, verified: false, reason: 'unavailable: made up for this test',
      cpus: { total: 4, page: null, rasteriser: null }, processes: [],
      marlWorkers: null, mechanism: 'none', threadCountCapTried: [],
    });
    expect(notApplied.verified).toBe(false);

    // Overlapping halves are the one thing that would silently defeat the whole point.
    const overlapping = await verifyRasteriserCap({
      applied: true, verified: false, reason: null,
      cpus: { total: 4, page: [0, 1], rasteriser: [1, 2, 3] }, processes: [],
      marlWorkers: 4, mechanism: 'test', threadCountCapTried: [],
    });
    expect(overlapping.verified).toBe(false);
    expect(overlapping.reason).toContain('overlap');
  });
});
