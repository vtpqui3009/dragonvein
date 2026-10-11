#!/usr/bin/env node
/**
 * Prints the numbers `STATE.md`'s M0d acceptance criteria are written against.
 *
 * This is an instrument, not a gate. It never exits non-zero on a measurement and it is
 * not in the `gates` chain, because a build must not be able to pass by making its own
 * marking scheme agree with it. `npm run gates` decides whether the build is sound; the
 * three critics in `docs/RUBRIC.md` decide whether it is any good. This only says what
 * the pixels are, so a criterion in `STATE.md` can be a number instead of an adjective
 * and the next run can re-measure the same thing the same way.
 *
 * Reads `artifacts/shots/01-wide.png` (and the turntable, if ffmpeg has already been used
 * to extract frames). Run `npm run gate:smoke` first — that is what produces them.
 *
 *   node tools/art-probe.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// Defaults to the shot the critics read; takes a path so a frame can be compared
// against another one (the no-shadow differential, an older run's artefact).
const SHOT = process.argv[2] ?? 'artifacts/shots/01-wide.png';

// --- PNG, decoded here rather than pulled in as a dependency ---------------------------
// CLAUDE.md §2.6 budgets runtime dependencies; a dev tool is outside that budget, but a
// 60-line truecolour decoder is still cheaper than another node_modules tree, and the
// shots are always 8-bit RGB/RGBA from Playwright.

/** @returns {{w:number,h:number,px:Uint8Array}} px is RGB, 3 bytes per pixel. */
function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let p = 8;
  let w = 0, h = 0, depth = 0, colour = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6)) {
        throw new Error(`${file}: expected 8-bit truecolour, got depth ${depth} colour ${colour}`);
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 3);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    cur.set(raw.subarray(q, q + stride));
    q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 3] = cur[x * bpp];
      out[(y * w + x) * 3 + 1] = cur[x * bpp + 1];
      out[(y * w + x) * 3 + 2] = cur[x * bpp + 2];
    }
    prev.set(cur);
  }
  return { w, h, px: out };
}

// --- colour ----------------------------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) LIN[i] = toLinear(i / 255);
const luma = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];

function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** docs/ART_BIBLE.md §Palette, verbatim. */
const BIBLE = {
  'sky zenith': 0x0a1c4f, 'sky horizon': 0xff9044, 'deep shadow': 0x1a1420,
  'rock mid': 0x5a4a40, 'foliage dark': 0x1e4a21, 'foliage mid': 0x3f8a33,
  'foliage light': 0x8fd24a, 'water near': 0x2d92ba, 'water far': 0xa6f1f2,
  'UI surface': 0x0b2430, 'UI accent': 0xffd479,
};
const BIBLE_LAB = Object.entries(BIBLE).map(([k, v]) =>
  [k, lab((v >> 16) & 255, (v >> 8) & 255, v & 255)]);

function nearestBible(r, g, b) {
  const L = lab(r, g, b);
  let name = '', best = Infinity;
  for (const [k, v] of BIBLE_LAB) {
    const d = dE(L, v);
    if (d < best) { best = d; name = k; }
  }
  return { name, d: best };
}

// --- the frame ---------------------------------------------------------------------------
if (!existsSync(SHOT)) {
  console.error(`art-probe: no ${SHOT}. Run \`npm run gate:smoke\` first.`);
  process.exit(1);
}
const { w, h, px } = decodePng(SHOT);
const at = (x, y) => {
  const i = (y * w + x) * 3;
  return [px[i], px[i + 1], px[i + 2]];
};
const isGreen = (r, g, b) => g > r + 8 && g > b + 8;
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

console.log(`art-probe  ${SHOT}  ${w}x${h}`);

// --- AC1: where the key light is, relative to the camera -------------------------------
// Read out of the source rather than the frame: the angle is the cause, the shadows are
// the effect, and a criterion wants the cause stated so the next run can see it move.
const src = readFileSync('src/main.ts', 'utf8');
const vec3 = (re) => {
  const m = src.match(re);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const sunPos = vec3(/sun\.position\.set\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/);
const camPos = vec3(/camera\.position\.set\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/);
if (sunPos && camPos) {
  const unit = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };
  const s = unit(sunPos), c = unit(camPos);
  const deg = (Math.acos(Math.max(-1, Math.min(1, s[0] * c[0] + s[1] * c[1] + s[2] * c[2])))
    * 180) / Math.PI;
  const az = (v) => ((Math.atan2(v[2], v[0]) * 180) / Math.PI + 360) % 360;
  console.log(`AC1 sun-camera angle   ${deg.toFixed(1)} deg  ` +
    `(sun az ${az(sunPos).toFixed(1)}, camera az ${az(camPos).toFixed(1)}, want >= 60)`);
}

