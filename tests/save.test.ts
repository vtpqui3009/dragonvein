/**
 * M8a: a world survives a save, migrations run in order, and a record this build cannot
 * read is refused and never written over (STATE.md run 32, criteria 1 and 2).
 *
 * Everything here runs against `memoryStore`, the store contract in a Map. The IndexedDB
 * adapter itself is exercised in Chromium by `gate:smoke` (tools/playtest.mjs): no fake
 * IndexedDB package, because that would be a new dependency for a test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Genome, wild } from '../src/core/genome';
import { RNG_VERSION, Rng, isRngState, type RngState } from '../src/core/rng';
import {
  MAIN_KEY, backupKey, memoryJournal, memoryStore, type Journal, type SaveStore, type StoredSave,
} from '../src/core/save';
import {
  CHAIN, MIGRATIONS, Refused, assertChain, decodeSave, encodeSave, salvageGenomes, type Chain, type Migration,
} from '../src/sim/migrate';
import { SaveSession, openGameWorld, openWorld } from '../src/sim/persist';
import { addBred, addWild } from '../src/sim/roster';
import {
  SCHEMA_VERSION, TICK_HZ, adoptGenomes, createWorld, drawU32, step, type World,
} from '../src/sim/world';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_V1 = readFileSync(path.join(ROOT, 'tests/fixtures/save-v1.json'), 'utf8');

const nextDraws = (state: RngState, n: number) => {
  const r = Rng.fromState(state);
  return Array.from({ length: n }, () => r.next());
};

describe('Rng state export and restore', () => {
  const SEEDS = [0, 1, 42, -1, 0xffffffff, 2 ** 40 + 7, 0x0d4ac0de];

  it.each(SEEDS)('seed %s: a restored generator continues the stream draw for draw', (seed) => {
    const ref = new Rng(seed);
    const probe = new Rng(seed);
    for (let i = 0; i < 137; i++) { ref.next(); probe.next(); }
    // Through JSON, as a save carries it.
    const restored = Rng.fromState(JSON.parse(JSON.stringify(probe.state())) as number[]);
    for (let i = 0; i < 2000; i++) {
      const op = i % 4;
      const a = op === 0 ? ref.next() : op === 1 ? ref.range(-3, 7) : op === 2 ? ref.int(0, 9) : ref.chance(0.3);
      const b = op === 0 ? restored.next() : op === 1 ? restored.range(-3, 7) : op === 2 ? restored.int(0, 9) : restored.chance(0.3);
      if (!Object.is(a, b)) expect.fail(`draw ${i} differs: ${String(a)} vs ${String(b)}`);
    }
    expect(restored.state()).toEqual(ref.state());
  });

  it('setState and writeState work in place', () => {
    const a = new Rng(9);
    const out: RngState = [0, 0, 0, 0];
    expect(a.writeState(out)).toBe(out);
    expect(out).toEqual(a.state());
    const b = new Rng(1234).setState(out);
    expect(b.next()).toBe(a.next());
  });

  it.each([
    ['all zero', [0, 0, 0, 0]],
    ['three words', [1, 2, 3]],
    ['five words', [1, 2, 3, 4, 5]],
    ['negative', [1, -2, 3, 4]],
    ['2^32', [1, 2 ** 32, 3, 4]],
    ['fraction', [1, 2.5, 3, 4]],
    ['string', [1, '2', 3, 4]],
  ])('refuses a state that is %s', (_, s) => {
    expect(isRngState(s)).toBe(false);
    expect(() => Rng.fromState(s as number[])).toThrow(RangeError);
  });

  it('records which stream it is', () => {
    expect(RNG_VERSION).toBe(1);
  });
});

/**
 * A scripted run: roster changes at fixed ticks, each drawing seeds from `world.rng`. Parents
 * are named by roster position: since schema 2 the island's wild dragon holds id 1 (M8b).
 */
const rosterId = (w: World, i: number) => w.roster[i]!.id;
const SCRIPT: Record<number, (w: World) => void> = {
  100: (w) => { addWild(w); },
  250: (w) => { addWild(w); },
  380: (w) => { addBred(w, rosterId(w, 0), rosterId(w, 1)); },
  650: (w) => { addWild(w); },
  777: (w) => { drawU32(w); drawU32(w); },
  900: (w) => { addBred(w, rosterId(w, 2), rosterId(w, 3)); },
};
function run(w: World, until: number): World {
  while (w.tick < until) {
    step(w);
    SCRIPT[w.tick]?.(w);
  }
  return w;
}

