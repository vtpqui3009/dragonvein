/**
 * The determinism and layer gates, exercised against fixtures.
 *
 * Both tools have only ever been observed passing, on a tree with no `src/sim` and no
 * `src/ui` — they print OK and exit 0 because there is nothing to scan. A gate nobody has
 * watched fail is a gate that might not work. These tests build a throwaway tree, run the
 * real tool in it, and assert the exit code and the message.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns the fixture root; files are written relative to it. */
const fixtures: string[] = [];
function makeTree(files: Record<string, string>): string {
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
  ])('rejects %s importing %s', (file, body, spec) => {
    const dir = makeTree({ [file]: body });
    const r = runTool('check-layers.mjs', dir);
    expect(r.code).toBe(1);
    expect(r.output).toContain('LAYER VIOLATION');
    expect(r.output).toContain(spec);
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

  it('accepts an asset declared with a script that exists', () => {
    const dir = makeTree({
      'public/assets/MANIFEST.json': JSON.stringify({
        assets: { 'rock/boulder': { script: 'assetgen/rock/boulder.py' } },
      }),
      'public/assets/rock/boulder.lod0.glb': 'not really a glb',
      'assetgen/rock/boulder.py': '# generator\n',
    });
    const r = runTool('check-assets.mjs', dir);
    expect(r.output).toContain('check:assets OK');
    expect(r.code).toBe(0);
  });
});

describe('the gate scripts themselves are runnable', () => {
  it('every tool parses under this node', () => {
    for (const tool of [
      'check-assets.mjs', 'check-determinism.mjs', 'check-layers.mjs',
      'gate-meshgen.mjs', 'gate-parity.mjs', 'gate-perf.mjs', 'playtest.mjs',
      'preview-server.mjs', 'site-config.mjs', 'strip-sourcemaps.mjs',
    ]) {
      expect(() => execFileSync(process.execPath, ['--check', path.join(ROOT, 'tools', tool)]))
        .not.toThrow();
    }
  });
});
