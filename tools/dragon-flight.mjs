#!/usr/bin/env node
/**
 * The dragon flap and glide (M7c), measured and filmed: `node tools/dragon-flight.mjs` (after
 * `npm run build`).
 *
 *   artifacts/variants/dragon-flight.json   every number below, per dragon
 *   artifacts/variants/dragon-flap-a.png    the sheet, each dragon at the top of its downstroke
 *   artifacts/variants/dragon-flap-b.png    ... and at the bottom of it
 *   artifacts/variants/dragon-glide.png     the sheet, every dragon gliding
 *   artifacts/turntables/dragon-flight.webm one dragon (`?view=flight`, the follow camera framing
 *                                           everything its wings reach) going rest → flap for
 *                                           FLAP_CLIP_CYCLES beats → glide → rest, each change on
 *                                           the page's own ramp (and .frame00.png)
 *
 * It measures, through `__dragonView.flightProbe` (src/render/flight-probe.ts), each of the 8
 * sheet dragons and two synthetic genomes, every gene mid-range but wingSpan at 0.55 and 1.65,
 * over PROBE_CYCLES beats at PROBE_PHASES phases each, a glide over one soar period, the ramp in
 * and the flap → glide crossfade. At every sample it skins the wing vertices on the CPU as the
 * shader does and records the least clearance to the body's own swept tubes, the least
 * distance between the two wings and their gap across the midplane, and the finger order.
 *
 * It fails (exit 1) when:
 * - **a wing enters the body**: any wing vertex's clearance to the body's tubes is ≤ 0;
 * - **the wings touch**: the least distance between the two wings is ≤ 0;
 * - **a finger crosses its neighbour**: the order of the leading digit, the fingers' mids and
 *   tips about the wrist changes from rest, at any sample;
 * - **the flap does not show**: a wingtip's height range over the beat is under TIP_MIN of the
 *   half-span;
 * - **the rest pose changed**: the sheet skinned and at rest differs from the same sheet built from
 *   plain meshes (`?static=1`) in more than REST_TOLERANCE pixels;
 * - **a draw was added**: draw calls per frame differ between the plain sheet at rest and the
 *   skinned sheet flapping or gliding;
 * - **the main thread is over budget**: the sheet with all eight flapping (`?flap=1`) costs more
 *   than CPU_BUDGET_MS at p95 per frame, under the rasteriser cap (docs/PERF_BUDGET.md, 3.5 ms).
 *
 * It reports the heap per frame flapping against idling, the floor subtracted, as
 * tools/dragon-walk.mjs does. Headless Chromium on SwiftShader, as every gate here runs.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pw from 'playwright';
import { decodePng } from './png.mjs';
import { applyRasteriserCap, verifyRasteriserCap } from './rasteriser-cap.mjs';
import { startPreview } from './preview-server.mjs';

const SHEET_VIEW = { width: 1800, height: 760 };
const FLIGHT_VIEW = { width: 960, height: 720 };
const TIP_MIN = 0.30;
const REST_TOLERANCE = 8;
const REST_THRESHOLD = 8;
const CPU_BUDGET_MS = 3.5;
/** The main-thread window, as tools/dragon-walk.mjs and gate:perf take it. */
const CPU_VIEW = { width: 900, height: 380 };
const CPU_SAMPLES = 240;
const CPU_DEADLINE_MS = 150_000;
const CPU_WARMUP_MS = 3000;
const HEAP_EVERY_MS = 250;
const HEAP_FLOOR_MS = 8000;
const PROBE_CYCLES = 2;
const PROBE_PHASES = 32;
/** The synthetic genomes: every gene mid-range, wingSpan at either end of its range. */
const SYNTHETIC_SPANS = [0.55, 1.65];
const FLIGHT_CLIP_SLOT = Number(process.env.DRAGON_FLIGHT ?? 3);
const FLAP_CLIP_CYCLES = 2.5;
const GLIDE_CLIP_S = 2.5;
const HOLD_S = 0.5;
const FPS = 24;

if (!existsSync('dist/dragon.html')) {
  console.error('dragon-flight: no dist/dragon.html. Run `npm run build` first.');
  process.exit(1);
}
mkdirSync('artifacts/variants', { recursive: true });
mkdirSync('artifacts/turntables', { recursive: true });

