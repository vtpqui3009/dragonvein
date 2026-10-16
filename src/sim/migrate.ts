/**
 * Save payloads: encoding, the migration chain and validation (docs/ARCHITECTURE.md §Save).
 *
 * A payload is the text a store keeps: `{"rngVersion": 1, "world": {"schema": 1, …}}`.
 * `world.schema` and `rngVersion` are where every build, past and future, looks first, so
 * neither may ever move.
 *
 * **The chain is append-only.** `MIGRATIONS[i]` takes schema `i + 1` to `i + 2`. An entry is
 * never edited, reordered or deleted once a build that writes its target has shipped — a
 * player's bred dragons must load in every later release. `tests/fixtures/save-v1.json`, a
 * schema-1 save, is frozen and must keep decoding forever; `tests/save.test.ts` says so.
 *
 * **A record is refused, not repaired,** when it is:
 *   - `newer`: its schema or RNG version is past this build's — a newer build wrote it;
 *   - `incomplete`: a field is missing;
 *   - `corrupt`: unparseable, a wrong type, an unknown field, or a genome whose alleles do not
 *     hash to its stored `gid`.
 * The caller keeps a refused record untouched and never writes over it (./persist.ts). An
 * unknown field is refused rather than dropped because dropping it and saving would destroy
 * data this build does not understand.
 */
import { ELEMENTS, GENE_NAMES, Genome, wild, type GenomeJson } from '../core/genome';
import { RNG_VERSION, Rng, isRngState } from '../core/rng';
import { WILD_STATES } from './wild';
import { SCHEMA_VERSION, type World } from './world';

export type Refusal = 'newer' | 'incomplete' | 'corrupt';

export type Decoded<W> =
  | { ok: true; world: W; from: number }
  | { ok: false; reason: Refusal; detail: string };

type Obj = Record<string, unknown>;

export interface Migration {
  /** The schema this migration reads. It must return a world with `schema: from + 1`. */
  from: number;
  up: (world: Obj) => Obj;
}

/**
 * 1 → 2 (M8b): the hero island gains its wild dragon and the keeper. The schema-1 record is
 * validated first, so a bad one is refused for its own reason, as before this migration
 * existed. Then, like a new world: one uint32 from the world's own stream seeds `wild()`,
 * the dragon takes the next id, and both stand at fixed spots — the open deck's home and
 * gate (./wild.ts OPEN_DECK), written out here as literals so this migration never changes
 * when those do. The first tick moves either off any obstacle on the page's deck.
 *
 * FROZEN once shipped: tests/fixtures/save-v1.json migrates through this to exactly the
 * world tests/save.test.ts names, dragon genome and all.
 */
const V1_TO_V2: Migration = {
  from: 1,
  up: (w) => {
    validateV1(w);
    const rng = Rng.fromState(w.rng as number[]);
    const seed = Math.floor(rng.next() * 4294967296) >>> 0;
    const id = w.nextId as number;
    return {
      ...w,
      schema: 2,
      rng: rng.state(),
      nextId: id + 1,
      wild: {
        id, genome: wild(seed).toJSON(), pos: [1.2, 1.8], heading: 0, state: 'graze', calm: 0,
        t: 0, dur: 60, goal: [1.2, 1.8], from: [1.2, 1.8],
      },
      keeper: { pos: [-4.2, -2.4], goal: [-4.2, -2.4], pace: 0, v: 0 },
    };
  },
};

/** Schema 1 is the first. Append here, never anywhere else; see the header. */
export const MIGRATIONS: readonly Migration[] = [V1_TO_V2];

export interface Chain<W> {
  migrations: readonly Migration[];
  /** The schema the chain ends at — this build's. */
  target: number;
  /** Check a world at `target`; throw `Refused` on anything wrong. */
  validate: (world: Obj) => W;
}

export class Refused extends Error {
  constructor(readonly reason: Refusal, detail: string) {
    super(detail);
    this.name = 'Refused';
  }
}

/** Throws unless `migrations[i].from === i + 1` for every i and the chain reaches `target`. */
export function assertChain(c: Chain<unknown>): void {
  c.migrations.forEach((m, i) => {
    if (m.from !== i + 1) throw new Error(`migration ${i} reads schema ${m.from}, expected ${i + 1}`);
  });
  if (c.migrations.length !== c.target - 1) {
    throw new Error(`${c.migrations.length} migration(s) cannot reach schema ${c.target} from 1`);
  }
}

