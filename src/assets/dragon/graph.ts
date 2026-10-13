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

/** Cubic Bézier — builder.py `bez3`, the same expression in the same order. */
function bez3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const at = (i: 0 | 1 | 2) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [at(0), at(1), at(2)];
}

/** Torso control points: [position along the body, height, radius factor]. */
const TORSO_PROFILE: readonly (readonly [number, number, number])[] = [
  [0.00, 0.86, 0.375], [0.33, 0.97, 0.450], [0.66, 1.00, 0.470], [1.00, 0.96, 0.395],
];

/*
 * The body plan (M3f): how far each body gene reaches the outline. builder.py states the
 * same numbers. At the middle of every range the dragon is about the M3e one; at the ends
 * the outline moves (artifacts/variants/dragon-sweep.json measures it):
 *
 *   bodyMass   girth: each torso node's radius scales by `girth(BM, k)`. Below the middle
 *              of the range all four slim alike (to 0.51 at the low end); above it the chest
 *              swells most (to 1.74) and the hip least (1.50; TORSO_GAIN), so a heavy dragon is barrel-
 *              chested and front-heavy (docs/ART_BIBLE.md §Proportions). The centre sinks by
 *              BELLY_SAG of the added radius, so a heavy belly hangs and a light one tucks
 *              up; it never comes nearer the ground than CLEARANCE.
 *   headSize   the skull, horns, crest and eyes scale by `headScale(HS)`: 0.78 at the low
 *              end, 1.77 at the high, so the range spans more than twice the size.
 *   legLength  ride height: the hip and everything it carries rise by `rideLift(LL)`, from
 *              0.43 below the middle to 0.43 above it, and the legs reach from the body to
 *              the ground, upright.
 *   neckLength / neckArc  a cubic neck. A low arc is a straight neck reaching forward; a high
 *              one rises steeply in a swan's S (forward and low, then up), the head held high.
 */
/** Hip centre height at the middle of legLength's range (bodyMass at 1). */
export const RIDE_MID = 0.90;
/**
 * Ride height follows the same kind of saturating curve as girth: the body rises
 * RIDE_GAIN · d / (RIDE_KNEE + |d|), d being legLength's distance from its range's middle.
 */
export const RIDE_GAIN = 0.62;
export const RIDE_KNEE = 0.15;
/** Ride height's lift over RIDE_MID for a legLength. */
export function rideLift(LL: number): number {
  const d = LL - 1.05;
  return RIDE_GAIN * (d / (RIDE_KNEE + Math.abs(d)));
}
/**
 * Girth follows a saturating curve of bodyMass, s = d / (GIRTH_KNEE + |d|) with d the
 * distance from the range's middle: steep where wild dragons cluster, flattening toward the
 * ends so neither extreme leaves plausibility. Below the middle all four torso nodes slim
 * alike by GIRTH_LOW per unit of s...
 */
export const GIRTH_KNEE = 0.25;
export const GIRTH_LOW = 0.95;
/** ...and above it each node swells by its own TORSO_GAIN (hip, belly, chest, shoulder). */
export const TORSO_GAIN: readonly number[] = [0.70, 0.95, 1.10, 1.00];
/** Head scale gain per unit of headSize, about the range's low end. */
export const HEAD_GAIN = 0.6;
/** How much of its added radius a heavier torso's centre sinks by. */
export const BELLY_SAG = 0.45;
/** The belly's least height above the ground. */
export const CLEARANCE = 0.12;

/** Torso radius multiplier for a bodyMass at torso node k (0 hip … 3 shoulder). */
export function girth(BM: number, k: number): number {
  const d = BM - 1.075;
  const s = d / (GIRTH_KNEE + Math.abs(d));
  return 1.075 + GIRTH_LOW * s + (TORSO_GAIN[k]! - GIRTH_LOW) * pyMax(s, 0.0);
}
/** The skull's scale for a headSize: horns, crest and eyes scale with it. */
export const headScale = (HS: number) => HS + HEAD_GAIN * (HS - 0.78);

