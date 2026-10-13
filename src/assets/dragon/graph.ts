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
 * Stages, in the reference's `place()` order: `skeleton`, `addLimbs` (M3a), `addWings`,
 * `addCrown` (M3b). Also here, because they are the same kind of pure arithmetic: the
 * membrane polygons, the dorsal spike and tail ornament parameters (`membranePolys`,
 * `spikeParams`, `ornamentParams`), which the reference hands to Blender primitives.
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

  // --- tail: 4 nodes tapering toward the tip, then the hip as its fifth (builder.py) ---
  const tailRootX = -0.75 * BL;
  const tipX = -2.95 * TL * BL;
  const tail: number[] = [];
  for (let i = 0; i < 4; i++) {
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
    g.e.push([i === 0 ? tail[3]! : torso[i - 1]!, n]);
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

/** The whole skin graph: skeleton, limbs, wings, crown — `place()`'s order. */
export function fullGraph(p: Phenotype): { g: Graph; idx: Anchors } {
  const out = bodyGraph(p);
  addWings(out.g, out.idx, p);
  addCrown(out.g, out.idx, p);
  return out;
}

/**
 * The wing form, derived from two existing genes — `wing_form(p)` in builder.py, which
 * states the same rule. It is not a gene of its own (owner decision, 2026-10-13, STATE.md
 * run 24): the genome layout and every gid are unchanged, and breeding inherits the form
 * through the two genes.
 *
 *   wingFingers <= 2         → 'sail':      two fingers stretch one flat panel with a
 *                                           straight trailing edge.
 *   else wingShape <  0.5    → 'spread':    broad, soaring: a bat wing, the membrane fanned
 *                                           between every finger, its trailing edge
 *                                           scalloped between the finger tips.
 *   else (wingShape >= 0.5)  → 'segmented': falcate, sprinting: a solid inner membrane on
 *                                           the arm, then one separate vane along each
 *                                           finger, with open gaps between the vanes.
 *
 * docs/fixtures/dragon-graphs.json records the reference's form for every fixed genome;
 * tests/dragon-graph.test.ts holds this function to it.
 */
export const WING_FORMS = ['sail', 'spread', 'segmented'] as const;
export type WingForm = (typeof WING_FORMS)[number];
export function wingForm(p: Phenotype): WingForm {
  if (p.wingFingers <= 2) return 'sail';
  return p.wingShape < 0.5 ? 'spread' : 'segmented';
}

/** Height of the wing root; the wing plane rises from here (builder.py `WING_ROOT_Z`). */
export const WING_ROOT_Z = 1.22;

/**
 * Bone positions for one wing — `wing_nodes(p, s)`: the arm (4 nodes) and the finger tips.
 *
 * Every wing rests spread: out to the side, in one plane that rises `lift` per unit outward
 * (a V of 8–40°), never upright. wingDroop is the rest height (it sets `lift`),
 * wingSpan the bone extent, wingShape broad (short reach, deep chord, little sweep) to
 * falcate (long reach, narrow chord, swept-back tip). `d` is distance out from the midline.
 * No trig and no pow, so the port stays exact.
 */
export function wingNodes(p: Phenotype, s: number): { arm: [Vec3, number][]; tips: Vec3[] } {
  const { wingSpan: WS, wingShape: SH, wingDroop: DR, bodyLength: BL } = p;
  const NF = p.wingFingers;
  const span = WS;
  const out = lerp(1.00, 1.25, SH) * span; // lateral reach
  const chord = lerp(1.20, 0.75, SH) * span; // how far back the hand reaches
  const sweep = lerp(0.15, 0.70, SH); // leading tip swept back, per unit of reach
  const lift = lerp(0.84, 0.14, DR); // rise per unit outward: wingDroop = rest height
  const at = (x: number, d: number): Vec3 => [x, d * s, WING_ROOT_Z + lift * (d - 0.26)];
  const wd = 0.26 + 1.65 * out; // the wrist's reach
  const arm: [Vec3, number][] = [
    [at(0.92 * BL, 0.26), 0.115 * span],
    [at(0.78 * BL, 0.26 + 0.85 * out), 0.080 * span],
    [at(0.62 * BL, wd), 0.055 * span],
    [at(0.62 * BL - 1.30 * sweep * out, wd + 1.10 * out), 0.028 * span],
  ];
  // The fingers fan from the wrist, between the leading tip's direction (f = 0) and one
  // pointing back past the hip (f = 1). A sail's tips sit on the straight chord between the
  // two; the other forms bulge them outward so the hand is rounded.
  const lx = -1.30 * sweep * out, ld = 1.10 * out;
  const rx = -(1.25 * BL + 0.45 * chord), rd = -0.55 * out;
  const bulge = wingForm(p) === 'sail' ? 0.0 : 0.55;
  const tips: Vec3[] = [];
  for (let k = 0; k < NF; k++) {
    const f = (k + 1) / (NF + 1);
    const g = 1.0 + bulge * f * (1.0 - f);
    tips.push(at(0.62 * BL + lerp(lx, rx, f) * g, wd + lerp(ld, rd, f) * g));
  }
  return { arm, tips };
}

/** `add_wings`: an arm from the shoulder, and a two-node finger from the wrist to each tip. */
export function addWings(g: Graph, idx: Anchors, p: Phenotype): void {
  for (const s of [1, -1]) {
    const { arm, tips } = wingNodes(p, s);
    const bones = g.chain(idx.shoulder, arm);
    const wrist = bones[2]!;
    const w2 = arm[2]![0];
    for (const t of tips) {
      const mid: Vec3 = [(t[0] + w2[0]) * 0.51, (t[1] + w2[1]) * 0.5, (t[2] + w2[2]) * 0.5];
      g.chain(wrist, [[mid, 0.042 * p.wingSpan], [t, 0.018 * p.wingSpan]]);
    }
  }
}

/** `add_crown`: horn pairs and an odd centre horn, then the crest (frill, skull fin or antler). */
export function addCrown(g: Graph, idx: Anchors, p: Phenotype): void {
  const { hornCount: HC, hornLength: HL, hornCurve: HK, crestType: CT, headSize: HS } = p;
  const [hx, hz] = idx.headPos;
  const back = idx.headBack;
  const pairs = Math.floor(Math.max(0, HC) / 2);
  const odd = HC % 2;
  for (let i = 0; i < pairs; i++) {
    const f = (i + 1) / (pairs + 1);
    for (const s of [1, -1]) {
      const yaw = 0.16 + 0.26 * f;
      g.chain(back, [
        [[hx - 0.16 * HL, yaw * s * HS, hz + (0.56 + 0.30 * f) * HL * HS], 0.095 * HS],
        [[hx - 0.16 * HL - 0.26 * HL * (1 - HK * 0.5), (yaw + 0.09) * s * HS, hz + (0.86 + 0.34 * f) * HL * HS], 0.056 * HS],
        [[hx - 0.16 * HL - 0.48 * HL * (1 - HK * 0.8), (yaw + 0.14) * s * HS, hz + (1.02 + 0.26 * f) * HL * HS - 0.22 * HK * HL], 0.020 * HS],
      ]);
    }
  }
  if (odd) {
    g.chain(back, [
      [[hx - 0.10 * HL, 0, hz + 0.64 * HL * HS], 0.085 * HS],
      [[hx - 0.28 * HL, 0, hz + 1.00 * HL * HS], 0.048 * HS],
      [[hx - 0.46 * HL, 0, hz + 1.18 * HL * HS - 0.20 * HK * HL], 0.018 * HS],
    ]);
  }
  if (CT === 1) { // frill
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        g.chain(back, [
          [[hx - 0.22, (0.34 + 0.10 * k) * s * HS, hz + 0.18 - 0.10 * k], 0.085 * HS],
          [[hx - 0.52 - 0.10 * k, (0.64 + 0.16 * k) * s * HS, hz + 0.10 - 0.22 * k], 0.028 * HS],
        ]);
      }
    }
  } else if (CT === 2) { // dorsal fin on the skull
    for (let k = 0; k < 3; k++) {
      g.chain(back, [
        [[hx - 0.10 - 0.18 * k, 0, hz + 0.46 + 0.14 * k], 0.070 * HS],
        [[hx - 0.26 - 0.20 * k, 0, hz + 0.80 + 0.10 * k], 0.024 * HS],
      ]);
    }
  } else if (CT === 3) { // antler
    for (const s of [1, -1]) {
      const br = g.chain(back, [
        [[hx - 0.18, 0.22 * s * HS, hz + 0.60 * HS], 0.075 * HS],
        [[hx - 0.44, 0.40 * s * HS, hz + 0.96 * HS], 0.044 * HS],
      ])[1]!;
      for (const d of [-1, 1]) {
        g.chain(br, [
          [[hx - 0.70, (0.40 + 0.26 * d) * s * HS, hz + 1.22 * HS], 0.024 * HS],
          [[hx - 0.92, (0.40 + 0.42 * d) * s * HS, hz + 1.40 * HS], 0.012 * HS],
        ]);
      }
    }
  }
}

