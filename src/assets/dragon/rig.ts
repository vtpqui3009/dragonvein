/**
 * The dragon's rig (M7b): a bone table read off the skin graph, and the skin weights that
 * bind the mesh to it. No three.js, so the mesher's worker bakes the weights
 * (STATE.md run 30: "bones come from the skin graph's own nodes; no new bone layout").
 *
 * **Bones.** One bone per moving segment of the graph, pivoting at the segment's end nearer
 * the hip (the root). Graph node numbers follow graph.ts's build order: the skeleton is
 * nodes 0–15 (tail tip 0 … tail root 3, which sits on the hip, then hip 4, belly 5, chest 6,
 * shoulder 7, neck 8–11, head 12–15), then four legs of 4 + 2·toeCount nodes each in the
 * order left hind, left fore, right hind, right fore (graph.ts `addLimbs`: s = +1 is the
 * dragon's left), then two wings of 4 + 2·wingFingers nodes (left, right), then the crown.
 *
 *   bone      pivot (graph node)        parent   carries
 *   pelvis    hip (4)                   —        hip → belly, the hind legs' sockets
 *   spine1    belly (5)                 pelvis   belly → chest
 *   spine2    chest (6)                 spine1   chest → shoulder, the forelegs' sockets
 *   neck0..4  shoulder (7), neck 8–11   chain    one neck segment each
 *   head      head back (12)            neck4    the skull, snout, eyes and the crown
 *   tail0..2  tail root (3), 2, 1       chain    one tail segment each, tip last
 *   thigh·L   leg node n1 (hip joint)   pelvis (hind) / spine2 (fore)   n1 → n2
 *   shin·L    n2 (knee)                 thigh    n2 → n3
 *   foot·L    n3 (ankle)                shin     n3 → n4 and the toes
 *   wingL/R   the wing's root node      spine2   the humerus: root → elbow
 *   forearm·S elbow                     wingS    elbow → wrist
 *   hand·S    wrist                     forearm  wrist → the leading tip (the leading digit)
 *   finger·Sk wrist                     hand     wrist → finger k's mid → its tip
 *
 * The wing chain (M7c, STATE.md run 31) is read off the graph's own wing nodes, 4 + 2·wingFingers
 * per wing (graph.ts `addWings`: root, elbow, wrist, leading tip, then a mid and a tip per
 * finger). The body's 26 bones keep their numbers; each wing's forearm, hand and fingers
 * follow from BODY_BONES on, the left wing's first. A wingless body has no chain.
 *
 * The rest pose is the mesh as built: every bone's skinning matrix is the identity, so a
 * skinned dragon at rest is the static one, vertex for vertex.
 *
 * **Weights.** A tube vertex knows its path segment and parameter (./skin.ts `rings`). The
 * segment belongs to the bone of its deeper node (the end further from the hip). Near a
 * joint where two segments belong to different bones, the weight blends smoothly to 50/50
 * at the joint itself, over JOINT_BLEND joint radii (at most half the segment). So at most
 * three bones touch a vertex, the weights sum to 1, and the skin bends round a joint instead
 * of creasing. One exception, the **sole**: a planted foot must not move, and the ankle's
 * blend would let the heel's underside follow the shin. So every vertex of a leg's shin, foot
 * or toes below SOLE_FULL rides the foot alone, blending back to its chain weights by the
 * ankle's height (at least SOLE_BAND above): the contact patch is rigid, and the ankle bends
 * above it. Parts that are not tubes: eyes and glints ride the head; spikes take the
 * spine's weights at their base; the tail ornament rides the tail tip.
 *
 * **Wings (M7c).** A membrane vertex is placed from its polygon's corners (./parts.ts
 * `corners`), and the corners are bones: root and elbow the humerus, wrist the forearm, the
 * leading tip the hand, each finger tip its finger, the flank anchors A1 and A2 the spine at
 * the vertex's own x. Beyond the wrist each panel is a wedge from the wrist, and every bone
 * there pivots at the wrist, so the wrist's share goes to the two ribs in proportion: a vertex
 * on a rib rides that rib's bone exactly and the panel between two fingers fans with them. The
 * inner panel (root, elbow, wrist, A2, A1) splits its arm share between humerus and forearm so
 * the leading edge rides the humerus to the elbow and the forearm beyond it. Then the **junction
 * falloff**: every wing vertex (membrane or wing tube) hands its wing-bone weight to the body
 * (the spine at its x) as it nears the body's tubes (trunk and legs, not the crest), smoothly
 * over WING_JUNCTION. A vertex
 * on or inside the body rides the body, so the skin where the wing grows out stretches instead
 * of plunging into the flank, and the root of the arm tube, which starts at the shoulder's
 * centre, stays inside it. Any vertex left with more than 4 influences keeps its 4 heaviest.
 */
