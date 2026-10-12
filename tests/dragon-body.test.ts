/**
 * The runtime dragon body (M3a): src/assets/dragon/builder.ts on the 32 fixed genomes.
 *
 * The graph underneath is proven equal to the reference in tests/dragon-graph.test.ts.
 * This file checks the skin laid over it, against STATE.md run 11's criteria: finite,
 * closed, outward-wound, inside the graph's own envelope, deterministic, inside budget.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breed, wild, type Element, type Genome } from '../src/core/genome';
import { EYE_COLOUR, GLINT_COLOUR, bellyWeight, bodyColours, buildDragonBody, hsv } from '../src/assets/dragon/builder';
import { paths } from '../src/assets/dragon/skin';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const fx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe; gid: string }[];
};
const genomes: Genome[] = [];
for (const { recipe: r } of fx.genomes) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}

/** Body triangles allowed at LOD0 for skeleton, torso and limbs (STATE.md run 11). */
const TRI_BUDGET = 6000;

describe.each(genomes.map((g, i) => [i, g] as const))('genome #%i', (i, gm) => {
  const body = buildDragonBody(gm);
  const pos = body.geometry.getAttribute('position').array as Float32Array;
  const nrm = body.geometry.getAttribute('normal').array as Float32Array;
  const col = body.geometry.getAttribute('color').array as Float32Array;
  const index = body.geometry.getIndex()!.array as Uint32Array;

  it('every attribute is finite and the normals are unit length', () => {
    let bad = 0, worstUnit = 0, maxIndex = 0;
    for (const a of [pos, nrm, col]) for (const x of a) if (!Number.isFinite(x)) bad++;
    for (let k = 0; k < nrm.length; k += 3) {
      worstUnit = Math.max(worstUnit, Math.abs(Math.hypot(nrm[k]!, nrm[k + 1]!, nrm[k + 2]!) - 1));
    }
    for (const v of index) maxIndex = Math.max(maxIndex, v);
    expect(bad, 'non-finite values').toBe(0);
    expect(worstUnit, 'worst |normal| - 1').toBeLessThan(1e-4);
    expect(maxIndex).toBeLessThan(pos.length / 3);
  });

  it('every tube is closed and wound outward', () => {
    expect(body.parts.reduce((s, p) => s + p.count, 0)).toBe(index.length);
    for (const part of body.parts) {
      // Closed and consistently oriented: each directed edge appears once, its reverse once.
      const directed = new Map<string, number>();
      let vol = 0;
      for (let t = part.start; t < part.start + part.count; t += 3) {
        const tri = [index[t]!, index[t + 1]!, index[t + 2]!];
        for (let k = 0; k < 3; k++) {
          const key = `${tri[k]},${tri[(k + 1) % 3]}`;
          directed.set(key, (directed.get(key) ?? 0) + 1);
        }
        const [a, b, c] = tri.map((v) => [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!] as const);
        vol += (a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0])
          + a![2] * (b![0] * c![1] - b![1] * c![0])) / 6;
      }
      for (const [key, n] of directed) {
        const [u, v] = key.split(',');
        expect(n, `edge ${key} used ${n}x`).toBe(1);
        expect(directed.get(`${v},${u}`), `edge ${key} has no twin: a hole`).toBe(1);
      }
      expect(vol, 'signed volume: negative means wound inward').toBeGreaterThan(0);
    }
  });

  it('the bounding box holds every graph node and stays inside the graph envelope + 10%', () => {
    const bb = body.geometry.boundingBox!;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    body.graph.v.forEach(([x, y, z], n) => {
      const q = [x, z, -y]; // z-up -> y-up
      const r = body.graph.r[n]!;
      expect(bb.containsPoint({ x: q[0]!, y: q[1]!, z: q[2]! } as never), `node ${n}`).toBe(true);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]! - r); hi[k] = Math.max(hi[k]!, q[k]! + r); }
    });
    const min = [bb.min.x, bb.min.y, bb.min.z], max = [bb.max.x, bb.max.y, bb.max.z];
    for (let k = 0; k < 3; k++) {
      const grow = 0.10 * (hi[k]! - lo[k]!);
      expect(min[k]!, `axis ${k} min`).toBeGreaterThanOrEqual(lo[k]! - grow);
      expect(max[k]!, `axis ${k} max`).toBeLessThanOrEqual(hi[k]! + grow);
    }
  });

  it(`stays within ${TRI_BUDGET} triangles`, () => {
    expect(index.length / 3).toBeLessThanOrEqual(TRI_BUDGET);
  });

  it('is deterministic: two builds are byte-identical', () => {
    const again = buildDragonBody(gm).geometry;
    for (const name of ['position', 'normal', 'color']) {
      expect(Buffer.from((again.getAttribute(name).array as Float32Array).buffer)
        .equals(Buffer.from((body.geometry.getAttribute(name).array as Float32Array).buffer)), name).toBe(true);
    }
    expect(Buffer.from((again.getIndex()!.array as Uint32Array).buffer).equals(Buffer.from(index.buffer))).toBe(true);
  });

  it('colours: a soft belly band under the spine, scale on the limbs, dark eyes with a highlight', () => {
    const { scale, belly } = bodyColours(gm.phenotype);
    let wrong = 0, bellyVerts = 0, scaleVerts = 0;
    const same = (v: number, c: readonly number[]) =>
      col[v] === Math.fround(c[0]!) && col[v + 1] === Math.fround(c[1]!) && col[v + 2] === Math.fround(c[2]!);
    body.parts.forEach((part, pi) => {
      const kind = body.kinds[pi];
      for (let t = part.start; t < part.start + part.count; t++) {
        const v = index[t]! * 3;
        if (kind === 'eye') { if (!same(v, EYE_COLOUR)) wrong++; continue; }
        if (kind === 'glint') { if (!same(v, GLINT_COLOUR)) wrong++; continue; }
        const w = kind === 'spine' ? bellyWeight(nrm[v + 1]!) : 0;
        const want = [0, 1, 2].map((k) => scale[k]! + (belly[k]! - scale[k]!) * w);
        if (!same(v, want)) wrong++;
        if (w > 0.5) bellyVerts++; else scaleVerts++;
      }
    });
    expect(wrong, 'vertices with the wrong colour for their part and normal').toBe(0);
    expect(bellyVerts).toBeGreaterThan(0);
    expect(scaleVerts).toBeGreaterThan(bellyVerts);
    expect(body.kinds.filter((k) => k === 'eye')).toHaveLength(2);
    expect(body.kinds.filter((k) => k === 'glint')).toHaveLength(2);
  });

  it('the belly band blends: no hard step between scale and belly', () => {
    expect(bellyWeight(0)).toBe(0);
    expect(bellyWeight(-1)).toBe(1);
    for (let up = -0.5; up < -0.1; up += 0.01) expect(bellyWeight(up + 0.01) - bellyWeight(up)).toBeLessThanOrEqual(0.05);
  });

  it(`skins every node: one tube for the spine, one per leg, one per toe, plus the eyes (${i})`, () => {
    const ps = paths(body.graph, body.idx.tailTip);
    const covered = new Set(ps.flatMap((p) => p.nodes));
    expect(covered.size).toBe(body.graph.v.length);
    expect(ps[0]!.nodes).toContain(body.idx.nose);
    expect(ps[0]!.nodes).toContain(body.idx.hip);
    expect(ps.length).toBe(1 + 4 + 4 * gm.phenotype.toeCount);
    expect(body.parts.length).toBe(ps.length + 4); // + two eyes and their highlights
  });
});

describe('the genes are display colours', () => {
  it('srgbToLinear is the sRGB decode, so a gene at s = 0.35 stays visibly coloured', async () => {
    const { srgbToLinear } = await import('../src/assets/dragon/builder');
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 6);
    // the vertex colour, re-encoded for the screen, gives back the gene's HSV
    const lin = bodyColours({ ...genomes[0]!.phenotype, hue: 0.505, saturation: 0.35, value: 0.85 }).scale;
    const enc = lin.map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
    const sat = (Math.max(...enc) - Math.min(...enc)) / Math.max(...enc);
    expect(sat).toBeCloseTo(0.35, 6);
  });
});

describe('hsv() is colorsys.hsv_to_rgb', () => {
  it('matches hand-computed values, including a hue that wraps', () => {
    expect(hsv(0, 1, 1)).toEqual([1, 0, 0]);
    expect(hsv(1 / 3, 1, 1)[1]).toBe(1);
    expect(hsv(-0.25, 0.5, 0.8)).toEqual(hsv(0.75, 0.5, 0.8));
    expect(hsv(0.5, 0, 0.4)).toEqual([0.4, 0.4, 0.4]);
  });
});
