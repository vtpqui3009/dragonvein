/**
 * The dragon mesher's worker half (M3c, STATE.md run 13): src/assets/dragon/arrays.ts,
 * worker.ts and Genome.fromJSON. The Worker itself runs in the browser, and gate:meshgen
 * measures it there. Here, `handle()` is called directly, so the protocol is checked in Node:
 * - the three-free arrays equal what `buildDragon` puts in its geometry, byte for byte;
 * - a genome survives `toJSON` → `fromJSON` unchanged;
 * - the worker's reply equals the direct build and transfers eight distinct buffers (M7a added the idle's two
 *   weights, M7b the skin's index and weight).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Genome, GENE_NAMES, breed, wild, type Element } from '../src/core/genome';
import { buildDragonArrays } from '../src/assets/dragon/arrays';
import { buildDragon } from '../src/assets/dragon/builder';
import { handle } from '../src/assets/dragon/worker';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const fx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe }[];
};
const genomes: Genome[] = [];
for (const { recipe: r } of fx.genomes) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe.each(genomes.map((g, i) => [i, g] as const))('genome #%i', (_i, gm) => {
  it('the three-free arrays are what buildDragon puts in its geometry', () => {
    const a = buildDragonArrays(gm);
    const g = buildDragon(gm).geometry;
    expect(bytes(a.position).equals(bytes(g.getAttribute('position').array as Float32Array))).toBe(true);
    expect(bytes(a.normal).equals(bytes(g.getAttribute('normal').array as Float32Array))).toBe(true);
    expect(bytes(a.color).equals(bytes(g.getAttribute('color').array as Float32Array))).toBe(true);
    expect(bytes(a.index).equals(bytes(g.getIndex()!.array as Uint32Array))).toBe(true);
    expect(bytes(a.skinIndex).equals(bytes(g.getAttribute('skinIndex').array as Uint16Array))).toBe(true);
    expect(bytes(a.skinWeight).equals(bytes(g.getAttribute('skinWeight').array as Float32Array))).toBe(true);
    expect(g.groups.map((x) => [x.start, x.count, x.materialIndex])).toEqual(a.groups.map((x) => [x.start, x.count, x.mat]));
  });

  it('survives toJSON -> fromJSON: same gid, same alleles, same phenotype', () => {
    const back = Genome.fromJSON(JSON.parse(JSON.stringify(gm.toJSON())));
    expect(back.gid()).toBe(gm.gid());
    expect(back.element).toEqual(gm.element);
    for (const k of GENE_NAMES) expect(Object.is(back.phenotype[k], gm.phenotype[k]), k).toBe(true);
  });

  it('the worker reply equals the direct build and transfers its eight buffers', () => {
    const { reply, transfer } = handle({ id: 7, genome: JSON.parse(JSON.stringify(gm.toJSON())) });
    const direct = buildDragonArrays(gm);
    expect(reply.id).toBe(7);
    expect(reply.workerMs).toBeGreaterThanOrEqual(0);
    for (const k of ['position', 'normal', 'color', 'index', 'idleBreathSway', 'idleBlink', 'skinIndex', 'skinWeight'] as const) {
      expect(bytes(reply.arrays[k]).equals(bytes(direct[k])), k).toBe(true);
    }
    expect(new Set(transfer).size).toBe(8);
    expect(reply.arrays.rig).toEqual(direct.rig);
    for (const k of ['position', 'normal', 'color', 'index', 'idleBreathSway', 'idleBlink', 'skinIndex', 'skinWeight'] as const) {
      expect(transfer, k).toContain(reply.arrays[k].buffer);
    }
  });
});

describe('Genome.fromJSON refuses what it should', () => {
  it('a tampered gene no longer hashes to the stored gid', () => {
    // Both alleles: gid() hashes the phenotype, and a recessive allele alone does not show.
    const j = genomes[0]!.toJSON();
    j.g.bodyMass[0][0] += 0.01;
    j.g.bodyMass[1][0] += 0.01;
    expect(() => Genome.fromJSON(j)).toThrow(/gid/);
  });
  it('an unknown element', () => {
    const j = genomes[0]!.toJSON();
    j.element = ['plasma', 'ember'];
    expect(() => Genome.fromJSON(j)).toThrow(/element/);
  });
});

describe('DragonMesher fails loudly when its worker does', () => {
  /** A Worker that never loads: it reports an error on the next tick, as a 404 or a throw would. */
  class DeadWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    constructor() { setTimeout(() => this.onerror?.({ message: 'failed to fetch worker script' }), 0); }
    postMessage(): void {}
    terminate(): void {}
  }

  it('ready() and build() reject instead of hanging, and later calls reject at once', async () => {
    const real = globalThis.Worker;
    (globalThis as { Worker: unknown }).Worker = DeadWorker;
    try {
      const { DragonMesher } = await import('../src/assets/dragon/mesher');
      const m = new DragonMesher();
      const warm = m.ready();
      const built = m.build(genomes[0]!);
      await expect(warm).rejects.toThrow(/dragon worker failed/);
      await expect(built).rejects.toThrow(/dragon worker failed/);
      await expect(m.build(genomes[1]!)).rejects.toThrow(/dragon worker failed/);
      await expect(m.ready()).rejects.toThrow(/dragon worker failed/);
    } finally {
      (globalThis as { Worker: unknown }).Worker = real;
    }
  });
});
