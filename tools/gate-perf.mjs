#!/usr/bin/env node
/**
 * Performance gate.
 *
 * ## What it measures, and why that changed
 *
 * This gate used to time frames by differencing `requestAnimationFrame` timestamps. That
 * is *presented-frame cadence*, and the compositor quantises it to the vsync tick: over
 * 120 samples every single delta was an exact integer multiple of 16.667 ms (max deviation
 * 0.010 ms). Two things follow, both fatal to the gate's purpose.
 *
 *   1. The instrument's finest resolution was the entire 16.6 ms budget, so it could
 *      never show that a frame *fits* — only count whole vsync intervals missed.
 *   2. Comparing that quantised cadence against a 16.6 ms budget fails a perfect app by
 *      construction: a frame presented on every vsync reports 16.667 ms, and
 *      16.667 > 16.6. The moment this gate met real hardware it would have failed a
 *      passing build.
 *
 * So the gate now measures frame *cost*, which is what the budget in CLAUDE.md §2.2 is
 * about, and compares cost against it:
 *
 *   - `cpuFrameMs`         main-thread wall time around the render call, from the page.
 *   - `gpuFrameMs`         `EXT_disjoint_timer_query_webgl2`, where the context has it;
 *                          `null` plus a stated reason where it does not.
 *   - `frameCostMs`        `max(cpu p95, gpu p95)` — CPU and GPU pipeline, so the slower
 *                          of the two is what a frame costs. This is the budgeted figure.
 *   - `presentIntervalMs`  the old cadence number, kept, under a name that says what it
 *                          is. It is diagnostic. It is never compared to a budget.
 *
 * The 16.6 ms budget is unchanged, and so are 180 draw calls and 900 000 triangles. This
 * is a broken instrument being corrected, not a budget being loosened (CLAUDE.md §2.7).
 *
 * ## Two passes, because one set of flags cannot answer both questions
 *
 * `--disable-gpu-vsync --disable-frame-rate-limit` is what stops rAF quantising, and the
 * gate does run with them — but only in its second pass, because they also destroy the
 * thing the first pass needs. Unpaced, rAF fires thousands of times a second (measured
 * p50 0.3 ms between callbacks), the page enqueues GL work far faster than it drains, and
 * per-frame cost becomes queue backpressure rather than the cost of a frame.
 *
 *   - pass `paced`   — default flags, vsync on. One render per presentation, which is the
 *                      condition the game actually ships in. **All budgeted figures come
 *                      from this pass.**
 *   - pass `unpaced` — the two flags above. Recorded under `unpaced` for one purpose: it
 *                      demonstrates, with a number, that the 16.667 ms quantisation in the
 *                      paced pass is the compositor's tick and not the app's frame time.
 *
 * ## What is enforced where
 *
 *   - Hardware-INDEPENDENT (draw calls, triangles, page errors) — enforced everywhere.
 *     These regress when somebody forgets to instance a prop, and they reproduce to the
 *     digit in this container.
 *   - Frame cost — enforced only on a real GPU. On SwiftShader the CPU rasterises, so the
 *     figure is a rasteriser benchmark rather than a frame cost. Recorded as advisory,
 *     with `softwareRenderer` and `frameBudgetEnforced` saying so.
 *   - The main-thread half of frame cost, `cpuFrameMs` ≤ 3.5 ms — the median everywhere,
 *     and the p95 against the same number wherever no rasteriser thread shares a core
 *     with the main thread. On a software rasteriser that is arranged by
 *     `tools/rasteriser-cap.mjs` and has to be *verified*, not merely attempted;
 *     `rasteriserCap` and `mainThreadTailEnforced` in perf.json say which happened.
 *
 * Evidence discipline: `artifacts/` and a first `artifacts/perf.json` are written before
 * anything that can throw, and a crash rewrites perf.json with the reason. A red gate
 * that uploads nothing costs a log dive (CI run 37920381558 left the critics empty-handed
 * because this script died before `mkdir`). The gate still fails — it just says why.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';
import { applyRasteriserCap, verifyRasteriserCap } from './rasteriser-cap.mjs';

const BUDGET = {
  frameMs: 16.6,
  drawCalls: 180,
  triangles: 900_000,
  /**
   * Heap churn in the frame loop, bytes per rendered frame.
   *
   * This one the container *can* police: JS-side allocation is hardware-independent, it
   * does not care that the rasteriser is software, and it reproduces across runs. The
   * number comes from a measured baseline rather than from taste — see §Heap churn in
   * docs/PERF_BUDGET.md for the runs it was derived from.
   *
   * Almost all of the current figure is inside `three.WebGLRenderer.render` and scales
   * with draw calls — see §Heap churn in docs/PERF_BUDGET.md. Raising this because the
   * scene grew is not allowed; the way to pay for a bigger scene is fewer draw calls.
   */
  heapBytesPerFrame: 40_960,
  /**
   * Main-thread wall time per frame, in ms. The hardware-independent half of the 16.6 ms
   * line, and the half this container can police honestly.
   *
   * Derived, not invented: docs/PERF_BUDGET.md §Per-frame budget assigns 2.0 ms to
   * sim + logic and 1.5 ms to scene update + culling. Those two stages are the main
   * thread's share of a frame; GPU opaque + shadows, post and headroom are the other
   * 13.1 ms and are not main-thread work. So 3.5 ms, and it moves only if that table
   * moves.
   *
   * Why this is enforced where `frameCostMs` is not: `cpuFrameMs` is wall time around
   * the render call on the main thread, and SwiftShader's rasterisation does not land
   * there. A main-thread regression (a per-frame allocation storm, a matrix rebuild, a
   * sync readback) therefore shows up in this number on a software rasteriser much as it
   * would on an iGPU. Before this budget existed, nothing in a GPU-less container
   * policed frame cost at all.
   *
   * Both the **median and the tail** are held to this number, and the tail is the part
   * with a history. An earlier version compared the p95 and went red at random: on a
   * software rasteriser the marl worker threads compete for the same cores as the main
   * thread, so the tail measured how busy the box was. Identical bytes, two machines,
   * one CI run apart:
   *
   *   build container   cpu p50 0.7   p95 1.8   gpu p50 117 ms
   *   GitHub runner     cpu p50 0.9   p95 3.7   gpu p50 237 ms
   *
   * The rasteriser is 2x slower on the runner and the p95 doubled with it (+106%) while
   * the median moved +29%. The fix at the time was to enforce the median everywhere,
   * which worked but left no p95 enforced on any machine this project has run on.
   *
   * The owner's ruling (`STATE.md` §2026-10-10 decisions, decision 2) was to remove the
   * contention instead: `tools/rasteriser-cap.mjs` partitions the cores so the page's
   * renderer process never shares one with the rasteriser, which brings the tail back
   * under the app's control (p95 1.6-1.8 -> 1.2-1.3, p95/p50 2.3-2.6 -> 1.6-1.7). So the
   * p95 is enforced wherever that cap is **verified** — not merely attempted — or where
   * the renderer is real hardware and there is nothing to cap. Where neither holds, the
   * median still carries it and `perf.json` says why the tail was not enforced. The
   * number has never moved; only what it is compared against.
   */
  cpuFrameMs: 3.5,
  /** CLAUDE.md §2.6, assets excluded. Source maps are not shipped and do not count. */
  bundleGzipBytes: 1_400_000,
  /** docs/PERF_BUDGET.md §Other budgets. */
  bootMs: 2500,
};
const PERF_JSON = 'artifacts/perf.json';
const VIEWPORT = { width: 1920, height: 1080 };   // the "@1080p" half of the budget line
const WARMUP_MS = 3000;                           // shaders, shadow map, first GC
/**
 * 360, up from 180, and the deadline with it. At 180 the window was deadline-limited on
 * a loaded runner — `sampleCount.cpuFrameMs` came back 166 against a target of 180 with
 * `collectionWindowMs` pinned to the deadline — so the p95 rested on about eight tail
 * samples and landed either side of its budget run to run. A p95 that does not reproduce
 * is not evidence either way. The budget did not move; the window did.
 */
