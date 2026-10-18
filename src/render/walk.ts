import * as THREE from 'three';
import { BODY_BONES, BONE, type Rig } from '../assets/dragon/rig';
import type { WalkParams } from '../assets/dragon/walk';

/**
 * The dragon's walk (M7b) on the CPU: poses a skeleton built from the dragon's own skin
 * graph (src/assets/dragon/rig.ts) so its mesh, a `SkinnedMesh`, walks with planted feet.
 *
 * **The skeleton is in the mesh's own frame.** Every bone's rest transform is the identity,
 * so its skinning matrix is simply "rest point → posed point", which this class writes
 * straight into `bone.matrixWorld`. Bind the mesh with `bindSkinned`: detached, with an
 * identity bind matrix and identity inverses, so the shader's skinned position is
 * Σ wᵢ·Sᵢ·p and the mesh's own transform does the rest. At rest (`pose(null)`) every Sᵢ is
 * the identity and the skinned mesh is the static one.
 *
 * **One cycle**, with t in seconds, c = t / period and the travel X = stride · c along +x
 * (the caller moves the mesh by `travel`):
 * - each foot's phase is φ = frac(c − its touchdown); it is planted while φ < duty, its ball
 *   held at the point the mid-stance pose puts it in the world, so in the mesh frame it runs
 *   from +duty·stride/2 to −duty·stride/2 of its rest place at the body's speed: still in
 *   the world. Then it swings forward on a cycloid (zero speed at both ends) to its next
 *   footfall, one stride on, lifted `lift` at mid-swing;
 * - each leg is a two-bone analytic IK: the hip joint (graph node n1) is carried by the
 *   body, the ankle (n3) goes to its target, and the knee (n2) bends in the plane the rest
 *   pose bends in (its offset from the hip-ankle line, carried by the body). The foot keeps
 *   its rest orientation, so a planted foot and its toes do not move at all;
 * - the hips and shoulders swing side to side, each toward its own swinging leg (`flex`),
 *   the spine between them bending to join them; the neck turns back against the shoulders
 *   so the head holds its line; the tail's three segments sway in a wave that travels down
 *   it; the body sinks (`crouch`) and bobs twice a cycle, and the hips and shoulders roll
 *   onto the side whose legs carry them (ROLL of `flex`); the wings ride the shoulders.
 *
 * **Walk weight.** `pose(t, w)` scales everything above (body motion, and each foot's offset
 * from its rest place) by w ∈ [0, 1]: w = 0 is the rest pose, w = 1 the walk. A caller eases
 * w over a fraction of a second to start and stop without a snap, and moves the mesh by
 * ∫ w · speed dt. At w = 1 a planted foot is still in the world; while w ramps it is not
 * exactly, which is the price of a cheap start.
 *
 * **Flight (M7c).** A `FlightLayer` (src/render/flight.ts) can ride on top: while it is
 * active it writes the wing chains' local rotations, tucks the feet (their IK targets rise and
 * move back), and moves the whole posed skeleton rigidly (heave, bank, altitude). With no layer,
 * or one at weight 0, the pose is the walk's alone, and the wing chains ride the shoulders.
 *
 * **Attitude (M8b).** An `AttitudeLayer` (src/render/wild.ts) can ride on top of both: it turns
 * the body's own bones in `locals`, and it has two channels this file has to act on itself
 * because they happen *before* the forward kinematics and the legs' IK — `lower`, which sinks
 * the body so the knees bend under it, and `rear`, which pitches the body nose-up about the
 * pelvis, sinks the hips onto the haunches (REAR_SINK), lifts the tail out of the turn
 * (REAR_TAIL_LIFT) and hands the forefeet a target that rises with the shoulders they hang
 * from. A pose multiplied onto the legs after they were solved would simply drag them through
 * the deck.
 *
 * Nothing allocates per pose: every vector, quaternion and matrix is preallocated here.
 */
