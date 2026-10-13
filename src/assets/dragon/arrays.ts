/**
 * Genome → dragon mesh data, with no three.js: the half of the builder that runs in the
 * worker (./worker.ts). ./builder.ts wraps the result in a `BufferGeometry`.
 *
 * Construction follows the reference, `assetgen/dragon/builder.py`, in its order: the
 * phenotype drives a skin graph (./graph.ts, identical to the reference's;
 * tests/dragon-graph.test.ts), and the graph is skinned (./skin.ts). The parts the
 * reference builds from Blender primitives come from ./parts.ts. Colour is the reference's
 * `mats()`, decoded from sRGB. The belly is a soft band under the spine (see BELLY_FROM),
 * and the eyes sit where the reference's `place()` puts them.
 *
 * Axes: the graph is the reference's Blender frame (x forward, y left, z up). The output is
 * three.js's (y up): (x, y, z) → (x, z, −y), a rotation, so winding survives it. The dragon
 * faces +x and stands on y = 0.
 */
import type { Genome, Phenotype } from '../../core/genome';
import { bodyGraph, fullGraph, headScale, membranePolys, ornamentParams, spikeParams, type Anchors, type Graph } from './graph';
import { membraneMesh, primitiveMesh } from './parts';
import { SKIN_LOD0, skinGraph, sphere, type SkinMesh, type SkinOptions } from './skin';

/** Everything a renderer needs, as transferable typed arrays plus small plain data. */
export interface DragonArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
  /** Material groups over `index`: 0 skin, 1 membrane, 2 horn (MATERIAL_OF). */
  groups: { start: number; count: number; mat: number }[];
  /** Index ranges of the closed parts, triangles × 3. */
  parts: { start: number; count: number }[];
  /** What each part is: the spine tube, a limb or toe tube, an eye, membrane, spike... */
  kinds: PartKind[];
  /** The graph it was skinned from, in the reference's z-up frame. */
  graph: Graph;
  idx: Anchors;
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

/** sRGB transfer function, decoded: display value → linear light. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const toLinear = (c: [number, number, number]): [number, number, number] =>
  [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];

/**
 * The reference's scale and belly colours (builder.py `mats`), as linear RGB for the vertex
 * attribute. The genes are read as *display* colours and decoded from sRGB. Blender takes
 * the same HSV triple as linear, which shows paler: a gale dragon at the genes' saturation
 * floor of 0.35 sampled at s ≈ 0.11 on screen, where docs/ART_BIBLE.md §Palette asks that
 * saturation "stays inside 0.35–1.00 so no dragon is pure white" (run 11, critic A2).
 * The bible describes what the player sees, so the genes mean what is on screen.
 */
export function bodyColours(p: Phenotype): { scale: [number, number, number]; belly: [number, number, number] } {
  const { hue: H, hueShift: HSh, saturation: S, value: V } = p;
  return { scale: toLinear(hsv(H, S, V)), belly: toLinear(hsv(H + HSh, S * 0.60, Math.min(0.95, V + 0.34))) };
}

/**
 * The reference's membrane and horn colours (`mats`), decoded from sRGB like the body's.
 * The membrane's hue sits half the belly's shift from the body's: an analogous neighbour on
 * the wheel (at most 0.11 away). At 1.6 times the shift it reached 0.35 away, and red bodies
 * wore yellow or lime wings and brown ones pink (M3e cycle 2, art m3).
 */
export function partColours(p: Phenotype): { memb: [number, number, number]; horn: [number, number, number] } {
  const { hue: H, hueShift: HSh, saturation: S, value: V } = p;
  return {
    memb: toLinear(hsv(H + HSh * 0.5, S * 0.85, Math.min(0.92, V + 0.22))),
    horn: toLinear(hsv(H + 0.5 * HSh, S * 0.30, Math.min(0.96, V + 0.46))),
  };
}

