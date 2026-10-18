import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FlightParams } from '../assets/dragon/flight';
import { BONE, type Rig } from '../assets/dragon/rig';
import { foldScaleOf, wingAxes, type WingAxes } from './flight';
import type { AttitudeLayer } from './walk';

/**
 * The wild dragon's tells and the keeper's body (M8b), on the GPU and the skeleton.
 *
 * The sim (src/sim/wild.ts) decides what the dragon feels; this file makes it show on the
 * mesh, so the player reads it without a number (STATE.md run 33: "the render shows the
 * tells, not a number first"):
 *
 *   graze    the head goes down to the grass, the body settles, the wings fold in close;
 *   alert    it rears up on its hind legs, the neck rises, the wings lift and half-open, and
 *            the head turns to the keeper: the widest, tallest silhouette it has;
 *   wary     the body crouches low (the legs' IK bends the knees), the wings fold hard against
 *            the flanks, the neck drops, the tail drops as far as the deck allows, and the head
 *            looks back over the shoulder at the keeper — the sim has already turned its tail to
 *            the keeper and is walking it off: the lowest, narrowest silhouette it has;
 *   settle   it eases back into the idle: head level, a softer, lower stance, a glance;
 *   flee     the M7c flap and glide (src/render/flight.ts), driven by the flight's progress.
 *
 * **Why the amplitudes are as big as they are** (M8b criterion 2, owner's decision
 * docs/DECISIONS.md §"M8b criterion 6"). At the camera the player has, the dragon is 97 px
 * across. The first pass's tells — `lower` 0.289 on wary, `neck` 0.42 on alert — were measured
 * by two critics independently and do not read at that size: a pose that moves the outline by
 * two pixels is a pose nobody sees. So the reading stays in the body (docs/GDD.md §The loop:
 * taming is "reading its behaviour, not throwing a ball") and the body moves far enough to be
 * read: the whole stance changes, not a joint. Three channels do the carrying, and all three
 * are measured in units the flap already proves safe:
 *
 * **The tail, and what "tucks" can mean here** (run 36, C1). Run 33's design note and this
 * file's own description of `wary` both say the tail tucks, and a frightened animal does drop
 * its tail: a tail held high reads as aggression, which is the wrong creature. Two measurements
 * bound how far that can go. First, the channel's sign is the opposite of what its comment said
 * for the whole of M8b — positive `tail` *lifts* the tip, because the tail points backwards (see
 * `AttitudeTargets.tail`). Second, `wary` already crouches at `lower` 0.50, which lowers the
 * tail's root before the channel does anything, so the deck, not the rig, sets the limit: with
 * the tail's own skin measured against each dragon's own standing low point, +0.15 leaves the
 * visible tail 0.058 clear of it, +0.10 leaves 0.032, and 0 puts it 0.090 *under* the deck. So
 * `wary` carries +0.15 — the lowest tail the geometry allows while crouched, 23° of root turn
 * below the +0.55 it shipped with — and a tail that actually goes *beneath* the body would need
 * a rig that can swing it out of the sagittal plane, which this one cannot. `alert` keeps +0.30:
 * a rearing dragon lifts its tail, and the negative sign drove the tip toward the deck there.
 *
 *   fold   the wings fold in — elbow, wrist and fan — exactly the motion the upstroke makes,
 *          at `p.fold` / `p.wristFold` scale with the same narrow-fan guard (`foldScaleOf`);
 *   rise   the humerus elevates about the wing's own elevation axis at `p.stroke` scale, the
 *          same arc the beat sweeps;
 *   rear   the body pitches nose-up about the pelvis (./walk.ts REAR_PITCH), hind feet
 *          planted, forefeet lifting with the shoulders.
 *
 * **The rest pose is not ours to change.** `wander` is the reference and keeps the wings as the
 * mesher builds them: whether a resting dragon should furl its wings at all is an open owner
 * question (NEXT.md §Open items; tests/dragon-wings.test.ts asserts the spread for all 40
 * genomes as M3e criterion 2). A fold here is only ever a *difference between states* — the
 * dragon changes its wings when it reacts — and `wander` has `fold` 0.
 *
 * `DragonAttitude` is an `AttitudeLayer` on the dragon's `DragonWalk` (./walk.ts): each
 * channel eases toward its target with its own rate, so a change of state is a motion, never
 * a snap. Nothing allocates per frame.
 *
 * The bridge from sim state to `setTargets` lives in src/main.ts, which may import both.
 */

