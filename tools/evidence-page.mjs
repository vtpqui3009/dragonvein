#!/usr/bin/env node
/**
 * Builds `artifacts/evidence/run-evidence.html`: one self-contained page the owner can
 * open on a phone to decide on a run without reading `STATE.md` or a diff.
 *
 * It answers three questions, in this order:
 *   1. What does the run need from me?   (`NEXT.md` §Open items that need the owner)
 *   2. Did it pass?                      (newest round in `FINDINGS.md`, gates, perf.json)
 *   3. What does it look like?           (asset variant sheets and turntables, then every
 *                                         in-game shot in `artifacts/shots/`)
 *
 * It is a reader, like `tools/art-probe.mjs`: it gates nothing and changes no score. It
 * only copies what the artefacts and the two handoff files already say. Run it after the
 * critic round and the close-out edits, so the page matches the commit it describes:
 *
 *   node tools/evidence-page.mjs
 *
 * Images and the turntable are embedded as data URIs so the page works as a single file
 * and as an Artifact, whose CSP blocks every other way of loading them.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT_DIR = 'artifacts/evidence';
const OUT = `${OUT_DIR}/run-evidence.html`;
const SHOTS = 'artifacts/shots';
const VARIANTS = 'artifacts/variants';
const TURNTABLES = 'artifacts/turntables';
const SHIP_BAR = 8.0;
const BAR = SHIP_BAR.toFixed(1);
/** The Artifact page limit is 16 MB; stay well clear of it. */
const MAX_BYTES = 12 * 1024 * 1024;

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The small slice of Markdown the handoff files use inline: `code` and **bold**. */
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

function git(...args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return ''; }
}

/** `## heading` section of a Markdown file, up to the next heading of the same level. */
function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^## /.test(l)) break;
    out.push(l);
  }
  return out;
}

/** Top-level bullets, with their continuation lines folded in. */
function bullets(lines) {
  const items = [];
  for (const l of lines) {
    if (/^- /.test(l)) items.push(l.slice(2).trim());
    else if (/^\s+\S/.test(l) && items.length) items[items.length - 1] += ` ${l.trim()}`;
  }
  return items;
}

// --- 1. what the owner is asked for ----------------------------------------------------
const next = read('NEXT.md');
const asks = bullets(section(next, 'Open items that need the owner'));
/** The first paragraph under §Current step: the step's name and its status. */
const stepLines = section(next, 'Current step');
const stepFrom = stepLines.findIndex((l) => l.startsWith('**'));
const stepEnd = stepLines.findIndex((l, i) => i > stepFrom && l.trim() === '');
const stepLine = stepFrom < 0 ? ''
  : stepLines.slice(stepFrom, stepEnd < 0 ? undefined : stepEnd).join(' ').trim();

// --- 2. the newest scoring round --------------------------------------------------------
const findings = read('FINDINGS.md');
const rounds = findings.split(/^# (?!FINDINGS)/m).slice(1);
const round = rounds[0] ?? '';
const roundTitle = round.split('\n', 1)[0].trim();
const critics = round.split(/^## /m).slice(1).map((block) => {
  const [title, ...rest] = block.split('\n');
  const name = title.split('—')[0].trim();
  const score = Number((rest.join('\n').match(/^SCORE_MACHINE:\s*([\d.]+)/m) ?? [])[1]);
  const defects = bullets(rest).map((b) => {
    const m = b.match(/^\[(blocking|major|minor)\]\s*(.*)$/);
    return m ? { severity: m[1], text: m[2] } : null;
  }).filter(Boolean);
  return { name, score, defects };
}).filter((c) => !Number.isNaN(c.score));