/** The four torso nodes, hip to shoulder: [x, z, radius] — `torso_nodes(p)`. */
export function torsoNodes(p: Phenotype): [number, number, number][] {
  const { bodyMass: BM, bodyLength: BL, chestDepth: CD, legLength: LL } = p;
  const lift = (RIDE_MID - 0.86) + rideLift(LL);
  return TORSO_PROFILE.map(([fx, fz, fr], k) => {
    const x = lerp(-0.75 * BL, 0.95 * BL, fx);
    const r0 = fr * (0.2 < fx && fx < 0.8 ? CD : 1.0);
    const r = r0 * girth(BM, k);
    const z = pyMax(fz + lift - BELLY_SAG * (r - r0), r + CLEARANCE);
    return [x, z, r];
  });
}

/** Tail, torso, neck and head — `skeleton(p)`. */
export function skeleton(p: Phenotype): { g: Graph; idx: Anchors } {
  const { bodyMass: BM, bodyLength: BL } = p;
  const { tailLength: TL, tailTaper: TT } = p;
  const { neckLength: NL, neckArc: NA } = p;
  const { snoutLength: SL } = p;
  const HS = headScale(p.headSize);
  const g = new Graph();
  const G = girth(BM, 0);
  const tn = torsoNodes(p);
  const hipZ = tn[0]![1];

  // --- tail: 4 nodes tapering toward the tip, then the hip as its fifth (builder.py) ---
  // It falls from the hip to 58 % of the hip's height at the tip, so it rides with the body.
  const tailRootX = -0.75 * BL;
  const tipX = -2.95 * TL * BL;
  const tail: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 4.0;
    const x = lerp(tipX, tailRootX, t);
    const z = lerp(0.58 * hipZ, hipZ, t) + 0.06 * Math.sin(t * Math.PI);
    const r = lerp(0.040, 0.355 * G, t ** (1.0 / pyMax(0.4, TT)));
    tail.push(g.node([x, 0, z], r));
    if (i) g.e.push([tail[i - 1]!, tail[i]!]); // a chain, not loose beads (builder.py)
  }

  // --- torso: hips -> chest -> shoulder ---
  const torso: number[] = [];
  tn.forEach(([x, z, r], i) => {
    const n = g.node([x, 0, z], r);
    torso.push(n);
    g.e.push([i === 0 ? tail[3]! : torso[i - 1]!, n]);
  });

  // --- neck: a cubic from the shoulder. Its controls sit on the straight line at neckArc 0
  // and move toward a swan's S at 1: the first forward and low, the second back and high.
  const [sx, sz] = [tn[3]![0], tn[3]![1]];
  const reach = NL * (1.10 - 0.60 * NA);
  const rise = NL * (0.15 + 1.35 * NA);
  const p0: Vec3 = [sx, 0, sz];
  const p1: Vec3 = [sx + reach * lerp(1.0 / 3.0, 0.95, NA), 0, sz + rise * lerp(1.0 / 3.0, 0.0, NA)];
  const p2: Vec3 = [sx + reach * lerp(2.0 / 3.0, 0.05, NA), 0, sz + rise * lerp(2.0 / 3.0, 0.90, NA)];
  const p3: Vec3 = [sx + reach, 0, sz + rise];
  const NG = (BM + girth(BM, 3)) * 0.5;
  const neck: number[] = [];
  let prev = torso[3]!;
  for (let i = 1; i < 5; i++) {
    const t = i / 4.0;
    const r = lerp(0.300 * NG, 0.235 * NG * (1.15 - 0.15 * NL), t);
    const n = g.node(bez3(p0, p1, p2, p3, t), r);
    g.e.push([prev, n]);
    prev = n;
    neck.push(n);
  }

  // --- head: back -> mid -> snout -> nose ---
  const [hx, , hz] = p3;
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
    neck: neck[3]!,
    headBack: head[0]!, headMid: head[1]!, nose: head[3]!,
    headPos: [hx, hz],
    headMidPos: [...g.v[head[1]!]!],
    headBackPos: [...g.v[head[0]!]!],
  };
  return { g, idx };
}

