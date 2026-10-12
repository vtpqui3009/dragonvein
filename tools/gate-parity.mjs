#!/usr/bin/env node
/**
 * The Python and TypeScript halves must agree. docs/GENOME.md is the arbiter.
 *
 * Two levels, gated separately because they arrive in different milestones:
 *
 *   1. Genome (live from M2b). `src/core/genome.ts` must rebuild the 32 fixed genomes in
 *      docs/fixtures/genomes.json — written from assetgen/genome.py by
 *      assetgen/genome_vectors.py — with every allele, phenotype value, rarity and id
 *      exactly equal. The assertions live in tests/genome.test.ts; this gate runs that
 *      file alone so `gate:parity` fails on its own when the genome drifts.
 *   2. Mesh (live from M3d). Both dragon builders build those genomes and must agree, by
 *      CLAUDE.md §1.5 as the owner amended it on 2026-10-12 (STATE.md decision entry):
 *      - the skin graphs are equal, exactly (tests/dragon-graph.test.ts);
 *      - the limb anchors are equal, exactly (tests/dragon-parity.test.ts);
 *      - the bounding boxes are within 3 % of the reference's extent (the same file).
 *      Vertex counts are not compared: Blender's Skin + Subsurf and the TS sweep tessellate
 *      the same graph differently by design. The reference's numbers come from
 *      docs/fixtures/dragon-graphs.json, written by assetgen/dragon_vectors.py.
 *      There was a SKIP until M3d wrote this. It was keyed first to the builder existing,
 *      then to M3c, then to M3d (runs 10 and 13), and it is gone now.
 *
 * Before M2b the whole gate SKIPped until *both* files existed, which meant the genome
 * half — the half that could be checked — could not go green before M3 (STATE.md run 10).
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const GENOME_TS = 'src/core/genome.ts';
const FIXTURE = 'docs/fixtures/genomes.json';
const GENOME_TEST = 'tests/genome.test.ts';
const BUILDER_TS = 'src/assets/dragon/builder.ts';

let failed = false;

/** Run these test files alone with the project's own vitest. */
function runVitest(files) {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('vitest/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = path.join(path.dirname(manifestPath),
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin['vitest']);
  const run = spawnSync(process.execPath, [bin, 'run', ...files, '--reporter=dot'], { encoding: 'utf8' });
  return { status: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

// --- 1. genome --------------------------------------------------------------------------
if (!existsSync(GENOME_TS)) {
  console.log(`gate:parity genome SKIP — ${GENOME_TS} does not exist yet (M2b).`);
} else if (!existsSync(FIXTURE) || !existsSync(GENOME_TEST)) {
  console.error(`gate:parity genome FAIL — ${GENOME_TS} exists but ${FIXTURE} or ${GENOME_TEST} ` +
    'does not, so nothing proves it matches assetgen/genome.py.');
  failed = true;
} else {
  const run = runVitest([GENOME_TEST]);
  const out = run.out;
  const count = JSON.parse(readFileSync(FIXTURE, 'utf8')).genomes?.length ?? 0;
  if (run.status === 0) {
    console.log(`gate:parity genome OK — ${count} fixed genomes (${FIXTURE}) rebuilt by ` +
      `${GENOME_TS} match assetgen/genome.py exactly: alleles, phenotype, rarity, gid.`);
  } else {
    console.error(out);
    console.error(`gate:parity genome FAIL — ${GENOME_TS} disagrees with assetgen/genome.py ` +
      `on the fixed genomes. See ${GENOME_TEST}.`);
    failed = true;
  }
}

// --- 2. mesh ----------------------------------------------------------------------------
const MESH_TESTS = ['tests/dragon-graph.test.ts', 'tests/dragon-parity.test.ts'];
const GRAPHS = 'docs/fixtures/dragon-graphs.json';
if (!existsSync(BUILDER_TS)) {
  console.log(`gate:parity mesh SKIP — ${BUILDER_TS} does not exist yet (M3a).`);
} else if (!existsSync(GRAPHS) || MESH_TESTS.some((t) => !existsSync(t))) {
  console.error(`gate:parity mesh FAIL — ${BUILDER_TS} exists, but ${GRAPHS} or one of ` +
    `${MESH_TESTS.join(', ')} does not, so nothing proves the two builders agree.`);
  failed = true;
} else {
  const run = runVitest(MESH_TESTS);
  if (run.status === 0) {
    let margin = '';
    try {
      const pj = JSON.parse(readFileSync('artifacts/parity.json', 'utf8'));
      margin = ` Worst box gap ${(pj.worstGapFraction * 100).toFixed(2)} % of extent ` +
        `(${pj.worstGenome}), against ${(pj.boxTolerance * 100).toFixed(0)} %.`;
    } catch { /* the numbers are a courtesy; the tests are the gate */ }
    console.log(`gate:parity mesh OK — the TS and Blender dragon builders agree on the fixed genomes: ` +
      `skin graphs and limb anchors exactly, bounding boxes within tolerance.${margin}`);
  } else {
    console.error(run.out);
    console.error(`gate:parity mesh FAIL — the two dragon builders disagree. See ${MESH_TESTS.join(', ')}.`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
