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
import { Genome } from '../src/core/genome';
import { RNG_VERSION, Rng, isRngState, type RngState } from '../src/core/rng';
import { MAIN_KEY, backupKey, memoryStore, type SaveStore, type StoredSave } from '../src/core/save';
import {
  CHAIN, MIGRATIONS, Refused, assertChain, decodeSave, encodeSave, type Chain, type Migration,
} from '../src/sim/migrate';
import { SaveSession, openGameWorld, openWorld } from '../src/sim/persist';
import { addBred, addWild } from '../src/sim/roster';
import { SCHEMA_VERSION, TICK_HZ, createWorld, drawU32, step, type World } from '../src/sim/world';

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

/** A scripted run: roster changes at fixed ticks, each drawing seeds from `world.rng`. */
const SCRIPT: Record<number, (w: World) => void> = {
  100: (w) => { addWild(w); },
  250: (w) => { addWild(w); },
  380: (w) => { addBred(w, 1, 2); },
  650: (w) => { addWild(w); },
  777: (w) => { drawU32(w); drawU32(w); },
  900: (w) => { addBred(w, 3, 4); },
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
    expect(b.world).toEqual(a.world);
    expect(JSON.parse(encodeSave(b.world))).toEqual(JSON.parse(FIXTURE_V1));
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
    expect(store.data.has(backupKey(1))).toBe(false);   // same schema: nothing to back up
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
    for (const expectGen of [0, 1, -1]) {
      expect(await store.write({ text: 'x', savedAt: 0, expectGen })).toEqual({ ok: false, gen: -1 });
    }
    expect(store.data.get(MAIN_KEY)).toBe('garbage');
  });
});

describe('storage that is missing or failing', () => {
  it('no store: a fresh world, "unavailable", and saving is a no-op', async () => {
    const { world, session, report } = await openGameWorld(null, 3, 'IndexedDB refused to open');
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
      write: () => { writes++; return Promise.resolve({ ok: true, gen: 1 }); },
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
    addBred(a.world, 1, 2);
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
    addBred(b.world, 1, 2);
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

describe('saves never overlap', () => {
  it('saves requested while one is in flight coalesce into one write of the newest world', async () => {
    const store = memoryStore();
    const { world, session } = await openGameWorld(store, 10);
    const p1 = session.save(world, 1);
    addWild(world);
    const p2 = session.save(world, 2);
    addWild(world);
    const p3 = session.save(world, 3);
    await Promise.all([p1, p2, p3]);
    expect(session.state).toBe('saved');
    expect(session.writes).toBe(2);
    expect(session.lastSavedAt).toBe(3);
    const main = store.data.get(MAIN_KEY) as StoredSave;
    expect(main.gen).toBe(2);
    expect(main.text).toBe(encodeSave(world));
  });

  it('a session without a store is never writable', () => {
    const s = new SaveSession(null, { state: 'unavailable', detail: '', gen: 0 });
    expect(s.writable).toBe(false);
  });
});