const TARGET_SAMPLES = 360;
/**
 * The window has to close on `TARGET_SAMPLES`, not on this deadline — a p95 taken from a
 * deadline-limited window is the irreproducible number a previous run already fixed once.
 * The deadline is the bound on a hung page, not the normal exit.
 *
 * 420 s, up from 70 s, because the rasteriser cap costs sample rate: confining
 * SwiftShader to half the cores roughly doubles its per-frame time (gpu p50 ~200 ms ->
 * ~375 ms here), so 360 frames took 152 s on this box and should take ~300 s on a runner
 * that rasterises half as fast. Raising it is close to free — the loop exits the moment
 * the target is met, so the deadline only costs time on a page that has stopped
 * producing frames, and CI allows 30 minutes for the whole chain.
 *
 * `enforceTail` below still refuses to enforce the tail on a window that ends up short,
 * so an unexpectedly slow box loses the tail check rather than failing at random.
 */
const SAMPLE_DEADLINE_MS = 420_000;
const IDLE_BASELINE_MS = 6_000;                   // long enough for 24 heap samples
const UNPACED_WINDOW_MS = 4000;                   // the cadence pass needs no more
const VSYNC_TICK_MS = 1000 / 60;
const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const UNPACED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

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

// A missing build is a failure, not a SKIP. `npm run gates` used to exit 0 with this gate
// and gate:smoke both skipping, which meant the one command CLAUDE.md §2.5 says must pass
// before a commit could pass having measured no frame and taken no screenshot. The gates
// chain now builds first (package.json), so reaching here without a build means the build
// did not happen, and that is exactly what the gate should go red for.
if (!existsSync('dist/index.html')) {
  await writeReport({
    status: 'failed',
    note: 'no dist/index.html — nothing was measured. Run `npm run build` first.',
    errors: ['no dist/index.html: the gate had nothing to measure'],
  });
  console.error('gate:perf FAIL — no build to measure. Run `npm run build` first.');
  process.exit(1);
}

