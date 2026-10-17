/**
 * M8b: a wild dragon reacts to the keeper (STATE.md run 33, criteria 1–3).
 *
 *   1. `temperament(genome)` is pure, bounded and monotone in the genes it names, and the
 *      sheet's eight dragons differ by ≥ 30 % in notice radius and calm rate.
 *   2. A scripted keeper path stepped through src/sim gives the expected state sequence —
 *      far → wander; approach → alert → wary; stillness → settle with calm rising every tick;
 *      rush → flee — and the same seed and path give the same world, across a save too.
 *   3. Schema 2: the frozen schema-1 fixture loads through the 1 → 2 migration with its
 *      roster intact and a wild dragon added, and the frozen schema-2 fixture loads as written.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENES, Genome, breed, wild, type Element, type GeneName, type Phenotype } from '../src/core/genome';
import { Rng } from '../src/core/rng';
import { walkParamsOf } from '../src/assets/dragon/walk';
import { bodyGraph } from '../src/assets/dragon/graph';
import { decodeSave, encodeSave } from '../src/sim/migrate';
import { addBred, addWild } from '../src/sim/roster';
import {
  BODY_OFFSET, BODY_RADIUS, CAREFUL, DRAGON_SCALE, KEEPER_RUN, KEEPER_WALK, NERVE, OPEN_DECK, SLOW, TEMPER_BOUNDS,
  WILD_DT, bodyClear, circleClear, fleeProgress, gaitSpeed, keeperTo, temperament, temperamentOf,
  type Deck, type Temperament, type WildState,
} from '../src/sim/wild';
import { SCHEMA_VERSION, TICK_HZ, createWorld, step, type World } from '../src/sim/world';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_V1 = readFileSync(path.join(ROOT, 'tests/fixtures/save-v1.json'), 'utf8');
const FIXTURE_V2 = readFileSync(path.join(ROOT, 'tests/fixtures/save-v2.json'), 'utf8');

type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const gfx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe }[];
};
const fixed: Genome[] = [];
for (const { recipe: r } of gfx.genomes) {
  fixed.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(fixed[r.a]!, fixed[r.b]!, r.seed));
}
/** src/dragon-view.ts SHEET: one wild dragon per element on seeds 1–6, then G = A × B and H = G × C. */
const SHEET_ELEMENTS: Element[] = ['ember', 'tide', 'stone', 'gale', 'jade', 'umbra'];
const sheet: Genome[] = SHEET_ELEMENTS.map((e, i) => wild(i + 1, e));
sheet.push(breed(sheet[0]!, sheet[1]!, 7));
sheet.push(breed(sheet[6]!, sheet[2]!, 8));

const FIELDS = Object.keys(TEMPER_BOUNDS) as (keyof Temperament)[];
const NAMED: GeneName[] = ['bodyMass', 'wingSpan', 'headSize', 'legLength'];
/** Each field's direction in each named gene: +1 rises, −1 falls, 0 does not read it. */
const DIRECTION: Record<keyof Temperament, Partial<Record<GeneName, 1 | -1>>> = {
  skittish: { wingSpan: 1, bodyMass: -1, headSize: 1 },
  notice: { wingSpan: 1, bodyMass: -1, headSize: 1 },
  flight: { wingSpan: 1, bodyMass: -1, headSize: 1 },
  comfort: { wingSpan: 1, bodyMass: -1, headSize: 1 },
  calmRate: { wingSpan: -1, bodyMass: 1, headSize: -1 },
  rush: { wingSpan: -1, bodyMass: 1, headSize: -1 },
  calmLoss: { wingSpan: 1, bodyMass: -1, headSize: 1 },
  walk: { legLength: 1, bodyMass: -1 },
  fly: { wingSpan: 1 },
};
const across = (gene: GeneName, n = 13): number[] => {
  const [lo, hi] = GENES[gene];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};
const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs) - 1;

