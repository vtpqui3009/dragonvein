#!/usr/bin/env node
/** Drives the build headlessly and proves the current milestone's loop can be completed. */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pw from 'playwright';
import { startPreview } from './preview-server.mjs';

if (!existsSync('dist/index.html')) {
  console.log('gate:smoke SKIP — no build yet. Run `npm run build` first.');
  process.exit(0);
}
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const { chromium } = pw;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const { proc: server, url } = await startPreview(4174);
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(2500);
  const booted = await page.evaluate(() => Boolean(globalThis.__dragonveinStats));
  say(booted ? 'boot: OK' : 'boot: FAILED — the game never exposed __dragonveinStats');
  await mkdir('artifacts/shots', { recursive: true });
  await page.screenshot({ path: 'artifacts/shots/00-boot.png' });
  say('shot: artifacts/shots/00-boot.png');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/playtest.log', log.concat(errors).join('\n'));
  if (!booted || errors.length) {
    console.error(errors.join('\n')); process.exit(1);
  }
  console.log('gate:smoke OK');
} finally {
  server.kill(); await browser.close();
}