/** Pose targets, all in radians except `lower`, `fold`, `rise` and `rear` (shares, see each). */
export interface AttitudeTargets {
  /** Head and neck turn toward the keeper (mesh frame, + to the dragon's left), and how much of it to take. */
  look: number;
  lookShare: number;
  /** Neck raise (+) or drop (−), spread over the neck's root half. */
  neck: number;
  /** The head's own nod: + up, − down. */
  head: number;
  /** Body lowered, 0..1 of the leg's drop. */
  lower: number;
  /**
   * The tail's own curl, radians, spread over its three bones. **Positive lifts the tip, negative
   * drops it** — the sign reads backwards from the turn because the tail points along −x, so a
   * nose-down rotation of each segment swings the part *behind* the hips upward. Measured, not
   * reasoned: on fixture #31, whose tip sits 4.9 units behind the hips, `tail` +0.55 puts that
   * tip at +1.18 against a rest height of +0.35, and 0 puts it at −0.03. The comment here said
   * "curled down (+)" from M8b until run 36 measured it (CLAUDE.md §Never: "a comment has twice
   * asserted the opposite of what the renderer did. Measure the pixels, not the prose").
   */
  tail: number;
  /** Wings folded in, 0..1 of the flap's own full fold (elbow, wrist and the fan closing with them). */
  fold: number;
  /** Wings raised (+) or hugged down (−), −1..1 of the flap's own stroke. */
  rise: number;
  /** Reared up on the hind legs, 0..1 of ./walk.ts REAR_PITCH. */
  rear: number;
}

/**
 * The eased channels themselves: a pose of the attitude layer, with no state behind it. Every
 * channel of `AttitudeTargets` but `lookShare`, which is not a pose — it is the share of the
 * keeper's bearing a state takes, and `setTargets` has already multiplied it into `look` by the
 * time anything moves.
 */
export type AttitudeChannels = Omit<AttitudeTargets, 'lookShare'>;

/**
 * Each named state's pose (look is filled per frame). `wander` is the reference the others are
 * read against, so its `fold` and `rise` are 0: the rest mesh, unchanged. `flee` is all zeros
 * because the flight owns the wings there — the ease out of the previous state while the flap
 * ramps in is the overlap `attitudeSamples` covers.
 */
export const ATTITUDES: Readonly<Record<string, Readonly<Omit<AttitudeTargets, 'look'>>>> = {
  graze: { lookShare: 0, neck: -0.95, head: -0.40, lower: 0.25, tail: 0.10, fold: 0.80, rise: -0.15, rear: 0 },
  wander: { lookShare: 0, neck: -0.08, head: 0, lower: 0, tail: 0, fold: 0, rise: 0, rear: 0 },
  alert: { lookShare: 1, neck: 0.46, head: -0.25, lower: 0, tail: 0.30, fold: 0.10, rise: 0.45, rear: 0.80 },
  wary: { lookShare: 0.85, neck: -0.50, head: 0.30, lower: 0.50, tail: 0.15, fold: 0.90, rise: -0.15, rear: 0 },
  settle: { lookShare: 0.35, neck: -0.20, head: -0.05, lower: 0.30, tail: 0.10, fold: 0.25, rise: -0.10, rear: 0 },
  flee: { lookShare: 0, neck: 0, head: 0, lower: 0, tail: 0, fold: 0, rise: 0, rear: 0 },
};

/**
 * How fast each channel eases, per second (1 − e^(−rate·dt) of the way each frame). The three
 * new channels ease at the rates of the body parts they move: the wings with the neck (a wing
 * is light and fast), the rear-up a little slower than the crouch it is the opposite of, since
 * a dragon pushing its own weight up is the slowest thing it does.
 */
