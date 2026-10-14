#!/usr/bin/env node
/**
 * Render the runtime dragon for review: `node tools/dragon-sheet.mjs` (after `npm run build`).
 *
 *   artifacts/variants/dragon-full.png          the 8-dragon sheet (dragon.html)
 *   artifacts/turntables/dragon-full.webm        one dragon turned through 360° in 4 s (slot G, a sail)
 *   artifacts/turntables/dragon-full.frame00.png its first frame, for a quick look
 *   artifacts/turntables/dragon-spread.webm      the same for the first spread-winged sheet dragon
 *   artifacts/turntables/dragon-segmented.webm   and the first segmented one (each with a .frame00.png)
 *   artifacts/variants/dragon-full.json          build time, triangle counts, each dragon's wing form
 *   artifacts/variants/dragon-greyscale.png      the same sheet with all colour removed (?grey=1)
 *   artifacts/variants/dragon-silhouette.json    outline numbers from per-dragon masks at the
 *                                                sheet camera (?mask=1; tools/silhouette.mjs)
 *   artifacts/variants/dragon-sweep.json         the one-gene sweep (M3f criterion 1): a fixed
 *                                                base genome with one gene at a time set to
 *                                                its low, middle and high value (?sweep=1)
 *   artifacts/variants/dragon-idle-a.png         the idle (M7a): the sheet at two fixed idle
 *   artifacts/variants/dragon-idle-b.png         times, the same camera; b is the middle of
 *                                                sheet dragon A's blink
 *   artifacts/variants/dragon-idle-diff.png      the pixels that changed between them, white
 *                                                over the dimmed a; the run fails if none did
 *   artifacts/variants/dragon-idle.json          the times, the changed-pixel count and how
 *                                                many of them lie on the dragons
 *   artifacts/turntables/dragon-idle.webm        one dragon idling, close up, a few seconds of
 *                                                idle time with a blink in them (and .frame00.png)
 *
 * Every other render is taken at the idle's rest pose (`__dragonView.idleAt(null)`), the
 * mesh as built, so it is comparable with every render before M7a and reproducible.
 *
 * `--only=sheet,grey,silhouette,sweep,turntables,idle` runs a subset, for iterating on one
 * number; dragon-full.json is written only by a full run.
 *
 * Headless Chromium on SwiftShader, as every gate here runs. CLAUDE.md §1.4: an asset
 * nobody has seen rendered is not done, and the critics score these files.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import pw from 'playwright';
import { decodePng, encodePng } from './png.mjs';
import { startPreview } from './preview-server.mjs';
import { SWEEP_GENES, maskFromRgb, silhouetteReport, sweepBase, sweepReport, sweepValues } from './silhouette.mjs';

const TURN_FRAMES = 96;
const TURN_FPS = 24;
const TURN_PICK = Number(process.env.DRAGON_TURN ?? 6); // sheet slot G: the child of A × B
/** The sheet viewport, and so its camera: every sheet render here uses this one. */
const SHEET_VIEW = { width: 1800, height: 760 };
/** src/dragon-view.ts SHEET_ORTHO_WIDTH: world units across the sheet at this aspect. */
const SHEET_ORTHO_WIDTH = 44;
/** The sweep's viewports and scales: src/dragon-view.ts SWEEP_PX_PER_UNIT and SWEEP_HEAD_PX_PER_UNIT. */
const SWEEP_BODY_VIEW = { width: 900, height: 560 };
const SWEEP_HEAD_VIEW = { width: 600, height: 600 };
const SWEEP_PPU = { body: SHEET_VIEW.width / SHEET_ORTHO_WIDTH, head: 100 };
/**
 * The idle (M7a). The two sheet shots: b at the middle of sheet dragon IDLE_BLINK_CELL's
 * first blink after 1 s of idle time, a IDLE_A_BEFORE seconds earlier. The clip: sheet slot
 * IDLE_CLIP_SLOT through a close camera (`?cam=`, on its chest, neck and head), IDLE_CLIP_S
 * seconds of idle time from IDLE_CLIP_LEAD before its first blink, at TURN_FPS.
 */
const IDLE_BLINK_CELL = 0;
const IDLE_A_BEFORE = 1.3;
const IDLE_CLIP_SLOT = 0;
const IDLE_CLIP_CAM = '4.6,2.5,6.4,1.25,1.35,0';
const IDLE_CLIP_S = 6;
const IDLE_CLIP_LEAD = 1.0;
/** A pixel changed when any channel moved by more than this (out of 255). */
const IDLE_DIFF_THRESHOLD = 8;
/** "On a dragon": inside the rest-pose mask grown by this many pixels (the sway is ~2 px here). */
const IDLE_MASK_GROW = 4;

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const want = (stage) => !only || only.has(stage);