/** builder.py `_mix`: a + (b − a)·t per component. */
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** (along the edge, pulled toward the wrist): the spread form's scallop points. */
const SCALLOP: readonly (readonly [number, number])[] = [[0.25, 0.24], [0.50, 0.32], [0.75, 0.24]];
/** (along the bone, across toward the next rib): the segmented form's vane corners. */
const VANE: readonly (readonly [number, number])[] = [[0.04, 0.00], [0.80, 0.40], [0.40, 0.50]];

/**
 * `membrane_polys(p, s)`: the wing membrane's corners and faces, before Solidify and Subsurf.
 *
 * Corners 0–3 are the arm (root, elbow, wrist, leading tip), then the finger tips, then the
 * body anchors A1 (by the hip) and A2 (mid-flank); each form adds its own points after
 * those. The inner membrane (arm to flank) is the same in all three forms. Beyond the wrist
 * the hand is cut into ribs — the leading tip, each finger tip, A1 — and:
 * - sail: one wedge per rib pair, all meeting at the wrist: one straight-edged panel;
 * - spread: the same wedges, each trailing edge pulled in toward the wrist at three points
 *   (SCALLOP), so the edge between two finger tips is a scallop;
 * - segmented: no wedges. Each rib but A1 carries its own vane, a quad from 4 % along the
 *   bone to the tip reaching VANE's fraction of the way toward the next rib. The vanes share
 *   no corner with each other or with the inner membrane.
 */
