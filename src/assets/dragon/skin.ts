/**
 * Skin a dragon graph (./graph.ts) into a closed, outward-wound triangle mesh.
 *
 * The reference skins its graph with Blender's Skin modifier and Subsurf, which this file
 * does not try to imitate vertex for vertex (STATE.md run 11). It sweeps tubes instead:
 *
 *  1. **Paths.** The graph is a tree. Starting from a leaf (the tail tip), a path keeps
 *     going into the child with the longest remaining chain, so tail → torso → neck → head
 *     is one smooth tube. Every other child starts a branch at the node it hangs from: the
 *     legs at the hip and shoulder, the toes at the foot. Where several children tie
 *     (the toes of one foot), the path stops and each child branches, so no toe is the
 *     leg's favourite.
 *  2. **Curves.** Each path is a centripetal Catmull-Rom curve through its nodes, sampled
 *     by length; the radius follows a uniform Catmull-Rom through the node radii, clamped
 *     between the two nodes either side of it so it never bulges past either.
 *  3. **Rings.** A ring per sample, oriented by parallel transport (no twisting), and a
 *     rounded cap at both ends. A branch starts at its parent node's centre with a fraction
 *     of the parent's radius, so it grows out of the body instead of being glued on.
 *
 * Every tube is closed — each edge is shared by exactly two triangles — and wound so its
 * normals point out (three.js culls back faces: NEXT.md §Mesh winding).
 * tests/dragon-body.test.ts checks both on 32 genomes.
 *
 * Output is plain typed arrays, so a worker can transfer them (M3c).
 */
import type { Graph, Vec3 } from './graph';

export interface SkinOptions {
  /** Target distance between rings along a tube, in world units. */
  ringStep: number;
  /** Radial segments for the main tube, for tubes thicker than `thinRadius`, and the rest. */
  segMain: number;
  segLimb: number;
  segThin: number;
  thinRadius: number;
  /** Rings in each end cap, pole excluded, for thick tubes and for thin ones. */
  capRings: number;
  capRingsThin: number;
  /** Thin tubes (toes) space their rings this many times wider. */
  thinStepScale: number;
  /**
   * Every other branch (legs, wing bones, horns, crest) spaces its rings this many times
   * wider than the spine: short, smooth curves that need fewer rings than the long body.
   */
  branchStepScale: number;
  /** A branch starts at this fraction of its parent node's radius... */
  branchRoot: number;
  /** ...but at most this multiple of its own first node's radius. */
  branchCap: number;
  /** Ring orientation averages the curve over ± this many radii. */
  tangentWindow: number;
  /** A node thinner than both neighbours is raised to this fraction of their mean. */
  pinchFill: number;
}

export const SKIN_LOD0: SkinOptions = {
  ringStep: 0.12, segMain: 16, segLimb: 10, segThin: 6, thinRadius: 0.14,
  capRings: 3, capRingsThin: 1, thinStepScale: 2, branchStepScale: 1.5, branchRoot: 0.8, branchCap: 1.25, tangentWindow: 1.5, pinchFill: 0.92,
};

export interface SkinMesh {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  /** One entry per tube: its range in `index` (triangles × 3). Every tube is closed. */
  parts: { start: number; count: number }[];
  /**
   * Tubes only (`skinGraph`): where along its path each vertex's ring sits, for the skin
   * weights (./rig.ts, M7b). Per vertex: the tube (`path`, an index into `tubes`), the
   * segment between path points k and k+1 (`k`), and the curve parameter u ∈ [0, 1] along it.
   * Cap rings and poles take their end's segment at u = 0 or 1.
   */
  rings?: { path: Uint16Array; k: Uint16Array; u: Float32Array };
  /** Per tube, per path point: the graph node ids at that point (coincident nodes merge) and its radius. */
  tubes?: { ids: number[][]; r: number[] }[];
}

/** A sample along a path: centre, radius, and the segment k (points k → k+1) and parameter u it lies at. */
interface Station { c: Vec3; r: number; k: number; u: number }

