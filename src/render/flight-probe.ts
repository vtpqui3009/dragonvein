import * as THREE from 'three';
import type { Phenotype } from '../core/genome';
import { TubeField } from '../assets/dragon/clearance';
import type { FlightParams } from '../assets/dragon/flight';
import type { Anchors, Graph } from '../assets/dragon/graph';
import { buildRig, stationWeights, type Rig } from '../assets/dragon/rig';
import { tubeStations } from '../assets/dragon/skin';
import type { DragonFlight } from './flight';

/**
 * Measures a flap (M7c criterion 3): poses a dragon's skeleton through a schedule of flight
 * samples and, at each, skins its wing vertices on the CPU exactly as the shader does
 * (Σ wᵢ·Sᵢ·p over the bones' skinning matrices) and measures:
 *
 * - **body clearance**: the least signed distance from any deformed wing vertex to the body's
 *   own swept tubes (torso, neck, head, tail, legs and the crown: every tube that is not a
 *   wing's), carried by the same posed skeleton (src/assets/dragon/clearance.ts). A *wing
 *   vertex* is any vertex with weight on a wing bone; the skin weights hand every vertex on or
 *   inside the body to the body (rig.ts WING_JUNCTION), so all of them start outside it. The
 *   least clearance is reported over them all, and again over the *free wing* alone (the
 *   vertices wholly on wing bones, beyond the junction band), with each one's rest value;
 * - **wing to wing**: the least distance between a left-wing vertex and a right-wing one
 *   (exact below WING_PAIR_RANGE, else reported as at least that), and the gap across the
 *   body's midplane between the two wings (a positive gap separates every face of one wing
 *   from every face of the other, not only their vertices);
 * - **finger order**: about each wing's posed plane normal, the angles of the leading digit,
 *   each finger's mid and tip from the wrist must keep their rest order, strictly; the least
 *   neighbour gap is reported in degrees and any crossing counted;
 * - **wingtip travel**: the leading tip's height range over the full-weight flap samples
 *   against the half-span (the leading tip's rest distance from the midline).
 */
export interface FlightSample { t: number; flap: number; glide: number; kind: 'flap' | 'glide' | 'ramp' | 'cross' }

/** Wing-to-wing distance is resolved exactly below this; further apart is reported as this. */
export const WING_PAIR_RANGE = 1.0;

/**
 * The schedule: `cycles` beats at `perCycle` phases at full flap weight; a glide over one soar
 * period; the ramps in (flap at ¼, ½, ¾) and the crossfade to the glide (flap ¾ → ¼ as glide
 * ¼ → ¾), each at 8 phases of a beat.
 */
export function flightSamples(p: FlightParams, cycles = 2, perCycle = 32): FlightSample[] {
  const out: FlightSample[] = [];
  for (let i = 0; i < cycles * perCycle; i++) out.push({ t: (p.period * i) / perCycle, flap: 1, glide: 0, kind: 'flap' });
  const nGlide = Math.max(8, perCycle / 2);
  for (let i = 0; i < nGlide; i++) out.push({ t: (p.soarPeriod * i) / nGlide, flap: 0, glide: 1, kind: 'glide' });
  for (const w of [0.25, 0.5, 0.75]) {
    for (let i = 0; i < 8; i++) {
      const t = (p.period * (i + 0.5)) / 8;
      out.push({ t, flap: w, glide: 0, kind: 'ramp' });
      out.push({ t, flap: 1 - w, glide: w, kind: 'cross' });
    }
  }
  return out;
}

export interface FlightProbe {
  samples: number;
  wingVerts: number;
  /** Wing vertices in the junction band (part of their weight on the body, rig.ts WING_JUNCTION). */
  junctionVerts: number;
  /** The least body clearance of any wing vertex at rest. */
  restClearance: number;
  /** The least clearance, the sample it came at, and the vertex (mesh index, rest position) that came closest. */
  body: { min: number; at: FlightSample; vertex: number; rest: number[]; perSample: number[] };
  /** The same, over the free wing only: the vertices wholly on wing bones, beyond the junction band. */
  free: { min: number; restMin: number; at: FlightSample };
  wingToWing: { min: number; exactBelow: number; at: FlightSample };
  midplaneGap: { min: number; at: FlightSample };
  fingers: { minGapDeg: number; crossings: number; at: FlightSample };
  /** Per wing (left, right): the leading tip's height range over the flap samples, the half-span, and their ratio. */
  tips: { travel: number; halfSpan: number; ratio: number }[];
}

/** The dragon a probe measures: its mesh arrays (mesh frame), the graph it was built from, and its genes. */
export interface ProbeDragon {
  position: ArrayLike<number>; skinIndex: ArrayLike<number>; skinWeight: ArrayLike<number>;
  rig: Rig; graph: Graph; idx: Anchors; phenotype: Phenotype;
}

