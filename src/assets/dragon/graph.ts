/**
 * The dragon's skin graph: nodes with a position and a radius, joined by edges, built from
 * the phenotype alone. The runtime port of the graph stage of `assetgen/dragon/builder.py`.
 *
 * The reference builds this graph with pure arithmetic and then hands it to Blender's Skin
 * modifier and Subsurf. TypeScript cannot reproduce Blender's skinning vertex for vertex,
 * but it can reproduce the graph exactly, and does: docs/fixtures/dragon-graphs.json
 * (written by assetgen/dragon_vectors.py) holds the reference graph for the 32 fixed
 * genomes and tests/dragon-graph.test.ts compares every number with `Object.is`. The skin
 * laid over the graph is ./skin.ts.
 *
 * Staying exact means the same float expressions evaluated in the same order as the
 * Python — `fr * BM * CD` is `(fr * BM) * CD` in both — and Python's `max` where JS's
 * would differ on a tie (`pyMax`). Coordinates are the reference's: x forward (nose at +x,
 * tail at −x), y to the dragon's left, z up.
 *
 * Stages: `skeleton` + `addLimbs` (M3a). Wings and crown join at M3b.
 */
import { pyMax } from '../../core/py';
import type { Phenotype } from '../../core/genome';

export type Vec3 = [number, number, number];

export class Graph {
  readonly v: Vec3[] = [];
  readonly r: number[] = [];
  readonly e: [number, number][] = [];

  node(p: Vec3, r: number): number {
    this.v.push([p[0], p[1], p[2]]);
    this.r.push(pyMax(0.012, r));
    return this.v.length - 1;
  }

  /** Nodes joined one after another, starting from an existing node. Returns the new ones. */
  chain(start: number, pts: readonly (readonly [Vec3, number])[]): number[] {
    let prev = start;
    const out: number[] = [];
    for (const [p, r] of pts) {
      const i = this.node(p, r);
      this.e.push([prev, i]);
      prev = i;
      out.push(i);
    }
    return out;
  }
}

/** Named nodes and points the later stages (and the parity gate) anchor to. */
export interface Anchors {
  tailTip: number;
  hip: number;
  chest: number;
  shoulder: number;
  neck: number;
  headBack: number;
  headMid: number;
  nose: number;
  /** (x, z) of the end of the neck curve. */
  headPos: [number, number];
  headMidPos: Vec3;
  headBackPos: Vec3;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function bez(p0: Vec3, p1: Vec3, p2: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const at = (i: 0 | 1 | 2) => u * u * p0[i] + 2 * u * t * p1[i] + t * t * p2[i];
  return [at(0), at(1), at(2)];
}

/** Torso control points: [position along the body, height, radius factor]. */
const TORSO_PROFILE: readonly (readonly [number, number, number])[] = [
  [0.00, 0.86, 0.375], [0.33, 0.97, 0.450], [0.66, 1.00, 0.470], [1.00, 0.96, 0.395],
];

/** Tail, torso, neck and head — `skeleton(p)`. */
export function skeleton(p: Phenotype): { g: Graph; idx: Anchors } {
  const { bodyMass: BM, bodyLength: BL, chestDepth: CD } = p;
  const { tailLength: TL, tailTaper: TT } = p;
  const { neckLength: NL, neckArc: NA } = p;
  const { headSize: HS, snoutLength: SL } = p;
  const g = new Graph();

  // --- tail: 5 nodes, tapering toward the tip ---
  const tailRootX = -0.75 * BL;
  const tipX = -2.95 * TL * BL;
  const tail: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4.0;
    const x = lerp(tipX, tailRootX, t);
    const z = lerp(0.50, 0.86, t) + 0.06 * Math.sin(t * Math.PI);
    const r = lerp(0.040, 0.355 * BM, t ** (1.0 / pyMax(0.4, TT)));
    tail.push(g.node([x, 0, z], r));
    if (i) g.e.push([tail[i - 1]!, tail[i]!]); // a chain, not loose beads (builder.py)
  }

