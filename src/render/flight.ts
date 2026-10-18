import * as THREE from 'three';
import type { FlightParams } from '../assets/dragon/flight';
import { BONE, type Rig, type RigWing } from '../assets/dragon/rig';
import type { DragonWalk, FlightLayer } from './walk';

/**
 * The dragon's flap and glide (M7c) on the CPU, riding on its walk's skeleton
 * (src/render/walk.ts `FlightLayer`): the wing chains the mesher reads off the graph
 * (src/assets/dragon/rig.ts `RigWing`: humerus, forearm, hand, one bone per finger) turn
 * about their own joints, and the whole body heaves, banks and lifts off the ground.
 *
 * **Axes, from each wing's rest geometry** (mesh frame: x forward, y up):
 * - *elevation* about the body's long axis through the joint, signed so a positive angle
 *   raises the wing's outer end: the stroke at the shoulder, and the hand's bend at the wrist;
 * - *sweep* about the vertical at the shoulder, positive forward;
 * - *the wing's plane normal* n = (wrist − root) × (last finger tip − wrist), up: the arm folds
 *   about it at the elbow and the wrist (positive folds the outer part back, toward the tail),
 *   and the fingers fan about it at the wrist. Each finger's rest angle ψₖ about n is measured
 *   from the leading digit; at fan spread σ it turns to σ·ψₖ, so for any σ > 0 the fingers keep
 *   their order and the panel between two of them fans with them.
 *
 * **The beat** (src/assets/dragon/flight.ts `FlightParams`): the downstroke takes `down` of it,
 * the upstroke the rest, each a half turn of a cosine, so the stroke has no corner at the top
 * or bottom. The humerus elevation runs from `upShare·stroke` above rest at the top to the rest
 * of `stroke` below it at the bottom. The hand adds `handBend` of the elevation `handLag` of a
 * beat late, so the wing flexes. On the upstroke (and only then) the elbow and wrist fold back
 * by sin², and the fan closes onto its last finger by as much: the leading digit folds back
 * toward the last finger, which keeps its heading, so a finger that points back toward the hip
 * is never swung in against the flank. A fan too narrow to close that far (above FAN_MIN) folds
 * the wing less instead. Mid-downstroke the fan opens to `fanOpen`. The body heaves against the
 * stroke: lowest with the wings at the top, highest at the bottom, and pitches with it.
 *
 * **Sweep.** In the air the humerus sweeps back SWEEP_BASE, and the stroke swings it back
 * another SWEEP_BACK at the top and forward SWEEP_FORWARD at the bottom. The hand turns
 * against the humerus's sweep, so the hand moves with the arm without turning. A raised arm
 * that is swept back passes behind a frill that drapes back over it (sheet dragon D).
 *
 * **The neck** stretches forward and down by NECK_STRETCH over its five bones while the head
 * turns back up as much, so it stays level and leads the flight.
 *
 * **The glide** holds the wings `glideLift` above rest, unfolded, the fan open; the body banks
 * `bank` either way and soars `soar` up and down over `soarPeriod`.
 *
 * **Weights.** `set(t, flap, glide)`, each 0..1 with flap + glide ≤ 1. With a = flap + glide,
 * the sweep-back and the neck come in first (smoothstep of a / EARLY), and the stroke and the
 * glide pose after them (smoothstep of (a − LATE) / (1 − LATE), shared between the two in
 * proportion to flap and glide), so the wing never rises before it has swept clear. Every angle
 * is a continuous function of the weights and is 0 at 0, 0: the rest pose at any t. A caller
 * that eases the weights gets rest → flap → glide → rest with no snap. The altitude and the leg
 * tuck follow a: `hover` is HOVER_OF_CHEST of the chest's height, or more if the lowest wing
 * point or tucked foot would come within GROUND_CLEARANCE of the ground; the feet fold up and
 * back (src/render/walk.ts TUCK).
 *
 * Nothing allocates per pose.
 */
const TWO_PI = Math.PI * 2;
/** The humerus's sweep in the air, radians: back by SWEEP_BASE, and back or forward with the stroke. */
const SWEEP_BASE = 0.2;
const SWEEP_BACK = 0.25;
const SWEEP_FORWARD = 0.06;
/** The weight ramps: the sweep and the neck reach full at a = EARLY; the stroke starts at a = LATE. */
const EARLY = 0.4;
const LATE = 0.3;
/** The neck's forward stretch in the air, radians over its five bones; the head turns back up as much. */
const NECK_STRETCH = 0.35;
const NECK_BONES = [BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.neck4] as const;
/** The body's pitch with the stroke (nose up on the downstroke), radians. */
const PITCH = 0.03;
/** The glide's slow flex of the wings with the soar, radians. */
const GLIDE_FLEX = 0.03;
/** The lowest wing point or foot sits at least this far above the ground at full flight. */
const GROUND_CLEARANCE = 0.35;
/**
 * ... and the dragon rises at least this share of its chest's height: high enough that its
 * shadow leaves its tucked feet and the lift reads from any camera (M7c cycle 1, art A9).
 */