if (!existsSync('dist/dragon.html')) {
  console.error('dragon-sheet: no dist/dragon.html. Run `npm run build` first.');
  process.exit(1);
}
mkdirSync('artifacts/variants', { recursive: true });
mkdirSync('artifacts/turntables', { recursive: true });

const errors = [];
let browser = null;
let server = null;
try {
  browser = await pw.chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const preview = await startPreview(4176);
  server = preview.proc;

  const open = async (query, viewport) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${preview.url}dragon.html${query}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => window.__dragonView?.ready === true, null, { timeout: 30_000 });
    // Every render here is pinned: the rest pose, unless a stage asks for an idle time.
    await page.evaluate(() => window.__dragonView.idleAt(null));
    await page.waitForTimeout(300);
    return page;
  };

  const sheet = await open('', SHEET_VIEW);
  const stats = await sheet.evaluate(() => ({
    buildMs: window.__dragonView.buildMs, buildTimes: window.__dragonView.buildTimes,
    startupMs: window.__dragonView.startupMs, tris: window.__dragonView.tris,
    sheet: window.__dragonView.sheet, genes: window.__dragonView.genes,
  }));
  if (want('sheet')) {
    await sheet.screenshot({ path: 'artifacts/variants/dragon-full.png' });
    console.log(`sheet: artifacts/variants/dragon-full.png — 8 dragons, ${stats.tris} tris, built in ${stats.buildMs.toFixed(0)} ms`);
  }

  // The greyscale test: same eight, same camera, no hue.
  if (want('grey')) {
    const greyPage = await open('?grey=1', SHEET_VIEW);
    await greyPage.screenshot({ path: 'artifacts/variants/dragon-greyscale.png' });
    console.log('greyscale: artifacts/variants/dragon-greyscale.png');
  }

  // The one-gene sweep: does each gene's documented range reach the outline?
  if (want('sweep')) {
    const tmpS = mkdtempSync(path.join(os.tmpdir(), 'dragon-sweep-'));
    const pages = { body: await open('?sweep=1', SWEEP_BODY_VIEW), head: await open('?sweep=1', SWEEP_HEAD_VIEW) };
    const shot = async (crop, p) => {
      const pg = pages[crop];
      const built = await pg.evaluate(([ph, c]) => window.__dragonView.sweepShow(ph, c), [p, crop]);
      const file = path.join(tmpS, 'm.png');
      await pg.screenshot({ path: file });
      return { mask: maskFromRgb(decodePng(file)), built };
    };
    const base = sweepBase(stats.genes);
    const baseMask = { body: (await shot('body', base)).mask, head: (await shot('head', base)).mask };
    const runs = [];
    for (const [gene, crop] of SWEEP_GENES) {
      const samples = [];
      for (const value of sweepValues(stats.genes, gene)) samples.push({ value, mask: (await shot(crop, { ...base, [gene]: value })).mask });
      runs.push({ gene, crop, base: baseMask[crop], samples });
    }
    rmSync(tmpS, { recursive: true, force: true });
    const sw = sweepReport(runs, SWEEP_PPU);
    writeFileSync('artifacts/variants/dragon-sweep.json', `${JSON.stringify({
      what: 'one-gene sweep: a fixed base genome (every gene mid-range, enums at their first value) with one gene ' +
        'at a time set to its low, middle and high value; a flat mask per build at the sheet camera direction ' +
        '(dragon.html?sweep=1). body genes: the whole dragon at the sheet scale, IoU aligned on the bounding box ' +
        '(centre x, base y) as dragon-silhouette.json; hornCount and crestType: a head crop centred on the skull, ' +
        'IoU in place',
      camera: { body: { viewport: SWEEP_BODY_VIEW, pxPerUnit: Math.round(SWEEP_PPU.body * 1000) / 1000 },
        head: { viewport: SWEEP_HEAD_VIEW, pxPerUnit: SWEEP_PPU.head } },
      units: 'area in world units^2, width and height in world units',
      base, ...sw,
    }, null, 2)}\n`);
    console.log('sweep: artifacts/variants/dragon-sweep.json');
    console.log('  gene          crop   low→high IoU   area low/mid/high      height low/mid/high');
    for (const g of sw.genes) {
      console.log(`  ${g.gene.padEnd(13)} ${g.crop.padEnd(5)}  ${g.lowVsHighIoU.toFixed(3)} ${g.pass ? 'ok  ' : 'FAIL'}    ` +
        `${[g.low, g.mid, g.high].map((x) => x.area.toFixed(2).padStart(6)).join(' ')}    ${[g.low, g.mid, g.high].map((x) => x.height.toFixed(2).padStart(5)).join(' ')}`);
    }
  }

  // Outline numbers: one flat mask per dragon, at the sheet camera.
  if (want('silhouette')) {
    const maskPage = await open('?mask=1', SHEET_VIEW);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'dragon-mask-'));
    const masks = [];
    for (let k = 0; k < stats.sheet.length; k++) {
      await maskPage.evaluate((i) => window.__dragonView.showOnly(i), k);
      const file = path.join(tmp, `m${k}.png`);
      await maskPage.screenshot({ path: file });
      masks.push(maskFromRgb(decodePng(file)));
    }
    rmSync(tmp, { recursive: true, force: true });
    const pxPerUnit = SHEET_VIEW.width / (SHEET_ORTHO_WIDTH * Math.max(1, 2.37 / (SHEET_VIEW.width / SHEET_VIEW.height)));
    const sil = silhouetteReport(masks, stats.sheet, stats.genes, pxPerUnit);
    writeFileSync('artifacts/variants/dragon-silhouette.json', `${JSON.stringify({
      what: 'per-dragon silhouette from a flat mask at the sheet camera (dragon.html?mask=1); ' +
        'IoU after aligning each mask on its own bounding box (centre x, base y); ' +
        'genes differing: int/enum when unequal, continuous when >= 10% of range apart',
      camera: { viewport: SHEET_VIEW, orthoWidth: SHEET_ORTHO_WIDTH, pxPerUnit: Math.round(pxPerUnit * 1000) / 1000 },
      units: 'area in world units^2, width and height in world units, at the sheet camera (orthographic)',
      ...sil,
    }, null, 2)}\n`);
    const fmt = (x) => x.toFixed(2).padStart(6);
    console.log('silhouette: artifacts/variants/dragon-silhouette.json');
    console.log('  cell form        area  width height   mean IoU vs others');
    for (const d of sil.dragons) {
      const mine = sil.pairs.filter((p) => p.a === d.label || p.b === d.label).map((p) => p.iou);
      console.log(`  ${d.label}    ${(d.wingForm ?? '-').padEnd(10)} ${fmt(d.area)} ${fmt(d.width)} ${fmt(d.height)}   ${(mine.reduce((a, b) => a + b, 0) / mine.length).toFixed(3)}`);
    }
    const S = sil.summary;
    console.log(`  pairwise IoU: mean ${S.meanIoU.toFixed(3)}, min ${S.minIoU.toFixed(3)}, max ${S.maxIoU.toFixed(3)} (${S.mostAlike}); ` +
      `area ${S.area.min}–${S.area.max}, width ${S.width.min}–${S.width.max}, height ${S.height.min}–${S.height.max}`);
  }

  // Turntables: slot G (the default, a sail) as dragon-full, then the first sheet dragon of
  // each other wing form, so every form is seen turning (M3e cycle 1).
  const turntables = want('turntables') ? [{ name: 'dragon-full', slot: TURN_PICK }] : [];
  for (const form of want('turntables') ? ['spread', 'segmented'] : []) {
    const slot = stats.sheet.findIndex((d) => d.wingForm === form);
    if (slot >= 0 && slot !== TURN_PICK) turntables.push({ name: `dragon-${form}`, slot });
  }
  for (const t of turntables) {
    t.wingForm = stats.sheet[t.slot]?.wingForm ?? null;
    t.label = stats.sheet[t.slot]?.label ?? null;
    const turn = await open(`?view=turn&i=${t.slot}`, { width: 960, height: 720 });
    const dir = path.join('artifacts', 'turntables', `${t.name}.frames`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < TURN_FRAMES; f++) {
      await turn.evaluate((rad) => window.__dragonView.setYaw(rad), (f / TURN_FRAMES) * Math.PI * 2);
      await turn.screenshot({ path: path.join(dir, `f${String(f).padStart(3, '0')}.png`) });
    }
    await turn.close();
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(TURN_FPS),
      '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p',
      `artifacts/turntables/${t.name}.webm`], { encoding: 'utf8' });
    if (ff.status !== 0) errors.push(`ffmpeg: ${ff.stderr}`);
    spawnSync('cp', [path.join(dir, 'f000.png'), `artifacts/turntables/${t.name}.frame00.png`]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`turntable: artifacts/turntables/${t.name}.webm — sheet slot ${t.slot} (${t.label}, ${t.wingForm} wings), ${TURN_FRAMES} frames at ${TURN_FPS} fps`);
  }

  // The idle (M7a): two fixed idle times at the sheet camera, their difference, and a clip.
  if (want('idle')) {
    const idlePage = await open('', SHEET_VIEW);
    const tB = await idlePage.evaluate(([k]) => window.__dragonView.blinkMid(k, 1), [IDLE_BLINK_CELL]);
    const tA = tB - IDLE_A_BEFORE;
    const waves = await idlePage.evaluate(([a, b]) => window.__dragonView.idle.map((_, k) => ({
      a: window.__dragonView.idleWaves(k, a), b: window.__dragonView.idleWaves(k, b),
    })), [tA, tB]);
    const sheetIdle = await idlePage.evaluate(() => window.__dragonView.idle);
    const shots = {};
    for (const [name, t] of [['a', tA], ['b', tB]]) {
      await idlePage.evaluate((x) => window.__dragonView.idleAt(x), t);
      const file = `artifacts/variants/dragon-idle-${name}.png`;
      await idlePage.screenshot({ path: file });
      shots[name] = decodePng(file);
    }
    await idlePage.close();
    // Where the dragons are: the rest-pose masks, all eight, at the same camera.
    const maskPage = await open('?mask=1', SHEET_VIEW);
    const tmpI = mkdtempSync(path.join(os.tmpdir(), 'dragon-idle-'));
    await maskPage.screenshot({ path: path.join(tmpI, 'all.png') });
    const rest = maskFromRgb(decodePng(path.join(tmpI, 'all.png')));
    rmSync(tmpI, { recursive: true, force: true });
    await maskPage.close();
    const { w, h } = shots.a;
    const near = grow(rest, IDLE_MASK_GROW);
    const diff = new Uint8Array(w * h * 3);
    let changed = 0, onDragon = 0;
    for (let i = 0; i < w * h; i++) {
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(shots.a.px[3 * i + c] - shots.b.px[3 * i + c]));
      if (d > IDLE_DIFF_THRESHOLD) {
        changed++;
        if (near[i]) onDragon++;
        diff[3 * i] = diff[3 * i + 1] = diff[3 * i + 2] = 255;
      } else {
        for (let c = 0; c < 3; c++) diff[3 * i + c] = shots.a.px[3 * i + c] >> 2;
      }
    }
    writeFileSync('artifacts/variants/dragon-idle-diff.png', encodePng(w, h, diff));
    const share = changed ? onDragon / changed : 0;
    const blinking = (when) => waves.map((x, k) => ({ k, shut: x[when].shut })).filter((x) => x.shut > 0.05);
    console.log(`idle: artifacts/variants/dragon-idle-a.png (t ${tA.toFixed(3)} s) and -b.png (t ${tB.toFixed(3)} s, ` +
      `mid-blink of cell ${stats.sheet[IDLE_BLINK_CELL].label}): ${changed} pixels changed, ` +
      `${onDragon} (${(100 * share).toFixed(1)} %) on a dragon (rest mask ±${IDLE_MASK_GROW} px), the rest their moving shadows; ` +
      `diff in artifacts/variants/dragon-idle-diff.png`);
    if (changed === 0) errors.push('idle: dragon-idle-a.png and dragon-idle-b.png are identical — the dragons do not move');
    if (waves[IDLE_BLINK_CELL].b.shut < 0.99) errors.push(`idle: cell ${IDLE_BLINK_CELL} is not mid-blink in shot b (shut ${waves[IDLE_BLINK_CELL].b.shut})`);

    // The clip: one dragon, close, a few seconds of idle time with a blink in it.
    const clip = await open(`?view=turn&i=${IDLE_CLIP_SLOT}&cam=${IDLE_CLIP_CAM}`, { width: 960, height: 720 });
    const firstBlink = await clip.evaluate(() => window.__dragonView.blinkMid(0, 1));
    const t0 = Math.max(0, firstBlink - IDLE_CLIP_LEAD);
    const frames = Math.round(IDLE_CLIP_S * TURN_FPS);
    const dir = path.join('artifacts', 'turntables', 'dragon-idle.frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < frames; f++) {
      await clip.evaluate((t) => window.__dragonView.idleAt(t), t0 + f / TURN_FPS);
      await clip.screenshot({ path: path.join(dir, `f${String(f).padStart(3, '0')}.png`) });
    }
    await clip.close();
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(TURN_FPS),
      '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-pix_fmt', 'yuv420p',
      'artifacts/turntables/dragon-idle.webm'], { encoding: 'utf8' });
    if (ff.status !== 0) errors.push(`ffmpeg: ${ff.stderr}`);
    spawnSync('cp', [path.join(dir, 'f000.png'), 'artifacts/turntables/dragon-idle.frame00.png']);
    rmSync(dir, { recursive: true, force: true });
    console.log(`idle clip: artifacts/turntables/dragon-idle.webm — sheet slot ${IDLE_CLIP_SLOT} ` +
      `(${stats.sheet[IDLE_CLIP_SLOT].label}), ${frames} frames at ${TURN_FPS} fps, idle time ${t0.toFixed(2)}–${(t0 + IDLE_CLIP_S).toFixed(2)} s, ` +
      `blinks at ${firstBlink.toFixed(2)} s`);
    const r3 = (x) => Math.round(x * 1000) / 1000;
    writeFileSync('artifacts/variants/dragon-idle.json', `${JSON.stringify({
      what: 'M7a idle: the sheet at two fixed idle times (dragon.html, __dragonView.idleAt), the same camera; ' +
        'a pixel changed when any channel moved by more than the threshold; "on a dragon" means inside the ' +
        'rest-pose silhouette masks (?mask=1) grown by maskGrowPx',
      a: { file: 'artifacts/variants/dragon-idle-a.png', t: r3(tA), blinking: blinking('a') },
      b: { file: 'artifacts/variants/dragon-idle-b.png', t: r3(tB), midBlinkOf: stats.sheet[IDLE_BLINK_CELL].label, blinking: blinking('b') },
      diff: 'artifacts/variants/dragon-idle-diff.png', threshold: IDLE_DIFF_THRESHOLD, maskGrowPx: IDLE_MASK_GROW,
      changedPixels: changed, onDragonPixels: onDragon, onDragonShare: r3(share),
      clip: { file: 'artifacts/turntables/dragon-idle.webm', slot: IDLE_CLIP_SLOT, label: stats.sheet[IDLE_CLIP_SLOT].label,
        cam: IDLE_CLIP_CAM, fps: TURN_FPS, frames, t0: r3(t0), blinkAt: r3(firstBlink) },
      // Each sheet dragon's idleParams (src/assets/dragon/idle.ts): seconds and world units.
      idle: Object.fromEntries(stats.sheet.map((d, k) => [d.label,
        Object.fromEntries(Object.entries(sheetIdle[k]).map(([x, v]) => [x, r3(v)]))])),
    }, null, 2)}\n`);
  }

  if (!only) writeFileSync('artifacts/variants/dragon-full.json', `${JSON.stringify({
    sheetGenomes: 8, sheetTris: stats.tris, sheetBuildMs: Math.round(stats.buildMs * 10) / 10,
    // Per dragon: the round trip through the mesh worker (post genome -> geometry ready), on
    // SwiftShader's host CPU, after the worker's one-off spawn and warm-up (startupMs). The
    // budget is 120 ms per bred dragon (CLAUDE.md §2.3); gate:meshgen enforces it.
    where: 'mesh worker (src/assets/dragon/worker.ts), round trip',
    startupMs: Math.round(stats.startupMs * 10) / 10,
    perDragonMs: stats.buildTimes.map((t) => Math.round(t * 10) / 10),
    perDragonMaxMs: Math.round(Math.max(...stats.buildTimes) * 10) / 10,
    firstDragonMs: Math.round(stats.buildTimes[0] * 10) / 10,
    budgetMsPerDragon: 120,
    turntable: { slot: TURN_PICK, frames: TURN_FRAMES, fps: TURN_FPS },
    turntables: turntables.map((t) => ({ file: `artifacts/turntables/${t.name}.webm`, slot: t.slot, label: t.label, wingForm: t.wingForm })),
    // Each sheet cell's wing form: derived from wingFingers and wingShape (graph.ts wingForm).
    dragons: stats.sheet.map((d) => ({ label: d.label, gid: d.gid, wingForm: d.wingForm ?? null,
      wingFingers: d.phenotype.wingFingers, wingShape: Math.round(d.phenotype.wingShape * 1000) / 1000 })),
    renderer: 'SwiftShader (headless)', errors,
  }, null, 2)}\n`);
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server?.kill();
}
/** A mask grown by `r` pixels (a square neighbourhood), as one byte per pixel. */
function grow(m, r) {
  const out = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.on[y * m.w + x]) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(m.h - 1, y + r); yy++) {
        out.fill(1, yy * m.w + Math.max(0, x - r), yy * m.w + Math.min(m.w - 1, x + r) + 1);
      }
    }
  }
  return out;
}

if (errors.length) {
  console.error(`dragon-sheet FAIL:\n${errors.join('\n')}`);
  process.exit(1);
}
