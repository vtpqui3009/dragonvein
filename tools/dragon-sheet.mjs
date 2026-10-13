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
 *
 * Headless Chromium on SwiftShader, as every gate here runs. CLAUDE.md §1.4: an asset
 * nobody has seen rendered is not done, and the critics score these files.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import pw from 'playwright';
import { decodePng } from './png.mjs';
import { startPreview } from './preview-server.mjs';
import { maskFromRgb, silhouetteReport } from './silhouette.mjs';

const TURN_FRAMES = 96;
const TURN_FPS = 24;
const TURN_PICK = Number(process.env.DRAGON_TURN ?? 6); // sheet slot G: the child of A × B
/** The sheet viewport, and so its camera: every sheet render here uses this one. */
const SHEET_VIEW = { width: 1800, height: 760 };
/** src/dragon-view.ts SHEET_ORTHO_WIDTH: world units across the sheet at this aspect. */
const SHEET_ORTHO_WIDTH = 44;

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
    await page.waitForTimeout(300);
    return page;
  };

  const sheet = await open('', SHEET_VIEW);
  const stats = await sheet.evaluate(() => ({
    buildMs: window.__dragonView.buildMs, buildTimes: window.__dragonView.buildTimes,
    startupMs: window.__dragonView.startupMs, tris: window.__dragonView.tris,
    sheet: window.__dragonView.sheet, genes: window.__dragonView.genes,
  }));
  await sheet.screenshot({ path: 'artifacts/variants/dragon-full.png' });
  console.log(`sheet: artifacts/variants/dragon-full.png — 8 dragons, ${stats.tris} tris, built in ${stats.buildMs.toFixed(0)} ms`);

  // The greyscale test: same eight, same camera, no hue.
  const greyPage = await open('?grey=1', SHEET_VIEW);
  await greyPage.screenshot({ path: 'artifacts/variants/dragon-greyscale.png' });
  console.log('greyscale: artifacts/variants/dragon-greyscale.png');

  // Outline numbers: one flat mask per dragon, at the sheet camera.
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

  // Turntables: slot G (the default, a sail) as dragon-full, then the first sheet dragon of
  // each other wing form, so every form is seen turning (M3e cycle 1).
  const turntables = [{ name: 'dragon-full', slot: TURN_PICK }];
  for (const form of ['spread', 'segmented']) {
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

  writeFileSync('artifacts/variants/dragon-full.json', `${JSON.stringify({
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
if (errors.length) {
  console.error(`dragon-sheet FAIL:\n${errors.join('\n')}`);
  process.exit(1);
}
