/**
 * The dragon's procedural idle (M7a): breathing, blinking and a slow weight shift, driven
 * by the genome. No three.js, so the mesher's worker can use it.
 *
 * The idle is a vertex-shader deformation keyed on per-vertex weights the mesher bakes
 * (STATE.md run 29), the same pattern as the foliage's `windBend`. It is not skinning:
 * the dragon stays one draw per material group, nothing allocates per frame, and the skin
 * graph — which `gate:parity` compares exactly against assetgen — is untouched, because
 * the weights are an output of the TS mesher only.
 *
 * Two halves live here:
 *   - `idleParams(genome)`: the timing and amplitudes, from body genes. Pure and
 *     deterministic; the per-dragon phases come from the gid through the seeded `Rng`.
 *   - `bakeIdle(...)`: the per-vertex weights, called by ./arrays.ts. Each is a unit
 *     displacement; the shader (src/render/idle.ts) scales it by `idleParams` and a wave.
 *
 * The three weights, in the mesh's own frame (three.js: x forward, y up, z to the right):
 *
 *   breath (vec3)  a radial field about the torso's centre line, 1 at the torso's skin,
 *                  shrinking linearly inside it and fading to 0 by BREATH_REACH radii out,
 *                  and 0 at and below SWAY_FOOT, as the sway is.
 *                  Along the body it is a bump over the rib cage, 0 at the hip and peaking
 *                  toward the chest. The ribs swell sideways and down; the back hardly
 *                  moves (BREATH_UP), so the dorsal spikes and wing roots stay put.
 *   sway (float)   0 at and below SWAY_FOOT (the feet and toes stay planted), smoothly
 *                  rising to 1 at SWAY_TOP_FRAC of the lower of hip and shoulder, and 1
 *                  above: legs lean, the body, wings and head shift as one.
 *   blink (vec3)   on the eyes only: the displacement that shuts the eye. The eyeball
 *                  squashes vertically toward its centre to a slit (BLINK_SQUASH), and its
 *                  glint collapses into the eyeball, where the skull and eye hide it.
 *
 * Breath and sway are functions of position alone, applied to every part alike. A smooth
 * field with a small gradient moves neighbouring parts together, so a wing root cannot
 * part from the shoulder it overlaps and a sway cannot push a wing through the body.
 */
import type { Genome, Phenotype } from '../../core/genome';
import { Rng } from '../../core/rng';
import type { Graph, Anchors } from './graph';

/** Seconds and world units (the dragon's own units: a torso is about 1 tall). */
export interface IdleParams {
  /** Seconds per breath, in and out. */
  breathPeriod: number;
  /** Chest swell at the torso's skin at full inhale, world units. */
  breathDepth: number;
  /** Seconds from one blink's start to the next. */
  blinkInterval: number;
  /** Seconds one blink takes, shut and open again. */
  blinkDuration: number;
  /** Peak sideways weight shift of the body over the planted feet, world units. */
  swayAmp: number;
  /** Seconds per side-to-side weight shift. */
  swayPeriod: number;
  /** Per-dragon offsets in [0, 1) of each cycle, so a sheet does not breathe in unison. */
  breathPhase: number;
  blinkPhase: number;
  swayPhase: number;
}

/** Where a gene sits in its documented range (docs/GENOME.md), 0 to 1. */
const unit = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

/** Bounds every `IdleParams` field stays inside, whatever the genome. Tests hold them. */
export const IDLE_BOUNDS = {
  breathPeriod: [2.6, 5.0],
  breathDepth: [0.014, 0.051],
  blinkInterval: [3.5, 6.0],
  blinkDuration: [0.16, 0.26],
  swayAmp: [0.020, 0.060],
  swayPeriod: [4.1, 8.9],
} as const;