const HOVER_OF_CHEST = 0.9;
/**
 * Seconds a flight command eases its weights over (the page's clock, and the clip's). Short,
 * so the first 100 ms of a command already shows (M7c cycle 1, gameplay D3).
 */
export const FLIGHT_RAMP_S = 0.5;

/**
 * One wing's axes and finger angles, read off its rest geometry: the frame every pose of that
 * wing turns in, whatever poses it. The flap (below) and the wild dragon's fold and lift
 * (./wild.ts `DragonAttitude`) both need these, and they must be the *same* numbers — a wing
 * folded by one and raised by the other about axes computed twice, slightly differently, is a
 * wing that creases. One truth, `wingAxes`, used by both.
 */
export interface WingAxes {
  /** Elevation axis (positive raises the outer end), sweep axis (positive forward), plane normal. */
  elev: THREE.Vector3; sweep: THREE.Vector3; normal: THREE.Vector3;
  /** Sign of a fold about `normal` that moves the outer part back. */
  foldSign: number;
  /** Each finger's rest angle about `normal` from the leading digit, radians, and the last one's size. */
  psi: number[];
  psiLast: number;
}

interface WingState extends WingAxes {
  humerus: number; forearm: number; hand: number; fingers: number[];
  /** The share of the flap's fold this wing takes: all of it unless its fan is too narrow to close that far. */
  foldScale: number;
}

/** The pose's angles for one beat phase, at full weight: shared by the flap and its probes. */
export interface FlapAngles { elev: number; sweep: number; hand: number; fold: number; open: number; heave: number; pitch: number; wave: number }

/** The beat's shape at time t: see the class comment. Allocation-free (writes `out`). */
export function flapAngles(p: FlightParams, t: number, out: FlapAngles): FlapAngles {
  const c = t / p.period;
  const ph = c - Math.floor(c);
  const phi = strokePhase(ph, p.down);
  const wave = Math.cos(phi); // 1 at the top of the stroke, −1 at the bottom
  out.wave = wave;
  out.elev = elevation(p, wave);
  const lagged = ph - p.handLag;
  out.hand = p.handBend * elevation(p, Math.cos(strokePhase(lagged - Math.floor(lagged), p.down)));
  out.sweep = SWEEP_FORWARD * (1 - wave) / 2 - SWEEP_BACK * (1 + wave) / 2;
  const up = ph >= p.down ? Math.sin((Math.PI * (ph - p.down)) / (1 - p.down)) : 0;
  const open = ph < p.down ? Math.sin((Math.PI * ph) / p.down) : 0;
  out.fold = up * up;
  out.open = (p.fanOpen - 1) * open * open;
  out.heave = -0.5 * p.heave * wave;
  out.pitch = PITCH * Math.sin(phi);
  return out;
}
/** The fan never closes past this share of its rest spread, so its fingers keep their order. */
const FAN_MIN = 0.35;

/**
 * One wing's axes and finger angles from its rest geometry alone: see `WingAxes` and the
 * class comment's *Axes* paragraph. No genome, no beat — a wing's frame is a property of the
 * wing. Allocates (setup-time only: the flap builds these once per dragon, and so does the
 * attitude layer).
 */
export function wingAxes(w: RigWing): WingAxes {
  const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const root = v(w.root), elbow = v(w.elbow), wrist = v(w.wrist), lead = v(w.lead);
  const last = v(w.tips[w.tips.length - 1] ?? w.lead);
  // Left (side +1) lies at mesh z < 0: +x raises it; the right wing mirrors.
  const elev = new THREE.Vector3(w.side, 0, 0);
  const sweep = new THREE.Vector3(0, -w.side, 0);
  const normal = new THREE.Vector3().subVectors(wrist, root).cross(new THREE.Vector3().subVectors(last, wrist)).normalize();
  if (normal.y < 0) normal.negate();
  const fore = new THREE.Vector3().subVectors(wrist, elbow);
  const turned = fore.clone().applyAxisAngle(normal, 0.1);
  const foldSign = turned.x < fore.x ? 1 : -1;
  const dl = new THREE.Vector3().subVectors(lead, wrist).projectOnPlane(normal);
  const psi = w.tips.map((t) => {
    const d = v(t).sub(wrist).projectOnPlane(normal);
    return Math.atan2(new THREE.Vector3().crossVectors(dl, d).dot(normal), dl.dot(d));
  });
  const psiLast = Math.abs(psi[psi.length - 1] ?? 1);
  return { elev, sweep, normal, foldSign, psi, psiLast };
}