const TWO_PI = Math.PI * 2;
/** The neck turns back this share of the shoulders' swing, so the head holds its line. */
const NECK_COUNTER = 0.8;
/** The tail's sway lags this far (radians of the cycle) per segment down the tail. */
const TAIL_LAG = 0.9;
/** The IK keeps the leg this far short of straight (a share of its length), so the knee never locks. */
const REACH = 0.999;
/** The hips and shoulders roll this share of `flex` onto their stance side. */
const ROLL = 0.6;
const X = new THREE.Vector3(1, 0, 0);

const NECK = [BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3] as const;
const TAIL = [BONE.tail0, BONE.tail1, BONE.tail2] as const;
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/**
 * How the dragon holds itself, on top of the walk and any flight (M8b, ./wild.ts
 * `DragonAttitude`): turns of the neck, head and tail, and a lowered stance. The legs' IK
 * keeps the feet where they are, so lowering the body bends the knees.
 */
export interface AttitudeLayer {
  /** Multiply its local turns into the body's bones (after the walk's and the flight's). */
  locals(local: THREE.Quaternion[]): void;
  /** How far the body sinks, as a share of the shortest leg's drop, 0..1. */
  readonly lower: number;
  /**
   * How far the dragon rears up, 0..1 of REAR_PITCH: the body pitches nose-up about the
   * pelvis, the **hind feet stay where they are** (their IK re-solves against the pitched
   * hips, so they keep their hold on the deck) and the **forefeet rise with the shoulders**
   * they hang from. It is a layer's channel rather than a rotation it writes in `locals`
   * because the pitch has to be in the pelvis *before* the forward kinematics and the legs'
   * IK, not multiplied onto a pose the legs have already been solved for.
   */
  readonly rear: number;
}

/** A pose added on top of the walk (src/render/flight.ts `DragonFlight`). */
export interface FlightLayer {
  /** Whether it moves anything: false at weight 0, and then the walk poses alone. */
  readonly active: boolean;
  /**
   * Add its local rotations: the wing chains' (each the identity on entry) and any turn of the
   * body's own bones on top of the walk's (the neck stretching forward).
   */
  locals(local: THREE.Quaternion[]): void;
  /** How far the feet tuck, 0..1. */
  readonly tuck: number;
  /** The rigid motion of the whole skeleton after the walk: `rootQ` about `rootPivot`, then up by `rootLift`. */
  readonly rootQ: THREE.Quaternion;
  readonly rootPivot: THREE.Vector3;
  readonly rootLift: number;
}
/**
 * A tucked foot's ankle rises this share of the shortest leg's drop, and moves back TUCK_BACK of
 * it: the legs fold up under the body in flight (M7c cycle 1, gameplay D5).
 */
export const TUCK = 0.62;
export const TUCK_BACK = 0.30;
/**
 * A full rear-up (`AttitudeLayer.rear` = 1) pitches the body this far nose-up about the pelvis,
 * radians: 0.35 is 20°, which is what the owner's note asks for and about as far as a quadruped
 * leans back before it is standing rather than rearing. It is a pitch of the *body*, so the
 * wings and
 * the neck ride it rigidly and the clearance between a folded wing and the flank does not change
 * at all (measured: the rear-up is the one tell that costs the clearance gate nothing) — what
 * changes is the silhouette, which is the whole point (M8b criterion 2). What it does cost is
 * the legs and the tail: see REAR_SINK and REAR_TAIL_LIFT below.
 */
export const REAR_PITCH = 0.35;
/**
 * A reared forefoot does not just hang: it curls up and back under the chest by this share of
 * the shortest leg's drop, the way a tucked foot does in flight, so the forelimb reads as held
 * rather than dangling. Shortening the hip-to-ankle distance can only bend the knee further,
 * never stretch it, which is why the share may be chosen for looks.
 */
export const REAR_FORE_CURL = 0.34;
export const REAR_FORE_BACK = 0.22;
/**
 * A rearing dragon sits back on its haunches: the hips sink this share of the shortest leg's
 * drop at full rear, on top of whatever the attitude's `lower` asks for. It is not decoration.
 * The pitch is about the pelvis, so it carries the hind hips up and back away from hind feet
 * that are holding their place on the deck; without the sink the two-bone IK is asked for more
 * than the leg has and `stretched` goes true, which is the leg visibly pulling out of the
 * ground. Measured: at REAR_PITCH and this sink, no leg of any of the 35 probe dragons
 * stretches anywhere in the rear's range (tests/wild-render.test.ts).
 */
