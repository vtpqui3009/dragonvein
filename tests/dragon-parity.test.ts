/**
 * The two dragon builders agree (M3d, CLAUDE.md §1.5 as amended 2026-10-12): `npm run
 * gate:parity` runs this file. On the 32 fixed genomes:
 *
 * 1. **Limb anchors, exactly.** These are the points where something attaches or ends:
 *    - every node joined to the spine from off it, which is a leg, wing or horn root;
 *    - every branching node off the spine, which is a foot, wrist or antler fork;
 *    - every free end, which is a toe, finger or horn tip.
 *    They are taken from the TS full graph and from the reference's graph in
 *    docs/fixtures/dragon-graphs.json by the same rule, and must be `Object.is`-equal.
 * 2. **Bounding box, within 3 % of the reference's extent on each axis and side.** The
 *    reference box is Blender's: the whole placed dragon, over face vertices only. The tolerance
 *    and why it is 3 % are in STATE.md run 14. Vertex counts are not compared: the owner
 *    dropped that clause, because Skin + Subsurf and the TS sweep tessellate differently.
 *
 * Every gap goes to artifacts/parity.json, so a reader sees the margin and not just a pass.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterAll } from 'vitest';
import { breed, wild, type Element, type Genome } from '../src/core/genome';
import { buildDragonArrays } from '../src/assets/dragon/arrays';
import { fullGraph } from '../src/assets/dragon/graph';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Allowed box gap, as a fraction of the reference's extent on that axis (STATE.md run 14). */
const BOX_TOLERANCE = 0.03;
/** The spine is the body graph's first 15 nodes: tail 0–3, torso 4–7, neck 8–10, head 11–14. */
const SPINE = 15;

type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const gfx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe }[];
};
const fx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/dragon-graphs.json'), 'utf8')) as {
  graphs: {
    gid: string;
    full: { v: [number, number, number][]; e: [number, number][] };
    placed: { min: [number, number, number]; max: [number, number, number] };
  }[];
};
const genomes: Genome[] = [];
for (const { recipe: r } of gfx.genomes) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}

/** Node ids of the anchors, by the rule in the header. Depends only on the edges. */
function anchorIds(n: number, edges: readonly (readonly [number, number])[]): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a]!.push(b); adj[b]!.push(a); }
  const out: number[] = [];
  for (let i = SPINE; i < n; i++) {
    const deg = adj[i]!.length;
    if (adj[i]!.some((j) => j < SPINE) || deg >= 3 || deg === 1) out.push(i);
  }
  return out;
}

const report: {
  gid: string; anchors: number; anchorMaxGap: number; worstGapFraction: number;
  /** Per axis of the reference's z-up frame: |TS - reference| at the box's min and max side. */
  boxGap: Record<'x' | 'y' | 'z', { min: number; max: number }>;
}[] = [];
const anchorGap = new Map<string, number>();

describe.each(genomes.map((g, i) => [i, g] as const))('genome #%i', (i, gm) => {
  const want = fx.graphs[i]!;

  it('limb anchors are exactly the reference\'s', () => {
    const { g } = fullGraph(gm.phenotype);
    const ids = anchorIds(want.full.v.length, want.full.e);
    expect(anchorIds(g.v.length, g.e)).toEqual(ids);
    expect(ids.length).toBeGreaterThan(20); // 4 legs with toes, 2 wings with fingers, a crown
    let worst = 0;
    for (const id of ids) {
      g.v[id]!.forEach((c, k) => {
        worst = Math.max(worst, Math.abs(c - want.full.v[id]![k]!));
        expect(Object.is(c, want.full.v[id]![k]), `anchor ${id}[${k}]`).toBe(true);
      });
    }
    anchorGap.set(want.gid, worst);
  });

  it(`the bounding box is within ${BOX_TOLERANCE * 100}% of the reference's on every axis and side`, () => {
    const p = buildDragonArrays(gm).position;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k += 3) {
      // three.js y-up back to the reference's z-up: (x, y, z) -> (x, -z, y)
      const b = [p[k]!, -p[k + 2]!, p[k + 1]!];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, b[a]!); hi[a] = Math.max(hi[a]!, b[a]!); }
    }
    const boxGap = {} as Record<'x' | 'y' | 'z', { min: number; max: number }>;
    let worst = 0;
    for (let a = 0; a < 3; a++) {
      const extent = want.placed.max[a]! - want.placed.min[a]!;
      const gLo = Math.abs(lo[a]! - want.placed.min[a]!), gHi = Math.abs(hi[a]! - want.placed.max[a]!);
      boxGap['xyz'[a] as 'x' | 'y' | 'z'] = { min: Math.round(gLo * 1e4) / 1e4, max: Math.round(gHi * 1e4) / 1e4 };
      worst = Math.max(worst, gLo / extent, gHi / extent);
      expect(gLo, `axis ${'xyz'[a]} min: ${lo[a]} vs ${want.placed.min[a]}`).toBeLessThanOrEqual(BOX_TOLERANCE * extent);
      expect(gHi, `axis ${'xyz'[a]} max: ${hi[a]} vs ${want.placed.max[a]}`).toBeLessThanOrEqual(BOX_TOLERANCE * extent);
    }
    report.push({
      gid: want.gid, anchors: anchorIds(want.full.v.length, want.full.e).length,
      anchorMaxGap: anchorGap.get(want.gid) ?? NaN, worstGapFraction: Math.round(worst * 1e4) / 1e4, boxGap,
    });
  });
});

afterAll(() => {
  if (report.length !== genomes.length) return; // a partial run (a filter) writes nothing
  mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const worst = report.reduce((a, b) => (b.worstGapFraction > a.worstGapFraction ? b : a));
  writeFileSync(path.join(ROOT, 'artifacts/parity.json'), `${JSON.stringify({
    rule: 'CLAUDE.md §1.5 (amended 2026-10-12): skin graphs equal; anchors exact; box within tolerance',
    boxTolerance: BOX_TOLERANCE,
    boxGapUnits: 'world units, reference z-up frame; worstGapFraction = largest gap / that axis\'s extent',
    genomes: report.length,
    anchorMaxGap: Math.max(...report.map((r) => r.anchorMaxGap)),
    worstGapFraction: worst.worstGapFraction,
    worstGenome: worst.gid,
    perGenome: report,
  }, null, 2)}\n`);
});
