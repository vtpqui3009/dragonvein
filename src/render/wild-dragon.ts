import * as THREE from 'three';
import { Genome, type GenomeJson } from '../core/genome';
import { DragonMesher } from '../assets/dragon/mesher';
import { flightParams, type FlightParams } from '../assets/dragon/flight';
import { idleParams } from '../assets/dragon/idle';
import { walkParams, type WalkParams } from '../assets/dragon/walk';
import { DragonFlight } from './flight';
import { withIdle } from './idle';
import { DragonWalk } from './walk';
import { DragonAttitude, fleePose, type FleePose } from './wild';

/**
 * The hero island's wild dragon on screen (M8b): built through the mesh worker, skinned over
 * its own graph's skeleton, and driven by the M7 runtime — the idle always, the walk while it
 * moves, the M7c flap and glide while it flees — with the tells (./wild.ts `DragonAttitude`)
 * on top. src/main.ts loads this module lazily once the world is ready, so neither the mesher
 * nor the dragon code delays the first frame, and calls `update` once per frame with the
 * sim's state, interpolated between ticks.
 *
 * **One draw, plus its shadow.** The viewer draws a dragon with three materials (scale,
 * membrane, horn), which in the game would be three draws and three shadow draws, and three.js
 * churns about 2 kB of heap per draw (docs/PERF_BUDGET.md §Heap churn). Here the three differ
 * only in roughness, so the geometry's groups become a per-vertex `rough` attribute and the
 * whole dragon is one `MeshStandardMaterial` (`withRough`). The horns lose the viewer's flat
 * shading, which at the game's distance is a few pixels.
 *
 * **Its shadow has its own depth material** (the idle patch on a `MeshDepthMaterial`), so
 * three's pooled one never flips a flag for it (docs/PERF_BUDGET.md, M8b).
 *
 * **Skinned through a uniform array, not three's bone texture.** A `SkinnedMesh` re-uploads
 * its bone texture every frame, and three's texture upload path builds a cache-key array and
 * string per upload; on the dragon viewer's sheet that measured about 840 B/frame per dragon
 * (STATE.md run 31). Here the dragon is a plain `Mesh` whose materials define USE_SKINNING
 * and read their bone matrices from `uBones`, a `mat4` uniform array the size of its rig
 * (`withBones`); `update` copies the walk's posed bone matrices into one `Float32Array`
 * that both the colour and the shadow programs upload as it stands. The skinning itself is
 * three's own chunks, unchanged; the rest pose is still the identity, so a dragon at rest is
 * the mesh as built.
 *
 * **Feet stay planted.** The sim moves the dragon over the deck; the gait clock here advances
 * by the distance it actually moved, over the walk's own speed at this scale, so a planted
 * foot stays still on the deck whatever speed the sim chose. Turning on the spot steps too.
 *
 * Nothing in `update` allocates.
 */

/** Roughness of the scale, membrane and horn groups (src/dragon-view.ts's three materials). */
const ROUGHNESS = [0.42, 0.85, 0.32] as const;
/** Seconds the walk weight takes to ease in or out. */
const WALK_RAMP_S = 0.35;
/** Below this (world units per second, or the turn's equivalent) the dragon is standing. */
const MOVING = 0.03;
/** A turn of one radian steps like this much travel (world units), so a turn on the spot walks its feet round. */
const TURN_STEP = 0.3;

const ROUGH_PARS_V = 'attribute float rough;\nvarying float vRough;';
const ROUGH_PARS_F = 'varying float vRough;';

/** Roughness from the `rough` vertex attribute instead of the uniform. Composes with an earlier patch. */
export function withRough<T extends THREE.MeshStandardMaterial>(material: T): T {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    if (!shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw new Error('withRough: no #include <roughnessmap_fragment>');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROUGH_PARS_V}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRough = rough;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROUGH_PARS_F}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = vRough;');
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-rough-v1`;
  material.needsUpdate = true;
  return material;
}

/**
 * Skin `material` from `bones` (16 floats per bone, the walk's posed matrices in the mesh's
 * own frame) instead of a `SkinnedMesh`'s bone texture: USE_SKINNING on, the bind matrices the
 * identity (as `bindSkinned` binds them), `getBoneMatrix` reading the uniform array. Works on a
 * depth material too. Composes with an earlier patch.
 */
export function withBones<T extends THREE.Material>(material: T, bones: Float32Array): T {
  const n = bones.length / 16;
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  const uniform = { value: bones };
  material.defines = { ...(material.defines ?? {}), USE_SKINNING: '' };
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    if (!shader.vertexShader.includes('#include <skinning_pars_vertex>')) throw new Error('withBones: no #include <skinning_pars_vertex>');
    shader.uniforms['uBones'] = uniform;
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_pars_vertex>', `
	uniform mat4 uBones[ ${n} ];
	const mat4 bindMatrix = mat4( 1.0 );
	const mat4 bindMatrixInverse = mat4( 1.0 );
	mat4 getBoneMatrix( const in float i ) { return uBones[ int( i ) ]; }
`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-bones-${n}`;
  material.needsUpdate = true;
  return material;
}

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const wrap = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

export class WildDragonView {
  /** Placed on the deck by `update`: position, yaw and scale. The mesh sits inside it, centred on its torso. */
  readonly holder = new THREE.Group();
  readonly mesh: THREE.Mesh;
  /** The posed bone matrices, 16 floats a bone: what `uBones` uploads. */
  readonly bones: Float32Array;
  readonly walk: DragonWalk;
  readonly flight: DragonFlight;
  readonly attitude = new DragonAttitude();
  readonly gait: WalkParams;
  readonly flightParams: FlightParams;
  readonly gid: string;
  readonly triangles: number;
  /** The worker's round trip for this dragon, ms. */
  readonly buildMs: number;
  /** The gait clock (s), the walk weight's linear ramp and its eased value. */
  gaitT = 0;
  walkL = 0;
  walkW = 0;
  /** The flight's pose this frame. */
  readonly fleeNow: FleePose = { flap: 0, glide: 0, altitude: 0 };
  private lastX = Number.NaN;
  private lastZ = 0;
  private lastH = 0;