import type { Phenotype } from '../../core/genome';
import { TubeField } from './clearance';
import type { Anchors, Graph, Vec3 } from './graph';
import type { Weights } from './parts';
import type { SkinMesh } from './skin';

export const LEG_NAMES = ['LH', 'LF', 'RH', 'RF'] as const;
export type LegName = (typeof LEG_NAMES)[number];

/** Bone indices. Parents come before children. */
export const BONE = {
  pelvis: 0, spine1: 1, spine2: 2, neck0: 3, neck1: 4, neck2: 5, neck3: 6, neck4: 7, head: 8,
  tail0: 9, tail1: 10, tail2: 11,
  /** thigh, shin, foot of leg L (LEG_NAMES order) are LEG0 + 3L + 0, 1, 2. */
  leg0: 12,
  /** Each wing's humerus (root → elbow); the rest of its chain is in `Rig.wings`. */
  wingL: 24, wingR: 25,
} as const;
/** Bones every dragon has: the body's and each wing's humerus. The wing chains follow. */
export const BODY_BONES = 26;
/** How many bones a dragon has: BODY_BONES, then each wing's forearm, hand and one per finger. */
export function boneCount(p: Phenotype, winged = true): number {
  return BODY_BONES + (winged ? 2 * (2 + p.wingFingers) : 0);
}

/** One leg's rest geometry in the mesh frame (three.js: x forward, y up, z to the right). */
export interface RigLeg {
  name: LegName;
  /** The bone the leg hangs from: pelvis (hind) or spine2 (fore). */
  anchor: number;
  thigh: number; shin: number; foot: number;
  /** Graph nodes: hip joint, knee, ankle, foot; and the first toe's tip. */
  nodes: [number, number, number, number];
  hip: Vec3; knee: Vec3; ankle: Vec3; ball: Vec3; toe: Vec3;
}

/** One wing's chain and its rest geometry in the mesh frame (M7c). */
export interface RigWing {
  /** +1 the dragon's left (graph y > 0, mesh z < 0), −1 its right. */
  side: 1 | -1;
  humerus: number; forearm: number; hand: number;
  /** One bone per finger, front of the fan first. */
  fingers: number[];
  /** Graph nodes: root, elbow, wrist, leading tip; each finger's mid and tip. */
  nodes: { root: number; elbow: number; wrist: number; lead: number; mids: number[]; tips: number[] };
  root: Vec3; elbow: Vec3; wrist: Vec3; lead: Vec3; mids: Vec3[]; tips: Vec3[];
}

/** The bone table: plain data, so it crosses from the worker by structured clone. */
export interface Rig {
  names: string[];
  parent: number[];
  /** Rest pivots in the mesh frame, 3 per bone. */
  pivot: number[];
  legs: RigLeg[];
  /** The two wing chains, left then right; empty for a wingless body. */
  wings: RigWing[];
  /** The first crown node (horns and crest, graph.ts `addCrown`): the graph's nodes from here on ride the head. */
  crownFrom: number;
}

/** How far a joint's blend reaches into each segment, in joint radii (at most half the segment). */
export const JOINT_BLEND = 1.0;
/** ...and at least this fraction of the segment, so a thin joint still bends smoothly. */
export const JOINT_BLEND_MIN = 0.2;