// --- gates and perf ---------------------------------------------------------------------
const perf = existsSync('artifacts/perf.json') ? JSON.parse(read('artifacts/perf.json')) : null;
const log = read('artifacts/playtest.log');
const smokeOk = /^gate:smoke OK$/m.test(log);
const perfOk = perf?.status === 'complete' && (perf?.errors?.length ?? 0) === 0;
const kb = (b) => `${(b / 1024).toFixed(1)} kB`;
const perfRows = perf ? [
  ['Main-thread frame cost p95', `${perf.cpuFrameMs?.p95} ms`, `${perf.budget.cpuFrameMs} ms`,
    perf.cpuFrameMs?.p95 <= perf.budget.cpuFrameMs, 'enforced'],
  ['Draw calls', perf.drawCalls, perf.budget.drawCalls, perf.drawCalls <= perf.budget.drawCalls, 'enforced'],
  ['Triangles', perf.triangles?.toLocaleString('en'), perf.budget.triangles.toLocaleString('en'),
    perf.triangles <= perf.budget.triangles, 'enforced'],
  ['Heap churn per frame', kb(perf.heap?.bytesPerFrame ?? 0), kb(perf.budget.heapBytesPerFrame),
    (perf.heap?.bytesPerFrame ?? Infinity) <= perf.budget.heapBytesPerFrame, 'enforced'],
  ['Bundle, gzipped', kb(perf.bundle?.gzipBytes ?? 0), kb(perf.budget.bundleGzipBytes),
    (perf.bundle?.gzipBytes ?? Infinity) <= perf.budget.bundleGzipBytes, 'enforced'],
  ['Boot to first frame', `${Math.round(perf.bootMs)} ms`, `${perf.budget.bootMs} ms`,
    perf.bootMs <= perf.budget.bootMs, 'enforced'],
  ['Whole frame p95 (GPU)', `${perf.frameCostMs?.p95} ms`, `${perf.budget.frameMs} ms`,
    perf.frameCostMs?.withinBudget,
    perf.softwareRenderer ? 'advisory: software rasteriser, needs a real GPU' : 'enforced'],
] : [];

// --- 3. what it looks like -------------------------------------------------------------
/** Captions come from the smoke log's own `shot:` lines, so they cannot drift from it. */
const captions = new Map();
for (const m of log.matchAll(/^shot: \S*\/([\w.-]+\.png)\s*(?:\((.*)\))?$/gm)) {
  captions.set(m[1], m[2] ?? '');
}
const shots = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort() : [];
/** One sheet per generator (rubric A4), and every turntable: the island's and each asset's. */
const sheets = existsSync(VARIANTS) ? readdirSync(VARIANTS).filter((f) => f.endsWith('.png')).sort() : [];
const turntables = existsSync(TURNTABLES)
  ? readdirSync(TURNTABLES).filter((f) => f.endsWith('.webm')).sort() : [];
const dataUri = (p, type) => `data:${type};base64,${readFileSync(p).toString('base64')}`;
/**
 * Variant sheets are 1–2 MB PNGs each, and five generators' worth pushed the page past the
 * limit (run 16). On the page they are re-encoded as JPEG, which is plenty to judge
 * silhouettes by; the PNGs in artifacts/variants/ stay the critics' source. Without ffmpeg
 * the PNG is embedded as before.
 */
