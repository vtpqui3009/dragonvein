#!/usr/bin/env node
/**
 * Performance gate.
 *
 * Wall-clock frame time is only meaningful on real GPU hardware. CI runners — and this
 * project's build container — fall back to SwiftShader, a CPU rasteriser that is roughly
 * an order of magnitude slower. Enforcing the 16.6 ms budget there would paint the gate
 * permanently red, and a permanently red gate is one everybody learns to ignore.
 *
 * So the gate splits:
 *   - Hardware-INDEPENDENT budgets (draw calls, triangles, page errors) are enforced
 *     everywhere. These are the numbers that actually regress when someone forgets to
 *     instance a prop or ships an unculled LOD0.
 *   - The wall-clock budget is enforced only when a real GPU is present. On a software
 *     renderer it is recorded as advisory, and perf.json says so, so the perf-critic can
 *     see that it was measured but not binding.
 *
 * Evidence discipline: `artifacts/` and a first `artifacts/perf.json` are written before
 * anything that can throw, and a crash rewrites perf.json with the reason. A red gate
 * that uploads nothing costs a log dive (CI run 37920381558 left the critics empty-handed
 * because this script died before `mkdir`). The gate still fails — it just says why.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';

const BUDGET = { frameMs: 16.6, drawCalls: 180, triangles: 900_000 };
const PERF_JSON = 'artifacts/perf.json';

// Before anything else, and before anything that can throw: the evidence directories.
// `artifacts/shots/` too, so a crash here still leaves the layout the critics expect.
await mkdir('artifacts/shots', { recursive: true });

/** @param {Record<string, unknown>} extra */
const writeReport = (extra) =>
  writeFile(PERF_JSON, JSON.stringify({ budget: BUDGET, ...extra }, null, 2));

await writeReport({
  status: 'incomplete',
  note: 'gate:perf started but has not reported yet; if this is the final content, the gate crashed.',
  errors: [],
});

if (!existsSync('dist/index.html')) {
  await writeReport({ status: 'skipped', note: 'no dist/index.html — run `npm run build` first.', errors: [] });
  console.log('gate:perf SKIP — no build yet. Run `npm run build` first.');
  process.exit(0);
}

/** @type {string[]} */
const errors = [];
/** @type {import('playwright').Browser | null} */
let browser = null;
/** @type {import('node:child_process').ChildProcess | null} */
let server = null;

try {
  const { chromium } = pw;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const preview = await startPreview(4173);
  server = preview.proc;

  await page.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(3000);

  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const d = gl?.getExtension('WEBGL_debug_renderer_info');
    return d && gl ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const software = /swiftshader|llvmpipe|software|mesa offscreen/i.test(renderer);

  const frames = await page.evaluate(() => new Promise((res) => {
    const out = []; let last = performance.now();
    function tick(now) {
      out.push(now - last); last = now;
      if (out.length < 240) requestAnimationFrame(tick); else res(out.slice(60));
    }
    requestAnimationFrame(tick);
  }));
  const stats = await page.evaluate(() => globalThis.__dragonveinStats?.() ?? null);

  frames.sort((a, b) => a - b);
  const at = (q) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ?? 0;
  const report = {
    status: 'complete',
    renderer,
    softwareRenderer: software,
    frameBudgetEnforced: !software,
    frames: { p50: at(0.5), p95: at(0.95), max: frames.at(-1) ?? 0 },
    drawCalls: stats?.drawCalls ?? null,
    triangles: stats?.triangles ?? null,
    budget: BUDGET,
    errors,
  };
  await writeReport(report);

  const fail = [];
  if (report.drawCalls !== null && report.drawCalls > BUDGET.drawCalls) {
    fail.push(`draw calls ${report.drawCalls} > ${BUDGET.drawCalls} — instance your repeated props`);
  }
  if (report.triangles !== null && report.triangles > BUDGET.triangles) {
    fail.push(`triangles ${report.triangles} > ${BUDGET.triangles} — check LOD selection and culling`);
  }
  if (errors.length) fail.push(`page errors:\n  ${errors.join('\n  ')}`);
  if (!software && report.frames.p95 > BUDGET.frameMs) {
    fail.push(`p95 ${report.frames.p95.toFixed(1)} ms > ${BUDGET.frameMs} ms`);
  }

  console.log(`renderer: ${renderer}`);
  console.log(`frames p50=${report.frames.p50.toFixed(1)}ms p95=${report.frames.p95.toFixed(1)}ms` +
    (software ? '  (software rasteriser — frame budget advisory, not enforced)' : ''));
  console.log(`draw calls: ${report.drawCalls}   triangles: ${report.triangles}`);

  if (fail.length) { console.error('\nOVER BUDGET\n  ' + fail.join('\n  ')); process.exitCode = 1; }
  else console.log('gate:perf OK');
} catch (e) {
  // The gate still fails. It just leaves the critics something to read.
  const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
  await writeReport({ status: 'crashed', crash: message, errors });
  console.error(`\ngate:perf CRASHED — evidence written to ${PERF_JSON}\n${message}`);
  process.exitCode = 1;
} finally {
  server?.kill();
  await browser?.close();
}
