/**
 * Roster changes (M8a): the two ways a dragon enters a world today, wild and bred.
 *
 * Kept apart from ./world so the frame loop's import of `step` does not pull the genome code
 * into the boot bundle: src/main.ts loads this module only when a roster actually changes.
 * Every seed is drawn from `world.rng`, so a roster built across a reload is the roster that
 * would have been built without one.
 *
 * Taming (M8c) and the egg and hatch path (M9a) replace the direct `addBred` with commands;
 * what stays is the rule that a genome enters the roster only through `Genome.toJSON()`, so
 * its `gid` is the hash of its alleles and a save can check it.
 */
import { Genome, breed, wild } from '../core/genome';
import { drawU32, type RosterEntry, type World } from './world';

function add(world: World, genome: Genome): RosterEntry {
  const entry: RosterEntry = { id: world.nextId, genome: genome.toJSON() };
  world.nextId++;
  world.roster.push(entry);
  return entry;
}

/** A wild dragon, its seed drawn from the world's stream. */
export function addWild(world: World): RosterEntry {
  return add(world, wild(drawU32(world)));
}

/** The child of two roster dragons, its meiosis seed drawn from the world's stream. */
export function addBred(world: World, aId: number, bId: number): RosterEntry {
  const a = world.roster.find((d) => d.id === aId);
  const b = world.roster.find((d) => d.id === bId);
  if (!a || !b || aId === bId) throw new RangeError(`addBred: need two different roster ids, got ${aId}, ${bId}`);
  return add(world, breed(Genome.fromJSON(a.genome), Genome.fromJSON(b.genome), drawU32(world)));
}
