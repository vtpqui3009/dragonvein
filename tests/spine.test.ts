/**
 * The M0 spine contract.
 *
 * These assertions exist because each of them has already broken, or is one copy-paste
 * away from breaking, in a way that only showed up on CI:
 *   - the preview URL and the Vite base drifting apart (CI run 37920381558);
 *   - `vite preview` binding a hostname while the poller used an IP literal;
 *   - index.html pointing at an entry module that no longer exists;
 *   - `__dragonveinStats` losing a field the gates read.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';
import { BASE_PATH, normalizeBase } from '../tools/site-config.mjs';
import { PREVIEW_HOST, previewArgs, previewUrl } from '../tools/preview-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

describe('serving path', () => {
  it('vite build base and the URL the gates poll are the same string', () => {
    // One module defines it; both sides import it. A second hand-written copy is how
    // dist/ ended up built for /dragonvein/ while the gate fetched something else.
    expect(viteConfig.base).toBe(BASE_PATH);
    expect(previewUrl(4173)).toBe(`http://${PREVIEW_HOST}:4173${BASE_PATH}`);
  });

  it('refuses a base path that would 404 every chunk', () => {
    expect(() => normalizeBase('dragonvein/')).toThrow(/start and end/);
    expect(() => normalizeBase('/dragonvein')).toThrow(/start and end/);
    expect(normalizeBase('/')).toBe('/');
  });
});

describe('preview server addressing', () => {
  it('binds the exact address it polls', () => {
    const args = previewArgs(4173);
    const hostFlag = args.indexOf('--host');
    expect(hostFlag).toBeGreaterThan(-1);
    expect(args[hostFlag + 1]).toBe(PREVIEW_HOST);
    expect(new URL(previewUrl(4173)).hostname).toBe(PREVIEW_HOST);
  });

  it('uses an IP literal, never a hostname', () => {
    // `localhost` is the bug: it goes through DNS, and a GitHub runner resolves it to
    // ::1 before 127.0.0.1, so the server listened where the poller never looked.
    expect(PREVIEW_HOST).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
    expect(previewArgs(4173)).not.toContain('localhost');
  });

  it('holds the port it was asked for, so two gates cannot collide silently', () => {
    const args = previewArgs(4174);
    expect(args).toContain('--strictPort');
    expect(args[args.indexOf('--port') + 1]).toBe('4174');
  });
});

describe('html entry', () => {
  const html = read('index.html');

  it('loads a module entry that exists on disk', () => {
    const m = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
    if (!m?.[1]) throw new Error('index.html has no <script type="module" src="..."> tag');
    const src = m[1];
    expect(existsSync(path.join(ROOT, src.replace(/^\//, '')))).toBe(true);
  });

  it('declares every element id that src/main.ts looks up', () => {
    const main = read('src/main.ts');
    const ids = [...main.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)]
      .flatMap((m) => (m[1] ? [m[1]] : []));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });

  it.runIf(existsSync(path.join(ROOT, 'dist/index.html')))(
    'builds asset URLs under the serving base', () => {
      const dist = read('dist/index.html');
      const srcs = [...dist.matchAll(/(?:src|href)="([^"]+)"/g)]
        .flatMap((m) => (m[1] ? [m[1]] : []))
        .filter((u) => u.startsWith('/'));
      expect(srcs.length).toBeGreaterThan(0);
      for (const u of srcs) expect(u.startsWith(BASE_PATH)).toBe(true);
    },
  );
});

describe('stats contract read by the gates', () => {
  const main = read('src/main.ts');

  it('publishes __dragonveinStats with the three fields gate:perf reads', () => {
    expect(main).toMatch(/globalThis\.__dragonveinStats\s*=/);
    for (const field of ['drawCalls', 'triangles', 'frameMs']) {
      expect(main).toContain(field);
    }
  });
});

describe('budgets are not quietly relaxed', () => {
  it('gate:perf still enforces 16.6 ms / 180 draw calls / 900 000 triangles', () => {
    // CLAUDE.md §2.7: never weaken a gate to get green. If this test fails, the budget
    // moved; that needs its own commit and a reason, not a drive-by edit.
    const gate = read('tools/gate-perf.mjs');
    expect(gate).toMatch(/frameMs:\s*16\.6\b/);
    expect(gate).toMatch(/drawCalls:\s*180\b/);
    expect(gate).toMatch(/triangles:\s*900_?000\b/);
  });
});