  // --- torso: hips -> chest -> shoulder ---
  const torso: number[] = [];
  TORSO_PROFILE.forEach(([fx, fz, fr], i) => {
    const x = lerp(tailRootX, 0.95 * BL, fx);
    const r = fr * BM * (0.2 < fx && fx < 0.8 ? CD : 1.0);
    const n = g.node([x, 0, fz], r);
    torso.push(n);
    g.e.push([i === 0 ? tail[4]! : torso[i - 1]!, n]);
  });

  // --- neck: quadratic arc whose rise is driven by neckArc ---
  const sx = 0.95 * BL;
  const sz = 0.96;
  const reach = 0.70 * NL;
  const rise = 1.00 * NL * (0.35 + 0.75 * NA);
  const p0: Vec3 = [sx, 0, sz];
  const p1: Vec3 = [sx + reach * 0.25, 0, sz + rise * 0.85]; // control point: high = S-curve
  const p2: Vec3 = [sx + reach, 0, sz + rise];
  const neck: number[] = [];
  let prev = torso[3]!;
  for (let i = 1; i < 4; i++) {
    const t = i / 3.0;
    const r = lerp(0.300 * BM, 0.235 * BM, t);
    const n = g.node(bez(p0, p1, p2, t), r);
    g.e.push([prev, n]);
    prev = n;
    neck.push(n);
  }

  // --- head: back -> mid -> snout -> nose ---
  const [hx, , hz] = p2;
  const head: number[] = [];
  const fwd = 0.34 * HS;
  const headProfile: [number, number, number][] = [
    [0.00, 0.30 * HS, 0.360], [fwd, 0.32 * HS, 0.330],
    [fwd + 0.33 * SL * HS, 0.23 * HS, 0.205], [fwd + 0.52 * SL * HS, 0.16 * HS, 0.105],
  ];
  headProfile.forEach(([dx, dz, fr], i) => {
    const n = g.node([hx + dx, 0, hz + dz], fr * HS);
    g.e.push([i === 0 ? prev : head[i - 1]!, n]);
    head.push(n);
  });

  const idx: Anchors = {
    tailTip: tail[0]!,
    hip: torso[0]!, chest: torso[2]!, shoulder: torso[3]!,
    neck: neck[2]!,
    headBack: head[0]!, headMid: head[1]!, nose: head[3]!,
    headPos: [hx, hz],
    headMidPos: [...g.v[head[1]!]!],
    headBackPos: [...g.v[head[0]!]!],
  };
  return { g, idx };
}

/** Four legs, each ending in a foot with `toeCount` two-node toes — `add_limbs`. */
export function addLimbs(g: Graph, idx: Anchors, p: Phenotype): void {
  const { legLength: LL, legThickness: LT, bodyLength: BL } = p;
  const TC = p.toeCount;
  for (const s of [1, -1]) {
    const legs: [number, number, boolean][] = [[idx.hip, -0.72 * BL, true], [idx.shoulder, 0.94 * BL, false]];
    for (const [anchor, ax, back] of legs) {
      const w = back ? 0.34 : 0.31;
      const topR = (back ? 0.30 : 0.255) * LT;
      const foot = g.chain(anchor, [
        [[ax, w * s, 0.68 - 0.16 * LL], topR],
        [[ax - 0.12, (w + 0.12) * s, 0.40 - 0.28 * LL], topR * 0.72],
        [[ax + 0.10, (w + 0.16) * s, 0.18 - 0.14 * LL], topR * 0.50],
        [[ax + 0.30, (w + 0.18) * s, 0.085], topR * 0.40],
      ])[3]!;
      const fx = ax + 0.30;
      const fy = (w + 0.18) * s;
      for (let k = 0; k < TC; k++) {
        const a = (k - (TC - 1) / 2) / Math.max(1, TC - 1);
        g.chain(foot, [
          [[fx + 0.19, fy + 0.17 * a, 0.075], topR * 0.30],
          [[fx + 0.34, fy + 0.27 * a, 0.065], topR * 0.19],
        ]);
      }
    }
  }
}

/** The body graph: skeleton then limbs, in the reference's order (node order matters). */
export function bodyGraph(p: Phenotype): { g: Graph; idx: Anchors } {
  const out = skeleton(p);
  addLimbs(out.g, out.idx, p);
  return out;
}
