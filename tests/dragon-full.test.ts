/**
 * The whole runtime dragon (M3b): src/assets/dragon/builder.ts `buildDragon` on the 32
 * fixed genomes, against STATE.md run 12's criteria.
 *
 * The parts the reference builds from Blender primitives are held to what Blender built,
 * recorded by assetgen/dragon_vectors.py in docs/fixtures/dragon-graphs.json:
 * - each spike's and the ornament's world-space vertices, within 1e-5;
 * - each membrane's bounding box after Solidify and Subsurf, within 1e-4.
 *
 * Then the merged mesh gets M3a's checks: finite, every part closed and wound outward,
 * inside its envelope, deterministic, inside its triangle cap.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breed, wild, type Element, type Genome } from '../src/core/genome';
import { MATERIAL_OF, buildDragon } from '../src/assets/dragon/builder';
import { membranePolys, ornamentParams, spikeParams } from '../src/assets/dragon/graph';
import { membraneMesh, primitiveVertices } from '../src/assets/dragon/parts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const gfx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe }[];
};
interface Blender {
  spikes: number[][][];
  ornament: number[][][];
  membrane: { side: number; vertices: number; min: number[]; max: number[] }[];
}
const fx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/dragon-graphs.json'), 'utf8')) as {
  graphs: { gid: string; parts: { blender: Blender } }[];
};
const genomes: Genome[] = [];
for (const { recipe: r } of gfx.genomes) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}

/** Whole-dragon triangles allowed at LOD0 (STATE.md run 12). */
const TRI_BUDGET = 12000;

describe('the primitive parts are where Blender put them', () => {
  genomes.forEach((gm, i) => {
    const want = fx.graphs[i]!.parts.blender;
    it(`#${i}: ${want.spikes.length} spikes, ${want.ornament.length} ornament, 2 membranes`, () => {
      const p = gm.phenotype;
      let worst = 0;
      const cmp = (got: number[][], exp: number[][]) => {
        expect(got.length).toBe(exp.length);
        got.forEach((v, n) => v.forEach((c, k) => { worst = Math.max(worst, Math.abs(c - exp[n]![k]!)); }));
      };
      spikeParams(p).forEach((c, k) => cmp(primitiveVertices(c), want.spikes[k]!));
      const orn = ornamentParams(p);
      expect(orn ? 1 : 0).toBe(want.ornament.length);
      if (orn) cmp(primitiveVertices(orn), want.ornament[0]!);
      expect(worst, 'worst vertex distance from Blender').toBeLessThan(1e-5);

      for (const m of want.membrane) {
        const pos = membraneMesh(membranePolys(p, m.side)).position;
        for (let k = 0; k < 3; k++) {
          let lo = Infinity, hi = -Infinity;
          for (let j = k; j < pos.length; j += 3) { lo = Math.min(lo, pos[j]!); hi = Math.max(hi, pos[j]!); }
          expect(Math.abs(lo - m.min[k]!), `membrane ${m.side} min[${k}]`).toBeLessThan(1e-4);
          expect(Math.abs(hi - m.max[k]!), `membrane ${m.side} max[${k}]`).toBeLessThan(1e-4);
        }
      }
    });
  });
});