describe('temperament from genes (criterion 1)', () => {
  it('is pure: the same genome gives the same numbers, and the genome is not touched', () => {
    for (const g of fixed) {
      const j = g.toJSON();
      const before = JSON.stringify(j);
      expect(temperament(j)).toEqual(temperament(j));
      expect(temperament(j)).toEqual(temperamentOf(g.phenotype, g.element[0]));
      expect(JSON.stringify(j)).toBe(before);
    }
  });

  it('stays inside its bounds for every fixture genome and every extreme', () => {
    const check = (t: Temperament, what: string) => {
      for (const f of FIELDS) {
        const [lo, hi] = TEMPER_BOUNDS[f];
        if (!(t[f] >= lo - 1e-9 && t[f] <= hi + 1e-9)) expect.fail(`${what}: ${f} = ${t[f]} outside [${lo}, ${hi}]`);
      }
      // The rings nest: flight < comfort < notice, with room between each.
      expect(t.comfort - t.flight).toBeGreaterThanOrEqual(1.3 - 1e-9);
      expect(t.notice - t.comfort).toBeGreaterThanOrEqual(0.4 - 1e-9);
      // A walk is never a rush, a run always is.
      expect(KEEPER_WALK).toBeLessThan(t.rush);
      expect(KEEPER_RUN).toBeGreaterThan(t.rush);
    };
    for (const g of fixed) check(temperament(g.toJSON()), `fixture ${g.gid()}`);
    for (const el of SHEET_ELEMENTS) {
      for (const pick of [0, 1]) {
        const p = Object.fromEntries(NAMED.map((n) => [n, GENES[n][pick]])) as Phenotype;
        check(temperamentOf(p, el), `${el} all ${pick ? 'max' : 'min'}`);
        const q = Object.fromEntries(NAMED.map((n) => [n, GENES[n][1 - pick]])) as Phenotype;
        q.bodyMass = GENES.bodyMass[pick] as number;
        check(temperamentOf(q, el), `${el} mixed`);
      }
    }
  });

  it.each(NAMED)('is monotone in %s, every other gene held at each sheet dragon\'s', (gene) => {
    for (const g of sheet) {
      const base = g.phenotype;
      const ts = across(gene).map((v) => temperamentOf({ ...base, [gene]: v }, g.element[0]));
      for (const f of FIELDS) {
        const dir = DIRECTION[f][gene] ?? 0;
        for (let i = 1; i < ts.length; i++) {
          const d = ts[i]![f] - ts[i - 1]![f];
          if (dir === 0) expect(d).toBe(0);
          else if (dir * d < -1e-12) expect.fail(`${f} is not monotone (${dir > 0 ? 'rising' : 'falling'}) in ${gene}`);
        }
        if (dir !== 0 && f !== 'skittish' && f !== 'walk') {
          // It actually reads the gene: across the range it moves (unless clamped at a bound).
          const moved = Math.abs(ts[ts.length - 1]![f] - ts[0]![f]);
          const k0 = ts[0]!.skittish, k1 = ts[ts.length - 1]!.skittish;
          if (!(k0 === k1 && (k0 === 0 || k0 === 1))) expect(moved).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is monotone in the element: the more nervous the element, the more skittish', () => {
    const order = [...SHEET_ELEMENTS].sort((a, b) => NERVE[a] - NERVE[b]);
    expect(order).toEqual(['stone', 'jade', 'tide', 'ember', 'umbra', 'gale']);
    const p = sheet[0]!.phenotype;
    const ks = order.map((e) => temperamentOf(p, e).skittish);
    for (let i = 1; i < ks.length; i++) expect(ks[i]!).toBeGreaterThanOrEqual(ks[i - 1]!);
  });

  it('spreads notice radius and calm rate by ≥ 30 % across the sheet\'s eight dragons', () => {
    const ts = sheet.map((g) => temperament(g.toJSON()));
    const notice = ts.map((t) => t.notice), calmRate = ts.map((t) => t.calmRate);
    // Reported for STATE.md: the numbers behind the criterion.
    console.log(`sheet temperament: ${sheet.map((g, i) =>
      `${'ABCDEFGH'[i]} ${g.element[0]} k ${ts[i]!.skittish.toFixed(3)} notice ${notice[i]!.toFixed(2)} calmRate ${calmRate[i]!.toFixed(3)}`).join('; ')}`);
    console.log(`spread: notice ${(spread(notice) * 100).toFixed(1)} %, calmRate ${(spread(calmRate) * 100).toFixed(1)} %`);
    expect(spread(notice)).toBeGreaterThanOrEqual(0.30);
    expect(spread(calmRate)).toBeGreaterThanOrEqual(0.30);
  });

  it('walks at the gait\'s own speed (src/assets/dragon/walk.ts), scaled, so the feet keep up', () => {
    for (const g of fixed) {
      const p = g.phenotype;
      expect(gaitSpeed(p.legLength, p.bodyMass)).toBeCloseTo(1.5 * DRAGON_SCALE * walkParamsOf(p).speed, 12);
    }
  });

  it('the sim tick matches the world clock', () => {
    expect(WILD_DT).toBe(1 / TICK_HZ);
  });

  it('the footprint covers the torso and head of every fixture dragon at DRAGON_SCALE', () => {
    // The renderer centres the mesh on (hip + shoulder) / 2 (src/render/wild.ts); graph
    // nodes 4–15 are the hip to the head's tip, z-up (x, y, z) → deck (x, −y).
    let worst = 0;
    for (const g of fixed) {
      const { g: gr, idx } = bodyGraph(g.phenotype);
      const cx = (gr.v[idx.hip]![0] + gr.v[idx.shoulder]![0]) / 2;
      for (let n = 4; n <= 15; n++) {
        const x = DRAGON_SCALE * (gr.v[n]![0] - cx), z = -DRAGON_SCALE * gr.v[n]![1];
        let inside = Infinity;
        for (let i = 0; i < BODY_OFFSET.length; i++) {
          inside = Math.min(inside, Math.hypot(x - BODY_OFFSET[i]!, z) - BODY_RADIUS[i]!);
        }
        worst = Math.max(worst, inside);
      }
    }
    // Head tips may poke out by a little: the head is the part that turns toward the keeper.
    expect(worst).toBeLessThan(0.12);
  });
});

/** The scripted keeper path every reaction test walks. */
const FAR_UNTIL = 200, APPROACH_AT = 200, RUSH_AT = 560, END = 760;
interface Trace { states: WildState[]; calm: number[]; still: boolean[]; inComfort: boolean[] }

function script(w: World, deck: Deck): void {
  const d = w.wild, k = w.keeper;
  const T = temperament(d.genome);
  if (w.tick === APPROACH_AT) {
    // Walk in to just outside its flight distance, along the line from the keeper.
    const dx = d.pos[0] - k.pos[0], dz = d.pos[1] - k.pos[1], dist = Math.hypot(dx, dz);
    const stop = dist - (T.flight + 0.45);
    keeperTo(w, deck, k.pos[0] + (dx / dist) * stop, k.pos[1] + (dz / dist) * stop, false);
  }
  if (w.tick === RUSH_AT) keeperTo(w, deck, d.pos[0], d.pos[1], true);
}

function run(w: World, until: number, deck: Deck = OPEN_DECK, trace?: Trace): World {
  while (w.tick < until) {
    script(w, deck);
    step(w, deck);
    if (trace) {
      const T = temperament(w.wild.genome);
      trace.states.push(w.wild.state);
      trace.calm.push(w.wild.calm);
      trace.still.push(w.keeper.v < SLOW);
      trace.inComfort.push(Math.hypot(w.keeper.pos[0] - w.wild.pos[0], w.keeper.pos[1] - w.wild.pos[1]) <= T.comfort);
    }
  }
  return w;
}
const changes = (xs: WildState[]): WildState[] => xs.filter((s, i) => i === 0 || s !== xs[i - 1]);
/** True when `want` appears in `seq` in order (not necessarily adjacent). */
const inOrder = (seq: WildState[], want: WildState[]) => {
  let i = 0;
  for (const s of seq) if (s === want[i]) i++;
  return i === want.length;
};
const SEEDS = [11, 0x0d4ac0de, 777, 4242];

describe('a scripted keeper gives the expected reaction (criterion 2)', () => {
  it.each(SEEDS)('seed %s: far → wander only', (seed) => {
    const t: Trace = { states: [], calm: [], still: [], inComfort: [] };
    run(createWorld(seed), FAR_UNTIL, OPEN_DECK, t);
    expect(new Set(t.states)).toEqual(new Set(['graze', 'wander']));
  });

  it.each(SEEDS)('seed %s: approach → alert → wary, then stillness → settle with calm rising every tick', (seed) => {
    const t: Trace = { states: [], calm: [], still: [], inComfort: [] };
    const w = run(createWorld(seed), RUSH_AT, OPEN_DECK, t);
    const approach = t.states.slice(APPROACH_AT);
    expect(approach).not.toContain('flee');
    expect(inOrder(changes(approach), ['alert', 'wary', 'alert', 'settle'])).toBe(true);
    expect(w.wild.state).toBe('settle');
    // While the keeper stands still inside the comfort ring, calm rises on every tick until full.
    let stillTicks = 0;
    for (let i = APPROACH_AT + 1; i < t.calm.length; i++) {
      if (!(t.still[i] && t.still[i - 1] && t.inComfort[i]) || t.calm[i - 1]! >= 1) continue;
      stillTicks++;
      if (!(t.calm[i]! > t.calm[i - 1]!)) expect.fail(`tick ${i}: calm ${t.calm[i - 1]} -> ${t.calm[i]} while still`);
    }
    expect(stillTicks).toBeGreaterThan(40);
    expect(w.wild.calm).toBeGreaterThan(0.3);
  });

  it.each(SEEDS)('seed %s: rush → flee: it loses calm, takes off, and lands clear and far', (seed) => {
    const t: Trace = { states: [], calm: [], still: [], inComfort: [] };
    const w = run(createWorld(seed), RUSH_AT, OPEN_DECK);
    const calmBefore = w.wild.calm;
    const T = temperament(w.wild.genome);
    let from: [number, number] | null = null;
    let landed: [number, number] | null = null;
    while (w.tick < END) {
      run(w, w.tick + 1, OPEN_DECK, t);
      if (w.wild.state === 'flee' && !from) {
        from = [w.wild.from[0], w.wild.from[1]];
        expect(w.wild.calm).toBeCloseTo(Math.max(0, calmBefore - T.calmLoss), 1);
      }
      if (from && !landed && w.wild.state !== 'flee') landed = [w.wild.pos[0], w.wild.pos[1]];
    }
    expect(t.states).toContain('flee');
    expect(landed).not.toBeNull();
    expect(Math.hypot(landed![0] - from![0], landed![1] - from![1])).toBeGreaterThan(1.5);
    expect(bodyClear(OPEN_DECK, w.wild.pos[0], w.wild.pos[1], w.wild.heading)).toBe(true);
  });

  it('the same seed and path give the same world, byte for byte', () => {
    for (const seed of SEEDS) {
      const a = run(createWorld(seed), END);
      const b = run(createWorld(seed), END);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('stepping two worlds on two decks in turn gives each the world it gets alone', () => {
    // `stepWild` remembers its last "already in place" answers to skip repeat checks; that
    // memory must never carry from one world or deck to another.
    const clutter: Deck = { radius: 5.6, obstacles: [0.4, -0.6, 0.5, -2.2, 0.8, 0.45, 2.6, 2.9, 0.4], home: [1.2, 1.8], gate: [-4.2, -2.4] };
    const alone = [run(createWorld(SEEDS[0]!), END), run(createWorld(SEEDS[1]!, clutter), END, clutter)];
    const a = createWorld(SEEDS[0]!), b = createWorld(SEEDS[1]!, clutter);
    while (a.tick < END || b.tick < END) {
      if (a.tick < END) run(a, a.tick + 1);
      if (b.tick < END) run(b, b.tick + 1, clutter);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(alone[0]));
    expect(JSON.stringify(b)).toBe(JSON.stringify(alone[1]));
  });

  it('a keeper set down on an obstacle between ticks is moved off it on the next', () => {
    const deck: Deck = { radius: 5.6, obstacles: [-3, -3, 0.5], home: [1.2, 1.8], gate: [-4.2, -2.4] };
    const w = createWorld(SEEDS[0]!, deck);
    for (let i = 0; i < 40; i++) step(w, deck);
    w.keeper.pos[0] = -3.1; w.keeper.pos[1] = -3; w.keeper.goal[0] = -3.1; w.keeper.goal[1] = -3;
    step(w, deck);
    expect(circleClear(deck, w.keeper.pos[0], w.keeper.pos[1], 0.159)).toBe(true);
  });

  it.each([250, 330, 470, 600])('a save mid-sequence (tick %s) resumes into the same world', (at) => {
    for (const seed of SEEDS) {
      const straight = run(createWorld(seed), END);
      const half = run(createWorld(seed), at);
      const back = decodeSave(encodeSave(half));
      if (!back.ok) throw new Error(back.detail);
      expect(back.world).toEqual(half);
      const resumed = run(back.world, END);
      expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
    }
  });

  it('a slow approach — short, careful steps — never makes it wary, and settles it', () => {
    const w = createWorld(0x0d4ac0de);
    run(w, FAR_UNTIL);
    const T = temperament(w.wild.genome);
    const seen: WildState[] = [];
    // Walk to just outside the notice radius, then creep in by short steps, pausing between.
    const toward = (dist: number) => {
      const d = w.wild, k = w.keeper;
      const dx = d.pos[0] - k.pos[0], dz = d.pos[1] - k.pos[1], len = Math.hypot(dx, dz);
      return [k.pos[0] + (dx / len) * (len - dist), k.pos[1] + (dz / len) * (len - dist)] as const;
    };
    const [x0, z0] = toward(T.notice + 0.5);
    keeperTo(w, OPEN_DECK, x0, z0, false);
    for (let i = 0; i < 200; i++) step(w, OPEN_DECK);
    for (let n = 0; n < 40; n++) {
      const here = Math.hypot(w.keeper.pos[0] - w.wild.pos[0], w.keeper.pos[1] - w.wild.pos[1]);
      if (here < T.flight + 0.5) break;
      const [x, z] = toward(here - 0.4);
      keeperTo(w, OPEN_DECK, x, z, false);
      expect(w.keeper.pace).toBeCloseTo(CAREFUL * 0.4, 6);
      for (let i = 0; i < 30; i++) { step(w, OPEN_DECK); seen.push(w.wild.state); }
    }
    for (let i = 0; i < 200; i++) { step(w, OPEN_DECK); seen.push(w.wild.state); }
    expect(seen).not.toContain('wary');
    expect(seen).not.toContain('flee');
    expect(seen).toContain('settle');
  });

  it('keeps both bodies on the deck and out of every obstacle, and never gets stuck', () => {
    // A cluttered deck: a ring of trunks and a scatter of rocks.
    const obstacles: number[] = [];
    const r = new Rng(9);
    for (let i = 0; i < 40; i++) {
      const a = r.range(0, 2 * Math.PI), d = Math.sqrt(r.next()) * 5.2;
      obstacles.push(Math.cos(a) * d, Math.sin(a) * d, r.range(0.12, 0.4));
    }
    const deck: Deck = { radius: 5.6, obstacles, home: [1.2, 1.8], gate: [-4.2, -2.4] };
    const w = createWorld(31, deck);
    let moves = 0, last = [w.wild.pos[0], w.wild.pos[1]];
    for (let i = 0; i < 20 * 600; i++) {
      // The keeper wanders too: a new tap every 4 s, sometimes a run.
      if (i % 80 === 0) keeperTo(w, deck, r.range(-5.6, 5.6), r.range(-5.6, 5.6), r.chance(0.2));
      step(w, deck);
      const d = w.wild;
      if (d.state !== 'flee') {
        // Pushed out every tick: allow a hair of overlap from the last push.
        const c = Math.cos(d.heading), s = Math.sin(d.heading);
        for (let j = 0; j < BODY_OFFSET.length; j++) {
          const x = d.pos[0] + c * BODY_OFFSET[j]!, z = d.pos[1] + s * BODY_OFFSET[j]!;
          if (!circleClear(deck, x, z, BODY_RADIUS[j]! - 0.02)) expect.fail(`tick ${w.tick}: dragon circle ${j} overlaps (${x}, ${z})`);
        }
      }
      if (!circleClear(deck, w.keeper.pos[0], w.keeper.pos[1], 0.14)) expect.fail(`tick ${w.tick}: keeper overlaps`);
      if (i % 200 === 0) {
        if (Math.hypot(d.pos[0] - last[0]!, d.pos[1] - last[1]!) > 0.05) moves++;
        last = [d.pos[0], d.pos[1]];
      }
    }
    // Ten minutes: it went somewhere more often than not.
    expect(moves).toBeGreaterThan(20);
  });

  it('fleeProgress holds the takeoff and landing spots, and is a smooth 0 → 1 between', () => {
    expect(fleeProgress(0, 100)).toBe(0);
    expect(fleeProgress(18, 100)).toBe(0);
    expect(fleeProgress(82, 100)).toBe(1);
    expect(fleeProgress(50, 100)).toBeCloseTo(0.5, 6);
  });
});

describe('schema 2 (criterion 3)', () => {
  it('this build writes schema 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(createWorld(1).schema).toBe(2);
  });

  it('save-v1.json loads through the 1 → 2 migration, its roster intact and a wild dragon added', () => {
    const v1 = JSON.parse(FIXTURE_V1) as { world: { roster: { id: number; genome: { gid: string } }[]; rng: number[]; nextId: number } };
    const d = decodeSave(FIXTURE_V1);
    if (!d.ok) throw new Error(`${d.reason}: ${d.detail}`);
    expect(d.from).toBe(1);
    const w = d.world;
    expect(w.schema).toBe(2);
    expect(w.roster).toEqual(v1.world.roster);
    // The wild dragon: seeded by one draw from the world's own stream, given the next id.
    const r = Rng.fromState(v1.world.rng);
    const seed = Math.floor(r.next() * 4294967296) >>> 0;
    expect(w.rng).toEqual(r.state());
    expect(w.wild.genome).toEqual(wild(seed).toJSON());
    expect(Genome.fromJSON(w.wild.genome).gid()).toBe(w.wild.genome.gid);
    expect(w.wild.id).toBe(v1.world.nextId);
    expect(w.nextId).toBe(v1.world.nextId + 1);
    expect(w.wild).toMatchObject({ state: 'graze', calm: 0, pos: [1.2, 1.8] });
    expect(w.keeper).toEqual({ pos: [-4.2, -2.4], goal: [-4.2, -2.4], pace: 0, v: 0 });
    // And it plays: stepped on a deck with a rock on the migrated spot, it moves off it.
    const deck: Deck = { ...OPEN_DECK, obstacles: [1.2, 1.8, 0.5] };
    step(w, deck);
    expect(bodyClear(deck, w.wild.pos[0], w.wild.pos[1], w.wild.heading)).toBe(true);
  });

  // tests/fixtures/save-v2.json is a schema-2 save as M8b wrote it: world seed 0x0d4ac0de,
  // the v1 fixture's roster recipe (two wild, their child, one more wild), and the scripted
  // keeper caught mid-approach — the dragon watching it, calm partly risen. FROZEN, like
  // save-v1.json: every future build must load it with this dragon in this state.
  it('save-v2.json loads as written, mid-approach, and round-trips byte for byte', () => {
    const d = decodeSave(FIXTURE_V2);
    if (!d.ok) throw new Error(`${d.reason}: ${d.detail}`);
    expect(d.from).toBe(2);
    const p = JSON.parse(FIXTURE_V2) as { world: World };
    expect(d.world).toEqual(p.world);
    expect(JSON.parse(encodeSave(d.world))).toEqual(JSON.parse(FIXTURE_V2));
    expect(d.world.seed).toBe(0x0d4ac0de);
    expect(d.world.roster).toHaveLength(4);
    expect(d.world.wild.state).toBe('alert');
    expect(d.world.wild.calm).toBeGreaterThan(0);
    expect(d.world.wild.calm).toBeLessThan(0.3);
    for (const r of d.world.roster) expect(Genome.fromJSON(r.genome).gid()).toBe(r.genome.gid);
  });

  it.each([
    ['a wild dragon missing', (w: Record<string, unknown>) => { delete w.wild; }, 'incomplete'],
    ['an unknown state', (w: Record<string, unknown>) => { (w.wild as Record<string, unknown>).state = 'sleep'; }, 'corrupt'],
    ['calm above 1', (w: Record<string, unknown>) => { (w.wild as Record<string, unknown>).calm = 1.5; }, 'corrupt'],
    ['a position that is not two numbers', (w: Record<string, unknown>) => { (w.wild as Record<string, unknown>).pos = [1]; }, 'corrupt'],
    ['a wild id on the roster', (w: Record<string, unknown>) => { (w.wild as Record<string, unknown>).id = 2; }, 'corrupt'],
    ['a tampered wild genome', (w: Record<string, unknown>) => {
      const g = (w.wild as { genome: { g: Record<string, [[number, boolean], [number, boolean]]> } }).genome;
      g.g.wingSpan![0][0] = 1.234;
    }, 'corrupt'],
    ['a keeper missing its pace', (w: Record<string, unknown>) => { delete (w.keeper as Record<string, unknown>).pace; }, 'incomplete'],
    ['an unknown keeper field', (w: Record<string, unknown>) => { (w.keeper as Record<string, unknown>).hat = 1; }, 'corrupt'],
  ] as const)('a schema-2 record with %s is refused', (_, edit, reason) => {
    const p = JSON.parse(FIXTURE_V2) as { world: Record<string, unknown> };
    edit(p.world);
    expect(decodeSave(JSON.stringify(p))).toMatchObject({ ok: false, reason });
  });
});

/**
 * The recipe that wrote tests/fixtures/save-v2.json, kept as its provenance. The fixture is
 * frozen data, not a promise that later tuning of the sim reproduces it: what every build must
 * do is load it (above), not remake it.
 */
export function v2Recipe(): World {
  const w = createWorld(0x0d4ac0de);
  const a = addWild(w), b = addWild(w);
  addBred(w, a.id, b.id);
  addWild(w);
  // The scripted path's approach, caught after it has stopped and calm has begun to rise.
  run(w, APPROACH_AT);
  while (!(w.wild.state === 'alert' && w.wild.calm > 0.1 && w.keeper.v === 0)) run(w, w.tick + 1);
  return w;
}

describe('the keeper', () => {
  it('a short step is careful (below SLOW), a long one walks, a double tap runs', () => {
    const w = createWorld(5);
    const k = w.keeper;
    keeperTo(w, OPEN_DECK, k.pos[0] + 0.5, k.pos[1], false);
    expect(k.pace).toBeLessThan(SLOW);
    keeperTo(w, OPEN_DECK, k.pos[0] + 3, k.pos[1], false);
    expect(k.pace).toBe(KEEPER_WALK);
    keeperTo(w, OPEN_DECK, k.pos[0] + 3, k.pos[1], true);
    expect(k.pace).toBe(KEEPER_RUN);
  });

  it('a tap off the deck, or on the dragon, stops it at the edge', () => {
    const w = createWorld(5);
    keeperTo(w, OPEN_DECK, 50, 0, false);
    expect(Math.hypot(w.keeper.goal[0], w.keeper.goal[1])).toBeCloseTo(OPEN_DECK.radius - 0.16, 6);
    keeperTo(w, OPEN_DECK, w.wild.pos[0], w.wild.pos[1], false);
    expect(Math.hypot(w.keeper.goal[0] - w.wild.pos[0], w.keeper.goal[1] - w.wild.pos[1])).toBeGreaterThan(0.5);
  });
});
