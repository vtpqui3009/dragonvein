/**
 * M8b criterion 7 (STATE.md run 35): **the keeper goes where it is told.**
 *
 * Before the navigation in src/sim/wild.ts the keeper walked straight at its goal and gave the
 * goal up as soon as sliding off an obstacle stopped making progress. Measured on the hero
 * island: of 40 deterministic deck targets it reached 2. A player tapping the island got
 * nowhere 95 % of the time.
 *
 * These tests run on **the hero island's own walkable deck**, frozen as
 * `tests/fixtures/hero-deck.json` — the `Deck` src/main.ts derives from the island's seeded
 * layout, dumped with `__dragonveinWild.deck()` in `?test`. It is a snapshot, so if the
 * island is re-dressed it must be dumped again; `gate:smoke` walks the live island through
 * real pointer events, which is what catches a stale one.
 *
 *   1. Over a fixed, seeded set of ≥ 40 reachable targets the keeper arrives within 0.45 at
 *      ≥ 95 % of them, on the hero deck and on an open one. "Reachable" is decided by this
 *      file's own flood fill over a grid twice as fine as the navigation's, so the bar is not
 *      the navigation grading its own homework.
 *   2. At a target inside an obstacle or off the deck it arrives at 0 % of them: it stops
 *      clear of every obstacle and inside the deck's edge, and then stands perfectly still.
 *   3. The route is derived, never saved: a world saved mid-walk and resumed steps on
 *      bit-identically to one that never stopped, and the save holds no route.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { decodeSave, encodeSave } from '../src/sim/migrate';
import {
  KEEPER_RADIUS, NAV_LOS_R, NAV_MASK_R, OPEN_DECK, circleClear, keeperTo, routeExists, segmentClear,
  type Deck,
} from '../src/sim/wild';
import { createWorld, step, type World } from '../src/sim/world';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HERO_DECK = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/hero-deck.json'), 'utf8')) as Deck;

/** How much of the deck the obstacle circles take up (overlaps counted twice, as drawn). */
const coverage = (deck: Deck) => {
  let area = 0;
  for (let i = 2; i < deck.obstacles.length; i += 3) area += Math.PI * deck.obstacles[i]! ** 2;
  return area / (Math.PI * deck.radius ** 2);
};

/**
 * Which of `spots` a keeper-sized disc can slide to from (sx, sz), by a flood fill over a
 * 0.05-unit grid — half the navigation's cell — with the same clearance the navigation's grid
 * demands. Independent of src/sim/wild.ts's own field: a target this says is reachable and the
 * keeper does not reach is a defect in the navigation, not in the deck.
 */
function reachable(deck: Deck, sx: number, sz: number, spots: readonly [number, number][]): boolean[] {
  const cell = 0.05;
  const n = Math.ceil((2 * deck.radius) / cell);
  const idx = (x: number, z: number) => {
    const ix = Math.floor((x + deck.radius) / cell), iz = Math.floor((z + deck.radius) / cell);
    return ix < 0 || iz < 0 || ix >= n || iz >= n ? -1 : iz * n + ix;
  };
  const at = (i: number) => [-deck.radius + ((i % n) + 0.5) * cell, -deck.radius + (Math.floor(i / n) + 0.5) * cell] as const;
  const free = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const [x, z] = at(i);
    free[i] = circleClear(deck, x, z, NAV_MASK_R) ? 1 : 0;
  }
  const seen = new Uint8Array(n * n);
  const queue: number[] = [];
  const start = idx(sx, sz);
  if (start >= 0 && free[start]) { seen[start] = 1; queue.push(start); }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!, ix = i % n, iz = (i - ix) / n;
    for (const j of [ix + 1 < n ? i + 1 : -1, ix > 0 ? i - 1 : -1, iz + 1 < n ? i + n : -1, iz > 0 ? i - n : -1]) {
      if (j >= 0 && free[j] && !seen[j]) { seen[j] = 1; queue.push(j); }
    }
  }
  // A target counts as reached if any cell within a cell's width of it was flooded.
  return spots.map(([x, z]) => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = idx(x + dx * cell, z + dz * cell);
        if (i >= 0 && seen[i]) return true;
      }
    }
    return false;
  });
}