describe.each(genomes.map((g, i) => [i, g] as const))('whole dragon #%i', (i, gm) => {
  const d = buildDragon(gm);
  const pos = d.geometry.getAttribute('position').array as Float32Array;
  const nrm = d.geometry.getAttribute('normal').array as Float32Array;
  const col = d.geometry.getAttribute('color').array as Float32Array;
  const index = d.geometry.getIndex()!.array as Uint32Array;

  it('finite, unit normals, indices in range', () => {
    let bad = 0, worstUnit = 0, maxIndex = 0;
    for (const a of [pos, nrm, col]) for (const x of a) if (!Number.isFinite(x)) bad++;
    for (let k = 0; k < nrm.length; k += 3) worstUnit = Math.max(worstUnit, Math.abs(Math.hypot(nrm[k]!, nrm[k + 1]!, nrm[k + 2]!) - 1));
    for (const v of index) maxIndex = Math.max(maxIndex, v);
    expect(bad).toBe(0);
    expect(worstUnit).toBeLessThan(1e-4);
    expect(maxIndex).toBeLessThan(pos.length / 3);
  });

  it('every part is closed and wound outward (vertices welded by position)', () => {
    const key = (v: number) => `${Math.round(pos[v * 3]! * 1e5)},${Math.round(pos[v * 3 + 1]! * 1e5)},${Math.round(pos[v * 3 + 2]! * 1e5)}`;
    for (const [pi, part] of d.parts.entries()) {
      const directed = new Map<string, number>();
      let vol = 0;
      for (let t = part.start; t < part.start + part.count; t += 3) {
        const tri = [index[t]!, index[t + 1]!, index[t + 2]!];
        const ks = tri.map(key);
        for (let k = 0; k < 3; k++) {
          if (ks[k] === ks[(k + 1) % 3]) continue; // a degenerate sliver at a pole
          const e = `${ks[k]}|${ks[(k + 1) % 3]}`;
          directed.set(e, (directed.get(e) ?? 0) + 1);
        }
        const [a, b, c] = tri.map((v) => [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!] as const);
        vol += (a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0])
          + a![2] * (b![0] * c![1] - b![1] * c![0])) / 6;
      }
      let holes = 0, doubled = 0;
      for (const [e, n] of directed) {
        const [u, v] = e.split('|');
        if (n !== 1) doubled++;
        if (directed.get(`${v}|${u}`) !== 1) holes++;
      }
      expect(doubled, `part ${pi} (${d.kinds[pi]}): edges used twice the same way`).toBe(0);
      expect(holes, `part ${pi} (${d.kinds[pi]}): edges with no twin`).toBe(0);
      expect(vol, `part ${pi} (${d.kinds[pi]}): signed volume`).toBeGreaterThan(0);
    }
  });

  it('material groups cover every triangle once, and each part sits in its material', () => {
    const gs = d.geometry.groups;
    expect(gs.reduce((n, g) => n + g.count, 0)).toBe(index.length);
    gs.forEach((g, k) => { if (k) expect(g.start).toBe(gs[k - 1]!.start + gs[k - 1]!.count); });
    d.parts.forEach((part, pi) => {
      const g = gs.find((x) => x.start <= part.start && part.start + part.count <= x.start + x.count);
      expect(g?.materialIndex, `part ${pi} ${d.kinds[pi]}`).toBe(MATERIAL_OF[d.kinds[pi]!]);
    });
  });

  it('has every part the genome asks for', () => {
    const p = gm.phenotype;
    const count = (k: string) => d.kinds.filter((x) => x === k).length;
    expect(count('membrane')).toBe(2);
    expect(count('spike')).toBe(p.spineCount);
    expect(count('ornament')).toBe(p.tailTip === 0 ? 0 : 1);
    expect(count('eye')).toBe(2);
    expect(count('spine')).toBe(1);
  });

  it('stays inside the graph envelope and its primitives, grown by 10%', () => {
    const bb = d.geometry.boundingBox!;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const grow = (x: number, y: number, z: number, r: number) => {
      const q = [x, z, -y];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]! - r); hi[k] = Math.max(hi[k]!, q[k]! + r); }
    };
    d.graph.v.forEach(([x, y, z], n) => grow(x, y, z, d.graph.r[n]!));
    for (const c of [...spikeParams(gm.phenotype), ...[ornamentParams(gm.phenotype)].filter((c) => c !== null)]) {
      for (const [x, y, z] of primitiveVertices(c)) grow(x, y, z, 0);
    }
    for (const s of [1, -1]) for (const [x, y, z] of membranePolys(gm.phenotype, s).v) grow(x, y, z, 0.05);
    const min = [bb.min.x, bb.min.y, bb.min.z], max = [bb.max.x, bb.max.y, bb.max.z];
    for (let k = 0; k < 3; k++) {
      const g = 0.10 * (hi[k]! - lo[k]!);
      expect(min[k]!).toBeGreaterThanOrEqual(lo[k]! - g);
      expect(max[k]!).toBeLessThanOrEqual(hi[k]! + g);
    }
  });

  it(`stays within ${TRI_BUDGET} triangles and is deterministic (${i})`, () => {
    expect(index.length / 3).toBeLessThanOrEqual(TRI_BUDGET);
    const again = buildDragon(gm).geometry;
    expect(Buffer.from((again.getAttribute('position').array as Float32Array).buffer).equals(Buffer.from(pos.buffer))).toBe(true);
    expect(Buffer.from((again.getAttribute('color').array as Float32Array).buffer).equals(Buffer.from(col.buffer))).toBe(true);
  });
});
