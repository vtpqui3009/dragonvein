#!/usr/bin/env node
/**
 * A bred dragon must mesh in under 120 ms, or the hook stutters at its best moment
 * (CLAUDE.md §2.3, docs/PERF_BUDGET.md §Other budgets).
 *
 * From the moment `src/assets/dragon/builder.ts` exists, this gate builds every genome in
 * docs/fixtures/genomes.json with it and fails if any build takes longer than 120 ms. It
 * used to fail outright as "NOT IMPLEMENTED" as soon as the file appeared, which would have
 * turned the gates red at M3a — the step that creates the builder — two steps before
 * ROADMAP asks for the budget at M3c (STATE.md run 11). Measuring is stricter than skipping.
 *
 * What it measures today: the build on this Node process's main thread, after one
 * warm-up build so the number is the steady state a player meets on their second hatch,
 * with the first (cold) build reported beside it. M3c moves the build into a worker and
 * measures it in the browser on the Medium tier, which is what P3 scores; until then
 * this is the upper bound the builder must stay under, not the final word.
 *
 * Writes artifacts/meshgen.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const BUILDER = 'src/assets/dragon/builder.ts';
const BUDGET_MS = 120;

if (!existsSync(BUILDER)) {
  console.log('gate:meshgen SKIP — the runtime dragon builder does not exist yet (milestone M3).');
  process.exit(0);
}

const entry = `
import { breed, wild } from './src/core/genome';
import { buildDragon } from './${BUILDER.replace(/\.ts$/, '')}';
export function genomes(recipes) {
  const out = [];
  for (const r of recipes) out.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(out[r.a], out[r.b], r.seed));
  return out;
}
export { buildDragon };
`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts', sourcefile: 'meshgen-entry.ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const tmp = path.join(os.tmpdir(), `dragonvein-meshgen-${process.pid}.mjs`);
writeFileSync(tmp, bundled.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);

const recipes = JSON.parse(readFileSync('docs/fixtures/genomes.json', 'utf8')).genomes.map((g) => g.recipe);
const genomes = mod.genomes(recipes);

const time = (gm) => {
  const t = performance.now();
  const body = mod.buildDragon(gm);
  const ms = performance.now() - t;
  return { ms, tris: body.geometry.getIndex().count / 3, verts: body.geometry.getAttribute('position').count };
};
const cold = time(genomes[0]);
const runs = genomes.map((gm, i) => ({ i, gid: gm.gid(), ...time(gm) }));
const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
const worst = runs.reduce((a, b) => (b.ms > a.ms ? b : a));
const median = sorted[Math.floor(sorted.length / 2)];
const r1 = (x) => Math.round(x * 100) / 100;

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/meshgen.json', `${JSON.stringify({
  budgetMs: BUDGET_MS,
  where: 'node main thread (M3c moves this to a worker on the Medium tier)',
  stages: 'whole dragon: body, wings, membranes, crown, spikes, tail ornament, eyes (M3b)',
  genomes: runs.length,
  coldMs: r1(cold.ms),
  medianMs: r1(median),
  maxMs: r1(worst.ms),
  worst: { index: worst.i, gid: worst.gid },
  maxTris: Math.max(...runs.map((r) => r.tris)),
  maxVerts: Math.max(...runs.map((r) => r.verts)),
}, null, 2)}\n`);

const line = `${runs.length} fixed genomes, median ${r1(median)} ms, max ${r1(worst.ms)} ms (#${worst.i} ${worst.gid}), ` +
  `cold ${r1(cold.ms)} ms, budget ${BUDGET_MS} ms — node main thread; the worker measurement is M3c's`;
if (worst.ms > BUDGET_MS || cold.ms > BUDGET_MS) {
  console.error(`gate:meshgen FAIL — ${line}`);
  process.exit(1);
}
console.log(`gate:meshgen OK — ${line}`);