const toMesh = (c: readonly number[]): [number, number, number] => [c[0]!, c[2]!, -c[1]!];

export function probeFlight(d: ProbeDragon, flight: DragonFlight, samples: FlightSample[]): FlightProbe {
  const { rig } = d;
  const bones = flight.walk.bones;
  const nv = d.position.length / 3;
  // Which bones are a wing's, and which wing (0 left, 1 right).
  const wingOf = new Int8Array(rig.parent.length).fill(-1);
  rig.wings.forEach((w, i) => { for (const b of [w.humerus, w.forearm, w.hand, ...w.fingers]) wingOf[b] = i; });
  const verts: number[] = [], side: number[] = [], isFree: boolean[] = [];
  for (let v = 0; v < nv; v++) {
    let l = 0, r = 0;
    for (let j = 0; j < 4; j++) {
      const w = d.skinWeight[4 * v + j]!, b = d.skinIndex[4 * v + j]!;
      if (w > 0 && wingOf[b] === 0) l += w;
      if (w > 0 && wingOf[b] === 1) r += w;
    }
    if (l > 0 || r > 0) { verts.push(v); side.push(l >= r ? 0 : 1); isFree.push(l + r > 1 - 1e-6); }
  }
  // The body's tubes: every tube with no wing node, with its stations' skin weights.
  const wingNode = new Set<number>();
  for (const w of rig.wings) for (const i of [w.nodes.root, w.nodes.elbow, w.nodes.wrist, w.nodes.lead, ...w.nodes.mids, ...w.nodes.tips]) wingNode.add(i);
  const { owner } = buildRig(d.graph, d.idx, d.phenotype);
  const tubes = tubeStations(d.graph, d.idx.tailTip).filter((t) => !t.ids.some((ids) => ids.some((i) => wingNode.has(i))));
  const field = new TubeField(tubes.map((t) => ({ c: t.stations.map((s) => toMesh(s.c)), r: t.stations.map((s) => s.r) })));
  const restC = Float64Array.from(field.centre);
  const sw = tubes.flatMap((t) => stationWeights(d.graph, d.idx, owner, t));

  const M = (b: number) => bones[b]!.matrixWorld.elements;
  const posed = new Float64Array(3 * verts.length);
  /** Skin vertex `v` (or any rest point) through the current bones: Σ w·S·p. */
  const skin = (x: number, y: number, z: number, list: ArrayLike<number>, wts: ArrayLike<number>, n: number, out: Float64Array, o: number) => {
    let px = 0, py = 0, pz = 0;
    for (let j = 0; j < n; j++) {
      const w = wts[j]!;
      if (w === 0) continue;
      const e = M(list[j]!);
      px += w * (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!);
      py += w * (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!);
      pz += w * (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!);
    }
    out[o] = px; out[o + 1] = py; out[o + 2] = pz;
  };
  const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
  const poseAll = () => {
    for (let s = 0; s < sw.length; s++) {
      const list = sw[s]!;
      for (let j = 0; j < 4; j++) { bi[j] = list[j]?.bone ?? 0; bw[j] = list[j]?.w ?? 0; }
      skin(restC[3 * s]!, restC[3 * s + 1]!, restC[3 * s + 2]!, bi, bw, 4, field.centre, 3 * s);
    }
    field.refresh();
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i]!;
      for (let j = 0; j < 4; j++) { bi[j] = d.skinIndex[4 * v + j]!; bw[j] = d.skinWeight[4 * v + j]!; }
      skin(d.position[3 * v]!, d.position[3 * v + 1]!, d.position[3 * v + 2]!, bi, bw, 4, posed, 3 * i);
    }
  };
  let closest = -1, freeBest = Infinity;
  const bodyMin = () => {
    let best = Infinity;
    freeBest = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const x = posed[3 * i]!, y = posed[3 * i + 1]!, z = posed[3 * i + 2]!;
      if (isFree[i]) { const f = field.distance(x, y, z, freeBest); if (f < freeBest) freeBest = f; }
      const d2 = field.distance(x, y, z, best);
      if (d2 < best) { best = d2; closest = verts[i]!; }
    }
    return best;
  };

  // Rest.
  flight.pose(0, 0, 0);
  poseAll();
  const restClearance = bodyMin();
  const freeRest = freeBest;

  const inv = new THREE.Matrix4();
  const p3 = new THREE.Vector3(), q3 = new THREE.Vector3();
  const W = new THREE.Vector3(), n = new THREE.Vector3(), dl = new THREE.Vector3(), dv = new THREE.Vector3(), cr = new THREE.Vector3();
  const V = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const wings = rig.wings.map((w, i) => ({
    w, i, wrist: V(w.wrist), lead: V(w.lead), mids: w.mids.map(V), tips: w.tips.map(V),
    halfSpan: Math.abs(w.lead[2]), tipLo: Infinity, tipHi: -Infinity, restSign: 0,
  }));
  const angle = (finger: number, rest: THREE.Vector3): number => {
    dv.copy(rest).applyMatrix4(bones[finger]!.matrixWorld).sub(W).projectOnPlane(n);
    return Math.atan2(cr.crossVectors(dl, dv).dot(n), dl.dot(dv));
  };
  const order = (wing: (typeof wings)[number]): number => {
    // Posed wrist, plane normal and leading digit; then each finger's mid and tip angle about it.
    const hand = wing.w.hand;
    W.copy(wing.wrist).applyMatrix4(bones[hand]!.matrixWorld);
    n.copy(flight.normal(wing.i)).transformDirection(bones[hand]!.matrixWorld);
    dl.copy(wing.lead).applyMatrix4(bones[hand]!.matrixWorld).sub(W).projectOnPlane(n);
    let gap = Infinity;
    for (const pts of [wing.mids, wing.tips]) {
      let prev = 0;
      pts.forEach((rest, k) => {
        const a = angle(wing.w.fingers[k]!, rest);
        if (wing.restSign === 0) wing.restSign = Math.sign(a) || 1;
        gap = Math.min(gap, wing.restSign * (a - prev));
        prev = a;
      });
    }
    return gap;
  };
  for (const wing of wings) order(wing); // fixes each wing's rest direction (at rest, pose above)

  let free = { min: Infinity, restMin: freeRest, at: samples[0]! };
  let body = { min: Infinity, at: samples[0]!, vertex: -1 }, pair = { min: Infinity, at: samples[0]! }, mid = { min: Infinity, at: samples[0]! };
  let fing = { minGapDeg: Infinity, crossings: 0, at: samples[0]! };
  const perSample: number[] = [];
  const candL: number[] = [], candR: number[] = [];
  for (const s of samples) {
    flight.pose(s.t, s.flap, s.glide);
    poseAll();
    const b = bodyMin();
    perSample.push(b);
    if (b < body.min) body = { min: b, at: s, vertex: closest };
    if (freeBest < free.min) free = { ...free, min: freeBest, at: s };
    // The midplane in the body's frame: undo the pelvis's (rigid, in flight) motion.
    inv.copy(bones[0]!.matrixWorld).invert();
    candL.length = 0; candR.length = 0;
    let minL = Infinity, minR = Infinity;
    for (let i = 0; i < verts.length; i++) {
      p3.set(posed[3 * i]!, posed[3 * i + 1]!, posed[3 * i + 2]!).applyMatrix4(inv);
      // The left wing lies at z < 0 in the mesh frame.
      const lateral = side[i] === 0 ? -p3.z : p3.z;
      if (side[i] === 0) minL = Math.min(minL, lateral); else minR = Math.min(minR, lateral);
      if (lateral < WING_PAIR_RANGE) (side[i] === 0 ? candL : candR).push(i);
    }
    const gap = minL + minR;
    if (gap < mid.min) mid = { min: gap, at: s };
    let dmin: number = WING_PAIR_RANGE;
    for (const i of candL) {
      p3.set(posed[3 * i]!, posed[3 * i + 1]!, posed[3 * i + 2]!);
      for (const j of candR) {
        q3.set(posed[3 * j]!, posed[3 * j + 1]!, posed[3 * j + 2]!);
        dmin = Math.min(dmin, p3.distanceTo(q3));
      }
    }
    if (dmin < pair.min) pair = { min: dmin, at: s };
    for (const wing of wings) {
      const g = order(wing);
      if (g <= 0) fing.crossings++;
      const deg = (g * 180) / Math.PI;
      if (deg < fing.minGapDeg) fing = { ...fing, minGapDeg: deg, at: s };
      if (s.kind === 'flap') {
        const y = q3.copy(wing.lead).applyMatrix4(bones[wing.w.hand]!.matrixWorld).y;
        wing.tipLo = Math.min(wing.tipLo, y);
        wing.tipHi = Math.max(wing.tipHi, y);
      }
    }
  }
  flight.pose(0, 0, 0);
  return {
    samples: samples.length, wingVerts: verts.length, junctionVerts: isFree.filter((f) => !f).length, restClearance, free,
    body: { ...body, rest: [0, 1, 2].map((c) => d.position[3 * body.vertex + c]!), perSample },
    wingToWing: { ...pair, exactBelow: WING_PAIR_RANGE },
    midplaneGap: mid,
    fingers: fing,
    tips: wings.map((w) => ({ travel: w.tipHi - w.tipLo, halfSpan: w.halfSpan, ratio: (w.tipHi - w.tipLo) / w.halfSpan })),
  };
}