export function membranePolys(p: Phenotype, s: number): { v: Vec3[]; f: number[][] } {
  const { arm, tips } = wingNodes(p, s);
  const BL = p.bodyLength;
  const W2 = arm[2]![0];
  const A1: Vec3 = [-0.62 * BL, 0.20 * s, 1.04];
  const A2: Vec3 = [-0.15 * BL, 0.22 * s, 1.12];
  const v: Vec3[] = [...arm.map((a) => a[0]), ...tips, A1, A2];
  const nT = tips.length, iT = 4, iA1 = 4 + nT, iA2 = iA1 + 1;
  const f: number[][] = [[0, 1, 2, iA2], [iA2, 2, iA1]];
  const ribs = [3, ...tips.map((_, k) => iT + k), iA1];
  const form = wingForm(p);
  for (let r = 0; r + 1 < ribs.length; r++) {
    const a = ribs[r]!, b = ribs[r + 1]!;
    if (form === 'sail') {
      f.push([2, a, b]);
    } else if (form === 'spread') {
      let prev = a;
      for (const [t, pull] of SCALLOP) {
        v.push(mix(mix(v[a]!, v[b]!, t), W2, pull));
        f.push([2, prev, v.length - 1]);
        prev = v.length - 1;
      }
      f.push([2, prev, b]);
    } else {
      const q: number[] = [];
      for (const [u, w] of VANE) {
        v.push(mix(mix(W2, v[a]!, u), mix(W2, v[b]!, u), w));
        q.push(v.length - 1);
      }
      f.push([q[0]!, a, q[1]!, q[2]!]);
    }
  }
  return { v, f };
}

/** Membrane modifiers, as builder.py sets them. */
export const MEMBRANE_THICKNESS = 0.034;

/** A Blender primitive as the reference places it: built at the origin, scaled, rotated about Y, moved. */
export type Primitive =
  | { kind: 'cone'; vertices: number; radius: number; depth: number; location: Vec3; rotY: number; scale: Vec3 }
  | { kind: 'ico'; subdivisions: number; radius: number; location: Vec3; rotY: number; scale: Vec3 };

/** `torso_at(t, BM, CD)`: height and radius of the torso at normalised position t. */
export function torsoAt(t: number, BM: number, CD: number): [number, number] {
  for (let i = 0; i < TORSO_PROFILE.length - 1; i++) {
    const a = TORSO_PROFILE[i]!, b = TORSO_PROFILE[i + 1]!;
    if (a[0] <= t && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const z = lerp(a[1], b[1], u), fr = lerp(a[2], b[2], u);
      return [z, fr * BM * (0.2 < t && t < 0.8 ? CD : 1.0)];
    }
  }
  const last = TORSO_PROFILE[TORSO_PROFILE.length - 1]!;
  return [last[1], last[2] * BM];
}

/** Python `math.radians`: x * (pi / 180). */
const radians = (deg: number) => deg * (Math.PI / 180.0);

/** `spike_params(p)`: one six-sided cone per dorsal spike, sitting on the back. */
export function spikeParams(p: Phenotype): Primitive[] {
  const { spineCount: SC, spineHeight: SH2, bodyMass: BM, bodyLength: BL, chestDepth: CD } = p;
  const out: Primitive[] = [];
  for (let i = 0; i < SC; i++) {
    const t = i / Math.max(1, SC - 1);
    const x = lerp(-0.75 * BL, 0.95 * BL, t);
    const [z, r] = torsoAt(t, BM, CD);
    const h = (0.10 + r * 0.60) * SH2;
    out.push({ kind: 'cone', vertices: 6, radius: r * 0.26, depth: h, location: [x, 0, z + r * 0.86 + h * 0.40], rotY: radians(-14), scale: [1, 1, 1] });
  }
  return out;
}

/** `ornament_params(p)`: the tail ornament, or null for tailTip "none". */
export function ornamentParams(p: Phenotype): Primitive | null {
  const TT = p.tailTip;
  const x = -2.95 * p.tailLength * p.bodyLength;
  if (TT === 0) return null;
  if (TT === 1) return { kind: 'cone', vertices: 4, radius: 0.26, depth: 0.70, location: [x - 0.1, 0, 0.80], rotY: radians(-60), scale: [1, 0.22, 1] };
  if (TT === 2) return { kind: 'cone', vertices: 3, radius: 0.30, depth: 0.56, location: [x - 0.14, 0, 0.60], rotY: radians(-96), scale: [1, 0.30, 1] };
  return { kind: 'ico', subdivisions: 1, radius: 0.26, location: [x - 0.12, 0, 0.56], rotY: 0.0, scale: [1, 1, 1] };
}
