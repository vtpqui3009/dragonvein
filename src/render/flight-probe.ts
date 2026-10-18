import * as THREE from 'three';
import type { Phenotype } from '../core/genome';
import { TubeField } from '../assets/dragon/clearance';
import type { FlightParams } from '../assets/dragon/flight';
import type { Anchors, Graph } from '../assets/dragon/graph';
import { buildRig, stationWeights, type Rig } from '../assets/dragon/rig';
import { tubeStations } from '../assets/dragon/skin';
import type { DragonFlight } from './flight';
// Both live in src/render/, so this import is inside one layer: docs/ARCHITECTURE.md §Ownership
// lets `render` import `core`, `assets` and `three`, and tools/check-layers.mjs only forbids
// render → sim/ui/audio/content. Nothing here reaches outside the layer.
import { ATTITUDES, LOOK_MAX, type AttitudeChannels, type DragonAttitude } from './wild';

/**
 * Measures a *posed* dragon against itself: it poses the skeleton through a schedule of samples
 * and, at each, skins its wing vertices on the CPU exactly as the shader does (Σ wᵢ·Sᵢ·p over
 * the bones' skinning matrices) and measures how close the wings come to the body, to each
 * other and to crossing their own fingers.
 *
 * Two schedules feed it, and they cover two different kinds of motion:
 *
 * - **the flap** (M7c criterion 3, `flightSamples`): the wings' own beat, glide, the ramps in
 *   and the crossfade between them, over the walk at rest. This is what the probe was built
 *   for, and the wingtip-travel and airborne-feet numbers below are only about it;
 * - **the attitude** (M8b criterion 1, `attitudeSamples`): how the wild dragon holds itself —
 *   ./wild.ts `DragonAttitude` on top of the walk, a raised neck, a crouch, a tail tucked
 *   under, the head turned back over the shoulder — at rest and while walking, with and
 *   without a flap riding over it. An alert rear-up is not a flap: it moves the *body* under
 *   wings that are folded against it, which is the other way a wing ends up inside a flank,
 *   and until M8b the probe did not pose the attitude layer at all. The amplitudes of those
 *   tells are meant to grow (docs/DECISIONS.md §"M8b criterion 6: amplify the tells, and add
 *   the keeper marker"), so the gate covers the poses first and the amplitudes move after.
 *
 * What it measures, at every sample of either schedule:
 *
 *
 * - **body clearance**: the least signed distance from any deformed wing vertex to the body's
 *   own swept tubes (torso, neck, head, tail, legs and the crown: every tube that is not a
 *   wing's), carried by the same posed skeleton (src/assets/dragon/clearance.ts). A *wing
 *   vertex* is any vertex with weight on a wing bone; the skin weights hand every vertex on or
 *   inside the body to the body (rig.ts WING_JUNCTION), so all of them start outside it. The
 *   least clearance is reported over them all, and again split in two — the *free wing* (the
 *   vertices wholly on wing bones, beyond the junction band) and the *junction band* itself
 *   (the wing-root skin rig.ts WING_JUNCTION blends onto the flank) — each with its rest value.
 *   The split is the point: the band lies *on* the body's surface by construction, within 0.001
 *   to 0.045 of the tubes before anything moves, so the minimum over all vertices is nearly
 *   always the band's and says nothing about the wing. A free-wing vertex entering the body is a
 *   wing through a flank; a band vertex a thousandth inside the tube it is wrapped around is the
 *   band being what it is. Two numbers, two defects, read separately;
 * - **wing to wing**: the least distance between a left-wing vertex and a right-wing one
 *   (exact below WING_PAIR_RANGE, else reported as at least that), and the gap across the
 *   body's midplane between the two wings (a positive gap separates every face of one wing
 *   from every face of the other, not only their vertices);
 * - **finger order**: about each wing's posed plane normal, the angles of the leading digit,
 *   each finger's mid and tip from the wrist must keep their rest order, strictly; the least
 *   neighbour gap is reported in degrees and any crossing counted;
 * - **wingtip travel**: the leading tip's height range over the full-weight flap samples
 *   against the half-span (the leading tip's rest distance from the midline). Flap samples
 *   only: a tip that does not move over an attitude pose is a tip held still, not a defect.
 */

