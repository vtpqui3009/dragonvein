#!/usr/bin/env node
/**
 * Puts numbers under an asset's 8-seed variant sheet (rubric A4) and its colours (A2).
 *
 *   node tools/variant-probe.mjs flora/broadleaf
 *
 * A4 — "8 seeds read as one object" is blocking. The art-critic judges the sheet by eye;
 * this backs the eye with the generator's own silhouette metrics, written next to the
 * sheet by `assetgen/render_all.py` (`artifacts/variants/<name>.metrics.json`). Two seeds
 * fail as a pair when they sit within 8% of each other on *every* axis. The axes are the
 * generator's own `METRIC_AXES`, recorded in that file. broadleaf's are height, canopy
 * width, trunk lean, branch count and side-view canopy area (STATE.md run 7, criterion 5).
 * The island's are width, depth, relief, roughness and taper (run 15).
 * The metrics carry the generator's SHA-256, and the probe refuses a file written by an
 * older generator, because a stale pass is worse than no pass.
 *
 * A2 — measured on the vertex colours of the **shipped** `.glb` files, not on the
 * rendered sheet. Render pixels are albedo times light, and the rig adds key, fill and rim
 * on purpose. The bytes are what the game draws with, so the bytes are what must be
 * on-palette. Per `docs/RUBRIC.md` §A2:
 *   - every colour the manifest declares must be within ΔE 12 of an ART_BIBLE §Palette entry,
 *     so the check below is not circular;
 *   - a surface (broadleaf's bark) is one colour: its vertices sit within ΔE 12 of it;
 *   - a ramp (broadleaf's canopy, the island's grass and rock) is a gradient between three
 *     palette stops, judged on staying within ΔE 3 of that line, not on its midpoints
 *     being palette entries.
 * Which colours are surfaces and which are ramps is the generator's `PALETTE_ROLES`,
 * carried in MANIFEST.json as `paletteRoles`. Without it, broadleaf's roles apply.
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
/** broadleaf's axes. A generator may declare its own (`METRIC_AXES`), written into its metrics file. */
const AXES_DEFAULT = ['height', 'canopyWidth', 'trunkLean', 'branches', 'canopyArea'];
/** broadleaf's colour roles. A generator may declare its own (`PALETTE_ROLES`, in MANIFEST.json). */
const ROLES_DEFAULT = { surfaces: ['bark'], ramps: [['canopyDark', 'canopyMid', 'canopyLight']] };
const SAME_WITHIN = 0.08;
const SURFACE_DE = 12;
/** Foliage must stay this close to the dark->mid->light ramp: quantisation, not taste. */
const RAMP_DE = 3;
let AXES = AXES_DEFAULT;

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
  AXES = Array.isArray(m.axes) && m.axes.length ? m.axes : AXES_DEFAULT;
  console.log(`A4  ${id}: ${seeds.length} seeds, axes ${AXES.join(', ')}`);
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
  const roles = entry.paletteRoles ?? ROLES_DEFAULT;
  for (const k of [...roles.surfaces, ...roles.ramps.flat()]) {
    if (!pal[k]) fail(`MANIFEST.json ${id}.palette has no ${k}, which paletteRoles names`);
  }
  // Each surface is one colour; each ramp is the generator's own curve: a quadratic Bezier
  // through its three stops, in linear light, sampled finely enough that sampling error is
  // << RAMP_DE. A vertex belongs to whichever role it is nearest, and is held to that
  // role's tolerance.
  const judges = [
    ...roles.surfaces.filter((k) => pal[k]).map((k) => ({ name: k, kind: 'surface', tol: SURFACE_DE, labs: [linearToLab(pal[k])] })),
    ...roles.ramps.filter((r) => r.every((k) => pal[k])).map((r) => {
      const labs = [];
      for (let i = 0; i <= 400; i++) {
        const s = i / 400, u = 1 - s, w = [u * u, 2 * s * u, s * s];
        labs.push(linearToLab([0, 1, 2].map((c) => pal[r[0]][c] * w[0] + pal[r[1]][c] * w[1] + pal[r[2]][c] * w[2])));
      }
      return { name: r.join('→'), kind: 'ramp', tol: RAMP_DE, labs, optional: (roles.optional ?? []).includes(r.join('→')) };
    }),
  ];
  for (const l of Object.values(entry.lods ?? {})) {
    const cols = vertexColours(readGlb(readFileSync(path.join('public/assets', l.file))));
    const tally = judges.map(() => ({ n: 0, worst: 0 }));
    for (const c of cols) {
      const lab = linearToLab(c);
      let best = -1, bestD = Infinity;
      judges.forEach((j, k) => {
        let d = Infinity;
        for (const r of j.labs) d = Math.min(d, deltaE(lab, r));
        if (d < bestD) { bestD = d; best = k; }
      });
      if (best >= 0) { tally[best].n++; tally[best].worst = Math.max(tally[best].worst, bestD); }
    }
    console.log(`A2  ${l.file}: ${cols.length} vertex colours — ` + judges.map((j, k) =>
      `${j.kind} ${j.name} ${tally[k].n} (worst ΔE ${tally[k].worst.toFixed(2)}, limit ${j.tol})`).join('; '));
    if (!cols.length) fail(`${l.file} has no vertex colours`);
    judges.forEach((j, k) => {
      if (tally[k].worst > j.tol) fail(`${l.file}: a ${j.kind} ${j.name} vertex is ΔE ${tally[k].worst.toFixed(2)} off it (> ${j.tol})`);
      // A role with no vertices means a colour layer went missing, unless the generator
      // says that role appears only on some seeds (`optional`, e.g. stratified's grass cap).
      if (!tally[k].n && !j.optional) fail(`${l.file}: expected some ${j.kind} ${j.name} colours, found none`);
    });
  }
}

if (failures) {
  console.error(`\nvariant-probe: ${failures} failure(s) for ${id}`);
  process.exit(1);
}
console.log(`\nvariant-probe OK — ${id}`);
