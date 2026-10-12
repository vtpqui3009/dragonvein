/**
 * A minimal reader for the `.glb` files `assetgen/build_all.py` ships.
 *
 * Just enough glTF 2.0 to count triangles and read vertex colours from the bytes on disk,
 * so `check:assets` and `variant-probe` measure the shipped binary rather than trusting
 * the numbers the generator wrote about itself. No dependency: the container format is
 * a 12-byte header, a JSON chunk and a BIN chunk (glTF 2.0 §4.4).
 */

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TRIANGLES = 4;

/** @param {Buffer} buf */
export function readGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== MAGIC) throw new Error('not a GLB (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error(`unsupported GLB version ${buf.readUInt32LE(4)}`);
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new Error(`GLB length field ${total} != file size ${buf.length}`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    else if (type === CHUNK_BIN) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

/** Triangle count over every TRIANGLES primitive, from index counts (or vertex counts). */
export function triangleCount({ json }) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? TRIANGLES) !== TRIANGLES) throw new Error(`primitive mode ${prim.mode} is not TRIANGLES`);
      const acc = prim.indices !== undefined
        ? json.accessors[prim.indices]
        : json.accessors[prim.attributes.POSITION];
      tris += acc.count / 3;
    }
  }
  return tris;
}

/** Reads one accessor as an array of tuples, normalising integer types to 0..1. */
function readAccessor({ json, bin }, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const n = COMPONENTS[acc.type];
  const size = { 5126: 4, 5123: 2, 5121: 1 }[acc.componentType];
  if (!size) throw new Error(`unsupported componentType ${acc.componentType}`);
  const stride = view.byteStride ?? n * size;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const t = [];
    for (let c = 0; c < n; c++) {
      const at = base + i * stride + c * size;
      if (acc.componentType === 5126) t.push(bin.readFloatLE(at));
      else if (acc.componentType === 5123) t.push(acc.normalized ? bin.readUInt16LE(at) / 65535 : bin.readUInt16LE(at));
      else t.push(acc.normalized ? bin.readUInt8(at) / 255 : bin.readUInt8(at));
    }
    out.push(t);
  }
  return out;
}

/** Every COLOR_0 value in the file, as linear RGB (glTF stores vertex colour linear). */
export function vertexColours(glb) {
  const out = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes.COLOR_0 === undefined) continue;
      for (const c of readAccessor(glb, prim.attributes.COLOR_0)) out.push([c[0], c[1], c[2]]);
    }
  }
  return out;
}

// --- colour: linear RGB -> sRGB -> CIELAB (D65), and CIE76 ΔE, as docs/RUBRIC.md uses ---
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function hexToLinear(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
}

export function linearToLab([r, g, b]) {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export { toSrgb };