  private constructor(
    mesh: THREE.Mesh, bones: Float32Array, walk: DragonWalk, flight: DragonFlight, gait: WalkParams, fp: FlightParams,
    gid: string, buildMs: number, private readonly scale: number,
  ) {
    this.mesh = mesh;
    this.bones = bones;
    this.walk = walk;
    this.flight = flight;
    this.gait = gait;
    this.flightParams = fp;
    this.gid = gid;
    this.buildMs = buildMs;
    this.triangles = (mesh.geometry.getIndex()?.count ?? 0) / 3;
    walk.attitude = this.attitude;
    this.holder.add(mesh);
    this.holder.scale.setScalar(scale);
    this.holder.name = 'wild-dragon';
  }

  /**
   * Build the dragon `genome` describes, off the main thread, at `scale` world units per mesh
   * unit. `wrap` adds the page's own material patches (the rim light) before the dragon's.
   */
  static async build(genome: GenomeJson, scale: number, wrap: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): Promise<WildDragonView> {
    const gm = Genome.fromJSON(genome);
    const mesher = new DragonMesher();
    let built;
    try {
      built = await mesher.build(gm);
    } finally {
      mesher.dispose();
    }
    const body = built.body;
    const g = body.geometry;
    // The three material groups become one draw with per-vertex roughness.
    const rough = new Float32Array(g.getAttribute('position').count).fill(ROUGHNESS[0]);
    const index = g.getIndex()!.array;
    for (const grp of g.groups) {
      const r = ROUGHNESS[grp.materialIndex ?? 0] ?? ROUGHNESS[0];
      for (let i = grp.start; i < grp.start + grp.count; i++) rough[index[i]!] = r;
    }
    g.setAttribute('rough', new THREE.BufferAttribute(rough, 1));
    g.clearGroups();
    const ip = idleParams(gm);
    const gait = walkParams(gm), fp = flightParams(gm);
    const walk = new DragonWalk(body.rig, gait);
    const flight = new DragonFlight(walk, body.rig, fp);
    const bones = new Float32Array(walk.boneCount * 16);
    for (let i = 0; i < walk.boneCount; i++) bones[16 * i] = bones[16 * i + 5] = bones[16 * i + 10] = bones[16 * i + 15] = 1;
    const material = withBones(withIdle(withRough(wrap(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))), ip), bones);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'wild-dragon.mesh';
    // Culled by the rest mesh's sphere grown by as far as the legs and wings reach.
    g.computeBoundingSphere();
    g.boundingSphere!.radius += Math.max(0.6, flight.maxMove + 0.3);
    mesh.customDepthMaterial = withBones(withIdle(new THREE.MeshDepthMaterial(), ip), bones);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Centre the torso (hip to shoulder) on the holder: the sim's position is the torso's.
    const v = body.graph.v;
    mesh.position.x = -(v[body.idx.hip]![0] + v[body.idx.shoulder]![0]) / 2;
    return new WildDragonView(mesh, bones, walk, flight, gait, fp, genome.gid, built.roundTripMs, scale);
  }

  /**
   * Pose and place the dragon for this frame. (x, z) and `heading` are the sim's, interpolated;
   * `ground` is the deck's height there; `look` is the keeper's bearing off the snout (radians,
   * + to the dragon's left); for a flee, `fleeT` is seconds into a flight of `fleeDur`, with
   * `takeoff` and `land` seconds on the spot and an arc `peak` high. Allocation-free.
   */
  update(
    x: number, z: number, ground: number, heading: number, state: string, look: number,
    fleeT: number, fleeDur: number, takeoff: number, land: number, peak: number, dt: number,
  ): void {
    const flee = state === 'flee';
    let moving = false;
    if (!Number.isNaN(this.lastX) && dt > 0) {
      const dx = x - this.lastX, dz = z - this.lastZ;
      const moved = Math.sqrt(dx * dx + dz * dz);
      const turned = Math.abs(wrap(heading - this.lastH));
      if (!flee) {
        const step = moved + TURN_STEP * turned;
        this.gaitT += step / (this.scale * this.gait.speed);
        moving = step / dt > MOVING;
      }
    }
    this.walkL = moving ? Math.min(1, this.walkL + dt / WALK_RAMP_S) : Math.max(0, this.walkL - dt / WALK_RAMP_S);
    this.walkW = smooth(this.walkL);
    const fp = this.fleeNow;
    if (flee) fleePose(fleeT, fleeDur, takeoff, land, peak, fp);
    else { fp.flap = 0; fp.glide = 0; fp.altitude = 0; }
    this.flight.set(fleeT, fp.flap, fp.glide);
    this.attitude.setTargets(state, look);
    this.attitude.update(dt);
    this.walk.pose(this.walkW > 0 ? this.gaitT : null, this.walkW);
    const bones = this.walk.bones, out = this.bones;
    for (let i = 0; i < bones.length; i++) bones[i]!.matrixWorld.toArray(out, 16 * i);
    this.holder.position.set(x, ground + fp.altitude, z);
    this.holder.rotation.y = -heading;
    this.lastX = x;
    this.lastZ = z;
    this.lastH = heading;
  }

  /** Forget the last frame's place (a load, or a jump), so the next frame does not count it as a step. */
  resetTrack(): void {
    this.lastX = Number.NaN;
  }
}
