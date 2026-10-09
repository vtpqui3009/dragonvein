#!/usr/bin/env node
/** The Python and TypeScript dragon builders must agree. docs/GENOME.md is the arbiter. */
import { existsSync } from 'node:fs';
if (!existsSync('src/core/genome.ts') || !existsSync('src/assets/dragon/builder.ts')) {
  console.log('gate:parity SKIP — the TypeScript genome/builder does not exist yet (milestone M2/M3).');
  process.exit(0);
}
console.error('gate:parity NOT IMPLEMENTED — M2 must implement it before it can pass.');
console.error('Build the 32 fixed genomes in docs/fixtures/genomes.json with both builders and');
console.error('compare bounding box, vertex count and limb-anchor positions within tolerance.');
process.exit(1);