/**
 * The genome's idle. Formulas, with each gene normalised to its documented range
 * (m = bodyMass, c = chestDepth, l = legLength, h = headSize, all 0..1; LL the raw
 * legLength):
 *
 *   breathPeriod  = 2.6 + 2.4 m                          heavier breathes slower
 *   breathDepth   = (0.014 + 0.014 m) * (1 + 0.8 c)      and deeper; a deep chest swells more
 *   blinkInterval = 3.5 + 2.5 m                          a heavy dragon blinks less often
 *   blinkDuration = 0.16 + 0.10 h                        a big eye takes longer to shut
 *   swayAmp       = (0.025 + 0.025 l) * (1.2 - 0.4 m)    long legs shift further, mass damps it
 *   swayPeriod    = (5.0 + 2.5 m) * sqrt(LL)             a pendulum: long legs and mass slow it
 *
 * Phases are three draws from `Rng` seeded with the gid's first 32 bits, so a dragon keeps
 * its rhythm across reloads and threads and two dragons rarely share one.
 */
export function idleParams(genome: Genome): IdleParams {
  return idleParamsOf(genome.phenotype, genome.gid());
}

/** `idleParams` from a phenotype and gid, for callers that hold only those. */
export function idleParamsOf(p: Phenotype, gid: string): IdleParams {
  const m = unit(p.bodyMass, 0.70, 1.45);
  const c = unit(p.chestDepth, 0.80, 1.30);
  const l = unit(p.legLength, 0.70, 1.40);
  const h = unit(p.headSize, 0.78, 1.40);
  const LL = 0.70 + 0.70 * l;
  const seed = Number.parseInt(gid.slice(0, 8), 16);
  const rng = new Rng(Number.isSafeInteger(seed) ? seed : 0);
  return {
    breathPeriod: 2.6 + 2.4 * m,
    breathDepth: (0.014 + 0.014 * m) * (1 + 0.8 * c),
    blinkInterval: 3.5 + 2.5 * m,
    blinkDuration: 0.16 + 0.10 * h,
    swayAmp: (0.025 + 0.025 * l) * (1.2 - 0.4 * m),
    swayPeriod: (5.0 + 2.5 * m) * Math.sqrt(LL),
    breathPhase: rng.next(),
    blinkPhase: rng.next(),
    swayPhase: rng.next(),
  };
}

/* ---- the baked per-vertex weights ---------------------------------------------------- */

/** The rib cage's swell along the body: 0 at the hip, full from BREATH_RISE, 0 past the shoulder. */
export const BREATH_RISE = 0.55;
export const BREATH_FALL: readonly [number, number] = [0.80, 1.05];
/** The radial field fades from the torso's radius to this many radii out. */
export const BREATH_REACH = 1.7;
/** How far the belly drops and the back rises, against the flanks' 1. */
export const BREATH_DOWN = 0.75;
export const BREATH_UP = 0.15;
/** Sway weight is 0 at and below this height: the feet and toes (graph.ts addLimbs). */
export const SWAY_FOOT = 0.30;
/** ...and 1 from this fraction of the lower of hip and shoulder height. */
export const SWAY_TOP_FRAC = 0.85;
/** How much of its height a shut eye loses: the slit left is 1 − this. */
export const BLINK_SQUASH = 0.92;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The torso's centre line, in the mesh's frame: x, centre height and radius per node. */
export interface TorsoLine { x: number[]; y: number[]; r: number[] }

/** The four torso nodes (hip, two ribs, shoulder) from a skin graph, z-up to y-up. */
export function torsoLine(g: Graph, idx: Anchors): TorsoLine {
  const out: TorsoLine = { x: [], y: [], r: [] };
  // graph.ts skeleton: the torso nodes are consecutive, hip first, shoulder last.
  for (let n = idx.hip; n <= idx.shoulder; n++) {
    out.x.push(g.v[n]![0]);
    out.y.push(g.v[n]![2]);
    out.r.push(g.r[n]!);
  }
  return out;
}

/** The sway weight at height `y` above the ground, for a torso line. */
export function swayWeight(y: number, t: TorsoLine): number {
  const top = Math.max(SWAY_FOOT + 0.2, SWAY_TOP_FRAC * Math.min(t.y[0]!, t.y[t.y.length - 1]!));
  return smooth(SWAY_FOOT, top, y);
}

