import * as THREE from 'three';

/**
 * Wind on instanced and batched foliage: a vertex-shader-only patch for stock three
 * materials, one set of shared uniforms, and a pure TypeScript mirror of the sway so the
 * maths can be tested without a GPU (`tests/wind.test.ts`).
 *
 * The model, in the plant's own (geometry) units:
 *
 *   h      = clamp(heightAboveBase / kindHeight, 0, 1)    0 at the root collar, 1 at the top
 *   bend   = flex * (kindHeight / WIND.height) * h * h    stiff base, loose top
 *   phase  = phaseX * instanceX + phaseZ * instanceZ      from the instance's own position
 *   a      = time * freq + phase
 *   along  = 0.8 * (0.74 * sin(a) + 0.26 * sin(2.3 a + 1.1))
 *   across = 0.2 * sin(1.7 a + 0.6)
 *   offset = amplitude * bend * (along, across)
 *
 * `bend` is baked per vertex into a `windBend` attribute when a mesh is loaded
 * (`bakeWindBend`), because one batched draw (M5f) carries every plant kind at once — a
 * 10 m conifer, a 1 m grass clump, a rock — and a single height uniform cannot serve them
 * all. `kindHeight / WIND.height` keeps the sway proportional to the plant: a grass clump
 * bends as far, relative to its own height, as a tree does. `flex` is the per-kind
 * stiffness — 0 for a rock or a moss carpet, which then never move. For the M5a broadleaf
 * (`kindHeight` = `WIND.height`, `flex` 1) this is exactly the M5a model, `bend = h * h`.
 *
 * `|along| <= 0.8` and `|across| <= 0.2`, so `|offset| <= amplitude * bend * sqrt(0.68)`
 * at every height, time and position: the bound is structural, not tuned.
 *
 * In the shader the offset is then scaled by the instance's own scale (so a small tree
 * sways proportionally less, in world units, than a big one) and laid along the world wind
 * direction — `along` downwind, `across` perpendicular to it — which is turned into the
 * mesh's parent space through `modelMatrix`, so trees on the rotating hero island lean the
 * same way as trees on a companion. The instance transform is `batchingMatrix` on a
 * `BatchedMesh` and `instanceMatrix` on an `InstancedMesh`; its translation's xz is the
 * phase position, which the companion-island bob never touches (it writes only the y
 * translation), so a bobbing tree keeps its phase.
 *
 * **The GLSL in `WIND_GLSL` and `windOffset` below are the same function. Change both
 * together**; the test pins the TS one, and the smoke run's wind-a/wind-b shots pin the
 * GLSL one.
 *
 * Nothing here allocates per frame: `setWindTime` writes one number into a uniform object
 * that every patched program shares.
 */

/** The tunables, also the defaults the mirror is tested with. */
export interface WindParams {
  /** Peak displacement at the top of the tree, in geometry units, before instance scale. */
  amplitude: number;
  /** Reference plant height, geometry units: the M5a broadleaf. A kind of this height and
   *  flex 1 bends by exactly `h * h`; others scale by `kindHeight / height`. */
  height: number;
  /** Angular frequency of the main sway, radians per second. */
  freq: number;
  /** Phase, in radians, per unit of instance x and of instance z. */
  phaseX: number;
  phaseZ: number;
}

export const WIND: Readonly<WindParams> = Object.freeze({
  amplitude: 0.3,
  height: 7.4,
  freq: 1.7,
  phaseX: 0.8,
  phaseZ: 0.55,
});

/**
 * Shared by every program `withWind` patches: setting a value here moves every tree. The
 * objects are created once and handed to three by reference, so per-frame updates are a
 * plain number write.
 */
export const WIND_UNIFORMS = {
  uWindTime: { value: 0 },
  uWindAmp: { value: WIND.amplitude },
  uWindFreq: { value: WIND.freq },
  uWindPhase: { value: new THREE.Vector2(WIND.phaseX, WIND.phaseZ) },
  /** World-space wind heading on the ground plane (x, z). Normalised in the shader. */
  uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
};

/** Once per frame. Allocation-free. */
export function setWindTime(seconds: number): void {
  WIND_UNIFORMS.uWindTime.value = seconds;
}

/** Result of `windSway` / `windOffset`, in geometry units: downwind and crosswind. */
export interface WindOffset { along: number; across: number }

/**
 * The per-vertex bend weight `bakeWindBend` writes into the `windBend` attribute.
 * `heightAboveBase` and `kindHeight` in the plant's geometry units; `flex` its stiffness
 * (0 = never moves). Never negative.
 */
export function windBend(
  heightAboveBase: number, kindHeight: number, flex = 1, reference = WIND.height,
): number {
  if (!(kindHeight > 0) || !(flex > 0)) return 0;
  const h = Math.min(1, Math.max(0, heightAboveBase / kindHeight));
  return flex * (kindHeight / reference) * h * h;
}

/**
 * The TS mirror of the GLSL below, from a baked bend weight. `instanceX`, `instanceZ` are
 * the instance translation as the shader reads it (`batchingMatrix[3]` /
 * `instanceMatrix[3]`). Pass `out` to avoid allocating.
 */
