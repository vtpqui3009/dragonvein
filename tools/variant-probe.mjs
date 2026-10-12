#!/usr/bin/env node
/**
 * Puts numbers under an asset's 8-seed variant sheet (rubric A4) and its colours (A2).
 *
 *   node tools/variant-probe.mjs flora/broadleaf
 *
 * A4 — "8 seeds read as one object" is blocking. The art-critic judges the sheet by eye;
 * this backs the eye with the generator's own silhouette metrics, written next to the
 * sheet by `assetgen/render_all.py` (`artifacts/variants/<name>.metrics.json`). Two seeds
 * fail as a pair when they sit within 8% of each other on *every* axis: height, canopy
 * width, trunk lean, branch count and side-view canopy area (STATE.md run 7, criterion 5).
 * The metrics carry the generator's SHA-256, and the probe refuses a file written by an
 * older generator, because a stale pass is worse than no pass.
 *
 * A2 — measured on the vertex colours of the **shipped** `.glb` files, not on the
 * rendered sheet. Render pixels are albedo times light, and the rig adds key, fill and rim
 * on purpose. The bytes are what the game draws with, so the bytes are what must be
 * on-palette. Per `docs/RUBRIC.md` §A2:
 *   - every colour the manifest declares must be within ΔE 12 of an ART_BIBLE §Palette entry,
 *     so the check below is not circular;
 *   - bark is a surface, so every bark vertex must sit within ΔE 12 of the manifest's bark;
 *   - foliage is a gradient between palette stops (dark -> mid -> light), so it is
 *     judged on staying on that ramp, not on its midpoints being palette entries.
 *
 * Exits 1 on any failure. It is a reader, not part of `npm run gates`, because the sheet
 * it reads is produced by `npm run assets:render`, which needs Blender.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readGlb, vertexColours, hexToLinear, linearToLab, deltaE } from './glb.mjs';

const id = process.argv[2];
if (!id) {
  console.error('usage: node tools/variant-probe.mjs <family/name>');
  process.exit(2);
}
const name = id.split('/').pop();
const AXES = ['height', 'canopyWidth', 'trunkLean', 'branches', 'canopyArea'];
const SAME_WITHIN = 0.08;
const SURFACE_DE = 12;
/** Foliage must stay this close to the dark->mid->light ramp: quantisation, not taste. */
const RAMP_DE = 3;

let failures = 0;
const fail = (msg) => { console.error(`FAIL  ${msg}`); failures++; };

// --- A4: are the eight seeds eight objects? ----------------------------------------------
const metricsPath = `artifacts/variants/${name}.metrics.json`;
if (!existsSync(metricsPath)) {
  fail(`${metricsPath} is missing — run \`npm run assets:render\` first`);
} else {
  const m = JSON.parse(readFileSync(metricsPath, 'utf8'));
  const sha = createHash('sha256').update(readFileSync(m.script)).digest('hex');
  if (sha !== m.scriptSha256) {
    fail(`${metricsPath} was written by an older ${m.script} — re-render before probing`);
  }
  const seeds = m.seeds;
  console.log(`A4  ${id}: ${seeds.length} seeds`);
  console.log(`    ${'seed'.padEnd(5)}${AXES.map((a) => a.padStart(12)).join('')}`);
  for (const s of seeds) {
    console.log(`    ${String(s.seed).padEnd(5)}${AXES.map((a) => String(s[a]).padStart(12)).join('')}`);
  }
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  let closest = { d: Infinity, pair: '' };
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const diffs = AXES.map((a) => rel(seeds[i][a], seeds[j][a]));
      const widest = Math.max(...diffs);
      if (widest < closest.d) closest = { d: widest, pair: `${seeds[i].seed}/${seeds[j].seed}` };
      if (widest <= SAME_WITHIN) {
        fail(`seeds ${seeds[i].seed} and ${seeds[j].seed} are within ${SAME_WITHIN * 100}% on every axis — ` +
          'fix the generator, never the seed list');
      }
    }
  }
  if (seeds.length !== 8) fail(`expected 8 seeds, got ${seeds.length}`);
  console.log(`    most alike pair: seeds ${closest.pair}, still ${(closest.d * 100).toFixed(1)}% apart ` +
    `on their most different axis (fails at ≤ ${SAME_WITHIN * 100}%)`);
}

