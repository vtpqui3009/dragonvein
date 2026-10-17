/**
 * The wild dragon on the hero island, and the keeper the player walks (M8b).
 *
 * docs/GDD.md §The loop: a wild dragon is tamed by "reading its behaviour, not throwing a
 * ball". This file is that behaviour, as deterministic sim state: what the dragon notices,
 * how close it lets the keeper come, how fast it calms, and when it flies off. All of it is
 * stepped at 20 Hz from `step` (./world.ts), reads only the world and a `Deck`, draws only
 * from `world.rng`, and allocates nothing per tick.
 *
 * **Positions are 2D on the deck**, in the island's own frame: `[x, z]` world units, the
 * island's centre at the origin. The sim does not know heights; the renderer places both
 * bodies on the deck from a height grid. A heading θ faces (cos θ, sin θ) in (x, z).
 *
 * **Temperament comes from the genome** (CLAUDE.md §0: the genetics must be visible), from
 * genes that already exist, through one number, the dragon's skittishness k in [0, 1]:
 *
 *   k = clamp01( 0.35 s + 0.35 (1 − m) + 0.15 h + NERVE[element] )
 *
 * with s = wingSpan, m = bodyMass and h = headSize each normalised to its documented range
 * (docs/GENOME.md). Big wings make a dragon flighty, mass makes it steady, a big head (big
 * eyes) makes it watchful, and the primary element shifts it (a gale dragon is the most
 * nervous, a stone one the steadiest). From k:
 *
 *   notice    = 2.9 + 1.9 k       it looks up when the keeper comes this close
 *   flight    = 1.2 + 1.3 k       it flies off when the keeper comes this close (at calm 0)
 *   comfort   = flight + 1.3      the ring inside which a still keeper calms it
 *   calmRate  = 0.12 (1.45 − k)   calm gained per second while the keeper is still or slow there
 *   rush      = 2.2 − 0.6 k       a keeper faster than this, closing, is a rush (walk 1.2, run 2.8)
 *   calmLoss  = 0.3 + 0.3 k       calm a flight costs
 *
 * and, from the walk's own genes, its ground speed (the gait's, see `gaitSpeed`) and its
 * flight speed, 2.2 + 1.0 s. Every field is bounded and monotone in each gene it names;
 * tests/wild.test.ts holds both, and the spread across the sheet's eight dragons.
 *
 * **The reaction.** Each tick, with d the keeper's distance, v its speed and c its closing
 * speed (positive toward the dragon):
 *
 *   - **flee** when d < the flight distance (which shrinks as calm rises:
 *     max(FLIGHT_FLOOR, flight · (1 − 0.55 calm))), or on a rush inside the notice radius.
 *     It loses `calmLoss`, takes off where it stands, flies to the clear spot on the deck
 *     farthest from the keeper of LAND_TRIES drawn from the Rng, and lands;
 *   - **calm** rises at `calmRate` only while v < SLOW inside the comfort ring, and otherwise
 *     decays, faster the farther the keeper is;
 *   - inside the notice radius: **wary** (it turns its tail to the keeper and walks off)
 *     while the keeper walks in faster than SLOW, inside the comfort ring, and calm < 0.5;
 *     **settle** once calm reaches SETTLE_ENTER with the keeper slow; else **alert** (it
 *     turns to face the keeper);
 *   - outside it (with HYSTERESIS): **graze** for a drawn while, then **wander** to a drawn
 *     clear spot nearby, and graze again.
 *
 * **The keeper** walks to the spot the player tapped (`keeperTo`), accelerating at
 * KEEPER_ACCEL to its pace and easing to a stop. The pace is KEEPER_RUN on a double tap, else
 * KEEPER_WALK, but a short step is a careful one: CAREFUL × its length, so a tap closer than
 * SLOW / CAREFUL creeps in below SLOW, which is how a player calms a dragon on the way in.
 *
 * **Bodies.** The keeper is a circle; the dragon is three circles along its heading (head,
 * torso, haunch), at DRAGON_SCALE. Neither walks through the other, through an obstacle on
 * the deck, or off it. A body found overlapping (a deck that changed between builds, a
 * migrated save) is moved to the nearest clear spot, without a draw.
 */
import { GENES, type Element, type GeneName, type GenomeJson } from '../core/genome';
import { Rng } from '../core/rng';
import type { World } from './world';

/** Seconds per tick. ./world.ts TICK_HZ is 20; tests/wild.test.ts holds the two together. */
export const WILD_DT = 1 / 20;