/** Leg vertices below this height (world units) ride the foot alone: the rigid sole. */
export const SOLE_FULL = 0.11;
/** ...blending back to the chain's weights by the ankle's height, at least this far above SOLE_FULL. */
export const SOLE_BAND = 0.05;

/** Graph (z up) → mesh (y up), as ./arrays.ts turns the mesh: (x, y, z) → (x, z, −y). */
const toMesh = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];

/** The graph's node numbering, from graph.ts's build order. Throws if the graph disagrees. */
function layout(g: Graph, idx: Anchors, p: Phenotype): { legBase: number[]; legSize: number; wingBase: number[]; wingSize: number; crownFrom: number } {
  if (idx.tailTip !== 0 || idx.hip !== 4 || idx.shoulder !== 7 || idx.headBack !== 12 || idx.nose !== 15) {
    throw new Error('rig: the skeleton is not graph.ts\'s 16-node layout');
  }
  const legSize = 4 + 2 * p.toeCount;
  const legBase = [0, 1, 2, 3].map((L) => 16 + L * legSize);
  const bodyEnd = 16 + 4 * legSize;
  const wingSize = 4 + 2 * p.wingFingers;
  const hasWings = g.v.length >= bodyEnd + 2 * wingSize && g.e.some(([a, b]) => a === idx.shoulder && b === bodyEnd);
  const wingBase = hasWings ? [bodyEnd, bodyEnd + wingSize] : [];
  const crownFrom = hasWings ? bodyEnd + 2 * wingSize : bodyEnd;
  if (!hasWings && g.v.length !== bodyEnd) throw new Error(`rig: ${g.v.length} nodes, expected ${bodyEnd} for a wingless body`);
  // Each leg chain hangs from the hip (hind) or the shoulder (fore), in LH, LF, RH, RF order.
  legBase.forEach((b, L) => {
    const anchor = L % 2 === 0 ? idx.hip : idx.shoulder;
    if (!g.e.some(([a, c]) => a === anchor && c === b)) throw new Error(`rig: leg ${LEG_NAMES[L]} does not start at node ${b}`);
  });
  return { legBase, legSize, wingBase, wingSize, crownFrom };
}