/** Four legs, each ending in a foot with `toeCount` two-node toes — `add_limbs`. */
export function addLimbs(g: Graph, idx: Anchors, p: Phenotype): void {
  const { legThickness: LT, bodyLength: BL } = p;
  const TC = p.toeCount;
  // The legs stand under the body, wider set on a heavier one, and reach the ground from
  // whatever height legLength lifted it to: thigh, knee, ankle at fixed fractions of the drop.
  const spread = 0.55 + 0.45 * girth(p.bodyMass, 0);
  for (const s of [1, -1]) {
    const legs: [number, number, boolean][] = [[idx.hip, -0.72 * BL, true], [idx.shoulder, 0.94 * BL, false]];
    for (const [anchor, ax, back] of legs) {
      const w = (back ? 0.34 : 0.31) * spread;
      const topR = (back ? 0.30 : 0.255) * LT;
      const az = g.v[anchor]![2];
      const drop = az - 0.085;
      const foot = g.chain(anchor, [
        [[ax, w * s, az - 0.30 * drop], topR],
        [[ax - 0.12, (w + 0.12) * s, az - 0.62 * drop], topR * 0.72],
        [[ax + 0.10, (w + 0.16) * s, az - 0.90 * drop], topR * 0.50],
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

/**
 * Height of the wing root; the wing plane rises from here — builder.py `wing_root_z`. It sits
 * on the shoulder, WING_ROOT_UP of the shoulder's radius above its centre, so the wings ride
 * with the body that legLength lifts and bodyMass swells (1.22 at the middle of both, the
 * M3e constant).
 */
export const WING_ROOT_UP = 0.62;
export function wingRootZ(p: Phenotype): number {
  const [, z, r] = torsoNodes(p)[3]!;
  return z + WING_ROOT_UP * r;
}
/** How far the last finger's tip falls back toward root height, as a fraction of its rise. */
export const FAN_DROP = 0.35;

/**
 * Bone positions for one wing — `wing_nodes(p, s)`: the arm (4 nodes) and the finger tips.
 *
 * Every wing rests spread and low, as a gull-winged pair: the arm reaches out to the side
 * rising `armLift` per unit outward (8–22°), the hand beyond the wrist flattens or tips down
 * (`handLift`, +2° to −10°), and the fingers further back in the fan fall toward the root's
 * height (FAN_DROP), so the trailing edge sits below the leading one. Low and out, the far
 * wing does not tower over the back and the near wing shows its surface, not its edge, to a
 * three-quarter camera (M3e cycle 1, art D1). No bone is ever below the root. wingDroop is
 * the rest height (it sets both lifts), wingSpan the bone extent, wingShape broad (short
 * reach, deep chord, little sweep) to falcate (long reach, narrow chord, swept-back tip).
 * `d` is distance out from the midline. No trig and no pow, so the port stays exact.
 */
export function wingNodes(p: Phenotype, s: number): { arm: [Vec3, number][]; tips: Vec3[] } {
  const { wingSpan: WS, wingShape: SH, wingDroop: DR, bodyLength: BL } = p;
  const NF = p.wingFingers;
  const WZ = wingRootZ(p);
  const span = WS;
  const out = lerp(1.00, 1.25, SH) * span; // lateral reach
  const chord = lerp(1.20, 0.75, SH) * span; // how far back the hand reaches
  const sweep = lerp(0.15, 0.70, SH); // leading tip swept back, per unit of reach
  const armLift = lerp(0.40, 0.14, DR); // the arm's rise per unit outward
  const handLift = lerp(0.04, -0.18, DR); // the hand's, beyond the wrist: high droop tips it down
  const wd = 0.26 + 1.60 * out; // the wrist's reach
  const zw = WZ + armLift * (wd - 0.26); // the wrist's height
  const armAt = (x: number, d: number): Vec3 => [x, d * s, WZ + armLift * (d - 0.26)];
  const handAt = (x: number, d: number): Vec3 => [x, d * s, zw + handLift * (d - wd)];
  const arm: [Vec3, number][] = [
    [armAt(0.92 * BL, 0.26), 0.115 * span],
    [armAt(0.78 * BL, 0.26 + 0.82 * out), 0.080 * span],
    [armAt(0.62 * BL, wd), 0.055 * span],
    [handAt(0.62 * BL - 1.30 * sweep * out, wd + 1.10 * out), 0.028 * span],
  ];
  // The fingers fan from the wrist, between the leading tip's direction (f = 0) and one
  // pointing back toward the hip (f = 1). A sail's tips sit on the straight chord between the
  // two; the other forms bulge them outward so the hand is rounded.
  const lx = -1.30 * sweep * out, ld = 1.10 * out;
  const rx = -(1.05 * BL + 0.40 * chord), rd = -0.55 * out;
  const bulge = wingForm(p) === 'sail' ? 0.0 : 0.55;
  const tips: Vec3[] = [];
  for (let k = 0; k < NF; k++) {
    const f = (k + 1) / (NF + 1);
    const g = 1.0 + bulge * f * (1.0 - f);
    const t = handAt(0.62 * BL + lerp(lx, rx, f) * g, wd + lerp(ld, rd, f) * g);
    // Fingers further back in the fan fall toward the root's height: the hand fans down
    // and back, so the trailing edge sits below the leading one and never under the root.
    tips.push([t[0], t[1], WZ + (t[2] - WZ) * (1.0 - FAN_DROP * f)]);
  }
  return { arm, tips };
}

/**
 * `add_wings`: an arm from the shoulder, and a two-node finger from the wrist to each tip.
 * A sail's fingers are skinned at the graph's minimum radius, inside the membrane's
 * thickness: one unbroken panel with no visible finger bones (M3e cycle 1, art).
 */
export function addWings(g: Graph, idx: Anchors, p: Phenotype): void {
  for (const s of [1, -1]) {
    const { arm, tips } = wingNodes(p, s);
    const bones = g.chain(idx.shoulder, arm);
    const wrist = bones[2]!;
    const w2 = arm[2]![0];
    const fingerR = wingForm(p) === 'sail' ? 0.0 : 1.0;
    for (const t of tips) {
      const mid: Vec3 = [(t[0] + w2[0]) * 0.51, (t[1] + w2[1]) * 0.5, (t[2] + w2[2]) * 0.5];
      g.chain(wrist, [[mid, fingerR * 0.032 * p.wingSpan], [t, fingerR * 0.016 * p.wingSpan]]);
    }
  }
}

/**
 * `add_crown`: horn pairs and an odd centre horn, then the crest (frill, skull fin or antler).
 * Since M3f the horns are thick at the root and every crest is built to change the head's
 * outline: a frill fans wide and back from the jaw, a fin stands tall on the skull, an
 * antler branches high above it. hornCount and crestType are judged on the head's outline
 * (artifacts/variants/dragon-sweep.json).
 */
export function addCrown(g: Graph, idx: Anchors, p: Phenotype): void {
  const { hornCount: HC, hornLength: HL, hornCurve: HK, crestType: CT } = p;
  // Horns are as thick as the skull is big (headScale), but reach as far as headSize itself
  // says: on the amplified scale the longest horns stood three units tall.
  const HS = headScale(p.headSize);
  const HR = p.headSize;
  const [hx, hz] = idx.headPos;
  const back = idx.headBack;
  const pairs = Math.floor(Math.max(0, HC) / 2);
  const odd = HC % 2;
  for (let i = 0; i < pairs; i++) {
    const f = (i + 1) / (pairs + 1);
    for (const s of [1, -1]) {
      const yaw = 0.16 + 0.26 * f;
      g.chain(back, [
        [[hx - 0.16 * HL, yaw * s * HS, hz + (0.56 + 0.30 * f) * HL * HR], 0.135 * HS],
        [[hx - 0.16 * HL - 0.26 * HL * (1 - HK * 0.5), (yaw + 0.09) * s * HS, hz + (0.86 + 0.34 * f) * HL * HR], 0.085 * HS],
        [[hx - 0.16 * HL - 0.48 * HL * (1 - HK * 0.8), (yaw + 0.14) * s * HS, hz + (1.02 + 0.26 * f) * HL * HR - 0.22 * HK * HL], 0.030 * HS],
      ]);
    }
  }
  if (odd) {
    g.chain(back, [
      [[hx - 0.10 * HL, 0, hz + 0.64 * HL * HR], 0.125 * HS],
      [[hx - 0.28 * HL, 0, hz + 1.00 * HL * HR], 0.075 * HS],
      [[hx - 0.46 * HL, 0, hz + 1.18 * HL * HR - 0.20 * HK * HL], 0.028 * HS],
    ]);
  }
  if (CT === 1) { // frill: three thick spines a side, fanned out and back from behind the jaw
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        g.chain(back, [
          [[hx - 0.20 - 0.06 * k, (0.36 + 0.10 * k) * s * HS, hz + (0.30 - 0.16 * k) * HS], 0.130 * HS],
          [[hx - 0.50 - 0.16 * k, (0.80 + 0.22 * k) * s * HS, hz + (0.52 - 0.34 * k) * HS], 0.075 * HS],
          [[hx - 0.70 - 0.24 * k, (1.02 + 0.30 * k) * s * HS, hz + (0.62 - 0.46 * k) * HS], 0.030 * HS],
        ]);
      }
    }
  } else if (CT === 2) { // a fin of three tall spines standing on the skull, raked back
    for (let k = 0; k < 3; k++) {
      g.chain(back, [
        [[hx - 0.08 - 0.22 * k, 0, hz + (0.50 + 0.04 * k) * HS], 0.120 * HS],
        [[hx - 0.20 - 0.30 * k, 0, hz + (0.98 - 0.08 * k) * HS], 0.075 * HS],
        [[hx - 0.34 - 0.38 * k, 0, hz + (1.40 - 0.22 * k) * HS], 0.028 * HS],
      ]);
    }
  } else if (CT === 3) { // antler: a beam each side, forking twice
    for (const s of [1, -1]) {
      const br = g.chain(back, [
        [[hx - 0.18, 0.22 * s * HS, hz + 0.60 * HS], 0.130 * HS],
        [[hx - 0.40, 0.50 * s * HS, hz + 1.10 * HS], 0.095 * HS],
      ])[1]!;
      for (const d of [-1, 1]) {
        g.chain(br, [
          [[hx - 0.62 + 0.22 * d, (0.62 + 0.36 * d) * s * HS, hz + 1.50 * HS], 0.070 * HS],
          [[hx - 0.86 + 0.36 * d, (0.70 + 0.62 * d) * s * HS, hz + 1.95 * HS], 0.034 * HS],
        ]);
      }
    }
  }
}

/** builder.py `_mix`: a + (b − a)·t per component. */
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** (along the edge, pulled toward the wrist, sag): the spread form's scallop points. */
const SCALLOP: readonly (readonly [number, number, number])[] = [[0.25, 0.24, 0.75], [0.50, 0.32, 1.00], [0.75, 0.24, 0.75]];
/** (along the bone, across toward the next rib, sag): the segmented form's vane corners. */
const VANE: readonly (readonly [number, number, number])[] = [[0.04, 0.00, 0.00], [0.80, 0.55, 1.00], [0.40, 0.65, 0.60]];
/** How far the membrane sags below its bones between them, per unit of wingSpan. */
export const MEMBRANE_SAG = 0.20;
/** `p` moved down by k · MEMBRANE_SAG · span: the membrane's camber between its bones. */
const sag = (p: Vec3, k: number, span: number): Vec3 => [p[0], p[1], p[2] - k * MEMBRANE_SAG * span];

/**
 * `membrane_polys(p, s)`: the wing membrane's corners and faces, before Solidify and Subsurf.
 *
 * Corners 0–3 are the arm (root, elbow, wrist, leading tip), then the finger tips, then the
 * body anchors A1 (ahead of the hip, so the near wing stays off the tail root) and A2
 * (mid-flank); each form adds its own points after
 * those. The inner membrane (arm to flank) is the same in all three forms. Beyond the wrist
 * the hand is cut into ribs — the leading tip, each finger tip, A1 — and:
 * - sail: one wedge per rib pair, all meeting at the wrist: one straight-edged panel;
 * - spread: the same wedges, each trailing edge pulled in toward the wrist and sagging at
 *   three points (SCALLOP), so the edge between two finger tips is a scallop;
 * - segmented: no wedges. Each rib but A1 carries its own vane, a quad from 4 % along the
 *   bone to the tip reaching VANE's fraction of the way toward the next rib. The vanes share
 *   no corner with each other or with the inner membrane.
 */
export function membranePolys(p: Phenotype, s: number): { v: Vec3[]; f: number[][] } {
  const { arm, tips } = wingNodes(p, s);
  const BL = p.bodyLength;
  const W2 = arm[2]![0];
  // The flank anchors sit as far over the chest's centre as they did in M3e (1.04 and 1.12
  // over 1.0), so the membrane never dips under the torso's midline, whatever the girth.
  const zc = torsoNodes(p)[2]![1];
  const A1: Vec3 = [-0.35 * BL, 0.20 * s, zc + 0.04];
  const A2: Vec3 = [-0.15 * BL, 0.22 * s, zc + 0.12];
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
      for (const [t, pull, k] of SCALLOP) {
        v.push(sag(mix(mix(v[a]!, v[b]!, t), W2, pull), k, p.wingSpan));
        f.push([2, prev, v.length - 1]);
        prev = v.length - 1;
      }
      f.push([2, prev, b]);
    } else {
      const q: number[] = [];
      for (const [u, w, k] of VANE) {
        v.push(sag(mix(mix(W2, v[a]!, u), mix(W2, v[b]!, u), w), k, p.wingSpan));
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

/**
 * `torso_at(t, p)`: height and radius of the torso at normalised position t, between the
 * skeleton's own torso nodes, so dorsal spikes sit on the back the skeleton built.
 */
export function torsoAt(t: number, p: Phenotype): [number, number] {
  const tn = torsoNodes(p);
  for (let i = 0; i < TORSO_PROFILE.length - 1; i++) {
    const a = TORSO_PROFILE[i]![0], b = TORSO_PROFILE[i + 1]![0];
    if (a <= t && t <= b) {
      const u = (t - a) / (b - a);
      return [lerp(tn[i]![1], tn[i + 1]![1], u), lerp(tn[i]![2], tn[i + 1]![2], u)];
    }
  }
  const last = tn[tn.length - 1]!;
  return [last[1], last[2]];
}

/** Python `math.radians`: x * (pi / 180). */
const radians = (deg: number) => deg * (Math.PI / 180.0);

/** `spike_params(p)`: one six-sided cone per dorsal spike, sitting on the back. */
export function spikeParams(p: Phenotype): Primitive[] {
  const { spineCount: SC, spineHeight: SH2, bodyLength: BL } = p;
  const out: Primitive[] = [];
  for (let i = 0; i < SC; i++) {
    const t = i / Math.max(1, SC - 1);
    const x = lerp(-0.75 * BL, 0.95 * BL, t);
    const [z, r] = torsoAt(t, p);
    const h = (0.10 + r * 0.60) * SH2;
    out.push({ kind: 'cone', vertices: 6, radius: r * 0.26, depth: h, location: [x, 0, z + r * 0.86 + h * 0.40], rotY: radians(-14), scale: [1, 1, 1] });
  }
  return out;
}

/** `ornament_params(p)`: the tail ornament, or null for tailTip "none". */
export function ornamentParams(p: Phenotype): Primitive | null {
  const TT = p.tailTip;
  const x = -2.95 * p.tailLength * p.bodyLength;
  // The tail tip's height (skeleton: 58 % of the hip's); each ornament sits where it did over
  // M3e's tip at 0.50.
  const tz = 0.58 * torsoNodes(p)[0]![1];
  if (TT === 0) return null;
  if (TT === 1) return { kind: 'cone', vertices: 4, radius: 0.26, depth: 0.70, location: [x - 0.1, 0, tz + 0.30], rotY: radians(-60), scale: [1, 0.22, 1] };
  if (TT === 2) return { kind: 'cone', vertices: 3, radius: 0.30, depth: 0.56, location: [x - 0.14, 0, tz + 0.10], rotY: radians(-96), scale: [1, 0.30, 1] };
  return { kind: 'ico', subdivisions: 1, radius: 0.26, location: [x - 0.12, 0, tz + 0.06], rotY: 0.0, scale: [1, 1, 1] };
}