/**
 * One pose to measure. `t`, `flap` and `glide` are the flight's (src/render/flight.ts `set`).
 *
 * A sample that names a `state` is an attitude sample: the probe hangs the caller's
 * `DragonAttitude` on the walk, puts it at this pose, and poses the walk at `walkT` (null at
 * rest) with weight `walkW` under it, with the flight's weights on top. A sample with no
 * `state` is the flap case the probe has always measured, posed by `flight.pose(t, flap, glide)`
 * with no attitude layer at all — byte for byte what it was before M8b.
 */
export interface FlightSample {
  t: number; flap: number; glide: number;
  kind: 'flap' | 'glide' | 'ramp' | 'cross' | 'attitude';
  /** Attitude samples: the name this sample reports as — a state in `ATTITUDES`, or a corner's label. */
  state?: string;
  /** Attitude samples: the keeper's bearing off the snout, radians, handed to `setTargets`. */
  look?: number;
  /** Attitude samples: the channels set directly (`setRaw`), for a pose no named state holds. */
  raw?: AttitudeChannels;
  /** Attitude samples: the walk clock to pose under the attitude, null for the walk at rest. */
  walkT?: number | null;
  /** Attitude samples: the walk's weight, 0 standing still, 1 walking. */
  walkW?: number;
}

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

/**
 * The attitude channels whose corners are measured **exhaustively**: every one of the 2⁵
 * combinations of their per-state minima and maxima. These are the channels that move geometry
 * toward other geometry — the crouch, the wing fold, the wing lift, the rear-up, and the neck
 * raise, which is the channel the M8b baseline showed drives the least clearance on 25 of 34
 * dragons. `look` is not among them because it is swept separately, at ±LOOK_MAX and 0, over
 * every pose below: its reachable range is the same whatever the other channels are doing.
 */
const GEOM_CHANNELS = ['neck', 'lower', 'fold', 'rise', 'rear'] as const;
/**
 * The channels whose corners are **sampled** rather than enumerated: the head's nod and the
 * tail's curl. Eight channels is 256 corners before the look sweep and the gait phases, which is
 * minutes of unit test for poses that differ by a nod. These two are taken at both extremes
 * together (all-minimum and all-maximum), which is where their own geometry is furthest from the
 * body — a head tipped up over a raised neck, and a tail curled under a crouch — rather than at
 * every mixture. If a defect is ever found at a mixture of these two, enumerate them here.
 */
const SAMPLED_CHANNELS = ['head', 'tail'] as const;
type Channel = (typeof GEOM_CHANNELS)[number] | (typeof SAMPLED_CHANNELS)[number];
const CHANNELS = [...GEOM_CHANNELS, ...SAMPLED_CHANNELS] as readonly Channel[];

/**
 * The gait phases an attitude is measured over while walking, as fractions of the walk's period.
 * A quarter and three quarters put the girdles at opposite ends of their swing and the body at
 * opposite ends of its roll, which is the pair that moves a flank furthest under a folded wing;
 * a footfall (phase 0, ½) is the walk's own extreme in pitch and is already covered at rest,
 * where `walkW` 0 holds the body still and the attitude alone moves it.
 */
const GAIT = [0.25, 0.75] as const;

