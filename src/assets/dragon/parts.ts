/**
 * The dragon parts the reference builds from Blender primitives rather than its skin graph:
 * dorsal spikes and tail ornament (cones, an icosphere) and the wing membranes (a polygon
 * fan, then Solidify and a simple Subsurf). Their parameters come from ./graph.ts, where
 * they equal the reference's exactly. This file turns them into closed meshes.
 *
 * - **Primitives** put their vertices where Blender does, in Blender's order: a cone's base
 *   ring starts at +Y and runs clockwise seen from above, and the apex is last. The
 *   transform is scale, then rotation about Y, then translation (Blender's T·R·S).
 *   tests/dragon-body.test.ts holds them to the vertices Blender built, recorded in
 *   docs/fixtures/dragon-graphs.json, within 1e-5. They are flat-shaded, as the reference's
 *   `shade_flat` makes them.
 * - **Membranes** are offset by ±thickness/2 along angle-weighted vertex normals, as
 *   Solidify does at offset 0. Every face is split N ways per edge so neighbouring faces
 *   share their split points, with no T-junction, and a rim closes the slab. Blender's
 *   simple Subsurf does not move a point off its face, so the slab's bounding box is the
 *   reference's. The test checks it within 1e-4.
 *
 * Coordinates are the reference's z-up frame; ./builder.ts turns everything y-up at the end.
 */
import type { Primitive, Vec3 } from './graph';
import { MEMBRANE_THICKNESS } from './graph';
import { vertexNormals, type SkinMesh } from './skin';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
}

/** A primitive's vertices in world space, in Blender's order. */
export function primitiveVertices(p: Primitive): Vec3[] {
  const local: Vec3[] = [];
  if (p.kind === 'cone') {
    for (let i = 0; i < p.vertices; i++) {
      const a = (i / p.vertices) * Math.PI * 2;
      local.push([p.radius * Math.sin(a), p.radius * Math.cos(a), -p.depth / 2]);
    }
    local.push([0, 0, p.depth / 2]);
  } else {
    // Blender 5's icosphere at subdivisions = 1 is the plain icosahedron: a pole, a lower
    // ring at −36° − 72°k, an upper ring at −72° − 72°k, a pole.
    const r = p.radius, h = r / Math.sqrt(5), q = (2 * r) / Math.sqrt(5);
    local.push([0, 0, -r]);
    for (let k = 0; k < 5; k++) { const a = ((-36 - 72 * k) * Math.PI) / 180; local.push([q * Math.cos(a), q * Math.sin(a), -h]); }
    for (let k = 0; k < 5; k++) { const a = ((-72 - 72 * k) * Math.PI) / 180; local.push([q * Math.cos(a), q * Math.sin(a), h]); }
    local.push([0, 0, r]);
  }
  const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
  return local.map(([x, y, z]) => {
    const sx = x * p.scale[0], sy = y * p.scale[1], sz = z * p.scale[2];
    return [c * sx + s * sz + p.location[0], sy + p.location[1], -s * sx + c * sz + p.location[2]];
  });
}

/** Faces of a primitive, as index triples, wound so they face away from its centre. */
function primitiveFaces(p: Primitive, v: Vec3[]): [number, number, number][] {
  const tris: [number, number, number][] = [];
  if (p.kind === 'cone') {
    const n = p.vertices, apex = n;
    for (let i = 0; i < n; i++) tris.push([i, apex, (i + 1) % n]);
    for (let i = 1; i < n - 1; i++) tris.push([0, i, i + 1]);
  } else {
    const L = (k: number) => 1 + (k % 5), U = (k: number) => 6 + (k % 5);
    for (let k = 0; k < 5; k++) {
      tris.push([0, L(k), L(k + 1)], [L(k), U(k), L(k + 1)], [U(k), U(k + 1), L(k + 1)], [11, U(k + 1), U(k)]);
    }
  }
  const centre = mul(v.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3), 1 / v.length);
  return tris.map(([a, b, c]) => {
    const n = cross(sub(v[b]!, v[a]!), sub(v[c]!, v[a]!));
    const m = mul(add(add(v[a]!, v[b]!), v[c]!), 1 / 3);
    return dot(n, sub(m, centre)) >= 0 ? [a, b, c] : [a, c, b];
  });
}

/** A flat-shaded primitive: every triangle has its own three vertices and its face normal. */
export function primitiveMesh(p: Primitive): SkinMesh {
  const v = primitiveVertices(p);
  const tris = primitiveFaces(p, v);
  const position = new Float32Array(tris.length * 9);
  const normal = new Float32Array(tris.length * 9);
  const index = new Uint32Array(tris.length * 3);
  tris.forEach((t, i) => {
    const n = norm(cross(sub(v[t[1]]!, v[t[0]]!), sub(v[t[2]]!, v[t[0]]!)));
    t.forEach((vi, k) => {
      position.set(v[vi]!, (i * 3 + k) * 3);
      normal.set(n, (i * 3 + k) * 3);
      index[i * 3 + k] = i * 3 + k;
    });
  });
  return { position, normal, index, parts: [{ start: 0, count: index.length }] };
}

