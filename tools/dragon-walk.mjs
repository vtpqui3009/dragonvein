#!/usr/bin/env node
/**
 * The dragon walk (M7b), measured and filmed: `node tools/dragon-walk.mjs` (after `npm run build`).
 *
 *   artifacts/variants/dragon-walk.json     every number below, per dragon and per foot
 *   artifacts/variants/dragon-walk-a.png    one dragon walking, the tracking side camera, at
 *   artifacts/variants/dragon-walk-b.png    two gait phases: a at its left hind's mid-swing,
 *                                           b at its right hind's
 *   artifacts/turntables/dragon-walk.webm   the same camera following it for WALK_CLIP_CYCLES
 *                                           cycles (and .frame00.png)
 *
 * It fails (exit 1) when:
 * - **a planted foot slides**: any sheet dragon's foot moves more than DRIFT_LIMIT of its stride
 *   in the world while planted. Each of the 8 sheet dragons walks 2 cycles alone, at fixed
 *   steps (`__dragonView.walkDrift`), and each foot is measured twice: its ball node through
 *   the posed skeleton, and its contact patch (every vertex of the foot and toes within 0.10
 *   of the ground) skinned on the CPU exactly as the shader skins it;
 * - a knee swings through KNEE_MIN_DEG or less over the cycles, or the IK ever runs out of reach;
 * - **the rest pose changed**: the sheet skinned and at rest differs from the same sheet built
 *   from plain meshes (`?static=1`) in more than REST_TOLERANCE pixels;
 * - **a draw was added**: draw calls per frame (WebGL draw calls counted) differ between the
 *   plain sheet at rest and the skinned sheet walking;
 * - **the main thread is over budget**: the sheet with all eight walking (`?walk=1`) costs more
 *   than CPU_BUDGET_MS at p95 per frame, pose and render together (docs/PERF_BUDGET.md, 3.5 ms).
 *
 * Headless Chromium on SwiftShader, as every gate here runs.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pw from 'playwright';
import { decodePng } from './png.mjs';
import { applyRasteriserCap, verifyRasteriserCap } from './rasteriser-cap.mjs';
import { startPreview } from './preview-server.mjs';

const SHEET_VIEW = { width: 1800, height: 760 };
const WALK_VIEW = { width: 960, height: 720 };
const DRIFT_LIMIT = 0.01;
const KNEE_MIN_DEG = 15;
const REST_TOLERANCE = 8;
const REST_THRESHOLD = 8;
const CPU_BUDGET_MS = 3.5;
/**
 * The main-thread window, as gate:perf takes it (docs/PERF_BUDGET.md §Capping the rasteriser):
 * the rasteriser pinned off the page's cores and verified, then CPU_SAMPLES frames or the
 * deadline. The viewport is small because cpuFrameMs does not depend on it and the
 * software rasteriser's frame time does: more frames in the window.
 */
const CPU_VIEW = { width: 900, height: 380 };
const CPU_SAMPLES = 240;
const CPU_DEADLINE_MS = 150_000;
const CPU_WARMUP_MS = 3000;
const DRIFT_CYCLES = 2;
const DRIFT_STEPS = 480;
const WALK_CLIP_SLOT = Number(process.env.DRAGON_WALK ?? 0);
const WALK_CLIP_CYCLES = 3;
const FPS = 24;

if (!existsSync('dist/dragon.html')) {
  console.error('dragon-walk: no dist/dragon.html. Run `npm run build` first.');
  process.exit(1);
}
mkdirSync('artifacts/variants', { recursive: true });
mkdirSync('artifacts/turntables', { recursive: true });