/**
 * The attitude schedule (M8b criterion 1): the poses ./wild.ts `DragonAttitude` can reach, each
 * posed over the walk, so the clearance gate sees a crouch and a rear-up and not only a flap.
 *
 * It is deliberately wider than the six named states. `DragonAttitude.update` eases every
 * channel with its own rate (`RATE`), so during a change of state the channels are *not* at one
 * state's values together: for the second or so a transition takes, the pose is some mixture,
 * and over a session every mixture inside the box spanned by the channels' per-state minima and
 * maxima is reachable. The corners of that box are the poses no named state visits and the ones
 * a gate on the named states alone would miss, so they are measured too — by setting the
 * channels directly through `setRaw`, which is what that probe-only method exists for.
 *
 * The schedule, for `look` at −LOOK_MAX, 0 and +LOOK_MAX (the keeper to either side and dead
 * ahead, which is the channel that turns the head back over the shoulder):
 *
 * - every named state in `ATTITUDES`, snapped, over the walk at rest;
 * - every corner of the per-channel box, over the walk at rest;
 * - walking (`walkW` 1): every named state with the keeper to one side at both gait phases of
 *   `GAIT`, and every box corner with the keeper ahead at the first of them — `wary` walks off
 *   while crouched, so the crouch has to be measured in motion and not only standing;
 * - a handful with a flap riding over the attitude, because `flee`'s ramp starts while the
 *   previous state's ease is still running: the wings are already beating while the body is
 *   still crouched or reared.
 *
 * That is 18 + 192 + 12 + 64 + 8 = 294 samples per dragon, two and a half times the schedule
 * M8b's first pass measured, because `fold`, `rise` and `rear` added three dimensions to the
 * box. `GEOM_CHANNELS` and `SAMPLED_CHANNELS` say which corners are enumerated and which are
 * sampled, and why.
 */
export function attitudeSamples(p: FlightParams, walkPeriod: number): FlightSample[] {
  const out: FlightSample[] = [];
  const looks = [-LOOK_MAX, 0, LOOK_MAX];
  // A flapping sample is taken partway into the downstroke, where the wing is nearest the flank.
  const flapT = p.period * 0.35;
  const named = (state: string, look: number, walkT: number | null, walkW: number, flap = 0) =>
    out.push({ t: flap > 0 ? flapT : 0, flap, glide: 0, kind: 'attitude', state, look, walkT, walkW });
  const corner = (c: { label: string; raw: AttitudeChannels }, look: number, walkT: number | null, walkW: number, flap = 0) =>
    out.push({
      t: flap > 0 ? flapT : 0, flap, glide: 0, kind: 'attitude',
      state: c.label, look, raw: { ...c.raw, look }, walkT, walkW,
    });

  // The per-channel box over every named state, and its corners.
  const lo = {} as Record<Channel, number>, hi = {} as Record<Channel, number>;
  for (const c of CHANNELS) { lo[c] = Infinity; hi[c] = -Infinity; }
  for (const a of Object.values(ATTITUDES)) {
    for (const c of CHANNELS) { lo[c] = Math.min(lo[c], a[c]); hi[c] = Math.max(hi[c], a[c]); }
  }
  const corners: { label: string; raw: AttitudeChannels }[] = [];
  for (let mask = 0; mask < 1 << GEOM_CHANNELS.length; mask++) {
    // The sampled channels take both extremes together, the geometry channels every corner.
    for (const rest of [false, true]) {
      const raw: AttitudeChannels = { look: 0, neck: 0, head: 0, lower: 0, tail: 0, fold: 0, rise: 0, rear: 0 };
      const parts: string[] = [];
      GEOM_CHANNELS.forEach((c, k) => {
        const up = ((mask >> k) & 1) === 1;
        raw[c] = up ? hi[c] : lo[c];
        parts.push(`${c}${up ? '+' : '−'}`);
      });
      for (const c of SAMPLED_CHANNELS) { raw[c] = rest ? hi[c] : lo[c]; parts.push(`${c}${rest ? '+' : '−'}`); }
      corners.push({ label: `corner ${parts.join(' ')}`, raw });
    }
  }

  const states = Object.keys(ATTITUDES);
  for (const look of looks) {
    for (const s of states) named(s, look, null, 0);
    for (const c of corners) corner(c, look, null, 0);
  }
  for (const phase of GAIT) {
    const walkT = walkPeriod * phase;
    for (const s of states) named(s, LOOK_MAX, walkT, 1);
  }
  // The corners walk at one phase, not both: 64 corners × every phase × every look is minutes
  // of test for poses a quarter cycle apart. The named states, which are what a player sees,
  // walk at both.
  for (const c of corners) corner(c, 0, walkPeriod * GAIT[0], 1);
  // The overlap: wings beating while the body is still in the state it is leaving.
  for (const flap of [0.35, 0.8]) {
    named('alert', LOOK_MAX, null, 0, flap);
    named('wary', LOOK_MAX, null, 0, flap);
    named('wary', LOOK_MAX, walkPeriod * GAIT[0], 1, flap);
  }
  corner(corners[0]!, -LOOK_MAX, null, 0, 0.6); // every channel at its minimum
  corner(corners[corners.length - 1]!, -LOOK_MAX, null, 0, 0.6); // and at its maximum
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
  /**
   * The same, over the junction band only: the vertices with part of their weight on the body
   * (rig.ts WING_JUNCTION), which lie on the flank by construction. `body.min` is the lesser of
   * this and `free.min`; this is the one that moves when the body moves under a folded wing.
   */
  junction: { min: number; restMin: number; at: FlightSample };
  wingToWing: { min: number; exactBelow: number; at: FlightSample };
  midplaneGap: { min: number; at: FlightSample };
  fingers: { minGapDeg: number; crossings: number; at: FlightSample };
  /** Per wing (left, right): the leading tip's height range over the flap samples, the half-span, and their ratio. */
  tips: { travel: number; halfSpan: number; ratio: number }[];
  /**
   * Off the ground, over the full-weight flap and glide samples: the lowest foot (each leg's ball
   * node) above the ground (y = 0), against the lowest at rest; and the tuck, each leg's hip to
   * ankle distance as a share of its rest length (the largest, the least tucked).
   */
  airborne: { footMin: number; footRest: number; legSpanMax: number; legSpanMin: number };
}