/** `n` seeded targets a keeper can stand on: on the deck, clear of every obstacle. */
function targets(deck: Deck, seed: number, n: number): [number, number][] {
  const r = new Rng(seed);
  const out: [number, number][] = [];
  for (let guard = 0; guard < 200_000 && out.length < n; guard++) {
    const a = r.range(0, 2 * Math.PI), d = Math.sqrt(r.next()) * (deck.radius - 0.25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (circleClear(deck, x, z, KEEPER_RADIUS + 0.02)) out.push([x, z]);
  }
  expect(out).toHaveLength(n);
  return out;
}

/** Tap (x, z) and step until the keeper stops, or `ticks` have passed. Returns what happened. */
function walk(w: World, deck: Deck, x: number, z: number, ticks = 900): { arrived: number; ticks: number } {
  keeperTo(w, deck, x, z, false);
  for (let i = 0; i < ticks; i++) {
    step(w, deck);
    const k = w.keeper;
    if (k.v === 0 && Math.hypot(k.goal[0] - k.pos[0], k.goal[1] - k.pos[1]) < 1e-3) {
      return { arrived: Math.hypot(k.pos[0] - x, k.pos[1] - z), ticks: i + 1 };
    }
  }
  return { arrived: Math.hypot(w.keeper.pos[0] - x, w.keeper.pos[1] - z), ticks };
}

/**
 * Park the dragon as far from (x, z) as the deck allows and leave it grazing, so a test that
 * watches the keeper stand still is not reading the dragon shouldering it aside — which is a
 * body yielding to another body, not jitter. A grazing dragon turns to watch a still keeper
 * but never walks, and this keeps it well outside its own flight distance besides.
 */
function parkDragonAwayFrom(w: World, deck: Deck, x: number, z: number): void {
  let best: [number, number] = [w.wild.pos[0], w.wild.pos[1]], bestD = -1;
  for (let i = 0; i < 64; i++) {
    const a = (2 * Math.PI * i) / 64;
    for (const d of [deck.radius - 0.9, deck.radius - 1.8, deck.radius - 2.7]) {
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      if (!circleClear(deck, px, pz, 0.7)) continue;
      const dist = Math.hypot(px - x, pz - z);
      if (dist > bestD) { bestD = dist; best = [px, pz]; }
    }
  }
  w.wild.pos[0] = best[0]; w.wild.pos[1] = best[1];
  w.wild.goal[0] = best[0]; w.wild.goal[1] = best[1];
  w.wild.from[0] = best[0]; w.wild.from[1] = best[1];
  w.wild.state = 'graze';
  w.wild.t = 0;
  w.wild.dur = 1_000_000;
}

/** Within this of the tapped spot counts as arrived (criterion 7). */
const ARRIVED = 0.45;
/** Enough targets that 95 % is two misses, not one lucky run (criterion 7 asks for ≥ 40). */
const N_TARGETS = 48;

describe('the keeper goes where it is told (criterion 7)', () => {
  it.each([
    ['the hero island', HERO_DECK],
    ['an open deck', OPEN_DECK],
  ])('arrives at ≥ 95 %% of 48 seeded targets on %s', (what, deck) => {
    const w = createWorld(0x0d4ac0de, deck);
    const spots = targets(deck, 77, N_TARGETS);
    const can = reachable(deck, w.keeper.pos[0], w.keeper.pos[1], spots);
    let arrived = 0, counted = 0, worst = 0, slowest = 0, unreachable = 0;
    const missed: string[] = [];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i]!;
      const r = walk(w, deck, x, z);
      // A spot in a sealed pocket is not a target the keeper can be asked to reach; it is
      // counted and reported, never scored. The flood fill above decides, not the sim.
      if (!can[i]) { unreachable++; continue; }
      counted++;
      if (r.arrived <= ARRIVED) {
        arrived++;
        worst = Math.max(worst, r.arrived);
        slowest = Math.max(slowest, r.ticks);
      } else {
        missed.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) stopped ${r.arrived.toFixed(2)} short after ${r.ticks} ticks`);
      }
      // Wherever it stopped, it is a legal place to stand.
      expect(circleClear(deck, w.keeper.pos[0], w.keeper.pos[1], KEEPER_RADIUS - 0.02)).toBe(true);
    }
    const rate = arrived / counted;
    console.log(`keeper arrival on ${what} (${deck.obstacles.length / 3} obstacles over ` +
      `${(coverage(deck) * 100).toFixed(0)} % of the deck): ${arrived}/${counted} = ${(rate * 100).toFixed(1)} %, ` +
      `${unreachable} of ${N_TARGETS} targets in sealed pockets (not scored), worst miss ${worst.toFixed(3)}, ` +
      `slowest ${slowest} ticks${missed.length ? `; missed: ${missed.join('; ')}` : ''}`);
    expect(counted).toBeGreaterThanOrEqual(40);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });

  it('stops clear and stands still at a target inside an obstacle or off the deck', () => {
    const deck = HERO_DECK;
    const w = createWorld(31, deck);
    const bad: [number, number][] = [];
    // The middle of the eight widest obstacles: the deepest a tap can land inside one.
    const by: { i: number; r: number }[] = [];
    for (let i = 0; i < deck.obstacles.length; i += 3) by.push({ i, r: deck.obstacles[i + 2]! });
    by.sort((a, b) => b.r - a.r || a.i - b.i);
    for (const { i } of by.slice(0, 8)) bad.push([deck.obstacles[i]!, deck.obstacles[i + 1]!]);
    // And well off the deck, in eight directions.
    for (let i = 0; i < 8; i++) {
      const a = (2 * Math.PI * i) / 8;
      bad.push([Math.cos(a) * deck.radius * 1.6, Math.sin(a) * deck.radius * 1.6]);
    }
    let reached = 0;
    for (const [x, z] of bad) {
      parkDragonAwayFrom(w, deck, x, z);
      walk(w, deck, x, z);
      const k = w.keeper;
      if (Math.hypot(k.pos[0] - x, k.pos[1] - z) <= ARRIVED) reached++;
      expect(circleClear(deck, k.pos[0], k.pos[1], KEEPER_RADIUS - 0.02)).toBe(true);
      expect(Math.hypot(k.pos[0], k.pos[1])).toBeLessThanOrEqual(deck.radius - KEEPER_RADIUS + 1e-9);
      // And it stands still: 60 more ticks move it not at all, and it reports no speed.
      const at: [number, number] = [k.pos[0], k.pos[1]];
      let moved = 0;
      for (let i = 0; i < 60; i++) {
        step(w, deck);
        moved = Math.max(moved, Math.hypot(k.pos[0] - at[0], k.pos[1] - at[1]));
      }
      expect(moved).toBe(0);
      expect(k.v).toBe(0);
    }
    console.log(`keeper at 16 unreachable targets (8 inside an obstacle, 8 off the deck): reached ${reached}, stood still at all 16`);
    expect(reached).toBe(0);
  });

  it('walks a route no straight line could: it crosses the island from the gate', () => {
    const deck = HERO_DECK;
    const w = createWorld(7, deck);
    // The target farthest from the gate that is reachable at all: a crossing, not a step.
    const spots = targets(deck, 1234, N_TARGETS);
    const can = reachable(deck, w.keeper.pos[0], w.keeper.pos[1], spots);
    const far = spots
      .filter((_, i) => can[i])
      .map((t) => ({ t, d: Math.hypot(t[0] - w.keeper.pos[0], t[1] - w.keeper.pos[1]) }))
      .sort((a, b) => b.d - a.d)[0]!.t;
    expect(segmentClear(deck, w.keeper.pos[0], w.keeper.pos[1], far[0], far[1], NAV_LOS_R)).toBe(false);
    expect(routeExists(deck, w.keeper.pos[0], w.keeper.pos[1], far[0], far[1])).toBe(true);
    const straight = Math.hypot(far[0] - w.keeper.pos[0], far[1] - w.keeper.pos[1]);
    const r = walk(w, deck, far[0], far[1]);
    console.log(`keeper crossed the island, ${straight.toFixed(2)} units of it as the crow flies ` +
      `(straight walk blocked), in ${r.ticks} ticks, stopping ${r.arrived.toFixed(3)} from the spot`);
    expect(r.arrived).toBeLessThanOrEqual(ARRIVED);
  });

  it('the route is derived, not saved: a save mid-walk resumes into the same world', () => {
    const deck = HERO_DECK;
    const w0 = createWorld(7, deck);
    const spots = targets(deck, 1234, N_TARGETS);
    const can = reachable(deck, w0.keeper.pos[0], w0.keeper.pos[1], spots);
    const far = spots
      .filter((_, i) => can[i])
      .map((t) => ({ t, d: Math.hypot(t[0] - w0.keeper.pos[0], t[1] - w0.keeper.pos[1]) }))
      .sort((a, b) => b.d - a.d)[0]!.t;
    const END = 400;
    keeperTo(w0, deck, far[0], far[1], false);
    while (w0.tick < END) step(w0, deck);

    for (const at of [20, 60, 140, 260]) {
      const w = createWorld(7, deck);
      keeperTo(w, deck, far[0], far[1], false);
      while (w.tick < at) step(w, deck);
      const text = encodeSave(w);
      expect(text).not.toContain('route');
      expect(text).not.toContain('path');
      const back = decodeSave(text);
      if (!back.ok) throw new Error(back.detail);
      expect(back.world).toEqual(w);
      // Another deck and another goal in between, so the resumed world cannot inherit a field.
      const other = createWorld(9, OPEN_DECK);
      keeperTo(other, OPEN_DECK, 2, 2, false);
      for (let i = 0; i < 30; i++) step(other, OPEN_DECK);
      while (back.world.tick < END) step(back.world, deck);
      expect(JSON.stringify(back.world)).toBe(JSON.stringify(w0));
    }
  });

  it('the grid is no coarser than the clearance it checks legs at', () => {
    // A leg between two free cells must pass `segmentClear` at NAV_LOS_R, which needs the
    // cells' own clearance (NAV_MASK_R) to be the larger of the two. And neither may promise
    // more than `pushOut` does, which is KEEPER_RADIUS.
    expect(NAV_LOS_R).toBeLessThanOrEqual(NAV_MASK_R);
    expect(NAV_LOS_R).toBeGreaterThanOrEqual(KEEPER_RADIUS);
  });

  it('the frozen hero deck is the island it claims to be', () => {
    // Not a tuning knob: if src/main.ts re-dresses the island, this fixture is stale.
    expect(HERO_DECK.radius).toBe(5.6);
    expect(HERO_DECK.obstacles.length % 3).toBe(0);
    expect(HERO_DECK.obstacles.length / 3).toBeGreaterThan(60);
    for (const v of HERO_DECK.obstacles) expect(Number.isFinite(v)).toBe(true);
    for (let i = 2; i < HERO_DECK.obstacles.length; i += 3) {
      expect(HERO_DECK.obstacles[i]!).toBeGreaterThan(0.05);
      expect(HERO_DECK.obstacles[i]!).toBeLessThan(1.0);
    }
    // The glade is open ground: the dragon's home spot and a step around it are clear.
    expect(circleClear(HERO_DECK, HERO_DECK.home[0], HERO_DECK.home[1], 0.9)).toBe(true);
  });
});
