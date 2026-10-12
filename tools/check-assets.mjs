#!/usr/bin/env node
/**
 * Every shipped asset is reproducible from a script and licence-clear (CLAUDE.md §1).
 *
 * This is the cheap, always-on half of §1.2. It needs no Blender:
 *   - every binary under public/assets/ is pinned in MANIFEST.json by path and SHA-256,
 *     so a hand-edited or stale-rebuilt file cannot ship;
 *   - a .glb's triangle count is read from the bytes, not from the manifest's own claim;
 *   - an asset's LOD chain strictly decreases and every level is inside its budget.
 * The other half — that `npm run assets:build` reproduces those bytes — needs bpy and
 * is `python3 -I assetgen/build_all.py --verify`.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readGlb, triangleCount } from './glb.mjs';

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
/** Every file the manifest pins, by path relative to public/assets. */
const pinned = new Map();
for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
  for (const [lod, l] of Object.entries(entry.lods ?? {})) pinned.set(l.file, { id, lod, ...l });
}
for (const file of await walk(ASSETS)) {
  if (file.endsWith('MANIFEST.json')) continue;
  const rel = path.relative(ASSETS, file).split(path.sep).join('/');
  const id = rel.replace(/\.lod\d\.glb$/, '').replace(/\.[^.]+$/, '');
  if (!declared.has(id)) {
    console.error(`UNDECLARED ASSET  ${rel}  — add it to MANIFEST.json with its generator script.`);
    failures++;
    continue;
  }
  const pin = pinned.get(rel);
  if (!pin) {
    console.error(`UNPINNED BINARY  ${rel}  — MANIFEST.json must list it under its asset's lods ` +
      'with a sha256, or nothing proves it is the build output.');
    failures++;
    continue;
  }
  const bytes = await readFile(file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== pin.sha256) {
    console.error(`HASH MISMATCH  ${rel}  disk ${sha.slice(0, 16)} != manifest ${String(pin.sha256).slice(0, 16)} ` +
      '— rebuild with `npm run assets:build`, never edit a binary by hand.');
    failures++;
  }
  if (rel.endsWith('.glb')) {
    try {
      const tris = triangleCount(readGlb(bytes));
      pin.measuredTris = tris;
      if (tris !== pin.tris) {
        console.error(`TRI COUNT  ${rel}  has ${tris} triangles, manifest says ${pin.tris}`);
        failures++;
      }
    } catch (e) {
      console.error(`UNREADABLE GLB  ${rel}  ${e instanceof Error ? e.message : String(e)}`);
      failures++;
    }
  }
}
for (const [rel, pin] of pinned) {
  if (!existsSync(path.join(ASSETS, rel))) {
    console.error(`MISSING BINARY  ${rel}  is pinned for ${pin.id} but not on disk`);
    failures++;
  }
}
// LOD chains: strictly fewer triangles at every step down, and each level inside budget.
for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
  const levels = Object.keys(entry.lods ?? {}).sort();
  const counts = levels.map((lod) => pinned.get(entry.lods[lod].file)?.measuredTris);
  if (levels.length && counts.every((n) => typeof n === 'number')) {
    console.log(`  ${id}  ${levels.map((l, i) => `${l} ${counts[i]}/${entry.triBudget?.[l] ?? '?'}`).join('  ')}`);
    for (let i = 1; i < counts.length; i++) {
      if (!(counts[i] < counts[i - 1])) {
        console.error(`LOD CHAIN  ${id}  ${levels[i]} (${counts[i]}) is not below ${levels[i - 1]} (${counts[i - 1]})`);
        failures++;
      }
    }
    levels.forEach((l, i) => {
      const budget = entry.triBudget?.[l];
      if (typeof budget !== 'number') {
        console.error(`NO BUDGET  ${id}  ${l} has no triBudget in MANIFEST.json`); failures++;
      } else if (counts[i] > budget) {
        console.error(`OVER BUDGET  ${id}  ${l} ${counts[i]} > ${budget} triangles`); failures++;
      }
    });
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