describe('a world is deterministic across a save', () => {
  it.each([1, 0x0d4ac0de, 0xffffffff])('seed %s: 1 000 ticks equals 400 + JSON round trip + 600', (seed) => {
    const straight = run(createWorld(seed), 1000);
    const half = run(createWorld(seed), 400);
    const text = encodeSave(half);
    const back = decodeSave(text);
    if (!back.ok) throw new Error(back.detail);
    expect(back.from).toBe(SCHEMA_VERSION);
    const resumed = run(back.world, 1000);

    expect(resumed).toEqual(straight);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
    const a = nextDraws(straight.rng, 100);
    const b = nextDraws(resumed.rng, 100);
    a.forEach((x, i) => { if (!Object.is(x, b[i])) expect.fail(`draw ${i}: ${x} vs ${b[i]}`); });

    // Not a trivial equality: the stream moved after the split, and the roster grew on both sides of it.
    expect(straight.rng).not.toEqual(half.rng);
    expect(straight.roster).toHaveLength(5);
    expect(half.roster).toHaveLength(3);
    expect(straight.tick).toBe(1000);
    expect(straight.roster[4]?.genome.lineage).toBe(
      `${straight.roster[2]?.genome.gid}x${straight.roster[3]?.genome.gid}`);
  });

  it('the world clock is ticks at 20 Hz', () => {
    expect(TICK_HZ).toBe(20);
    const w = createWorld(5);
    for (let i = 0; i < 20 * 60; i++) step(w);
    expect(w.tick / TICK_HZ).toBe(60);
  });

  it('createWorld refuses a seed that is not a uint32', () => {
    for (const s of [-1, 2 ** 32, 1.5, Number.NaN]) expect(() => createWorld(s)).toThrow(RangeError);
  });
});

describe('the frozen schema-1 fixture', () => {
  // tests/fixtures/save-v1.json is a schema-1 save as M8a wrote it: world seed 0x0d4ac0de,
  // 800 ticks, two wild dragons, their child (bred with breed()), and one more wild. It is
  // FROZEN. Every future build must keep loading it, through whatever migrations exist by
  // then, with all four dragons' genomes intact. Never regenerate or edit it to make this
  // test pass: if it stops loading, a player's save from M8a would stop loading too.
  const GIDS = ['2bf296d8d9', '8dcb2fa517', 'd0699f21cf', '4acfb32ece'];

  it('loads, with its roster intact', () => {
    const d = decodeSave(FIXTURE_V1);
    if (!d.ok) throw new Error(`${d.reason}: ${d.detail}`);
    expect(d.from).toBe(1);
    const w = d.world;
    expect(w.seed).toBe(0x0d4ac0de);
    expect(w.roster.map((r) => r.genome.gid)).toEqual(GIDS);
    for (const r of w.roster) expect(Genome.fromJSON(r.genome).gid()).toBe(r.genome.gid);
    const bred = w.roster.filter((r) => r.genome.generation > 0);
    expect(bred).toHaveLength(1);
    expect(bred[0]?.genome.lineage).toBe(`${GIDS[0]}x${GIDS[1]}`);
  });

  it('round-trips: decode, encode, decode is the same world', () => {
    const a = decodeSave(FIXTURE_V1);
    if (!a.ok) throw new Error(a.detail);
    const b = decodeSave(encodeSave(a.world));
    if (!b.ok) throw new Error(b.detail);
    expect(b.from).toBe(SCHEMA_VERSION);
    expect(b.world).toEqual(a.world);
    // Everything schema 1 held is carried over unchanged, except what the 1 → 2 migration
    // (M8b) takes: one draw from the stream for the wild dragon's seed, and the next id.
    const v1 = (JSON.parse(FIXTURE_V1) as { world: Record<string, unknown> }).world;
    const { wild: w2, keeper, ...rest } = JSON.parse(encodeSave(b.world)).world as Record<string, unknown>;
    const r = Rng.fromState(v1.rng as number[]);
    const seed = Math.floor(r.next() * 4294967296) >>> 0;
    expect(rest).toEqual({ ...v1, schema: 2, rng: r.state(), nextId: (v1.nextId as number) + 1 });
    expect(w2).toMatchObject({ id: v1.nextId, genome: wild(seed).toJSON(), state: 'graze', calm: 0 });
    expect(keeper).toMatchObject({ pace: 0, v: 0 });
  });

  it('loads through a store, and its first save writes the next gen', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 7, savedAt: 1, text: FIXTURE_V1 } satisfies StoredSave);
    const { world, session, report } = await openGameWorld(store, 1);
    expect(report).toMatchObject({ source: 'loaded', fromSchema: 1, gen: 7 });
    expect(world.roster).toHaveLength(4);
    await session.save(world, 2);
    expect(session.state).toBe('saved');
    expect((store.data.get(MAIN_KEY) as StoredSave).gen).toBe(8);
    // Migrated from schema 1 (M8b): the record as it was is kept beside the new one.
    expect(store.data.get(backupKey(1))).toEqual({ gen: 7, savedAt: 1, text: FIXTURE_V1 });
    expect(world.wild.id).toBe(5);
  });
});

