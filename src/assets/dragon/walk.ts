/**
 * The dragon's walk (M7b), driven by the genome: how long a stride is, how fast the legs
 * cycle, how long each foot stays down, and the order the feet fall in. Pure and
 * deterministic, with no three.js; src/render/walk.ts poses the skeleton from it.
 *
 * The gait is a quadruped's **lateral-sequence walk**: the feet fall in the order left hind,
 * left fore, right hind, right fore, a quarter cycle apart (`phase`, in LEG_NAMES order).
 * Each foot is planted (stance) for `duty` of the cycle and swings for the rest. In one
 * cycle every foot steps once, so the body travels one `stride`, at `speed = stride / period`.
 */
import type { Genome, Phenotype } from '../../core/genome';
import { LEG_NAMES } from './rig';

export interface WalkParams {
  /** World units the body travels per cycle; each foot steps this far. */
  stride: number;
  /** Seconds per gait cycle. */
  period: number;
  /** stride / period, world units per second. */
  speed: number;
  /** Share of the cycle each foot is planted, 0..1. */
  duty: number;
  /** Each foot's touchdown, as a fraction of the cycle, in LEG_NAMES order (LH, LF, RH, RF). */
  phase: [number, number, number, number];
  /** How high a swinging foot lifts at mid-swing, world units: toe clearance. */
  lift: number;
  /** How far the body sinks while walking, as a fraction of the leg's drop (a softer, bent-kneed stance). */
  crouch: number;
  /** Vertical bob of the body, world units, twice a cycle. */
  bob: number;
  /** Side-to-side swing of the hips and of the shoulders, radians: the spine's lateral flex. */
  flex: number;
  /** Pitch of the hips with the gait, radians, twice a cycle. */
  pitch: number;
  /** Tail sway per tail segment, radians, travelling down the tail. */
  tailSway: number;
}

/** Where a gene sits in its documented range (docs/GENOME.md), 0 to 1. */
const unit = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

/** Bounds every `WalkParams` field stays inside, whatever the genome. Tests hold them. */
export const WALK_BOUNDS = {
  stride: [0.336, 0.672],
  period: [0.65, 1.51],
  speed: [0.30, 0.80],
  duty: [0.62, 0.76],
  lift: [0.10, 0.17],
  crouch: [0.05, 0.08],
  bob: [0.010, 0.022],
  flex: [0.040, 0.070],
  pitch: [0.010, 0.020],
  tailSway: [0.08, 0.14],
} as const;

/** The lateral sequence: LH, LF, RH, RF a quarter cycle apart. */
export const LATERAL_SEQUENCE: readonly [number, number, number, number] = [0, 0.25, 0.5, 0.75];

/**
 * The genome's walk. With m = bodyMass and t = tailLength normalised to their documented
 * ranges (0..1) and LL the raw legLength (0.70–1.40):
 *
 *   stride   = 0.48 LL                          ∝ legLength
 *   period   = (0.80 + 0.50 m) √(LL / 1.05)     a heavier dragon steps slower; longer legs swing slower, as pendulums
 *   speed    = stride / period
 *   duty     = 0.62 + 0.14 m                    a heavy dragon keeps more feet down
 *   lift     = 0.04 + 0.09 LL                   toe clearance grows with the leg
 *   crouch   = 0.05 + 0.03 m                    weight sinks the walk
 *   bob      = 0.010 + 0.012 m
 *   flex     = 0.070 − 0.030 m                  a light body swings its spine more
 *   pitch    = 0.010 + 0.010 m
 *   tailSway = 0.08 + 0.06 t
 */
export function walkParams(genome: Genome): WalkParams {
  return walkParamsOf(genome.phenotype);
}

/** `walkParams` from a phenotype. */
export function walkParamsOf(p: Phenotype): WalkParams {
  const m = unit(p.bodyMass, 0.70, 1.45);
  const t = unit(p.tailLength, 0.60, 1.80);
  const LL = Math.min(1.40, Math.max(0.70, p.legLength));
  const stride = 0.48 * LL;
  const period = (0.80 + 0.50 * m) * Math.sqrt(LL / 1.05);
  return {
    stride, period, speed: stride / period,
    duty: 0.62 + 0.14 * m,
    phase: [...LATERAL_SEQUENCE] as [number, number, number, number],
    lift: 0.04 + 0.09 * LL,
    crouch: 0.05 + 0.03 * m,
    bob: 0.010 + 0.012 * m,
    flex: 0.070 - 0.030 * m,
    pitch: 0.010 + 0.010 * m,
    tailSway: 0.08 + 0.06 * t,
  };
}

/** Leg names, re-exported for callers that hold only the walk. */
export { LEG_NAMES };
