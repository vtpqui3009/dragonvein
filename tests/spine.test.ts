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

describe('what the deploy actually ships', () => {
  it('builds source maps hidden, so the deployed bundle references none', () => {
    // `dist/` was shipping 2 842 273 bytes of map for a 526 772-byte chunk — 2.1x the
    // entire 1.4 MB gzip budget — to GitHub Pages. `hidden` still writes them for local
    // debugging; nothing on the site points at them.
    expect(viteConfig.build?.sourcemap).toBe('hidden');
  });

  it('moves the maps out of dist/ before the Pages artefact is made', () => {
    const pkg: { scripts: Record<string, string> } = JSON.parse(read('package.json'));
    expect(pkg.scripts['build:pages']).toContain('strip-sourcemaps');
    // The workflow has to use that script, or the strip step is decorative.
    const workflow = read('.github/workflows/pages.yml');
    expect(workflow).toContain('npm run build:pages');
    expect(workflow).not.toMatch(/^\s*- run: npm run build$/m);
  });
});

describe('stats contract read by the gates', () => {
  const main = read('src/main.ts');

  it('publishes __dragonveinStats with the four fields gate:perf reads', () => {
    expect(main).toMatch(/globalThis\.__dragonveinStats\s*=/);
    for (const field of ['drawCalls', 'triangles', 'frameMs', 'cpuFrameMs']) {
      expect(main).toContain(field);
    }
  });

  it('survives a WebGL context loss instead of dying silently', () => {
    // A driver reset is a normal event on the weak iGPU CLAUDE.md §0 targets. Before
    // this, nothing listened and nothing asked for the context back, so an induced loss
    // killed the canvas for the session.
    expect(main).toContain("'webglcontextlost'");
    expect(main).toContain("'webglcontextrestored'");
    expect(main).toContain('restoreContext');
    // The handle has to be taken before the loss: a lost context returns null from every
    // getExtension call, so fetching it afterwards gets nothing and recovers nothing.
    expect(main).toMatch(/getExtension\('WEBGL_lose_context'\)/);
    expect(main).toMatch(/context:\s*\{/);
  });

  it('publishes the frame-cost instrument gate:perf measures', () => {
    expect(main).toMatch(/globalThis\.__dragonveinPerf\s*=/);
    // Cost and cadence must be separate keys. Collapsing them back into one is how the
    // gate ended up comparing a vsync-quantised interval against a 16.6 ms budget.
    for (const field of ['cpuFrameMs', 'gpuFrameMs', 'presentIntervalMs', 'bootMs']) {
      expect(main).toContain(field);
    }
    expect(main).toContain('EXT_disjoint_timer_query_webgl2');
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

  it('polices the main-thread half of the frame budget with no hardware escape', () => {
    // `frameCostMs` is only enforced where a real GPU exists, so in a SwiftShader
    // container nothing policed frame cost at all. `cpuFrameMs` is main-thread wall
    // time, which SwiftShader does not inflate, so it is enforced unconditionally.
    // 3.5 ms is docs/PERF_BUDGET.md §Per-frame budget's main-thread share (2.0 + 1.5).
    const gate = read('tools/gate-perf.mjs');
    expect(gate).toMatch(/cpuFrameMs:\s*3\.5\b/);
    // Unconditional: no `frameBudgetEnforced` or `software` guard on this comparison.
    const check = /if \(cpu !== null && cpu\.p95 > BUDGET\.cpuFrameMs\) \{/;
    expect(gate).toMatch(check);
  });

  it('never lets the gates chain pass without a build to measure', () => {
    // `npm run gates` used to exit 0 with gate:perf and gate:smoke both printing SKIP
    // because dist/ was absent — the one command CLAUDE.md §2.5 requires before a commit,
    // passing having measured no frame and taken no screenshot.
    const pkg: { scripts: Record<string, string> } = JSON.parse(read('package.json'));
    const gates = pkg.scripts['gates'] ?? '';
    expect(gates).toMatch(/^npm run build\b/);
    expect(gates.indexOf('gate:perf')).toBeGreaterThan(gates.indexOf('npm run build'));
    expect(gates.indexOf('gate:smoke')).toBeGreaterThan(gates.indexOf('npm run build'));
    // `npm run build` runs `tsc --noEmit` itself, so CLAUDE.md §2.5's typecheck is still
    // in the chain rather than dropped along with the standalone script.
    expect(pkg.scripts['build']).toContain('tsc --noEmit');
    // And both gates must go red, not green, when there is nothing to measure.
    expect(read('tools/gate-perf.mjs')).not.toMatch(/gate:perf SKIP — no build/);
    expect(read('tools/playtest.mjs')).not.toMatch(/gate:smoke SKIP — no build/);
  });

  it('gate:perf budgets frame cost, never presented-frame cadence', () => {
    // The old instrument compared `report.frames.p95` — a cadence quantised to the vsync
    // tick — against 16.6 ms, so a frame presented on every vsync reported 16.667 ms and
    // failed by a rounding artefact. Both halves of this are guards against a revert.
    const gate = read('tools/gate-perf.mjs');
    expect(gate).not.toMatch(/report\.frames\.p95\s*>\s*BUDGET\.frameMs/);
    expect(gate).toMatch(/frameCostP95\s*>\s*BUDGET\.frameMs/);
    // Cadence is still recorded, under a name that says what it is.
    expect(gate).toContain('presentIntervalMs');
    expect(gate).toContain('--disable-gpu-vsync');
    expect(gate).toContain('--disable-frame-rate-limit');
  });
});
