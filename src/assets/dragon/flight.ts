/**
 * The dragon's flight (M7c), driven by the genome: how fast the wings beat, how far they
 * sweep, how the cycle splits between the down- and upstroke, how much the body heaves, and
 * how it holds a glide. Pure and deterministic, with no three.js; src/render/flight.ts poses
 * the wing chains (./rig.ts `RigWing`) from it.
 *
 * **One beat** runs from the top of the stroke (phase 0) down to the bottom (phase `down`) and
 * back up. The humerus sweeps `stroke` radians about the body's long axis, `upShare` of it above
 * the rest pose and the rest below; the hand follows the arm a little late (`handLag`), bent
 * by `handBend` of the stroke, so the wing flexes like a sheet rather than a board. On the
 * upstroke the arm folds in its own plane, elbow `fold` and wrist `wristFold`, and the finger
 * fan closes onto its last finger as far; on the downstroke the fan opens to `fanOpen`. The
 * body heaves against the stroke, highest at the bottom of the downstroke (`heave`).
 *
 * **The glide** holds the wings spread a little above rest (`glideLift`), the fan open, the
 * body banking `bank` either way and rising and sinking `soar` world units over `soarPeriod`.
 */
import type { Genome, Phenotype } from '../../core/genome';

export interface FlightParams {
  /** Seconds per wing beat. Big wings and heavy bodies beat slower. */
  period: number;
  /** The humerus's sweep from the top of the stroke to the bottom, radians. */
  stroke: number;
  /** Share of `stroke` above the rest pose; the rest is below it. */
  upShare: number;
  /** Share of the beat spent on the downstroke, 0..1. */
  down: number;
  /** The hand's bend at the wrist, out of the wing's plane, as a share of `stroke`. */
  handBend: number;
  /** How late the hand follows the arm, as a share of the beat. */
  handLag: number;
  /** Elbow and wrist fold at the middle of the upstroke, radians, in the wing's plane. */
  fold: number;
  wristFold: number;
  /**
   * The finger fan's spread mid-downstroke, as a share of its rest spread. On the upstroke the
   * fan closes onto its last finger by as much as `fold` and `wristFold` turn the hand back.
   */
  fanOpen: number;
  /** The body's rise and fall against the stroke, world units, half of it either way. */
  heave: number;
  /** The glide: the wings' lift above rest (radians), the bank either way (radians), its period (s), the soar (world units). */
  glideLift: number;
  bank: number;
  soarPeriod: number;
  soar: number;
}

/** Where a gene sits in its documented range (docs/GENOME.md), 0 to 1. */
const unit = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

/** Bounds every `FlightParams` field stays inside, whatever the genome. Tests hold them. */
export const FLIGHT_BOUNDS = {
  period: [0.55, 1.30],
  stroke: [0.80, 1.10],
  upShare: [0.66, 0.66],
  down: [0.52, 0.62],
  handBend: [0.30, 0.45],
  handLag: [0.08, 0.08],
  fold: [0.30, 0.45],
  wristFold: [0.35, 0.50],
  fanOpen: [1.06, 1.06],
  heave: [0.06, 0.16],
  glideLift: [0.04, 0.10],
  bank: [0.10, 0.22],
  soarPeriod: [4.0, 8.0],
  soar: [0.10, 0.16],
} as const;

/**
 * The genome's flight. With s = wingSpan, m = bodyMass, h = wingShape and d = wingDroop, each
 * normalised to its documented range (0..1):
 *
 *   period     = 0.55 + 0.50 s + 0.25 m      big wings and heavy bodies beat slower
 *   stroke     = 1.10 − 0.30 s               big wings sweep a smaller angle
 *   down       = 0.52 + 0.10 m               a heavy body spends longer pushing down
 *   handBend   = 0.30 + 0.15 h               a falcate hand flexes more
 *   fold       = 0.30 + 0.15 h               ... and folds more on the upstroke
 *   wristFold  = 0.35 + 0.15 h
 *   heave      = 0.06 + 0.06 s + 0.04 (1 − m)  big wings lift a light body furthest
 *   glideLift  = 0.04 + 0.06 (1 − d)         a drooping wing glides flatter
 *   bank       = 0.10 + 0.12 h               a falcate glider banks harder
 *   soarPeriod = 4.0 + 3.0 (1 − h) + 1.0 s   broad wings soar slower
 *   soar       = 0.10 + 0.06 s
 */
export function flightParams(genome: Genome): FlightParams {
  return flightParamsOf(genome.phenotype);
}

/** `flightParams` from a phenotype. */
export function flightParamsOf(p: Phenotype): FlightParams {
  const s = unit(p.wingSpan, 0.55, 1.65);
  const m = unit(p.bodyMass, 0.70, 1.45);
  const h = unit(p.wingShape, 0.0, 1.0);
  const d = unit(p.wingDroop, 0.0, 1.0);
  return {
    period: 0.55 + 0.50 * s + 0.25 * m,
    stroke: 1.10 - 0.30 * s,
    upShare: 0.66,
    down: 0.52 + 0.10 * m,
    handBend: 0.30 + 0.15 * h,
    handLag: 0.08,
    fold: 0.30 + 0.15 * h,
    wristFold: 0.35 + 0.15 * h,
    fanOpen: 1.06,
    heave: 0.06 + 0.06 * s + 0.04 * (1 - m),
    glideLift: 0.04 + 0.06 * (1 - d),
    bank: 0.10 + 0.12 * h,
    soarPeriod: 4.0 + 3.0 * (1 - h) + 1.0 * s,
    soar: 0.10 + 0.06 * s,
  };
}