/** The world-units-per-mesh-unit the renderer draws a dragon at; its footprint here is in world units. */
export const DRAGON_SCALE = 0.27;

export type WildState = 'graze' | 'wander' | 'alert' | 'wary' | 'flee' | 'settle';
export const WILD_STATES: readonly WildState[] = ['graze', 'wander', 'alert', 'wary', 'flee', 'settle'];

/** Schema 2: the island's one wild dragon. Plain JSON; every field is restored exactly by a load. */
export interface WildDragon {
  /** Its dragon id, reserved from `world.nextId`: the id it keeps if it is tamed (M8c). */
  id: number;
  genome: GenomeJson;
  /** Deck position (island frame), world units. Mutated in place. */
  pos: [number, number];
  /** Facing (cos θ, sin θ), radians in (−π, π]. */
  heading: number;
  state: WildState;
  /** 0 skittish … 1 at ease. */
  calm: number;
  /** Ticks spent in `state`. */
  t: number;
  /** Ticks `state` lasts when it has a length (a graze, a flight); 0 otherwise. */
  dur: number;
  /** A wander's destination, or a flight's landing spot. */
  goal: [number, number];
  /** A flight's takeoff spot. */
  from: [number, number];
}

/** Schema 2: the keeper the player walks. */
export interface Keeper {
  pos: [number, number];
  /** Where it is walking; equal to `pos` when standing. */
  goal: [number, number];
  /**
   * Top speed for this walk, world units per second: KEEPER_RUN for a run (a double tap),
   * else KEEPER_WALK, or slower for a short step (`keeperTo`). 0 when standing.
   */
  pace: number;
  /** Current speed, world units per second (it accelerates and eases to a stop). */
  v: number;
}

/**
 * The walkable deck: a disc, minus obstacle circles (trunks, rocks, crystals, shrubs), plus
 * where a new dragon and keeper start. Static configuration, not world state: the page
 * derives it once from the island's seeded layout (src/main.ts) and passes it to every step.
 */
export interface Deck {
  radius: number;
  /** x, z, r triples. */
  obstacles: readonly number[];
  home: readonly [number, number];
  gate: readonly [number, number];
}

/** No obstacles: the tests' deck, and the default for a world made without one. */
export const OPEN_DECK: Deck = { radius: 5.6, obstacles: [], home: [1.2, 1.8], gate: [-4.2, -2.4] };

// --- temperament -----------------------------------------------------------------------

/** Primary element → skittishness offset. */
export const NERVE: Readonly<Record<Element, number>> = {
  gale: 0.25, umbra: 0.15, ember: 0.10, tide: 0.05, jade: -0.05, stone: -0.15,
};

export interface Temperament {
  /** Skittishness k, 0..1: every other field follows from it (and the walk and wing genes). */
  skittish: number;
  notice: number;
  flight: number;
  comfort: number;
  calmRate: number;
  rush: number;
  calmLoss: number;
  /** Ground speed, world units per second. */
  walk: number;
  /** Air speed, world units per second. */
  fly: number;
}

/** The genes temperament reads. */
export type TemperGenes = Pick<Record<GeneName, number>, 'bodyMass' | 'wingSpan' | 'headSize' | 'legLength'>;

/** Bounds every `Temperament` field stays inside, whatever the genome. Tests hold them. */
export const TEMPER_BOUNDS = {
  skittish: [0, 1], notice: [2.9, 4.8], flight: [1.2, 2.5], comfort: [2.5, 3.8], calmRate: [0.054, 0.174],
  rush: [1.6, 2.2], calmLoss: [0.3, 0.6], walk: [0.12, 0.33], fly: [2.2, 3.2],
} as const;

/** The walk's ground speed, as src/assets/dragon/walk.ts `walkParamsOf` (stride / period), times WALK_RATE. */
export const WALK_RATE = 1.5;