/**
 * Nearest-rank percentile over an unsorted array. One implementation, used for every
 * figure in the report, so no two numbers in perf.json mean subtly different things.
 * @param {number[]} values @param {number} q @returns {number | null}
 */
function percentile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
}

/** @param {number[]} values @returns {{p50:number,p95:number,max:number,mean:number}|null} */
function summarise(values) {
  if (values.length === 0) return null;
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    max: round(Math.max(...values)),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

/** @param {number | null} n @returns {number} */
function round(n) {
  return n === null ? 0 : Math.round(n * 1000) / 1000;
}

/**
 * How far the cadence samples sit from whole vsync ticks. Near zero means the browser is
 * quantising rAF and no cadence figure can resolve anything finer than a tick — the
 * defect that made the old instrument useless. Recorded so a critic can check the claim
 * rather than take it on trust.
 * @param {number[]} values @returns {number | null}
 */
function maxDeviationFromVsyncTick(values) {
  if (values.length === 0) return null;
  let worst = 0;
  for (const v of values) {
    const ticks = v / VSYNC_TICK_MS;
    worst = Math.max(worst, Math.abs(ticks - Math.round(ticks)) * VSYNC_TICK_MS);
  }
  return round(worst);
}

/**
 * Gzipped weight of what actually ships, by file. Source maps are excluded: they are not
 * part of the gzip budget, they are fetched by devtools rather than by players, and the
 * deployed tree does not contain them.
 * @returns {Promise<{gzipBytes:number, rawBytes:number, files:{file:string,gzipBytes:number}[]}>}
 */
async function measureBundle(dir = 'dist') {
  /** @type {{file:string,gzipBytes:number}[]} */
  const files = [];
  let gzipBytes = 0;
  let rawBytes = 0;
  /** @param {string} d */
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (p.endsWith('.map')) continue;
      const buf = await readFile(p);
      const gz = gzipSync(buf, { level: 9 }).length;
      files.push({ file: path.relative(dir, p), gzipBytes: gz });
      gzipBytes += gz;
      rawBytes += buf.length;
    }
  }
  await walk(dir);
  files.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return { gzipBytes, rawBytes, files };
}

/** Sum of the rising edges of a heap series, in kB, plus the number of falls. */
function risingEdges(kb) {
  let rising = 0;
  let scavenges = 0;
  for (let i = 1; i < kb.length; i++) {
    const d = (kb[i] ?? 0) - (kb[i - 1] ?? 0);
    if (d > 0) rising += d; else if (d < 0) scavenges++;
  }
  return { rising, scavenges };
}

/**
 * Heap churn, from a series of `Runtime.getHeapUsage` readings taken from *outside* the
 * page, so no in-page instrumentation of ours is inside the measurement.
 *
 * The budgeted figure is the allocation the **frame** is responsible for, which is not
 * the same as every byte allocated during the window. Some of this page's churn is
 * driven by *time*, not by frames: the HUD repaints on a 250 ms timer and formats
 * strings, and the rAF loop itself runs whether or not anything is drawn. Dividing all
 * of it by frames rendered made the figure track 1/frames — a slow pass read over a
 * budget it had not breached, and that is what went red on CI while the same commit
 * passed here.
 *
 * So the gate measures the time-driven rate first, with `renderer.render` paused via
 * `__dragonveinPerf.setRendering(false)`, and subtracts it:
 *
 *   bytesPerFrame = (risingBytes − idleBytesPerSecond × windowSeconds) ÷ framesRendered
 *
 * Falls, which are scavenges, are counted separately rather than cancelling out the
 * allocation that caused them. Both the raw and the corrected figures are reported, so
 * the subtraction is visible rather than buried.
 *
 * @param {number[]} kb @param {number} frames @param {number} windowMs
 * @param {number|null} idleBytesPerSecond
 */