/** Split the tree into paths. Each path lists node ids; `from` is the node a branch grows out of. */
export function paths(g: Graph, root: number): { from: number | null; nodes: number[] }[] {
  const n = g.v.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of g.e) { adj[a]!.push(b); adj[b]!.push(a); }

  // Longest chain (in nodes) below each node, rooted at `root`. Iterative post-order.
  const parent = new Int32Array(n).fill(-2);
  const order: number[] = [];
  const stack = [root];
  parent[root] = -1;
  while (stack.length) {
    const u = stack.pop()!;
    order.push(u);
    for (const w of adj[u]!) if (parent[w] === -2) { parent[w] = u; stack.push(w); }
  }
  if (order.length !== n) throw new Error(`skin: graph is not connected (${order.length} of ${n} nodes reachable)`);
  const height = new Int32Array(n);
  const kids: number[][] = Array.from({ length: n }, () => []);
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i]!;
    let h = 0;
    for (const w of adj[u]!) if (parent[w] === u) { kids[u]!.push(w); h = Math.max(h, height[w]!); }
    height[u] = h + 1;
  }

  const out: { from: number | null; nodes: number[] }[] = [];
  const queue: { from: number | null; start: number }[] = [{ from: null, start: root }];
  while (queue.length) {
    const { from, start } = queue.shift()!;
    const nodes = [start];
    let u = start;
    for (;;) {
      const ch = kids[u]!;
      if (!ch.length) break;
      const best = Math.max(...ch.map((w) => height[w]!));
      const top = ch.filter((w) => height[w] === best);
      if (top.length !== 1) {
        for (const w of ch) queue.push({ from: u, start: w });
        break;
      }
      for (const w of ch) if (w !== top[0]) queue.push({ from: u, start: w });
      u = top[0]!;
      nodes.push(u);
    }
    out.push({ from, nodes });
  }
  return out;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0];
}

/** Centripetal Catmull-Rom between p1 and p2 at u ∈ [0, 1] (Barry–Goldman). */
function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const k = (a: Vec3, b: Vec3) => Math.max(Math.sqrt(len(sub(b, a))), 1e-6);
  const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const wa = (tb - t) / (tb - ta), wb = (t - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  };
  const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Uniform Catmull-Rom on scalars, clamped between r1 and r2 so a radius never overshoots. */
function radiusAt(r0: number, r1: number, r2: number, r3: number, u: number): number {
  const u2 = u * u, u3 = u2 * u;
  const v = 0.5 * (2 * r1 + (-r0 + r2) * u + (2 * r0 - 5 * r1 + 4 * r2 - r3) * u2 + (-r0 + 3 * r1 - 3 * r2 + r3) * u3);
  return Math.min(Math.max(v, Math.min(r1, r2)), Math.max(r1, r2));
}

/** Centres and radii sampled along one path's curve. */
function sampleCurve(pts: Vec3[], rad: number[], step: number): Station[] {
  const n = pts.length;
  const P = (i: number): Vec3 => {
    if (i < 0) { const a = pts[0]!, b = pts[1]!; return [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]]; }
    if (i >= n) { const a = pts[n - 1]!, b = pts[n - 2]!; return [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]]; }
    return pts[i]!;
  };
  const R = (i: number) => rad[Math.min(Math.max(i, 0), n - 1)]!;
  const out: Station[] = [{ c: pts[0]!, r: rad[0]!, k: 0, u: 0 }];
  for (let i = 0; i < n - 1; i++) {
    const steps = Math.max(1, Math.ceil(len(sub(pts[i + 1]!, pts[i]!)) / step));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      out.push({
        c: s === steps ? pts[i + 1]! : catmull(P(i - 1), P(i), P(i + 1), P(i + 2), u),
        r: radiusAt(R(i - 1), R(i), R(i + 1), R(i + 2), u),
        k: i, u,
      });
    }
  }
  return out;
}