/**
 * The share of a full fold a wing may take: all of it, unless its fan is too narrow to close
 * that far without crossing its own fingers (FAN_MIN). The fold the attitude layer applies is
 * measured in the same `p.fold` / `p.wristFold` units as the flap's, so it is bounded the same
 * way and by the same number.
 */
export function foldScaleOf(psiLast: number, p: FlightParams): number {
  return Math.min(1, ((1 - FAN_MIN) * psiLast) / (p.fold + p.wristFold));
}
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** Beat phase (0..1) → stroke angle: 0..π over the downstroke, π..2π over the upstroke. */
function strokePhase(ph: number, down: number): number {
  return ph < down ? (Math.PI * ph) / down : Math.PI + (Math.PI * (ph - down)) / (1 - down);
}
/** Humerus elevation above rest for stroke wave w (1 top, −1 bottom). */
function elevation(p: FlightParams, w: number): number {
  return p.stroke * ((1 + w) / 2 - (1 - p.upShare));
}

export class DragonFlight implements FlightLayer {
  readonly params: FlightParams;
  readonly walk: DragonWalk;
  /** The weights of the last `set`, and its time. */
  flap = 0;
  glide = 0;
  time = 0;
  readonly rootQ = new THREE.Quaternion();
  readonly rootPivot = new THREE.Vector3();
  rootLift = 0;
  tuck = 0;
  /** How high the dragon flies at full weight: its lowest wing point and tucked feet clear the ground. */
  readonly hover: number;
  /** The altitude of the last `set` (hover times the flight weight), without heave or soar: what a follow camera tracks. */
  altitude = 0;
  /** Everything the wings and body reach over a beat and a glide, in the mesh frame, at full weight. */
  readonly reach = new THREE.Box3();
  /** The wing nodes and feet sampled over that beat and glide (mesh frame, at the hover), x, y, z each: what a camera frames. */
  readonly reachPoints: number[] = [];
  /** How far any wing node moves from its rest place at full weight: the culling sphere's margin. */
  readonly maxMove: number;
  private readonly wings: WingState[] = [];
  // Per-pose state, written by set().
  private elev = 0; private sweepA = 0; private handA = 0; private foldA = 0; private openA = 0; private neck = 0;
  private readonly fa: FlapAngles = { elev: 0, sweep: 0, hand: 0, fold: 0, open: 0, heave: 0, pitch: 0, wave: 0 };
  // Scratch.
  private readonly q = new THREE.Quaternion();
  private readonly X = new THREE.Vector3(1, 0, 0);
  private readonly Z = new THREE.Vector3(0, 0, 1);

  constructor(walk: DragonWalk, rig: Rig, params: FlightParams) {
    this.walk = walk;
    this.params = params;
    const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    for (const w of rig.wings) this.wings.push(DragonFlight.wingState(w, params));
    // The body turns about the belly's pivot (spine1).
    this.rootPivot.set(rig.pivot[3]!, rig.pivot[4]!, rig.pivot[5]!);
    walk.flight = this;
    // Sample a beat and a glide at full weight with no altitude: the lowest point sets the
    // hover, and the reach and largest move size the culling sphere and the follow camera.
    let low = Infinity, move = 0;
    const tmp = new THREE.Vector3();
    const nodes: { bone: number; p: THREE.Vector3 }[] = [];
    for (const w of rig.wings) {
      nodes.push({ bone: w.forearm, p: v(w.elbow) }, { bone: w.hand, p: v(w.wrist) }, { bone: w.hand, p: v(w.lead) });
      w.fingers.forEach((b, k) => nodes.push({ bone: b, p: v(w.mids[k]!) }, { bone: b, p: v(w.tips[k]!) }));
    }
    for (const leg of rig.legs) nodes.push({ bone: leg.foot, p: v(leg.ball) }, { bone: leg.foot, p: v(leg.toe) });
    const box = new THREE.Box3();
    const samples: [number, number, number][] = [];
    for (let i = 0; i < 48; i++) samples.push([(params.period * i) / 48, 1, 0]);
    for (let i = 0; i < 16; i++) samples.push([(params.soarPeriod * i) / 16, 0, 1]);
    this.hover = 0;
    for (const [t, f, g] of samples) {
      this.set(t, f, g);
      walk.pose(null);
      for (const n of nodes) {
        tmp.copy(n.p).applyMatrix4(walk.bones[n.bone]!.matrixWorld);
        low = Math.min(low, tmp.y);
        move = Math.max(move, tmp.distanceTo(n.p));
        box.expandByPoint(tmp);
        this.reachPoints.push(tmp.x, tmp.y, tmp.z);
      }
    }
    this.hover = Math.max(HOVER_OF_CHEST * rig.pivot[7]!, GROUND_CLEARANCE - low);
    box.min.y += this.hover; box.max.y += this.hover;
    for (let i = 1; i < this.reachPoints.length; i += 3) this.reachPoints[i] = this.reachPoints[i]! + this.hover;
    this.reach.copy(box);
    this.maxMove = move + this.hover;
    this.set(0, 0, 0);
    walk.pose(null);
  }

