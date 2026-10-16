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
  // docs/ARCHITECTURE.md §Ownership: render may import `core`, `assets` and `three` only.
  'src/render':  { forbid: [/\.\.\/(sim|ui|audio|content)\//] },
};
const IMPORT = /(?:^|\n)\s*import[^'"]*['"]([^'"]+)['"]/g;

/**
 * The two bottom layers are also checked the other way round: by what they MAY import.
 * A forbid-list only catches the layers someone thought to list. `src/sim` passed with
 * `../content/…`, a bare npm package, `node:fs` or `../main` — none of which the table in
 * docs/ARCHITECTURE.md allows ("src/sim may import `core`"; "src/core … nothing"). Here
 * every specifier must resolve inside one of the listed directories, and a bare or
 * absolute specifier (a package, a Node built-in) is a violation on its face.
 *
 * The scan is wider than IMPORT above: `export … from`, side-effect `import '…'` and a
 * dynamic `import('…')` load a module just as surely as a named import does.
 */
const ONLY = {
  'src/core': ['src/core'],
  'src/sim':  ['src/core', 'src/sim'],
};
const ANY_IMPORT =
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;

let failures = 0;
/** `file\0spec` already reported, so one bad import is one violation, not two. */
const reported = new Set();
for (const [dir, rule] of Object.entries(RULES)) {
  if (!existsSync(dir)) continue;
  for (const file of await walk(dir)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1];
      if (rule.forbid.some((re) => re.test(spec))) {
        reported.add(`${file}\0${spec}`);
        console.error(`LAYER VIOLATION  ${file}  imports  ${spec}`);
        failures++;
      }
    }
  }
}
for (const [dir, allowed] of Object.entries(ONLY)) {
  if (!existsSync(dir)) continue;
  const roots = allowed.map((a) => path.resolve(a) + path.sep);
  for (const file of await walk(dir)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(ANY_IMPORT)) {
      const spec = m[1] ?? m[2];
      if (!spec || reported.has(`${file}\0${spec}`)) continue;
      const target = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
      if (target && roots.some((r) => (target + path.sep).startsWith(r))) continue;
      reported.add(`${file}\0${spec}`);
      console.error(`LAYER VIOLATION  ${file}  imports  ${spec}  (${dir} may import only ` +
        `${allowed.map((a) => a.replace(/^src\//, '')).join(', ')})`);
      failures++;
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