const unit = (v: number, g: GeneName) => {
  const [lo, hi] = GENES[g];
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The dragon's gait speed in world units per second: `stride / period` of
 * src/assets/dragon/walk.ts at DRAGON_SCALE, times WALK_RATE. The sim cannot import the
 * asset code, so the two expressions are kept equal by tests/wild.test.ts; the renderer
 * runs the gait clock from the distance actually walked, so the feet stay planted either way.
 */
export function gaitSpeed(legLength: number, bodyMass: number): number {
  const m = unit(bodyMass, 'bodyMass');
  const LL = Math.min(1.40, Math.max(0.70, legLength));
  return WALK_RATE * DRAGON_SCALE * (0.48 * LL) / ((0.80 + 0.50 * m) * Math.sqrt(LL / 1.05));
}

export function blankTemperament(): Temperament {
  return { skittish: 0, notice: 0, flight: 0, comfort: 0, calmRate: 0, rush: 0, calmLoss: 0, walk: 0, fly: 0 };
}

/** Temperament from expressed genes and the primary element. Pure; writes `out`. */
export function temperamentOf(p: TemperGenes, element: Element, out: Temperament = blankTemperament()): Temperament {
  const s = unit(p.wingSpan, 'wingSpan');
  const m = unit(p.bodyMass, 'bodyMass');
  const h = unit(p.headSize, 'headSize');
  const k = clamp01(0.35 * s + 0.35 * (1 - m) + 0.15 * h + NERVE[element]);
  out.skittish = k;
  out.notice = 2.9 + 1.9 * k;
  out.flight = 1.2 + 1.3 * k;
  out.comfort = out.flight + 1.3;
  out.calmRate = 0.12 * (1.45 - k);
  out.rush = 2.2 - 0.6 * k;
  out.calmLoss = 0.3 + 0.3 * k;
  out.walk = gaitSpeed(p.legLength, p.bodyMass);
  out.fly = 2.2 + 1.0 * s;
  return out;
}

/** A gene's expressed value straight from its stored alleles (docs/GENOME.md §Diploid), for the `f` genes. */
export function expressJson(g: GenomeJson, name: GeneName): number {
  const pair = g.g[name];
  const a = pair[0], b = pair[1];
  const [lo, hi] = GENES[name];
  let v: number;
  if (a[1] && !b[1]) v = a[0];
  else if (b[1] && !a[1]) v = b[0];
  else v = (a[0] + b[0]) * 0.5;
  return Math.min(Math.max(v, lo), hi);
}

/** `temperamentOf` a stored genome. Allocates only when `out` is omitted. */
export function temperament(g: GenomeJson, out: Temperament = blankTemperament()): Temperament {
  scratchGenes.bodyMass = expressJson(g, 'bodyMass');
  scratchGenes.wingSpan = expressJson(g, 'wingSpan');
  scratchGenes.headSize = expressJson(g, 'headSize');
  scratchGenes.legLength = expressJson(g, 'legLength');
  return temperamentOf(scratchGenes, g.element[0] as Element, out);
}
const scratchGenes: TemperGenes = { bodyMass: 0, wingSpan: 0, headSize: 0, legLength: 0 };

// --- the bodies ------------------------------------------------------------------------

export const KEEPER_RADIUS = 0.16;
export const KEEPER_WALK = 1.2;
export const KEEPER_RUN = 2.8;
/** World units per second², both speeding up and easing to a stop. */
export const KEEPER_ACCEL = 3.0;
/** A keeper slower than this is "still or slow": the only pace that calms a dragon. */
export const SLOW = 0.5;
/** A step's pace per unit of its length (1/s): a step shorter than SLOW / CAREFUL = 0.59 creeps. */
export const CAREFUL = 0.85;

/**
 * The dragon's footprint: circles along its heading (offset, radius), world units, sized to
 * the sheet dragons at DRAGON_SCALE — the head and neck, the torso with most of the resting
 * wings' spread (they stand at shrub height), the haunch and tail root. tests/wild.test.ts checks the skeleton's torso and head
 * nodes fall inside them for the 32 fixture genomes.
 */
export const BODY_OFFSET: readonly number[] = [0.5, 0, -0.52];
export const BODY_RADIUS: readonly number[] = [0.32, 0.68, 0.34];
/** How close a fully calm dragon still lets the keeper come: just clear of its body. */
export const FLIGHT_FLOOR = 0.68 + KEEPER_RADIUS + 0.4;

// --- the reaction ----------------------------------------------------------------------

/** Calm at which a watching dragon settles, and below which a settled one is only watching. */
export const SETTLE_ENTER = 0.3;
export const SETTLE_EXIT = 0.2;
/** Calm at which a keeper walking in no longer makes it wary. */
export const WARY_BELOW = 0.5;
/** Calm lost per second when not gaining, plus this much per unit of distance past the comfort ring. */
export const CALM_DECAY = 0.01;
export const CALM_DECAY_FAR = 0.008;
/** It stops watching only this far past its notice radius. */
export const HYSTERESIS = 0.35;
/** A state other than flee holds at least this many ticks before it changes (no flicker). */
export const DWELL = 8;
/** A flight's takeoff and landing, seconds on the spot each; and how many landing spots it weighs. */
export const TAKEOFF_S = 0.9;
export const LAND_S = 0.9;
export const LAND_TRIES = 10;
/** A flight is in the air at least this long, so even a short hop rises and falls at a wingbeat's pace. */
export const MIN_AIR_S = 1.4;
/** Turn rates, radians per second. */
const TURN_WALK = 1.6, TURN_ALERT = 1.4, TURN_WARY = 1.9, TURN_FLEE = 3.5;
/** A wander goes this far, and gives up (and grazes) after this multiple of the time it should take, plus 3 s. */
const WANDER_MIN = 0.9, WANDER_MAX = 2.6, WANDER_PATIENCE = 2.5;
/** A graze lasts this many seconds, drawn. */
const GRAZE_MIN_S = 3, GRAZE_MAX_S = 7;

/** One draw from the world's stream, in [0, 1). Allocation-free. */
const scratchRng = new Rng(1);
function draw(w: World): number {
  scratchRng.setState(w.rng);
  const v = scratchRng.next();
  scratchRng.writeState(w.rng);
  return v;
}

/** The temperament of the dragon being stepped, recomputed only when the genome changes. */
const cached = { gid: '', t: blankTemperament() };
function temperFor(d: WildDragon): Temperament {
  if (cached.gid !== d.genome.gid) {
    temperament(d.genome, cached.t);
    cached.gid = d.genome.gid;
  }
  return cached.t;
}

/** Length of (x, z). `Math.hypot` is variadic; this is the two-argument case, unboxed. */
const len = (x: number, z: number) => Math.sqrt(x * x + z * z);

const wrapAngle = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};
/** Turn `from` toward `to` by at most `max`. */
const turnToward = (from: number, to: number, max: number) => {
  const e = wrapAngle(to - from);
  return wrapAngle(from + (e > max ? max : e < -max ? -max : e));
};