export const REAR_SINK = 0.26;
/**
 * A rearing dragon lifts its tail against the pitch, as a counterweight — and it must, because
 * the pitch is about the pelvis and a dragon's tail is long: #31 of the probe set carries its
 * tip 4.9 units behind the hips, so 20° of rigid nose-up would sweep that tip 1.3 units
 * *through the deck*. Each tail segment counter-pitches this share of the body's pitch, spread
 * over the three of them, so the tail curves up out of the turn instead of swinging down with
 * it. 1 holds the tip's rest direction; above 1 lifts it clear. Measured against every probe
 * dragon's own tail length, which is the only honest way to pick it (the longest tail decides).
 */
export const REAR_TAIL_LIFT = 1.45;
/**
 * The forelegs fold this share of the hind legs' tuck: their thighs hang beside the wings' roots,
 * and folded as far they rise into the skin where the wing grows from the shoulder.
 */
export const TUCK_FORE = 0.6;

interface LegState {
  anchor: number; thigh: number; shin: number; foot: number; phase: number;
  hip: THREE.Vector3; knee: THREE.Vector3; ankle: THREE.Vector3; ball: THREE.Vector3; toe: THREE.Vector3;
  l1: number; l2: number;
  /** The rest bend's pole: the knee's offset from the hip-ankle line, unit. */
  pole: THREE.Vector3;
  /** Inverse rest frames (transposed bases) of the thigh and shin. */
  thighRestT: THREE.Matrix4; shinRestT: THREE.Matrix4;
  /** Posed: knee angle (radians), whether planted, whether the IK had to stretch. */
  kneeAngle: number; planted: boolean; stretched: boolean;
}

export class DragonWalk {
  readonly bones: THREE.Bone[] = [];
  readonly skeleton: THREE.Skeleton;
  readonly params: WalkParams;
  /** Distance travelled along the mesh's +x at the last pose, at full weight. */
  travel = 0;
  /** The walk weight of the last pose: 0 rest, 1 walking. */
  weight = 0;
  /** The flight riding on this walk, if any (src/render/flight.ts). */
  flight: FlightLayer | null = null;
  /** The stance and gaze riding on this walk, if any (./wild.ts). */
  attitude: AttitudeLayer | null = null;
  /** How many bones: the body's, then the wing chains. */
  readonly boneCount: number;
  private readonly parent: number[];
  private readonly rest: THREE.Vector3[] = [];
  private readonly R: THREE.Quaternion[] = [];
  private readonly P: THREE.Vector3[] = [];
  private readonly local: THREE.Quaternion[] = [];
  private readonly legs: LegState[] = [];
  /** How far the walk lowers the body at full crouch: the shortest leg's drop. */
  private readonly drop: number;
  // Scratch.
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly k = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();

