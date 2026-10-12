#!/usr/bin/env node
/**
 * A bred dragon must mesh in under 120 ms, off the main thread, or the hook stutters at its
 * best moment (CLAUDE.md §2.3, docs/PERF_BUDGET.md §Other budgets, ROADMAP M3c).
 *
 * The measurement is made where a hatch will happen. This gate loads the built game page at
 * its default settings, which is Medium minus post until M6e's tier system: `perf.json`
 * `tier.note` says exactly what that is. It then calls `__dragonveinMeshgen` with the 32
 * fixed genomes of docs/fixtures/genomes.json. Each dragon is built through the mesh worker
 * (src/assets/dragon/worker.ts) while the game keeps rendering, one at a time, and each
 * reports three times:
 * - `workerMs`: the build inside the worker;
 * - `roundTripMs`: from posting the genome to a ready geometry on the main thread;
 * - `assembleMs`: the main thread's share, wrapping transferred arrays.
 *
 * Before the first build the page calls `DragonMesher.ready()`, which spawns the worker and
 * warms it with one throwaway dragon, as the game will do while idle and before any hatch.
 * Measured in run 13, a worker's very first build cost a 144.8 ms round trip (module fetch
 * and parse, cold JIT) against about 9 ms after it. That cost is reported as `startupMs`
 * and `warmMs`, not hidden: it is a one-off off the hatch path, not a hatch.
 *
 * It fails if any worker build or round trip exceeds 120 ms. That includes the first one
 * after the warm-up.
 * Writes artifacts/meshgen.json.
 *
 * History: until M3c this timed the builder on Node's main thread, and before M3a it failed
 * as "NOT IMPLEMENTED" the moment builder.ts existed (STATE.md runs 11 and 13).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';

const BUILDER = 'src/assets/dragon/builder.ts';
const BUDGET_MS = 120;

if (!existsSync(BUILDER)) {
  console.log('gate:meshgen SKIP — the runtime dragon builder does not exist yet (milestone M3).');
  process.exit(0);
}
if (!existsSync('dist/index.html')) {
  console.error('gate:meshgen FAIL — no build to measure. Run `npm run build` first.');
  process.exit(1);
}

const recipes = JSON.parse(readFileSync('docs/fixtures/genomes.json', 'utf8')).genomes.map((g) => g.recipe);
const errors = [];
let runs = [];
let tier = null;
let browser = null;
let server = null;
try {
  browser = await pw.chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const preview = await startPreview(4179);
  server = preview.proc;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => globalThis.__dragonveinStats?.()?.drawCalls != null, null, { timeout: 30_000 });
  runs = await page.evaluate((r) => globalThis.__dragonveinMeshgen(r), recipes);
  tier = await page.evaluate(() => globalThis.__dragonveinPerf?.snapshot?.()?.tier ?? null).catch(() => null);
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server?.kill();
}

const r2 = (x) => Math.round(x * 100) / 100;
const stat = (key) => {
  const xs = runs.map((r) => r[key]);
  const sorted = [...xs].sort((a, b) => a - b);
  return { first: r2(xs[0] ?? NaN), median: r2(sorted[Math.floor(sorted.length / 2)] ?? NaN), max: r2(Math.max(...xs)) };
};
const worker = stat('workerMs'), trip = stat('roundTripMs'), assemble = stat('assembleMs');
const worstTrip = runs.reduce((a, b, i) => (b.roundTripMs > (runs[a]?.roundTripMs ?? -1) ? i : a), 0);

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/meshgen.json', `${JSON.stringify({
  budgetMs: BUDGET_MS,
  where: 'headless Chromium (SwiftShader), the built game page at its default settings, '
    + 'through the mesh worker while the game renders',
  tierNote: tier?.note ?? 'default settings: Medium minus post (see artifacts/perf.json tier)',
  stages: 'whole dragon: body, wings, membranes, crown, spikes, tail ornament, eyes',
  genomes: runs.length,
  workerMs: worker,
  roundTripMs: trip,
  assembleMs: assemble,
  startupMs: r2(runs[0]?.startupMs ?? NaN),
  warmMs: r2(runs[0]?.warmMs ?? NaN),
  firstAfterWarmMs: trip.first,
  maxMs: Math.max(worker.max, trip.max),
  worst: runs[worstTrip] ? { index: worstTrip, gid: runs[worstTrip].gid } : null,
  maxTris: runs.length ? Math.max(...runs.map((r) => r.triangles)) : 0,
  perDragon: runs.map((r) => ({ gid: r.gid, workerMs: r2(r.workerMs), roundTripMs: r2(r.roundTripMs), assembleMs: r2(r.assembleMs) })),
  errors,
}, null, 2)}\n`);

const line = `${runs.length} fixed genomes through the worker on the game page: worker median ${worker.median} ms, `
  + `max ${worker.max}; round trip first ${trip.first}, median ${trip.median}, max ${trip.max}; `
  + `one-off spawn + warm-up ${r2(runs[0]?.startupMs ?? NaN)} ms before any hatch; `
  + `main-thread assembly max ${assemble.max} ms; budget ${BUDGET_MS} ms`;
if (errors.length || runs.length !== recipes.length) {
  console.error(`gate:meshgen FAIL — ${runs.length} of ${recipes.length} built\n${errors.join('\n')}`);
  process.exit(1);
}
if (worker.max > BUDGET_MS || trip.max > BUDGET_MS) {
  console.error(`gate:meshgen FAIL — ${line}`);
  process.exit(1);
}
console.log(`gate:meshgen OK — ${line}`);
