/**
 * Genome → dragon `BufferGeometry`. The runtime counterpart of `assetgen/dragon/builder.py`.
 *
 * The mesh itself is built by ./arrays.ts, which has no three.js so it can run in a worker
 * (./worker.ts, ./mesher.ts). This file wraps those arrays for three.js, on whichever
 * thread holds them. `buildDragon` is the whole creature (M3b). `buildDragonBody` is M3a's
 * subset: skeleton, torso, limbs and eyes.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import type { Genome } from '../../core/genome';
import { buildDragonArrays, type DragonArrays } from './arrays';
import { SKIN_LOD0, type SkinOptions } from './skin';

export * from './arrays';

export interface DragonBody extends Omit<DragonArrays, 'position' | 'normal' | 'color' | 'index' | 'groups' | 'idleBreathSway' | 'idleBlink'> {
  geometry: BufferGeometry;
}

/** Wrap built arrays in a geometry, with its material groups and bounds. The arrays are used, not copied. */
export function toGeometry(a: DragonArrays): DragonBody {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(a.position, 3));
  geometry.setAttribute('normal', new BufferAttribute(a.normal, 3));
  geometry.setAttribute('color', new BufferAttribute(a.color, 3));
  // The idle's baked weights (./idle.ts), read by src/render/idle.ts `withIdle`.
  geometry.setAttribute('idleBreathSway', new BufferAttribute(a.idleBreathSway, 4));
  geometry.setAttribute('idleBlink', new BufferAttribute(a.idleBlink, 3));
  geometry.setIndex(new BufferAttribute(a.index, 1));
  for (const g of a.groups) geometry.addGroup(g.start, g.count, g.mat);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, graph: a.graph, idx: a.idx, parts: a.parts, kinds: a.kinds };
}

/** Skeleton, torso, limbs and eyes: M3a's subset. */
export function buildDragonBody(genome: Genome, opts: SkinOptions = SKIN_LOD0): DragonBody {
  return toGeometry(buildDragonArrays(genome, false, opts));
}

/** The whole dragon: the full skin graph, eyes, membranes, spikes and tail ornament. */
export function buildDragon(genome: Genome, opts: SkinOptions = SKIN_LOD0): DragonBody {
  return toGeometry(buildDragonArrays(genome, true, opts));
}