  constructor(rig: Rig, params: WalkParams) {
    if (rig.parent.length < BODY_BONES) throw new Error(`walk: ${rig.parent.length} bones, expected at least ${BODY_BONES}`);
    this.params = params;
    this.parent = rig.parent;
    this.boneCount = rig.parent.length;
    for (let i = 0; i < this.boneCount; i++) {
      const bone = new THREE.Bone();
      bone.name = rig.names[i]!;
      // Not in the scene graph: the pose writes matrixWorld, nothing else touches it.
      bone.matrixAutoUpdate = false;
      bone.matrixWorldAutoUpdate = false;
      this.bones.push(bone);
      this.rest.push(new THREE.Vector3(rig.pivot[3 * i], rig.pivot[3 * i + 1], rig.pivot[3 * i + 2]));
      this.R.push(new THREE.Quaternion());
      this.P.push(new THREE.Vector3());
      this.local.push(new THREE.Quaternion());
    }
    this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    let drop = Infinity;
    rig.legs.forEach((leg, i) => {
      const V = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
      const hip = V(leg.hip), knee = V(leg.knee), ankle = V(leg.ankle);
      const s: LegState = {
        anchor: leg.anchor, thigh: leg.thigh, shin: leg.shin, foot: leg.foot, phase: params.phase[i]!,
        hip, knee, ankle, ball: V(leg.ball), toe: V(leg.toe),
        l1: knee.distanceTo(hip), l2: ankle.distanceTo(knee),
        pole: new THREE.Vector3(), thighRestT: new THREE.Matrix4(), shinRestT: new THREE.Matrix4(),
        kneeAngle: 0, planted: true, stretched: false,
      };
      const dir = ankle.clone().sub(hip).normalize();
      s.pole.copy(knee).sub(hip).addScaledVector(dir, -knee.clone().sub(hip).dot(dir)).normalize();
      const nrm = knee.clone().sub(hip).cross(ankle.clone().sub(knee)).normalize();
      DragonWalk.frame(knee.clone().sub(hip).normalize(), nrm, s.thighRestT).transpose();
      DragonWalk.frame(ankle.clone().sub(knee).normalize(), nrm, s.shinRestT).transpose();
      s.kneeAngle = hip.clone().sub(knee).angleTo(ankle.clone().sub(knee));
      this.legs.push(s);
      drop = Math.min(drop, this.rest[leg.anchor]!.y - leg.ball[1]);
    });
    this.drop = drop;
  }

  /** The rotation taking (x, y, x × y) to the axes: a frame from a direction and a normal. */
  private static frame(dir: THREE.Vector3, nrm: THREE.Vector3, out: THREE.Matrix4, z = new THREE.Vector3()): THREE.Matrix4 {
    z.crossVectors(dir, nrm);
    return out.makeBasis(dir, nrm, z);
  }

