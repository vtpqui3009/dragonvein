/**
 * The world: everything a save keeps, as plain JSON-able data (M8a).
 *
 * docs/ARCHITECTURE.md §Layers: the sim is deterministic, advances at a fixed 20 Hz, and
 * never reads the renderer or the wall clock. `check:determinism` and `check:layers` hold
 * this directory to that — it imports only `src/core/`.
 *
 * Two rules make a saved world resume exactly:
 *   1. **All of it is in `World`.** No module-level state carries meaning between ticks; the
 *      generator's four words live in `world.rng`, not in an `Rng` object somewhere. So
 *      `JSON.parse(JSON.stringify(world))` is the same world, and `tests/save.test.ts` checks
 *      that a world stepped 1 000 ticks equals one stepped 400, round-tripped through JSON
 *      and stepped 600 more — state and the next 100 draws.
 *   2. **Every random draw comes from `world.rng`**, through `drawU32` below, so a draw made
 *      after a reload is the draw that would have been made without one.
 *
 * `step` mutates the world it is given and allocates nothing: it runs from the frame loop
 * (src/main.ts), where a per-tick allocation is a per-frame one. From M8b it steps the
 * hero island's wild dragon and the keeper (./wild.ts), drawing only from `world.rng`.
 */
import { Rng, type RngState } from '../core/rng';
import { wild, type GenomeJson } from '../core/genome';
import { OPEN_DECK, newKeeper, newWild, stepWild, type Deck, type Keeper, type WildDragon } from './wild';

/** The fixed simulation rate. Wall-clock dt is turned into ticks in src/main.ts, never here. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/**
 * The schema this build writes. Bump it only together with a new entry appended to
 * `MIGRATIONS` in ./migrate.ts — a record of any older schema must still load.
 */
export const SCHEMA_VERSION = 2;

/** A dragon the player owns. `id` is unique within a world and never reused. */
export interface RosterEntry {
  id: number;
  genome: GenomeJson;
}

/**
 * Schema 2 (M8b): schema 1's fields, plus the hero island's wild dragon and the keeper the
 * player walks (./wild.ts). Eggs arrive with breeding (M9a); until then the list is empty.
 */
export interface World {
  schema: typeof SCHEMA_VERSION;
  /** The world's own seed, uint32. Fixed at creation. */
  seed: number;
  /** Sim ticks since the world was created, at TICK_HZ. */
  tick: number;
  /** The world's random stream, mid-flight: `Rng.state()` words. */
  rng: RngState;
  /** The id the next roster entry gets. Greater than every id ever handed out. */
  nextId: number;
  roster: RosterEntry[];
  eggs: never[];
  /** The wild dragon on the hero island. Its id is reserved from `nextId`. */
  wild: WildDragon;
  keeper: Keeper;
}

/**
 * A new world. The stream is seeded from `seed` mixed with a constant, so the world's draws
 * are not the same numbers as `wild(seed)`'s — a world seed that happens to equal a dragon
 * seed must not make the two correlate.
 */
export function createWorld(seed: number, deck: Deck = OPEN_DECK): World {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`world seed must be a uint32, got ${seed}`);
  }
  const w = {
    schema: SCHEMA_VERSION,
    seed,
    tick: 0,
    rng: new Rng((seed ^ 0x5eed_3a1d) >>> 0).state(),
    nextId: 1,
    roster: [],
    eggs: [],
  } as Omit<World, 'wild' | 'keeper'> as World;
  // The wild dragon draws its genome seed first, then takes id 1.
  w.wild = newWild(w, deck, wild);
  w.keeper = newKeeper(deck);
  return w;
}

/**
 * Advance one fixed tick on `deck` (the island's walkable layout; ./wild.ts). Touches
 * nothing but `world`, and allocates nothing.
 */
export function step(world: World, deck: Deck = OPEN_DECK): void {
  world.tick++;
  stepWild(world, deck);
}

/** Scratch generator: loaded from `world.rng`, drawn, written back. Never holds state between calls. */
const scratch = new Rng(1);

/** One uint32 from the world's stream — the seed source for wild dragons and breeding. */
export function drawU32(world: World): number {
  scratch.setState(world.rng);
  const v = Math.floor(scratch.next() * 4294967296) >>> 0;
  scratch.writeState(world.rng);
  return v;
}

/**
 * Add already-validated genomes to the roster under new ids: the dragons salvaged from a
 * refused save join the world the player starts fresh in. Returns the new entries.
 */
export function adoptGenomes(world: World, genomes: readonly GenomeJson[]): RosterEntry[] {
  const added: RosterEntry[] = [];
  for (const genome of genomes) {
    const entry: RosterEntry = { id: world.nextId, genome: structuredClone(genome) };
    world.nextId++;
    world.roster.push(entry);
    added.push(entry);
  }
  return added;
}