describe('the migration chain', () => {
  it('this build ends at SCHEMA_VERSION, and the chain is contiguous', () => {
    expect(CHAIN.target).toBe(SCHEMA_VERSION);
    expect(() => assertChain(CHAIN)).not.toThrow();
    expect(MIGRATIONS).toHaveLength(SCHEMA_VERSION - 1);
  });

  // A synthetic three-schema world: 1 has `name`, 2 renames it `title`, 3 derives `shout`
  // from `title`. Step 2 only works on step 1's output, so running them out of order fails.
  const calls: string[] = [];
  const M: Migration[] = [
    { from: 1, up: (w) => { calls.push('1>2'); const { name, ...rest } = w; return { ...rest, schema: 2, title: name }; } },
    {
      from: 2, up: (w) => {
        calls.push('2>3');
        if (typeof w.title !== 'string') throw new Error('2>3 needs title');
        return { ...w, schema: 3, shout: `${w.title}!` };
      },
    },
  ];
  interface V3 { schema: 3; title: string; shout: string }
  const synthetic: Chain<V3> = {
    migrations: M, target: 3,
    validate: (w) => {
      if (typeof w.title !== 'string' || typeof w.shout !== 'string') throw new Refused('incomplete', 'v3');
      return w as unknown as V3;
    },
  };
  const payload = (world: object) => JSON.stringify({ rngVersion: 1, world });

  it('runs every step, in order, from the record\'s schema', () => {
    calls.length = 0;
    const d = decodeSave(payload({ schema: 1, name: 'ember' }), synthetic);
    expect(d).toEqual({ ok: true, from: 1, world: { schema: 3, title: 'ember', shout: 'ember!' } });
    expect(calls).toEqual(['1>2', '2>3']);
  });

  it('starts part-way along the chain for a record already past schema 1', () => {
    calls.length = 0;
    const d = decodeSave(payload({ schema: 2, title: 'tide' }), synthetic);
    expect(d).toEqual({ ok: true, from: 2, world: { schema: 3, title: 'tide', shout: 'tide!' } });
    expect(calls).toEqual(['2>3']);
  });

  it('runs nothing for a record at the target', () => {
    calls.length = 0;
    const d = decodeSave(payload({ schema: 3, title: 'a', shout: 'a!' }), synthetic);
    expect(d.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('refuses a chain that is out of order or has a gap', () => {
    expect(() => assertChain(synthetic)).not.toThrow();
    expect(() => assertChain({ ...synthetic, migrations: [M[1]!, M[0]!] })).toThrow(/expected 1/);
    expect(() => assertChain({ ...synthetic, migrations: [M[0]!] })).toThrow(/cannot reach schema 3/);
  });

  it('a migration that throws on a record refuses it as corrupt', () => {
    const d = decodeSave(payload({ schema: 2, title: 7 }), synthetic);
    expect(d).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('backs the stored record up before the first write after a migration, in the same write', async () => {
    const store = memoryStore();
    const original: StoredSave = { gen: 3, savedAt: 100, text: payload({ schema: 1, name: 'jade' }) };
    store.data.set(MAIN_KEY, structuredClone(original));
    const { world, session, report } = await openWorld(store, () => ({ schema: 3, title: '', shout: '' }) as V3,
      { chain: synthetic });
    expect(report).toMatchObject({ source: 'loaded', fromSchema: 1, gen: 3 });
    expect(world).toEqual({ schema: 3, title: 'jade', shout: 'jade!' });
    // Loading wrote nothing.
    expect(store.data.get(MAIN_KEY)).toEqual(original);
    expect(store.data.has(backupKey(1))).toBe(false);

    await session.save(world, 200);
    expect(store.data.get(backupKey(1))).toEqual(original);
    const main = store.data.get(MAIN_KEY) as StoredSave;
    expect(main.gen).toBe(4);
    expect(JSON.parse(main.text)).toEqual({ rngVersion: 1, world: { schema: 3, title: 'jade', shout: 'jade!' } });

    // Later saves leave the backup alone.
    world.title = 'jade2';
    await session.save(world, 300);
    expect(store.data.get(backupKey(1))).toEqual(original);
    expect((store.data.get(MAIN_KEY) as StoredSave).gen).toBe(5);
  });

  it('a crash in the migrating write leaves neither the backup nor the new record', async () => {
    let crash = true;
    const store = memoryStore({ beforeCommit: () => { if (crash) throw new Error('tab closed'); } });
    const original: StoredSave = { gen: 3, savedAt: 100, text: payload({ schema: 1, name: 'gale' }) };
    store.data.set(MAIN_KEY, structuredClone(original));
    const { world, session } = await openWorld(store, () => ({}) as V3, { chain: synthetic });
    await session.save(world, 200);
    expect(session.state).toBe('error');
    expect(store.data.get(MAIN_KEY)).toEqual(original);
    expect(store.data.has(backupKey(1))).toBe(false);
    crash = false;
    await session.save(world, 300);   // the retry still backs up, because nothing landed before
    expect(session.state).toBe('saved');
    expect(store.data.get(backupKey(1))).toEqual(original);
  });
});

/** A valid schema-1 payload with one field changed by `edit`. */
function editedFixture(edit: (p: { rngVersion: unknown; world: Record<string, unknown> }) => void): string {
  const p = JSON.parse(FIXTURE_V1) as { rngVersion: unknown; world: Record<string, unknown> };
  edit(p);
  return JSON.stringify(p);
}
type Roster = { id: number; genome: Record<string, unknown> & { g: Record<string, unknown> } }[];

describe('a record this build cannot read is refused and never written over', () => {
  const CASES: [string, 'newer' | 'corrupt' | 'incomplete', unknown][] = [
    ['a newer schema', 'newer', editedFixture((p) => { p.world.schema = SCHEMA_VERSION + 1; p.world.pets = []; })],
    ['a newer RNG version', 'newer', editedFixture((p) => { p.rngVersion = RNG_VERSION + 1; })],
    ['text that is not JSON', 'corrupt', FIXTURE_V1.slice(0, 4000)],
    ['a payload that is not text', 'corrupt', 42],
    ['a tampered allele (gid no longer matches)', 'corrupt', editedFixture((p) => {
      ((p.world.roster as Roster)[2]!.genome.g.hornCount as [[number, boolean], [number, boolean]])[0][0] = 5.5;
    })],
    ['an unknown element', 'corrupt', editedFixture((p) => { (p.world.roster as Roster)[0]!.genome.element = ['fire', 'fire']; })],
    ['a duplicated dragon id', 'corrupt', editedFixture((p) => { (p.world.roster as Roster)[1]!.id = 1; })],
    ['an unknown field', 'corrupt', editedFixture((p) => { p.world.gold = 10; })],
    ['an all-zero RNG state', 'corrupt', editedFixture((p) => { p.world.rng = [0, 0, 0, 0]; })],
    ['a missing roster', 'incomplete', editedFixture((p) => { delete p.world.roster; })],
    ['a missing tick', 'incomplete', editedFixture((p) => { delete p.world.tick; })],
    ['a genome missing a gene', 'incomplete', editedFixture((p) => { delete (p.world.roster as Roster)[3]!.genome.g.glow; })],
    ['a missing schema', 'incomplete', editedFixture((p) => { delete p.world.schema; })],
  ];

  it.each(CASES)('%s is refused as %s', (_, reason, text) => {
    expect(decodeSave(text)).toMatchObject({ ok: false, reason });
  });

  it.each(CASES)('%s: the record and the backup survive a whole session', async (_, reason, text) => {
    const store = memoryStore();
    const main: StoredSave = { gen: 12, savedAt: 5, text: text as string };
    const backup: StoredSave = { gen: 9, savedAt: 4, text: FIXTURE_V1 };
    store.data.set(MAIN_KEY, structuredClone(main));
    store.data.set(backupKey(1), structuredClone(backup));
    const before = structuredClone([...store.data]);

    const { world, session, report } = await openGameWorld(store, 77);
    expect(session.state).toBe(reason);
    expect(session.writable).toBe(false);
    expect(report.source).toBe('refused');
    // The game still runs, on a fresh world.
    expect(world).toEqual(createWorld(77));
    addWild(world);
    for (let i = 0; i < 3; i++) await session.save(world, 100 + i);
    session.markStale(99);

    expect([...store.data]).toEqual(before);
    expect(session.state).toBe(reason);
  });

  it('a slot holding something that is not a save envelope is refused and kept', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, 'garbage');
    const { session } = await openGameWorld(store, 1);
    expect(session.state).toBe('corrupt');
    await session.save(createWorld(1), 1);
    expect(store.data.get(MAIN_KEY)).toBe('garbage');
    // And the store itself refuses to replace it, whatever gen a writer claims.
    for (const base of [0, 1, -1]) {
      expect(await store.write({ text: 'x', savedAt: 0, base, baseWriter: '', baseSeq: 0, writer: 'w', seq: 1 })).toEqual({ ok: false, gen: -1 });
    }
    expect(store.data.get(MAIN_KEY)).toBe('garbage');
  });
});

describe('storage that is missing or failing', () => {
  it('no store: a fresh world, "unavailable", and saving is a no-op', async () => {
    const { world, session, report } = await openGameWorld(null, 3, { unavailable: 'IndexedDB refused to open' });
    expect(world).toEqual(createWorld(3));
    expect(session.state).toBe('unavailable');
    expect(session.detail).toBe('IndexedDB refused to open');
    expect(report.source).toBe('fresh');
    await session.save(world, 1);
    expect(session.state).toBe('unavailable');
  });

  it('a store that cannot be read is never written', async () => {
    let writes = 0;
    const store: SaveStore = {
      kind: 'memory',
      get: () => Promise.reject(new Error('read failed')),
      write: () => { writes++; return Promise.resolve({ ok: true, gen: 1, skipped: false, putMs: 0 }); },
      setAside: () => { writes++; return Promise.resolve('refused.1'); },
      close: () => {},
    };
    const { world, session } = await openGameWorld(store, 3);
    expect(session.state).toBe('unavailable');
    await session.save(world, 1);
    expect(writes).toBe(0);
  });

  it('a failed write leaves the last good record, and the next save retries from it', async () => {
    let fail = false;
    const store = memoryStore({ beforeCommit: () => { if (fail) throw new Error('QuotaExceededError'); } });
    const { world, session } = await openGameWorld(store, 3);
    addWild(world);
    await session.save(world, 1);
    const good = structuredClone(store.data.get(MAIN_KEY));
    fail = true;
    addWild(world);
    await session.save(world, 2);
    expect(session.state).toBe('error');
    expect(session.writable).toBe(true);
    expect(store.data.get(MAIN_KEY)).toEqual(good);
    fail = false;
    await session.save(world, 3);
    expect(session.state).toBe('saved');
    const d = decodeSave((store.data.get(MAIN_KEY) as StoredSave).text);
    expect(d.ok && d.world.roster).toHaveLength(2);
  });
});

describe('two tabs on one store', () => {
  const rosterIn = (store: ReturnType<typeof memoryStore>) => {
    const d = decodeSave((store.data.get(MAIN_KEY) as StoredSave).text);
    if (!d.ok) throw new Error(d.detail);
    return d.world.roster.map((r) => r.genome.gid);
  };

  it('both fresh: the first to write keeps the slot; the other is told and never overwrites it', async () => {
    const store = memoryStore();
    const a = await openGameWorld(store, 10);
    const b = await openGameWorld(store, 20);
    addWild(a.world);
    await a.session.save(a.world, 1);
    expect(a.session.state).toBe('saved');

    await b.session.save(b.world, 2);
    expect(b.session.state).toBe('conflict');
    expect(b.session.writable).toBe(false);

    addWild(a.world);
    addBred(a.world, rosterId(a.world, 0), rosterId(a.world, 1));
    await a.session.save(a.world, 3);
    await b.session.save(b.world, 4);
    expect(a.session.state).toBe('saved');
    expect(rosterIn(store)).toEqual(a.world.roster.map((r) => r.genome.gid));
    expect(rosterIn(store)).toHaveLength(3);

    // A third tab opened now sees A's bred dragon.
    const c = await openGameWorld(store, 30);
    expect(c.world).toEqual(a.world);
  });

  it('both loaded the same record: a stale tab cannot overwrite the bred dragon the other saved', async () => {
    const store = memoryStore();
    const first = await openGameWorld(store, 10);
    addWild(first.world);
    addWild(first.world);
    await first.session.save(first.world, 1);

    const a = await openGameWorld(store, 0);
    const b = await openGameWorld(store, 0);
    expect(a.session.gen).toBe(b.session.gen);
    addBred(b.world, rosterId(b.world, 0), rosterId(b.world, 1));
    await b.session.save(b.world, 2);   // B breeds and saves first
    await a.session.save(a.world, 3);   // A, which never saw the child, tries to save
    expect(a.session.state).toBe('conflict');
    expect(rosterIn(store)).toHaveLength(3);
    expect(rosterIn(store)[2]).toBe(b.world.roster[2]?.genome.gid);
  });

  it('a stale tab told by broadcast stops before it even tries', async () => {
    const store = memoryStore();
    const a = await openGameWorld(store, 10);
    await a.session.save(a.world, 1);
    a.session.markStale(a.session.gen);      // its own gen: not stale
    expect(a.session.state).toBe('saved');
    a.session.markStale(a.session.gen + 1);
    expect(a.session.state).toBe('conflict');
    const gen = (store.data.get(MAIN_KEY) as StoredSave).gen;
    await a.session.save(a.world, 2);
    expect((store.data.get(MAIN_KEY) as StoredSave).gen).toBe(gen);
  });
});

describe('every save is issued at once (cycle 2: no write waits in a queue for the one before)', () => {
  // Cycle 1 coalesced: a save requested while one was in flight waited in memory for it,
  // so an unload in between lost the newest world (FINDINGS M8a cycle 1, D1). Now each save
  // is its own write, issued immediately; the store keeps them in order.
  it('three saves without waiting: three writes, landing in order, the newest last', async () => {
    const store = memoryStore();
    const { world, session } = await openGameWorld(store, 10);
    store.hold();
    const p1 = session.save(world, 1);
    addWild(world);
    const p2 = session.save(world, 2);
    addWild(world);
    const p3 = session.save(world, 3);
    expect(session.inflight).toBe(3);
    store.release();
    await Promise.all([p1, p2, p3]);
    expect(session.state).toBe('saved');
    expect(session.writes).toBe(3);
    expect(session.inflight).toBe(0);
    expect(session.lastSavedAt).toBe(3);
    const main = store.data.get(MAIN_KEY) as StoredSave;
    expect(main.gen).toBe(3);
    expect(main.text).toBe(encodeSave(world));
  });

  it('a write older than one already stored from the same session is skipped, not applied', async () => {
    const store = memoryStore();
    await store.write({ text: 'new', savedAt: 2, base: 0, baseWriter: '', baseSeq: 0, writer: 'w', seq: 5 });
    const r = await store.write({ text: 'old', savedAt: 1, base: 0, baseWriter: '', baseSeq: 0, writer: 'w', seq: 4 });
    expect(r).toMatchObject({ ok: true, skipped: true });
    expect((store.data.get(MAIN_KEY) as StoredSave).text).toBe('new');
  });

  it('pipelined writes keep the two-tab guard: whoever lands first keeps the slot', async () => {
    for (const bFirst of [false, true]) {
      const store = memoryStore();
      const a = await openGameWorld(store, 1);
      const b = await openGameWorld(store, 2);
      addWild(a.world);
      addWild(b.world);
      store.hold();
      const ps = bFirst
        ? [b.session.save(b.world, 1), a.session.save(a.world, 2), a.session.save(a.world, 3)]
        : [a.session.save(a.world, 1), a.session.save(a.world, 2), b.session.save(b.world, 3)];
      store.release();
      await Promise.all(ps);
      const [live, dead] = bFirst ? [b, a] : [a, b];
      expect(live.session.state).toBe('saved');
      expect(dead.session.state).toBe('conflict');
      expect((store.data.get(MAIN_KEY) as StoredSave).text).toBe(encodeSave(live.world));
    }
  });
});

describe('an unload with writes in flight loses nothing (cycle 2, D1)', () => {
  it('the critic\'s case: store busy, save then roster change, unload — the roster comes back', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const first = await openGameWorld(store, 7, { journal, writer: 'page1' });
    await first.session.save(first.world, 1);            // the boot save
    expect(journal.entries.size).toBe(0);                // landed, so the journal is cleared

    store.hold();                                        // another tab holds the store
    void first.session.save(first.world, 2);             // __dragonveinSave.save()
    addWild(first.world);                                 // seedRoster()
    addWild(first.world);
    addBred(first.world, rosterId(first.world, 0), rosterId(first.world, 1));
    void first.session.save(first.world, 3);
    expect(store.unload()).toBe(2);                      // reload: both writes die unstarted

    const second = await openGameWorld(store, 8, { journal, writer: 'page2' });
    expect(second.report.source).toBe('journal');
    expect(second.world).toEqual(first.world);
    expect(second.world.roster).toHaveLength(3);
    await second.session.save(second.world, 4);
    expect(second.session.state).toBe('saved');
    expect(journal.entries.size).toBe(0);                // promoted, then swept
    const third = await openGameWorld(store, 9, { journal, writer: 'page3' });
    expect(third.report.source).toBe('loaded');
    expect(third.world.roster).toHaveLength(3);
  });

  it('a journal written over a record another tab has since replaced is not promoted, and is swept', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const a = await openGameWorld(store, 1, { journal, writer: 'A' });
    const b = await openGameWorld(store, 2, { journal, writer: 'B' });
    store.hold();
    addWild(a.world);
    void a.session.save(a.world, 1);                     // journalled, never lands
    store.unload();
    addWild(b.world);
    addWild(b.world);
    await b.session.save(b.world, 2);                    // B lands gen 1
    const c = await openGameWorld(store, 3, { journal, writer: 'C' });
    expect(c.report.source).toBe('loaded');
    expect(c.world).toEqual(b.world);
    await c.session.save(c.world, 3);
    expect(journal.entries.size).toBe(0);
  });

  it('a journal entry older than what its own session already stored is not promoted', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const a = await openGameWorld(store, 1, { journal, writer: 'A' });
    addWild(a.world);
    await a.session.save(a.world, 1);
    const landed = structuredClone(a.world);
    journal.write({ writer: 'A', base: 0, baseWriter: '', baseSeq: 0, seq: 1, savedAt: 1, text: encodeSave(createWorld(1)) });
    const b = await openGameWorld(store, 2, { journal, writer: 'B' });
    expect(b.report.source).toBe('loaded');
    expect(b.world).toEqual(landed);
  });

  it('of two promotable entries the later wins; an unreadable one is passed over', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const w1 = createWorld(1);
    addWild(w1);
    const w2 = createWorld(2);
    addWild(w2);
    addWild(w2);
    journal.write({ writer: 'X', base: 0, baseWriter: '', baseSeq: 0, seq: 1, savedAt: 10, text: encodeSave(w1) });
    journal.write({ writer: 'Y', base: 0, baseWriter: '', baseSeq: 0, seq: 1, savedAt: 20, text: encodeSave(w2) });
    journal.write({ writer: 'Z', base: 0, baseWriter: '', baseSeq: 0, seq: 1, savedAt: 30, text: '{"broken' });
    const r = await openGameWorld(store, 3, { journal });
    expect(r.report.source).toBe('journal');
    expect(r.world).toEqual(w2);
  });

  it('an old journal does not match a new record that reuses its gen after a set-aside', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const old = createWorld(1);
    addWild(old);
    // Written by a session that had loaded gen 1 from writer X, long ago.
    journal.write({ writer: 'Q', base: 1, baseWriter: 'X', baseSeq: 3, seq: 9, savedAt: 1, text: encodeSave(old) });
    // The slot now holds a different gen 1, written by Y after a set-aside.
    const now = createWorld(2);
    store.data.set(MAIN_KEY, { gen: 1, savedAt: 5, text: encodeSave(now), writer: 'Y', seq: 1 } satisfies StoredSave);
    const r = await openGameWorld(store, 3, { journal });
    expect(r.report.source).toBe('loaded');
    expect(r.world).toEqual(now);
    // And a stale writer holding that old reference is refused by the store too.
    expect(await store.write({ text: 'x', savedAt: 9, base: 1, baseWriter: 'X', baseSeq: 3, writer: 'Q', seq: 10 }))
      .toEqual({ ok: false, gen: 1 });
  });

  it('a refused record ignores the journal and leaves it where it is', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    store.data.set(MAIN_KEY, { gen: 4, savedAt: 1, text: 'not json' } satisfies StoredSave);
    journal.write({ writer: 'X', base: 4, baseWriter: '', baseSeq: 0, seq: 1, savedAt: 10, text: encodeSave(createWorld(1)) });
    const r = await openGameWorld(store, 3, { journal });
    expect(r.session.state).toBe('corrupt');
    expect(journal.entries.size).toBe(1);
  });

  it('times each save with the clock it is given', async () => {
    let t = 0;
    const store = memoryStore();
    const { world, session } = await openGameWorld(store, 1, { journal: memoryJournal(), clock: () => (t += 1) });
    await session.save(world, 1);
    expect(session.lastTiming).toMatchObject({ serialiseMs: 1, journalMs: 1, putMs: 0, bytes: encodeSave(world).length });
    expect(session.lastTiming?.roundTripMs).toBeGreaterThan(0);
  });
});