function summariseHeap(kb, frames, windowMs, baseline, loopTicks) {
  if (kb.length < 2 || frames <= 0) return null;
  const { rising, scavenges } = risingEdges(kb);
  const min = Math.min(...kb);
  const max = Math.max(...kb);
  const risingBytes = rising * 1024;
  // Two readings of the same baseline, and the gate subtracts the SMALLER.
  //
  // The idle pass runs with rendering paused, so rAF fires at the vsync tick (~60 Hz)
  // while the measured window runs at the rasteriser's ~6 fps — ten times slower. Charge
  // that baseline per *second* across the slow window and it over-subtracts everything
  // in it that is really per *callback* (the loop body), which the perf-critic measured
  // at roughly 15% of the headline figure. Charge it per callback and it under-subtracts
  // what is genuinely per second (the HUD's 250 ms repaint). One idle pass cannot
  // separate the two — it has one cadence — so rather than guess a split the gate takes
  // whichever reading removes less. A budget that errs toward reporting too much churn
  // fails loudly and is fixed; one that errs the other way passes quietly and is not.
  const perSecond = baseline === null ? null : baseline.bytesPerSecond * (windowMs / 1000);
  const perCallback = baseline === null || baseline.bytesPerCallback === null || loopTicks <= 0
    ? null
    : baseline.bytesPerCallback * loopTicks;
  const candidates = [perSecond, perCallback].filter((v) => v !== null);
  const idleBytes = candidates.length === 0
    ? 0
    : Math.min(Math.min(...candidates), risingBytes);
  return {
    minKB: min,
    maxKB: max,
    sawtoothAmplitudeKB: max - min,
    netGrowthKB: (kb.at(-1) ?? 0) - (kb[0] ?? 0),
    risingSumKB: rising,
    bytesPerFrame: Math.round((risingBytes - idleBytes) / frames),
    uncorrectedBytesPerFrame: Math.round(risingBytes / frames),
    idleBytesPerSecond: baseline === null ? null : Math.round(baseline.bytesPerSecond),
    idleBytesPerCallback: baseline?.bytesPerCallback == null
      ? null : Math.round(baseline.bytesPerCallback),
    idleBytesIfChargedPerSecond: perSecond === null ? null : Math.round(perSecond),
    idleBytesIfChargedPerCallback: perCallback === null ? null : Math.round(perCallback),
    idleBytesSubtracted: Math.round(idleBytes),
    loopTicksInWindow: loopTicks,
    framesInWindow: frames,
    windowMs,
    sampleCount: kb.length,
    scavenges,
    samplesKB: kb,
  };
}

/**
 * One measurement pass: its own browser, because the vsync flags are process-wide.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {string[]} opts.extraArgs
 * @param {string[]} opts.errors        collected across both passes
 * @param {number} opts.targetSamples   0 means "collect for `windowMs` and stop"
 * @param {number} opts.windowMs
 * @param {boolean} [opts.sampleHeap]
 */
