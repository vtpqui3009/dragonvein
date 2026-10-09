#!/usr/bin/env node
/** src/sim must be reproducible: no wall-clock, no unseeded randomness, no DOM. */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BANNED = [
  [/\bMath\.random\s*\(/,        'Math.random — use the seeded Rng in src/core/rng.ts'],
  [/\bDate\.now\s*\(/,           'Date.now — the sim advances in ticks'],
  [/\bperformance\.now\s*\(/,    'performance.now — the sim advances in ticks'],
  [/\bnew Date\s*\(/,            'new Date — the sim advances in ticks'],
  [/\bdocument\b/,               'document — the sim is headless'],
  [/\bwindow\b/,                 'window — the sim is headless'],
  [/\bcrypto\.getRandomValues/,  'crypto randomness is not reproducible'],
];
if (!existsSync('src/sim')) { console.log('check:determinism OK (no src/sim yet)'); process.exit(0); }

let failures = 0;
for (const file of await walk('src/sim')) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;
    for (const [re, why] of BANNED) {
      if (re.test(line)) { console.error(`NON-DETERMINISTIC  ${file}:${i + 1}  ${why}`); failures++; }
    }
  });
}
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
if (failures) { console.error(`\n${failures} determinism violation(s). A saved dragon must rebuild identically.`); process.exit(1); }
console.log('check:determinism OK');
