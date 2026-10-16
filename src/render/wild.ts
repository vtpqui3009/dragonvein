import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BONE } from '../assets/dragon/rig';
import type { AttitudeLayer } from './walk';

/**
 * The wild dragon's tells and the keeper's body (M8b), on the GPU and the skeleton.
 *
 * The sim (src/sim/wild.ts) decides what the dragon feels; this file makes it show on the
 * mesh, so the player reads it without a number (STATE.md run 33: "the render shows the
 * tells, not a number first"):
 *
 *   graze    the head goes down to the grass, the body settles a little;
 *   alert    the neck rises and the head turns to the keeper;
 *   wary     the body crouches low (the legs' IK bends the knees), the neck drops, the
 *            tail tucks, and the head looks back over the shoulder at the keeper — the sim
 *            has already turned its tail to the keeper and is walking it off;
 *   settle   it eases back into the idle: head level, a softer, lower stance, a glance;
 *   flee     the M7c flap and glide (src/render/flight.ts), driven by the flight's progress.
 *
 * `DragonAttitude` is an `AttitudeLayer` on the dragon's `DragonWalk` (./walk.ts): each
 * channel eases toward its target with its own rate, so a change of state is a motion, never
 * a snap. Nothing allocates per frame.
 *
 * The bridge from sim state to `setTargets` lives in src/main.ts, which may import both.
 */

/** Pose targets, all in radians except `lower` (share of the leg's drop). */
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
  /** Tail curled down (+). */
  tail: number;
}

/** Each named state's pose (look is filled per frame). */
export const ATTITUDES: Readonly<Record<string, Readonly<Omit<AttitudeTargets, 'look'>>>> = {
  graze: { lookShare: 0, neck: -0.75, head: -0.3, lower: 0.12, tail: 0.05 },
  wander: { lookShare: 0, neck: -0.08, head: 0, lower: 0, tail: 0 },
  alert: { lookShare: 1, neck: 0.42, head: -0.22, lower: -0.06, tail: -0.12 },
  wary: { lookShare: 0.85, neck: -0.32, head: 0.22, lower: 0.42, tail: 0.32 },
  settle: { lookShare: 0.35, neck: -0.12, head: -0.05, lower: 0.18, tail: 0.06 },
  flee: { lookShare: 0, neck: 0, head: 0, lower: 0, tail: 0 },
};

/** How fast each channel eases, per second (1 − e^(−rate·dt) of the way each frame). */
const RATE = { look: 4.5, neck: 3.2, head: 3.6, lower: 2.6, tail: 2.4 } as const;
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

export class DragonAttitude implements AttitudeLayer {
  /** Current (eased) values. */
  look = 0;
  neck = 0;
  head = 0;
  lower = 0;
  tail = 0;
  private readonly goal: AttitudeTargets = { look: 0, lookShare: 0, neck: 0, head: 0, lower: 0, tail: 0 };
  private readonly q = new THREE.Quaternion();

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
  }

  /** Ease every channel toward its target over `dt` seconds. Allocation-free. */
  update(dt: number): void {
    const g = this.goal;
    this.look += (g.look - this.look) * (1 - Math.exp(-RATE.look * dt));
    this.neck += (g.neck - this.neck) * (1 - Math.exp(-RATE.neck * dt));
    this.head += (g.head - this.head) * (1 - Math.exp(-RATE.head * dt));
    this.lower += (g.lower - this.lower) * (1 - Math.exp(-RATE.lower * dt));
    this.tail += (g.tail - this.tail) * (1 - Math.exp(-RATE.tail * dt));
  }

  /** Jump straight to the targets (a load, a first frame). */
  snap(): void {
    const g = this.goal;
    this.look = g.look; this.neck = g.neck; this.head = g.head; this.lower = g.lower; this.tail = g.tail;
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
