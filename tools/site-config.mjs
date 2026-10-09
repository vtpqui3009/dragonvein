/**
 * The one definition of where this site lives.
 *
 * `vite.config.ts` imports `BASE_PATH` for its `base`, and `tools/preview-server.mjs`
 * imports it to build the URL the gates poll. They agree by construction: there is no
 * second copy of the string to drift out of sync. (A hand-copied base path is what made
 * the preview URL wrong once already.)
 */

import { readFileSync } from 'node:fs';

/** Serving sub-path, leading and trailing slash included. GitHub Pages serves the repo
 *  at `/<repo>/`; override with PAGES_BASE for a custom domain or a local root build. */
export const BASE_PATH = normalizeBase(process.env.PAGES_BASE ?? '/dragonvein/');

/**
 * What the on-screen overlay prints, so a screenshot or a live Pages tab says which build
 * it is. Lives here because `vite.config.ts` is type-checked without Node's globals.
 * @returns {string}
 */
function readBuildVersion() {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
  const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  return sha ? `v${version}+${sha}` : `v${version}`;
}

export const BUILD_VERSION = readBuildVersion();

/**
 * @param {string} base
 * @returns {string}
 */
export function normalizeBase(base) {
  if (!base.startsWith('/') || !base.endsWith('/')) {
    throw new Error(
      `PAGES_BASE must start and end with "/" (got ${JSON.stringify(base)}); ` +
        'Vite resolves asset URLs against it and a missing slash 404s every chunk.',
    );
  }
  return base;
}