/** Is a circle at (x, z) of radius r on the deck and clear of every obstacle? */
export function circleClear(deck: Deck, x: number, z: number, r: number): boolean {
  if (len(x, z) > deck.radius - r) return false;
  const o = deck.obstacles;
  for (let i = 0; i < o.length; i += 3) {
    if (len(x - o[i]!, z - o[i + 1]!) < r + o[i + 2]!) return false;
  }
  return true;
}

/** Is the dragon's whole footprint, centred at (x, z) facing `heading`, clear? */
export function bodyClear(deck: Deck, x: number, z: number, heading: number): boolean {
  const c = Math.cos(heading), s = Math.sin(heading);
  for (let i = 0; i < BODY_OFFSET.length; i++) {
    const off = BODY_OFFSET[i]!;
    if (!circleClear(deck, x + c * off, z + s * off, BODY_RADIUS[i]!)) return false;
  }
  return true;
}

/** Scratch output of `pushOut`. */
const push = { x: 0, z: 0 };

/**
 * Move a circle at (x, z) of radius r out of every obstacle and back onto the deck, and out
 * of the dragon's footprint when `dragon` is given. Writes `push`. Three passes, enough for
 * the island's scattered circles. Allocation-free.
 */
function pushOut(deck: Deck, x: number, z: number, r: number, dragon: WildDragon | null): void {
  let px = x, pz = z;
  const o = deck.obstacles;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < o.length; i += 3) {
      const dx = px - o[i]!, dz = pz - o[i + 1]!, min = r + o[i + 2]!;
      const d = len(dx, dz);
      if (d < min) {
        if (d < 1e-9) { px += min; continue; }
        px = o[i]! + (dx / d) * min;
        pz = o[i + 1]! + (dz / d) * min;
      }
    }
    if (dragon) {
      const c = Math.cos(dragon.heading), s = Math.sin(dragon.heading);
      for (let i = 0; i < BODY_OFFSET.length; i++) {
        const off = BODY_OFFSET[i]!, br = BODY_RADIUS[i]!;
        const cx = dragon.pos[0] + c * off, cz = dragon.pos[1] + s * off;
        const dx = px - cx, dz = pz - cz, min = r + br;
        const d = len(dx, dz);
        if (d < min) {
          if (d < 1e-9) { px += min; continue; }
          px = cx + (dx / d) * min;
          pz = cz + (dz / d) * min;
        }
      }
    }
    const R = deck.radius - r, d = len(px, pz);
    if (d > R) { px *= R / d; pz *= R / d; }
  }
  push.x = px;
  push.z = pz;
}