const errors = [];
const fails = [];
const out = { what: 'M7b walk: planted-foot drift, knee range, rest-pose identity, draws, main-thread cost (tools/dragon-walk.mjs)' };
let browser = null;
let server = null;
try {
  browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const preview = await startPreview(4177);
  server = preview.proc;
  const open = async (query, viewport) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // Count every WebGL draw call, so a frame's draws can be read off.
    await page.addInitScript(() => {
      window.__draws = 0;
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
        for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
          const o = C.prototype[f];
          if (o) C.prototype[f] = function (...a) { window.__draws++; return o.apply(this, a); };
        }
      }
    });
    await page.goto(`${preview.url}dragon.html${query}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => window.__dragonView?.ready === true, null, { timeout: 60_000 });
    return page;
  };
  const drawsOf = (page, fn) => page.evaluate((f) => { window.__draws = 0; new Function(f)(); return window.__draws; }, fn);

  // 1. Rest-pose identity and draws: plain meshes vs skinned, both at rest; then walking.
  const shots = {};
  const draws = {};
  for (const [name, query] of [['static', '?static=1'], ['skinned', '']]) {
    const page = await open(query, SHEET_VIEW);
    await page.evaluate(() => {
      window.__dragonView.idleAt(null);
      window.__dragonView.walkAt(null);
      document.getElementById('note').style.visibility = 'hidden'; // its build time differs run to run
    });
    await page.waitForTimeout(200);
    const file = path.join('artifacts', 'variants', `.walk-rest-${name}.png`);
    await page.screenshot({ path: file });
    shots[name] = decodePng(file);
    rmSync(file);
    draws[`${name}Rest`] = await drawsOf(page, 'window.__dragonView.idleAt(null)');
    if (name === 'skinned') {
      draws.skinnedIdle = await drawsOf(page, 'window.__dragonView.idleAt(2.5)');
      draws.skinnedWalking = await drawsOf(page, 'window.__dragonView.walkAt(1.7)');
    }
    await page.close();
  }
  let restChanged = 0, restOver = 0;
  const { w, h } = shots.static;
  for (let i = 0; i < w * h; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(shots.static.px[3 * i + c] - shots.skinned.px[3 * i + c]));
    if (d > 0) restChanged++;
    if (d > REST_THRESHOLD) restOver++;
  }
  out.rest = { compare: 'dragon.html?static=1 vs dragon.html, both at rest (idleAt(null), walkAt(null)), the sheet camera',
    viewport: SHEET_VIEW, changedPixels: restChanged, overThreshold: restOver, threshold: REST_THRESHOLD, tolerance: REST_TOLERANCE };
  out.draws = { what: 'WebGL draw calls in one frame of the sheet', ...draws };
  console.log(`rest: skinned vs static sheet: ${restChanged} pixels differ at all, ${restOver} by more than ${REST_THRESHOLD}`);
  console.log(`draws per frame: static at rest ${draws.staticRest}, skinned at rest ${draws.skinnedRest}, idling ${draws.skinnedIdle}, walking ${draws.skinnedWalking}`);
  if (restOver > REST_TOLERANCE) fails.push(`rest pose: ${restOver} pixels differ from the static sheet (tolerance ${REST_TOLERANCE})`);
  if (draws.skinnedWalking !== draws.staticRest || draws.skinnedRest !== draws.staticRest) fails.push(`draws: static ${draws.staticRest}, skinned ${draws.skinnedRest}, walking ${draws.skinnedWalking}`);

  // 2. Drift and knees: each sheet dragon walks alone through fixed steps.
  const sheet = await open('', SHEET_VIEW);
  await sheet.evaluate(() => window.__dragonView.idleAt(null));
  const n = await sheet.evaluate(() => window.__dragonView.sheet.length);
  const dragons = [];
  console.log('drift (% of stride, ball / contact patch) and knee range (°), per foot LH LF RH RF:');
  for (let k = 0; k < n; k++) {
    const d = await sheet.evaluate(([i, c, s]) => window.__dragonView.walkDrift(i, c, s), [k, DRIFT_CYCLES, DRIFT_STEPS]);
    const legs = d.legs.map((L) => ({
      leg: L.leg, stances: L.stances, contactVerts: L.contactVerts,
      ballDriftPct: 100 * L.ballDrift / d.stride, contactDriftPct: 100 * L.contactDrift / d.stride,
      kneeMinDeg: L.kneeMinDeg, kneeMaxDeg: L.kneeMaxDeg, kneeRangeDeg: L.kneeMaxDeg - L.kneeMinDeg, stretched: L.stretched,
    }));
    dragons.push({ label: d.label, stride: d.stride, period: d.period, speed: d.stride / d.period, duty: d.duty, legs });
    const f = (x) => x.toExponential(1);
    console.log(`  ${d.label}  stride ${d.stride.toFixed(3)}  period ${d.period.toFixed(2)} s  duty ${d.duty.toFixed(2)}  ` +
      legs.map((L) => `${L.leg} ${f(L.ballDriftPct)}/${f(L.contactDriftPct)} ${L.kneeRangeDeg.toFixed(0)}°`).join('  '));
    for (const L of legs) {
      if (L.ballDriftPct > 100 * DRIFT_LIMIT || L.contactDriftPct > 100 * DRIFT_LIMIT) fails.push(`${d.label} ${L.leg}: stance drift ${L.ballDriftPct.toFixed(3)} % / ${L.contactDriftPct.toFixed(3)} % of stride`);
      if (L.kneeRangeDeg <= KNEE_MIN_DEG) fails.push(`${d.label} ${L.leg}: knee range ${L.kneeRangeDeg.toFixed(1)}° ≤ ${KNEE_MIN_DEG}°`);
      if (L.stretched > 0) fails.push(`${d.label} ${L.leg}: IK out of reach on ${L.stretched} steps`);
      if (L.stances < DRIFT_CYCLES || L.contactVerts === 0) fails.push(`${d.label} ${L.leg}: only ${L.stances} stances, ${L.contactVerts} contact vertices measured`);
    }
  }
  const all = dragons.flatMap((d) => d.legs);
  out.drift = { cycles: DRIFT_CYCLES, steps: DRIFT_STEPS, limitPct: 100 * DRIFT_LIMIT, kneeMinDeg: KNEE_MIN_DEG,
    maxBallDriftPct: Math.max(...all.map((L) => L.ballDriftPct)), maxContactDriftPct: Math.max(...all.map((L) => L.contactDriftPct)),
    minKneeRangeDeg: Math.min(...all.map((L) => L.kneeRangeDeg)), dragons };
  await sheet.close();

  // 3. Main-thread cost: the sheet idling (M7a's frame), then all eight walking, capped.
  const cpuPage = await open('', CPU_VIEW);
  const cap = await verifyRasteriserCap(await applyRasteriserCap({ rootPid: process.pid, software: true }));
  const sample = async () => {
    await cpuPage.waitForTimeout(CPU_WARMUP_MS);
    await cpuPage.evaluate(() => window.__dragonView.frameStats(true));
    const t0 = Date.now();
    while (Date.now() - t0 < CPU_DEADLINE_MS) {
      await cpuPage.waitForTimeout(1000);
      if ((await cpuPage.evaluate(() => window.__dragonView.frameStats(false))).n >= CPU_SAMPLES) break;
    }
    return cpuPage.evaluate(() => window.__dragonView.frameStats(true));
  };
  const idleCpu = await sample();
  await cpuPage.evaluate(() => window.__dragonView.walkPlay());
  const walkCpu = await sample();
  await cpuPage.close();
  out.cpuFrameMs = { what: 'main-thread ms per clock-driven frame on dragon.html (pose + render + labels), the 8-dragon sheet, ' +
    'under the rasteriser cap (tools/rasteriser-cap.mjs)', budgetMs: CPU_BUDGET_MS, viewport: CPU_VIEW, samplesTarget: CPU_SAMPLES,
    cap: { applied: cap.applied, verified: cap.verified, reason: cap.reason, cpus: cap.cpus }, idling: idleCpu, walking: walkCpu };
  console.log(`cpuFrameMs (cap ${cap.verified ? 'verified' : `not verified: ${cap.reason}`}): idling p50 ${idleCpu.p50.toFixed(2)} p95 ${idleCpu.p95.toFixed(2)} ` +
    `(n ${idleCpu.n}); all 8 walking p50 ${walkCpu.p50.toFixed(2)} p95 ${walkCpu.p95.toFixed(2)} max ${walkCpu.max.toFixed(2)} (n ${walkCpu.n}); budget ${CPU_BUDGET_MS}`);
  // As gate:perf: the median always; the p95 where the cap is verified and the window closed on its target.
  if (!(walkCpu.p50 < CPU_BUDGET_MS)) fails.push(`cpuFrameMs walking p50 ${walkCpu.p50}, budget ${CPU_BUDGET_MS}`);
  if (cap.verified && walkCpu.n >= CPU_SAMPLES && !(walkCpu.p95 < CPU_BUDGET_MS)) fails.push(`cpuFrameMs walking p95 ${walkCpu.p95} (n ${walkCpu.n}), budget ${CPU_BUDGET_MS}`);
  if (walkCpu.n < CPU_SAMPLES || !cap.verified) {
    out.cpuFrameMs.tailNote = `p95 not enforced: ${cap.verified ? `the window closed on its deadline with ${walkCpu.n} of ${CPU_SAMPLES} frames` : 'the rasteriser cap is not verified'}`;
    console.log(`  ${out.cpuFrameMs.tailNote}`);
  }

  // 4. Seen: two phases and a clip, the tracking side camera.
  const view = await open(`?view=walk&i=${WALK_CLIP_SLOT}`, WALK_VIEW);
  const g = await view.evaluate(() => window.__dragonView.gaits[0]);
  const label = await view.evaluate((k) => window.__dragonView.sheet[k].label, WALK_CLIP_SLOT);
  await view.evaluate(() => window.__dragonView.idleAt(1.0));
  // a: the left hind at mid-swing; b: the right hind at mid-swing, both in the second cycle.
  const mid = (1 + g.duty) / 2;
  const tA = g.period * (1 + g.phase[0] + mid), tB = g.period * (1 + g.phase[2] + mid);
  for (const [name, t] of [['a', tA], ['b', tB]]) {
    await view.evaluate((x) => window.__dragonView.walkAt(x), t);
    await view.screenshot({ path: `artifacts/variants/dragon-walk-${name}.png` });
  }
  const frames = Math.ceil(WALK_CLIP_CYCLES * g.period * FPS);
  const dir = path.join('artifacts', 'turntables', 'dragon-walk.frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    await view.evaluate((t) => { window.__dragonView.idleAt(1 + t); window.__dragonView.walkAt(t); }, f / FPS);
    await view.screenshot({ path: path.join(dir, `f${String(f).padStart(3, '0')}.png`) });
  }
  await view.close();
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png'),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-pix_fmt', 'yuv420p', 'artifacts/turntables/dragon-walk.webm'], { encoding: 'utf8' });
  if (ff.status !== 0) errors.push(`ffmpeg: ${ff.stderr}`);
  spawnSync('cp', [path.join(dir, 'f000.png'), 'artifacts/turntables/dragon-walk.frame00.png']);
  rmSync(dir, { recursive: true, force: true });
  out.seen = { slot: WALK_CLIP_SLOT, label, viewport: WALK_VIEW,
    a: { file: 'artifacts/variants/dragon-walk-a.png', t: tA, phase: 'left hind mid-swing' },
    b: { file: 'artifacts/variants/dragon-walk-b.png', t: tB, phase: 'right hind mid-swing' },
    clip: { file: 'artifacts/turntables/dragon-walk.webm', fps: FPS, frames, seconds: frames / FPS, cycles: frames / FPS / g.period } };
  console.log(`seen: dragon-walk-a.png (t ${tA.toFixed(2)} s), -b.png (t ${tB.toFixed(2)} s), dragon-walk.webm — sheet slot ${WALK_CLIP_SLOT} (${label}), ` +
    `${frames} frames at ${FPS} fps, ${(frames / FPS / g.period).toFixed(1)} cycles`);
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server?.kill();
}
out.fails = fails;
out.errors = errors;
writeFileSync('artifacts/variants/dragon-walk.json', `${JSON.stringify(out, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v), 2)}\n`);
console.log('wrote artifacts/variants/dragon-walk.json');
if (fails.length || errors.length) {
  console.error(`dragon-walk FAIL:\n${[...fails, ...errors].join('\n')}`);
  process.exit(1);
}
console.log('dragon-walk OK');