  /**
   * Pose the skeleton at walk time `t` seconds, or at rest for null (every bone the identity,
   * `travel` 0; under an active flight, the walk at rest with the flight on top).
   * Allocation-free.
   */
  pose(t: number | null, weight = 1): void {
    const fl = this.flight !== null && this.flight.active ? this.flight : null;
    const att = this.attitude;
    if (t === null && fl === null && att === null) {
      for (let i = 0; i < this.bones.length; i++) this.bones[i]!.matrixWorld.identity();
      for (let i = 0; i < this.legs.length; i++) { this.legs[i]!.planted = true; this.legs[i]!.stretched = false; }
      this.travel = 0;
      this.weight = 0;
      return;
    }
    const w = this.params;
    const k = t === null ? 0 : Math.min(1, Math.max(0, weight));
    this.weight = k;
    const c = (t ?? 0) / w.period;
    this.travel = t === null ? 0 : w.stride * c;
    // Each girdle swings toward the side whose leg is swinging, at the middle of that swing,
    // and rolls a quarter cycle later.
    const midSwing = (1 + w.duty) / 2;
    const hipA = TWO_PI * (c - w.phase[0] - midSwing), shoulderA = TWO_PI * (c - w.phase[1] - midSwing);
    const hips = -k * w.flex * Math.cos(hipA);
    const shoulders = -k * w.flex * Math.cos(shoulderA);
    const hipRoll = k * ROLL * w.flex * Math.sin(hipA);
    const shoulderRoll = k * ROLL * w.flex * Math.sin(shoulderA);
    const twice = Math.cos(2 * TWO_PI * c); // 1 at each hind footfall
    const pitch = k * w.pitch * twice;
    // The rear-up's pitch goes into the pelvis and is *not* taken back by the spine below (the
    // walk's own pitch is, at spine1), so the whole body above the hips comes up with it.
    const rear = att ? Math.min(1, Math.max(0, att.rear)) : 0;
    const lower = k * (w.crouch * this.drop + w.bob * (0.5 + 0.5 * twice))
      + (att ? (att.lower + REAR_SINK * rear) * this.drop : 0);

    const L = this.local;
    for (let i = 0; i < L.length; i++) L[i]!.identity();
    turn(L[BONE.pelvis]!, hips, pitch + REAR_PITCH * rear, hipRoll, this.q);
    turn(L[BONE.spine1]!, (shoulders - hips) / 2, -pitch, -hipRoll, this.q);
    turn(L[BONE.spine2]!, (shoulders - hips) / 2, 0, shoulderRoll, this.q);
    for (let i = 0; i < NECK.length; i++) turn(L[NECK[i]!]!, (-NECK_COUNTER * shoulders) / NECK.length, 0, -shoulderRoll / NECK.length, this.q);
    const tailLift = -(REAR_PITCH * rear * REAR_TAIL_LIFT) / TAIL.length;
    for (let i = 0; i < TAIL.length; i++) {
      turn(L[TAIL[i]!]!, k * w.tailSway * Math.sin(hipA - TAIL_LAG * (i + 1)), tailLift, 0, this.q);
    }
    if (fl) fl.locals(L);
    if (att) att.locals(L);

    // Forward kinematics for the body: every bone but the legs' (whose parents come first).
    const R = this.R, P = this.P, rest = this.rest, par = this.parent, n = this.boneCount;
    for (let i = 0; i < n; i++) {
      if (i >= BONE.leg0 && i < BONE.wingL) continue;
      const p = par[i]!;
      if (p < 0) {
        R[i]!.copy(L[i]!);
        P[i]!.copy(rest[i]!);
        P[i]!.y -= lower;
      } else {
        R[i]!.multiplyQuaternions(R[p]!, L[i]!);
        P[i]!.subVectors(rest[i]!, rest[p]!).applyQuaternion(R[p]!).add(P[p]!);
      }
    }
    const tuck = fl ? fl.tuck : 0;
    for (let i = 0; i < this.legs.length; i++) this.solveLeg(this.legs[i]!, c, k, tuck, rear);
    if (fl) {
      // The flight's rigid motion: every bone turned about the pivot, then lifted.
      const q = fl.rootQ, o = fl.rootPivot;
      for (let i = 0; i < n; i++) {
        R[i]!.premultiply(q);
        P[i]!.sub(o).applyQuaternion(q).add(o);
        P[i]!.y += fl.rootLift;
      }
    }
    for (let i = 0; i < n; i++) {
      const mw = this.bones[i]!.matrixWorld;
      mw.makeRotationFromQuaternion(R[i]!);
      this.v.copy(rest[i]!).applyQuaternion(R[i]!);
      const e = mw.elements;
      e[12] = P[i]!.x - this.v.x;
      e[13] = P[i]!.y - this.v.y;
      e[14] = P[i]!.z - this.v.z;
    }
  }