/** Is the footprint at (x, z, heading) clear of the deck's obstacles and edge, and of the keeper? */
function bodyFree(deck: Deck, x: number, z: number, heading: number, keeper: Keeper): boolean {
  if (!bodyClear(deck, x, z, heading)) return false;
  const c = Math.cos(heading), s = Math.sin(heading);
  for (let i = 0; i < BODY_OFFSET.length; i++) {
    const off = BODY_OFFSET[i]!;
    if (len(x + c * off - keeper.pos[0], z + s * off - keeper.pos[1]) < BODY_RADIUS[i]! + KEEPER_RADIUS) return false;
  }
  return true;
}

/**
 * Move the dragon to (x, z) facing `heading` if its footprint is free there; else keep the
 * turn alone, or the step alone, whichever is free; else stay. A footprint that starts clear
 * therefore stays clear: nothing ever pushes it into an obstacle. Returns true on the full move.
 */
function tryMove(deck: Deck, d: WildDragon, k: Keeper, x: number, z: number, heading: number): boolean {
  if (bodyFree(deck, x, z, heading, k)) {
    d.pos[0] = x; d.pos[1] = z; d.heading = heading;
    return true;
  }
  if (heading !== d.heading && bodyFree(deck, d.pos[0], d.pos[1], heading, k)) d.heading = heading;
  else if (bodyFree(deck, x, z, d.heading, k)) { d.pos[0] = x; d.pos[1] = z; }
  return false;
}

/**
 * The nearest spot to (x, z) where the footprint (heading `heading`) is clear, by rings of
 * 0.2 out to the deck's diameter. Writes `push`; false (and `push` = (x, z)) if none. No draw.
 */
function nearestClear(deck: Deck, x: number, z: number, heading: number): boolean {
  push.x = x; push.z = z;
  if (bodyClear(deck, x, z, heading)) return true;
  for (let ring = 1; ring * 0.2 <= 2 * deck.radius; ring++) {
    const rr = ring * 0.2, n = 8 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr;
      if (bodyClear(deck, cx, cz, heading)) { push.x = cx; push.z = cz; return true; }
    }
  }
  return false;
}

/** The keeper's velocity this tick, written by `stepKeeper` and read by the dragon's step that follows. */
const kv = { x: 0, z: 0, speed: 0 };

/** Is the dragon on the ground (its footprint solid), rather than in the air mid-flight? */
function grounded(d: WildDragon): boolean {
  if (d.state !== 'flee') return true;
  const up = Math.round(TAKEOFF_S / WILD_DT), down = d.dur - Math.round(LAND_S / WILD_DT);
  return d.t < up || d.t >= down;
}

function stepKeeper(k: Keeper, d: WildDragon, deck: Deck): void {
  const px = k.pos[0], pz = k.pos[1];
  const gx = k.goal[0] - px, gz = k.goal[1] - pz;
  const dist = len(gx, gz);
  if (dist < 1e-6) {
    k.v = 0;
    k.pace = 0;
    kv.x = 0; kv.z = 0; kv.speed = 0;
    return;
  }
  const v = Math.min(k.pace, k.v + KEEPER_ACCEL * WILD_DT, Math.sqrt(2 * KEEPER_ACCEL * dist));
  const want = Math.min(dist, v * WILD_DT);
  pushOut(deck, px + (gx / dist) * want, pz + (gz / dist) * want, KEEPER_RADIUS, grounded(d) ? d : null);
  const mx = push.x - px, mz = push.z - pz;
  const moved = len(mx, mz);
  // Blocked: barely moved, or slid away from the goal. Stand where it is.
  const progress = (mx * gx + mz * gz) / dist;
  k.pos[0] = push.x;
  k.pos[1] = push.z;
  kv.x = mx / WILD_DT; kv.z = mz / WILD_DT; kv.speed = moved / WILD_DT;
  if (want > 1e-4 && progress < 0.15 * want) {
    k.goal[0] = k.pos[0]; k.goal[1] = k.pos[1];
    k.v = 0;
    k.pace = 0;
    return;
  }
  k.v = moved / WILD_DT;
  if (len(k.goal[0] - k.pos[0], k.goal[1] - k.pos[1]) < 1e-3) {
    k.pos[0] = k.goal[0]; k.pos[1] = k.goal[1];
    k.v = 0;
    k.pace = 0;
  }
}