const sheetUri = (p) => {
  const jpg = path.join(OUT_DIR, 'sheets', path.basename(p, '.png') + '.jpg');
  try {
    mkdirSync(path.dirname(jpg), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', p, '-q:v', '4', jpg]);
    return dataUri(jpg, 'image/jpeg');
  } catch {
    return dataUri(p, 'image/png');
  }
};

const sha = git('rev-parse', '--short', 'HEAD');
const subject = git('log', '-1', '--format=%s');
const when = git('log', '-1', '--format=%cI');

// --- render ----------------------------------------------------------------------------
const verdict = (c) => (c.defects.some((d) => d.severity === 'blocking') ? 'blocked'
  : c.score >= SHIP_BAR ? 'pass' : 'below');
const verdictText = { pass: `at or above ${BAR}`, below: `below ${BAR}`, blocked: 'blocking defect' };

const html = `<title>Dragonvein Run Evidence</title>
<style>
/* Layout: one column, read top to bottom on a phone: asks, verdict, numbers, pictures. */
:root {
  /* docs/ART_BIBLE.md §Palette, the same tokens the in-game HUD uses. */
  --ground: #070d14;
  --panel: rgba(11, 36, 48, 0.82);
  --panel-solid: #0b2430;
  --line: rgba(255, 212, 121, 0.28);
  --ink: #eef7fd;
  --ink-dim: #a9c0cd;
  --accent: #ffd479;
  --warm: #ff9044;
  --good: #8fd24a;
  --bad: #ff7a6b;
  --display: "Chakra Petch", "Segoe UI", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: linear-gradient(#0a1c4f, var(--ground) 420px) var(--ground);
  color: var(--ink); font: 15px/1.55 var(--body); }
main { max-width: 980px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px;
  display: grid; gap: 28px; }
h1, h2 { font-family: var(--display); text-wrap: balance; margin: 0; letter-spacing: .04em; }
h1 { font-size: clamp(26px, 6vw, 40px); font-weight: 700; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .18em; color: var(--accent);
  font-weight: 600; }
p { margin: 0; }
code { font: 0.9em var(--mono); color: var(--accent); overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--ink-dim);
  font: 13px var(--mono); }
section { display: grid; gap: 12px; min-width: 0; }
.asks { background: var(--panel); border: 1px solid var(--warm); border-radius: 10px;
  padding: 16px 18px; }
.asks ol { margin: 0; padding-left: 20px; display: grid; gap: 10px; }
.asks li { max-width: 72ch; }
.scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.score { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; display: grid; gap: 4px; min-width: 0; }
.score .n { font: 700 40px/1 var(--display); font-variant-numeric: tabular-nums; }
.score .k { font: 600 12px var(--mono); text-transform: uppercase; letter-spacing: .14em;
  color: var(--ink-dim); }
.pill { justify-self: start; font: 600 11px var(--mono); text-transform: uppercase;
  letter-spacing: .1em; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
.pass { color: var(--good); } .below { color: var(--warm); } .blocked { color: var(--bad); }
.gates { display: flex; flex-wrap: wrap; gap: 8px 18px; font: 13px var(--mono); }
.defects { display: grid; gap: 14px; }
details { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 16px; }
summary { cursor: pointer; font-weight: 600; }
summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
details ul { margin: 10px 0 4px; padding-left: 18px; display: grid; gap: 8px; }
.sev { font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .08em;
  margin-right: 6px; }
.sev.major { color: var(--warm); } .sev.minor { color: var(--ink-dim); } .sev.blocking { color: var(--bad); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px;
  background: var(--panel); }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line);
  vertical-align: top; }
tr:last-child td { border-bottom: 0; }
th { font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .12em;
  color: var(--ink-dim); }
td.num { font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
figure img, video { width: 100%; max-width: 100%; height: auto; border-radius: 8px;
  border: 1px solid var(--line); background: #000; display: block; }
figcaption { font-size: 13px; color: var(--ink-dim); }
figcaption b { font: 600 12px var(--mono); color: var(--ink); }
.k-inline { font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .14em;
  color: var(--ink-dim); margin-right: 6px; }
.foot { color: var(--ink-dim); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<main>
  <header style="display:grid;gap:10px">
    <h2>Dragonvein · run evidence</h2>
    <h1>${inline(roundTitle || 'No scoring round yet')}</h1>
    ${stepLine ? `<p><span class="k-inline">Next step</span> ${inline(stepLine)}</p>` : ''}
    <div class="meta"><span>page built at commit ${esc(sha)}</span><span>${esc(when)}</span><span>${esc(subject)}</span></div>
  </header>

  <section class="asks" aria-labelledby="asks-h">
    <h2 id="asks-h">Needs you</h2>
    ${asks.length ? `<ol>${asks.map((a) => `<li>${inline(a)}</li>`).join('')}</ol>`
      : '<p>Nothing is waiting on you.</p>'}
  </section>

  <section aria-labelledby="scores-h">
    <h2 id="scores-h">Critic scores · ship bar ${BAR}</h2>
    <div class="scores">${critics.map((c) => `
      <div class="score">
        <span class="k">${esc(c.name)}</span>
        <span class="n ${verdict(c)}">${c.score.toFixed(1)}</span>
        <span class="pill ${verdict(c)}">${verdictText[verdict(c)]}</span>
      </div>`).join('')}
    </div>
    <div class="gates">
      <span class="${perfOk ? 'pass' : 'blocked'}">gate:perf ${perfOk ? 'complete' : 'NOT complete'}</span>
      <span class="${smokeOk ? 'pass' : 'blocked'}">gate:smoke ${smokeOk ? 'OK' : 'FAILED'}</span>
      <span>${esc(perf?.renderer ?? 'no perf.json')}</span>
    </div>
  </section>

  <section aria-labelledby="defects-h">
    <h2 id="defects-h">What the critics found</h2>
    <div class="defects">${critics.map((c) => `
      <details${c.defects.some((d) => d.severity !== 'minor') ? ' open' : ''}>
        <summary>${esc(c.name)}: ${c.defects.length} defect${c.defects.length === 1 ? '' : 's'}
          (${['blocking', 'major', 'minor'].map((s) => `${c.defects.filter((d) => d.severity === s).length} ${s}`).join(', ')})</summary>
        <ul>${c.defects.map((d) => `<li><span class="sev ${d.severity}">${d.severity}</span>${inline(d.text)}</li>`).join('')}</ul>
      </details>`).join('')}
    </div>
  </section>

  ${perfRows.length ? `<section aria-labelledby="perf-h">
    <h2 id="perf-h">Performance · artifacts/perf.json</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>measure</th><th>this run</th><th>budget</th><th>status</th></tr></thead>
      <tbody>${perfRows.map(([k, v, b, ok, note]) => `
        <tr><td>${esc(k)}</td><td class="num">${esc(v)}</td><td class="num">${esc(b)}</td>
        <td class="${ok ? 'pass' : note === 'enforced' ? 'blocked' : 'below'}">${ok ? 'within' : 'over'}${note === 'enforced' ? '' : ` · ${esc(note)}`}</td></tr>`).join('')}
      </tbody></table></div>
  </section>` : ''}

  <section aria-labelledby="look-h">
    <h2 id="look-h">What it looks like</h2>
    ${sheets.map((f) => `<figure>
      <img alt="${esc(f)} variant sheet" src="${sheetUri(path.join(VARIANTS, f))}">
      <figcaption><b>${esc(f)}</b> 8-seed variant sheet, LOD0 (rubric A4: eight seeds must read as eight objects)</figcaption>
    </figure>`).join('')}
    <div class="shots">${turntables.map((f) => `
      <figure>
        <video controls muted loop playsinline preload="metadata" src="${dataUri(path.join(TURNTABLES, f), 'video/webm')}"></video>
        <figcaption><b>${esc(f)}</b> ${f.startsWith('m0-island') ? 'the island turning in the game, about 7 s' : 'asset turntable, LOD0, one full revolution'}</figcaption>
      </figure>`).join('')}
    </div>
    <div class="shots">${shots.map((f) => `
      <figure>
        <img loading="lazy" alt="${esc(f)}" src="${dataUri(path.join(SHOTS, f), 'image/png')}">
        <figcaption><b>${esc(f)}</b> ${esc(captions.get(f) ?? '')}</figcaption>
      </figure>`).join('')}
    </div>
  </section>

  <p class="foot">Generated by <code>node tools/evidence-page.mjs</code> from NEXT.md, FINDINGS.md and
  artifacts/ at commit ${esc(sha)}. Shots come from a software rasteriser (SwiftShader), so frame
  rates on screen are not what a real GPU would show.</p>
</main>
`;

if (Buffer.byteLength(html) > MAX_BYTES) {
  console.error(`evidence page is ${Buffer.byteLength(html)} bytes, over ${MAX_BYTES}; drop shots or shrink them`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
console.log(`evidence: ${OUT} (${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB, ` +
  `${critics.length} critics, ${sheets.length} sheets, ${turntables.length} turntables, ${shots.length} shots, ` +
  `${asks.length} asks)`);
