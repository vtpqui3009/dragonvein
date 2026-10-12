/**
 * Genome → dragon mesh. The runtime counterpart of `assetgen/dragon/builder.py`.
 *
 * Construction follows the reference in its order: the phenotype drives a skin graph
 * (./graph.ts, identical to the reference's — tests/dragon-graph.test.ts), and the graph
 * is skinned (./skin.ts). Colour is the reference's `mats()` scale and belly colours, with
 * the belly where the surface faces down, as its `paint_belly` does.
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
import { SKIN_LOD0, skinGraph, type SkinOptions } from './skin';

export interface DragonBody {
  geometry: BufferGeometry;
  /** The graph it was skinned from, in the reference's z-up frame. */
  graph: Graph;
  idx: Anchors;
  /** Index ranges of the closed tubes, triangles × 3. */
  parts: { start: number; count: number }[];
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

/** builder.py `paint_belly`: faces whose normal's up component is below this are belly. */
export const BELLY_THRESHOLD = -0.30;

export function buildDragonBody(genome: Genome, opts: SkinOptions = SKIN_LOD0): DragonBody {
  const p = genome.phenotype;
  const { g, idx } = bodyGraph(p);
  const skin = skinGraph(g, idx.tailTip, opts);

  // Blender z-up → three y-up: (x, y, z) → (x, z, -y).
  const pos = skin.position, nrm = skin.normal;
  for (const a of [pos, nrm]) {
    for (let i = 0; i < a.length; i += 3) {
      const y = a[i + 1]!, z = a[i + 2]!;
      a[i + 1] = z;
      a[i + 2] = -y;
    }
  }

  const { scale, belly } = bodyColours(p);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < col.length; i += 3) {
    const c = nrm[i + 1]! < BELLY_THRESHOLD ? belly : scale;
    col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2];
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new BufferAttribute(col, 3));
  geometry.setIndex(new BufferAttribute(skin.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, graph: g, idx, parts: skin.parts };
}