/** builder.py `mats`: the eye and its highlight. */
export const EYE_COLOUR: [number, number, number] = [0.03, 0.04, 0.07]; // linear, as builder.py gives it
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

export type PartKind = 'spine' | 'limb' | 'eye' | 'glint' | 'membrane' | 'spike' | 'ornament';

/** Geometry group material index per part: 0 skin, 1 membrane, 2 horn. */
export const MATERIAL_OF: Record<PartKind, number> = {
  spine: 0, limb: 0, eye: 0, glint: 0, membrane: 1, spike: 2, ornament: 2,
};

/** The whole dragon's arrays: full skin graph, eyes, membranes, spikes and tail ornament. */
export function buildDragonArrays(genome: Genome, full = true, opts: SkinOptions = SKIN_LOD0): DragonArrays {
  return build(genome, full, opts);
}

function build(genome: Genome, full: boolean, opts: SkinOptions): DragonArrays {
  const p = genome.phenotype;
  const { g, idx } = full ? fullGraph(p) : bodyGraph(p);
  const skin = skinGraph(g, idx.tailTip, opts);

  // Eyes sit on the skull node, exactly where builder.py's `place` puts them.
  const [ex, , ez] = idx.headMidPos;
  const HS = headScale(p.headSize); // the skull's own scale (graph.ts headScale)
  const extras: { mesh: SkinMesh; kind: PartKind }[] = [];
  for (const s of [1, -1]) {
    extras.push({ mesh: sphere([ex + 0.10 * HS, 0.215 * HS * s, ez + 0.13 * HS], 0.112 * HS, 12, 6), kind: 'eye' });
    extras.push({ mesh: sphere([ex + 0.17 * HS, 0.258 * HS * s, ez + 0.17 * HS], 0.038 * HS, 6, 4), kind: 'glint' });
  }
  if (full) {
    for (const side of [1, -1]) extras.push({ mesh: membraneMesh(membranePolys(p, side)), kind: 'membrane' });
    for (const c of spikeParams(p)) extras.push({ mesh: primitiveMesh(c), kind: 'spike' });
    const orn = ornamentParams(p);
    if (orn) extras.push({ mesh: primitiveMesh(orn), kind: 'ornament' });
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
  const { memb, horn } = partColours(p);
  const col = new Float32Array(pos.length);
  const index = merged.index;
  merged.parts.forEach((part, pi) => {
    const kind = kinds[pi]!;
    for (let t = part.start; t < part.start + part.count; t++) {
      const v = index[t]! * 3;
      let c: readonly number[];
      if (kind === 'eye') c = EYE_COLOUR;
      else if (kind === 'membrane') c = memb;
      else if (kind === 'spike' || kind === 'ornament') c = horn;
      else if (kind === 'glint') c = GLINT_COLOUR;
      else if (kind === 'limb') c = scale;
      else {
        const w = bellyWeight(nrm[v + 1]!);
        c = [scale[0] + (belly[0] - scale[0]) * w, scale[1] + (belly[1] - scale[1]) * w, scale[2] + (belly[2] - scale[2]) * w];
      }
      col[v] = c[0]!; col[v + 1] = c[1]!; col[v + 2] = c[2]!;
    }
  });

  // Material groups, in part order: skin (tubes and eyes), membrane, horn (spikes and
  // ornament). The reference gives each its own material (`mats`); a matte membrane read
  // as glass under the skin's gloss (run 12, art A3).
  const groups: DragonArrays['groups'] = [];
  for (let pi = 0; pi < merged.parts.length; pi++) {
    const part = merged.parts[pi]!, mat = MATERIAL_OF[kinds[pi]!];
    const last = groups[groups.length - 1];
    if (last && last.mat === mat && last.start + last.count === part.start) last.count += part.count;
    else groups.push({ mat, start: part.start, count: part.count });
  }
  return { position: pos, normal: nrm, color: col, index, groups, parts: merged.parts, kinds, graph: g, idx };
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