function enter(d: WildDragon, state: WildState, dur = 0): void {
  d.state = state;
  d.t = 0;
  d.dur = dur;
}

function startGraze(w: World, d: WildDragon): void {
  enter(d, 'graze', Math.round((GRAZE_MIN_S + (GRAZE_MAX_S - GRAZE_MIN_S) * draw(w)) / WILD_DT));
}

/** Pick a clear wander spot nearby, or graze again if none of four draws is clear. */
function startWander(w: World, d: WildDragon, deck: Deck, keeperClear: number): void {
  for (let i = 0; i < 4; i++) {
    const a = 2 * Math.PI * draw(w);
    const r = WANDER_MIN + (WANDER_MAX - WANDER_MIN) * draw(w);
    const x = d.pos[0] + Math.cos(a) * r, z = d.pos[1] + Math.sin(a) * r;
    if (!bodyClear(deck, x, z, a)) continue;
    if (len(x - w.keeper.pos[0], z - w.keeper.pos[1]) < keeperClear) continue;
    d.goal[0] = x; d.goal[1] = z;
    enter(d, 'wander', Math.round((WANDER_PATIENCE * r / temperFor(d).walk + 3) / WILD_DT));
    return;
  }
  startGraze(w, d);
}

/** Take off: lose calm, pick the landing spot farthest from the keeper, and go. */
function startFlee(w: World, d: WildDragon, deck: Deck, T: Temperament): void {
  d.calm = Math.max(0, d.calm - T.calmLoss);
  d.from[0] = d.pos[0]; d.from[1] = d.pos[1];
  let bx = d.pos[0], bz = d.pos[1], best = -1;
  const kx = w.keeper.pos[0], kz = w.keeper.pos[1];
  for (let i = 0; i < LAND_TRIES; i++) {
    const a = 2 * Math.PI * draw(w);
    const r = (deck.radius - 0.6) * Math.sqrt(draw(w));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hop = len(x - d.pos[0], z - d.pos[1]);
    if (hop < 1.5) continue;
    if (!bodyClear(deck, x, z, Math.atan2(z - d.pos[1], x - d.pos[0]))) continue;
    const score = len(x - kx, z - kz);
    if (score > best) { best = score; bx = x; bz = z; }
  }
  d.goal[0] = bx; d.goal[1] = bz;
  const hop = len(bx - d.from[0], bz - d.from[1]);
  enter(d, 'flee', Math.round((TAKEOFF_S + Math.max(MIN_AIR_S, hop / T.fly) + LAND_S) / WILD_DT));
}

/** Where a flight is at tick t: on the takeoff spot, then along a smoothstep to the landing spot. */
export function fleeProgress(t: number, dur: number): number {
  const up = Math.round(TAKEOFF_S / WILD_DT), down = Math.round(LAND_S / WILD_DT);
  const travel = Math.max(1, dur - up - down);
  const u = Math.min(1, Math.max(0, (t - up) / travel));
  return u * u * (3 - 2 * u);
}