/** The bone table, and which bone carries the segment into each graph node. */
export function buildRig(g: Graph, idx: Anchors, p: Phenotype): { rig: Rig; owner: Int16Array } {
  const L = layout(g, idx, p);
  const n = g.v.length;
  const owner = new Int16Array(n).fill(BONE.head); // the crown, and anything after it, rides the head
  const names = ['pelvis', 'spine1', 'spine2', 'neck0', 'neck1', 'neck2', 'neck3', 'neck4', 'head', 'tail0', 'tail1', 'tail2'];
  const parent = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 0, 9, 10];
  const pivotNode = [4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 2, 1];
  // Skeleton nodes: the segment into each (from the hip's side) and its bone.
  const skel: [number, number][] = [
    [0, BONE.tail2], [1, BONE.tail1], [2, BONE.tail0], [3, BONE.pelvis], [4, BONE.pelvis],
    [5, BONE.pelvis], [6, BONE.spine1], [7, BONE.spine2], [8, BONE.neck0], [9, BONE.neck1],
    [10, BONE.neck2], [11, BONE.neck3], [12, BONE.neck4], [13, BONE.head], [14, BONE.head], [15, BONE.head],
  ];
  for (const [node, bone] of skel) owner[node] = bone;
  const legs: RigLeg[] = [];
  L.legBase.forEach((b, k) => {
    const name = LEG_NAMES[k]!;
    const anchor = k % 2 === 0 ? BONE.pelvis : BONE.spine2;
    const thigh = BONE.leg0 + 3 * k;
    names.push(`thigh${name}`, `shin${name}`, `foot${name}`);
    parent.push(anchor, thigh, thigh + 1);
    pivotNode.push(b, b + 1, b + 2);
    owner[b] = anchor; // the socket, from the body's centre to the hip joint
    owner[b + 1] = thigh;
    owner[b + 2] = thigh + 1;
    for (let i = b + 3; i < b + L.legSize; i++) owner[i] = thigh + 2; // the foot and its toes
    const v = (i: number) => toMesh(g.v[i]!);
    legs.push({
      name, anchor, thigh, shin: thigh + 1, foot: thigh + 2, nodes: [b, b + 1, b + 2, b + 3],
      hip: v(b), knee: v(b + 1), ankle: v(b + 2), ball: v(b + 3), toe: v(b + 5),
    });
  });
  names.push('wingL', 'wingR');
  parent.push(BONE.spine2, BONE.spine2);
  pivotNode.push(L.wingBase[0] ?? idx.shoulder, L.wingBase[1] ?? idx.shoulder);
  const wings: RigWing[] = [];
  const nf = p.wingFingers;
  L.wingBase.forEach((b, w) => {
    const S = w === 0 ? 'L' : 'R';
    const humerus = w === 0 ? BONE.wingL : BONE.wingR;
    const forearm = names.length, hand = forearm + 1;
    names.push(`forearm${S}`, `hand${S}`);
    parent.push(humerus, forearm);
    pivotNode.push(b + 1, b + 2);
    const fingers: number[] = [];
    for (let k = 0; k < nf; k++) {
      fingers.push(names.length);
      names.push(`finger${S}${k}`);
      parent.push(hand);
      pivotNode.push(b + 2);
    }
    // Each node's owner is the bone of the segment that ends at it (the shoulder → root
    // segment is the humerus's; the junction falloff keeps its inner end on the body).
    owner[b] = humerus; owner[b + 1] = humerus; owner[b + 2] = forearm; owner[b + 3] = hand;
    const mids: number[] = [], tips: number[] = [];
    for (let k = 0; k < nf; k++) {
      mids.push(b + 4 + 2 * k); tips.push(b + 5 + 2 * k);
      owner[b + 4 + 2 * k] = fingers[k]!; owner[b + 5 + 2 * k] = fingers[k]!;
      if (!g.e.some(([x, y]) => x === b + 2 && y === b + 4 + 2 * k)) throw new Error(`rig: finger ${k} of wing ${S} does not start at the wrist`);
    }
    const v = (i: number) => toMesh(g.v[i]!);
    wings.push({
      side: w === 0 ? 1 : -1, humerus, forearm, hand, fingers,
      nodes: { root: b, elbow: b + 1, wrist: b + 2, lead: b + 3, mids, tips },
      root: v(b), elbow: v(b + 1), wrist: v(b + 2), lead: v(b + 3), mids: mids.map(v), tips: tips.map(v),
    });
  });
  const pivot: number[] = [];
  for (const node of pivotNode) pivot.push(...toMesh(g.v[node]!));
  return { rig: { names, parent, pivot, legs, wings, crownFrom: L.crownFrom }, owner };
}

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * Weights along a chain of points: segment k (points k → k+1) belongs to bone `own[k]`.
 * At an interior point whose two segments have different bones, each side blends to 50/50
 * at the point, over `reach` of the segment (a fraction, ≤ 0.5). Writes up to three
 * (bone, weight) pairs into `out` and returns how many.
 */
function chainWeights(own: ArrayLike<number>, reachStart: ArrayLike<number>, reachEnd: ArrayLike<number>, k: number, u: number, out: number[]): number {
  const e = own[k]!;
  let wPrev = 0, wNext = 0;
  if (k > 0 && own[k - 1] !== e && u < reachStart[k]!) wPrev = 0.5 * (1 - smooth(u / reachStart[k]!));
  if (k + 1 < own.length && own[k + 1] !== e && 1 - u < reachEnd[k]!) wNext = 0.5 * (1 - smooth((1 - u) / reachEnd[k]!));
  let m = 0;
  out[m++] = e; out[m++] = 1 - wPrev - wNext;
  if (wPrev > 0) { out[m++] = own[k - 1]!; out[m++] = wPrev; }
  if (wNext > 0) { out[m++] = own[k + 1]!; out[m++] = wNext; }
  return m / 2;
}

