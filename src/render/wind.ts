import * as THREE from 'three';

/**
 * Wind on instanced foliage: a vertex-shader-only patch for stock three materials, one set
 * of shared uniforms, and a pure TypeScript mirror of the sway so the maths can be tested
 * without a GPU (`tests/wind.test.ts`).
 *
 * The model, in the tree's own (geometry) units:
 *
 *   h      = clamp(heightAboveBase / height, 0, 1)        0 at the root collar, 1 at the top
 *   bend   = h * h                                        stiff trunk, loose canopy
 *   phase  = phaseX * instanceX + phaseZ * instanceZ      from the instance's own position
 *   a      = time * freq + phase
 *   along  = 0.8 * (0.74 * sin(a) + 0.26 * sin(2.3 a + 1.1))
 *   across = 0.2 * sin(1.7 a + 0.6)
 *   offset = amplitude * bend * (along, across)
 *
 * `|along| <= 0.8` and `|across| <= 0.2`, so `|offset| <= amplitude * sqrt(0.68) <
 * amplitude` at every height, time and position: the bound is structural, not tuned.
 *
 * In the shader the offset is then scaled by the instance's own scale (so a small tree
 * sways proportionally less, in world units, than a big one) and laid along the world wind
 * direction — `along` downwind, `across` perpendicular to it — which is turned into the
 * mesh's parent space through `modelMatrix`, so trees on the rotating hero island lean the
 * same way as trees on a companion. The instance position used for the phase is
 * `instanceMatrix[3].xz`, which the companion-island bob never touches (it writes only the
 * y translation), so a bobbing tree keeps its phase.
 *
 * **The GLSL in `WIND_GLSL` and `windSway` below are the same function. Change both
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
  /** Geometry height at which the bend reaches 1. Set from the loaded mesh's bounding box. */
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
  uWindHeight: { value: WIND.height },
  uWindFreq: { value: WIND.freq },
  uWindPhase: { value: new THREE.Vector2(WIND.phaseX, WIND.phaseZ) },
  /** World-space wind heading on the ground plane (x, z). Normalised in the shader. */
  uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
};

/** Once per frame. Allocation-free. */
export function setWindTime(seconds: number): void {
  WIND_UNIFORMS.uWindTime.value = seconds;
}

/** Result of `windSway`, in geometry units: downwind and crosswind. */
export interface WindOffset { along: number; across: number }

/**
 * The TS mirror of the GLSL below. `heightAboveBase` in geometry units; `instanceX`,
 * `instanceZ` are the instance translation as the shader reads it (`instanceMatrix[3]`).
 * Pass `out` to avoid allocating.
 */
export function windSway(
  heightAboveBase: number, instanceX: number, instanceZ: number, timeSec: number,
  params: Readonly<WindParams> = WIND, out: WindOffset = { along: 0, across: 0 },
): WindOffset {
  const h = Math.min(1, Math.max(0, heightAboveBase / params.height));
  const bend = h * h;
  const phase = params.phaseX * instanceX + params.phaseZ * instanceZ;
  const a = timeSec * params.freq + phase;
  const along = 0.8 * (0.74 * Math.sin(a) + 0.26 * Math.sin(2.3 * a + 1.1));
  const across = 0.2 * Math.sin(1.7 * a + 0.6);
  out.along = params.amplitude * bend * along;
  out.across = params.amplitude * bend * across;
  return out;
}

/** Declarations, injected after `#include <common>`. */
const WIND_PARS = /* glsl */ `
uniform float uWindTime;
uniform float uWindAmp;
uniform float uWindHeight;
uniform float uWindFreq;
uniform vec2 uWindPhase;
uniform vec2 uWindDir;
`;

/**
 * The sway, in the mesh's parent space, added after the instance transform and before
 * the view transform. Mirror: `windSway` above.
 */
const WIND_GLSL = /* glsl */ `
	{
		#ifdef USE_INSTANCING
			vec2 windBase = instanceMatrix[ 3 ].xz;
			float windScale = length( instanceMatrix[ 1 ].xyz );
		#else
			vec2 windBase = vec2( 0.0 );
			float windScale = 1.0;
		#endif
		float windH = clamp( transformed.y / uWindHeight, 0.0, 1.0 );
		float windBend = windH * windH;
		float windA = uWindTime * uWindFreq + dot( uWindPhase, windBase );
		float windAlong = 0.8 * ( 0.74 * sin( windA ) + 0.26 * sin( 2.3 * windA + 1.1 ) );
		float windAcross = 0.2 * sin( 1.7 * windA + 0.6 );
		// World wind heading into parent space: (v * M) is transpose(M) * v, the inverse
		// rotation for the rigid parents used here (the hero island spins about y).
		vec3 windDir3 = ( vec4( uWindDir.x, 0.0, uWindDir.y, 0.0 ) * modelMatrix ).xyz;
		vec2 windDir = normalize( windDir3.xz );
		vec2 windOff = uWindAmp * windScale * windBend
			* ( windDir * windAlong + vec2( -windDir.y, windDir.x ) * windAcross );
		mvPosition.xz += windOff;
	}
`;

/** The line of three's `project_vertex` chunk the sway goes in front of. */
const PROJECT_ANCHOR = 'mvPosition = modelViewMatrix * mvPosition;';

/**
 * Patches `material` so instanced geometry sways in the wind. Vertex shader only.
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
    shader.uniforms['uWindHeight'] = WIND_UNIFORMS.uWindHeight;
    shader.uniforms['uWindFreq'] = WIND_UNIFORMS.uWindFreq;
    shader.uniforms['uWindPhase'] = WIND_UNIFORMS.uWindPhase;
    shader.uniforms['uWindDir'] = WIND_UNIFORMS.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_PARS}`)
      .replace('#include <project_vertex>', patchedProject);
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-wind-v1`;
  material.needsUpdate = true;
  return material;
}
