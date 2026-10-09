#!/usr/bin/env node
/**
 * Moves every `.map` out of `dist/` and into `.sourcemaps/` before the deployed artefact
 * is built from `dist/`.
 *
 * Why this exists: `dist/` was shipping 2 842 273 bytes of source map for a 526 772-byte
 * chunk to GitHub Pages — 2.1x the entire 1.4 MB gzip budget for the whole product, in a
 * file no player ever benefits from. Maps are not counted against the gzip budget, so no
 * gate caught it; it was simply 3.4 MB of deploy where 0.5 MB is the game.
 *
 * It is a move, not a delete. `vite.config.ts` builds maps as `hidden` (written, but with
 * no `//# sourceMappingURL` comment), and this script parks them in `.sourcemaps/`, which
 * is gitignored. A developer who wants to debug the production bundle still has the exact
 * maps for the exact build, one directory away, and can point devtools at them by hand.
 *
 * Idempotent: running it on a `dist/` with no maps left is a no-op that still exits 0.
 */
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const PARK = '.sourcemaps';

if (!existsSync(DIST)) {
  console.error(`strip-sourcemaps: no ${DIST}/ — run \`npm run build\` first.`);
  process.exit(1);
}

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (p.endsWith('.map')) out.push(p);
  }
  return out;
}

const maps = await walk(DIST);
// A stale park directory from an older build would make the next debugging session load
// maps that do not match the bundle, which is worse than having none.
await rm(PARK, { recursive: true, force: true });

let moved = 0;
for (const from of maps) {
  const to = path.join(PARK, path.relative(DIST, from));
  await mkdir(path.dirname(to), { recursive: true });
  moved += statSync(from).size;
  await rename(from, to);
}

console.log(maps.length === 0
  ? `strip-sourcemaps: no .map files in ${DIST}/ — nothing to move`
  : `strip-sourcemaps: moved ${maps.length} map(s), ${moved} bytes, ${DIST}/ -> ${PARK}/`);