describe('a refused record has a way out that destroys nothing (cycle 2, D2)', () => {
  const REFUSED: [string, unknown][] = [
    ['newer', { gen: 6, savedAt: 1, text: editedFixture((p) => { p.world.schema = SCHEMA_VERSION + 1; }) }],
    ['corrupt', { gen: 6, savedAt: 1, text: '{"rngVersion": 1, "world": ' }],
    ['incomplete', { gen: 6, savedAt: 1, text: editedFixture((p) => { delete p.world.roster; }) }],
    ['corrupt', 'not an envelope at all'],
  ];

  it.each(REFUSED)('%s: set aside byte-identical, then the new world saves, and the old one stays', async (reason, raw) => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, structuredClone(raw));
    store.data.set(backupKey(1), { gen: 2, savedAt: 0, text: FIXTURE_V1 });
    const { world, session } = await openGameWorld(store, 5);
    expect(session.state).toBe(reason);
    expect(session.refused?.raw).toEqual(raw);

    const key = await session.setAside();
    expect(key).toBe('refused.1');
    expect(store.data.get('refused.1')).toEqual(raw);
    expect(JSON.stringify(store.data.get('refused.1'))).toBe(JSON.stringify(raw));
    expect(store.data.has(MAIN_KEY)).toBe(false);
    expect(session.writable).toBe(true);
    addWild(world);
    await session.save(world, 1);
    expect(session.state).toBe('saved');
    expect((store.data.get(MAIN_KEY) as StoredSave).gen).toBe(1);

    const again = await openGameWorld(store, 6);
    expect(again.report.source).toBe('loaded');
    expect(again.world).toEqual(world);
    expect(store.data.get('refused.1')).toEqual(raw);
    expect(store.data.get(backupKey(1))).toEqual({ gen: 2, savedAt: 0, text: FIXTURE_V1 });
  });

  it('a second refusal goes to refused.2; the first is never overwritten', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, 'first');
    await (await openGameWorld(store, 1)).session.setAside();
    store.data.set(MAIN_KEY, 'second');
    const key = await (await openGameWorld(store, 1)).session.setAside();
    expect(key).toBe('refused.2');
    expect(store.data.get('refused.1')).toBe('first');
    expect(store.data.get('refused.2')).toBe('second');
  });

  it('one tampered dragon among four: the other three are salvaged, with their gids', async () => {
    const text = editedFixture((p) => {
      ((p.world.roster as Roster)[1]!.genome.g.wingSpan as [[number, boolean], [number, boolean]])[0][0] = 1.234;
    });
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 3, savedAt: 1, text } satisfies StoredSave);
    const { world, session } = await openGameWorld(store, 5);
    expect(session.state).toBe('corrupt');
    expect(session.refused?.salvage.map((g) => g.gid)).toEqual(['2bf296d8d9', 'd0699f21cf', '4acfb32ece']);
    expect(salvageGenomes(text)).toHaveLength(3);
    await session.setAside();
    adoptGenomes(world, session.asideKey ? salvageGenomes(text) : []);
    await session.save(world, 1);
    const back = await openGameWorld(store, 6);
    expect(back.report.source).toBe('loaded');
    expect(back.world.roster.map((r) => r.genome.gid)).toEqual(['2bf296d8d9', 'd0699f21cf', '4acfb32ece']);
    // New ids in the fresh world, after its wild dragon's (id 1, schema 2).
    expect(back.world.wild.id).toBe(1);
    expect(back.world.roster.map((r) => r.id)).toEqual([2, 3, 4]);
    expect((store.data.get('refused.1') as StoredSave).text).toBe(text);
  });

  it('salvages nothing it cannot interpret: newer schema, not JSON, not text', () => {
    expect(salvageGenomes(editedFixture((p) => { p.world.schema = SCHEMA_VERSION + 1; }))).toEqual([]);
    expect(salvageGenomes('{"rngVersion"')).toEqual([]);
    expect(salvageGenomes(42)).toEqual([]);
    expect(salvageGenomes(FIXTURE_V1)).toHaveLength(4);
  });

  it('does not move a record that changed after it was refused, and a crash moves nothing', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 3, savedAt: 1, text: 'x' } satisfies StoredSave);
    const { session } = await openGameWorld(store, 5);
    store.data.set(MAIN_KEY, { gen: 4, savedAt: 2, text: FIXTURE_V1 } satisfies StoredSave);
    expect(await session.setAside()).toBeNull();
    expect(session.writable).toBe(false);
    expect([...store.data.keys()]).toEqual([MAIN_KEY]);

    const crashing = memoryStore({ beforeCommit: () => { throw new Error('tab closed'); } });
    crashing.data.set(MAIN_KEY, 'junk');
    const c = await openGameWorld(crashing, 5);
    expect(await c.session.setAside()).toBeNull();
    expect(c.session.state).toBe('corrupt');
    expect([...crashing.data]).toEqual([[MAIN_KEY, 'junk']]);
  });
});