const RATE = { look: 4.5, neck: 3.2, head: 3.6, lower: 2.6, tail: 2.4, fold: 3.0, rise: 3.0, rear: 2.2 } as const;
/** The turn toward the keeper is spread over the neck and head, root to tip. */
const LOOK_SPREAD = [0.1, 0.14, 0.18, 0.2, 0.2, 0.18] as const;
const NECK_BONES = [BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.neck4] as const;
/** The neck's raise is carried by its root bones (a swan's lift), and taken back a little at the top. */
const NECK_SPREAD = [0.34, 0.3, 0.22, 0.1, 0.04] as const;
const TAIL_BONES = [BONE.tail0, BONE.tail1, BONE.tail2] as const;
/** The farthest the head turns from straight ahead. */
export const LOOK_MAX = 1.35;

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** A channel this close to its target (radians, or share of the drop) is on it: far below a pixel. */
const SETTLED = 1e-4;
/** One channel's step toward `goal`: exponential, landing on it once within SETTLED. */
function ease(value: number, goal: number, rate: number, dt: number): number {
  const next = value + (goal - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(goal - next) < SETTLED ? goal : next;
}

/** One wing, as the attitude poses it: its bones, its axes, and the fold its fan can take. */
interface AttitudeWing extends WingAxes {
  humerus: number; forearm: number; hand: number; fingers: number[];
  foldScale: number;
}

export class DragonAttitude implements AttitudeLayer {
  /** Current (eased) values. */
  look = 0;
  neck = 0;
  head = 0;
  lower = 0;
  tail = 0;
  fold = 0;
  rise = 0;
  rear = 0;
  private readonly goal: AttitudeTargets = { look: 0, lookShare: 0, neck: 0, head: 0, lower: 0, tail: 0, fold: 0, rise: 0, rear: 0 };
  private readonly q = new THREE.Quaternion();
  /** The wings this poses, and the genome's flight scales: empty with no rig, and then `fold` and `rise` do nothing. */
  private readonly wings: AttitudeWing[] = [];
  private readonly fp: FlightParams | null;

  /**
   * `rig` and `params` are the dragon's own: the attitude needs the wings' axes (shared with
   * the flap through src/render/flight.ts `wingAxes`, so there is one truth for them) and the
   * genome's flight scales, because `fold` and `rise` are measured in the flap's own units —
   * the fold the upstroke makes, the arc the stroke sweeps — which keeps the wings inside a
   * range the clearance gate already trusts.
   *
   * **With no rig it poses the body only**: the neck, head, tail, crouch and rear-up all work,
   * and `fold` and `rise` are inert. Several tests and probes build a bare `new
   * DragonAttitude()` to measure the body, and that stays valid.
   */
  constructor(rig?: Rig, params?: FlightParams) {
    this.fp = params ?? null;
    if (rig && params) {
      for (const w of rig.wings) {
        const axes = wingAxes(w);
        this.wings.push({
          humerus: w.humerus, forearm: w.forearm, hand: w.hand, fingers: w.fingers, ...axes,
          foldScale: foldScaleOf(axes.psiLast, params),
        });
      }
    }
  }

  /**
   * The targets every channel is easing toward: what `setTargets` last asked for, not what the
   * dragon is doing. The `?test` hook reports it so a drill can tell a pose that has *arrived*
   * from one still on its way — tools/playtest.mjs photographed mid-ease tells for three runs
   * (`alert` at rear 0.553 against a target of 0.80) and nobody could see it from the outside.
   * The object is the live one: read it, never write it.
   */
  get targets(): Readonly<AttitudeTargets> { return this.goal; }

  /** Set the targets for state `state` with the keeper `look` radians off the snout. Allocation-free. */
  setTargets(state: string, look: number): void {
    const a = ATTITUDES[state] ?? ATTITUDES['wander']!;
    const g = this.goal;
    g.lookShare = a.lookShare;
    g.look = a.lookShare * Math.max(-LOOK_MAX, Math.min(LOOK_MAX, look));
    g.neck = a.neck;
    g.head = a.head;
    g.lower = a.lower;
    g.tail = a.tail;
    g.fold = a.fold;
    g.rise = a.rise;
    g.rear = a.rear;
  }

  /**
   * Ease every channel toward its target over `dt` seconds; within SETTLED of it, land on it
   * exactly, so a held pose stops changing and the dragon's skeleton need not be posed again
   * (src/render/wild-dragon.ts). Allocation-free.
   */
  update(dt: number): void {
    const g = this.goal;
    this.look = ease(this.look, g.look, RATE.look, dt);
    this.neck = ease(this.neck, g.neck, RATE.neck, dt);
    this.head = ease(this.head, g.head, RATE.head, dt);
    this.lower = ease(this.lower, g.lower, RATE.lower, dt);
    this.tail = ease(this.tail, g.tail, RATE.tail, dt);
    this.fold = ease(this.fold, g.fold, RATE.fold, dt);
    this.rise = ease(this.rise, g.rise, RATE.rise, dt);
    this.rear = ease(this.rear, g.rear, RATE.rear, dt);
  }

  /**
   * **Probe-only** (src/render/flight-probe.ts): put every channel at a given value and hold it
   * there, bypassing the table in `ATTITUDES`.
   *
   * Nothing in the game calls this, and nothing should: the game's poses come from a named state
   * through `setTargets`, which is what keeps the sim's vocabulary and the mesh's one the same.
   * The clearance gate needs it because `update` eases each channel at its own rate, so the poses
   * the dragon actually passes through are not only the six named ones — they fill the whole box
   * spanned by the channels' per-state extremes, and a transition can put a graze's neck over a
   * wary's crouch with the head turned full over the shoulder, which no state asks for. A gate
   * that measured the named states alone would not see that pose until a player did. `look` is
   * clamped to ±LOOK_MAX as `setTargets` clamps it; the targets are set to the same values, so a
   * later `update` holds the pose rather than dragging it back to whatever was asked for last.
   */
  setRaw(c: Readonly<AttitudeChannels>): void {
    const g = this.goal;
    g.lookShare = 1;
    this.look = g.look = Math.max(-LOOK_MAX, Math.min(LOOK_MAX, c.look));
    this.neck = g.neck = c.neck;
    this.head = g.head = c.head;
    this.lower = g.lower = c.lower;
    this.tail = g.tail = c.tail;
    this.fold = g.fold = c.fold;
    this.rise = g.rise = c.rise;
    this.rear = g.rear = c.rear;
  }

  /** Jump straight to the targets (a load, a first frame). */
  snap(): void {
    const g = this.goal;
    this.look = g.look; this.neck = g.neck; this.head = g.head; this.lower = g.lower; this.tail = g.tail;
    this.fold = g.fold; this.rise = g.rise; this.rear = g.rear;
  }

  locals(local: THREE.Quaternion[]): void {
    const q = this.q;
    for (let i = 0; i < NECK_BONES.length; i++) {
      const L = local[NECK_BONES[i]!]!;
      L.multiply(q.setFromAxisAngle(Y, this.look * LOOK_SPREAD[i]!));
      L.multiply(q.setFromAxisAngle(Z, this.neck * NECK_SPREAD[i]!));
    }
    const H = local[BONE.head]!;
    H.multiply(q.setFromAxisAngle(Y, this.look * LOOK_SPREAD[5]));
    // The head takes back most of a raised neck's lift, so it looks out rather than up; a
    // lowered neck carries the head down with it. Then the head's own nod.
    H.multiply(q.setFromAxisAngle(Z, this.head - 0.55 * Math.max(0, this.neck)));
    for (let i = 0; i < TAIL_BONES.length; i++) local[TAIL_BONES[i]!]!.multiply(q.setFromAxisAngle(Z, -this.tail / TAIL_BONES.length));
    // The wings, in the flap's own units (./flight.ts `locals`, the upstroke's branch): the
    // elbow and the wrist fold back about the wing's plane normal and the fan closes onto its
    // last finger by as much, so the leading digit folds toward the last one and no finger
    // swings in against the flank; the humerus elevates about the wing's elevation axis. Same
    // axes, same scales, same narrow-fan guard as the beat, so every pose here is one the flap
    // already visits and the clearance gate already trusts. Nothing allocates.
    const p = this.fp;
    if (p !== null && (this.fold !== 0 || this.rise !== 0)) {
      for (let i = 0; i < this.wings.length; i++) {
        const w = this.wings[i]!;
        const fold = this.fold * w.foldScale;
        if (this.rise !== 0) local[w.humerus]!.multiply(q.setFromAxisAngle(w.elev, this.rise * p.stroke));
        if (fold === 0) continue;
        local[w.forearm]!.multiply(q.setFromAxisAngle(w.normal, w.foldSign * p.fold * fold));
        local[w.hand]!.multiply(q.setFromAxisAngle(w.normal, w.foldSign * p.wristFold * fold));
        const close = (fold * (p.fold + p.wristFold)) / w.psiLast;
        for (let k = 0; k < w.fingers.length; k++) local[w.fingers[k]!]!.multiply(q.setFromAxisAngle(w.normal, -close * w.psi[k]!));
      }
    }
  }
}

// --- the keeper ---------------------------------------------------------------------------

/**
 * Palette, docs/ART_BIBLE.md: a cloak in `dusk`, boots and hood lining in `deep shadow`, the
 * staff in `rock mid`, the lantern and the tap ring in `UI accent`.
 */
const KEEPER_COLORS = { cloak: 0x844e32, dark: 0x1a1420, staff: 0x5a4a40, glow: 0xffd479 } as const;

/** The keeper's height, world units: about a fifth of a dragon's length. */
export const KEEPER_HEIGHT = 0.46;

/**
 * The keeper as one geometry (one draw): a hooded, cloaked figure with a staff and a lantern,
 * plus the tap ring. Vertex colours carry the palette; `glow` (1 on the lantern and the ring)
 * makes them emissive; `mark` (1 on the ring) lets the vertex shader carry the ring to where
 * the keeper is walking (`withKeeper`). Built once.
 */
export function keeperGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: number, glow = 0, mark = 0): THREE.BufferGeometry => {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute('uv');
    const n = geo.getAttribute('position').count;
    const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
    const col = new Float32Array(n * 3), gl = new Float32Array(n), mk = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; gl[i] = glow; mk[i] = mark; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    geo.setAttribute('mark', new THREE.BufferAttribute(mk, 1));
    parts.push(geo);
    return geo;
  };
  const H = KEEPER_HEIGHT;
  // The cloak: a cone flaring to the ground, a little deeper than wide.
  paint(new THREE.ConeGeometry(0.11, H * 0.78, 9).translate(0, H * 0.39, 0).scale(1, 1, 0.85), KEEPER_COLORS.cloak);
  // Boots peeking out under the hem.
  paint(new THREE.CylinderGeometry(0.1, 0.105, 0.03, 9).translate(0, 0.015, 0), KEEPER_COLORS.dark);
  // The hood: a squat sphere, and a darker inner face toward +x (the way the keeper faces).
  paint(new THREE.SphereGeometry(0.066, 10, 7).scale(1, 1.12, 1).translate(0, H * 0.84, 0), KEEPER_COLORS.cloak);
  paint(new THREE.SphereGeometry(0.046, 8, 6).scale(0.6, 0.9, 0.9).translate(0.04, H * 0.82, 0), KEEPER_COLORS.dark);
  // The staff in the right hand (−z is the keeper's right when facing +x), taller than the keeper.
  paint(new THREE.CylinderGeometry(0.008, 0.01, H * 1.22, 5).translate(0.05, H * 0.61, -0.1), KEEPER_COLORS.staff);
  // The lantern hanging from the staff's crook: a small glowing lozenge.
  paint(new THREE.OctahedronGeometry(0.036, 0).scale(1, 1.35, 1).translate(0.09, H * 1.12, -0.1), KEEPER_COLORS.glow, 1);
  paint(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4).rotateZ(Math.PI / 2).translate(0.07, H * 1.2, -0.1), KEEPER_COLORS.staff);
  // The tap ring: flat on the deck, carried to the goal by the vertex shader.
  paint(new THREE.RingGeometry(0.13, 0.17, 24).rotateX(-Math.PI / 2).translate(0, 0.012, 0), KEEPER_COLORS.glow, 0.85, 1);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('keeper: could not merge its parts');
  merged.computeBoundingSphere();
  // The ring travels as far as the deck is wide: never culled because of it.
  merged.boundingSphere!.radius = 12;
  return merged;
}

