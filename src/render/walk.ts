import * as THREE from 'three';
import { BONE, BONE_COUNT, type Rig } from '../assets/dragon/rig';
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
 *   it; the body sinks (`crouch`) and bobs twice a cycle; the wings ride the shoulders.
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

const NECK = [BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3] as const;
const TAIL = [BONE.tail0, BONE.tail1, BONE.tail2] as const;
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

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
  /** Distance travelled along the mesh's +x at the last pose. */
  travel = 0;
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
    if (rig.parent.length !== BONE_COUNT) throw new Error(`walk: ${rig.parent.length} bones, expected ${BONE_COUNT}`);
    this.params = params;
    this.parent = rig.parent;
    for (let i = 0; i < BONE_COUNT; i++) {
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
   * `travel` 0). Allocation-free.
   */
  pose(t: number | null): void {
    if (t === null) {
      for (let i = 0; i < this.bones.length; i++) this.bones[i]!.matrixWorld.identity();
      for (let i = 0; i < this.legs.length; i++) { this.legs[i]!.planted = true; this.legs[i]!.stretched = false; }
      this.travel = 0;
      return;
    }
    const w = this.params;
    const c = t / w.period;
    this.travel = w.stride * c;
    // Each girdle swings toward the side whose leg is swinging, at the middle of that swing.
    const midSwing = (1 + w.duty) / 2;
    const hips = -w.flex * Math.cos(TWO_PI * (c - w.phase[0] - midSwing));
    const shoulders = -w.flex * Math.cos(TWO_PI * (c - w.phase[1] - midSwing));
    const twice = Math.cos(2 * TWO_PI * c); // 1 at each hind footfall
    const pitch = w.pitch * twice;
    const lower = w.crouch * this.drop + w.bob * (0.5 + 0.5 * twice);

    const L = this.local;
    for (let i = 0; i < L.length; i++) L[i]!.identity();
    yawPitch(L[BONE.pelvis]!, hips, pitch, this.q);
    yawPitch(L[BONE.spine1]!, (shoulders - hips) / 2, -pitch, this.q);
    yawPitch(L[BONE.spine2]!, (shoulders - hips) / 2, 0, this.q);
    for (let i = 0; i < NECK.length; i++) yawPitch(L[NECK[i]!]!, (-NECK_COUNTER * shoulders) / NECK.length, 0, this.q);
    for (let i = 0; i < TAIL.length; i++) {
      yawPitch(L[TAIL[i]!]!, w.tailSway * Math.sin(TWO_PI * (c - w.phase[0] - midSwing) - TAIL_LAG * (i + 1)), 0, this.q);
    }

    // Forward kinematics for the body: every bone but the legs' (whose parents come first).
    const R = this.R, P = this.P, rest = this.rest, par = this.parent;
    for (let i = 0; i < BONE_COUNT; i++) {
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
    for (let i = 0; i < this.legs.length; i++) this.solveLeg(this.legs[i]!, c);
    for (let i = 0; i < BONE_COUNT; i++) {
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
  private solveLeg(s: LegState, c: number): void {
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
    // The foot keeps its rest orientation: the ankle sits where it does over the ball at rest.
    const T = this.t.copy(s.ankle);
    T.x += dx;
    T.y += lift;
    // The hip joint, carried by the body.
    const a = s.anchor;
    const H = P[s.thigh]!.subVectors(s.hip, this.rest[a]!).applyQuaternion(R[a]!).add(P[a]!);
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

/** q = yaw about y, then pitch about z, in the parent's frame. Allocation-free. */
function yawPitch(out: THREE.Quaternion, yaw: number, pitch: number, tmp: THREE.Quaternion): void {
  out.setFromAxisAngle(Y, yaw);
  if (pitch !== 0) out.multiply(tmp.setFromAxisAngle(Z, pitch));
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