const errors = [];
const fails = [];
const out = { what: 'M7c flap and glide: wing-to-body and wing-to-wing clearance, finger order, wingtip travel, rest-pose identity, draws, main-thread cost, heap (tools/dragon-flight.mjs)' };
let browser = null;
let server = null;
try {
  browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const preview = await startPreview(4179);
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

  // 1. Rest-pose identity and draws: plain meshes vs skinned, both at rest; then flapping and gliding.
  const shots = {};
  const draws = {};
  for (const [name, query] of [['static', '?static=1'], ['skinned', '']]) {
    const page = await open(query, SHEET_VIEW);
    await page.evaluate(() => {
      window.__dragonView.idleAt(null);
      window.__dragonView.walkAt(null);
      window.__dragonView.flapAt(null);
      document.getElementById('note').style.visibility = 'hidden'; // its build time differs run to run
    });
    await page.waitForTimeout(200);
    const file = path.join('artifacts', 'variants', `.flight-rest-${name}.png`);
    await page.screenshot({ path: file });
    shots[name] = decodePng(file);
    rmSync(file);
    draws[`${name}Rest`] = await drawsOf(page, 'window.__dragonView.idleAt(null)');
    if (name === 'skinned') {
      draws.skinnedFlapping = await drawsOf(page, 'window.__dragonView.flapAt(0.3)');
      draws.skinnedGliding = await drawsOf(page, 'window.__dragonView.glideAt(1.1)');
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
  out.rest = { compare: 'dragon.html?static=1 vs dragon.html, both at rest (idleAt(null), walkAt(null), flapAt(null)), the sheet camera',
    viewport: SHEET_VIEW, changedPixels: restChanged, overThreshold: restOver, threshold: REST_THRESHOLD, tolerance: REST_TOLERANCE };
  out.draws = { what: 'WebGL draw calls in one frame of the sheet', ...draws };
  console.log(`rest: skinned vs static sheet: ${restChanged} pixels differ at all, ${restOver} by more than ${REST_THRESHOLD}`);
  console.log(`draws per frame: static at rest ${draws.staticRest}, skinned at rest ${draws.skinnedRest}, flapping ${draws.skinnedFlapping}, gliding ${draws.skinnedGliding}`);
  if (restOver > REST_TOLERANCE) fails.push(`rest pose: ${restOver} pixels differ from the static sheet (tolerance ${REST_TOLERANCE})`);
  for (const k of ['skinnedRest', 'skinnedFlapping', 'skinnedGliding']) if (draws[k] !== draws.staticRest) fails.push(`draws: static ${draws.staticRest}, ${k} ${draws[k]}`);

  // 2. Clearance, finger order and wingtip travel: each sheet dragon, then the synthetic spans.
  const sheet = await open('', SHEET_VIEW);
  await sheet.evaluate(() => window.__dragonView.idleAt(null));
  const n = await sheet.evaluate(() => window.__dragonView.sheet.length);
  const genes = await sheet.evaluate(() => window.__dragonView.genes);
  const mid = {};
  for (const [k, [lo, hi, kind]] of Object.entries(genes)) mid[k] = kind === 'i' || kind === 'e' ? Math.round((lo + hi) / 2) : (lo + hi) / 2;
  const specs = [...Array.from({ length: n }, (_, k) => k), ...SYNTHETIC_SPANS.map((wingSpan) => ({ ...mid, wingSpan }))];
  const dragons = [];
  const f3 = (x) => x.toFixed(3);
  console.log('per dragon: body clearance (min / rest; free wing), wing to wing (vertex distance / midplane gap), finger gap, wingtip travel / half-span:');
  for (const spec of specs) {
    const r = await sheet.evaluate(([s, c, p]) => window.__dragonView.flightProbe(s, c, p), [spec, PROBE_CYCLES, PROBE_PHASES]);
    const synthetic = typeof spec !== 'number';
    const d = {
      label: synthetic ? `synthetic, wingSpan ${spec.wingSpan}` : r.label, synthetic, gid: r.gid, wingForm: r.wingForm,
      wingSpan: r.wingSpan, wingFingers: r.wingFingers, wingShape: r.wingShape, bones: r.bones, hover: r.hover,
      params: r.params, samples: r.samples, wingVerts: r.wingVerts, junctionVerts: r.junctionVerts,
      bodyClearance: { min: r.body.min, rest: r.restClearance, at: r.body.at, vertex: r.body.vertex, vertexRest: r.body.rest },
      freeWingClearance: r.free,
      wingToWing: { min: r.wingToWing.min, exactBelow: r.wingToWing.exactBelow, at: r.wingToWing.at },
      midplaneGap: r.midplaneGap,
      fingers: r.fingers,
      wingtips: r.tips.map((t, i) => ({ wing: i === 0 ? 'left' : 'right', travel: t.travel, halfSpan: t.halfSpan, travelPct: 100 * t.ratio })),
      bodyClearancePerSample: r.body.perSample,
    };
    dragons.push(d);
    console.log(`  ${d.label.padEnd(22)} ${d.wingForm.padEnd(9)} span ${d.wingSpan.toFixed(2)} fingers ${d.wingFingers}  body ${f3(d.bodyClearance.min)} / ${f3(d.bodyClearance.rest)}; free ${f3(r.free.min)}  ` +
      `wings ${f3(d.wingToWing.min)} / ${f3(d.midplaneGap.min)}  fingers ${d.fingers.minGapDeg.toFixed(1)}° (${d.fingers.crossings} crossings)  ` +
      `tips ${d.wingtips.map((t) => `${t.travelPct.toFixed(0)} %`).join(' ')}  (${d.samples} samples)`);
    const at = (s) => `${s.kind} t ${s.t.toFixed(3)} flap ${s.flap} glide ${s.glide}`;
    if (!(d.bodyClearance.min > 0)) fails.push(`${d.label}: a wing vertex ${f3(d.bodyClearance.min)} from the body (${at(d.bodyClearance.at)}, vertex ${d.bodyClearance.vertex})`);
    if (!(d.wingToWing.min > 0)) fails.push(`${d.label}: the wings ${f3(d.wingToWing.min)} apart (${at(d.wingToWing.at)})`);
    if (d.fingers.crossings > 0) fails.push(`${d.label}: ${d.fingers.crossings} finger crossings (least gap ${d.fingers.minGapDeg.toFixed(2)}° at ${at(d.fingers.at)})`);
    for (const t of d.wingtips) if (!(t.travelPct >= 100 * TIP_MIN)) fails.push(`${d.label} ${t.wing}: wingtip travel ${t.travelPct.toFixed(1)} % of the half-span, under ${100 * TIP_MIN} %`);
  }
  const min = (f) => Math.min(...dragons.map(f));
  out.flight = {
    probe: 'src/render/flight-probe.ts through __dragonView.flightProbe: wing vertices skinned on the CPU as the shader skins them; the body\'s own swept tubes ' +
      '(every tube that is not a wing\'s: torso, neck, head and crown, tail, legs) as round cones between their stations, carried by the same skeleton',
    cycles: PROBE_CYCLES, phasesPerCycle: PROBE_PHASES, synthetic: { genes: 'every gene mid-range', wingSpans: SYNTHETIC_SPANS },
    tipMinPct: 100 * TIP_MIN,
    minBodyClearance: min((d) => d.bodyClearance.min), minFreeWingClearance: min((d) => d.freeWingClearance.min),
    minWingToWing: min((d) => d.wingToWing.min), minMidplaneGap: min((d) => d.midplaneGap.min),
    minFingerGapDeg: min((d) => d.fingers.minGapDeg), fingerCrossings: dragons.reduce((a, d) => a + d.fingers.crossings, 0),
    minWingtipTravelPct: min((d) => Math.min(...d.wingtips.map((t) => t.travelPct))),
    dragons,
  };
  await sheet.close();

  // 3. Main-thread cost and heap: the sheet idling (M7a's frame), then all eight flapping, capped.
  const cpuPage = await open('', CPU_VIEW);
  const cap = await verifyRasteriserCap(await applyRasteriserCap({ rootPid: process.pid, software: true }));
  const cdp = await cpuPage.context().newCDPSession(cpuPage);
  const rising = (kb) => kb.reduce((a, v, i) => a + (i && v > kb[i - 1] ? v - kb[i - 1] : 0), 0);
  const heapRead = async () => (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024;
  await cpuPage.evaluate(() => { window.__dragonView.idleAt(null); window.__dragonView.walkAt(null); window.__dragonView.flapAt(null); });
  await cpuPage.waitForTimeout(1000);
  const floorKB = [];
  const tf = Date.now();
  while (Date.now() - tf < HEAP_FLOOR_MS) { floorKB.push(await heapRead()); await cpuPage.evaluate(() => window.__dragonView.frameStats(false)); await cpuPage.waitForTimeout(HEAP_EVERY_MS); }
  const floorBytesPerS = (rising(floorKB) * 1024) / ((Date.now() - tf) / 1000);
  const sample = async () => {
    await cpuPage.waitForTimeout(CPU_WARMUP_MS);
    await cpuPage.evaluate(() => window.__dragonView.frameStats(true));
    const kb = [];
    const t0 = Date.now();
    let frames = 0;
    while (Date.now() - t0 < CPU_DEADLINE_MS) {
      kb.push(await heapRead());
      frames = (await cpuPage.evaluate(() => window.__dragonView.frameStats(false))).n;
      if (frames >= CPU_SAMPLES) break;
      await cpuPage.waitForTimeout(HEAP_EVERY_MS);
    }
    const seconds = (Date.now() - t0) / 1000;
    const cpu = await cpuPage.evaluate(() => window.__dragonView.frameStats(true));
    const raw = rising(kb) * 1024;
    return { cpu, heap: { frames, seconds, uncorrectedBytesPerFrame: Math.round(raw / frames),
      bytesPerFrame: Math.round(Math.max(0, raw - floorBytesPerS * seconds) / frames), sawtoothKB: Math.round(Math.max(...kb) - Math.min(...kb)) } };
  };
  await cpuPage.evaluate(() => window.__dragonView.idlePlay());
  const idling = await sample();
  await cpuPage.evaluate(() => window.__dragonView.flapPlay());
  const flapping = await sample();
  await cpuPage.close();
  const idleCpu = idling.cpu, flapCpu = flapping.cpu;
  out.heap = { what: 'dragon.html heap churn per rendered frame, Runtime.getHeapUsage over CDP from outside the page; rising edges minus ' +
    'the floor (the same polling with no clock running, charged per second); the 8-dragon sheet', everyMs: HEAP_EVERY_MS,
    floorBytesPerSecond: Math.round(floorBytesPerS), idling: idling.heap, flapping: flapping.heap,
    flapAddsBytesPerFrame: flapping.heap.bytesPerFrame - idling.heap.bytesPerFrame,
    note: 'as dragon-walk.json: the sheet draws 50 and three.js render allocates per draw, so the sheet itself sits above the game page\'s ' +
      '40 960 B/frame budget, which gate:perf holds on the game page (which has no dragons flying). What the flap adds is flapAddsBytesPerFrame.' };
  console.log(`heap: floor ${Math.round(floorBytesPerS)} B/s; idling ${idling.heap.bytesPerFrame} B/frame (raw ${idling.heap.uncorrectedBytesPerFrame}), ` +
    `flapping ${flapping.heap.bytesPerFrame} B/frame (raw ${flapping.heap.uncorrectedBytesPerFrame}); the flap adds ${out.heap.flapAddsBytesPerFrame} B/frame`);
  out.cpuFrameMs = { what: 'main-thread ms per clock-driven frame on dragon.html (pose + render + labels), the 8-dragon sheet, ' +
    'under the rasteriser cap (tools/rasteriser-cap.mjs)', budgetMs: CPU_BUDGET_MS, viewport: CPU_VIEW, samplesTarget: CPU_SAMPLES,
    cap: { applied: cap.applied, verified: cap.verified, reason: cap.reason, cpus: cap.cpus }, idling: idleCpu, flapping: flapCpu };
  console.log(`cpuFrameMs (cap ${cap.verified ? 'verified' : `not verified: ${cap.reason}`}): idling p50 ${idleCpu.p50.toFixed(2)} p95 ${idleCpu.p95.toFixed(2)} ` +
    `(n ${idleCpu.n}); all 8 flapping p50 ${flapCpu.p50.toFixed(2)} p95 ${flapCpu.p95.toFixed(2)} max ${flapCpu.max.toFixed(2)} (n ${flapCpu.n}); budget ${CPU_BUDGET_MS}`);
  // As gate:perf: the median always; the p95 where the cap is verified and the window closed on its target.
  if (!(flapCpu.p50 < CPU_BUDGET_MS)) fails.push(`cpuFrameMs flapping p50 ${flapCpu.p50}, budget ${CPU_BUDGET_MS}`);
  if (cap.verified && flapCpu.n >= CPU_SAMPLES && !(flapCpu.p95 < CPU_BUDGET_MS)) fails.push(`cpuFrameMs flapping p95 ${flapCpu.p95} (n ${flapCpu.n}), budget ${CPU_BUDGET_MS}`);
  if (flapCpu.n < CPU_SAMPLES || !cap.verified) {
    out.cpuFrameMs.tailNote = `p95 not enforced: ${cap.verified ? `the window closed on its deadline with ${flapCpu.n} of ${CPU_SAMPLES} frames` : 'the rasteriser cap is not verified'}`;
    console.log(`  ${out.cpuFrameMs.tailNote}`);
  }

  // 4. Seen: the sheet at the top and the bottom of the downstroke and gliding; then one dragon's flight.
  const stills = await open('', SHEET_VIEW);
  await stills.evaluate(() => window.__dragonView.idleAt(1.0));
  const seen = {};
  for (const [name, fn, what] of [
    ['dragon-flap-a', 'window.__dragonView.flapPhaseAt("top")', 'each dragon at the top of its downstroke (phase 0 of its own beat)'],
    ['dragon-flap-b', 'window.__dragonView.flapPhaseAt("bottom")', 'each dragon at the bottom of its downstroke (phase `down` of its own beat)'],
    ['dragon-glide', 'window.__dragonView.glideAt(1.25)', 'every dragon gliding, 1.25 s into its soar'],
  ]) {
    await stills.evaluate((f) => new Function(f)(), fn);
    const file = `artifacts/variants/${name}.png`;
    await stills.screenshot({ path: file });
    seen[name] = { file, what };
  }
  await stills.close();
  const view = await open(`?view=flight&i=${FLIGHT_CLIP_SLOT}`, FLIGHT_VIEW);
  const fp = await view.evaluate(() => window.__dragonView.flights[0]);
  const ramp = await view.evaluate(() => window.__dragonView.flightRampS);
  const label = await view.evaluate((k) => window.__dragonView.sheet[k].label, FLIGHT_CLIP_SLOT);
  // The timeline: rest, ramp in, flap, crossfade to the glide, glide, ramp out, rest. The weights
  // ease as the page's clock eases them (linear, then smoothstep).
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const tFlap = HOLD_S + ramp, tCross = tFlap + FLAP_CLIP_CYCLES * fp.period, tGlide = tCross + ramp;
  const tLand = tGlide + GLIDE_CLIP_S, tDown = tLand + ramp, tEnd = tDown + HOLD_S;
  const weights = (t) => {
    if (t < HOLD_S) return [0, 0];
    if (t < tCross) return [ease((t - HOLD_S) / ramp), 0];
    if (t < tGlide) { const x = ease((t - tCross) / ramp); return [1 - x, x]; }
    if (t < tLand) return [0, 1];
    return [0, 1 - ease((t - tLand) / ramp)];
  };
  const frames = Math.ceil(tEnd * FPS);
  const dir = path.join('artifacts', 'turntables', 'dragon-flight.frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    const [wf, wg] = weights(t);
    await view.evaluate(([x, a, b]) => { window.__dragonView.idleAt(1 + x); window.__dragonView.flightAt(x, a, b); }, [t, wf, wg]);
    await view.screenshot({ path: path.join(dir, `f${String(f).padStart(3, '0')}.png`) });
  }
  await view.close();
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png'),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-pix_fmt', 'yuv420p', 'artifacts/turntables/dragon-flight.webm'], { encoding: 'utf8' });
  if (ff.status !== 0) errors.push(`ffmpeg: ${ff.stderr}`);
  spawnSync('cp', [path.join(dir, 'f000.png'), 'artifacts/turntables/dragon-flight.frame00.png']);
  rmSync(dir, { recursive: true, force: true });
  out.seen = { ...seen,
    clip: { file: 'artifacts/turntables/dragon-flight.webm', slot: FLIGHT_CLIP_SLOT, label, viewport: FLIGHT_VIEW, fps: FPS, frames, seconds: frames / FPS,
      timeline: { restUntil: HOLD_S, flapFrom: HOLD_S, fullFlapAt: tFlap, crossfadeAt: tCross, fullGlideAt: tGlide, landAt: tLand, restAt: tDown, end: tEnd },
      flapCycles: FLAP_CLIP_CYCLES, rampS: ramp } };
  console.log(`seen: dragon-flap-a.png, dragon-flap-b.png, dragon-glide.png (the sheet); dragon-flight.webm — sheet slot ${FLIGHT_CLIP_SLOT} (${label}), ` +
    `${frames} frames at ${FPS} fps: rest → flap ${FLAP_CLIP_CYCLES} beats → glide ${GLIDE_CLIP_S} s → rest`);
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server?.kill();
}
out.fails = fails;
out.errors = errors;
writeFileSync('artifacts/variants/dragon-flight.json', `${JSON.stringify(out, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v), 2)}\n`);
console.log('wrote artifacts/variants/dragon-flight.json');
if (fails.length || errors.length) {
  console.error(`dragon-flight FAIL:\n${[...fails, ...errors].join('\n')}`);
  process.exit(1);
}
console.log('dragon-flight OK');
