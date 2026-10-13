/**
 * src/assets/dragon/graph.ts against the reference skin graph (M3a, CLAUDE.md §1.5).
 *
 * docs/fixtures/dragon-graphs.json is written by assetgen/dragon_vectors.py: for each of
 * the 32 genomes in docs/fixtures/genomes.json, the graph builder.py's `skeleton` and
 * `add_limbs` produce. The port rebuilds each genome from its recipe (tests/genome.test.ts
 * proves that part), builds the graph, and must match every node position, radius, edge
 * and anchor exactly — `Object.is` — with one named exception below.
 *
 * The exception: the tail radii use `t ** (1 / tailTaper)` (builder.py `skeleton`). Python
 * calls the platform libm `pow`, V8 its own, and the two do not always round the last bit
 * alike. Measured on these 32 genomes (run 11): 5 of 1 960 radii differ, every one at
 * t = 0.75 (tail node 3), every one by exactly 1 ulp; every position, including the
 * `sin` in the tail's z, is exact. So tail nodes 1–3 may differ in radius by ≤ 1 ulp and
 * nothing else may differ at all. No other value is computed from those radii.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breed, wild, type Element, type Genome } from '../src/core/genome';
import { WING_FORMS, bodyGraph, fullGraph, membranePolys, ornamentParams, spikeParams, wingForm } from '../src/assets/dragon/graph';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel));
const sha = (rel: string) => createHash('sha256').update(read(rel)).digest('hex');

/** Distance in units in the last place between two finite doubles of the same sign. */
function ulps(a: number, b: number): number {
  const bits = new BigInt64Array(new Float64Array([a, b]).buffer);
  return Math.abs(Number(bits[0]! - bits[1]!));
}
/** Tail nodes whose radius goes through `pow` — see the header. Node 0 is t = 0; t = 1 is the hip. */
const POW_RADII = new Set([1, 2, 3]);

type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
interface GraphRec {
  v: [number, number, number][];
  r: number[];
  e: [number, number][];
  idx: Record<string, number>;
  points: Record<string, number[]>;
}
const genomesFx = JSON.parse(read('docs/fixtures/genomes.json').toString('utf8')) as {
  genomes: { recipe: Recipe; gid: string }[];
};
const fx = JSON.parse(read('docs/fixtures/dragon-graphs.json').toString('utf8')) as {
  builderSha256: string;
  genomeSha256: string;
  stages: string[];
  graphs: { gid: string; wingForm: string; body: GraphRec; full: Omit<GraphRec, 'idx' | 'points'>; parts: PartsRec }[];
};
interface PartsRec {
  membrane: { side: number; v: number[][]; f: number[][] }[];
  spikes: Record<string, unknown>[];
  ornament: Record<string, unknown> | null;
}