/** Blender's vertex normals: each face's normal weighted by the corner angle it makes there. */
export function cornerNormals(v: Vec3[], faces: number[][]): Vec3[] {
  const acc: Vec3[] = v.map(() => [0, 0, 0]);
  for (const f of faces) {
    // Newell's method, so a non-planar quad gets its average plane.
    let n: Vec3 = [0, 0, 0];
    for (let i = 0; i < f.length; i++) {
      const a = v[f[i]!]!, b = v[f[(i + 1) % f.length]!]!;
      n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
    }
    n = norm(n);
    for (let i = 0; i < f.length; i++) {
      const c = v[f[i]!]!, prev = v[f[(i + f.length - 1) % f.length]!]!, next = v[f[(i + 1) % f.length]!]!;
      const e1 = norm(sub(prev, c)), e2 = norm(sub(next, c));
      const angle = Math.acos(Math.min(1, Math.max(-1, dot(e1, e2))));
      acc[f[i]!] = add(acc[f[i]!]!, mul(n, angle));
    }
  }
  return acc.map(norm);
}

/** One surface point as weights over the polygon's corners. */
type Weights = [number, number][];

/** Split each face N ways per edge. Points shared by two faces come out once. */
function tessellate(v: Vec3[], faces: number[][], N: number): { pts: Weights[]; tris: [number, number, number][] } {
  const pts: Weights[] = [];
  const seen = new Map<string, number>();
  const at = (w: Weights): number => {
    const p = w.reduce((s, [i, k]) => add(s, mul(v[i]!, k)), [0, 0, 0] as Vec3);
    const key = p.map((x) => Math.round(x * 1e6)).join(',');
    let id = seen.get(key);
    if (id === undefined) { id = pts.length; pts.push(w); seen.set(key, id); }
    return id;
  };
  const tris: [number, number, number][] = [];
  for (const f of faces) {
    if (f.length === 4) {
      const [a, b, c, d] = f as [number, number, number, number];
      const grid: number[][] = [];
      for (let i = 0; i <= N; i++) {
        const row: number[] = [];
        for (let j = 0; j <= N; j++) {
          const u = i / N, t = j / N; // bilinear: a→b along u, a→d along t
          row.push(at([[a, (1 - u) * (1 - t)], [b, u * (1 - t)], [c, u * t], [d, (1 - u) * t]]));
        }
        grid.push(row);
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const p00 = grid[i]![j]!, p10 = grid[i + 1]![j]!, p11 = grid[i + 1]![j + 1]!, p01 = grid[i]![j + 1]!;
        tris.push([p00, p10, p11], [p00, p11, p01]);
      }
    } else {
      const [a, b, c] = f as [number, number, number];
      const id = (i: number, j: number) => at([[a, (N - i - j) / N], [b, i / N], [c, j / N]]);
      for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
        tris.push([id(i, j), id(i + 1, j), id(i, j + 1)]);
        if (i + j < N - 1) tris.push([id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
      }
    }
  }
  return { pts, tris };
}

/**
 * A wing membrane: Solidify at offset 0 around its polygons, tessellated, rim-closed. The
 * polygons are whichever the wing form makes (graph.ts `wingForm`): one fan for a sail, a
 * scalloped fan for a spread wing, or an inner panel plus separate vanes for a segmented
 * one. Vanes share no corner, so each comes out as its own closed slab.
 */
export function membraneMesh(poly: { v: Vec3[]; f: number[][] }, N = 3, thickness = MEMBRANE_THICKNESS): SkinMesh {
  const n = cornerNormals(poly.v, poly.f);
  const top = poly.v.map((p, i) => add(p, mul(n[i]!, thickness / 2)));
  const bot = poly.v.map((p, i) => sub(p, mul(n[i]!, thickness / 2)));
  const { pts, tris } = tessellate(poly.v, poly.f, N);
  const place = (shell: Vec3[], w: Weights) => w.reduce((s, [i, k]) => add(s, mul(shell[i]!, k)), [0, 0, 0] as Vec3);

  const pos: number[] = [];
  const idx: number[] = [];
  const P = pts.length;
  for (const w of pts) pos.push(...place(top, w));
  for (const w of pts) pos.push(...place(bot, w));
  for (const [a, b, c] of tris) idx.push(a, b, c);
  for (const [a, b, c] of tris) idx.push(P + a, P + c, P + b);

  // The rim: every surface edge used by one triangle only is on the boundary.
  const used = new Map<string, number>();
  for (const [a, b, c] of tris) for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
    const k = x < y ? `${x},${y}` : `${y},${x}`;
    used.set(k, (used.get(k) ?? 0) + 1);
  }
  const rimStart = pos.length / 3;
  let rv = 0;
  for (const [a, b, c] of tris) for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
    const k = x < y ? `${x},${y}` : `${y},${x}`;
    if (used.get(k) !== 1) continue;
    // Its own four vertices, so the rim's hard edge does not smear the shells' normals.
    pos.push(...place(top, pts[y]!), ...place(top, pts[x]!), ...place(bot, pts[x]!), ...place(bot, pts[y]!));
    const o = rimStart + rv;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    rv += 4;
  }
  const position = new Float32Array(pos);
  const index = new Uint32Array(idx);
  return { position, normal: vertexNormals(position, index), index, parts: [{ start: 0, count: index.length }] };
}