async function measure({ url, extraArgs, errors, targetSamples, windowMs, sampleHeap = false }) {
  const browser = await pw.chromium.launch({ args: [...SWIFTSHADER, ...extraArgs] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

    // Read the renderer before the warm-up, because whether the rasteriser is software
    // decides whether the cap below is applied at all — and the cap has to be in place
    // *before* the warm-up, so shaders, the shadow map and the first GC all happen under
    // the same core partition the measurement runs under.
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const d = gl?.getExtension('WEBGL_debug_renderer_info');
      return d && gl ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const software = /swiftshader|llvmpipe|software|mesa offscreen/i.test(renderer);

    // Stop the rasteriser competing with the page's main thread for cores, so the tail
    // of `cpuFrameMs` is the app rather than the box. See tools/rasteriser-cap.mjs.
    const cap = await applyRasteriserCap({ rootPid: process.pid, software });

    await page.waitForTimeout(WARMUP_MS);

    const hasProbe = await page.evaluate(() => globalThis.__dragonveinPerf !== undefined);
    if (!hasProbe) {
      throw new Error(
        'the page exposes no __dragonveinPerf; src/main.ts must publish the frame-cost ' +
        'instrument this gate measures (see its FrameCostReport interface)',
      );
    }

    // The heap is read over CDP, not from inside the page: the measurement must not be
    // part of what it measures.
    const cdp = sampleHeap ? await page.context().newCDPSession(page) : null;

    // The baseline, measured first and with rendering paused: what this page allocates
    // when it is not drawing, per second and per rAF callback both. Subtracted below so
    // the budgeted figure is the frame's own churn. See `summariseHeap`.
    /** @type {{bytesPerSecond: number, bytesPerCallback: number|null}|null} */
    let baseline = null;
    // A page that predates the pause hook still measures; it just does not get the
    // correction, and `heap.idleBytesPerSecond` reads null so the artefact says so.
    const canPause = await page.evaluate(
      () => typeof globalThis.__dragonveinPerf?.setRendering === 'function');
    if (cdp && canPause) {
      await page.evaluate(() => { globalThis.__dragonveinPerf?.setRendering(false); });
      await page.waitForTimeout(500);                 // let the last frame drain
      /** @type {number[]} */
      const idleKB = [];
      const ticksAtIdleStart = await page.evaluate(
        () => globalThis.__dragonveinPerf?.counts().loopTicks ?? 0);
      const idleStart = Date.now();
      let ticksAtIdleEnd = ticksAtIdleStart;
      while (Date.now() - idleStart < IDLE_BASELINE_MS) {
        const usage = await cdp.send('Runtime.getHeapUsage');
        idleKB.push(Math.round(usage.usedSize / 1024));
        ticksAtIdleEnd = await page.evaluate(
          () => globalThis.__dragonveinPerf?.counts().loopTicks ?? 0);
        await page.waitForTimeout(250);
      }
      const idleMs = Date.now() - idleStart;
      const idleTicks = ticksAtIdleEnd - ticksAtIdleStart;
      if (idleKB.length >= 2 && idleMs > 0) {
        const idleBytes = risingEdges(idleKB).rising * 1024;
        baseline = {
          bytesPerSecond: idleBytes / (idleMs / 1000),
          bytesPerCallback: idleTicks > 0 ? idleBytes / idleTicks : null,
        };
      }
      await page.evaluate(() => { globalThis.__dragonveinPerf?.setRendering(true); });
      await page.waitForTimeout(500);
    }

    // Reset AFTER the idle pass, not before it. rAF keeps firing while rendering is
    // paused, so those tick-length intervals landed in `presentIntervalMs` and dragged
    // its mean below its own p50 — a cadence that belonged to no part of the scene.
    await page.evaluate(() => { globalThis.__dragonveinPerf?.reset(); });

    /** @type {number[]} */
    const heapKB = [];
    const framesAtStart = (await page.evaluate(
      () => globalThis.__dragonveinPerf?.counts().framesRendered ?? 0));
    const ticksAtStart = (await page.evaluate(
      () => globalThis.__dragonveinPerf?.counts().loopTicks ?? 0));

    // Verified here rather than at pin time, and after the idle pass has started and
    // stopped rendering — so the masks are read back off the threads that are about to
    // be measured, including any the warm-up created. A `taskset` that exited 0 is a
    // claim; the mask in /proc is the fact.
    await verifyRasteriserCap(cap);

    const startedAt = Date.now();
    let framesAtEnd = framesAtStart;
    let ticksAtEnd = ticksAtStart;
    for (;;) {
      if (cdp) {
        const usage = await cdp.send('Runtime.getHeapUsage');
        heapKB.push(Math.round(usage.usedSize / 1024));
      }
      const elapsed = Date.now() - startedAt;
      // `counts()`, not `read()`: `read()` copies three sample windows and would put
      // kilobytes of its own into the heap series below.
      const counts = await page.evaluate(() => globalThis.__dragonveinPerf?.counts() ?? null);
      framesAtEnd = counts?.framesRendered ?? framesAtEnd;
      ticksAtEnd = counts?.loopTicks ?? ticksAtEnd;
      if (elapsed >= windowMs) break;
      // Both series, not just the CPU one. Breaking on `cpuFrameMs` alone left the GPU
      // series — the one that actually carries `frameCostMs.p95` — about 4% short of the
      // target every run, because a timer query lands a frame or two after the frame it
      // timed. A `gpuFrameMs` of 0 means the context exposes no timer at all, not that it
      // is lagging, so that case must not block the break.
      const cpuDone = (counts?.cpuFrameMs ?? 0) >= targetSamples;
      const gpuCount = counts?.gpuFrameMs ?? 0;
      const gpuDone = gpuCount === 0 || gpuCount >= targetSamples;
      if (targetSamples > 0 && cpuDone && gpuDone) break;
      await page.waitForTimeout(250);
    }

    const probe = await page.evaluate(() => globalThis.__dragonveinPerf?.read() ?? null);
    const stats = await page.evaluate(() => globalThis.__dragonveinStats?.() ?? null);
    if (!probe) throw new Error('__dragonveinPerf.read() returned nothing');

    return {
      probe, stats, renderer, software, cap,
      /** Did the window close on its sample target, or run out of clock? */
      windowClosedOnTarget: targetSamples > 0
        && (probe.cpuFrameMs?.length ?? 0) >= targetSamples,
      collectionWindowMs: Date.now() - startedAt,
      heap: summariseHeap(
        heapKB, framesAtEnd - framesAtStart, Date.now() - startedAt, baseline,
        ticksAtEnd - ticksAtStart,
      ),
    };
  } finally {
    await browser.close();
  }
}

/** @type {string[]} */
const errors = [];
/** @type {import('node:child_process').ChildProcess | null} */
let server = null;

try {
  const preview = await startPreview(4173);
  server = preview.proc;

  // Pass 1: paced. Every budgeted figure comes from here.
  const paced = await measure({
    url: preview.url, extraArgs: [], errors,
    targetSamples: TARGET_SAMPLES, windowMs: SAMPLE_DEADLINE_MS, sampleHeap: true,
  });
  // Pass 2: unpaced, purely to show what the vsync tick was hiding.
  const unpaced = await measure({
    url: preview.url, extraArgs: UNPACED, errors,
    targetSamples: 0, windowMs: UNPACED_WINDOW_MS,
  });

  const bundle = await measureBundle();
  const cpu = summarise(paced.probe.cpuFrameMs);
  const gpu = paced.probe.gpuFrameMs === null ? null : summarise(paced.probe.gpuFrameMs);
  const present = summarise(paced.probe.presentIntervalMs);

  // CPU and GPU pipeline: a frame costs whichever of the two is slower, not their sum.
  const frameCostP95 = Math.max(cpu?.p95 ?? 0, gpu?.p95 ?? 0);

  /**
   * Is the main-thread **tail** enforceable on this machine?
   *
   * Two ways to earn it, and both are about the same property: no rasteriser thread may
   * share a core with the page's main thread. Real hardware has it for free. A software
   * rasteriser has it only where `tools/rasteriser-cap.mjs` pinned the cores and then
   * read the masks back — `verified`, never merely `applied`.
   *
   * And a third condition that is about the statistic rather than the machine: the p95
   * has to come from a window that closed on its sample target. A deadline-limited
   * window rests its tail on a handful of samples and does not reproduce, and enforcing
   * an irreproducible number is how a gate becomes one people learn to ignore.
   */
  const tailMachineOk = !paced.software || paced.cap.verified;
  const enforceTail = tailMachineOk && paced.windowClosedOnTarget;

  const report = {
    status: 'complete',
    renderer: paced.renderer,
    softwareRenderer: paced.software,
    frameBudgetEnforced: !paced.software,
    rasteriserCap: paced.cap,
    mainThreadTailEnforced: enforceTail,
    mainThreadTailNote: enforceTail
      ? 'cpuFrameMs.p95 is enforced: nothing shares a core with the main thread, and the ' +
        'sampling window closed on its target.'
      : 'cpuFrameMs.p95 is advisory on this run. ' +
        (tailMachineOk
          ? `The sampling window closed on the deadline rather than on ` +
            `${TARGET_SAMPLES} samples (${paced.probe.cpuFrameMs.length} collected in ` +
            `${paced.collectionWindowMs} ms), so the tail would not reproduce.`
          : `The rasteriser could not be kept off the main thread's cores — ` +
            `${paced.cap.reason}. See rasteriserCap.`),
    viewport: paced.probe.viewport,
    tier: paced.probe.tier,
    context: paced.probe.context,
    sampleCount: {
      cpuFrameMs: paced.probe.cpuFrameMs.length,
      gpuFrameMs: paced.probe.gpuFrameMs?.length ?? 0,
      presentIntervalMs: paced.probe.presentIntervalMs.length,
      target: TARGET_SAMPLES,
      collectionWindowMs: paced.collectionWindowMs,
      note: `${WARMUP_MS} ms of warm-up is discarded before collection starts; these are ` +
        'the samples retained for every figure below.',
    },
    frameCostMs: {
      p95: round(frameCostP95),
      basis: 'max(cpuFrameMs.p95, gpuFrameMs.p95) from the paced pass — the budgeted figure',
      budgetMs: BUDGET.frameMs,
      withinBudget: frameCostP95 <= BUDGET.frameMs,
    },
    cpuFrameMs: cpu === null ? null : {
      ...cpu,
      budgetMs: BUDGET.cpuFrameMs,
      withinBudget: cpu.p50 <= BUDGET.cpuFrameMs,
      p95WithinBudget: cpu.p95 <= BUDGET.cpuFrameMs,
      enforcedStatistic: enforceTail
        ? 'p50 and p95, both against the same 3.5 ms'
        : 'p50 only on this run; see mainThreadTailNote for why the tail is advisory',
      note: 'Main-thread wall time around the render call. The hardware-independent ' +
        'half of the 16.6 ms line, so this one IS enforced on the software rasteriser: ' +
        'SwiftShader rasterises off this thread (compare cpu p50 here with the GPU ' +
        'timer figure below), so a main-thread regression shows up in this number ' +
        'whatever renders the pixels. The tail used to be unenforceable because the ' +
        'rasteriser competed for the main thread\'s cores and the p95 measured the box ' +
        '(identical bytes: p50 0.7 -> 0.9 between two machines, p95 1.8 -> 3.7); ' +
        'rasteriserCap removes that competition by partitioning the cores, so the p95 ' +
        'is held to the same 3.5 ms wherever the cap verifies. Budget from ' +
        'docs/PERF_BUDGET.md §Per-frame budget: sim + logic 2.0 ms + scene update/' +
        'culling 1.5 ms.',
    },
    gpuFrameMs: gpu,
    gpuTimer: {
      available: paced.probe.gpuFrameMs !== null,
      extension: 'EXT_disjoint_timer_query_webgl2',
      unavailableReason: paced.probe.gpuTimerUnavailableReason,
      disjointEventsDiscarded: paced.probe.gpuDisjointEvents,
    },
    presentIntervalMs: present === null ? null : {
      ...present,
      maxDeviationFromVsyncTickMs: maxDeviationFromVsyncTick(paced.probe.presentIntervalMs),
      note: 'rAF-to-rAF cadence — what this gate used to report as `frames`. It is a ' +
        'presentation interval, not a frame cost, and it is compared to no budget. A ' +
        '`maxDeviationFromVsyncTickMs` near 0 means the browser is quantising to the ' +
        'vsync tick, so the figure cannot resolve anything finer than 16.667 ms. See ' +
        '`unpaced` for the same scene with vsync disabled.',
    },
    unpaced: {
      note: 'Second pass, launched with --disable-gpu-vsync --disable-frame-rate-limit. ' +
        'Here rAF is not quantised, which is what makes the paced pass\'s quantisation ' +
        'provably the compositor and not the app. No figure here is budgeted: unpaced, ' +
        'the page enqueues GL work faster than it drains and per-frame cost becomes queue ' +
        'backpressure.',
      presentIntervalMs: summarise(unpaced.probe.presentIntervalMs),
      maxDeviationFromVsyncTickMs: maxDeviationFromVsyncTick(unpaced.probe.presentIntervalMs),
      cpuFrameMs: summarise(unpaced.probe.cpuFrameMs),
      framesRendered: unpaced.probe.framesRendered,
      windowMs: unpaced.collectionWindowMs,
    },
    heap: paced.heap === null ? null : {
      ...paced.heap,
      budgetBytesPerFrame: BUDGET.heapBytesPerFrame,
      withinBudget: paced.heap.bytesPerFrame <= BUDGET.heapBytesPerFrame,
      note: 'Sampled with Runtime.getHeapUsage over CDP from outside the page, every ' +
        '250 ms across the paced window, so none of the measurement is inside what it ' +
        'measures. `bytesPerFrame` is the sum of the rising edges MINUS the time-driven ' +
        'baseline (`idleBytesPerSecond`, measured first with renderer.render paused), ' +
        'divided by the frames rendered — because the HUD timer and the rAF loop ' +
        'allocate per second rather than per frame, and dividing those by frames made ' +
        'the figure track 1/frames. `uncorrectedBytesPerFrame` is the old number, kept ' +
        'so the subtraction is visible. `netGrowthKB` near zero with a large ' +
        '`sawtoothAmplitudeKB` is churn, not a leak.',
    },
    gc: {
      pauseMsMeasured: false,
      reason: 'The web platform exposes no GC pause timing — there is no PerformanceEntry ' +
        'for a scavenge and CDP offers no pause duration — so the rubric\'s "GC pauses ' +
        '< 2 ms" cannot be read directly. What can be said: a pause long enough to ' +
        'matter has to land inside some frame, and the worst frame cost in this window ' +
        'bounds it.',
      inferredScavenges: paced.heap?.scavenges ?? null,
      meanScavengeIntervalMs: paced.heap && paced.heap.scavenges > 0
        ? round(paced.collectionWindowMs / paced.heap.scavenges)
        : null,
      worstCpuFrameMs: cpu?.max ?? null,
    },
    bundle: {
      ...bundle,
      budgetGzipBytes: BUDGET.bundleGzipBytes,
      withinBudget: bundle.gzipBytes <= BUDGET.bundleGzipBytes,
      note: 'Gzip level 9 over every file in dist/ except .map. Source maps are not ' +
        'shipped to the deployed tree, so they are neither served nor counted.',
    },
    bootMs: round(paced.probe.bootMs),
    bootBudgetMs: BUDGET.bootMs,
    framesRendered: paced.probe.framesRendered,
    drawCalls: paced.stats?.drawCalls ?? null,
    triangles: paced.stats?.triangles ?? null,
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
  if (report.sampleCount.cpuFrameMs === 0) {
    fail.push('no frame-cost samples: the page rendered no frame during the collection window');
  }
  // A measurement taken while the WebGL context is dead is not a measurement. The page
  // keeps rendering nothing, `renderer.info` freezes, and every figure above is stale.
  if (report.context.lost) {
    fail.push(
      `the WebGL context was lost during the run and had not come back after ` +
      `${report.context.restoreAttempts} restore attempt(s); ` +
      `${report.context.framesSkippedWhileLost} frames were skipped`,
    );
  }
  // Hardware-independent, so enforced on the software rasteriser too.
  if (report.heap === null) {
    fail.push('no heap series: the gate could not sample Runtime.getHeapUsage, so the ' +
      'frame loop is unpoliced for allocation');
  } else if (report.heap.bytesPerFrame > BUDGET.heapBytesPerFrame) {
    fail.push(
      `heap churn ${report.heap.bytesPerFrame} B/frame > ${BUDGET.heapBytesPerFrame} B/frame ` +
      `(sawtooth ${report.heap.sawtoothAmplitudeKB} kB over ${report.heap.framesInWindow} frames) ` +
      '— something in the frame loop is allocating; pre-allocate it at mount',
    );
  }
  if (!report.bundle.withinBudget) {
    fail.push(`bundle ${report.bundle.gzipBytes} B gzipped > ${BUDGET.bundleGzipBytes} B`);
  }
  if (report.bootMs > BUDGET.bootMs) {
    fail.push(`boot to first frame ${report.bootMs} ms > ${BUDGET.bootMs} ms`);
  }
  // The main-thread half of the frame budget, enforced everywhere. SwiftShader does not
  // rasterise on this thread, so this figure is comparable between a software rasteriser
  // and an iGPU in a way `frameCostMs` is not. Without it, a GPU-less container policed
  // no part of frame cost at all.
  if (cpu !== null && cpu.p50 > BUDGET.cpuFrameMs) {
    fail.push(
      `main-thread frame cost p50 ${cpu.p50} ms > ${BUDGET.cpuFrameMs} ms ` +
      `(docs/PERF_BUDGET.md §Per-frame budget gives the main thread 2.0 + 1.5 ms) ` +
      '— the regression is on the CPU side, not in the rasteriser',
    );
  }
  // The same 3.5 ms against the tail. Enforced wherever nothing shares a core with the
  // main thread — real hardware, or a verified rasteriser cap — from a window that
  // closed on its sample target. See BUDGET.cpuFrameMs and tools/rasteriser-cap.mjs.
  if (cpu !== null && report.mainThreadTailEnforced && cpu.p95 > BUDGET.cpuFrameMs) {
    fail.push(
      `main-thread frame cost p95 ${cpu.p95} ms > ${BUDGET.cpuFrameMs} ms with the ` +
      `rasteriser off this thread's cores (${report.rasteriserCap.reason}), so the tail ` +
      'is the app and not the box',
    );
  }
  // Cost, not cadence. A vsync-locked frame now reports what it cost and is not failed by
  // a rounding artefact.
  if (report.frameBudgetEnforced && frameCostP95 > BUDGET.frameMs) {
    fail.push(
      `frame cost p95 ${frameCostP95.toFixed(2)} ms > ${BUDGET.frameMs} ms ` +
      `(cpu p95 ${cpu?.p95 ?? 0} ms, gpu p95 ${gpu?.p95 ?? 'n/a'} ms) — make the frame cheaper`,
    );
  }

  console.log(`renderer: ${report.renderer}`);
  console.log(`viewport: ${report.viewport.cssWidth}x${report.viewport.cssHeight} ` +
    `(drawing buffer ${report.viewport.drawingBufferWidth}x${report.viewport.drawingBufferHeight}), ` +
    `tier: ${report.tier.name}`);
  console.log(`rasteriser cap: ${report.rasteriserCap.reason ?? 'n/a'}` +
    (report.rasteriserCap.verified
      ? ` (${report.rasteriserCap.threadsVerified} threads re-read)`
      : ''));
  console.log(`cpu frame cost p50=${cpu?.p50 ?? 'n/a'}ms (enforced) p95=${cpu?.p95 ?? 'n/a'}ms ` +
    `(${report.mainThreadTailEnforced ? 'enforced' : 'advisory'}) ` +
    `vs budget ${BUDGET.cpuFrameMs}ms over ${report.sampleCount.cpuFrameMs} samples ` +
    `of ${TARGET_SAMPLES} target in ${report.sampleCount.collectionWindowMs}ms`);
  console.log(gpu
    ? `gpu frame cost p50=${gpu.p50}ms p95=${gpu.p95}ms over ${report.sampleCount.gpuFrameMs} samples`
    : `gpu frame cost: not measured — ${report.gpuTimer.unavailableReason}`);
  console.log(`present interval p50=${present?.p50 ?? 'n/a'}ms, off a whole vsync tick by ` +
    `${report.presentIntervalMs?.maxDeviationFromVsyncTickMs}ms paced / ` +
    `${report.unpaced.maxDeviationFromVsyncTickMs}ms unpaced`);
  console.log(`frame cost p95=${frameCostP95.toFixed(2)}ms vs budget ${BUDGET.frameMs}ms` +
    (report.softwareRenderer ? '  (software rasteriser — frame budget advisory, not enforced)' : ''));
  console.log(`heap churn: ${report.heap?.bytesPerFrame ?? 'n/a'} B/frame vs budget ` +
    `${BUDGET.heapBytesPerFrame} B/frame  (net growth ${report.heap?.netGrowthKB ?? 'n/a'} kB ` +
    `over ${report.heap?.framesInWindow ?? 'n/a'} frames, ${report.gc.inferredScavenges} scavenges)`);
  console.log(`bundle: ${(report.bundle.gzipBytes / 1000).toFixed(2)} kB gzipped vs budget ` +
    `${(BUDGET.bundleGzipBytes / 1000).toFixed(0)} kB  (source maps excluded, not shipped)`);
  console.log(`boot to first frame: ${report.bootMs}ms vs budget ${BUDGET.bootMs}ms`);
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
}
