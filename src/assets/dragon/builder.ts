/**
 * Genome → dragon mesh. The runtime counterpart of `assetgen/dragon/builder.py`.
 *
 * Construction follows the reference in its order: the phenotype drives a skin graph
 * (./graph.ts, identical to the reference's — tests/dragon-graph.test.ts), and the graph
 * is skinned (./skin.ts). Colour is the reference's `mats()` scale and belly colours, with
 * the belly as a soft band under the spine (see BELLY_FROM), and the eyes are placed where
 * the reference's `place()` puts them.
 *
 * Stages present: skeleton, torso and limbs (M3a). Wings, membrane, crown and tail
 * ornament join at M3b; the worker and the 120 ms budget are M3c's.
 *
 * Axes: the graph is the reference's Blender frame (x forward, y left, z up). The geometry
 * is three.js's (y up): (x, y, z) → (x, z, −y), a rotation, so winding survives it. The
 * dragon faces +x and stands on y = 0.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import type { Genome, Phenotype } from '../../core/genome';
import { bodyGraph, type Anchors, type Graph } from './graph';
import { SKIN_LOD0, skinGraph, sphere, type SkinMesh, type SkinOptions } from './skin';

export interface DragonBody {
  geometry: BufferGeometry;
  /** The graph it was skinned from, in the reference's z-up frame. */
  graph: Graph;
  idx: Anchors;
  /** Index ranges of the closed parts (tubes and eyes), triangles × 3. */
  parts: { start: number; count: number }[];
  /** What each part is: the spine tube, a limb or toe tube, an eye or its highlight. */
  kinds: PartKind[];
}

/** Python `colorsys.hsv_to_rgb(h % 1.0, clamp(s), clamp(v))`, as the reference's `hsv`. */
export function hsv(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  s = Math.min(1, Math.max(0, s));
  v = Math.min(1, Math.max(0, v));
  if (s === 0) return [v, v, v];
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/** The reference's scale and belly colours (builder.py `mats`). Linear RGB, as Blender reads them. */
export function bodyColours(p: Phenotype): { scale: [number, number, number]; belly: [number, number, number] } {
  const { hue: H, hueShift: HSh, saturation: S, value: V } = p;
  return { scale: hsv(H, S, V), belly: hsv(H + HSh, S * 0.60, Math.min(0.95, V + 0.34)) };
}

/** builder.py `mats`: the eye and its highlight. */
export const EYE_COLOUR: [number, number, number] = [0.03, 0.04, 0.07];
export const GLINT_COLOUR: [number, number, number] = [1, 1, 1];

/**
 * Belly band. builder.py's `paint_belly` paints every face whose normal points below
 * z = -0.30, which on a smooth tube gave hard-edged blotches on the neck and legs (run 11,
 * critic D2). Here the belly is a soft band on the spine tube only, blending from the scale
 * colour where the normal's up component is BELLY_FROM to the belly colour at BELLY_TO.
 * The centre of the band is the reference's -0.30.
 */
export const BELLY_FROM = -0.12;
export const BELLY_TO = -0.48;
export function bellyWeight(up: number): number {
  const t = Math.min(Math.max((up - BELLY_FROM) / (BELLY_TO - BELLY_FROM), 0), 1);
  return t * t * (3 - 2 * t);
}

export type PartKind = 'spine' | 'limb' | 'eye' | 'glint';

export function buildDragonBody(genome: Genome, opts: SkinOptions = SKIN_LOD0): DragonBody {
  const p = genome.phenotype;
  const { g, idx } = bodyGraph(p);
  const skin = skinGraph(g, idx.tailTip, opts);

  // Eyes sit on the skull node, exactly where builder.py's `place` puts them.
  const [ex, , ez] = idx.headMidPos;
  const HS = p.headSize;
  const extras: { mesh: SkinMesh; kind: PartKind }[] = [];
  for (const s of [1, -1]) {
    extras.push({ mesh: sphere([ex + 0.10 * HS, 0.215 * HS * s, ez + 0.13 * HS], 0.112 * HS, 12, 6), kind: 'eye' });
    extras.push({ mesh: sphere([ex + 0.17 * HS, 0.258 * HS * s, ez + 0.17 * HS], 0.038 * HS, 6, 4), kind: 'glint' });
  }
  const kinds: PartKind[] = skin.parts.map((_, i) => (i === 0 ? 'spine' : 'limb'));
  const merged = merge([skin, ...extras.map((e) => e.mesh)]);
  for (const e of extras) kinds.push(e.kind);

  // Blender z-up → three y-up: (x, y, z) → (x, z, -y).
  const pos = merged.position, nrm = merged.normal;
  for (const a of [pos, nrm]) {
    for (let i = 0; i < a.length; i += 3) {
      const y = a[i + 1]!, z = a[i + 2]!;
      a[i + 1] = z;
      a[i + 2] = -y;
    }
  }

  const { scale, belly } = bodyColours(p);
  const col = new Float32Array(pos.length);
  const index = merged.index;
  merged.parts.forEach((part, pi) => {
    const kind = kinds[pi]!;
    for (let t = part.start; t < part.start + part.count; t++) {
      const v = index[t]! * 3;
      let c: readonly number[];
      if (kind === 'eye') c = EYE_COLOUR;
      else if (kind === 'glint') c = GLINT_COLOUR;
      else if (kind === 'limb') c = scale;
      else {
        const w = bellyWeight(nrm[v + 1]!);
        c = [scale[0] + (belly[0] - scale[0]) * w, scale[1] + (belly[1] - scale[1]) * w, scale[2] + (belly[2] - scale[2]) * w];
      }
      col[v] = c[0]!; col[v + 1] = c[1]!; col[v + 2] = c[2]!;
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new BufferAttribute(col, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, graph: g, idx, parts: merged.parts, kinds };
}

/** Concatenate meshes; part ranges are re-based into the combined index. */
function merge(meshes: SkinMesh[]): SkinMesh {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.position.length; ni += m.index.length; }
  const position = new Float32Array(nv), normal = new Float32Array(nv), index = new Uint32Array(ni);
  const parts: SkinMesh['parts'] = [];
  let ov = 0, oi = 0;
  for (const m of meshes) {
    position.set(m.position, ov);
    normal.set(m.normal, ov);
    const base = ov / 3;
    for (let k = 0; k < m.index.length; k++) index[oi + k] = m.index[k]! + base;
    for (const part of m.parts) parts.push({ start: part.start + oi, count: part.count });
    ov += m.position.length;
    oi += m.index.length;
  }
  return { position, normal, index, parts };
}