/** The text a store keeps for `world`. Called only when saving. */
export function encodeSave(world: object): string {
  return JSON.stringify({ rngVersion: RNG_VERSION, world });
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exactly these keys: a missing one is `incomplete`, an extra one `corrupt`. */
function keys(o: Obj, want: readonly string[], where: string): void {
  const missing = want.filter((k) => !(k in o));
  if (missing.length) throw new Refused('incomplete', `${where}: missing ${missing.join(', ')}`);
  const extra = Object.keys(o).filter((k) => !want.includes(k));
  if (extra.length) throw new Refused('corrupt', `${where}: unknown field ${extra.join(', ')}`);
}

function bad(cond: boolean, detail: string): void {
  if (cond) throw new Refused('corrupt', detail);
}

const isUint32 = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffffff;
const isCount = (v: unknown, min: number) => Number.isSafeInteger(v) && (v as number) >= min;

/** A stored genome: its shape, then `Genome.fromJSON`, which recomputes the gid from the alleles. */
function checkGenome(g: unknown, where: string): void {
  bad(!isObj(g), `${where}: not an object`);
  const o = g as Obj;
  keys(o, ['g', 'element', 'generation', 'lineage', 'gid'], where);
  bad(!isObj(o.g), `${where}.g: not an object`);
  keys(o.g as Obj, GENE_NAMES, `${where}.g`);
  for (const k of GENE_NAMES) {
    const pair = (o.g as Obj)[k];
    const ok = Array.isArray(pair) && pair.length === 2 && pair.every((al: unknown) =>
      Array.isArray(al) && al.length === 2 && typeof al[0] === 'number' && Number.isFinite(al[0])
      && typeof al[1] === 'boolean');
    bad(!ok, `${where}.g.${k}: not two [value, dominant] alleles`);
  }
  const el = o.element;
  bad(!Array.isArray(el) || el.length !== 2
    || !el.every((e: unknown) => (ELEMENTS as readonly unknown[]).includes(e)), `${where}.element: ${JSON.stringify(el)}`);
  bad(!isCount(o.generation, 0), `${where}.generation: ${String(o.generation)}`);
  bad(typeof o.lineage !== 'string' || typeof o.gid !== 'string', `${where}: lineage and gid must be strings`);
  try {
    Genome.fromJSON(o as unknown as Parameters<typeof Genome.fromJSON>[0]);
  } catch (e) {
    throw new Refused('corrupt', `${where}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The fields every schema so far shares, checked against `schema`. */
function checkBase(w: Obj, schema: number): void {
  bad(w.schema !== schema, `world.schema: ${String(w.schema)}`);
  bad(!isUint32(w.seed), `world.seed: ${String(w.seed)}`);
  bad(!isCount(w.tick, 0), `world.tick: ${String(w.tick)}`);
  bad(!isRngState(w.rng), `world.rng: ${JSON.stringify(w.rng)}`);
  bad(!isCount(w.nextId, 1), `world.nextId: ${String(w.nextId)}`);
  bad(!Array.isArray(w.roster), 'world.roster: not a list');
  // Schema 1 has no eggs; a schema-1 record holding some was not written by this code.
  bad(!Array.isArray(w.eggs) || w.eggs.length !== 0, 'world.eggs: schema 1 has no eggs');
  const ids = new Set<number>();
  (w.roster as unknown[]).forEach((d, i) => {
    const where = `world.roster[${i}]`;
    bad(!isObj(d), `${where}: not an object`);
    keys(d as Obj, ['id', 'genome'], where);
    const id = (d as Obj).id;
    bad(!isCount(id, 1) || (id as number) >= (w.nextId as number), `${where}.id: ${String(id)}`);
    bad(ids.has(id as number), `${where}.id: ${String(id)} twice`);
    ids.add(id as number);
    checkGenome((d as Obj).genome, `${where}.genome`);
  });
}

const V1_KEYS = ['schema', 'seed', 'tick', 'rng', 'nextId', 'roster', 'eggs'] as const;

/** Schema 1, field by field. Returns nothing: a schema-1 world is only ever migrated. */
export function validateV1(w: Obj): void {
  keys(w, V1_KEYS, 'world');
  checkBase(w, 1);
}

const isFinitePair = (v: unknown) => Array.isArray(v) && v.length === 2
  && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e4);
const isFiniteNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Schema 2 (M8b): schema 1's fields, the wild dragon and the keeper. */
export function validateV2(w: Obj): World {
  keys(w, [...V1_KEYS, 'wild', 'keeper'], 'world');
  checkBase(w, 2);
  bad(!isObj(w.wild), 'world.wild: not an object');
  const d = w.wild as Obj;
  keys(d, ['id', 'genome', 'pos', 'heading', 'state', 'calm', 't', 'dur', 'goal', 'from'], 'world.wild');
  bad(!isCount(d.id, 1) || (d.id as number) >= (w.nextId as number), `world.wild.id: ${String(d.id)}`);
  bad((w.roster as Obj[]).some((r) => r.id === d.id), `world.wild.id: ${String(d.id)} is also on the roster`);
  checkGenome(d.genome, 'world.wild.genome');
  bad(!isFinitePair(d.pos) || !isFinitePair(d.goal) || !isFinitePair(d.from), 'world.wild: pos, goal and from must be two finite numbers');
  bad(!isFiniteNum(d.heading) || Math.abs(d.heading as number) > 4, `world.wild.heading: ${String(d.heading)}`);
  bad(!(WILD_STATES as readonly unknown[]).includes(d.state), `world.wild.state: ${String(d.state)}`);
  bad(!isFiniteNum(d.calm) || (d.calm as number) < 0 || (d.calm as number) > 1, `world.wild.calm: ${String(d.calm)}`);
  bad(!isCount(d.t, 0) || !isCount(d.dur, 0), `world.wild: t ${String(d.t)}, dur ${String(d.dur)}`);
  bad(!isObj(w.keeper), 'world.keeper: not an object');
  const k = w.keeper as Obj;
  keys(k, ['pos', 'goal', 'pace', 'v'], 'world.keeper');
  bad(!isFinitePair(k.pos) || !isFinitePair(k.goal), 'world.keeper: pos and goal must be two finite numbers');
  bad(!isFiniteNum(k.pace) || (k.pace as number) < 0 || (k.pace as number) > 10, `world.keeper.pace: ${String(k.pace)}`);
  bad(!isFiniteNum(k.v) || (k.v as number) < 0 || (k.v as number) > 10, `world.keeper.v: ${String(k.v)}`);
  return w as unknown as World;
}

export const CHAIN: Chain<World> = { migrations: MIGRATIONS, target: SCHEMA_VERSION, validate: validateV2 };
assertChain(CHAIN);

/**
 * The genomes that still validate in a refused payload of a schema this build knows (1 up to
 * its own; the roster's shape has not changed across them): a record refused for one
 * tampered dragon, say, still holds the others. Each one passes the same check `decodeSave`
 * applies, gid included, and is returned as a copy. A payload that is not JSON, or from a
 * newer schema or another RNG version, salvages nothing — this build cannot say what its
 * genomes mean. The record itself is never touched; the caller keeps it whole. A future
 * schema that changes the roster's shape must teach this function both shapes.
 */
export function salvageGenomes(text: unknown): GenomeJson[] {
  try {
    const p: unknown = typeof text === 'string' ? JSON.parse(text) : null;
    if (!isObj(p) || p.rngVersion !== RNG_VERSION || !isObj(p.world)) return [];
    const w = p.world;
    if (!Number.isSafeInteger(w.schema) || (w.schema as number) < 1 || (w.schema as number) > SCHEMA_VERSION
      || !Array.isArray(w.roster)) return [];
    const out: GenomeJson[] = [];
    const seen = new Set<string>();
    w.roster.forEach((d: unknown, i: number) => {
      if (!isObj(d)) return;
      try {
        checkGenome(d.genome, `roster[${i}].genome`);
      } catch {
        return;
      }
      const g = structuredClone(d.genome) as GenomeJson;
      if (!seen.has(g.gid)) { seen.add(g.gid); out.push(g); }
    });
    return out;
  } catch {
    return [];
  }
}

/** Parse, run the chain from the payload's schema up to `chain.target`, validate. Never throws. */
export function decodeSave<W = World>(text: unknown, chain: Chain<W> = CHAIN as unknown as Chain<W>): Decoded<W> {
  try {
    if (typeof text !== 'string') throw new Refused('corrupt', `payload is ${typeof text}, not text`);
    let p: unknown;
    try {
      p = JSON.parse(text);
    } catch (e) {
      throw new Refused('corrupt', `payload is not JSON (${e instanceof Error ? e.message : String(e)})`);
    }
    bad(!isObj(p), 'payload: not an object');
    const payload = p as Obj;
    // Version checks first: a newer build may have changed anything else, so what follows
    // is only meaningful once both versions are known to be ones this build understands.
    const schema = isObj(payload.world) ? payload.world.schema : undefined;
    if (Number.isSafeInteger(schema) && (schema as number) > chain.target) {
      throw new Refused('newer', `schema ${String(schema)} is newer than this build's ${chain.target}`);
    }
    if (Number.isSafeInteger(payload.rngVersion) && (payload.rngVersion as number) > RNG_VERSION) {
      throw new Refused('newer', `RNG version ${String(payload.rngVersion)} is newer than this build's ${RNG_VERSION}`);
    }
    keys(payload, ['rngVersion', 'world'], 'payload');
    bad(payload.rngVersion !== RNG_VERSION, `rngVersion: ${String(payload.rngVersion)}`);
    bad(!isObj(payload.world), 'world: not an object');
    let w = payload.world as Obj;
    if (!('schema' in w)) throw new Refused('incomplete', 'world: missing schema');
    bad(!isCount(w.schema, 1), `world.schema: ${String(w.schema)}`);
    const from = w.schema as number;
    for (let s = from; s < chain.target; s++) {
      const m = chain.migrations[s - 1];
      if (!m || m.from !== s) throw new Error(`no migration from schema ${s}`);
      w = m.up(w);
      if (w.schema !== s + 1) throw new Error(`migration from ${s} produced schema ${String(w.schema)}`);
    }
    return { ok: true, world: chain.validate(w), from };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason, detail: e.message };
    // A migration that throws on a record is a record this build cannot carry forward.
    return { ok: false, reason: 'corrupt', detail: e instanceof Error ? e.message : String(e) };
  }
}
