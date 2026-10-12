/**
 * PNG in and out for the gate tools, with no dependency.
 *
 * Decoding moved here unchanged from `tools/art-probe.mjs`, so `tools/playtest.mjs` can
 * read back the shots it takes (the M5a wind differential). Encoding is new and minimal:
 * 8-bit RGB, filter 0, one IDAT — enough to write a diff mask a critic can look at.
 */
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// Decoded here rather than pulled in as a dependency.
// CLAUDE.md §2.6 budgets runtime dependencies; a dev tool is outside that budget, but a
// 60-line truecolour decoder is still cheaper than another node_modules tree, and the
// shots are always 8-bit RGB/RGBA from Playwright.

/** @returns {{w:number,h:number,px:Uint8Array}} px is RGB, 3 bytes per pixel. */
export function decodePng(file) {
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

/** CRC-32 (IEEE), table-driven; `zlib.crc32` is not in every Node this repo supports. */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} px RGB, 3 bytes per pixel, row-major
 * @returns {Buffer} a complete PNG file
 */
export function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 2;      // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