export function windOffset(
  bend: number, instanceX: number, instanceZ: number, timeSec: number,
  params: Readonly<WindParams> = WIND, out: WindOffset = { along: 0, across: 0 },
): WindOffset {
  const phase = params.phaseX * instanceX + params.phaseZ * instanceZ;
  const a = timeSec * params.freq + phase;
  const along = 0.8 * (0.74 * Math.sin(a) + 0.26 * Math.sin(2.3 * a + 1.1));
  const across = 0.2 * Math.sin(1.7 * a + 0.6);
  out.along = params.amplitude * bend * along;
  out.across = params.amplitude * bend * across;
  return out;
}

/**
 * The sway of a reference-height, flex-1 plant (the M5a broadleaf) at `heightAboveBase`:
 * `windOffset(windBend(heightAboveBase, params.height), ...)`.
 */
export function windSway(
  heightAboveBase: number, instanceX: number, instanceZ: number, timeSec: number,
  params: Readonly<WindParams> = WIND, out: WindOffset = { along: 0, across: 0 },
): WindOffset {
  return windOffset(
    windBend(heightAboveBase, params.height, 1, params.height), instanceX, instanceZ, timeSec,
    params, out);
}

/**
 * Writes the `windBend` attribute onto `geometry` (y-up, base at y = 0), one float per
 * vertex, from `windBend`. Setup-time only. Returns the geometry for chaining.
 */
export function bakeWindBend(
  geometry: THREE.BufferGeometry, kindHeight: number, flex: number,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('bakeWindBend: geometry has no position attribute');
  const bend = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) bend[i] = windBend(position.getY(i), kindHeight, flex);
  geometry.setAttribute('windBend', new THREE.BufferAttribute(bend, 1));
  return geometry;
}

/** Declarations, injected after `#include <common>`. */
const WIND_PARS = /* glsl */ `
uniform float uWindTime;
uniform float uWindAmp;
uniform float uWindFreq;
uniform vec2 uWindPhase;
uniform vec2 uWindDir;
attribute float windBend;
`;

/**
 * The sway, in the mesh's parent space, added after the instance transform and before
 * the view transform. Mirror: `windOffset` above.
 */
const WIND_GLSL = /* glsl */ `
	{
		#if defined( USE_BATCHING )
			vec2 windBase = batchingMatrix[ 3 ].xz;
			float windScale = length( batchingMatrix[ 1 ].xyz );
		#elif defined( USE_INSTANCING )
			vec2 windBase = instanceMatrix[ 3 ].xz;
			float windScale = length( instanceMatrix[ 1 ].xyz );
		#else
			vec2 windBase = vec2( 0.0 );
			float windScale = 1.0;
		#endif
		float windA = uWindTime * uWindFreq + dot( uWindPhase, windBase );
		float windAlong = 0.8 * ( 0.74 * sin( windA ) + 0.26 * sin( 2.3 * windA + 1.1 ) );
		float windAcross = 0.2 * sin( 1.7 * windA + 0.6 );
		// World wind heading into parent space: (v * M) is transpose(M) * v, the inverse
		// rotation for the rigid parents used here (the hero island spins about y).
		vec3 windDir3 = ( vec4( uWindDir.x, 0.0, uWindDir.y, 0.0 ) * modelMatrix ).xyz;
		vec2 windDir = normalize( windDir3.xz );
		// windBend is the baked per-vertex weight (bakeWindBend); a mesh without the
		// attribute reads WebGL's default 0 and stands still.
		vec2 windOff = uWindAmp * windScale * windBend
			* ( windDir * windAlong + vec2( -windDir.y, windDir.x ) * windAcross );
		mvPosition.xz += windOff;
	}
`;

/** The line of three's `project_vertex` chunk the sway goes in front of. */
const PROJECT_ANCHOR = 'mvPosition = modelViewMatrix * mvPosition;';

/**
 * Patches `material` so instanced or batched geometry carrying a `windBend` attribute
 * (`bakeWindBend`) sways in the wind. Vertex shader only.
 *
 * Composes with any `onBeforeCompile` already on the material (for example the rim patch
 * in `src/main.ts`): the earlier patch runs first, then this one. The program cache key
 * composes the same way, so a wind-patched material can never share a program with an
 * unpatched one. Apply other patches *before* this one if they do not compose.
 */
export function withWind<T extends THREE.Material>(material: T): T {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  const chunk = THREE.ShaderChunk.project_vertex;
  if (!chunk.includes(PROJECT_ANCHOR)) {
    // A three upgrade moved the line this hangs off. Fail at setup, loudly, rather than
    // ship trees that silently stopped moving.
    throw new Error('withWind: three\'s project_vertex chunk no longer contains the anchor line');
  }
  const patchedProject = chunk.replace(PROJECT_ANCHOR, `${WIND_GLSL}\n${PROJECT_ANCHOR}`);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms['uWindTime'] = WIND_UNIFORMS.uWindTime;
    shader.uniforms['uWindAmp'] = WIND_UNIFORMS.uWindAmp;
    shader.uniforms['uWindFreq'] = WIND_UNIFORMS.uWindFreq;
    shader.uniforms['uWindPhase'] = WIND_UNIFORMS.uWindPhase;
    shader.uniforms['uWindDir'] = WIND_UNIFORMS.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_PARS}`)
      .replace('#include <project_vertex>', patchedProject);
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-wind-v2`;
  material.needsUpdate = true;
  return material;
}
