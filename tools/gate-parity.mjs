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
 *   2. Mesh (due at M3d). Both dragon builders build those genomes and must agree on
 *      bounding box, vertex count and limb-anchor positions (CLAUDE.md §1.5). The
 *      TypeScript builder appears at M3a and grows through M3b–M3c, while ROADMAP puts the
 *      comparison at M3d, "gate:parity green between the two builders". So this half is a
 *      named SKIP until docs/ROADMAP.md marks M3c `DONE`. From then on it fails until the
 *      comparison is written. Failing as soon as builder.ts existed would have turned
 *      every gate red from M3a, two steps before the comparison was due.
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

// --- 1. genome --------------------------------------------------------------------------
if (!existsSync(GENOME_TS)) {
  console.log(`gate:parity genome SKIP — ${GENOME_TS} does not exist yet (M2b).`);
} else if (!existsSync(FIXTURE) || !existsSync(GENOME_TEST)) {
  console.error(`gate:parity genome FAIL — ${GENOME_TS} exists but ${FIXTURE} or ${GENOME_TEST} ` +
    'does not, so nothing proves it matches assetgen/genome.py.');
  failed = true;
} else {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('vitest/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = path.join(path.dirname(manifestPath),
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin['vitest']);
  const run = spawnSync(process.execPath, [bin, 'run', GENOME_TEST, '--reporter=dot'], {
    encoding: 'utf8',
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
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
/** True once docs/ROADMAP.md marks `step` DONE — the roadmap is the record of where we are. */
function stepDone(step) {
  if (!existsSync('docs/ROADMAP.md')) return false;
  const row = readFileSync('docs/ROADMAP.md', 'utf8').split('\n')
    .find((l) => l.replace(/\*/g, '').startsWith(`| ${step} |`));
  return Boolean(row && /\|\s*\**DONE\**\s*\|\s*$/.test(row));
}
if (!existsSync(BUILDER_TS)) {
  console.log(`gate:parity mesh SKIP — ${BUILDER_TS} does not exist yet (M3a).`);
} else if (!stepDone('M3c')) {
  console.log(`gate:parity mesh SKIP — ${BUILDER_TS} exists, and the builder comparison is ` +
    'due at M3d (docs/ROADMAP.md); it becomes required once M3c is DONE.');
} else {
  console.error('gate:parity mesh NOT IMPLEMENTED — M3d must build the genomes in ' +
    `${FIXTURE} with both dragon builders and compare bounding box, vertex count and ` +
    'limb-anchor positions within tolerance (CLAUDE.md §1.5).');
  failed = true;
}

process.exit(failed ? 1 : 0);
