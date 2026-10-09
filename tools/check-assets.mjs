#!/usr/bin/env node
/** Every shipped asset is reproducible from a script and licence-clear. */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ASSETS = 'public/assets';
if (!existsSync(ASSETS)) { console.log('check:assets OK (no assets yet)'); process.exit(0); }

const manifestPath = path.join(ASSETS, 'MANIFEST.json');
if (!existsSync(manifestPath)) {
  console.error(`MISSING  ${manifestPath} — every shipped asset must name the script that produced it.`);
  process.exit(1);
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const declared = new Set(Object.keys(manifest.assets ?? {}));

let failures = 0;
for (const file of await walk(ASSETS)) {
  if (file.endsWith('MANIFEST.json')) continue;
  const rel = path.relative(ASSETS, file).split(path.sep).join('/');
  const id = rel.replace(/\.lod\d\.glb$/, '').replace(/\.[^.]+$/, '');
  if (!declared.has(id)) {
    console.error(`UNDECLARED ASSET  ${rel}  — add it to MANIFEST.json with its generator script.`);
    failures++;
  }
}
for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
  if (!entry.script) { console.error(`NO SCRIPT  ${id} — the generator is the source of truth.`); failures++; }
  else if (!existsSync(entry.script)) { console.error(`SCRIPT MISSING  ${id} -> ${entry.script}`); failures++; }
  if (entry.thirdParty && !existsSync('docs/ASSET_LICENSES.md')) {
    console.error(`THIRD-PARTY ASSET ${id} with no docs/ASSET_LICENSES.md`); failures++;
  }
}
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}
if (failures) { console.error(`\n${failures} asset violation(s). See CLAUDE.md §1.`); process.exit(1); }
console.log('check:assets OK');
