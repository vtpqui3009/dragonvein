import * as THREE from 'three';
import type { IdleParams } from '../assets/dragon/idle';

/**
 * The dragon's idle (M7a) on the GPU: breathing, blinking and a weight shift, as a
 * vertex-only patch on stock three materials. The same pattern as ./wind.ts: the mesher
 * bakes per-vertex weights (src/assets/dragon/idle.ts `bakeIdle`), one shared time uniform
 * moves every dragon, and a pure TypeScript mirror of the GLSL (`idleOffset`) is what
 * tests/dragon-idle.test.ts holds to its bounds.
 *
 * Per vertex, in the mesh's own frame (x forward, y up), with `p` the dragon's
 * `IdleParams` and t the shared time in seconds:
 *
 *   breath = 0.5 − 0.5 cos(2π (t / breathPeriod + breathPhase))          0 exhaled, 1 full
 *   u      = fract(t / blinkInterval + blinkPhase) · blinkInterval        seconds into a cycle
 *   c      = sin(π · clamp(u / blinkDuration, 0, 1))
 *   shut   = c² (3 − 2c)                                    0 open, 1 at mid-blink, eased
 *   a      = 2π (t / swayPeriod + swayPhase)
 *   shift  = swayAmp · (0.35 sin(2a + 0.7), 0, sin a)       side to side, a little fore-aft
 *   offset = mix · (breathDepth · breath · B.xyz + shut · K + B.w · shift)
 *
 * where `B` is the `idleBreathSway` attribute (unit breath displacement, sway weight) and
 * `K` the `idleBlink` attribute (the displacement that shuts an eye). Every wave is in
 * [0, 1] or [−1, 1], so |offset| <= breathDepth·|B.xyz| + |K| + swayAmp·sqrt(1 + 0.35²)·B.w:
 * the bound is structural, not tuned.
 *
 * **The GLSL in `IDLE_GLSL` and `idleOffset` below are the same function. Change both
 * together.** The test pins the TS one; tools/dragon-sheet.mjs's idle-a / idle-b shots pin
 * the GLSL one.
 *
 * Per-dragon params are per-material uniforms: give each dragon its own material (a
 * clone), which compiles to the same program, so no draw and no program is added.
 * Nothing allocates per frame: `setIdleTime` writes one number.
 */

/** Shared by every program `withIdle` patches. */
export const IDLE_UNIFORMS = {
  uIdleTime: { value: 0 },
  /** 1 moves every dragon; 0 holds them all at the rest pose (the mesh as built). */
  uIdleMix: { value: 1 },
};

/** Once per frame. Allocation-free. */
export function setIdleTime(seconds: number): void {
  IDLE_UNIFORMS.uIdleTime.value = seconds;
}

/** 1 to animate, 0 for the rest pose. */
export function setIdleMix(mix: number): void {
  IDLE_UNIFORMS.uIdleMix.value = mix;
}

/** The three waves at time `t`, each as the GLSL computes it. */
export interface IdleWaves { breath: number; shut: number; shiftX: number; shiftZ: number }

export function idleWaves(p: Readonly<IdleParams>, t: number, out: IdleWaves = { breath: 0, shut: 0, shiftX: 0, shiftZ: 0 }): IdleWaves {
  out.breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / p.breathPeriod + p.breathPhase));
  const cyc = t / p.blinkInterval + p.blinkPhase;
  const u = (cyc - Math.floor(cyc)) * p.blinkInterval;
  const c = Math.sin(Math.PI * Math.min(1, Math.max(0, u / p.blinkDuration)));
  out.shut = c * c * (3 - 2 * c);
  const a = 2 * Math.PI * (t / p.swayPeriod + p.swayPhase);
  out.shiftX = p.swayAmp * 0.35 * Math.sin(2 * a + 0.7);
  out.shiftZ = p.swayAmp * Math.sin(a);
  return out;
}

const scratch: IdleWaves = { breath: 0, shut: 0, shiftX: 0, shiftZ: 0 };

/**
 * The TS mirror of the GLSL: the offset of one vertex with baked `breathSway` (4 numbers)
 * and `blink` (3) at time `t`. Pass `out` to avoid allocating.
 */
export function idleOffset(
  breathSway: ArrayLike<number>, blink: ArrayLike<number>, p: Readonly<IdleParams>, t: number,
  mix = 1, out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const w = idleWaves(p, t, scratch);
  const k = p.breathDepth * w.breath;
  const s = breathSway[3]!;
  out[0] = mix * (k * breathSway[0]! + w.shut * blink[0]! + s * w.shiftX);
  out[1] = mix * (k * breathSway[1]! + w.shut * blink[1]!);
  out[2] = mix * (k * breathSway[2]! + w.shut * blink[2]! + s * w.shiftZ);
  return out;
}

/**
 * The time of the middle of a blink: the first at or after `from` seconds. For a tool that
 * wants a frame with the eyes shut.
 */