/** Advance the dragon one tick. The keeper has already moved (`kv` holds its velocity). */
function stepDragon(w: World, d: WildDragon, k: Keeper, deck: Deck): void {
  const T = temperFor(d);
  d.t++;
  if (d.state === 'flee') {
    const p = fleeProgress(d.t, d.dur);
    d.pos[0] = d.from[0] + (d.goal[0] - d.from[0]) * p;
    d.pos[1] = d.from[1] + (d.goal[1] - d.from[1]) * p;
    if (len(d.goal[0] - d.from[0], d.goal[1] - d.from[1]) > 1e-6) {
      d.heading = turnToward(d.heading, Math.atan2(d.goal[1] - d.from[1], d.goal[0] - d.from[0]), TURN_FLEE * WILD_DT);
    }
    if (d.t >= d.dur) {
      d.pos[0] = d.goal[0]; d.pos[1] = d.goal[1];
      const dist = len(k.pos[0] - d.pos[0], k.pos[1] - d.pos[1]);
      if (dist < T.notice) enter(d, 'alert');
      else startGraze(w, d);
    }
    return;
  }

  const dx = k.pos[0] - d.pos[0], dz = k.pos[1] - d.pos[1];
  const dist = len(dx, dz);
  const speed = kv.speed;
  const closing = dist > 1e-9 ? (dx * -kv.x + dz * -kv.z) / dist : 0;
  const slow = speed < SLOW;

  // Calm: it rises only while the keeper is still or slow inside the comfort ring.
  if (slow && dist <= T.comfort) d.calm = Math.min(1, d.calm + T.calmRate * WILD_DT);
  else d.calm = Math.max(0, d.calm - (CALM_DECAY + CALM_DECAY_FAR * Math.max(0, dist - T.comfort)) * WILD_DT);

  const flightDist = Math.max(FLIGHT_FLOOR, T.flight * (1 - 0.55 * d.calm));
  const rushing = speed >= T.rush && closing > 0.5 * speed;
  if (dist < flightDist || (rushing && dist < T.notice)) {
    startFlee(w, d, deck, T);
    return;
  }

  const watching = d.state === 'alert' || d.state === 'wary' || d.state === 'settle';
  const noticed = dist < T.notice || (watching && dist < T.notice + HYSTERESIS);
  const settled = d.t >= DWELL;
  if (!noticed) {
    if (watching) {
      if (settled) startGraze(w, d);
    } else if (d.state === 'graze') {
      if (d.t >= d.dur) startWander(w, d, deck, T.notice);
    } else if (d.state === 'wander') {
      const gx = d.goal[0] - d.pos[0], gz = d.goal[1] - d.pos[1];
      const left = len(gx, gz);
      if (left < 0.06 || d.t >= d.dur) startGraze(w, d);
      else {
        const h = turnToward(d.heading, Math.atan2(gz, gx), TURN_WALK * WILD_DT);
        const ahead = Math.max(0, Math.cos(wrapAngle(Math.atan2(gz, gx) - h)));
        const step = Math.min(left, T.walk * ahead * WILD_DT);
        tryMove(deck, d, k, d.pos[0] + Math.cos(h) * step, d.pos[1] + Math.sin(h) * step, h);
      }
    }
  } else {
    const walkingIn = !slow && closing > 0.3 && dist < T.comfort + 0.3;
    let next: WildState;
    if (d.state === 'settle') {
      next = walkingIn ? (d.calm >= WARY_BELOW ? 'alert' : 'wary') : d.calm < SETTLE_EXIT ? 'alert' : 'settle';
    } else if (walkingIn && d.calm < WARY_BELOW) next = 'wary';
    else if (slow && d.calm >= SETTLE_ENTER) next = 'settle';
    else next = 'alert';
    if (next !== d.state && (settled || !watching)) enter(d, next);
    const toKeeper = Math.atan2(dz, dx);
    if (d.state === 'alert') {
      tryMove(deck, d, k, d.pos[0], d.pos[1], turnToward(d.heading, toKeeper, TURN_ALERT * WILD_DT));
    } else if (d.state === 'wary') {
      // Tail to the keeper, and walk off.
      const away = wrapAngle(toKeeper + Math.PI);
      const h = turnToward(d.heading, away, TURN_WARY * WILD_DT);
      const step = T.walk * Math.max(0, Math.cos(wrapAngle(away - h))) * WILD_DT;
      tryMove(deck, d, k, d.pos[0] + Math.cos(h) * step, d.pos[1] + Math.sin(h) * step, h);
    }
  }
}

/**
 * One tick of the island: the keeper walks, then the dragon reacts. Called from `step`
 * (./world.ts). Allocation-free.
 */
export function stepWild(w: World, deck: Deck): void {
  const d = w.wild, k = w.keeper;
  // A footprint on an obstacle (a deck that changed since the save, or a migrated save)
  // moves to the nearest clear spot first.
  if (grounded(d) && !footprintKnownClear(deck, d)) {
    if (!bodyClear(deck, d.pos[0], d.pos[1], d.heading)) {
      if (nearestClear(deck, d.pos[0], d.pos[1], d.heading)) { d.pos[0] = push.x; d.pos[1] = push.z; }
      if (d.state === 'wander') { d.goal[0] = d.pos[0]; d.goal[1] = d.pos[1]; }
    } else {
      known.deck = deck; known.dx = d.pos[0]; known.dz = d.pos[1]; known.dh = d.heading;
    }
  }
  if (!keeperKnownClear(deck, k)) {
    if (!circleClear(deck, k.pos[0], k.pos[1], KEEPER_RADIUS)) {
      pushOut(deck, k.pos[0], k.pos[1], KEEPER_RADIUS, null);
      k.pos[0] = push.x; k.pos[1] = push.z;
    } else {
      known.cdeck = deck; known.cx = k.pos[0]; known.cz = k.pos[1];
    }
  }
  stepKeeper(k, d, deck);
  stepDragon(w, d, k, deck);
  // Wedged between the dragon and an obstacle, the keeper is the one that yields.
  if (grounded(d) && !keeperKnownSettled(deck, k, d)) {
    const kx = k.pos[0], kz = k.pos[1];
    pushOut(deck, kx, kz, KEEPER_RADIUS, d);
    k.pos[0] = push.x; k.pos[1] = push.z;
    if (push.x === kx && push.z === kz) {
      known.pdeck = deck; known.px = kx; known.pz = kz;
      known.sx = d.pos[0]; known.sz = d.pos[1]; known.sh = d.heading;
    }
  }
}