/** A path's segment owners and blend reaches, from its points (node ids, radii, positions). */
function chainOf(ids: number[][], r: number[], pos: (i: number) => Vec3, owner: Int16Array, depth: Int32Array) {
  const segs = ids.length - 1;
  const own = new Int16Array(segs), rs = new Float64Array(segs), re = new Float64Array(segs);
  // A merged point (the tail root on the hip) answers as its node nearest the hip.
  const id = ids.map((list) => list.reduce((a, b) => (depth[b]! < depth[a]! ? b : a)));
  for (let k = 0; k < segs; k++) {
    const a = id[k]!, b = id[k + 1]!;
    own[k] = owner[depth[a]! > depth[b]! ? a : b]!;
    const pa = pos(k), pb = pos(k + 1);
    const l = Math.max(1e-6, Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]));
    rs[k] = Math.min(0.5, Math.max(JOINT_BLEND_MIN, (JOINT_BLEND * r[k]!) / l));
    re[k] = Math.min(0.5, Math.max(JOINT_BLEND_MIN, (JOINT_BLEND * r[k + 1]!) / l));
  }
  return { own, rs, re };
}

/** Depth of every node from the hip, over the graph's edges. */
function depthFromHip(g: Graph, hip: number): Int32Array {
  const n = g.v.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of g.e) { adj[a]!.push(b); adj[b]!.push(a); }
  const depth = new Int32Array(n).fill(-1);
  depth[hip] = 0;
  const q = [hip];
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    for (const w of adj[u]!) if (depth[w] === -1) { depth[w] = depth[u]! + 1; q.push(w); }
  }
  return depth;
}

/**
 * The spine's weights as a function of x (graph frame), for parts that sit on the body
 * without being tubes of it: dorsal spikes, membranes. The same chain and blend as the spine
 * tube from the tail's second node through the hip, belly, chest and shoulder to the first
 * neck node, parametrised by x along it, so a part follows the skin it sits on.
 */
export function spineAtX(g: Graph, owner: Int16Array) {
  const nodes = [2, 4, 5, 6, 7, 8];
  const xs = nodes.map((i) => g.v[i]![0]);
  const own = new Int16Array(nodes.length - 1), rs = new Float64Array(own.length), re = new Float64Array(own.length);
  for (let k = 0; k < own.length; k++) {
    own[k] = owner[nodes[k + 1]! === 4 ? 2 : nodes[k + 1]!]!; // segment 2 → 4 is the tail's first
    const l = Math.max(1e-6, Math.abs(xs[k + 1]! - xs[k]!));
    rs[k] = Math.min(0.5, Math.max(JOINT_BLEND_MIN, (JOINT_BLEND * g.r[nodes[k]!]!) / l));
    re[k] = Math.min(0.5, Math.max(JOINT_BLEND_MIN, (JOINT_BLEND * g.r[nodes[k + 1]!]!) / l));
  }
  return (x: number, out: number[]): number => {
    let k = 0;
    while (k < own.length - 1 && x > xs[k + 1]!) k++;
    const u = Math.min(1, Math.max(0, (x - xs[k]!) / (xs[k + 1]! - xs[k]!)));
    return chainWeights(own, rs, re, k, u, out);
  };
}

/**
 * The skin weights of a tube's stations (./skin.ts `tubeStations`): each station rides what
 * its ring's vertices ride (the chain blend at its segment and parameter, before the sole), so
 * a probe can carry the body's solid with the posed skeleton. Up to 3 (bone, weight) pairs each.
 */
export function stationWeights(
  g: Graph, idx: Anchors, owner: Int16Array, tube: { ids: number[][]; r: number[]; stations: { k: number; u: number }[] },
): { bone: number; w: number }[][] {
  const c = chainOf(tube.ids, tube.r, (i) => g.v[tube.ids[i]![0]!]!, owner, depthFromHip(g, idx.hip));
  const tmp: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  return tube.stations.map((s) => {
    const m = chainWeights(c.own, c.rs, c.re, s.k, s.u, tmp);
    const out: { bone: number; w: number }[] = [];
    for (let j = 0; j < m; j++) out.push({ bone: tmp[2 * j]!, w: tmp[2 * j + 1]! });
    return out;
  });
}

