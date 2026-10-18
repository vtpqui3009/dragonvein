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
 *  And from a separate phone-sized session (M0e), so the 1280×720 set above is untouched:
 *    06-hud-360.png            the HUD at 360×640 — every readout inside the viewport
 *    07-context-lost-360.png   the same, with the context held lost: the status line shown
 *    08-hud-320.png            the HUD at 320×480, the narrowest width checked
 *
 *  And for rubric G6 (M0f), proof that the camera answers input:
 *    09-orbit-mouse.png        the 1280×720 page after a mouse drag right, a drag down and a wheel step
 *    10-orbit-touch.png        a hasTouch context after a one-finger drag and a pinch-out
 *
 *  And for M5a, proof that the trees sway — the same camera with the scene clock frozen
 *  (island spin, companion bob, flock), only the wind time differing:
 *    11-wind-a.png             wind time 0 s
 *    11-wind-b.png             wind time 0.8 s
 *    11-wind-diff.png          the pixels that changed between them, white on black
 *
 *  And for M5f, the dressed island at close range — a low camera on the deck, the scene
 *  clock pinned so the framing is the same every run — where the ground cover and the
 *  understory read, and lichen can be checked for z-fighting:
 *    12-island-close.png       pose CLOSE_POSE below, island spin at sceneMs 0
 *
 *  And for M8a, the save surviving a reload in real IndexedDB, each from its own context:
 *    09-save-before.png        the HUD's world clock and "saved Ns ago" just before a reload
 *    10-save-after-reload.png  the same world after it, read back from IndexedDB
 *    13-save-not-saved.png     a boot with IndexedDB blocked: the game runs and says "not saved"
 *    14-save-refused.png       a save refused for one tampered dragon: the way out on the HUD
 *    15-save-started-fresh.png after "start fresh": the readable dragons kept, the old save aside
 *    16-save-aside-refused.png a stale tab's start-fresh refused: why, and a reload (cycle 3)
 *
 *  And for M8b, the wild dragon reading the keeper, on `?test&seed=WILD_SEED`, with the
 *  island's spin pinned so the approach crosses the screen. Each shot is framed on its own
 *  subject by `__dragonveinWild.closeUp`, and its pixel size is logged beside it:
 *    17-wild-wander.png        the dragon alone, walking; the keeper far, outside the frame
 *    18-wild-alert.png         the keeper inside its notice: head up, turned to the keeper
 *    21-wild-wary.png          the keeper walking in: crouched, tail to the keeper, walking off
 *    19-wild-settle.png        the keeper near and still: calm risen, the dragon settled
 *    20-wild-flee.png          mid-takeoff after a rush: the dragon alone, altitude framed
 *  and the clip `artifacts/turntables/m8b-approach.webm`: one slow approach from far to settle,
 *  then a rush to flight, the camera tracking the pair. Before them, drills: tap-to-move under the
 *  mouse and under touch (a tap walks, a drag orbits, a double tap runs), and a reload
 *  mid-approach that must restore the dragon's state, position and calm exactly.
 *
 *  And one motion artefact, `artifacts/turntables/m0-island.webm`: rubric A5 asks whether
 *  anything pops in a scene whose whole definition of done is that it *rotates*, and
 *  three stills are weak evidence for that. The critic should be able to watch it.
 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';
import { decodePng, encodePng } from './png.mjs';

const LOG = 'artifacts/playtest.log';
const SHOTS = 'artifacts/shots';
const TURNTABLES = 'artifacts/turntables';
const TURNTABLE = `${TURNTABLES}/m0-island.webm`;
const TURNTABLE_MS = 7_000;           // long enough to see the rotation carry a full prop past
const TURNTABLE_ATTEMPTS = 2;         // one retry: the capture is a second browser context
/** M8b: the approach clip, and the world seed every wild drill plays, so each run meets the same dragon. */
const WILD_CLIP = `${TURNTABLES}/m8b-approach.webm`;
const WILD_SEED = 0x0b8b5eed;
const VIEW = { width: 1280, height: 720 };
/** The bottom of the HUD bar at 1280x720 (index.html #hud: 14 px top, ~34 px tall), plus a
 *  pixel of margin. A wild shot whose subject reaches above this is framed under the HUD. */
const HUD_BOTTOM_PX = 56;
const SILHOUETTE_SCALE = 0.25;        // rubric A1 judges the shape at 25% zoom
const LATE_SHOT_AFTER_MS = 8_500;     // rubric A5 wants ≥ 8 s of running before the diff
const CONTEXT_RESTORE_WAIT_MS = 4_000;   // the window the gameplay-critic's G5 repro used
/** Phone viewports for the HUD drill. 360×640 is the width the defect was measured at. */
const PHONES = [
  { name: '360', viewport: { width: 360, height: 640 }, shot: '06-hud-360.png' },
  { name: '320', viewport: { width: 320, height: 480 }, shot: '08-hud-320.png' },
];
/** The M0e framing, which `src/main.ts` derives the orbit's starting pose from. */
const DEFAULT_POSE = { azimuthDeg: 39.33, pitchDeg: 14.01, distance: 20.65 };
const POSE_EPSILON = 0.05;
const readPose = () => globalThis.__dragonveinCamera?.() ?? null;
const poseText = (c) => c
  ? `az ${c.azimuthDeg.toFixed(2)}° pitch ${c.pitchDeg.toFixed(2)}° dist ${c.distance.toFixed(2)}`
  : 'absent';
const HELD_LOSS_MS = 1_200;           // long enough for the first restore attempts to no-op
/** M5a criterion 2: instances of the generated broadleaf, every one wind-patched. */
const MIN_WIND_INSTANCES = 200;
/** M5a criterion 4: the two wind times photographed. */
const WIND_TIMES_S = [0, 0.8];
/** A pixel counts as changed when any channel moved by more than this (0-255). */
const WIND_DIFF_THRESHOLD = 3;
/**
 * M5f criterion 1: every kind the hero island must be dressed with. `__dragonveinStats()
 * .flora` counts instances per kind; a kind missing or at 0 fails the gate.
 */
const REQUIRED_KINDS = [
  'conifer', 'broadleaf', 'sapling', 'windtwisted', 'deadtree',     // trees
  'bush', 'fern', 'grassclump', 'flowershrub',                      // understory
  'moss', 'lichen', 'fallenleaves',                                  // ground cover
  'boulders',                                                        // rocks
];
/**
 * M5f criterion 4: the close shot. Island-local coordinates (the spin is pinned at 0, so
 * they are world coordinates too): a camera 1 unit above the deck at its south-east edge,
 * looking north-west across the columnar outcrops and the glade's edge.
 */
const CLOSE_POSE = { position: [2.4, 1.6, 5.2], target: [0.0, 0.45, 1.4], sceneMs: 0 };
/** M8a: ticks the world must have run (20 Hz) before the roster is seeded and saved. */
const SAVE_MIN_TICKS = 40;
/** M8a: reloads fired straight after a save request, each one a reload mid-save. */
const RAPID_RELOADS = 5;

/**
 * Runs in the page. Where every visible piece of the HUD sits against the viewport.
 * `clipped` lists anything whose box leaves the viewport, or whose text overflows its
 * own box — the two ways a readout stops being readable.
 */