  /** One leg: the foot's target this phase, then the two-bone IK from the hip joint to the ankle. */
  private solveLeg(s: LegState, c: number, k: number, tuck: number, rear: number): void {
    const w = this.params, R = this.R, P = this.P;
    const ph = c - s.phase;
    const phi = ph - Math.floor(ph);
    let dx: number, lift = 0;
    if (phi < w.duty) {
      dx = w.stride * (w.duty / 2 - phi);
      s.planted = true;
    } else {
      const u = (phi - w.duty) / (1 - w.duty);
      dx = w.stride * (w.duty / 2 - phi + u - Math.sin(TWO_PI * u) / TWO_PI);
      lift = w.lift * 0.5 * (1 - Math.cos(TWO_PI * u));
      s.planted = false;
    }
    // The hip joint, carried by the body.
    const a = s.anchor;
    const H = P[s.thigh]!.subVectors(s.hip, this.rest[a]!).applyQuaternion(R[a]!).add(P[a]!);
    // The foot keeps its rest orientation: the ankle sits where it does over the ball at rest.
    const T = this.t.copy(s.ankle);
    const fold = tuck * (s.anchor === BONE.pelvis ? 1 : TUCK_FORE) * this.drop;
    T.x += k * dx - TUCK_BACK * fold;
    T.y += k * lift + TUCK * fold;
    if (rear > 0 && s.anchor !== BONE.pelvis) {
      // A foreleg of a rearing dragon leaves the deck. Its ankle target eases from where it
      // stands to where its own rest pose puts it under the *pitched* shoulder — measured off
      // the posed hip, so the leg keeps its rest length exactly and the IK can never be asked
      // to stretch however far the body pitches — and then curls up and back under the chest.
      const rest = this.n.subVectors(s.ankle, s.hip).applyQuaternion(R[a]!).add(H);
      T.lerp(rest, rear);
      T.x -= rear * REAR_FORE_BACK * this.drop;
      T.y += rear * REAR_FORE_CURL * this.drop;
      s.planted = false; // it is off the deck, whatever the gait's phase says

    }
    const D = this.d.subVectors(T, H);
    let dist = D.length();
    const max = (s.l1 + s.l2) * REACH, min = Math.abs(s.l1 - s.l2) + 1e-4;
    s.stretched = dist > max || dist < min;
    dist = Math.min(max, Math.max(min, dist));
    D.normalize();
    // The bend plane: the rest pole, carried by the body, made square to the hip-ankle line.
    const pole = this.n.copy(s.pole).applyQuaternion(R[a]!);
    pole.addScaledVector(D, -pole.dot(D)).normalize();
    const along = (s.l1 * s.l1 - s.l2 * s.l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, s.l1 * s.l1 - along * along));
    const K = P[s.shin]!.copy(H).addScaledVector(D, along).addScaledVector(pole, h);
    const A = P[s.foot]!.copy(H).addScaledVector(D, dist);
    // Rotations: each bone's rest frame (direction, bend normal) onto its posed one.
    const thighDir = this.v.subVectors(K, H).normalize();
    const shinDir = this.b.subVectors(A, K).normalize();
    const nrm = this.k.crossVectors(thighDir, shinDir).normalize();
    DragonWalk.frame(thighDir, nrm, this.m, this.t).multiply(s.thighRestT);
    R[s.thigh]!.setFromRotationMatrix(this.m);
    DragonWalk.frame(shinDir, nrm, this.m2, this.t).multiply(s.shinRestT);
    R[s.shin]!.setFromRotationMatrix(this.m2);
    R[s.foot]!.identity();
    s.kneeAngle = Math.PI - thighDir.angleTo(shinDir);
  }

  /** Leg `i`'s ball (graph node n4), posed, in the mesh frame. */
  ball(i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.legs[i]!;
    return out.subVectors(s.ball, s.ankle).applyQuaternion(this.R[s.foot]!).add(this.P[s.foot]!);
  }

  /** Leg `i`'s first toe tip, posed, in the mesh frame. */
  toe(i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.legs[i]!;
    return out.subVectors(s.toe, s.ankle).applyQuaternion(this.R[s.foot]!).add(this.P[s.foot]!);
  }

  /** Leg `i` at the last pose: knee angle (radians, π straight), planted, and whether the IK fell short. */
  legState(i: number): { kneeAngle: number; planted: boolean; stretched: boolean } {
    const s = this.legs[i]!;
    return { kneeAngle: s.kneeAngle, planted: s.planted, stretched: s.stretched };
  }

  /** How many legs: 4. */
  get legCount(): number { return this.legs.length; }
}

/** q = yaw about y, then pitch about z, then roll about x, in the parent's frame. Allocation-free. */
function turn(out: THREE.Quaternion, yaw: number, pitch: number, roll: number, tmp: THREE.Quaternion): void {
  out.setFromAxisAngle(Y, yaw);
  if (pitch !== 0) out.multiply(tmp.setFromAxisAngle(Z, pitch));
  if (roll !== 0) out.multiply(tmp.setFromAxisAngle(X, roll));
}

/**
 * Bind a skinned dragon mesh to a walk's skeleton: detached, identity bind matrix, so the
 * bones' matrices (mesh-frame skinning matrices) apply directly. Its culling sphere is the
 * rest mesh's, grown by `margin` for the legs' reach, so three never skins it on the CPU to
 * find one.
 */
export function bindSkinned(mesh: THREE.SkinnedMesh, walk: DragonWalk, margin = 0.6): void {
  mesh.bindMode = THREE.DetachedBindMode;
  mesh.bind(walk.skeleton, new THREE.Matrix4());
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  mesh.boundingSphere = g.boundingSphere!.clone();
  mesh.boundingSphere.radius += margin;
}