/** The dragon a probe measures: its mesh arrays (mesh frame), the graph it was built from, and its genes. */
export interface ProbeDragon {
  position: ArrayLike<number>; skinIndex: ArrayLike<number>; skinWeight: ArrayLike<number>;
  rig: Rig; graph: Graph; idx: Anchors; phenotype: Phenotype;
}

const toMesh = (c: readonly number[]): [number, number, number] => [c[0]!, c[2]!, -c[1]!];

/**
 * Measure `samples` on `d`. `attitude` is the layer an attitude sample is posed through
 * (./wild.ts); pass null, as every flap-only caller does, and nothing about the measurement
 * changes — a sample with no `state` takes the same `flight.pose` path it always took.
 *
 * The probe owns `walk.attitude` while it runs: it hangs `attitude` on the walk for an attitude
 * sample, takes it off again for a flap one and for the rest pose every number is referenced to,
 * and puts back whatever the caller had on entry before it returns. So a caller that drives a
 * live dragon can probe it without its pose leaking into the measurement or the measurement's
 * into its pose.
 */
export function probeFlight(d: ProbeDragon, flight: DragonFlight, samples: FlightSample[], attitude: DragonAttitude | null = null): FlightProbe {
  const { rig } = d;
  const walk = flight.walk;
  const attitudeOnEntry = walk.attitude;
  const bones = flight.walk.bones;
  /**
   * Pose one sample. An attitude sample snaps the layer to its pose (`setRaw` for a box corner,
   * `setTargets` for a named state) and poses the walk under it with the flight's weights on
   * top; anything else is the flap path, with no attitude layer at all.
   */
  const poseSample = (s: FlightSample) => {
    if (s.state === undefined) {
      walk.attitude = null;
      flight.pose(s.t, s.flap, s.glide);
      return;
    }
    if (attitude === null) throw new Error(`probeFlight: sample "${s.state}" needs an attitude layer, none was given`);
    flight.set(s.t, s.flap, s.glide);
    walk.attitude = attitude;
    if (s.raw !== undefined) attitude.setRaw(s.raw);
    else { attitude.setTargets(s.state, s.look ?? 0); attitude.snap(); }
    walk.pose(s.walkT ?? null, s.walkW ?? 0);
  };
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
  let closest = -1, freeBest = Infinity, juncBest = Infinity;
  const bodyMin = () => {
    let best = Infinity;
    freeBest = Infinity;
    juncBest = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const x = posed[3 * i]!, y = posed[3 * i + 1]!, z = posed[3 * i + 2]!;
      if (isFree[i]) { const f = field.distance(x, y, z, freeBest); if (f < freeBest) freeBest = f; }
      else { const j = field.distance(x, y, z, juncBest); if (j < juncBest) juncBest = j; }
      const d2 = field.distance(x, y, z, best);
      if (d2 < best) { best = d2; closest = verts[i]!; }
    }
    return best;
  };

  // Rest: the walk still, the flight at weight 0 and no attitude, whatever the caller was doing.
  walk.attitude = null;
  flight.pose(0, 0, 0);
  poseAll();
  const restClearance = bodyMin();
  const freeRest = freeBest, juncRest = juncBest;

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
  const legs = rig.legs.map((l) => ({ l, hip: V(l.hip), ankle: V(l.ankle), ball: V(l.ball), len: V(l.hip).distanceTo(V(l.ankle)) }));
  const footRest = Math.min(...legs.map((g) => g.ball.y));
  const air = { footMin: Infinity, footRest, legSpanMax: -Infinity, legSpanMin: Infinity };

  let free = { min: Infinity, restMin: freeRest, at: samples[0]! };
  let junction = { min: Infinity, restMin: juncRest, at: samples[0]! };
  let body = { min: Infinity, at: samples[0]!, vertex: -1 }, pair = { min: Infinity, at: samples[0]! }, mid = { min: Infinity, at: samples[0]! };
  let fing = { minGapDeg: Infinity, crossings: 0, at: samples[0]! };
  const perSample: number[] = [];
  const candL: number[] = [], candR: number[] = [];
  for (const s of samples) {
    poseSample(s);
    poseAll();
    const b = bodyMin();
    perSample.push(b);
    if (b < body.min) body = { min: b, at: s, vertex: closest };
    if (freeBest < free.min) free = { ...free, min: freeBest, at: s };
    if (juncBest < junction.min) junction = { ...junction, min: juncBest, at: s };
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
    if ((s.kind === 'flap' && s.flap === 1) || (s.kind === 'glide' && s.glide === 1)) {
      for (const g of legs) {
        air.footMin = Math.min(air.footMin, p3.copy(g.ball).applyMatrix4(bones[g.l.foot]!.matrixWorld).y);
        const span = p3.copy(g.ankle).applyMatrix4(bones[g.l.foot]!.matrixWorld)
          .distanceTo(q3.copy(g.hip).applyMatrix4(bones[g.l.thigh]!.matrixWorld)) / g.len;
        air.legSpanMax = Math.max(air.legSpanMax, span);
        air.legSpanMin = Math.min(air.legSpanMin, span);
      }
    }
    for (const wing of wings) {
      const g = order(wing);
      if (g <= 0) fing.crossings++;
      const deg = (g * 180) / Math.PI;
      if (deg < fing.minGapDeg) fing = { ...fing, minGapDeg: deg, at: s };
      if (s.kind === 'flap') {
        const y = p3.copy(wing.lead).applyMatrix4(bones[wing.w.hand]!.matrixWorld).y;
        wing.tipLo = Math.min(wing.tipLo, y);
        wing.tipHi = Math.max(wing.tipHi, y);
      }
    }
  }
  // Leave it at rest, and leave the walk's attitude as the caller had it.
  walk.attitude = null;
  flight.pose(0, 0, 0);
  walk.attitude = attitudeOnEntry;
  return {
    airborne: air,
    samples: samples.length, wingVerts: verts.length, junctionVerts: isFree.filter((f) => !f).length, restClearance, free, junction,
    body: { ...body, rest: [0, 1, 2].map((c) => d.position[3 * body.vertex + c]!), perSample },
    wingToWing: { ...pair, exactBelow: WING_PAIR_RANGE },
    midplaneGap: mid,
    fingers: fing,
    tips: wings.map((w) => ({ travel: w.tipHi - w.tipLo, halfSpan: w.halfSpan, ratio: (w.tipHi - w.tipLo) / w.halfSpan })),
  };
}