// --- AC2: contact shadows on open ground -----------------------------------------------
/*
 * What this asks, and why two frames are needed to ask it.
 *
 * Two in-frame tests were tried first and both lied. Counting grass below 0.70x the
 * median reported 26% on a frame the art-critic had already called shadowless, because a
 * boulder's own dark side is a dark green pixel too and this deck carries 200-odd props.
 * Splitting the grass luma with Otsu was no better: it returned the same 0.23 ratio
 * whether the shadow map was on or off. On a dressed island, "dark green" is mostly
 * foliage, and no single frame distinguishes a shadow from a bush.
 *
 * So A3 is measured by subtraction. `artifacts/shots/05-potato.png` is the same frame
 * rendered with `?tier=potato`, whose only effect on the image at deviceScaleFactor 1 is
 * that the shadow map is off and the sun does not cast (`src/main.ts` POTATO). Every
 * pixel that differs between the two is a pixel the shadow pass darkened, and nothing
 * else moved, so this cannot be satisfied by making the scene darker, denser or greener.
 *
 * Two numbers come out, and A3 needs both. How much of the deck the shadow pass touches
 * says the shadows exist; how far it darkens what it touches says they can be seen. A
 * shadow covering 90% of the ground is as unreadable as one covering none, which is the
 * state this island was actually in: measured at the 25-degree sun, 77% of the glade was
 * in shadow and the whole deck read flat.
 */
{
  const POTATO_SHOT = 'artifacts/shots/05-potato.png';
  if (!existsSync(POTATO_SHOT)) {
    console.log(`AC2 shadow pass        no ${POTATO_SHOT}. Run \`npm run gate:smoke\`.`);
  } else {
    const p = decodePng(POTATO_SHOT);
    if (p.w !== w || p.h !== h) {
      console.log('AC2 shadow pass        size mismatch against the potato shot');
    } else {
      // The deck only: grass on the hero island, which is what A3 is about.
      const X0 = 400, X1 = 900, Y0 = 400, Y1 = 540;
      let deck = 0, touched = 0, litSum = 0, shadeSum = 0;
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const i = (y * w + x) * 3;
          const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
          const [pr, pg, pb] = [p.px[i], p.px[i + 1], p.px[i + 2]];
          if (!isGreen(pr, pg, pb)) continue;       // green *before* the shadow pass
          deck++;
          const lit = luma(pr, pg, pb);
          const now = luma(r, g, b);
          if (lit - now > 0.004) { touched++; litSum += lit; shadeSum += now; }
        }
      }
      const share = deck ? touched / deck : 0;
      console.log(`AC2 shadow pass        darkens ${(share * 100).toFixed(1)}% of ` +
        `${deck} deck px (want 15-70%), and where it lands ` +
        `${shadeSum > 0 ? (shadeSum / litSum).toFixed(3) : 'n/a'} x as bright ` +
        `(want <= 0.75)`);
    }
  }
}

// --- AC3: does the warm rim reach the canopy -------------------------------------------
// Walk down each column until the first non-sky pixel: that is the canopy's top edge.
// Compare it with the pixel 6 rows further in, which is what the art-critic did.
{
  const edge = [0, 0, 0], inner = [0, 0, 0];
  let n = 0;
  for (let x = 420; x < 880; x++) {
    for (let y = 200; y < 460; y++) {
      const [r, g, b] = at(x, y);
      if (!isGreen(r, g, b)) continue;
      const [r2, g2, b2] = at(x, Math.min(h - 1, y + 6));
      if (!isGreen(r2, g2, b2)) break;
      edge[0] += r; edge[1] += g; edge[2] += b;
      inner[0] += r2; inner[1] += g2; inner[2] += b2;
      n++;
      break;
    }
  }
  if (n) {
    const e = edge.map((v) => v / n), i = inner.map((v) => v / n);
    // "Warmer" = more red relative to blue; "brighter" = higher luma.
    const warmth = (c) => c[0] - c[2];
    console.log(`AC3 rim edge vs inner  edge ${hex(e)} inner ${hex(i)}  ` +
      `dLuma ${(luma(...e.map(Math.round)) - luma(...i.map(Math.round))).toFixed(4)} ` +
      `dWarmth ${(warmth(e) - warmth(i)).toFixed(1)}  (want both > 0, n=${n})`);
  }
}

// --- AC7: the off-bible haze band ------------------------------------------------------
// Per row, the mean colour of the pixels that are *sky*, then its distance to the nearest
// bible swatch. The worst row over the band is the number the criterion names.
{
  let worst = { d: -1, y: -1, c: null, name: '' };
  for (let y = 440; y < 660; y++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < w; x += 2) {
      const [pr, pg, pb] = at(x, y);
      if (isGreen(pr, pg, pb)) continue;          // skip the islands
      r += pr; g += pg; b += pb; n++;
    }
    if (n < w / 8) continue;
    const c = [r / n, g / n, b / n].map(Math.round);
    const near = nearestBible(...c);
    if (near.d > worst.d) worst = { d: near.d, y, c, name: near.name };
  }
  console.log(`AC7 haze dE            worst row y=${worst.y} ${hex(worst.c)} ` +
    `dE ${worst.d.toFixed(1)} to ${worst.name}  (want < 12)`);
}

// --- AC6: ambient motion ---------------------------------------------------------------
// Needs frames extracted from the turntable; prints how to get them rather than shelling
// out to ffmpeg, so this tool stays a pure reader.
{
  const dir = 'artifacts/frames';
  const frames = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [];
  if (frames.length < 2) {
    console.log('AC6 ambient motion     no frames. ' +
      'ffmpeg -i artifacts/turntables/m0-island.webm -vsync 0 artifacts/frames/f%04d.png');
  } else {
    // Green-mask centroid of the bottom-right satellite, tracked across every frame.
    const box = [980, 540, 1200, 700];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of frames) {
      const img = decodePng(`${dir}/${f}`);
      let sx = 0, sy = 0, n = 0;
      for (let y = box[1]; y < Math.min(box[3], img.h); y++) {
        for (let x = box[0]; x < Math.min(box[2], img.w); x++) {
          const i = (y * img.w + x) * 3;
          if (isGreen(img.px[i], img.px[i + 1], img.px[i + 2])) { sx += x; sy += y; n++; }
        }
      }
      if (!n) continue;
      const cx = sx / n, cy = sy / n;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    }
    console.log(`AC6 ambient motion     satellite centroid travels ` +
      `${(maxX - minX).toFixed(2)} x ${(maxY - minY).toFixed(2)} px over ` +
      `${frames.length} frames  (want > 1 px)`);
  }
}