/** Skin `g` into tubes rooted at `root` (a leaf: the tail tip). */
export function skinGraph(g: Graph, root: number, o: SkinOptions = SKIN_LOD0): SkinMesh {
  const pos: number[] = [];
  const idx: number[] = [];
  const parts: SkinMesh['parts'] = [];
  const all = paths(g, root);
  // Where each vertex sits along its tube, for the skin weights (./rig.ts): one record per
  // ring (tube, segment, parameter, vertex count), expanded per vertex at the end.
  const ringRec: number[] = [];
  const tubes: NonNullable<SkinMesh['tubes']> = [];

  all.forEach((path, pi) => {
    const pts: Vec3[] = [];
    const rad: number[] = [];
    const ids: number[][] = [];
    if (path.from !== null) {
      // A branch grows out of its parent's centre, at a fraction of the parent's radius but
      // no more than branchCap times its own first node: a horn rooted at 0.8 of the skull's
      // radius would be a second skull (run 12).
      pts.push(g.v[path.from]!);
      rad.push(Math.min(g.r[path.from]! * o.branchRoot, g.r[path.nodes[0]!]! * o.branchCap));
      ids.push([path.from]);
    }
    for (const id of path.nodes) {
      // Coincident nodes merge, keeping the larger radius. The reference puts the tail
      // root and the hip at the same point; a zero-length span there cut a ring-shaped
      // step into the body where the radius jumped (run 11, first sheet).
      const q = g.v[id]!, prev = pts[pts.length - 1];
      if (prev && len(sub(q, prev)) < 1e-6) {
        rad[rad.length - 1] = Math.max(rad[rad.length - 1]!, g.r[id]!);
        ids[ids.length - 1]!.push(id);
      } else { pts.push(q); rad.push(g.r[id]!); ids.push([id]); }
    }
    if (pts.length < 2) return; // a lone node: nothing to sweep (the graph has none)
    // Fill pinches: a node thinner than both neighbours is raised toward their mean, so the
    // skin does not waist in where a thin neck meets a broad skull (run 11, critic D3).
    // The graph keeps the reference's radii; only the skin laid over it is filled.
    for (let i = 1; i < rad.length - 1; i++) {
      const a = rad[i - 1]!, b = rad[i + 1]!;
      if (rad[i]! < a && rad[i]! < b) rad[i] = Math.max(rad[i]!, ((a + b) / 2) * o.pinchFill);
    }

    // Thickness is judged on the path's own nodes, not the root it borrows from its parent.
    const ownR = Math.max(...path.nodes.map((id) => g.r[id]!));
    const thin = pi !== 0 && ownR <= o.thinRadius;
    const seg = pi === 0 ? o.segMain : thin ? o.segThin : o.segLimb;
    // A branch's start cap sits at its parent node's centre, inside the parent's own tube,
    // where nobody sees it; a tapered tube ends thin. Each of those ends takes the thin cap,
    // which keeps the crown and toes inside the triangle cap (M3f).
    const capRings = thin ? o.capRingsThin : o.capRings;
    const capRingsStart = path.from !== null ? o.capRingsThin : capRings;
    const st = sampleCurve(pts, rad, o.ringStep * (thin ? o.thinStepScale : pi === 0 ? 1 : o.branchStepScale));

    // Tangents over a window as wide as the tube is thick, then parallel-transported frames.
    // A plain central difference turned each ring as fast as the curve turned, so where a
    // thick tube bends sharply (neck into skull, the knee) neighbouring rings crossed on the
    // inside of the bend and folded into a lip (run 11, critics D3 and A8). Averaging the
    // direction over ±radius turns the rings gradually instead.
    const S = [0];
    for (let i = 1; i < st.length; i++) S.push(S[i - 1]! + len(sub(st[i]!.c, st[i - 1]!.c)));
    const total = S[S.length - 1]!;
    const at = (d: number): Vec3 => {
      const x = Math.min(Math.max(d, 0), total);
      let k = 1;
      while (k < S.length - 1 && S[k]! < x) k++;
      const a = st[k - 1]!.c, b = st[k]!.c, span = S[k]! - S[k - 1]!;
      const u = span > 1e-12 ? (x - S[k - 1]!) / span : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    };
    const T: Vec3[] = st.map((s0, i) => {
      const h = Math.max(s0.r * o.tangentWindow, 1e-4);
      const t = sub(at(S[i]! + h), at(S[i]! - h));
      return len(t) > 1e-9 ? norm(t) : norm(sub(st[Math.min(i + 1, st.length - 1)]!.c, st[Math.max(i - 1, 0)]!.c));
    });
    const t0 = T[0]!;
    const up: Vec3 = Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    let nrm = norm(sub(up, scale(t0, dot(up, t0))));
    const N: Vec3[] = [];
    for (const t of T) {
      nrm = sub(nrm, scale(t, dot(nrm, t)));
      nrm = len(nrm) > 1e-9 ? norm(nrm) : norm(cross(t, Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
      N.push(nrm);
    }

    // Rings along the curve, with cap rings prepended and appended.
    type Ring = { c: Vec3; r: number; t: Vec3; n: Vec3; k: number; u: number };
    const rings: Ring[] = st.map((s, i) => ({ c: s.c, r: s.r, t: T[i]!, n: N[i]!, k: s.k, u: s.u }));
    const first = rings[0]!, last = rings[rings.length - 1]!;
    const capStart: Ring[] = [], capEnd: Ring[] = [];
    for (let k = capRingsStart; k >= 1; k--) {
      const a = (k / (capRingsStart + 1)) * (Math.PI / 2);
      capStart.push({ c: add(first.c, scale(first.t, -first.r * Math.sin(a))), r: first.r * Math.cos(a), t: first.t, n: first.n, k: first.k, u: first.u });
    }
    const capRingsEnd = last.r <= o.thinRadius ? o.capRingsThin : capRings;
    for (let k = 1; k <= capRingsEnd; k++) {
      const a = (k / (capRingsEnd + 1)) * (Math.PI / 2);
      capEnd.push({ c: add(last.c, scale(last.t, last.r * Math.sin(a))), r: last.r * Math.cos(a), t: last.t, n: last.n, k: last.k, u: last.u });
    }
    const seq = [...capStart, ...rings, ...capEnd];

    const startIndex = idx.length;
    const base = pos.length / 3;
    const poleA = add(first.c, scale(first.t, -first.r));
    const poleB = add(last.c, scale(last.t, last.r));
    const ti = tubes.length;
    tubes.push({ ids, r: rad });
    pos.push(...poleA);
    ringRec.push(ti, first.k, first.u, 1);
    for (const ring of seq) {
      const b = cross(ring.t, ring.n);
      ringRec.push(ti, ring.k, ring.u, seg);
      for (let j = 0; j < seg; j++) {
        const phi = (j / seg) * Math.PI * 2;
        const cs = Math.cos(phi) * ring.r, sn = Math.sin(phi) * ring.r;
        pos.push(
          ring.c[0] + ring.n[0] * cs + b[0] * sn,
          ring.c[1] + ring.n[1] * cs + b[1] * sn,
          ring.c[2] + ring.n[2] * cs + b[2] * sn,
        );
      }
    }
    pos.push(...poleB);
    ringRec.push(ti, last.k, last.u, 1);
    const ringAt = (i: number, j: number) => base + 1 + i * seg + (j % seg);
    const pa = base, pb = base + 1 + seq.length * seg;
    for (let j = 0; j < seg; j++) idx.push(pa, ringAt(0, j + 1), ringAt(0, j));
    for (let i = 0; i < seq.length - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = ringAt(i, j), b = ringAt(i, j + 1), c = ringAt(i + 1, j + 1), d = ringAt(i + 1, j);
        idx.push(a, b, c, a, c, d);
      }
    }
    const L = seq.length - 1;
    for (let j = 0; j < seg; j++) idx.push(ringAt(L, j), ringAt(L, j + 1), pb);
    parts.push({ start: startIndex, count: idx.length - startIndex });
  });

  const position = new Float32Array(pos);
  const index = new Uint32Array(idx);
  const nv = position.length / 3;
  const rings = { path: new Uint16Array(nv), k: new Uint16Array(nv), u: new Float32Array(nv) };
  for (let r = 0, v = 0; r < ringRec.length; r += 4) {
    const end = v + ringRec[r + 3]!;
    rings.path.fill(ringRec[r]!, v, end);
    rings.k.fill(ringRec[r + 1]!, v, end);
    rings.u.fill(ringRec[r + 2]!, v, end);
    v = end;
  }
  return { position, normal: vertexNormals(position, index), index, parts, rings, tubes };
}

/** A closed UV sphere, outward-wound, as its own part. */
export function sphere(c: Vec3, r: number, seg: number, rings: number): SkinMesh {
  const pos: number[] = [c[0], c[1], c[2] - r];
  for (let i = 1; i < rings; i++) {
    const th = -Math.PI / 2 + (i / rings) * Math.PI;
    for (let j = 0; j < seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      pos.push(c[0] + r * Math.cos(th) * Math.cos(ph), c[1] + r * Math.cos(th) * Math.sin(ph), c[2] + r * Math.sin(th));
    }
  }
  pos.push(c[0], c[1], c[2] + r);
  const at = (i: number, j: number) => 1 + i * seg + (j % seg);
  const top = 1 + (rings - 1) * seg;
  const idx: number[] = [];
  for (let j = 0; j < seg; j++) idx.push(0, at(0, j + 1), at(0, j));
  for (let i = 0; i < rings - 2; i++) {
    for (let j = 0; j < seg; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
  }
  for (let j = 0; j < seg; j++) idx.push(at(rings - 2, j), at(rings - 2, j + 1), top);
  const position = new Float32Array(pos);
  const index = new Uint32Array(idx);
  return { position, normal: vertexNormals(position, index), index, parts: [{ start: 0, count: index.length }] };
}

function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

/** Area-weighted vertex normals. Tubes share no vertex, so each stays smooth on its own. */
export function vertexNormals(p: Float32Array, index: Uint32Array): Float32Array {
  const nrm = new Float32Array(p.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3, b = index[i + 1]! * 3, c = index[i + 2]! * 3;
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nrm[k] = nrm[k]! + nx; nrm[k + 1] = nrm[k + 1]! + ny; nrm[k + 2] = nrm[k + 2]! + nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!) || 1;
    nrm[i] = nrm[i]! / l; nrm[i + 1] = nrm[i + 1]! / l; nrm[i + 2] = nrm[i + 2]! / l;
  }
  return nrm;
}
