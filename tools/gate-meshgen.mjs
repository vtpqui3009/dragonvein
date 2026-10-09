#!/usr/bin/env node
/** A bred dragon must mesh in under 120 ms, or the hook stutters at its best moment. */
import { existsSync } from 'node:fs';
if (!existsSync('src/assets/dragon/builder.ts')) {
  console.log('gate:meshgen SKIP — the runtime dragon builder does not exist yet (milestone M3).');
  process.exit(0);
}
console.error('gate:meshgen NOT IMPLEMENTED — M3 must implement it before it can pass.');
process.exit(1);
