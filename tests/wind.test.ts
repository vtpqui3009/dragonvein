/**
 * M5a criterion 1: the wind sway, proven on its TS mirror (`windSway` / `windOffset`),
 * which is the same function as the GLSL in `src/render/wind.ts`. The GLSL side is checked
 * by the smoke run's `11-wind-a` / `11-wind-b` pixel difference.
 *
 * M5f: the bend is baked per vertex (`bakeWindBend`) so one batched draw can carry plants
 * of every height and rocks that never move; the per-kind cases are pinned below.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WIND, WIND_UNIFORMS, bakeWindBend, setWindTime, windBend, windOffset, windSway, withWind,
} from '../src/render/wind';

const mag = (o: { along: number; across: number }): number => Math.hypot(o.along, o.across);
const TIMES = Array.from({ length: 97 }, (_, i) => i * 0.137);
const SPOTS: [number, number][] = [[0, 0], [1.3, -2.1], [-56, -13], [74, -102], [0.25, 4.8]];

describe('windSway (TS mirror of the wind vertex shader)', () => {
  it('is exactly 0 at the base, and below it, at every time and position', () => {
    for (const [x, z] of SPOTS) {
      for (const t of TIMES) {
        expect(mag(windSway(0, x, z, t))).toBe(0);
        expect(mag(windSway(-0.18, x, z, t))).toBe(0);   // the roots under the collar
      }
    }
  });

  it('grows with height: monotone non-decreasing up the tree, strictly where it sways', () => {
    for (const [x, z] of SPOTS) {
      for (const t of TIMES) {
        let prev = 0;
        for (let k = 1; k <= 20; k++) {
          const m = mag(windSway((k / 20) * WIND.height, x, z, t));
          expect(m).toBeGreaterThanOrEqual(prev);
          prev = m;
        }
      }
    }
    // And it is not trivially flat: the top moves more than the middle, which moves more
    // than the lower trunk (quadratic bend: 1 : 1/4 : 1/16).
    const t = 0.4;
    const top = mag(windSway(WIND.height, 1, 2, t));
    const mid = mag(windSway(WIND.height / 2, 1, 2, t));
    const low = mag(windSway(WIND.height / 4, 1, 2, t));
    expect(top).toBeGreaterThan(0);
    expect(mid / top).toBeCloseTo(0.25, 10);
    expect(low / top).toBeCloseTo(0.0625, 10);
  });

  it('is bounded by the amplitude at every height, time and position', () => {
    let worst = 0;
    for (const [x, z] of SPOTS) {
      for (let i = 0; i < 4000; i++) {
        const t = i * 0.0173;
        for (const h of [0.5, WIND.height * 0.8, WIND.height, WIND.height * 3]) {
          worst = Math.max(worst, mag(windSway(h, x, z, t)));
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(WIND.amplitude);
    // ...and actually uses a good part of it, so the bound is not met by doing nothing.
    expect(worst).toBeGreaterThan(WIND.amplitude * 0.6);
  });

  it('puts two instances at different positions out of phase', () => {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 400; i++) {
      const t = i * 0.05;
      a.push(windSway(WIND.height, 0, 0, t).along);
      b.push(windSway(WIND.height, 1.3, -0.4, t).along);
    }
    // Same time, different offsets...
    const differing = a.filter((v, i) => Math.abs(v - (b[i] as number)) > 1e-3).length;
    expect(differing).toBeGreaterThan(a.length * 0.9);
    // ...and not merely scaled: the two series are far from perfectly correlated.
    const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
    const ma = mean(a), mb = mean(b);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) {
      const da = (a[i] as number) - ma, db = (b[i] as number) - mb;
      sab += da * db; saa += da * da; sbb += db * db;
    }
    expect(Math.abs(sab / Math.sqrt(saa * sbb))).toBeLessThan(0.9);
    // Same position, same offset: the phase comes from the position and nothing else.
    expect(windSway(5, 1.3, -0.4, 2.2)).toEqual(windSway(5, 1.3, -0.4, 2.2));
  });

  it('writes into a caller-supplied result instead of allocating', () => {
    const out = { along: 0, across: 0 };
    expect(windSway(WIND.height, 2, 3, 1.1, WIND, out)).toBe(out);
  });
});

describe('windBend and bakeWindBend (the per-kind weight, M5f)', () => {
  it('is the M5a model for the reference tree: h * h, 0 at the base, 1 at the top', () => {
    for (let k = 0; k <= 20; k++) {
      const y = (k / 20) * WIND.height;
      expect(windBend(y, WIND.height)).toBeCloseTo((y / WIND.height) ** 2, 12);
    }
    expect(windBend(-0.2, WIND.height)).toBe(0);
    expect(windBend(WIND.height * 3, WIND.height)).toBe(1);
  });

  it('never moves a rigid kind: flex 0 is 0 at every height', () => {
    for (const y of [0, 0.3, 1, 5, 50]) expect(windBend(y, 1.4, 0)).toBe(0);
    expect(windBend(1, 0, 1)).toBe(0);   // a degenerate height cannot divide by zero
  });

  it('sways in proportion to the plant: same relative bend at the same relative height', () => {
    // A 1.06 m grass clump at flex 1 moves, relative to its own height, exactly as far as
    // the 7.4 m tree does at the same fraction of its height.
    const grass = 1.06;
    for (const f of [0.25, 0.5, 1]) {
      expect(windBend(f * grass, grass) / grass).toBeCloseTo(windBend(f * WIND.height, WIND.height) / WIND.height, 12);
    }
    // ...and flex scales it linearly.
    expect(windBend(0.8, grass, 2.2)).toBeCloseTo(2.2 * windBend(0.8, grass, 1), 12);
  });

  it('windSway is windOffset of the reference bend, so the M5a numbers did not move', () => {
    for (const [x, z] of SPOTS) {
      for (const t of TIMES) {
        const a = windSway(WIND.height * 0.7, x, z, t);
        const b = windOffset(0.49, x, z, t);
        expect(a.along).toBeCloseTo(b.along, 12);
        expect(a.across).toBeCloseTo(b.across, 12);
      }
    }
  });

  it('bakes one weight per vertex, from the vertex height', () => {
    const geometry = new THREE.BufferGeometry();
    const ys = [0, 0.25, 0.5, 1.0, 1.38, -0.04];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(ys.flatMap((y) => [0.1, y, -0.2]), 3));
    bakeWindBend(geometry, 1.38, 1.2);
    const bend = geometry.getAttribute('windBend');
    expect(bend.itemSize).toBe(1);
    expect(bend.count).toBe(ys.length);
    ys.forEach((y, i) => expect(bend.getX(i)).toBeCloseTo(windBend(y, 1.38, 1.2), 6));
    bakeWindBend(geometry, 1.38, 0);
    ys.forEach((_, i) => expect(geometry.getAttribute('windBend').getX(i)).toBe(0));
  });
});

describe('withWind (the material patch)', () => {
  it('sets the shared time uniform in place', () => {
    const before = WIND_UNIFORMS.uWindTime;
    setWindTime(12.5);
    expect(WIND_UNIFORMS.uWindTime).toBe(before);
    expect(WIND_UNIFORMS.uWindTime.value).toBe(12.5);
    setWindTime(0);
  });

  it('patches the vertex shader only, and composes with an earlier onBeforeCompile', () => {
    const material = new THREE.MeshStandardMaterial();
    let earlierRan = 0;
    material.onBeforeCompile = (shader) => {
      earlierRan++;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n// rim');
    };
    material.customProgramCacheKey = () => 'rim-v4';
    withWind(material);

    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    const fragmentBefore = shader.fragmentShader;
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      undefined as unknown as THREE.WebGLRenderer);

    expect(earlierRan).toBe(1);
    expect(shader.fragmentShader).toBe(fragmentBefore.replace('#include <common>', '#include <common>\n// rim'));
    expect(shader.vertexShader).not.toContain('#include <project_vertex>');
    expect(shader.vertexShader).toContain('mvPosition.xz += windOff;');
    expect(shader.vertexShader).toContain('instanceMatrix[ 3 ].xz');
    // M5f: a BatchedMesh's instance transform is batchingMatrix, and the bend is baked.
    expect(shader.vertexShader).toContain('batchingMatrix[ 3 ].xz');
    expect(shader.vertexShader).toContain('attribute float windBend;');
    expect(shader.vertexShader).toContain('uWindAmp * windScale * windBend');
    // Shared by reference, so one write per frame reaches every program.
    expect(shader.uniforms['uWindTime']).toBe(WIND_UNIFORMS.uWindTime);
    expect(material.customProgramCacheKey()).toBe('rim-v4|dragonvein-wind-v2');
  });
});