/** What each extra (non-tube) part rides. A membrane rides its wing (`wing`: 0 left, 1 right), from its polygon corners. */
export type Attach =
  | { kind: 'bone'; bone: number } | { kind: 'spineAtX' } | { kind: 'spineAt'; x: number }
  | { kind: 'membrane'; wing: number; poly: { v: Vec3[]; f: number[][] }; corners: Weights[] };

/**
 * Over this distance from the body's tubes (world units), a wing vertex hands its wing bones'
 * weight over to the body: all of it on the body's surface, none of it this far out.
 */
export const WING_JUNCTION = 0.30;


/**
 * Each membrane polygon corner as weights over the basic corners: 0 root, 1 elbow, 2 wrist,
 * 3 leading tip, 4 + k finger k's tip, then the flank anchors A1 and A2 (graph.ts
 * `membranePolys`). The spread and segmented forms add three points per rib pair (scallops or
 * a vane), each a blend of the wrist and the pair's two ribs; they are solved back to those
 * three in the plane (their sag is straight down, so it does not enter). Throws if a point does
 * not lie in its wedge, so a change to the polygon cannot go unnoticed.
 */
export function membraneBasis(poly: { v: Vec3[] }, nT: number): Weights[] {
  const nBasic = 6 + nT;
  const ribs = [3, ...Array.from({ length: nT }, (_, k) => 4 + k), 4 + nT];
  const out: Weights[] = [];
  for (let i = 0; i < poly.v.length; i++) {
    if (i < nBasic) { out.push([[i, 1]]); continue; }
    const r = Math.floor((i - nBasic) / 3);
    const a = ribs[r], b = ribs[r + 1];
    if (a === undefined || b === undefined) throw new Error(`rig: membrane point ${i} has no rib pair`);
    const W = poly.v[2]!, A = poly.v[a]!, B = poly.v[b]!, P = poly.v[i]!;
    const ax = A[0] - W[0], ay = A[1] - W[1], bx = B[0] - W[0], by = B[1] - W[1], px = P[0] - W[0], py = P[1] - W[1];
    const det = ax * by - ay * bx;
    const la = (px * by - py * bx) / det, lb = (ax * py - ay * px) / det, lw = 1 - la - lb;
    if (!(Math.min(la, lb, lw) > -1e-6)) throw new Error(`rig: membrane point ${i} is outside its wedge (${lw}, ${la}, ${lb})`);
    out.push([[2, lw], [a, la], [b, lb]]);
  }
  return out;
}

/**
 * Bake `skinIndex` / `skinWeight` (4 per vertex) for a merged dragon mesh: the skin's tubes
 * first (`skin`, vertices [0, skin vertex count)), then the extras in order, each with its
 * vertex range and attachment. Positions are read in the graph's frame (x is the same in
 * both frames, which is all the spine's weights need).
 */
