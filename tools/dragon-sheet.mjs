#!/usr/bin/env node
/**
 * Render the runtime dragon for review: `node tools/dragon-sheet.mjs` (after `npm run build`).
 *
 *   artifacts/variants/dragon-full.png          the 8-dragon sheet (dragon.html)
 *   artifacts/turntables/dragon-full.webm        one dragon turned through 360° in 4 s
 *   artifacts/turntables/dragon-full.frame00.png its first frame, for a quick look
 *   artifacts/variants/dragon-full.json          build time and triangle counts
 *
 * Headless Chromium on SwiftShader, as every gate here runs. CLAUDE.md §1.4: an asset
 * nobody has seen rendered is not done, and the critics score these files.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';

const TURN_FRAMES = 96;
const TURN_FPS = 24;
const TURN_PICK = Number(process.env.DRAGON_TURN ?? 6); // sheet slot G: the child of A × B

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

  const sheet = await open('', { width: 1800, height: 760 });
  const stats = await sheet.evaluate(() => ({
    buildMs: window.__dragonView.buildMs, buildTimes: window.__dragonView.buildTimes,
    startupMs: window.__dragonView.startupMs, tris: window.__dragonView.tris,
  }));
  await sheet.screenshot({ path: 'artifacts/variants/dragon-full.png' });
  console.log(`sheet: artifacts/variants/dragon-full.png — 8 dragons, ${stats.tris} tris, built in ${stats.buildMs.toFixed(0)} ms`);

  const turn = await open(`?view=turn&i=${TURN_PICK}`, { width: 960, height: 720 });
  const dir = path.join('artifacts', 'turntables', 'dragon-full.frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < TURN_FRAMES; f++) {
    await turn.evaluate((rad) => window.__dragonView.setYaw(rad), (f / TURN_FRAMES) * Math.PI * 2);
    await turn.screenshot({ path: path.join(dir, `f${String(f).padStart(3, '0')}.png`) });
  }
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(TURN_FPS),
    '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p',
    'artifacts/turntables/dragon-full.webm'], { encoding: 'utf8' });
  if (ff.status !== 0) errors.push(`ffmpeg: ${ff.stderr}`);
  spawnSync('cp', [path.join(dir, 'f000.png'), 'artifacts/turntables/dragon-full.frame00.png']);
  rmSync(dir, { recursive: true, force: true });
  console.log(`turntable: artifacts/turntables/dragon-full.webm — sheet slot ${TURN_PICK}, ${TURN_FRAMES} frames at ${TURN_FPS} fps`);

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