// --- A2: are the shipped colours the palette's? ------------------------------------------
const manifest = JSON.parse(readFileSync('public/assets/MANIFEST.json', 'utf8'));
const entry = manifest.assets?.[id];
if (!entry) {
  fail(`${id} is not in public/assets/MANIFEST.json`);
} else {
  // The manifest's palette is the generator's own declaration, so checking the bytes against
  // it alone is circular (art-critic, M1a). Every declared colour must itself be a
  // docs/ART_BIBLE.md §Palette entry, within the same ΔE 12 a surface gets.
  const bible = [...readFileSync('docs/ART_BIBLE.md', 'utf8')
    .matchAll(/^\| ([^|]+?) \| `(#[0-9a-fA-F]{6})`/gm)]
    .map(([, label, hex]) => ({ label, hex, lab: linearToLab(hexToLinear(hex)) }));
  if (!bible.length) fail('docs/ART_BIBLE.md §Palette yielded no colours to check against');
  for (const [k, hex] of Object.entries(entry.palette ?? {})) {
    const lab = linearToLab(hexToLinear(hex));
    const near = bible.reduce((best, b) => {
      const d = deltaE(lab, b.lab);
      return d < best.d ? { d, b } : best;
    }, { d: Infinity, b: null });
    console.log(`A2  manifest ${k} ${hex}: nearest ART_BIBLE entry is ${near.b?.label} ${near.b?.hex} ` +
      `(ΔE ${near.d.toFixed(1)})`);
    if (near.d > SURFACE_DE) fail(`manifest palette ${k} ${hex} is ΔE ${near.d.toFixed(1)} from every ART_BIBLE entry`);
  }
  const pal = Object.fromEntries(Object.entries(entry.palette ?? {}).map(([k, v]) => [k, hexToLinear(v)]));
  for (const k of ['bark', 'canopyDark', 'canopyMid', 'canopyLight']) {
    if (!pal[k]) fail(`MANIFEST.json ${id}.palette has no ${k}`);
  }
  if (pal.bark && pal.canopyDark && pal.canopyMid && pal.canopyLight) {
    // The ramp exactly as the generator defines it: a quadratic Bezier through the three
    // stops, in linear light. Sampled finely enough that sampling error is << RAMP_DE.
    const ramp = [];
    for (let i = 0; i <= 400; i++) {
      const s = i / 400;
      const u = 1 - s;
      const w = [u * u, 2 * s * u, s * s];
      ramp.push(linearToLab([0, 1, 2].map((c) =>
        pal.canopyDark[c] * w[0] + pal.canopyMid[c] * w[1] + pal.canopyLight[c] * w[2])));
    }
    const barkLab = linearToLab(pal.bark);
    const darkLab = linearToLab(pal.canopyDark);
    const lightLab = linearToLab(pal.canopyLight);
    for (const l of Object.values(entry.lods ?? {})) {
      const cols = vertexColours(readGlb(readFileSync(path.join('public/assets', l.file))));
      let bark = 0; let leaf = 0; let barkWorst = 0; let rampWorst = 0;
      let nearDark = Infinity; let nearLight = Infinity;
      for (const c of cols) {
        const lab = linearToLab(c);
        const dBark = deltaE(lab, barkLab);
        let dRamp = Infinity;
        for (const r of ramp) dRamp = Math.min(dRamp, deltaE(lab, r));
        if (dBark < dRamp) { bark++; barkWorst = Math.max(barkWorst, dBark); }
        else {
          leaf++; rampWorst = Math.max(rampWorst, dRamp);
          nearDark = Math.min(nearDark, deltaE(lab, darkLab));
          nearLight = Math.min(nearLight, deltaE(lab, lightLab));
        }
      }
      console.log(`A2  ${l.file}: ${cols.length} vertex colours — bark ${bark} (worst ΔE ${barkWorst.toFixed(1)} ` +
        `from bark), foliage ${leaf} (worst ΔE ${rampWorst.toFixed(2)} off the dark→mid→light ramp; ` +
        `ramp reaches ΔE ${nearDark.toFixed(1)} of dark and ${nearLight.toFixed(1)} of light)`);
      if (!cols.length) fail(`${l.file} has no vertex colours`);
      if (barkWorst > SURFACE_DE) fail(`${l.file}: a bark vertex is ΔE ${barkWorst.toFixed(1)} from bark (> ${SURFACE_DE})`);
      if (rampWorst > RAMP_DE) fail(`${l.file}: a foliage vertex is ΔE ${rampWorst.toFixed(2)} off the palette ramp (> ${RAMP_DE})`);
      if (!bark || !leaf) fail(`${l.file}: expected both bark and foliage colours (bark ${bark}, foliage ${leaf})`);
    }
  }
}

if (failures) {
  console.error(`\nvariant-probe: ${failures} failure(s) for ${id}`);
  process.exit(1);
}
console.log(`\nvariant-probe OK — ${id}`);