export function bakeSkin(
  g: Graph, idx: Anchors, owner: Int16Array, rig: Rig, skin: SkinMesh,
  extras: { from: number; to: number; attach: Attach }[], position: Float32Array,
): { skinIndex: Uint16Array; skinWeight: Float32Array } {
  const nv = position.length / 3;
  const nBones = rig.parent.length;
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  const tmp: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  const write = (v: number, m: number) => {
    for (let j = 0; j < m; j++) { skinIndex[4 * v + j] = tmp[2 * j]!; skinWeight[4 * v + j] = tmp[2 * j + 1]!; }
  };
  const depth = depthFromHip(g, idx.hip);
  const rings = skin.rings!, tubes = skin.tubes!;
  const chains = tubes.map((t) => chainOf(t.ids, t.r, (i) => g.v[t.ids[i]![0]!]!, owner, depth));
  const nSkin = skin.position.length / 3;
  const spine = spineAtX(g, owner);

  // The wings: which bones are theirs, which tubes, and the body's solid for the falloff.
  const wingBone = new Uint8Array(nBones);
  const wingNode = new Uint8Array(g.v.length);
  for (const w of rig.wings) {
    for (const b of [w.humerus, w.forearm, w.hand, ...w.fingers]) wingBone[b] = 1;
    const n = w.nodes;
    for (const i of [n.root, n.elbow, n.wrist, n.lead, ...n.mids, ...n.tips]) wingNode[i] = 1;
  }
  const isWingTube = tubes.map((t) => t.ids.some((ids) => ids.some((i) => wingNode[i] === 1)));
  // The junction is where the wing grows from the body: the trunk and the legs, whose tubes all
  // start at the hip or the shoulder beside the wing's root. A crest is not: a horn or frill near
  // a wing is something the wing must clear in flight, not something it is attached to.
  const isTrunk = tubes.map((t, i) => !isWingTube[i] && t.ids.every((ids) => ids.every((n) => n < rig.crownFrom)));
  const stations = skin.stations!;
  const body = rig.wings.length
    ? new TubeField(stations.filter((_, i) => isTrunk[i]).map((st) => ({ c: st.map((s) => s.c), r: st.map((s) => s.r) })))
    : null;

  // A vertex's weights are gathered per bone, then the 4 heaviest are kept and renormalised.
  const acc = new Float64Array(nBones);
  const touched: number[] = [];
  const add = (b: number, w: number) => { if (w <= 0) return; if (acc[b] === 0) touched.push(b); acc[b] = acc[b]! + w; };
  const keep = new Int32Array(4);
  const finish = (v: number) => {
    let m = 0;
    for (let j = 0; j < 4; j++) {
      let best = -1;
      for (const b of touched) if (acc[b]! > 0 && (best < 0 || acc[b]! > acc[best]!)) best = b;
      if (best < 0) break;
      keep[m++] = best;
      tmp[2 * j] = best; tmp[2 * j + 1] = acc[best]!;
      acc[best] = -acc[best]!; // taken
    }
    let sum = 0;
    for (let j = 0; j < m; j++) sum += tmp[2 * j + 1]!;
    for (let j = 0; j < m; j++) tmp[2 * j + 1] = tmp[2 * j + 1]! / sum;
    for (const b of touched) acc[b] = 0;
    touched.length = 0;
    write(v, m);
  };
  /**
   * The junction falloff, then finish: the wing bones' gathered weight is scaled by how far
   * the vertex is from the body, and what it loses goes to the spine at the vertex's x.
   */
  const junction = (v: number) => {
    const x = position[3 * v]!, y = position[3 * v + 1]!, z = position[3 * v + 2]!;
    const c = body ? body.distance(x, y, z, WING_JUNCTION) : WING_JUNCTION;
    const f = smooth(c / WING_JUNCTION);
    let lost = 0;
    if (f < 1) {
      for (const b of touched) if (wingBone[b]) { lost += acc[b]! * (1 - f); acc[b] = acc[b]! * f; }
      if (lost > 0) { const m = spine(x, tmp); for (let j = 0; j < m; j++) add(tmp[2 * j]!, tmp[2 * j + 1]! * lost); }
    }
    finish(v);
  };

  // The sole: per bone, the foot it belongs to (shin and foot of each leg) and its top height.
  const soleFoot = new Int16Array(nBones).fill(-1);
  const soleTop = new Float64Array(nBones);
  for (const leg of rig.legs) {
    for (const b of [leg.shin, leg.foot]) { soleFoot[b] = leg.foot; soleTop[b] = Math.max(leg.ankle[1], SOLE_FULL + SOLE_BAND); }
  }
  for (let v = 0; v < nSkin; v++) {
    const path = rings.path[v]!;
    const c = chains[path]!;
    let m = chainWeights(c.own, c.rs, c.re, rings.k[v]!, rings.u[v]!, tmp);
    if (isWingTube[path]) {
      for (let j = 0; j < m; j++) add(tmp[2 * j]!, tmp[2 * j + 1]!);
      junction(v);
      continue;
    }
    const z = position[3 * v + 2]!;
    let foot = -1, top = 0;
    for (let j = 0; j < m; j++) if (soleFoot[tmp[2 * j]!]! >= 0) { foot = soleFoot[tmp[2 * j]!]!; top = soleTop[tmp[2 * j]!]!; }
    if (foot >= 0 && z < top) {
      const s = 1 - smooth((z - SOLE_FULL) / (top - SOLE_FULL));
      let has = false;
      for (let j = 0; j < m; j++) {
        tmp[2 * j + 1] = tmp[2 * j + 1]! * (1 - s) + (tmp[2 * j] === foot ? s : 0);
        if (tmp[2 * j] === foot) has = true;
      }
      if (!has) { tmp[2 * m] = foot; tmp[2 * m + 1] = s; m++; }
    }
    write(v, m);
  }
  for (const e of extras) {
    const a = e.attach;
    if (a.kind === 'spineAt') {
      const m = spine(a.x, tmp);
      for (let v = e.from; v < e.to; v++) write(v, m);
    } else if (a.kind === 'spineAtX') {
      for (let v = e.from; v < e.to; v++) write(v, spine(position[3 * v]!, tmp));
    } else if (a.kind === 'membrane') {
      const w = rig.wings[a.wing];
      if (!w) throw new Error(`rig: a membrane for wing ${a.wing}, which this body does not have`);
      const nT = w.fingers.length;
      const basis = membraneBasis(a.poly, nT);
      const lam = new Float64Array(6 + nT);
      for (let v = e.from; v < e.to; v++) {
        lam.fill(0);
        for (const [corner, k] of a.corners[v - e.from]!) for (const [basic, l] of basis[corner]!) lam[basic] = lam[basic]! + k * l;
        membraneWeights(lam, w, nT, add);
        const flank = lam[4 + nT]! + lam[5 + nT]!;
        if (flank > 0) { const m = spine(position[3 * v]!, tmp); for (let j = 0; j < m; j++) add(tmp[2 * j]!, tmp[2 * j + 1]! * flank); }
        junction(v);
      }
    } else {
      tmp[0] = a.bone; tmp[1] = 1;
      for (let v = e.from; v < e.to; v++) write(v, 1);
    }
  }
  return { skinIndex, skinWeight };
}