/**
 * The last "already in place" answer of each of `stepWild`'s three placement checks, so a
 * tick in which neither body moved does not test the same circles against every obstacle
 * again: the dragon's footprint at (dx, dz, dh) was clear; the keeper at (cx, cz) was clear;
 * the closing push left the keeper at (px, pz) exactly where it was, the dragon standing at
 * (sx, sz, sh). Each check is a pure function of the deck and the positions it reads, so
 * skipping a repeat changes no outcome: a world stepped with this is bit-identical to one
 * stepped without. Never saved, keyed by the deck object. Allocation-free.
 */
const known = {
  deck: null as Deck | null, dx: Number.NaN, dz: Number.NaN, dh: Number.NaN,
  cdeck: null as Deck | null, cx: Number.NaN, cz: Number.NaN,
  pdeck: null as Deck | null, px: Number.NaN, pz: Number.NaN, sx: Number.NaN, sz: Number.NaN, sh: Number.NaN,
};
const footprintKnownClear = (deck: Deck, d: WildDragon) =>
  known.deck === deck && known.dx === d.pos[0] && known.dz === d.pos[1] && known.dh === d.heading;
const keeperKnownClear = (deck: Deck, k: Keeper) =>
  known.cdeck === deck && known.cx === k.pos[0] && known.cz === k.pos[1];
const keeperKnownSettled = (deck: Deck, k: Keeper, d: WildDragon) =>
  known.pdeck === deck && known.px === k.pos[0] && known.pz === k.pos[1]
  && known.sx === d.pos[0] && known.sz === d.pos[1] && known.sh === d.heading;

/**
 * Walk (or, `run`, run) the keeper to (x, z): the player's tap. The spot is pulled onto the
 * deck and out of any obstacle or the dragon, so the keeper stops beside what was tapped. A
 * walk's pace is KEEPER_WALK, or CAREFUL × its length for a short step. Between ticks only;
 * deterministic.
 */
export function keeperTo(w: World, deck: Deck, x: number, z: number, run: boolean): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const k = w.keeper;
  pushOut(deck, x, z, KEEPER_RADIUS, grounded(w.wild) ? w.wild : null);
  k.goal[0] = push.x;
  k.goal[1] = push.z;
  const dist = len(push.x - k.pos[0], push.z - k.pos[1]);
  k.pace = run ? KEEPER_RUN : Math.min(KEEPER_WALK, CAREFUL * dist);
}

/** The keeper of a new world: standing at the deck's gate. */
export function newKeeper(deck: Deck): Keeper {
  return { pos: [deck.gate[0], deck.gate[1]], goal: [deck.gate[0], deck.gate[1]], pace: 0, v: 0 };
}

/**
 * The wild dragon of a new world: its genome is `wild(seed)` for a seed drawn from the
 * world's stream, its id the next one, and it grazes at the deck's home spot (or the nearest
 * clear one). `make` is `core/genome`'s `wild`, passed in so this file's tests can stub it.
 */
export function newWild(w: World, deck: Deck, make: (seed: number) => { toJSON(): GenomeJson }): WildDragon {
  scratchRng.setState(w.rng);
  const seed = Math.floor(scratchRng.next() * 4294967296) >>> 0;
  scratchRng.writeState(w.rng);
  const heading = 0;
  const x = deck.home[0], z = deck.home[1];
  nearestClear(deck, x, z, heading);
  const d: WildDragon = {
    id: w.nextId, genome: make(seed).toJSON(), pos: [push.x, push.z], heading, state: 'graze',
    calm: 0, t: 0, dur: Math.round(GRAZE_MIN_S / WILD_DT), goal: [push.x, push.z], from: [push.x, push.z],
  };
  w.nextId++;
  return d;
}