/** The ring's offset (x, z in the keeper's own frame) and scale (0 hides it). Shared by both keeper materials. */
export const KEEPER_UNIFORMS = {
  uMark: { value: new THREE.Vector3(0, 0, 0) },
};

const KEEPER_PARS = /* glsl */ `
uniform vec3 uMark;
attribute float mark;
attribute float glow;
varying float vGlow;
`;

/**
 * Patch a material for the keeper geometry: the ring's vertices are scaled by `uMark.z` and
 * moved by (`uMark.x`, 0, `uMark.y`) in the keeper's frame; in the colour pass, `glow` adds
 * the vertex colour as emission (the lantern, the ring), so glow is emissive and adds no
 * light. Composes with an earlier `onBeforeCompile` (the rim patch). A depth material gets
 * only the vertex half.
 */
export function withKeeper<T extends THREE.Material>(material: T): T {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  const depth = (material as THREE.Material & { isMeshDepthMaterial?: boolean }).isMeshDepthMaterial === true;
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    if (!shader.vertexShader.includes('#include <begin_vertex>')) throw new Error('withKeeper: no #include <begin_vertex>');
    shader.uniforms['uMark'] = KEEPER_UNIFORMS.uMark;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${KEEPER_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	vGlow = glow;
	if ( mark > 0.5 ) transformed = transformed * uMark.z + vec3( uMark.x, 0.0, uMark.y );`);
    if (!depth) {
      if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) throw new Error('withKeeper: no #include <emissivemap_fragment>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vGlow * 2.2;');
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;');
    }
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-keeper-v1${depth ? '-depth' : ''}`;
  material.needsUpdate = true;
  return material;
}

// --- the deck's heights ---------------------------------------------------------------------

/**
 * The deck's height under every point, sampled once: a grid of downward rays onto the island
 * body at setup, then bilinear lookups per frame. No per-frame raycast. Coordinates are the
 * island's own frame (the frame the sim's positions are in).
 */
export class DeckHeights {
  private readonly h: Float32Array;
  private readonly n: number;
  private readonly half: number;
  private built = false;

  /**
   * A grid of n × n samples over [−half, half]² of `target`'s parent frame. Nothing is cast
   * until `build()`: the caller does that after the first frame, off its critical path;
   * until then every point reads `fallback`.
   */
  constructor(private readonly target: THREE.Object3D, half: number, n = 33, private readonly fallback = 0) {
    this.n = n;
    this.half = half;
    this.h = new Float32Array(n * n).fill(fallback);
  }

  /** Cast the grid of rays, once. Setup-time: it allocates. Returns the milliseconds it took. */
  build(): number {
    if (this.built) return 0;
    const t0 = performance.now();
    const n = this.n, half = this.half, target = this.target;
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), local = new THREE.Vector3();
    const hits: THREE.Intersection[] = [];
    target.updateMatrixWorld(true);
    const frame = target.parent ? target.parent.matrixWorld : new THREE.Matrix4();
    const inv = frame.clone().invert();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + (2 * half * i) / (n - 1), z = -half + (2 * half * j) / (n - 1);
        // Into the world from the parent's frame, then straight down.
        origin.set(x, 50, z).applyMatrix4(frame);
        ray.set(origin, down);
        hits.length = 0;
        ray.intersectObject(target, false, hits);
        this.h[j * n + i] = hits[0] ? local.copy(hits[0].point).applyMatrix4(inv).y : this.fallback;
      }
    }
    this.built = true;
    return performance.now() - t0;
  }

  /** The deck's height at (x, z). Allocation-free. */
  at(x: number, z: number): number {
    const n = this.n, f = (n - 1) / (2 * this.half);
    const u = Math.min(n - 1.0001, Math.max(0, (x + this.half) * f));
    const v = Math.min(n - 1.0001, Math.max(0, (z + this.half) * f));
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    const h = this.h;
    return (h[j * n + i]! * (1 - a) + h[j * n + i + 1]! * a) * (1 - b)
      + (h[(j + 1) * n + i]! * (1 - a) + h[(j + 1) * n + i + 1]! * a) * b;
  }
}

// --- the flight's shape over a flee ---------------------------------------------------------

/** What a flee looks like at τ seconds into a flight of `dur` seconds (takeoff and landing included). */
export interface FleePose { flap: number; glide: number; altitude: number }

/**
 * The flap and glide weights and the arc's height, from the flight's progress alone, so a
 * reload mid-flight resumes the same pose. The wings beat at takeoff and landing and glide
 * across the middle of a long hop; the arc rises to `peak` over the trees. Allocation-free.
 */
export function fleePose(tau: number, dur: number, takeoff: number, land: number, peak: number, out: FleePose): FleePose {
  const s = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const air = s(tau / 0.45) * s((dur - tau) / 0.55);
  const travel = Math.max(0.01, dur - takeoff - land);
  const glide = s((tau - takeoff - 0.5) / 0.4) * s((dur - land - 0.45 - tau) / 0.4) * (travel > 1.4 ? 1 : 0);
  out.flap = air * (1 - glide);
  out.glide = air * glide;
  const u = Math.min(1, Math.max(0, (tau - takeoff) / travel));
  out.altitude = peak * Math.sin(Math.PI * u) * s(tau / takeoff);
  return out;
}