describe('cycle 3: identity, durability, timeouts and an emptied slot', () => {
  it('D1, the critic\'s sequence: start-fresh in a stale tab cannot move the other tab\'s live save aside', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 2, savedAt: 1, text: 'garbage' } satisfies StoredSave);
    const a = await openGameWorld(store, 1, { writer: 'A' });
    const b = await openGameWorld(store, 2, { writer: 'B' });
    expect(a.session.state).toBe('corrupt');
    expect(b.session.state).toBe('corrupt');

    expect(await a.session.setAside()).toBe('refused.1');
    addWild(a.world);
    await a.session.save(a.world, 10);
    addWild(a.world);
    await a.session.save(a.world, 11);
    expect((store.data.get(MAIN_KEY) as StoredSave).gen).toBe(2);     // the gen B refused, reused

    const live = structuredClone(store.data.get(MAIN_KEY));
    expect(await b.session.setAside()).toBeNull();
    expect(b.session.asideRefused).toBe(true);
    expect(b.session.writable).toBe(false);
    expect(b.session.detail).toMatch(/reload/);
    expect(store.data.get(MAIN_KEY)).toEqual(live);
    expect(store.data.has('refused.2')).toBe(false);
    expect(store.data.get('refused.1')).toEqual({ gen: 2, savedAt: 1, text: 'garbage' });
    // And A keeps saving.
    await a.session.save(a.world, 12);
    expect(a.session.state).toBe('saved');
  });

  it('D1: set-aside matches the whole stored value, not its gen', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 2, savedAt: 1, text: 'x', writer: 'W', seq: 4 } satisfies StoredSave);
    for (const other of [
      { gen: 2, savedAt: 1, text: 'x', writer: 'V', seq: 4 },
      { gen: 2, savedAt: 1, text: 'x', writer: 'W', seq: 5 },
      { gen: 2, savedAt: 1, text: 'y', writer: 'W', seq: 4 },
      { gen: 2, savedAt: 9, text: 'x', writer: 'W', seq: 4 },
    ]) expect(await store.setAside(other)).toBeNull();
    expect(await store.setAside({ gen: 2, savedAt: 1, text: 'x', writer: 'W', seq: 4 })).toBe('refused.1');
  });

  it('D4: without a journal, "saved" waits for the newest write to land', async () => {
    const store = memoryStore();
    const { world, session } = await openGameWorld(store, 1);
    await session.save(world, 1);
    expect(session.state).toBe('saved');
    expect(session.durable).toBe(true);
    expect(session.journalOk).toBe(false);
    store.hold();
    addWild(world);
    const p = session.save(world, 2);
    expect(session.durable).toBe(false);          // the HUD shows "saving", not "saved"
    store.release();
    await p;
    expect(session.durable).toBe(true);
  });

  it('D4: with a journal the newest change is durable at once; a failing journal is reported', async () => {
    const store = memoryStore();
    const journal = memoryJournal();
    const { world, session } = await openGameWorld(store, 1, { journal });
    store.hold();
    void session.save(world, 1);
    expect(session.durable).toBe(true);
    expect(session.journalOk).toBe(true);
    store.release();

    const full: Journal = { read: () => [], write: () => false, remove: () => {} };
    const s2 = await openGameWorld(memoryStore(), 1, { journal: full });
    await s2.session.save(s2.world, 1);
    expect(s2.session.journalOk).toBe(false);
    expect(s2.session.state).toBe('saved');
  });

  it('D5: a load read that does not answer times out, and the session never writes', async () => {
    const store = memoryStore();
    store.data.set(MAIN_KEY, { gen: 3, savedAt: 1, text: FIXTURE_V1 } satisfies StoredSave);
    store.hold();
    const { world, session } = await openGameWorld(store, 1, { readTimeoutMs: 20 });
    expect(session.state).toBe('unavailable');
    expect(session.detail).toMatch(/^timeout:/);
    expect(session.writable).toBe(false);
    await session.save(world, 1);
    store.release();
    expect(store.data.get(MAIN_KEY)).toEqual({ gen: 3, savedAt: 1, text: FIXTURE_V1 });
  });

  it('D6: a slot emptied under the session (database deleted) is re-saved with a notice, not a conflict', async () => {
    const store = memoryStore();
    const { world, session } = await openGameWorld(store, 1, { writer: 'A' });
    addWild(world);
    await session.save(world, 1);
    await session.save(world, 2);
    store.data.clear();
    await session.save(world, 3);
    expect(session.state).toBe('saved');
    expect(session.notice).toMatch(/emptied/);
    const main = store.data.get(MAIN_KEY) as StoredSave;
    expect(main.gen).toBe(1);
    expect(main.text).toBe(encodeSave(world));
    // But a slot holding someone else's record is still a conflict.
    store.data.set(MAIN_KEY, { gen: 9, savedAt: 1, text: 'x', writer: 'B', seq: 1 } satisfies StoredSave);
    await session.save(world, 4);
    expect(session.state).toBe('conflict');
  });
});

it('a session without a store is never writable', () => {
  const s = new SaveSession(null, { state: 'unavailable', detail: '', base: 0, writer: 'w' });
  expect(s.writable).toBe(false);
});
