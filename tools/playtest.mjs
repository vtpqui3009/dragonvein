#!/usr/bin/env node
/** Drives the build headlessly and proves the current milestone's loop can be completed.
 *
 *  Evidence discipline: `artifacts/shots/` and `artifacts/playtest.log` are created before
 *  anything that can throw, and a crash still writes the log. The gate keeps failing — it
 *  just stops failing silently.
 *
 *  Shots, all from one 1280×720 session so the critics compare like with like:
 *    00-boot.png        first frame after boot
 *    01-wide.png        the settled frame — lighting, palette and density are judged here
 *    02-silhouette.png  01-wide downscaled to 25% (320×180) for rubric A1
 *    03-late.png        ≥ 8 s in, so rubric A5 has two frames to diff for pops
 *    04-context-restored.png   after an induced WebGL context loss (rubric G5)
 *
 *  And one motion artefact, `artifacts/turntables/m0-island.webm`: rubric A5 asks whether
 *  anything pops in a scene whose whole definition of done is that it *rotates*, and
 *  three stills are weak evidence for that. The critic should be able to watch it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';

const LOG = 'artifacts/playtest.log';
const SHOTS = 'artifacts/shots';
const TURNTABLES = 'artifacts/turntables';
const TURNTABLE = `${TURNTABLES}/m0-island.webm`;
const TURNTABLE_MS = 7_000;           // long enough to see the rotation carry a full prop past
const VIEW = { width: 1280, height: 720 };
const SILHOUETTE_SCALE = 0.25;        // rubric A1 judges the shape at 25% zoom
const LATE_SHOT_AFTER_MS = 8_500;     // rubric A5 wants ≥ 8 s of running before the diff
const CONTEXT_RESTORE_WAIT_MS = 4_000;   // the window the gameplay-critic's G5 repro used

// First, before anything that can throw: the directories the critics read.
await mkdir(SHOTS, { recursive: true });
await mkdir(TURNTABLES, { recursive: true });

/** @type {string[]} */
const log = [];
/** @type {string[]} */
const errors = [];
const say = (s) => { log.push(s); console.log(s); };
const flush = () => writeFile(LOG, log.concat(errors).join('\n') + '\n');

say(`gate:smoke start ${new Date().toISOString()}`);
say(`viewport ${VIEW.width}x${VIEW.height}`);
await flush();

// A missing build is a failure, not a SKIP. This gate is the only thing that produces
// the screenshots the art-critic scores; skipping quietly meant `npm run gates` could
// exit 0 having rendered nothing and photographed nothing. The gates chain builds first
// (package.json), so reaching here without a build means the build did not run.
if (!existsSync('dist/index.html')) {
  say('gate:smoke FAIL — no build to play. Run `npm run build` first.');
  errors.push('no dist/index.html: nothing was rendered and no screenshot was taken');
  await flush();
  process.exit(1);
}

/** @type {import('playwright').Browser | null} */
let browser = null;
/** @type {import('node:child_process').ChildProcess | null} */
let server = null;

