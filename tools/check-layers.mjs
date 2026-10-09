#!/usr/bin/env node
/** Enforces docs/ARCHITECTURE.md §Ownership import rules. Fails loudly, never silently. */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const RULES = {
  'src/core':    { forbid: [/^three/, /\.\.\/(sim|render|ui|audio|content|assets)\//] },
  'src/sim':     { forbid: [/^three/, /\.\.\/(render|ui|audio|assets)\//] },
  'src/ui':      { forbid: [/^three/, /\.\.\/(render|assets)\//] },
  'src/audio':   { forbid: [/^three/, /\.\.\/(render|ui|assets)\//] },
  'src/content': { forbid: [/^three/, /\.\.\/(render|ui|audio|assets|sim)\//] },
};
const IMPORT = /(?:^|\n)\s*import[^'"]*['"]([^'"]+)['"]/g;

let failures = 0;
for (const [dir, rule] of Object.entries(RULES)) {
  if (!existsSync(dir)) continue;
  for (const file of await walk(dir)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1];
      if (rule.forbid.some((re) => re.test(spec))) {
        console.error(`LAYER VIOLATION  ${file}  imports  ${spec}`);
        failures++;
      }
    }
  }
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
if (failures) { console.error(`\n${failures} layer violation(s). See docs/ARCHITECTURE.md.`); process.exit(1); }
console.log('check:layers OK');