export function blinkMidTime(p: Readonly<IdleParams>, from = 0): number {
  const lead = p.blinkDuration / (2 * p.blinkInterval) - p.blinkPhase; // cycles at t = 0
  const k = Math.ceil(from / p.blinkInterval - lead - 1e-9);
  return (k + lead) * p.blinkInterval;
}

/** Declarations, injected after `#include <common>`. */
const IDLE_PARS = /* glsl */ `
uniform float uIdleTime;
uniform float uIdleMix;
uniform vec4 uIdleBreathBlink;
uniform vec2 uIdleSway;
uniform vec3 uIdlePhase;
attribute vec4 idleBreathSway;
attribute vec3 idleBlink;
`;

/**
 * The offset, added to `transformed` in the mesh's own frame, before skinning, instancing
 * and the model transform. Mirror: `idleOffset` above.
 */
const IDLE_GLSL = /* glsl */ `
	{
		float idleBreath = 0.5 - 0.5 * cos( 6.283185307179586 * ( uIdleTime / uIdleBreathBlink.x + uIdlePhase.x ) );
		float idleU = fract( uIdleTime / uIdleBreathBlink.z + uIdlePhase.y ) * uIdleBreathBlink.z;
		float idleC = sin( 3.141592653589793 * clamp( idleU / uIdleBreathBlink.w, 0.0, 1.0 ) );
		float idleShut = idleC * idleC * ( 3.0 - 2.0 * idleC );
		float idleA = 6.283185307179586 * ( uIdleTime / uIdleSway.x + uIdlePhase.z );
		vec2 idleShift = uIdleSway.y * vec2( 0.35 * sin( 2.0 * idleA + 0.7 ), sin( idleA ) );
		// A mesh without the attributes reads WebGL's defaults: idleBreathSway (0, 0, 0, 1)
		// would sway rigidly, so withIdle belongs only on dragon meshes.
		transformed += uIdleMix * ( uIdleBreathBlink.y * idleBreath * idleBreathSway.xyz
			+ idleShut * idleBlink
			+ idleBreathSway.w * vec3( idleShift.x, 0.0, idleShift.y ) );
	}
`;

const BEGIN_ANCHOR = '#include <begin_vertex>';

/** A material `withIdle` patched: its per-dragon uniforms, to retune without recompiling. */
export interface IdleUniforms {
  uIdleBreathBlink: { value: THREE.Vector4 };
  uIdleSway: { value: THREE.Vector2 };
  uIdlePhase: { value: THREE.Vector3 };
}

/** Write `p` into a material's idle uniforms. Setup-time; allocation-free. */
export function setIdleParams(u: IdleUniforms, p: Readonly<IdleParams>): void {
  u.uIdleBreathBlink.value.set(p.breathPeriod, p.breathDepth, p.blinkInterval, p.blinkDuration);
  u.uIdleSway.value.set(p.swayPeriod, p.swayAmp);
  u.uIdlePhase.value.set(p.breathPhase, p.blinkPhase, p.swayPhase);
}

/**
 * Patches `material` so a dragon geometry (src/assets/dragon/builder.ts `toGeometry`,
 * which carries `idleBreathSway` and `idleBlink`) breathes, blinks and shifts its weight
 * with the dragon's own `params`. Vertex shader only; works on a depth material too, so a
 * dragon's shadow moves with it.
 *
 * Composes with an `onBeforeCompile` already on the material (the rim patch in
 * `src/main.ts`, the wind patch in ./wind.ts): the earlier patch runs first, then this
 * one, and the program cache key composes the same way.
 */
export function withIdle<T extends THREE.Material>(material: T, params: Readonly<IdleParams>): T & { idleUniforms: IdleUniforms } {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  const uniforms: IdleUniforms = {
    uIdleBreathBlink: { value: new THREE.Vector4() },
    uIdleSway: { value: new THREE.Vector2() },
    uIdlePhase: { value: new THREE.Vector3() },
  };
  setIdleParams(uniforms, params);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    if (!shader.vertexShader.includes(BEGIN_ANCHOR)) {
      // A three upgrade, or an earlier patch, removed the line this hangs off. Fail loudly
      // rather than ship dragons that silently stopped breathing.
      throw new Error('withIdle: the vertex shader no longer contains #include <begin_vertex>');
    }
    shader.uniforms['uIdleTime'] = IDLE_UNIFORMS.uIdleTime;
    shader.uniforms['uIdleMix'] = IDLE_UNIFORMS.uIdleMix;
    shader.uniforms['uIdleBreathBlink'] = uniforms.uIdleBreathBlink;
    shader.uniforms['uIdleSway'] = uniforms.uIdleSway;
    shader.uniforms['uIdlePhase'] = uniforms.uIdlePhase;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${IDLE_PARS}`)
      .replace(BEGIN_ANCHOR, `${BEGIN_ANCHOR}\n${IDLE_GLSL}`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|dragonvein-idle-v1`;
  material.needsUpdate = true;
  return Object.assign(material, { idleUniforms: uniforms });
}