/**
 * A membrane vertex's wing-bone weights from its weights `lam` over the basic corners (see
 * `membraneBasis`); the flank anchors' share (A1, A2) is the caller's, on the spine.
 * - Inner panel (it touches the root, the elbow or A2): the arm share (root, elbow, wrist) splits
 *   into humerus and forearm by f = T / (T + λroot), T = 1 − λroot − λelbow: 0 along the
 *   root–elbow edge, 1 along the elbow–wrist edge and wherever the panel reaches the wrist.
 * - A hand wedge (wrist and two ribs: the leading tip, finger tips, A1): the wrist's share goes
 *   to the rib bones in proportion to their own, since they all pivot at the wrist, except the
 *   share in proportion to A1 (the body), which stays on the forearm that carries the wrist.
 */
function membraneWeights(lam: Float64Array, w: RigWing, nT: number, add: (b: number, w: number) => void): void {
  const l0 = lam[0]!, l1 = lam[1]!, lw = lam[2]!, a1 = lam[4 + nT]!, a2 = lam[5 + nT]!;
  if (l0 > 1e-12 || l1 > 1e-12 || a2 > 1e-12) {
    const arm = l0 + l1 + lw;
    const T = 1 - l0 - l1;
    const f = T + l0 > 1e-12 ? T / (T + l0) : 0;
    add(w.humerus, arm * (1 - f));
    add(w.forearm, arm * f);
    return;
  }
  let S = lam[3]! + a1;
  for (let k = 0; k < nT; k++) S += lam[4 + k]!;
  if (S <= 1e-12) { add(w.forearm, lw); return; }
  const share = lw / S;
  add(w.hand, lam[3]! * (1 + share));
  for (let k = 0; k < nT; k++) add(w.fingers[k]!, lam[4 + k]! * (1 + share));
  add(w.forearm, a1 * share);
}