/**
 * The breath field at (x, y, z) in the mesh's frame: the unit displacement, written to
 * `out[o..o+2]`. Its magnitude is at most 1 (on the torso's skin at the rib cage's peak)
 * and it is continuous everywhere.
 */
export function breathField(x: number, y: number, z: number, t: TorsoLine, out: Float32Array | number[], o = 0): void {
  const xs = t.x, n = xs.length;
  const x0 = xs[0]!, x1 = xs[n - 1]!;
  const s = (x - x0) / (x1 - x0);
  const along = smooth(0, BREATH_RISE, s) * (1 - smooth(BREATH_FALL[0], BREATH_FALL[1], s));
  if (along <= 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; return; }
  // Centre height and radius at x, linear between the torso nodes, held at the ends.
  let k = 0;
  while (k < n - 2 && x > xs[k + 1]!) k++;
  const f = Math.min(1, Math.max(0, (x - xs[k]!) / (xs[k + 1]! - xs[k]!)));
  const cy = t.y[k]! + (t.y[k + 1]! - t.y[k]!) * f;
  const r = t.r[k]! + (t.r[k + 1]! - t.r[k]!) * f;
  const dy = y - cy;
  const d = Math.hypot(dy, z);
  // |o| / r inside the torso, fading to 0 by BREATH_REACH radii out: never above 1. Nothing
  // at or below the foot line breathes, so a low belly cannot drag a foot along.
  const w = along * smooth(SWAY_FOOT, SWAY_FOOT + 0.2, y) * (d <= r ? 1 / r : (1 - smooth(r, BREATH_REACH * r, d)) / d);
  out[o] = 0;
  out[o + 1] = w * dy * (dy < 0 ? BREATH_DOWN : BREATH_UP);
  out[o + 2] = w * z;
}

/**
 * Bake the idle weights for a merged dragon mesh in the three.js frame. `eyes` are the
 * eyeball centres (one per side), `eyeVerts` / `glintVerts` the vertex index ranges
 * [start, end) of the eyeballs and their glints. Returns `breathSway` (4 per vertex:
 * breath xyz, sway) and `blink` (3 per vertex).
 */
export function bakeIdle(
  position: Float32Array, line: TorsoLine,
  eyes: readonly [number, number, number][],
  eyeVerts: readonly [number, number][], glintVerts: readonly [number, number][],
): { breathSway: Float32Array; blink: Float32Array } {
  const nv = position.length / 3;
  const breathSway = new Float32Array(nv * 4);
  const blink = new Float32Array(nv * 3);
  const b: number[] = [0, 0, 0];
  for (let i = 0; i < nv; i++) {
    const x = position[3 * i]!, y = position[3 * i + 1]!, z = position[3 * i + 2]!;
    breathField(x, y, z, line, b);
    breathSway[4 * i] = b[0]!;
    breathSway[4 * i + 1] = b[1]!;
    breathSway[4 * i + 2] = b[2]!;
    breathSway[4 * i + 3] = swayWeight(y, line);
  }
  const eyeOf = (z: number) => {
    let best = eyes[0]!;
    for (const e of eyes) if (Math.abs(e[2] - z) < Math.abs(best[2] - z)) best = e;
    return best;
  };
  for (const [s, e] of eyeVerts) {
    for (let i = s; i < e; i++) {
      const c = eyeOf(position[3 * i + 2]!);
      blink[3 * i + 1] = BLINK_SQUASH * (c[1] - position[3 * i + 1]!);
    }
  }
  for (const [s, e] of glintVerts) {
    for (let i = s; i < e; i++) {
      const c = eyeOf(position[3 * i + 2]!);
      for (let a = 0; a < 3; a++) blink[3 * i + a] = c[a]! - position[3 * i + a]!;
    }
  }
  return { breathSway, blink };
}