/** Every number equal by Object.is, every other value equal; arrays and objects recursively. */
function sameExactly(got: unknown, want: unknown, path = ''): string | null {
  if (typeof want === 'number') return Object.is(got, want) ? null : `${path}: ${String(got)} vs ${want}`;
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) return `${path}: length ${JSON.stringify(got)?.slice(0, 40)} vs ${want.length}`;
    for (let i = 0; i < want.length; i++) { const d = sameExactly(got[i], want[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (want && typeof want === 'object') {
    if (!got || typeof got !== 'object') return `${path}: missing`;
    const gk = Object.keys(got).sort(), wk = Object.keys(want).sort();
    if (gk.join() !== wk.join()) return `${path}: keys ${gk} vs ${wk}`;
    for (const k of wk) {
      const d = sameExactly((got as Record<string, unknown>)[k], (want as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return got === want ? null : `${path}: ${String(got)} vs ${String(want)}`;
}

function rebuild(): Genome[] {
  const out: Genome[] = [];
  for (const { recipe: r } of genomesFx.genomes) {
    if (r.op === 'wild') out.push(wild(r.seed, r.element ?? undefined));
    else out.push(breed(out[r.a]!, out[r.b]!, r.seed));
  }
  return out;
}

describe('the graph fixture is current', () => {
  it('was written from the current builder.py and genome.py', () => {
    // Fails when either changed after the fixture: run `python3 -I assetgen/dragon_vectors.py`,
    // then port whatever moved.
    expect(fx.builderSha256).toBe(sha('assetgen/dragon/builder.py'));
    expect(fx.genomeSha256).toBe(sha('assetgen/genome.py'));
  });
  it('covers the same 32 genomes as docs/fixtures/genomes.json, in order', () => {
    expect(fx.graphs.map((g) => g.gid)).toEqual(genomesFx.genomes.map((g) => g.gid));
  });
});

describe('the pow exception stays as narrow as measured', () => {
  it('the tail is nodes 0-3, so POW_RADII names tail nodes and nothing else', () => {
    for (const { body } of fx.graphs) {
      expect(body.idx['tailTip']).toBe(0);
      // the tail is the chain 0-1-2-3, then 3 -> hip (the hip is its fifth node)
      expect(body.idx['hip']).toBe(4);
      expect(body.e.slice(0, 4)).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]]);
    }
  });
  it('at most 1 ulp, and only where the libm differs: most tail radii are still exact', () => {
    const genomes = rebuild();
    let exact = 0, off = 0;
    fx.graphs.forEach((want, i) => {
      const { g } = bodyGraph(genomes[i]!.phenotype);
      for (const n of POW_RADII) {
        if (Object.is(g.r[n], want.body.r[n])) exact++;
        else off++;
      }
    });
    expect(exact + off).toBe(96);
    expect(off).toBeLessThanOrEqual(8); // 5 measured; a jump means the port, not the libm, moved
  });
});

describe('32 body graphs (skeleton + add_limbs) match the reference exactly', () => {
  const genomes = rebuild();
  fx.graphs.forEach((want, i) => {
    const gm = genomes[i]!;
    it(`#${i} ${want.gid}: ${want.body.v.length} nodes`, () => {
      expect(gm.gid()).toBe(want.gid);
      const { g, idx } = bodyGraph(gm.phenotype);
      const w = want.body;
      expect(g.v.length).toBe(w.v.length);
      g.v.forEach((v, n) => v.forEach((c, k) => {
        expect(Object.is(c, w.v[n]![k]), `node ${n}[${k}] ${c} vs ${w.v[n]![k]}`).toBe(true);
      }));
      g.r.forEach((r, n) => {
        const want = w.r[n]!;
        if (POW_RADII.has(n)) expect(ulps(r, want), `tail radius ${n} ${r} vs ${want}`).toBeLessThanOrEqual(1);
        else expect(Object.is(r, want), `radius ${n} ${r} vs ${want}`).toBe(true);
      });
      expect(g.e).toEqual(w.e);
      for (const [k, n] of Object.entries(w.idx)) expect(idx[k as keyof typeof idx], k).toBe(n);
      for (const [k, pt] of Object.entries(w.points)) {
        const got = idx[k as keyof typeof idx] as number[];
        expect(got.length, k).toBe(pt.length);
        got.forEach((c, j) => expect(Object.is(c, pt[j]), `${k}[${j}] ${c} vs ${pt[j]}`).toBe(true));
      }
    });
  });
});

describe('32 full graphs (+ add_wings, add_crown) match the reference exactly', () => {
  const genomes = rebuild();
  fx.graphs.forEach((want, i) => {
    it(`#${i} ${want.gid}: ${want.full.v.length} nodes`, () => {
      const { g } = fullGraph(genomes[i]!.phenotype);
      const w = want.full;
      expect(g.v.length).toBe(w.v.length);
      expect(sameExactly(g.v, w.v, 'v')).toBeNull();
      g.r.forEach((r, n) => {
        const wr = w.r[n]!;
        if (POW_RADII.has(n)) expect(ulps(r, wr), `tail radius ${n}`).toBeLessThanOrEqual(1);
        else expect(Object.is(r, wr), `radius ${n} ${r} vs ${wr}`).toBe(true);
      });
      expect(g.e).toEqual(w.e);
    });
  });
});

describe('the parts Blender builds from primitives: parameters match the reference exactly', () => {
  const genomes = rebuild();
  fx.graphs.forEach((want, i) => {
    it(`#${i} ${want.gid}: membranes, ${want.parts.spikes.length} spikes, ornament ${String(want.parts.ornament?.['kind'] ?? 'none')}`, () => {
      const p = genomes[i]!.phenotype;
      for (const m of want.parts.membrane) {
        expect(sameExactly(membranePolys(p, m.side), { v: m.v, f: m.f }, `membrane ${m.side}`)).toBeNull();
      }
      expect(sameExactly(spikeParams(p), want.parts.spikes, 'spikes')).toBeNull();
      expect(sameExactly(ornamentParams(p), want.parts.ornament, 'ornament')).toBeNull();
    });
  });
});

describe('the wing form: graph.ts wingForm agrees with builder.py wing_form (M3e)', () => {
  const genomes = rebuild();
  it('on every fixed genome', () => {
    const got = genomes.map((g) => wingForm(g.phenotype));
    expect(got).toEqual(fx.graphs.map((g) => g.wingForm));
  });
  it('and the fixed genomes exercise all three forms, so the membranes above cover each', () => {
    expect(new Set(fx.graphs.map((g) => g.wingForm))).toEqual(new Set(WING_FORMS));
  });
});