try {
  const { chromium } = pw;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: VIEW });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const preview = await startPreview(4174);
  server = preview.proc;
  say(`preview: ${preview.url}`);

  const loadedAt = Date.now();
  await page.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(2500);

  const booted = await page.evaluate(() => Boolean(globalThis.__dragonveinStats));
  say(booted ? 'boot: OK' : 'boot: FAILED — the game never exposed __dragonveinStats');

  await page.screenshot({ path: `${SHOTS}/00-boot.png` });
  say(`shot: ${SHOTS}/00-boot.png  (t+${Date.now() - loadedAt}ms)`);
  await flush();

  // The settled frame. Give the sun, the shadow map and the instanced scatter a moment
  // past boot so the art-critic is not scoring a half-warmed first frame.
  await page.waitForTimeout(2000);
  const wide = await page.screenshot({ path: `${SHOTS}/01-wide.png` });
  say(`shot: ${SHOTS}/01-wide.png  (t+${Date.now() - loadedAt}ms)`);

  // 02 is 01 downscaled, not a second render, so the silhouette the critic reads at 25%
  // is provably the same frame it judged the lighting from.
  const thumb = {
    width: Math.round(VIEW.width * SILHOUETTE_SCALE),
    height: Math.round(VIEW.height * SILHOUETTE_SCALE),
  };
  const shrink = await browser.newPage({ viewport: thumb });
  await shrink.setContent(
    `<style>html,body{margin:0;background:#000}img{display:block;` +
    `width:${thumb.width}px;height:${thumb.height}px}</style>` +
    `<img src="data:image/png;base64,${wide.toString('base64')}">`,
  );
  await shrink.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await shrink.screenshot({ path: `${SHOTS}/02-silhouette.png` });
  await shrink.close();
  say(`shot: ${SHOTS}/02-silhouette.png  (${thumb.width}x${thumb.height}, ` +
    `${SILHOUETTE_SCALE * 100}% of 01-wide, rubric A1)`);
  await flush();

  // The late frame: same camera, more elapsed time. A5 diffs this against 01-wide.
  const remaining = LATE_SHOT_AFTER_MS - (Date.now() - loadedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
  await page.screenshot({ path: `${SHOTS}/03-late.png` });
  say(`shot: ${SHOTS}/03-late.png  (t+${Date.now() - loadedAt}ms, rubric A5)`);

  const stats = await page.evaluate(() => globalThis.__dragonveinStats?.() ?? null);
  say(`stats: ${JSON.stringify(stats)}`);
  say('note: stats.frameMs is the rAF present interval and is quantised to the vsync ' +
    'tick; stats.cpuFrameMs is what the frame cost the main thread. gate:perf budgets ' +
    'the cost — see docs/PERF_BUDGET.md §How the gate actually measures this.');

  // --- the context-loss drill ----------------------------------------------------------
  // A driver reset is routine on the weak iGPU this game targets, and an unrecovered one
  // used to kill the canvas for the whole session while the overlay cheerfully carried on
  // printing `FPS 60 DRAWS 20 TRIS 26984`. Run last, after every screenshot the art
  // critic reads, so the shots are unaffected.
  const before = await page.evaluate(() => globalThis.__dragonveinPerf?.read().context ?? null);
  if (!before?.restoreSupported) {
    say('context loss: SKIP — this browser exposes no WEBGL_lose_context, so a loss ' +
      'cannot be induced or restored here');
  } else {
    await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement | null} */ (document.getElementById('c'));
      const gl = c?.getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    await page.waitForTimeout(CONTEXT_RESTORE_WAIT_MS);
    const after = await page.evaluate(() => globalThis.__dragonveinPerf?.read().context ?? null);
    const hud = await page.evaluate(() => document.getElementById('hud')?.innerText ?? '');
    await page.screenshot({ path: `${SHOTS}/04-context-restored.png` });
    say(`context loss: induced, waited ${CONTEXT_RESTORE_WAIT_MS}ms -> ` +
      `${JSON.stringify(after)}`);
    say(`context loss: overlay afterwards: ${hud.replace(/\n/g, ' | ')}`);
    say(`shot: ${SHOTS}/04-context-restored.png  (gameplay rubric G5)`);
    if (after?.lost !== false || (after?.restoredCount ?? 0) < 1) {
      errors.push('WebGL context was lost and never came back: ' +
        `${JSON.stringify(after)} — after a driver reset the canvas is dead until reload`);
    }
  }

  // --- the motion artefact (rubric A5) -------------------------------------------------
  // In its own recording context, after the context-loss drill, so the drill cannot land
  // in the video and the video cannot disturb the shots. A fresh page, because Playwright
  // starts recording when the context opens and this one should show a clean boot.
  try {
    const videoContext = await browser.newContext({
      viewport: VIEW,
      recordVideo: { dir: TURNTABLES, size: VIEW },
    });
    const videoPage = await videoContext.newPage();
    videoPage.on('pageerror', (e) => errors.push(`turntable: ${String(e)}`));
    await videoPage.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
    await videoPage.waitForTimeout(TURNTABLE_MS);
    const rotated = await videoPage.evaluate(() => globalThis.__dragonveinStats?.() ?? null);
    const video = videoPage.video();
    await videoContext.close();            // the file is only written on context close
    if (video) {
      await video.saveAs(TURNTABLE);
      await video.delete();                // drop Playwright's random-named original
      say(`turntable: ${TURNTABLE}  (${TURNTABLE_MS}ms of the island rotating, rubric A5)`);
      say(`turntable: stats at the end of the recording ${JSON.stringify(rotated)}`);
    } else {
      errors.push('turntable: Playwright recorded no video, so rubric A5 has no motion ' +
        'artefact and must be judged from stills again');
    }
  } catch (e) {
    errors.push(`turntable: ${e instanceof Error ? e.message : String(e)}`);
  }
  await flush();

  say(`page errors: ${errors.length}`);
  await flush();

  if (!booted || errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    say('gate:smoke OK');
  }
  await flush();
} catch (e) {
  const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
  errors.push(message);
  say(`gate:smoke CRASHED — see ${LOG}`);
  await flush();
  console.error(message);
  process.exitCode = 1;
} finally {
  server?.kill();
  await browser?.close();
}