function measureHud() {
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = hud.getBoundingClientRect();
  const clipped = [];
  const tops = new Set();
  for (const el of hud.querySelectorAll('span')) {
    if (el.closest('[hidden]')) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    if (el.parentElement === hud) tops.add(Math.round(b.top));
    if (b.left < 0 || b.top < 0 || b.right > vw + 0.5 || b.bottom > vh + 0.5
      || el.scrollWidth > el.clientWidth + 1) {
      clipped.push(`${el.id || el.className}:${el.textContent}@${b.left.toFixed(1)}-${b.right.toFixed(1)}`);
    }
  }
  return {
    innerWidth: vw, right: Math.round(r.right * 10) / 10, height: Math.round(r.height),
    overflow: hud.scrollWidth > hud.clientWidth + 1, rows: tops.size, clipped,
  };
}

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
  // And the generated trees, which arrive after boot (the GLBs load asynchronously). A
  // frame without them is not the scene M5a ships, so wait for them rather than race.
  try {
    await page.waitForFunction(
      () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0,
      undefined, { timeout: 30_000 },
    );
    await page.waitForTimeout(500);   // one more frame or two, with the trees drawn
  } catch {
    errors.push('the generated broadleaf never appeared: __dragonveinStats().windInstances stayed 0');
  }
  const wide = await page.screenshot({ path: `${SHOTS}/01-wide.png` });
  say(`shot: ${SHOTS}/01-wide.png  (t+${Date.now() - loadedAt}ms)`);
  // M5f criterion 1: the generated set dresses the hero island, kind by kind.
  {
    const flora = await page.evaluate(() => globalThis.__dragonveinStats?.().flora ?? null);
    say(`flora (hero island instances per kind): ${JSON.stringify(flora)}`);
    const missing = REQUIRED_KINDS.filter((k) => !((flora?.[k] ?? 0) > 0));
    if (missing.length) errors.push(`flora: no instances of ${missing.join(', ')} on the hero island`);
  }
  // M0e made the HUD wrap. At desktop width it must not: 01-wide is the frame the
  // art-critic scores, and a second HUD row would change it.
  // M0f: no input has happened, so the camera must still be at the framing M0d was scored
  // on. If the orbit drifted the pose by itself, 01-wide would no longer be that frame.
  const widePose = await page.evaluate(readPose);
  say(`camera @01-wide: ${poseText(widePose)}`);
  if (!widePose || Math.abs(widePose.azimuthDeg - DEFAULT_POSE.azimuthDeg) > POSE_EPSILON
    || Math.abs(widePose.pitchDeg - DEFAULT_POSE.pitchDeg) > POSE_EPSILON
    || Math.abs(widePose.distance - DEFAULT_POSE.distance) > POSE_EPSILON) {
    errors.push(`camera is not at the default framing before any input: ${JSON.stringify(widePose)}`);
  }
  const desktopHud = await page.evaluate(measureHud);
  say(`hud @1280: ${JSON.stringify(desktopHud)}`);
  if (desktopHud?.rows !== 1 || desktopHud.clipped.length) {
    errors.push(`hud @1280 is not a single unclipped row: ${JSON.stringify(desktopHud)}`);
  }

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

  // --- the trees sway (M5a criteria 2 and 4) -----------------------------------------
  /*
   * The art-probe's ambient-motion line cannot isolate sway: the island spins and the
   * satellites bob, so every frame differs from the last anyway. So the page's own clock
   * is frozen for this — spin, bob and flock held at one instant by
   * `__dragonveinWind.freeze` — and only the wind time is moved, 0 s then 0.8 s. With the
   * camera at its default pose and nothing else moving, the pixels that change between
   * the two shots are the pixels the wind moved, and a count of zero means the vertex
   * shader is not swaying anything.
   */
  {
    const windInstances = await page.evaluate(
      () => globalThis.__dragonveinStats?.().windInstances ?? 0);
    say(`wind: windInstances ${windInstances} (want >= ${MIN_WIND_INSTANCES})`);
    if (windInstances < MIN_WIND_INSTANCES) {
      errors.push(`wind: only ${windInstances} wind-patched tree instances, want >= ${MIN_WIND_INSTANCES}`);
    }
    const hasHook = await page.evaluate(() => Boolean(globalThis.__dragonveinWind));
    if (!hasHook) {
      errors.push('wind: the page exposes no __dragonveinWind hook, so sway cannot be isolated');
    } else {
      const framesNow = () => page.evaluate(() => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);
      const shots = [];
      for (const [k, t] of WIND_TIMES_S.entries()) {
        await page.evaluate((sec) => globalThis.__dragonveinWind?.freeze(sec), t);
        // Two whole frames past the change, so the canvas holds a frame drawn with it.
        const f0 = await framesNow();
        await page.waitForFunction(
          (f) => (globalThis.__dragonveinPerf?.read().framesRendered ?? 0) >= f + 2,
          f0, { timeout: 15_000 },
        );
        const file = `${SHOTS}/11-wind-${k === 0 ? 'a' : 'b'}.png`;
        await page.screenshot({ path: file });
        shots.push(file);
        say(`shot: ${file}  (scene clock frozen, wind time ${t} s, M5a criterion 4)`);
      }
      // The HUD is DOM over the canvas and its FPS readout repaints on a timer, so it is
      // cut out of the comparison: what is counted is the scene, nothing else. The page
      // runs at deviceScaleFactor 1, so CSS pixels are image pixels.
      const hudBox = await page.evaluate(() => {
        const r = document.getElementById('hud')?.getBoundingClientRect();
        return r ? { x0: r.left - 2, y0: r.top - 2, x1: r.right + 2, y1: r.bottom + 2 } : null;
      });
      await page.evaluate(() => globalThis.__dragonveinWind?.release());

      const [a, b] = shots.map((f) => decodePng(f));
      let changed = 0, foliage = 0;
      let x0 = a.w, y0 = a.h, x1 = -1, y1 = -1;
      const mask = new Uint8Array(a.w * a.h * 3);
      for (let i = 0; i < a.w * a.h; i++) {
        if (hudBox) {
          const hx = i % a.w, hy = Math.floor(i / a.w);
          if (hx >= hudBox.x0 && hx <= hudBox.x1 && hy >= hudBox.y0 && hy <= hudBox.y1) continue;
        }
        const ra = a.px[i * 3], ga = a.px[i * 3 + 1], ba = a.px[i * 3 + 2];
        const d = Math.max(Math.abs(ra - b.px[i * 3]), Math.abs(ga - b.px[i * 3 + 1]),
          Math.abs(ba - b.px[i * 3 + 2]));
        if (d <= WIND_DIFF_THRESHOLD) continue;
        changed++;
        // Foliage-coloured in either frame: green leads both red and blue.
        const gb = b.px[i * 3 + 1];
        if ((ga > ra && ga > ba) || (gb > b.px[i * 3] && gb > b.px[i * 3 + 2])) foliage++;
        mask[i * 3] = mask[i * 3 + 1] = mask[i * 3 + 2] = 255;
        const x = i % a.w, y = Math.floor(i / a.w);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      await writeFile(`${SHOTS}/11-wind-diff.png`, encodePng(a.w, a.h, mask));
      say(`wind: changed pixels between 11-wind-a and 11-wind-b: ${changed} ` +
        `(any channel > ${WIND_DIFF_THRESHOLD}/255; ${a.w * a.h} px in frame; HUD box ` +
        `${hudBox ? `x${Math.round(hudBox.x0)}-${Math.round(hudBox.x1)} y${Math.round(hudBox.y0)}-` +
          `${Math.round(hudBox.y1)} excluded` : 'not found, nothing excluded'})`);
      say(`wind: changed-pixel bbox ${changed ? `x${x0}-${x1} y${y0}-${y1}` : 'none'}; ` +
        `${changed ? ((100 * foliage) / changed).toFixed(1) : '0.0'}% of them foliage-coloured ` +
        `(green leads red and blue in either frame)`);
      say(`shot: ${SHOTS}/11-wind-diff.png  (the changed pixels, white on black)`);
      if (changed === 0) {
        errors.push('wind: 11-wind-a and 11-wind-b are identical — nothing swayed between ' +
          'wind times 0 s and 0.8 s with the scene clock frozen');
      }
    }
  }
  await flush();

  // --- the dressed island up close (M5f criterion 4) ----------------------------------
  {
    const hasHook = await page.evaluate(() => Boolean(globalThis.__dragonveinShot));
    if (!hasHook) {
      errors.push('close shot: the page exposes no __dragonveinShot hook');
    } else {
      await page.evaluate((p) => globalThis.__dragonveinShot?.pose(p.position, p.target, p.sceneMs), CLOSE_POSE);
      const f0 = await page.evaluate(() => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);
      await page.waitForFunction(
        (f) => (globalThis.__dragonveinPerf?.read().framesRendered ?? 0) >= f + 2,
        f0, { timeout: 30_000 },
      );
      await page.screenshot({ path: `${SHOTS}/12-island-close.png` });
      await page.evaluate(() => globalThis.__dragonveinShot?.release());
      say(`shot: ${SHOTS}/12-island-close.png  (camera ${JSON.stringify(CLOSE_POSE.position)} -> ` +
        `${JSON.stringify(CLOSE_POSE.target)}, island spin pinned at sceneMs ${CLOSE_POSE.sceneMs}; M5f criterion 4)`);
    }
  }
  await flush();

  // --- the same frame with the shadow pass off (rubric A3, rubric P6) -----------------
  // `?tier=potato` is the only switch in the build that turns the shadow map off, and at
  // deviceScaleFactor 1 — which is what this browser runs at — it is the *only* thing it
  // changes about the image (`src/main.ts` POTATO: pixel ratio, `shadowMap.enabled`,
  // `sun.castShadow`, and the tier label in the readout). So 01-wide minus 05-potato is
  // exactly the contribution of the shadow pass, with nothing else moving.
  //
  // That differential is what `tools/art-probe.mjs` reads for A3. It exists because the
  // in-frame tests kept lying: counting dark grass pixels scored 26% on a frame the
  // art-critic had called shadowless, and an Otsu split of the grass returned the same
  // 0.23 whether the shadow map was on or off, because on a dressed deck most dark green
  // pixels are bushes. Subtracting two renders cannot be fooled that way.
  //
  // It is also the first artefact for rubric P6: the Potato tier had a number from
  // `gate:perf` and no picture anyone could look at.
  const potato = await browser.newPage({ viewport: VIEW });
  potato.on('pageerror', (e) => errors.push(`potato: ${String(e)}`));
  await potato.goto(`${preview.url}?tier=potato`, { waitUntil: 'load', timeout: 30_000 });
  await potato.waitForTimeout(3000);
  // The flora arrives after boot (async GLBs). A potato frame taken before it is not the
  // frame 01-wide shows, and the A3 differential between the two would count every plant
  // as "shadow". Wait for it, as 01-wide does.
  try {
    await potato.waitForFunction(
      () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
    await potato.waitForTimeout(500);
  } catch {
    errors.push('potato: the generated flora never appeared, so 05-potato is not the 01-wide frame');
  }
  await potato.screenshot({ path: `${SHOTS}/05-potato.png` });
  const potatoTier = await potato.evaluate(
    () => globalThis.__dragonveinPerf?.read().tier ?? null);
  await potato.close();
  say(`shot: ${SHOTS}/05-potato.png  (?tier=potato — same frame, shadow pass off; ` +
    `rubric A3 differential and rubric P6)`);
  say(`potato tier: ${JSON.stringify(potatoTier)}`);
  if (potatoTier?.shadows !== false) {
    errors.push('05-potato.png was taken with shadows still on, so the A3 differential ' +
      `is meaningless: ${JSON.stringify(potatoTier)}`);
  }
  await flush();

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

  // --- the camera answers the mouse (rubric G6, M0f) -----------------------------------
  /*
   * Until M0f this drill could only show that input did not crash anything; the
   * gameplay-critic held G6 at 0.5-0.8 because "nothing listens to it". Now each gesture
   * has to *move the camera* by a stated amount, read from `__dragonveinCamera()`. The
   * island auto-rotates, so the frame always changes, which is why the pose is read
   * rather than the pixels.
   */
  const errorsBeforeInput = errors.length;
  const box = await page.locator('#c').boundingBox();
  if (!box) {
    errors.push('input: the canvas has no bounding box, so no pointer event can reach it');
  } else {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const drag = async (dx, dy) => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    const p0 = await page.evaluate(readPose);
    await drag(160, 0);
    const p1 = await page.evaluate(readPose);
    await drag(0, 50);
    const p2 = await page.evaluate(readPose);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(300);
    const p3 = await page.evaluate(readPose);
    const framesBefore = await page.evaluate(
      () => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/09-orbit-mouse.png` });
    const framesAfter = await page.evaluate(
      () => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);
    say(`input: mouse drag 160px right   ${poseText(p0)} -> ${poseText(p1)}`);
    say(`input: mouse drag 50px down     -> ${poseText(p2)}`);
    say(`input: mouse wheel +120 (down)  -> ${poseText(p3)}`);
    say(`shot: ${SHOTS}/09-orbit-mouse.png  (rubric G6, M0f AC1)`);
    if (!p0 || !p1 || Math.abs(p1.azimuthDeg - p0.azimuthDeg) < 10) {
      errors.push(`G6: a 160 px mouse drag moved the azimuth < 10°: ${poseText(p0)} -> ${poseText(p1)}`);
    }
    if (!p1 || !p2 || Math.abs(p2.pitchDeg - p1.pitchDeg) < 1) {
      errors.push(`G6: a vertical mouse drag did not change the pitch: ${poseText(p1)} -> ${poseText(p2)}`);
    }
    if (!p2 || !p3 || !(p3.distance > p2.distance)) {
      errors.push(`G6: wheel down did not move the camera away: ${poseText(p2)} -> ${poseText(p3)}`);
    }
    if (framesAfter <= framesBefore) errors.push('the frame loop stopped advancing after mouse input');

    // AC4: clamps under abuse. A drag far past every limit, then a wheel flood each way.
    await drag(4000, 2000);
    const hi = await page.evaluate(readPose);
    await drag(-8000, -4000);
    const lo = await page.evaluate(readPose);
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
    const near = await page.evaluate(readPose);
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    const far = await page.evaluate(readPose);
    say(`input: clamps — extreme drag ${poseText(hi)} / ${poseText(lo)}; ` +
      `wheel flood ${poseText(near)} / ${poseText(far)}`);
    const L = hi?.limits;
    const inside = (c) => c && L
      && c.azimuthDeg >= L.azimuthMinDeg - 1e-6 && c.azimuthDeg <= L.azimuthMaxDeg + 1e-6
      && c.pitchDeg >= L.pitchMinDeg - 1e-6 && c.pitchDeg <= L.pitchMaxDeg + 1e-6
      && c.distance >= L.distanceMin - 1e-6 && c.distance <= L.distanceMax + 1e-6;
    if (![hi, lo, near, far].every(inside) || L.pitchMinDeg <= 0) {
      errors.push(`G6: the orbit left its limits under extreme input: ${JSON.stringify({ hi, lo, near, far })}`);
    }
    if (near && far && !(near.distance === L?.distanceMin && far.distance === L?.distanceMax)) {
      errors.push(`G6: a wheel flood did not reach the distance limits: ${poseText(near)} / ${poseText(far)}`);
    }
    const newErrors = errors.length - errorsBeforeInput;
    say(`input: mouse drill — ${newErrors} new error(s)`);
  }
  await flush();

  // --- the motion artefact (rubric A5) -------------------------------------------------
  // Recorded **after the main page is closed**, with nothing else holding a WebGL
  // context. The first version opened the recording page beside the live one and
  // Playwright came back with "Page did not produce any video frames" on 4 of 9 runs:
  // three concurrent SwiftShader contexts (main page, capture page, shadow pass) starve
  // each other, and that made AC1 — `npm run gates` exits 0 — a coin flip. A gate that
  // fails at random is worse than no gate.
  await page.close();

  // The touch half of G6, now that the main page has let go of its context.
  /*
   * Playwright's `touchscreen` can only tap, and a tap is not a gesture this game has. So
   * the drag and the pinch go through CDP `Input.dispatchTouchEvent`, which is what a
   * real finger produces, and Chromium turns into the pointer events the orbit reads.
   */
  {
    const touchContext = await browser.newContext({
      viewport: VIEW, hasTouch: true, isMobile: true,
    });
    const touchPage = await touchContext.newPage();
    const touchErrors = [];
    touchPage.on('pageerror', (e) => touchErrors.push(String(e)));
    try {
      await touchPage.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
      await touchPage.waitForFunction(
        () => (globalThis.__dragonveinStats?.().drawCalls ?? 0) > 0,
        undefined, { timeout: 30_000 },
      );
      const cdp = await touchContext.newCDPSession(touchPage);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      const steps = 10;

      const t0 = await touchPage.evaluate(readPose);
      const framesBefore = await touchPage.evaluate(
        () => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);
      await touch('touchStart', [[cx, cy]]);
      for (let i = 1; i <= steps; i++) await touch('touchMove', [[cx - 16 * i, cy]]);
      await touch('touchEnd', []);
      await touchPage.waitForTimeout(300);
      const t1 = await touchPage.evaluate(readPose);

      // Pinch-out: two fingers from 60 px apart to 300 px apart, about the centre.
      await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', [[cx - 30 - 12 * i, cy], [cx + 30 + 12 * i, cy]]);
      }
      await touch('touchEnd', []);
      await touchPage.waitForTimeout(600);
      const t2 = await touchPage.evaluate(readPose);
      const scale = await touchPage.evaluate(() => window.visualViewport?.scale ?? 1);
      await touchPage.screenshot({ path: `${SHOTS}/10-orbit-touch.png` });
      const framesAfter = await touchPage.evaluate(
        () => globalThis.__dragonveinPerf?.read().framesRendered ?? 0);

      say(`input: touch drag 160px left    ${poseText(t0)} -> ${poseText(t1)}`);
      say(`input: touch pinch-out 60->300px -> ${poseText(t2)}; page zoom ${scale}`);
      say(`input: touch — ${touchErrors.length} page error(s), frames ${framesBefore} -> ` +
        `${framesAfter} (${framesAfter > framesBefore ? 'loop still running' : 'LOOP STALLED'})`);
      say(`shot: ${SHOTS}/10-orbit-touch.png  (rubric G6, M0f AC3)`);
      if (!t0 || !t1 || Math.abs(t1.azimuthDeg - t0.azimuthDeg) < 10) {
        errors.push(`G6: a one-finger drag moved the azimuth < 10°: ${poseText(t0)} -> ${poseText(t1)}`);
      }
      if (!t1 || !t2 || !(t2.distance < t1.distance - 1)) {
        errors.push(`G6: a pinch-out did not bring the camera closer: ${poseText(t1)} -> ${poseText(t2)}`);
      }
      if (scale !== 1) errors.push(`G6: the pinch zoomed the page (visualViewport.scale ${scale})`);
      if (framesAfter <= framesBefore) errors.push('the frame loop stopped advancing after touch input');
      for (const e of touchErrors) errors.push(`touch: ${e}`);
    } catch (e) {
      errors.push(`touch drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await touchContext.close();
    }
  }
  await flush();

  // --- the HUD at phone width, and the context-loss line on it (M0e) -----------------
  /*
   * Measured before M0e: the HUD was a 512 px non-wrapping row, `right = 527.6` against a
   * 360 px viewport. What fell off the edge was the context-loss status line, so on a
   * phone a driver reset read as an unexplained black screen. Each phone runs in its own
   * context after the main page has gone, for the same SwiftShader starvation reason the
   * touch drill and turntable do.
   */
  for (const phone of PHONES) {
    const ctx = await browser.newContext({
      viewport: phone.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`hud ${phone.name}: ${String(e)}`));
    try {
      await p.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().drawCalls ?? 0) > 0,
        undefined, { timeout: 30_000 },
      );
      await p.waitForTimeout(800);     // past the boot splash's 0.5 s fade
      const fit = await p.evaluate(measureHud);
      await p.screenshot({ path: `${SHOTS}/${phone.shot}` });
      say(`hud @${phone.name}: ${JSON.stringify(fit)}`);
      say(`shot: ${SHOTS}/${phone.shot}  (${phone.viewport.width}x${phone.viewport.height}, M0e AC1)`);
      if (!fit || fit.right > fit.innerWidth || fit.overflow || fit.clipped.length) {
        errors.push(`hud @${phone.name} does not fit the viewport: ${JSON.stringify(fit)}`);
      }
      if (phone.name !== '360') continue;

      // Hold the context lost long enough to photograph it. The page restores through
      // the `WEBGL_lose_context` handle it took at boot, and `getExtension` hands back
      // that same object, so stubbing its `restoreContext` keeps the loss in place;
      // putting the original back and calling it is then the driver coming back.
      // A listener added now runs after the page's own `webglcontextrestored` handler,
      // so what it reads is exactly what a gate polling in that gap would see (AC3).
      await p.evaluate(() => {
        const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
        const ext = c.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        if (!ext) return;
        const g = /** @type {any} */ (globalThis);
        g.__m0eRestore = ext.restoreContext.bind(ext);
        ext.restoreContext = () => {};
        c.addEventListener('webglcontextrestored', () => {
          g.__m0eGap = globalThis.__dragonveinStats?.() ?? 'absent';
        }, { once: true });
        ext.loseContext();
      });
      await p.waitForTimeout(HELD_LOSS_MS);
      const lost = await p.evaluate(() => {
        const st = document.getElementById('hud-status');
        const b = st?.getBoundingClientRect();
        return {
          shown: Boolean(st && !st.hidden && b && b.width > 0 && b.height > 0),
          text: st?.textContent ?? '',
          left: b?.left ?? null, right: b?.right ?? null, bottom: b?.bottom ?? null,
          innerWidth: window.innerWidth, innerHeight: window.innerHeight,
          stats: globalThis.__dragonveinStats?.() ?? null,
        };
      });
      const lostFit = await p.evaluate(measureHud);
      await p.screenshot({ path: `${SHOTS}/07-context-lost-360.png` });
      say(`context held lost @360: ${JSON.stringify(lost)}`);
      say(`hud @360 while lost: ${JSON.stringify(lostFit)}`);
      say(`shot: ${SHOTS}/07-context-lost-360.png  (M0e AC2)`);
      if (!lost.shown || !lost.text || lost.left === null || lost.left < 0
        || lost.right > lost.innerWidth || lost.bottom > lost.innerHeight
        || !lostFit || lostFit.clipped.length || lostFit.overflow) {
        errors.push(`context-loss line is not fully visible at 360 px: ${JSON.stringify(lost)} ` +
          `${JSON.stringify(lostFit)}`);
      }

      await p.evaluate(() => /** @type {any} */ (globalThis).__m0eRestore?.());
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().drawCalls ?? 0) > 0,
        undefined, { timeout: 15_000 },
      );
      const gap = await p.evaluate(() => /** @type {any} */ (globalThis).__m0eGap ?? null);
      const firstDrawn = await p.evaluate(() => globalThis.__dragonveinStats?.() ?? null);
      say(`stats in the restore gap: ${JSON.stringify(gap)}`);
      say(`stats after the first restored frame: ${JSON.stringify(firstDrawn)}`);
      const gapHonest = gap && typeof gap === 'object' && gap.contextLost === false
        && gap.drawCalls === null && gap.triangles === null
        && gap.frameMs === null && gap.cpuFrameMs === null;
      if (!gapHonest) {
        errors.push('__dragonveinStats() reported a frame between webglcontextrestored and ' +
          `the first restored frame: ${JSON.stringify(gap)} (M0e AC3)`);
      }
    } catch (e) {
      errors.push(`hud ${phone.name} drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  // --- the world survives a reload, in real IndexedDB (M8a criterion 3) ---------------
  /*
   * Its own browser context, so its IndexedDB starts empty and outlives `reload()`. `?test`
   * turns on `__dragonveinSave`, which seeds a roster (two wild dragons and their bred
   * child) and reads the world back as JSON. Then, in order: a plain reload; reloads fired
   * straight after a save request, so the reload lands mid-save; and a second tab on the
   * same database. Each must leave the roster exactly as saved.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const saveErrors = [];
    const watch = (pg, tag) => {
      pg.on('pageerror', (e) => saveErrors.push(`${tag}: ${String(e)}`));
      pg.on('console', (m) => { if (m.type() === 'error') saveErrors.push(`${tag}: ${m.text()}`); });
    };
    const url = `${preview.url}?test`;
    // A same-origin page that is not the game, for holding the store from "another tab".
    const blank = new URL('__blank.html', preview.url).href;
    await ctx.route(blank, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    const drawn = (pg) => pg.waitForFunction(
      () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
    const ready = (pg) => pg.evaluate(() => globalThis.__dragonveinSave?.ready() ?? null);
    const savedState = (pg) => pg.waitForFunction(
      () => globalThis.__dragonveinSave?.read().state === 'saved', undefined, { timeout: 15_000 });
    const brief = (w) => (w
      ? `seed ${w.seed} tick ${w.tick} rng [${w.rng.join(',')}] roster ${w.roster.map((d) =>
        `#${d.id}:${d.genome.gid}${d.genome.generation > 0 ? `(bred ${d.genome.lineage})` : ''}`).join(' ')}`
      : 'no world');
    const hudLine = (r) => `"world ${r.hud.clock} | dragons ${r.hud.roster} | ${r.hud.save}${r.hud.note ? ` | ${r.hud.note}` : ''}"`;
    /**
     * Seed, roster and Rng deep-equal, tick not behind: the criterion, as a list of what broke.
     *
     * A world that ran on between the two reads (an autosave or the `pagehide` save landing a
     * later tick than the one read) is held to more, not less: `a` is stepped on, in the page,
     * to `b`'s tick (`__dragonveinSave.replay`), and the whole of the result must equal `b`. The
     * sim is deterministic, so a world that survived the reload is exactly the one that would
     * have been reached without it. Until M8b the Rng moved only on roster changes, so equal
     * words were enough; from M8b the island's wild dragon draws from it as time passes.
     */
    const diff = async (a, b, pg) => {
      const out = [];
      if (!a || !b) return ['a world is missing'];
      if (!(b.tick >= a.tick)) return [`tick went back ${a.tick} -> ${b.tick}`];
      const ran = b.tick > a.tick ? await pg.evaluate(([w, t]) => globalThis.__dragonveinSave.replay(w, t), [a, b.tick]) : a;
      if (ran.seed !== b.seed) out.push(`seed ${a.seed} -> ${b.seed}`);
      if (JSON.stringify(ran.roster) !== JSON.stringify(b.roster)) out.push('roster differs');
      if (JSON.stringify(ran.rng) !== JSON.stringify(b.rng)) {
        out.push(`rng [${ran.rng}]${b.tick > a.tick ? ` (run on from tick ${a.tick} to ${b.tick})` : ''} -> [${b.rng}]`);
      }
      if (JSON.stringify(ran) !== JSON.stringify(b)) out.push('the world differs from the saved one run on to its tick');
      return out;
    };
    try {
      const p = await ctx.newPage();
      watch(p, 'save tab 1');
      await p.goto(url, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await ready(p);
      if (!r0) throw new Error('the page exposes no __dragonveinSave hook under ?test');
      say(`save: first boot — ${r0.report?.source} (${r0.report?.detail}), state ${r0.state}; first frame at ` +
        `${r0.bootMs.toFixed(0)} ms, world ready at ${r0.worldReadyMs.toFixed(0)} ms after navigation ` +
        `(${r0.worldReadyMs > r0.bootMs ? 'after' : 'before'} the first frame, which does not wait for it)`);
      await p.waitForFunction((n) => (globalThis.__dragonveinSave?.read().world?.tick ?? 0) >= n,
        SAVE_MIN_TICKS, { timeout: 30_000 });
      const seeded = await p.evaluate(() => globalThis.__dragonveinSave.seedRoster());
      const bred = seeded.world?.roster.filter((d) => d.genome.generation > 0) ?? [];
      if (seeded.state !== 'saved' || (seeded.world?.roster.length ?? 0) < 3 || bred.length < 1) {
        errors.push(`save: seeding did not give a saved roster of >= 3 with one bred: ${seeded.state} ${brief(seeded.world)}`);
      }
      await drawn(p);
      await p.waitForTimeout(1300);    // the readout ticks to "saved 1s ago": the clock is live
      const beforeHud = await p.evaluate(() => globalThis.__dragonveinSave.read());
      await p.screenshot({ path: `${SHOTS}/09-save-before.png` });
      // Saved after the shot, so the world compared below is at least as late as the frame.
      const before = await p.evaluate(() => globalThis.__dragonveinSave.save());
      say(`save: before reload — ${brief(before.world)}; gen ${before.gen}; HUD in 09 ${hudLine(beforeHud)}`);
      say(`shot: ${SHOTS}/09-save-before.png  (M8a criterion 5)`);

      await p.reload({ waitUntil: 'load', timeout: 30_000 });
      const after = await ready(p);
      await savedState(p);
      await drawn(p);
      await p.waitForTimeout(1300);    // as 09: "saved 1s ago", the clock running on from the save
      const afterHud = await p.evaluate(() => globalThis.__dragonveinSave.read());
      await p.screenshot({ path: `${SHOTS}/10-save-after-reload.png` });
      const broke = await diff(before.world, after?.world, p);
      say(`save: after reload  — ${brief(after?.world)}; loaded ${after?.report?.source} gen ` +
        `${after?.report?.gen} (${after?.report?.detail}); HUD in 10 ${hudLine(afterHud)}`);
      if (afterHud.hud.roster !== String(before.world.roster.length)) {
        errors.push(`save: the HUD after reload shows ${afterHud.hud.roster} dragons, want ${before.world.roster.length}`);
      }
      say(`save: round trip ${broke.length ? `FAILED — ${broke.join('; ')}` : 'OK — seed, roster ' +
        `(${before.world.roster.length} genomes, ${bred.length} bred) and Rng state deep-equal; tick ` +
        `${before.world.tick} -> ${after.world.tick}`}`);
      say(`shot: ${SHOTS}/10-save-after-reload.png  (M8a criterion 5)`);
      if (broke.length) errors.push(`save: the world did not survive a reload: ${broke.join('; ')}`);
      // 'journal' is the normal case on a reload: the pagehide save is journalled, and its
      // IndexedDB write dies with the page (Chromium aborts it), so the next load promotes it.
      if (!['loaded', 'journal'].includes(after?.report?.source)) {
        errors.push(`save: the reload did not load the save: ${JSON.stringify(after?.report)}`);
      }
      // And IndexedDB itself holds the world once the boot save has landed: read it directly.
      {
        const stored = await p.evaluate(() => new Promise((resolve) => {
          const q = indexedDB.open('dragonvein');
          q.onsuccess = () => {
            const g = q.result.transaction('save', 'readonly').objectStore('save').get('main');
            g.onsuccess = () => { q.result.close(); resolve(g.result ?? null); };
          };
        }));
        const w = stored ? JSON.parse(stored.text).world : null;
        const same = w && JSON.stringify(w.roster) === JSON.stringify(before.world.roster) && w.seed === before.world.seed;
        say(`save: IndexedDB 'main' read directly after the reload — gen ${stored?.gen}, writer ${stored?.writer}, ` +
          `${w?.roster.length} dragons, ${same ? 'roster and seed equal to the saved world' : 'DIFFERENT from the saved world'}`);
        if (!same) errors.push('save: IndexedDB does not hold the saved world after the reload');
      }

      // Timing (perf-critic, cycle 1): what a save costs, and how much of it is main thread.
      {
        const st = (await p.evaluate(() => globalThis.__dragonveinSave.read())).saveStats;
        const l = st.last;
        say(`save: saveMs — ${st.count} save(s) on this page; last ${l?.bytes} B: serialise ${l?.serialiseMs.toFixed(2)} ` +
          `+ journal ${l?.journalMs.toFixed(2)} + put ${l?.putMs.toFixed(2)} ms on the main thread, ` +
          `${l?.roundTripMs.toFixed(1)} ms to complete; worst main-thread ${st.maxMainThreadMs.toFixed(2)} ms`);
      }

      // Cycle 2, D1: the gameplay critic's repro. Another tab holds a readwrite transaction
      // on the store for 2.5 s; the game asks for a save and seeds the roster (which saves),
      // and the page reloads 300 ms later — before either write can start. Chromium aborts a
      // transaction still waiting when its page goes, so only the journal can carry them.
      let last = after.world;
      {
        const holder = await ctx.newPage();
        watch(holder, 'lock holder');
        await holder.goto(blank, { waitUntil: 'load' });
        await holder.evaluate(() => new Promise((started) => {
          const q = indexedDB.open('dragonvein');
          q.onsuccess = () => {
            const db = q.result;
            const tx = db.transaction('save', 'readwrite');
            const os = tx.objectStore('save');
            const end = performance.now() + 2500;
            const spin = () => { if (performance.now() < end) os.get('main').onsuccess = spin; };
            spin();
            tx.oncomplete = () => db.close();
            started(true);
          };
        }));
        const rosterBefore = last.roster.length;
        await p.evaluate(() => {
          void globalThis.__dragonveinSave.save();
          void globalThis.__dragonveinSave.seedRoster();
        });
        await p.waitForTimeout(300);
        const mid = await p.evaluate(() => globalThis.__dragonveinSave.read());
        await p.reload({ waitUntil: 'load', timeout: 30_000 });
        const r = await ready(p);
        await drawn(p);
        await savedState(p);
        await holder.close();
        const n = r?.world?.roster.length ?? 0;
        const bredNow = r?.world?.roster.filter((d) => d.genome.generation > 0).length ?? 0;
        say(`save: reload with the store held by another tab — before the reload ${mid.world.roster.length} dragons, ` +
          `${mid.writes} write(s) landed, state ${mid.state}; after it ${n} dragons (${bredNow} bred), loaded from ` +
          `${r?.report?.source} (${r?.report?.detail})`);
        if (n !== rosterBefore + 3 || JSON.stringify(r?.world?.roster) !== JSON.stringify(mid.world.roster)) {
          errors.push(`save: a reload behind a held store lost the roster: ${rosterBefore} + 3 seeded, ${n} after reload`);
        }
        last = r?.world ?? last;
      }

      // Reloads mid-save: ask for a save and reload without waiting for it.
      const rapid = [];
      for (let i = 0; i < RAPID_RELOADS; i++) {
        await p.evaluate(() => { void globalThis.__dragonveinSave.save(); });
        await p.reload({ waitUntil: 'load', timeout: 30_000 });
        const r = await ready(p);
        // The next reload waits for the scene's assets, so what it interrupts is the save,
        // not a GLB fetch (an aborted fetch logs its own error, which is not this drill's).
        await drawn(p);
        const bad = await diff(last, r?.world, p);
        rapid.push(`${r?.report?.source}@gen${r?.report?.gen}/tick${r?.world?.tick}${bad.length ? ` BROKE(${bad.join('; ')})` : ''}`);
        if (bad.length || !['loaded', 'journal'].includes(r?.report?.source)) {
          errors.push(`save: reload ${i + 1} mid-save lost state: ${bad.join('; ')} ${JSON.stringify(r?.report)}`);
        }
        last = r?.world ?? last;
      }
      await savedState(p);
      say(`save: ${RAPID_RELOADS} reloads fired straight after a save request: ${rapid.join(', ')}`);

      // A second tab on the same database. Its boot save claims the slot — unless tab 1's
      // autosave lands first, in which case tab 2's claim is refused. Either way exactly one
      // tab may keep saving, the other must say it is not, and the stale one must never
      // overwrite the live one's record.
      const p2 = await ctx.newPage();
      watch(p2, 'save tab 2');
      await p2.goto(url, { waitUntil: 'load', timeout: 30_000 });
      const t2 = await ready(p2);
      await p2.waitForFunction(() => ['saved', 'conflict'].includes(globalThis.__dragonveinSave?.read().state ?? ''),
        undefined, { timeout: 15_000 });
      const stateOf = (pg) => pg.evaluate(() => globalThis.__dragonveinSave.read());
      const stale = async () => {
        const [s1, s2] = [await stateOf(p), await stateOf(p2)];
        return s1.state === 'conflict' ? { live: p2, dead: p, liveName: 'tab 2', deadR: s1 }
          : s2.state === 'conflict' ? { live: p, dead: p2, liveName: 'tab 1', deadR: s2 } : null;
      };
      let split = null;
      for (let i = 0; i < 30 && !split; i++) { split = await stale(); if (!split) await p.waitForTimeout(100); }
      const t2diff = await diff(last, t2?.world, p2);
      if (t2diff.length) errors.push(`save: tab 2 did not load tab 1's world: ${t2diff.join('; ')}`);
      if (!split) {
        const [s1, s2] = [await stateOf(p), await stateOf(p2)];
        errors.push(`save: two tabs are both saving: tab 1 ${s1.state} gen ${s1.gen}, tab 2 ${s2.state} gen ${s2.gen}`);
      } else {
        const liveR = await split.live.evaluate(() => globalThis.__dragonveinSave.save());
        const deadR = await split.dead.evaluate(() => globalThis.__dragonveinSave.save());
        say(`save: two tabs — tab 2 loaded ${t2?.report?.source} gen ${t2?.report?.gen}; ${split.liveName} keeps ` +
          `the slot (${liveR.state}, gen ${liveR.gen}); the other is ${deadR.state} (${deadR.detail}), HUD ${hudLine(deadR)}`);
        if (liveR.state !== 'saved') errors.push(`save: the live tab could not save: ${liveR.state} ${liveR.detail}`);
        // Cycle 2, D4: the stale tab is paused — its clock stops and it refuses world changes.
        const tickA = (await stateOf(split.dead)).world.tick;
        await split.dead.waitForTimeout(1000);
        const tried = await split.dead.evaluate(() => globalThis.__dragonveinSave.seedRoster());
        say(`save: the stale tab is paused — tick ${tickA} -> ${tried.world.tick} over 1 s, a roster change ` +
          `${tried.changed ? 'ACCEPTED' : 'refused'} (${tried.world.roster.length} dragons), HUD ${hudLine(tried)} ` +
          `[${tried.hud.actions.join(' | ')}]`);
        if (tried.world.tick !== tickA || tried.changed || !tried.paused || !tried.hud.actions.includes('reload')) {
          errors.push(`save: the stale tab is not paused: tick ${tickA} -> ${tried.world.tick}, changed ${tried.changed}`);
        }
        // The stale tab goes away (its pagehide save must be refused), then the live tab's
        // record must still be there: a reload of the live tab reads its own gen back.
        await split.dead.close({ runBeforeUnload: true });
        await split.live.reload({ waitUntil: 'load', timeout: 30_000 });
        const back = await ready(split.live);
        say(`save: stale tab closed; ${split.liveName} reloaded ${back?.report?.source} gen ${back?.report?.gen} ` +
          `(want ${liveR.gen}), roster ${back?.world?.roster.length}`);
        if (back?.report?.gen !== liveR.gen || (await diff(last, back?.world, split.live)).length) {
          errors.push(`save: the stale tab overwrote the live one: gen ${back?.report?.gen} vs ${liveR.gen}; ${(await diff(last, back?.world, split.live)).join('; ')}`);
        }
      }
    } catch (e) {
      errors.push(`save drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
    say(`save: ${saveErrors.length} page error(s) across the drill`);
    errors.push(...saveErrors);
  }
  await flush();

  // --- a refused save has a way out (cycle 2, D2) and a closed store reopens (D3) --------
  /*
   * A save whose first dragon has a tampered allele (its gid no longer matches) is written
   * as if by another writer, so the running page cannot save over it, and the page reloads.
   * The game must refuse it, offer to export it and to start fresh with the readable
   * dragons, move it byte-identical to `refused.1` when asked, and save the new world.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW, acceptDownloads: true });
    const d2Errors = [];
    const p = await ctx.newPage();
    p.on('pageerror', (e) => d2Errors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') d2Errors.push(m.text()); });
    const blank = new URL('__blank.html', preview.url).href;
    await ctx.route(blank, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    const idb = (pg, op, arg) => pg.evaluate(([o, a]) => new Promise((resolve, reject) => {
      const q = indexedDB.open('dragonvein');
      q.onerror = () => reject(q.error);
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction('save', o === 'tamper' ? 'readwrite' : 'readonly');
        const os = tx.objectStore('save');
        const g = os.get(o === 'tamper' ? 'main' : a);
        let out = null;
        g.onsuccess = () => {
          if (o === 'tamper') {
            const cur = g.result;
            const payload = JSON.parse(cur.text);
            // The stored gid no longer matches the alleles. (Nudging an allele is not enough:
            // a recessive one does not change the phenotype the gid hashes.)
            const g0 = payload.world.roster[0].genome;
            g0.gid = g0.gid.split('').reverse().join('');
            // As another writer would: a newer gen and no writer of this page's.
            const next = { gen: cur.gen + 1, savedAt: cur.savedAt, text: JSON.stringify(payload) };
            os.put(next, 'main');
            out = JSON.stringify(next);
          } else {
            out = g.result === undefined ? null : JSON.stringify(g.result);
          }
        };
        tx.oncomplete = () => { db.close(); resolve(out); };
      };
    }), [op, arg]);
    try {
      await p.goto(`${preview.url}?test`, { waitUntil: 'load', timeout: 30_000 });
      await p.evaluate(() => globalThis.__dragonveinSave.ready());
      await p.evaluate(() => globalThis.__dragonveinSave.seedRoster());
      // Reload only once the scene's assets are in: an aborted GLB fetch logs its own error.
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
      const tampered = await idb(p, 'tamper');
      await p.reload({ waitUntil: 'load', timeout: 30_000 });
      const refused = await p.evaluate(() => globalThis.__dragonveinSave.ready());
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
      await p.waitForTimeout(400);
      const fit = await p.evaluate(measureHud);
      const shown = await p.evaluate(() => globalThis.__dragonveinSave.read());
      await p.screenshot({ path: `${SHOTS}/14-save-refused.png` });
      say(`save: refused record — state ${shown.state} (${shown.detail}); salvageable ${shown.refused?.salvage}; ` +
        `HUD "${shown.hud.save} | ${shown.hud.note}" [${shown.hud.actions.join(' | ')}]; hud ${JSON.stringify(fit)}`);
      say(`shot: ${SHOTS}/14-save-refused.png  (M8a cycle 2, D2)`);
      if (refused.state !== 'corrupt' || shown.refused?.salvage !== 2 || shown.hud.actions.length !== 2) {
        throw new Error(`the tampered save was not refused with 2 salvageable dragons and two actions: ` +
          `${refused.state} ${JSON.stringify(shown.refused)} [${shown.hud.actions}]`);
      }
      if (!fit || fit.clipped.length || fit.overflow) errors.push(`save: refused-state HUD is clipped: ${JSON.stringify(fit)}`);
      // Cycle 3, D8: touch targets.
      const heights = await p.evaluate(() => [...document.querySelectorAll('#hud-save-actions button')]
        .filter((b) => !b.hidden).map((b) => Math.round(b.getBoundingClientRect().height)));
      say(`save: recovery buttons ${heights.join(' / ')} px tall (want >= 44)`);
      if (!heights.length || heights.some((h) => h < 44)) errors.push(`save: a recovery button is under 44 px: ${heights}`);

      // Export: a real click, a real download, the stored record exactly.
      const [download] = await Promise.all([
        p.waitForEvent('download', { timeout: 10_000 }),
        p.click('#hud-save-export', { timeout: 10_000 }),
      ]);
      const file = await download.path();
      const { readFile } = await import('node:fs/promises');
      const exported = JSON.parse(await readFile(file, 'utf8'));
      const same = JSON.stringify(exported) === tampered;
      say(`save: export — downloaded ${download.suggestedFilename()}, ${same ? 'identical to' : 'DIFFERENT from'} the stored record`);
      if (!same) errors.push('save: the exported file is not the stored record');
      // Cycle 3, D3: the HUD confirms it.
      await p.waitForTimeout(300);
      const confirmed = (await p.evaluate(() => globalThis.__dragonveinSave.read())).hud.note;
      say(`save: after export the HUD says "${confirmed}"`);
      if (!confirmed.includes(`exported ${download.suggestedFilename()}`)) errors.push(`save: export not confirmed on the HUD: ${confirmed}`);

      // Start fresh: a real click. The record moves aside untouched; the readable dragons come along.
      await p.click('#hud-save-fresh');
      await p.waitForFunction(() => globalThis.__dragonveinSave.read().state === 'saved', undefined, { timeout: 15_000 });
      await p.waitForTimeout(400);
      const fresh = await p.evaluate(() => globalThis.__dragonveinSave.read());
      const aside = await idb(p, 'get', fresh.asideKey);
      await p.screenshot({ path: `${SHOTS}/15-save-started-fresh.png` });
      await p.reload({ waitUntil: 'load', timeout: 30_000 });
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
      const back = await p.evaluate(() => globalThis.__dragonveinSave.ready());
      const asideLater = await idb(p, 'get', fresh.asideKey);
      say(`save: start fresh — old record moved to ${fresh.asideKey} ${aside === tampered ? 'byte-identical' : 'CHANGED'}; ` +
        `new world ${fresh.world.roster.length} dragons (${fresh.world.roster.map((d) => d.genome.gid).join(', ')}), ` +
        `${fresh.state}; HUD "${fresh.hud.save} | ${fresh.hud.note}"; after a reload ${back.report.source} with ` +
        `${back.world.roster.length} dragons, ${fresh.asideKey} still ${asideLater === tampered ? 'identical' : 'CHANGED'}`);
      say(`shot: ${SHOTS}/15-save-started-fresh.png  (M8a cycle 2, D2)`);
      if (aside !== tampered || asideLater !== tampered || fresh.world.roster.length !== 2
        || !['loaded', 'journal'].includes(back.report.source) || back.world.roster.length !== 2) {
        errors.push('save: start fresh lost the old record or the readable dragons');
      }

      // D3: a handle closed under the game is reopened by the next save.
      await p.evaluate(() => globalThis.__dragonveinSave.closeStore());
      const reopened = await p.evaluate(() => globalThis.__dragonveinSave.save());
      say(`save: store handle closed under the game, next save ${reopened.state} (gen ${reopened.gen})`);
      if (reopened.state !== 'saved') errors.push(`save: a closed store was not reopened: ${reopened.state} ${reopened.detail}`);

      // Cycle 3, D6: the database is deleted under the running tab. The slot is empty, so
      // the tab writes its world again and says what happened — not "another tab".
      {
        const killer = await ctx.newPage();
        await killer.goto(blank);
        const deleted = await killer.evaluate(() => new Promise((resolve) => {
          const q = indexedDB.deleteDatabase('dragonvein');
          q.onsuccess = () => resolve(true);
          q.onerror = () => resolve(false);
        }));
        await killer.close();
        const resaved = await p.evaluate(() => globalThis.__dragonveinSave.save());
        await p.waitForTimeout(300);
        const r = await p.evaluate(() => globalThis.__dragonveinSave.read());
        const stored = await idb(p, 'get', 'main');
        const storedRoster = stored ? JSON.parse(JSON.parse(stored).text).world.roster.length : null;
        say(`save: database deleted under the tab (${deleted ? 'deleted' : 'NOT deleted'}) — next save ${resaved.state}; ` +
          `HUD "${r.hud.save} | ${r.hud.note}"; IndexedDB main now holds ${storedRoster} dragons (world has ${r.world.roster.length})`);
        if (resaved.state !== 'saved' || !r.hud.note.includes('emptied') || storedRoster !== r.world.roster.length) {
          errors.push(`save: a deleted database was not handled: ${resaved.state} "${r.hud.note}"`);
        }
      }

      // D3: a newer build upgrades the database. This page lets go; its next save cannot
      // reopen at the old version, and the HUD must say so rather than promise a retry.
      const newer = await ctx.newPage();
      await newer.goto(blank);
      await newer.evaluate(() => new Promise((resolve) => {
        const q = indexedDB.open('dragonvein', 2);
        q.onsuccess = () => { q.result.close(); resolve(true); };
        q.onerror = () => resolve(false);
      }));
      await newer.close();
      const afterUpgrade = await p.evaluate(() => globalThis.__dragonveinSave.save());
      await p.waitForTimeout(400);
      const hud = await p.evaluate(() => globalThis.__dragonveinSave.read());
      say(`save: database upgraded by a newer build — next save ${afterUpgrade.state} (${afterUpgrade.detail}); ` +
        `HUD "${hud.hud.save} | ${hud.hud.note}" [${hud.hud.actions.join(' | ')}]`);
      if (afterUpgrade.state !== 'error' || !hud.hud.note.includes('newer version')) {
        errors.push(`save: after a newer build's upgrade the HUD does not say so: ${hud.hud.note}`);
      }
      // Cycle 3, D7: this (now stale) build booting against the newer database says the same.
      await p.reload({ waitUntil: 'load', timeout: 30_000 });
      const stale = await p.evaluate(() => globalThis.__dragonveinSave.ready());
      await p.waitForTimeout(400);
      const staleHud = (await p.evaluate(() => globalThis.__dragonveinSave.read())).hud;
      say(`save: a stale build booting against the newer database — ${stale.state}; HUD "${staleHud.save} | ` +
        `${staleHud.note}" [${staleHud.actions.join(' | ')}]`);
      if (!staleHud.note.includes('newer version') || !staleHud.actions.includes('reload')) {
        errors.push(`save: a stale build at boot does not say a newer version upgraded the save: "${staleHud.note}"`);
      }
    } catch (e) {
      errors.push(`refused-save drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
    say(`save: ${d2Errors.length} page error(s) across the refused-save drill`);
    errors.push(...d2Errors.map((e) => `refused save: ${e}`));
  }
  await flush();

  // --- cycle 3: start-fresh in a stale tab, a held load, and no journal -----------------
  /*
   * D1 (the gameplay critic's repro): garbage at gen 2, two tabs both refusing it. Tab A
   * starts fresh and saves up to gen 2; tab B then clicks start fresh. B must move nothing,
   * say why and offer a reload; A's save stays in `main`, and there is no `refused.2`.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const c3Errors = [];
    const blank = new URL('__blank.html', preview.url).href;
    await ctx.route(blank, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    const watch = (pg, tag) => {
      pg.on('pageerror', (e) => c3Errors.push(`${tag}: ${String(e)}`));
      pg.on('console', (m) => { if (m.type() === 'error') c3Errors.push(`${tag}: ${m.text()}`); });
    };
    /** Run one IndexedDB op on the save store from `pg`: get a key, or put a value at one. */
    const idbOp = (pg, op, key, value) => pg.evaluate(([o, k, v]) => new Promise((resolve, reject) => {
      const q = indexedDB.open('dragonvein', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('save');
      q.onerror = () => reject(q.error);
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction('save', o === 'put' ? 'readwrite' : 'readonly');
        let out = null;
        if (o === 'put') tx.objectStore('save').put(v, k);
        else { const g = tx.objectStore('save').get(k); g.onsuccess = () => { out = g.result ?? null; }; }
        tx.oncomplete = () => { db.close(); resolve(out); };
      };
    }), [op, key, value]);
    const drawn = (pg) => pg.waitForFunction(
      () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
    try {
      const seedPage = await ctx.newPage();
      await seedPage.goto(blank);
      await idbOp(seedPage, 'put', 'main', { gen: 2, savedAt: 1, text: 'garbage' });
      const a = await ctx.newPage();
      watch(a, 'tab A');
      const b = await ctx.newPage();
      watch(b, 'tab B');
      await a.goto(`${preview.url}?test`, { waitUntil: 'load', timeout: 30_000 });
      await b.goto(`${preview.url}?test`, { waitUntil: 'load', timeout: 30_000 });
      const ra = await a.evaluate(() => globalThis.__dragonveinSave.ready());
      const rb = await b.evaluate(() => globalThis.__dragonveinSave.ready());
      await drawn(a);
      await drawn(b);
      const fa = await a.evaluate(() => globalThis.__dragonveinSave.startFresh());
      // Start fresh writes gen 1 and the roster change gen 2: the gen B read and refused.
      const sa = await a.evaluate(() => globalThis.__dragonveinSave.seedRoster());
      const liveBefore = await idbOp(seedPage, 'get', 'main');
      await b.click('#hud-save-fresh', { timeout: 10_000 });
      await b.waitForTimeout(500);
      const rb2 = await b.evaluate(() => globalThis.__dragonveinSave.read());
      const liveAfter = await idbOp(seedPage, 'get', 'main');
      const refused2 = await idbOp(seedPage, 'get', 'refused.2');
      const refused1 = await idbOp(seedPage, 'get', 'refused.1');
      await b.screenshot({ path: `${SHOTS}/16-save-aside-refused.png` });
      // Tab A keeps playing and autosaves every 10 s, so `main` may move on between the two
      // reads — by A's own hand. What B must not do is write it: the record is still A's
      // (same writer, never an older gen) and still A's world, and B wrote nothing at all.
      const rosterOf = (rec) => { try { return JSON.parse(rec.text).world.roster.length; } catch { return -1; } };
      const stillA = liveAfter !== null && liveBefore !== null && liveAfter.writer === liveBefore.writer
        && liveAfter.gen >= liveBefore.gen && rosterOf(liveAfter) === rosterOf(liveBefore);
      const mainText = JSON.stringify(liveAfter) === JSON.stringify(liveBefore)
        ? `unchanged (A's gen ${liveAfter?.gen}, ${rosterOf(liveAfter)} dragons)`
        : stillA ? `A's own autosave since (gen ${liveBefore.gen} -> ${liveAfter.gen}, writer A, ${rosterOf(liveAfter)} dragons)`
          : `CHANGED (gen ${liveBefore?.gen} -> ${liveAfter?.gen}, writer ${liveBefore?.writer} -> ${liveAfter?.writer})`;
      say(`save: stale start-fresh — tabs A ${ra.state} / B ${rb.state}; A set aside to ${fa.key}, seeded and ` +
        `saved to gen ${sa.gen}; B's start fresh moved ${rb2.asideKey ?? 'nothing'}, B wrote ${rb2.writes} record(s); B HUD "${rb2.hud.save} | ` +
        `${rb2.hud.note}" [${rb2.hud.actions.join(' | ')}]; main ${mainText}; ` +
        `refused.1 ${refused1?.text === 'garbage' ? 'is the garbage' : 'WRONG'}, refused.2 ${refused2 ? 'EXISTS' : 'absent'}`);
      say(`shot: ${SHOTS}/16-save-aside-refused.png  (M8a cycle 3, D1/D2)`);
      if (ra.state !== 'corrupt' || rb.state !== 'corrupt' || fa.key !== 'refused.1' || sa.gen !== 2
        || !stillA || rb2.writes !== 0 || refused2 || rb2.asideKey
        || !rb2.hud.actions.includes('reload') || rb2.hud.actions.some((t) => t.startsWith('start fresh'))) {
        errors.push('save: start-fresh in a stale tab moved the live save, or left a dead button');
      }
      // B's reload button leads to A's world.
      await b.click('#hud-save-reload');
      await b.waitForLoadState('load');
      const rb3 = await b.evaluate(() => globalThis.__dragonveinSave.ready());
      say(`save: tab B after its reload — ${rb3.report.source}, ${rb3.world.roster.length} dragons`);
      if (rb3.world.roster.length !== 3) errors.push(`save: tab B's reload did not show A's world: ${rb3.world.roster.length}`);
      await a.close();
      await b.close();

      // D5: a load whose read waits on another tab says so, then gives up without writing.
      // (`?readTimeoutMs=3000` shortens the 10 s default for the drill.)
      const holder = await ctx.newPage();
      await holder.goto(blank);
      const heldMain = await idbOp(holder, 'get', 'main');
      await holder.evaluate(() => new Promise((started) => {
        const q = indexedDB.open('dragonvein');
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('save', 'readwrite');
          const os = tx.objectStore('save');
          const end = performance.now() + 5000;
          const spin = () => { if (performance.now() < end) os.get('main').onsuccess = spin; };
          spin();
          tx.oncomplete = () => db.close();
          started(true);
        };
      }));
      const w = await ctx.newPage();
      watch(w, 'held load');
      await w.goto(`${preview.url}?test&readTimeoutMs=3000`, { waitUntil: 'load', timeout: 30_000 });
      await w.waitForTimeout(1800);
      const waiting = await w.evaluate(() => globalThis.__dragonveinSave.read().hud);
      const timedOut = await w.evaluate(() => globalThis.__dragonveinSave.ready());
      await w.waitForTimeout(400);
      const timedOutHud = (await w.evaluate(() => globalThis.__dragonveinSave.read())).hud;
      await w.waitForTimeout(3500);    // the hold ends; nothing may have been written
      const mainAfter = await idbOp(holder, 'get', 'main');
      say(`save: load behind a held store — at 1.8 s HUD "${waiting.save} | ${waiting.note}"; then ${timedOut.state} ` +
        `(${timedOut.detail}); HUD "${timedOutHud.save} | ${timedOutHud.note}" [${timedOutHud.actions.join(' | ')}]; ` +
        `main ${JSON.stringify(mainAfter) === JSON.stringify(heldMain) ? 'untouched' : 'CHANGED'} after the hold`);
      if (!waiting.note.includes('waiting for another tab') || timedOut.state !== 'unavailable'
        || !timedOutHud.note.includes('could not be read in time') || !timedOutHud.actions.includes('reload')
        || JSON.stringify(mainAfter) !== JSON.stringify(heldMain)) {
        errors.push('save: a held load did not wait visibly, time out and leave the record alone');
      }
      await w.close();
      await holder.close();
      await seedPage.close();
    } catch (e) {
      errors.push(`stale start-fresh / held-load drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
    say(`save: ${c3Errors.length} page error(s) across the stale start-fresh and held-load drills`);
    errors.push(...c3Errors);
  }
  await flush();

  // D4: localStorage blocked: the HUD says the journal is off, and a roster change waiting
  // on a busy store reads "saving", never "saved", until it lands.
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    await ctx.addInitScript(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
      });
    });
    const blank = new URL('__blank.html', preview.url).href;
    await ctx.route(blank, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    const jErrors = [];
    const p = await ctx.newPage();
    p.on('pageerror', (e) => jErrors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') jErrors.push(m.text()); });
    try {
      await p.goto(`${preview.url}?test`, { waitUntil: 'load', timeout: 30_000 });
      await p.evaluate(() => globalThis.__dragonveinSave.ready());
      await p.waitForFunction(() => globalThis.__dragonveinSave.read().state === 'saved', undefined, { timeout: 15_000 });
      await p.waitForTimeout(300);
      const idle = (await p.evaluate(() => globalThis.__dragonveinSave.read())).hud;
      const holder = await ctx.newPage();
      await holder.goto(blank);
      await holder.evaluate(() => new Promise((started) => {
        const q = indexedDB.open('dragonvein');
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('save', 'readwrite');
          const os = tx.objectStore('save');
          const end = performance.now() + 2000;
          const spin = () => { if (performance.now() < end) os.get('main').onsuccess = spin; };
          spin();
          tx.oncomplete = () => db.close();
          started(true);
        };
      }));
      await p.evaluate(() => { void globalThis.__dragonveinSave.seedRoster(); });
      await p.waitForTimeout(600);
      const busy = (await p.evaluate(() => globalThis.__dragonveinSave.read())).hud;
      await p.waitForFunction(() => globalThis.__dragonveinSave.read().hud.save.startsWith('saved'), undefined, { timeout: 15_000 });
      const landed = (await p.evaluate(() => globalThis.__dragonveinSave.read())).hud;
      await holder.close();
      say(`save: localStorage blocked — HUD idle "${idle.save} | ${idle.note}"; with the store busy after a roster ` +
        `change "${busy.save}"; once it lands "${landed.save}" (${landed.roster} dragons)`);
      if (!idle.note.includes('journal off') || busy.save !== 'saving' || landed.roster !== '3') {
        errors.push(`save: with no journal the HUD did not say so, or claimed "saved" early: "${idle.note}" / "${busy.save}"`);
      }
    } catch (e) {
      errors.push(`journal-off drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
    errors.push(...jErrors.map((e) => `journal off: ${e}`));
  }
  await flush();

  // --- IndexedDB blocked: the game runs and says it is not saving ----------------------
  /*
   * As a storage-blocked context does — Firefox private browsing before 115, a sandboxed
   * frame, "block all site data" — reading `indexedDB` throws a SecurityError.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    await ctx.addInitScript(() => {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        get() { throw new DOMException('The user denied permission to access the database.', 'SecurityError'); },
      });
    });
    const blockedErrors = [];
    const p = await ctx.newPage();
    p.on('pageerror', (e) => blockedErrors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') blockedErrors.push(m.text()); });
    try {
      await p.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
      await p.waitForFunction(
        () => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
      await p.waitForFunction(
        () => document.getElementById('hud-save')?.textContent === 'not saved', undefined, { timeout: 15_000 });
      const clock0 = await p.evaluate(() => document.getElementById('hud-clock')?.textContent ?? '');
      await p.waitForTimeout(1500);
      const hud = await p.evaluate(() => ({
        clock: document.getElementById('hud-clock')?.textContent ?? '',
        save: document.getElementById('hud-save')?.textContent ?? '',
        note: document.getElementById('hud-save-note')?.textContent ?? '',
        draws: globalThis.__dragonveinStats?.().drawCalls ?? null,
      }));
      const fit = await p.evaluate(measureHud);
      await p.screenshot({ path: `${SHOTS}/13-save-not-saved.png` });
      say(`save: IndexedDB blocked — HUD "${hud.clock} | ${hud.save} | ${hud.note}", world clock ${clock0} -> ` +
        `${hud.clock}, draws ${hud.draws}, ${blockedErrors.length} page error(s); hud ${JSON.stringify(fit)}`);
      say(`shot: ${SHOTS}/13-save-not-saved.png  (M8a criteria 3 and 5)`);
      if (hud.save !== 'not saved') errors.push(`save: with IndexedDB blocked the HUD says "${hud.save}"`);
      if (!((hud.draws ?? 0) > 0) || hud.clock === clock0) {
        errors.push(`save: with IndexedDB blocked the game did not run on (draws ${hud.draws}, clock ${clock0} -> ${hud.clock})`);
      }
      if (!fit || fit.clipped.length || fit.overflow) errors.push(`save: not-saved HUD is clipped: ${JSON.stringify(fit)}`);
    } catch (e) {
      errors.push(`blocked-storage drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
    errors.push(...blockedErrors.map((e) => `blocked storage: ${e}`));
  }
  await flush();

  // --- the wild dragon and the keeper (M8b criteria 3 and 4) ----------------------------
  /*
   * Each drill in its own context on `?test&seed=WILD_SEED`, so every run meets the same
   * wild dragon on a fresh IndexedDB. `__dragonveinWild` reads the sim's state and the
   * render's, and aims: `project` turns a deck point into page pixels, `pinSpin` holds the
   * island still while a pointer aims at it. The pointer itself goes through Playwright's
   * mouse and CDP touch, the same events a player makes.
   */
  const wildUrl = `${preview.url}?test&seed=${WILD_SEED}`;
  const wildRead = (pg) => pg.evaluate(() => globalThis.__dragonveinWild.read());
  const wildReady = (pg) => pg.evaluate(() => globalThis.__dragonveinWild.ready());
  const fmt = (v) => (Array.isArray(v) ? `(${v.map((x) => x.toFixed(2)).join(', ')})` : typeof v === 'number' ? v.toFixed(3) : String(v));
  const wildLine = (r) => `tick ${r.tick} dragon ${r.wild.state} at ${fmt(r.wild.pos)} heading ${fmt(r.wild.heading)} calm ${fmt(r.wild.calm)}; ` +
    `keeper at ${fmt(r.keeper.pos)} v ${fmt(r.keeper.v)}, ${r.keeperDistance.toFixed(2)} away`;
  /** Wait (bounded) for a condition on the wild state, polling the sim. Returns the last read. */
  const waitWild = async (pg, cond, timeoutMs, what) => {
    const t0 = Date.now();
    for (;;) {
      const r = await wildRead(pg);
      if (cond(r)) return r;
      if (Date.now() - t0 > timeoutMs) throw new Error(`timed out (${timeoutMs} ms) waiting for ${what}: ${wildLine(r)}`);
      await pg.waitForTimeout(100);
    }
  };
  /*
   * **Gestures are dispatched as a burst, not one event at a time.** Each CDP dispatch waits
   * for the page, and on a loaded machine running this island that round trip is 1-2 seconds:
   * a press, three 1-pixel moves and a release, sent one awaited call at a time, arrived with
   * `pointerdown` and `pointerup` **5.1 s apart**, and two taps meant as a double tap arrived
   * 2.1 s apart (measured in this container, 2026-10-17). The page is right to refuse both —
   * TAP_MS is 450 ms and DOUBLE_TAP_MS 380 ms, and no human holds a 3-pixel press for five
   * seconds — so what was being tested was the harness's latency, not the input. Sending the
   * events of one gesture without awaiting between them puts them microseconds apart, which is
   * the gesture a player makes. Same events, same path, same assertions.
   */
  const burst = async (...sends) => Promise.all(sends);

  /** A deck point `ahead` units from the keeper toward `to`, as page pixels, with the spin pinned. */
  const aimFromKeeper = async (pg, to, ahead) => pg.evaluate(([tx, tz, a]) => {
    const h = globalThis.__dragonveinWild;
    const r = h.read();
    h.pinSpin(r.spin);
    const [kx, kz] = r.keeper.pos;
    const d = Math.hypot(tx - kx, tz - kz) || 1;
    const x = kx + ((tx - kx) / d) * a, z = kz + ((tz - kz) / d) * a;
    return { deck: [x, z], px: h.project(x, z) };
  }, [to[0], to[1], ahead]);

  // Tap-to-move, under the mouse: a click walks, a drag orbits and does not walk, a press that
  // jitters inside the slop is still a click, a double click runs, a click off the island is
  // ignored — and every answer lands in the next sim tick.
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const p = await ctx.newPage();
    const wildErrors = [];
    p.on('pageerror', (e) => wildErrors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') wildErrors.push(m.text()); });
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      const mouseCdp = await ctx.newCDPSession(p);
      const mouse = (type, x, y, buttons) => mouseCdp.send('Input.dispatchMouseEvent',
        { type, x, y, button: 'left', buttons, clickCount: 1 });
      const boot = await p.evaluate(() => globalThis.__dragonveinSave.read());
      say(`wild: seed ${WILD_SEED} — dragon ${r0.dragon.gid} (${r0.wild.element.join('/')}), ${r0.dragon.triangles} tris, ` +
        `built through the worker in ${r0.dragon.buildMs.toFixed(0)} ms; first frame at ${boot.bootMs.toFixed(0)} ms, ` +
        `world ready at ${boot.worldReadyMs.toFixed(0)} ms (the first frame does not wait for either)`);
      say(`wild: temperament ${JSON.stringify(Object.fromEntries(Object.entries(r0.temperament).map(([k, v]) => [k, +v.toFixed(3)])))}`);
      say(`wild: start — ${wildLine(r0)}; hint shown: ${r0.hint}`);
      if (!r0.hint) errors.push('wild: the "tap the island to walk" hint is not shown before the first tap');
      // Stand the keeper where its way to the dragon is open, then click a short walk along it.
      const staged = await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), r0.temperament.notice + 2.2);
      if (!staged) throw new Error('no open approach to the dragon to stage the keeper on');
      const to = r0.wild.pos;
      const a = await aimFromKeeper(p, to, 1.3);
      const pose0 = await p.evaluate(readPose);
      const t0 = await p.evaluate(() => performance.now());
      await p.mouse.click(a.px[0], a.px[1]);
      const r1 = await wildRead(p);
      const answeredMs = r1.taps.lastAt - t0;
      const off = Math.hypot(r1.keeper.goal[0] - a.deck[0], r1.keeper.goal[1] - a.deck[1]);
      say(`wild: mouse click at ${fmt(a.px)} px -> keeper goal ${fmt(r1.keeper.goal)} (aimed ${fmt(a.deck)}, ${off.toFixed(3)} off), ` +
        `pace ${r1.keeper.pace.toFixed(2)}, answered in ${answeredMs.toFixed(1)} ms; hint now ${r1.hint ? 'shown' : 'gone'}`);
      if (r1.taps.count !== 1 || off > 0.25) errors.push(`wild: a mouse click did not set the keeper's goal: ${JSON.stringify(r1.taps)} goal ${fmt(r1.keeper.goal)} aimed ${fmt(a.deck)}`);
      if (!(answeredMs >= 0 && answeredMs < 100)) errors.push(`wild: a click took ${answeredMs} ms to answer (G3: 100)`);
      const r2 = await waitWild(p, (r) => Math.hypot(r.keeper.pos[0] - r.keeper.goal[0], r.keeper.pos[1] - r.keeper.goal[1]) < 0.02 && r.keeper.v === 0, 20_000, 'the keeper to arrive');
      say(`wild: the keeper walked there — ${wildLine(r2)}; ring ${fmt(r2.keeperView.ring)}`);
      const pose1 = await p.evaluate(readPose);
      if (Math.abs(pose1.azimuthDeg - pose0.azimuthDeg) > 1e-6 || Math.abs(pose1.pitchDeg - pose0.pitchDeg) > 1e-6) {
        errors.push(`wild: a click moved the camera: ${poseText(pose0)} -> ${poseText(pose1)}`);
      }
      // A drag from a deck point orbits, and walks nobody.
      const b = await aimFromKeeper(p, to, 0.6);
      await p.mouse.move(b.px[0], b.px[1]);
      await p.mouse.down();
      await p.mouse.move(b.px[0] + 140, b.px[1] + 10, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const r3 = await wildRead(p);
      const pose2 = await p.evaluate(readPose);
      say(`wild: mouse drag 140 px from the deck -> camera ${poseText(pose1)} -> ${poseText(pose2)}; taps ${r1.taps.count} -> ${r3.taps.count}`);
      if (r3.taps.count !== r1.taps.count) errors.push('wild: a mouse drag was taken for a tap');
      if (Math.abs(pose2.azimuthDeg - pose1.azimuthDeg) < 10) errors.push(`wild: a drag from the deck did not orbit: ${poseText(pose1)} -> ${poseText(pose2)}`);
      // A press that jitters 4 px is still a click, and still does not move the camera.
      const c = await aimFromKeeper(p, to, 0.5);
      await p.mouse.move(c.px[0], c.px[1]);
      await burst(
        mouse('mousePressed', c.px[0], c.px[1], 1),
        mouse('mouseMoved', c.px[0] + 1, c.px[1] - 1, 1),
        mouse('mouseMoved', c.px[0] + 2, c.px[1] - 2, 1),
        mouse('mouseMoved', c.px[0] + 3, c.px[1] - 2, 1),
        mouse('mouseReleased', c.px[0] + 3, c.px[1] - 2, 0),
      );
      const r4 = await wildRead(p);
      const pose3 = await p.evaluate(readPose);
      say(`wild: mouse press with 4 px of jitter -> taps ${r3.taps.count} -> ${r4.taps.count}, camera ${poseText(pose3)}`);
      if (r4.taps.count !== r3.taps.count + 1) errors.push('wild: a click with 4 px of jitter was not taken for a tap');
      if (Math.abs(pose3.azimuthDeg - pose2.azimuthDeg) > 1e-6) errors.push('wild: a jittery click moved the camera');
      // A double click runs. The wait is DOUBLE_TAP_MS and more after the jittery press above,
      // so the first click of the pair cannot pair with *that* tap instead — which is what it
      // did once the press above started registering, leaving the second click a lone walk.
      await p.waitForTimeout(600);
      const d = await aimFromKeeper(p, to, 0.9);
      await p.mouse.dblclick(d.px[0], d.px[1]);
      const r5 = await wildRead(p);
      say(`wild: mouse double click -> run taps ${r5.taps.run}, keeper pace ${r5.keeper.pace.toFixed(2)} (run ${r5.keeper.pace >= 2.8 ? 'yes' : 'NO'})`);
      if (!(r5.taps.run >= 1 && r5.keeper.pace >= 2.8)) errors.push(`wild: a double click did not run: ${JSON.stringify(r5.taps)} pace ${r5.keeper.pace}`);
      // A click in the sky is not a walk.
      await p.mouse.click(VIEW.width / 2, 20);
      const r6 = await wildRead(p);
      say(`wild: mouse click in the sky -> off-deck ${r6.taps.offDeck}, taps ${r6.taps.count} (unchanged: ${r6.taps.count === r5.taps.count})`);
      if (r6.taps.count !== r5.taps.count) errors.push('wild: a click off the island moved the keeper');
      for (const e of wildErrors) errors.push(`wild mouse: ${e}`);
      say(`wild: mouse drill — ${wildErrors.length} page error(s)`);
    } catch (e) {
      errors.push(`wild mouse drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  // The same under touch (hasTouch): a tap walks, a one-finger drag orbits, a double tap runs,
  // a pinch zooms and walks nobody.
  {
    const ctx = await browser.newContext({ viewport: VIEW, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const wildErrors = [];
    p.on('pageerror', (e) => wildErrors.push(String(e)));
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      const cdp = await ctx.newCDPSession(p);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });
      const tap = async (x, y) => burst(touch('touchStart', [[x, y]]), touch('touchEnd', []));
      const staged = await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), r0.temperament.notice + 2.2);
      if (!staged) throw new Error('no open approach to the dragon to stage the keeper on');
      const to = r0.wild.pos;
      const a = await aimFromKeeper(p, to, 1.3);
      const pose0 = await p.evaluate(readPose);
      await tap(a.px[0], a.px[1]);
      const r1 = await wildRead(p);
      const off = Math.hypot(r1.keeper.goal[0] - a.deck[0], r1.keeper.goal[1] - a.deck[1]);
      say(`wild: touch tap at ${fmt(a.px)} px -> keeper goal ${fmt(r1.keeper.goal)} (aimed ${fmt(a.deck)}, ${off.toFixed(3)} off), pace ${r1.keeper.pace.toFixed(2)}`);
      if (r1.taps.count !== 1 || off > 0.25) errors.push(`wild: a touch tap did not set the keeper's goal: ${JSON.stringify(r1.taps)}`);
      await waitWild(p, (r) => r.keeper.v === 0 && Math.hypot(r.keeper.pos[0] - r.keeper.goal[0], r.keeper.pos[1] - r.keeper.goal[1]) < 0.02, 20_000, 'the keeper to arrive');
      const b = await aimFromKeeper(p, to, 0.6);
      await touch('touchStart', [[b.px[0], b.px[1]]]);
      for (let i = 1; i <= 10; i++) await touch('touchMove', [[b.px[0] - 14 * i, b.px[1]]]);
      await touch('touchEnd', []);
      await p.waitForTimeout(300);
      const r2 = await wildRead(p);
      const pose1 = await p.evaluate(readPose);
      say(`wild: touch drag 140 px from the deck -> camera ${poseText(pose0)} -> ${poseText(pose1)}; taps ${r1.taps.count} -> ${r2.taps.count}`);
      if (r2.taps.count !== r1.taps.count) errors.push('wild: a touch drag was taken for a tap');
      if (Math.abs(pose1.azimuthDeg - pose0.azimuthDeg) < 10) errors.push('wild: a touch drag from the deck did not orbit');
      const c = await aimFromKeeper(p, to, 0.9);
      await burst(
        touch('touchStart', [[c.px[0], c.px[1]]]), touch('touchEnd', []),
        touch('touchStart', [[c.px[0] + 3, c.px[1] + 2]]), touch('touchEnd', []),
      );
      const r3 = await wildRead(p);
      say(`wild: touch double tap -> run taps ${r3.taps.run}, keeper pace ${r3.keeper.pace.toFixed(2)}`);
      if (!(r3.taps.run >= 1 && r3.keeper.pace >= 2.8)) errors.push(`wild: a double tap did not run: ${JSON.stringify(r3.taps)}`);
      const cx = VIEW.width / 2, cy = VIEW.height / 2 + 60;
      await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - 10 * i, cy], [cx + 30 + 10 * i, cy]]);
      await touch('touchEnd', []);
      await p.waitForTimeout(300);
      const r4 = await wildRead(p);
      const pose2 = await p.evaluate(readPose);
      say(`wild: touch pinch-out on the deck -> camera ${poseText(pose1)} -> ${poseText(pose2)}; taps ${r3.taps.count} -> ${r4.taps.count}`);
      if (r4.taps.count !== r3.taps.count) errors.push('wild: a pinch was taken for a tap');
      if (!(pose2.distance < pose1.distance - 0.5)) errors.push('wild: a pinch on the deck did not zoom');
      for (const e of wildErrors) errors.push(`wild touch: ${e}`);
      say(`wild: touch drill — ${wildErrors.length} page error(s)`);
    } catch (e) {
      errors.push(`wild touch drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  /*
   * **The keeper goes where it is tapped** (criterion 7, STATE.md run 35), through real clicks
   * on the real island. The numeric bar — 95 % of 48 seeded targets within 0.45 — is held over
   * the frozen deck by tests/wild-nav.test.ts; this is the end-to-end sample the criterion also
   * asks for: pixels, through `pointerdown`/`pointerup`, through `tapDeck`, through the sim.
   *
   * The targets are seeded, spread over the deck, clear of every obstacle, at least 2.5 from
   * the dragon (so the answer is the navigation and not a body shouldering another), and
   * reachable — decided here by this file's own flood fill over the deck the page reports, not
   * by asking the navigation whether it can do what it is about to be asked to do.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const p = await ctx.newPage();
    const wildErrors = [];
    p.on('pageerror', (e) => wildErrors.push(String(e)));
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      const deck = await p.evaluate(() => globalThis.__dragonveinWild.deck());
      const KEEPER_R = 0.16, CLEAR = KEEPER_R + 0.02;
      const clear = (x, z) => {
        if (Math.hypot(x, z) > deck.radius - CLEAR) return false;
        for (let i = 0; i < deck.obstacles.length; i += 3) {
          if (Math.hypot(x - deck.obstacles[i], z - deck.obstacles[i + 1]) < CLEAR + deck.obstacles[i + 2]) return false;
        }
        return true;
      };
      // Flood fill on a 0.05 grid from where the keeper stands: what a keeper-sized disc can
      // slide to. Nothing to do with how the page finds its way there.
      const cell = 0.05, n = Math.ceil((2 * deck.radius) / cell);
      const idx = (x, z) => {
        const ix = Math.floor((x + deck.radius) / cell), iz = Math.floor((z + deck.radius) / cell);
        return ix < 0 || iz < 0 || ix >= n || iz >= n ? -1 : iz * n + ix;
      };
      const free = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) {
        free[i] = clear(-deck.radius + ((i % n) + 0.5) * cell, -deck.radius + (Math.floor(i / n) + 0.5) * cell) ? 1 : 0;
      }
      const seen = new Uint8Array(n * n);
      const queue = [idx(r0.keeper.pos[0], r0.keeper.pos[1])];
      if (queue[0] >= 0) seen[queue[0]] = 1;
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head], ix = i % n, iz = (i - ix) / n;
        for (const j of [ix + 1 < n ? i + 1 : -1, ix > 0 ? i - 1 : -1, iz + 1 < n ? i + n : -1, iz > 0 ? i - n : -1]) {
          if (j >= 0 && free[j] && !seen[j]) { seen[j] = 1; queue.push(j); }
        }
      }
      const canReach = (x, z) => {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = idx(x + dx * cell, z + dz * cell);
            if (i >= 0 && seen[i]) return true;
          }
        }
        return false;
      };
      // mulberry32, so the sample is the same every run.
      let rs = 0x7a9b_1d55;
      const rnd = () => {
        rs = (rs + 0x6d2b79f5) >>> 0;
        let t = rs;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const targets = [];
      for (let guard = 0; guard < 4000 && targets.length < 8; guard++) {
        const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * (deck.radius - 0.4);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!clear(x, z) || !canReach(x, z)) continue;
        if (Math.hypot(x - r0.wild.pos[0], z - r0.wild.pos[1]) < 2.5) continue;
        if (targets.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.2)) continue;
        targets.push([x, z]);
      }
      if (targets.length < 8) throw new Error(`only ${targets.length} reachable deck targets to tap`);
      let arrived = 0;
      for (const [x, z] of targets) {
        const px = await p.evaluate(([tx, tz]) => {
          const h = globalThis.__dragonveinWild;
          h.pinSpin(h.read().spin);
          return h.project(tx, tz);
        }, [x, z]);
        if (px[0] < 40 || px[0] > VIEW.width - 40 || px[1] < 60 || px[1] > VIEW.height - 60) {
          throw new Error(`deck target ${fmt([x, z])} projects off the frame at ${fmt(px)}`);
        }
        await p.mouse.click(px[0], px[1]);
        const r = await waitWild(p, (q) => q.keeper.v === 0
          && Math.hypot(q.keeper.pos[0] - q.keeper.goal[0], q.keeper.pos[1] - q.keeper.goal[1]) < 0.02,
        30_000, `the keeper to stop walking toward ${fmt([x, z])}`).catch(() => null) ?? await wildRead(p);
        const off = Math.hypot(r.keeper.pos[0] - x, r.keeper.pos[1] - z);
        if (off <= 0.45) arrived++;
        say(`wild: tapped ${fmt([x, z])} at ${fmt(px)} px -> keeper at ${fmt(r.keeper.pos)}, ${off.toFixed(3)} from the mark ` +
          `(${off <= 0.45 ? 'arrived' : 'MISSED'}); dragon ${r.wild.state} ${r.keeperDistance.toFixed(2)} away`);
      }
      say(`wild: tap-to-move reached ${arrived}/${targets.length} seeded deck targets within 0.45 (criterion 7)`);
      // One miss is allowed: the dragon moves while the drill runs and may stand in the way.
      // The 95 % bar over 48 targets is tests/wild-nav.test.ts's.
      if (arrived < targets.length - 1) {
        errors.push(`wild: tap-to-move reached only ${arrived} of ${targets.length} tapped deck targets`);
      }
      for (const e of wildErrors) errors.push(`wild taps: ${e}`);
    } catch (e) {
      errors.push(`wild tap-to-move drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  // A reload mid-approach restores the dragon exactly: its state, place, heading and calm, and
  // the keeper's place (criterion 3). The sim is held for the save, so the world saved is the
  // world compared; after the reload it runs on from there.
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const p = await ctx.newPage();
    const wildErrors = [];
    p.on('pageerror', (e) => wildErrors.push(String(e)));
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      // Walk in to just outside its flight distance, then stand: it watches, and calm rises.
      if (!await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), r0.temperament.notice + 1.2)) {
        throw new Error('no open approach to the dragon to stage the keeper on');
      }
      const { wild: { pos: [dx, dz] }, keeper: { pos: [kx, kz] } } = await wildRead(p);
      const dist = Math.hypot(dx - kx, dz - kz), stop = dist - (r0.temperament.flight + 0.5);
      await p.evaluate(([x, z]) => globalThis.__dragonveinWild.walkTo(x, z, false),
        [kx + ((dx - kx) / dist) * stop, kz + ((dz - kz) / dist) * stop]);
      const mid = await waitWild(p, (r) => r.keeper.v === 0 && r.wild.calm > 0.05 && ['alert', 'settle'].includes(r.wild.state), 60_000, 'the dragon to watch a still keeper');
      await p.evaluate(() => globalThis.__dragonveinWild.hold(true));
      await p.evaluate(() => globalThis.__dragonveinSave.save());
      const before = await wildRead(p);
      const saved = await p.evaluate(() => globalThis.__dragonveinSave.read());
      say(`wild: before reload — ${wildLine(before)} (approach reached at ${wildLine(mid)})`);
      await p.reload({ waitUntil: 'load', timeout: 30_000 });
      const after = await wildReady(p);
      if (!after.dragon.ready) throw new Error(`after the reload the wild dragon was not built: ${after.dragon.error}`);
      const loaded = await p.evaluate(() => globalThis.__dragonveinWild.loaded());
      const keys = ['state', 'pos', 'heading', 'calm', 't', 'dur', 'goal', 'from', 'id'];
      const broke = keys.filter((k) => JSON.stringify(loaded?.wild?.[k]) !== JSON.stringify(saved.world.wild[k]));
      if (JSON.stringify(loaded?.keeper) !== JSON.stringify(saved.world.keeper)) broke.push('keeper');
      if (loaded?.wild?.genome?.gid !== saved.world.wild.genome.gid) broke.push('genome');
      say(`wild: after reload, as loaded — dragon ${loaded?.wild?.state} at ${fmt(loaded?.wild?.pos ?? [])} heading ${fmt(loaded?.wild?.heading)} ` +
        `calm ${fmt(loaded?.wild?.calm)}, keeper at ${fmt(loaded?.keeper?.pos ?? [])}; ${broke.length ? `DIFFERS in ${broke.join(', ')}` : 'state, position, heading and calm equal to the save'}`);
      if (broke.length) errors.push(`wild: a reload mid-approach did not restore the dragon: ${broke.join(', ')}`);
      // And it is drawn there, and plays on from there rather than starting over.
      const later = await waitWild(p, (r) => r.tick > (loaded?.tick ?? 0) + 30, 30_000, 'the world to run on');
      const drawnOff = Math.hypot(later.dragon.holder[0] - later.wild.pos[0], later.dragon.holder[2] - later.wild.pos[1]);
      say(`wild: after reload, 30 ticks on — ${wildLine(later)}; drawn ${drawnOff.toFixed(3)} from its sim position`);
      if (!['alert', 'settle'].includes(later.wild.state) || later.wild.calm < loaded.wild.calm) {
        errors.push(`wild: after the reload the dragon did not carry on watching (${later.wild.state}, calm ${later.wild.calm})`);
      }
      if (drawnOff > 0.2) errors.push(`wild: the dragon is drawn ${drawnOff} from where the sim has it`);
      for (const e of wildErrors) errors.push(`wild reload: ${e}`);
    } catch (e) {
      errors.push(`wild reload drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  /*
   * The reaction, photographed (criterion 4): wander, alert, wary, settle, flee. The island's
   * spin is pinned so the keeper comes in across the screen and the dragon is seen side on.
   *
   * **Each shot is framed on its own subject, and the framing is logged in pixels.** Run 35
   * framed all five the same way and wide, and all three critics measured the result rather
   * than the reaction: a dragon a fifth of the frame, a 25 px keeper, and a take-off clipped
   * off the top edge. `closeUp` now derives its distance from the dragon's drawn bounding
   * sphere (altitude included) and from the keeper's height when the keeper is part of the
   * subject, so `dist` below is only a floor. Where the keeper is far — 17, and the take-off
   * in 20, which is about the dragon leaving the ground — the shot frames the dragon alone
   * and the log line says how far away the keeper was standing.
   *
   * Nothing here stages a prettier moment: every `waitWild` condition, and so every state the
   * caption claims, is unchanged. Only the camera moved.
   */
  {
    const ctx = await browser.newContext({ viewport: VIEW });
    const p = await ctx.newPage();
    const wildErrors = [];
    p.on('pageerror', (e) => wildErrors.push(String(e)));
    /**
     * `dist` is a floor; `withKeeper` says whether the keeper is part of this shot's subject.
     *
     * **The world is held still for the shot, and let go after.** One evaluate round trip in
     * this container costs a second or more, so between the state a `waitWild` returned and the
     * frame that lands the dragon has moved on: run 35's take-off was photographed from 7.59
     * away by a camera asked for 3.33, and with the sim free the capture came a whole flight
     * later — the dragon had landed. `hold(true)` stops the sim *and* the pose (dt 0, so the
     * walk ramp, gait clock and tells stop too), so the frame on disk is the moment the drill
     * reached and the moment the log line reports. `at capture` in that line is read after the
     * screenshot and must agree with the state the caption claims.
     *
     * And where the keeper is part of the subject, the island is turned a few degrees until
     * nothing is drawn in front of it (`keeperSeen`). A turn moves the camera round the pair
     * rather than moving either of them, so the shot is still the moment the drill reached.
     * Up to ±23°, which keeps the keeper-to-dragon line across the screen.
     */
    const shoot = async (name, what, r, { dist = 3.0, elev = 24, withKeeper = true } = {}) => {
      const framed = await p.evaluate(([d, e, k]) => {
        const h = globalThis.__dragonveinWild;
        h.hold(true);                       // the world stops here: this frame is the photograph
        const base = h.read().spin;
        let turned = 0, seen = false;
        if (k) {
          for (const off of [0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24, 0.32, -0.32, 0.4, -0.4]) {
            h.pinSpin(base + off);
            h.closeUp(d, e, k);
            if (h.keeperSeen()) { turned = off; seen = true; break; }
          }
          if (!seen) h.pinSpin(base);
        }
        h.closeUp(d, e, k);
        return { turnedDeg: (turned * 180) / Math.PI, seen };
      }, [dist, elev, withKeeper]);
      await p.waitForTimeout(250);
      await p.screenshot({ path: `${SHOTS}/${name}` });
      const sc = await p.evaluate(() => globalThis.__dragonveinWild.screen());
      // The world is frozen, so this read *is* the frame on disk: the log line describes the
      // image rather than a state the drill saw a round trip earlier.
      const at = await wildRead(p);
      if (r && at.wild.state !== r.wild.state) {
        errors.push(`wild: ${name} was captured with the dragon in '${at.wild.state}', not the '${r.wild.state}' the drill waited for`);
      }
      say(`shot: ${SHOTS}/${name}  (${what}) — ${wildLine(at)}; tells: look ${fmt(at.dragon.attitude.look)} neck ${fmt(at.dragon.attitude.neck)} ` +
        `head ${fmt(at.dragon.attitude.head)} lower ${fmt(at.dragon.attitude.lower)} tail ${fmt(at.dragon.attitude.tail)} ` +
        `fold ${fmt(at.dragon.attitude.fold)} rise ${fmt(at.dragon.attitude.rise)} rear ${fmt(at.dragon.attitude.rear)}; walk ${fmt(at.dragon.walkWeight)} ` +
        `flap ${fmt(at.dragon.flap)} glide ${fmt(at.dragon.glide)} altitude ${fmt(at.dragon.altitude)}; calm meter ${at.calmMeter}`);
      say(`  framing: camera ${sc.dragon ? sc.dragon.cameraDistance.toFixed(2) : '?'} from the body at ${elev}° up` +
        `${withKeeper ? ' on the pair' : ' on the dragon alone'}; in a ${sc.viewport[0]}x${sc.viewport[1]} frame the dragon is ` +
        `${sc.dragon ? sc.dragon.widthPx.toFixed(0) : '?'} px across centred at ${fmt(sc.dragon?.px ?? [])}, ` +
        `the keeper ${sc.keeper ? sc.keeper.heightPx.toFixed(0) : '?'} px tall at ${fmt(sc.keeper?.px ?? [])}` +
        `${withKeeper ? `; island turned ${framed.turnedDeg.toFixed(1)}° for a clear view of the keeper (${framed.seen ? 'clear' : 'NOT clear at any turn'})` : ''}` +
        `; the world was held still for the frame${r ? `, ${at.tick - r.tick} ticks after the drill's '${r.wild.state}'` : ''}`);
      if (withKeeper && !framed.seen) errors.push(`wild: ${name} has something drawn in front of the keeper at every turn tried`);
      if (sc.dragon) {
        const [cx, cy] = sc.dragon.px, rad = sc.dragon.widthPx / 2;
        if (cy - rad < HUD_BOTTOM_PX || cx - rad < 0 || cx + rad > sc.viewport[0] || cy + rad > sc.viewport[1]) {
          errors.push(`wild: ${name} does not hold the whole dragon clear of the HUD: centre ${fmt(sc.dragon.px)}, ` +
            `${sc.dragon.widthPx.toFixed(0)} px across, frame ${sc.viewport[0]}x${sc.viewport[1]}`);
        }
      }
      await p.evaluate(() => { globalThis.__dragonveinShot.release(); globalThis.__dragonveinWild.hold(false); });
    };
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      await p.waitForFunction(() => (globalThis.__dragonveinStats?.().windInstances ?? 0) > 0, undefined, { timeout: 30_000 });
      const T = r0.temperament;
      const staged = await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), T.notice + 1.4);
      if (!staged) throw new Error('no open approach to the dragon to stage the keeper on');
      await p.evaluate(([x, z]) => globalThis.__dragonveinWild.frameAcross(x, z), staged);
      // 17: far, it wanders. Wait for it to be walking.
      const wander = await waitWild(p, (r) => r.wild.state === 'wander' && r.dragon.walkWeight > 0.6, 60_000, 'the dragon to wander');
      await p.evaluate(() => globalThis.__dragonveinWild.pinSpin(globalThis.__dragonveinWild.read().spin));
      await shoot('17-wild-wander.png', 'the dragon wanders, walking; the keeper is far, outside this frame', wander,
        { dist: 3.0, elev: 20, withKeeper: false });
      if (wander.keeperDistance < T.notice) errors.push('wild: 17 was taken with the keeper inside the notice radius');
      // 18: the keeper walks in to just inside the notice radius and stands: it looks up at it.
      // Walk in to `gap` from the dragon: `approach` picks a spot at that distance the keeper
      // can stand on and has a route to, on the bearing nearest the one it is already on. The
      // straight line from keeper to dragon is not usable as an aim point on a dressed island —
      // see `approach` in src/main.ts for what that cost the clip below.
      const walkToward = async (gap, run) => p.evaluate(([g, rn]) => {
        const h = globalThis.__dragonveinWild;
        const at = h.approach(g);
        if (!at) throw new Error(`no standing spot ${g.toFixed(2)} from the dragon to walk to`);
        return h.walkTo(at[0], at[1], rn);
      }, [gap, run]);
      // The dragon has wandered: stage the keeper afresh on an open approach, seen across the screen.
      const restaged = await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), T.notice + 1.4);
      if (!restaged) throw new Error('no open approach to the dragon to stage the keeper on');
      await p.evaluate(([x, z]) => globalThis.__dragonveinWild.frameAcross(x, z), restaged);
      await waitWild(p, (r) => r.wild.state === 'graze' || r.wild.state === 'wander', 10_000, 'the dragon at ease again');
      await walkToward(T.comfort + 0.45, false);
      const alert = await waitWild(p, (r) => r.wild.state === 'alert' && r.keeper.v === 0 && r.dragon.attitude.neck > 0.3
        && Math.abs(r.dragon.attitude.look) < 1.4, 40_000, 'an alert dragon');
      await shoot('18-wild-alert.png', 'head up, turned to the keeper', alert, { dist: 3.0, elev: 26 });
      // 21: the keeper walks on in: it crouches, turns its tail and walks off.
      await walkToward(T.flight + 0.4, false);
      const wary = await waitWild(p, (r) => r.wild.state === 'wary' && r.dragon.attitude.lower > 0.28, 20_000, 'a wary dragon');
      await shoot('21-wild-wary.png', 'crouched low, tail to the keeper, walking off', wary, { dist: 3.0, elev: 26 });
      // 19: the keeper stands still inside the comfort ring: calm rises, it settles.
      const settle = await waitWild(p, (r) => r.wild.state === 'settle' && r.wild.calm >= 0.5 && r.keeper.v === 0, 90_000, 'a settled dragon');
      await shoot('19-wild-settle.png', 'the keeper near and still; calm risen, the dragon settled', settle,
        { dist: 3.0, elev: 28 });
      // 20: the keeper runs at it: it takes off.
      const calmBefore = settle.wild.calm;
      await walkToward(0, true);
      const flee = await waitWild(p, (r) => r.wild.state === 'flee' && r.dragon.altitude > 0.25 && r.dragon.flap > 0.5, 20_000, 'a take-off');
      await shoot('20-wild-flee.png', 'mid-takeoff after a rush', flee, { dist: 3.0, elev: 20, withKeeper: false });
      say(`wild: the rush cost calm ${calmBefore.toFixed(3)} -> ${flee.wild.calm.toFixed(3)}; it flies from ${fmt(flee.wild.from)} to ${fmt(flee.wild.goal)}`);
      if (!(flee.wild.calm < calmBefore)) errors.push('wild: fleeing did not cost calm');
      const landed = await waitWild(p, (r) => r.wild.state !== 'flee', 30_000, 'the landing');
      say(`wild: landed — ${wildLine(landed)}; altitude ${fmt(landed.dragon.altitude)}`);
      for (const e of wildErrors) errors.push(`wild shots: ${e}`);
    } catch (e) {
      errors.push(`wild shots drill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
  await flush();

  // The clip (criterion 4): one slow approach, from far through alert to settle — the last
  // metres in short, careful steps — and then a rush that puts it to flight. Orbit view, the
  // island's spin pinned so the approach crosses the screen; real time.
  await rm(WILD_CLIP, { force: true });
  for (let attempt = 1; attempt <= TURNTABLE_ATTEMPTS; attempt++) {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: TURNTABLES, size: VIEW } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`wild clip: ${String(e)}`));
    let saved = false;
    try {
      await p.goto(wildUrl, { waitUntil: 'load', timeout: 30_000 });
      const r0 = await wildReady(p);
      if (!r0.dragon.ready) throw new Error(`the wild dragon was not built: ${r0.dragon.error}`);
      const T = r0.temperament;
      await p.evaluate(() => globalThis.__dragonveinWild.orbit(39.3, 16, 15));
      const staged = await p.evaluate((d) => globalThis.__dragonveinWild.stage(d), T.notice + 1.6);
      if (!staged) throw new Error('no open approach to the dragon to stage the keeper on');
      await p.evaluate(([x, z]) => globalThis.__dragonveinWild.frameAcross(x, z), staged);
      /*
       * The camera holds the pair for the whole clip instead of watching from the orbit's wide
       * default. Run 35's clip put the dragon at about 100 px and the keeper at about 15 px, so
       * neither the tells nor the approach could be read from it (FINDINGS, M8b cycle 1, D2).
       * `closeUp` re-aims on a timer inside the page: it tracks the midpoint as the keeper walks
       * in, and pulls back of its own accord when the flee carries the dragon away.
       */
      await p.evaluate(([d, e]) => {
        const h = globalThis.__dragonveinWild;
        h.closeUp(d, e, true);
        setInterval(() => h.closeUp(d, e, true), 60);
      }, [3.0, 24]);
      const t0 = Date.now();
      const marks = [];
      const mark = async (what) => {
        const r = await wildRead(p);
        const sc = await p.evaluate(() => globalThis.__dragonveinWild.screen());
        marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${what}: ${r.wild.state} calm ${r.wild.calm.toFixed(2)}, ` +
          `dragon ${sc.dragon ? sc.dragon.widthPx.toFixed(0) : '?'} px / keeper ${sc.keeper ? sc.keeper.heightPx.toFixed(0) : '?'} px`);
        return r;
      };
      await p.waitForTimeout(1500);
      await mark('far');
      const toward = (gap, run) => p.evaluate(([g, rn]) => {
        const h = globalThis.__dragonveinWild;
        const at = h.approach(g);
        if (!at) throw new Error(`no standing spot ${g.toFixed(2)} from the dragon to walk to`);
        return h.walkTo(at[0], at[1], rn);
      }, [gap, run]);
      await toward(T.comfort + 0.2, false);
      await waitWild(p, (r) => r.keeper.v === 0, 30_000, 'the keeper to stop');
      await mark('stopped at the comfort ring');
      // Careful steps in: each aims 0.45 nearer than the keeper stands, so each is shorter than
      // SLOW / CAREFUL and creeps, with a pause between. It waits for the keeper to *stop*
      // before the next step rather than for a fixed 1.6 s, and takes up to twelve of them
      // rather than six: a step around a bush is longer than the 0.45 it closes, so on a fixed
      // clock the keeper was still walking when the next step re-aimed it, and the approach
      // stalled at 3.55 from the dragon — outside its comfort ring of 3.34, where calm cannot
      // rise, which is what timed this clip out waiting for a settled dragon.
      for (let i = 0; i < 12; i++) {
        const r = await wildRead(p);
        if (r.keeperDistance < T.flight + 0.6 || r.wild.state === 'settle') break;
        await toward(Math.max(T.flight + 0.5, r.keeperDistance - 0.45), false);
        await waitWild(p, (q) => q.keeper.v === 0, 20_000, 'the keeper to stop between careful steps')
          .catch(() => null);
        await p.waitForTimeout(900);
      }
      await waitWild(p, (r) => r.wild.state === 'settle' && r.wild.calm > 0.45, 90_000, 'a settled dragon');
      await mark('settled');
      await p.waitForTimeout(1500);
      await toward(0, true);
      await waitWild(p, (r) => r.wild.state === 'flee', 20_000, 'the flight');
      await mark('rushed: flees');
      await waitWild(p, (r) => r.wild.state !== 'flee', 30_000, 'the landing');
      await mark('landed');
      await p.waitForTimeout(1200);
      const video = p.video();
      await ctx.close();
      if (video) {
        await video.saveAs(WILD_CLIP);
        await video.delete();
        say(`clip: ${WILD_CLIP}  (${((Date.now() - t0) / 1000).toFixed(1)} s, ${(await stat(WILD_CLIP)).size} bytes, attempt ${attempt}) — ${marks.join(' · ')}`);
        saved = true;
      }
    } catch (e) {
      await ctx.close().catch(() => {});
      say(`clip: attempt ${attempt} failed — ${e instanceof Error ? e.message : String(e)}`);
    }
    if (saved) break;
    if (attempt === TURNTABLE_ATTEMPTS) errors.push(`clip: no ${WILD_CLIP} after ${TURNTABLE_ATTEMPTS} attempts`);
  }
  await flush();

  // Nothing stale survives a failure: a left-over .webm from an earlier build sitting
  // next to a log that says the gate failed is a critic scoring the wrong artefact.
  await rm(TURNTABLE, { force: true });

  for (let attempt = 1; attempt <= TURNTABLE_ATTEMPTS; attempt++) {
    const videoContext = await browser.newContext({
      viewport: VIEW,
      recordVideo: { dir: TURNTABLES, size: VIEW },
    });
    const videoPage = await videoContext.newPage();
    videoPage.on('pageerror', (e) => errors.push(`turntable: ${String(e)}`));
    let saved = false;
    try {
      await videoPage.goto(preview.url, { waitUntil: 'load', timeout: 30_000 });
      // Start the clock at the first *rendered* frame, not at navigation: the boot splash
      // is not the island rotating, and an earlier recording was 59% splash.
      await videoPage.waitForFunction(
        () => (globalThis.__dragonveinStats?.().drawCalls ?? 0) > 0,
        undefined, { timeout: 30_000 },
      );
      const firstFrameAt = Date.now();
      await videoPage.waitForTimeout(TURNTABLE_MS);
      const rotated = await videoPage.evaluate(() => globalThis.__dragonveinStats?.() ?? null);
      const video = videoPage.video();
      await videoContext.close();          // the file is only written on context close
      if (video) {
        await video.saveAs(TURNTABLE);
        await video.delete();              // drop Playwright's random-named original
        const bytes = (await stat(TURNTABLE)).size;
        say(`turntable: ${TURNTABLE}  (${Date.now() - firstFrameAt}ms recorded after the ` +
          `first drawn frame, ${bytes} bytes, attempt ${attempt}, rubric A5)`);
        say(`turntable: stats at the end of the recording ${JSON.stringify(rotated)}`);
        saved = true;
      }
    } catch (e) {
      await videoContext.close().catch(() => {});
      say(`turntable: attempt ${attempt} failed — ${e instanceof Error ? e.message : String(e)}`);
    }
    if (saved) break;
    if (attempt === TURNTABLE_ATTEMPTS) {
      errors.push(`turntable: no video after ${TURNTABLE_ATTEMPTS} attempts, so rubric A5 ` +
        'has no motion artefact and would be judged from stills again');
    }
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