  /** One wing's axes, finger angles and bones, from its rest geometry and the genome's flight. */
  private static wingState(w: RigWing, p: FlightParams): WingState {
    const axes = wingAxes(w);
    return {
      humerus: w.humerus, forearm: w.forearm, hand: w.hand, fingers: w.fingers, ...axes,
      foldScale: foldScaleOf(axes.psiLast, p),
    };
  }

  get active(): boolean { return this.flap > 0 || this.glide > 0; }

  /**
   * Set the flight at time `t` seconds with flap and glide weights (each 0..1; if they sum
   * past 1 they are scaled to share 1): the angles the walk's next `pose` reads. Allocation-free.
   */
  set(t: number, flap: number, glide = 0): void {
    let f = Math.min(1, Math.max(0, flap)), g = Math.min(1, Math.max(0, glide));
    // Weights that sum past 1 (a caller switching mid-ramp) share 1 between them.
    if (f + g > 1) { const k = 1 / (f + g); f *= k; g *= k; }
    this.flap = f; this.glide = g; this.time = t;
    const p = this.params;
    const a = flapAngles(p, t, this.fa);
    const soarA = (TWO_PI * t) / p.soarPeriod;
    const gl = p.glideLift + GLIDE_FLEX * Math.sin(2 * soarA);
    const air = Math.min(1, f + g);
    const early = smooth(air / EARLY), late = air > 0 ? smooth((air - LATE) / (1 - LATE)) / air : 0;
    const F = f * late, G = g * late;
    this.elev = F * a.elev + G * gl;
    this.sweepA = F * a.sweep - early * SWEEP_BASE;
    this.handA = F * a.hand + G * 0.5 * gl;
    this.foldA = F * a.fold;
    this.openA = F * a.open + G * (p.fanOpen - 1);
    this.tuck = air;
    this.neck = NECK_STRETCH * early;
    this.altitude = this.hover * air;
    this.rootLift = this.altitude + f * a.heave + g * p.soar * Math.sin(soarA);
    const roll = g * p.bank * Math.sin(soarA);
    const pitch = f * a.pitch + g * 0.5 * PITCH * Math.cos(soarA);
    this.rootQ.setFromAxisAngle(this.X, roll).multiply(this.q.setFromAxisAngle(this.Z, pitch));
  }

  /** `set`, then pose the walk's skeleton at rest under it: the flight alone. */
  pose(t: number, flap: number, glide = 0): void {
    this.set(t, flap, glide);
    this.walk.pose(null);
  }

  locals(local: THREE.Quaternion[]): void {
    const p = this.params;
    if (this.neck !== 0) {
      for (let i = 0; i < NECK_BONES.length; i++) local[NECK_BONES[i]!]!.multiply(this.q.setFromAxisAngle(this.Z, -this.neck / NECK_BONES.length));
      local[BONE.head]!.multiply(this.q.setFromAxisAngle(this.Z, this.neck));
    }
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i]!;
      local[w.humerus]!.setFromAxisAngle(w.elev, this.elev).multiply(this.q.setFromAxisAngle(w.sweep, this.sweepA));
      // A narrow fan cannot take the whole fold: the wing then folds less (foldScale).
      const fold = this.foldA * w.foldScale;
      local[w.forearm]!.setFromAxisAngle(w.normal, w.foldSign * p.fold * fold);
      // The hand turns back by the humerus's sweep, so it moves with the arm without swinging
      // its trailing fingers, which point back toward the hip, in toward the flank.
      local[w.hand]!.setFromAxisAngle(w.sweep, -this.sweepA).multiply(this.q.setFromAxisAngle(w.elev, this.handA))
        .multiply(this.q.setFromAxisAngle(w.normal, w.foldSign * p.wristFold * fold));
      // The fan closes onto its last finger by as much as the elbow and wrist fold the hand
      // back, so the last finger keeps its heading and the leading digit folds back toward it.
      const fan = 1 + this.openA - (fold * (p.fold + p.wristFold)) / w.psiLast;
      for (let k = 0; k < w.fingers.length; k++) local[w.fingers[k]!]!.setFromAxisAngle(w.normal, (fan - 1) * w.psi[k]!);
    }
  }

  /** Wing `i`'s rest plane normal (mesh frame), for probes that measure the fan. */
  normal(i: number): THREE.Vector3 { return this.wings[i]!.normal; }
}

/** The flap's top of the downstroke (phase 0) and bottom (phase `down`), in seconds from 0. */
export function strokeTimes(p: FlightParams): { top: number; bottom: number } {
  return { top: 0, bottom: p.down * p.period };
}
