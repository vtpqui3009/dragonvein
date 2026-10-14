/**
 * M7a: the dragon's procedural idle (STATE.md run 29).
 *
 * Criterion 1, on `idleParams` (src/assets/dragon/idle.ts): monotonic in the genes it
 * names, bounded, deterministic, and different between two sheet dragons.
 * Criterion 2, on the baked weights and the TS mirror of the shader (`idleOffset`,
 * src/render/idle.ts): the feet stay planted, every offset stays inside its structural
 * bound, a blink shuts the eye toward its own centre, and the patch is vertex-only and
 * composes with an earlier one. The GLSL side is pinned by tools/dragon-sheet.mjs's
 * dragon-idle-a / -b shots.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GENES, breed, wild, Genome, type Element, type Phenotype } from '../src/core/genome';
import { buildDragonArrays } from '../src/assets/dragon/arrays';
import { buildDragon } from '../src/assets/dragon/builder';
import {
  BLINK_SQUASH, IDLE_BOUNDS, SWAY_FOOT, idleParams, idleParamsOf, type IdleParams,
} from '../src/assets/dragon/idle';
import {
  IDLE_UNIFORMS, blinkMidTime, idleOffset, idleWaves, setIdleTime, withIdle,
} from '../src/render/idle';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const gfx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as {
  genomes: { recipe: Recipe }[];
};
const fixed: Genome[] = [];
for (const { recipe: r } of gfx.genomes) {
  fixed.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(fixed[r.a]!, fixed[r.b]!, r.seed));
}
/** src/dragon-view.ts SHEET: A ember 1, B tide 2. */
const sheetA = wild(1, 'ember'), sheetB = wild(2, 'tide');

const len = (o: ArrayLike<number>) => Math.sqrt(o[0]! * o[0]! + o[1]! * o[1]! + o[2]! * o[2]!);
const KEYS = ['breathPeriod', 'breathDepth', 'blinkInterval', 'blinkDuration', 'swayAmp', 'swayPeriod'] as const;

/** `n` evenly spaced values across a gene's documented range. */
const across = (gene: keyof typeof GENES, n = 9): number[] => {
  const [lo, hi] = GENES[gene];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};
/** One idle field along a one-gene sweep, every other gene held at a base dragon's. */
const sweep = (base: Phenotype, gene: keyof typeof GENES, key: (typeof KEYS)[number]): number[] =>
  across(gene).map((v) => idleParamsOf({ ...base, [gene]: v }, 'a1b2c3d4e5')[key]);
const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
const decreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]!);

describe('idleParams (criterion 1: the genome drives the idle)', () => {
  const bases = [sheetA.phenotype, sheetB.phenotype, fixed[17]!.phenotype];

  it('heavier bodyMass breathes slower and deeper, blinks less often, sways slower and less', () => {
    for (const b of bases) {
      expect(increasing(sweep(b, 'bodyMass', 'breathPeriod'))).toBe(true);
      expect(increasing(sweep(b, 'bodyMass', 'breathDepth'))).toBe(true);
      expect(increasing(sweep(b, 'bodyMass', 'blinkInterval'))).toBe(true);
      expect(increasing(sweep(b, 'bodyMass', 'swayPeriod'))).toBe(true);
      expect(decreasing(sweep(b, 'bodyMass', 'swayAmp'))).toBe(true);
    }
  });

  it('chestDepth scales the chest swell, and nothing else', () => {
    for (const b of bases) {
      expect(increasing(sweep(b, 'chestDepth', 'breathDepth'))).toBe(true);
      for (const k of KEYS) if (k !== 'breathDepth') expect(new Set(sweep(b, 'chestDepth', k)).size, k).toBe(1);
    }
  });

  it('legLength sets the sway: longer legs shift further and slower', () => {
    for (const b of bases) {
      expect(increasing(sweep(b, 'legLength', 'swayAmp'))).toBe(true);
      expect(increasing(sweep(b, 'legLength', 'swayPeriod'))).toBe(true);
    }
  });

  it('headSize sets the blink length: a bigger eye takes longer to shut', () => {
    for (const b of bases) expect(increasing(sweep(b, 'headSize', 'blinkDuration'))).toBe(true);
  });

  it('is bounded, on the fixed genomes, many wild ones and every corner of the named genes', () => {
    const check = (p: IdleParams) => {
      for (const k of KEYS) {
        const [lo, hi] = IDLE_BOUNDS[k];
        expect(p[k], k).toBeGreaterThanOrEqual(lo);
        expect(p[k], k).toBeLessThanOrEqual(hi);
      }
      for (const k of ['breathPhase', 'blinkPhase', 'swayPhase'] as const) {
        expect(p[k], k).toBeGreaterThanOrEqual(0);
        expect(p[k], k).toBeLessThan(1);
      }
      // A blink is a short event inside its interval, never the whole of it.
      expect(p.blinkDuration).toBeLessThan(p.blinkInterval / 10);
    };
    for (const g of fixed) check(idleParams(g));
    for (let s = 1; s <= 200; s++) check(idleParams(wild(s)));
    const named = ['bodyMass', 'chestDepth', 'legLength', 'headSize'] as const;
    for (let mask = 0; mask < 16; mask++) {
      const p = { ...sheetA.phenotype };
      named.forEach((g, i) => { p[g] = (mask >> i) & 1 ? GENES[g][1] : GENES[g][0]; });
      check(idleParamsOf(p, sheetA.gid()));
    }
  });

  it('is deterministic: the same genome gives the same params, across a JSON round trip', () => {
    for (const g of fixed) {
      const a = idleParams(g), b = idleParams(g), c = idleParams(Genome.fromJSON(JSON.parse(JSON.stringify(g.toJSON()))));
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
    // And no wall clock or unseeded randomness in either half.
    for (const f of ['src/assets/dragon/idle.ts', 'src/render/idle.ts']) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|new Date\s*\(/);
    }
  });

  it('two sheet dragons idle differently', () => {
    const a = idleParams(sheetA), b = idleParams(sheetB);
    expect(KEYS.filter((k) => Math.abs(a[k] - b[k]) > 1e-6).length).toBeGreaterThanOrEqual(3);
    expect(a.breathPhase).not.toBe(b.breathPhase);
  });
});

describe('the baked weights and the shader mirror (criterion 2)', () => {
  const TIMES = Array.from({ length: 61 }, (_, i) => i * 0.173);
  const cases = [sheetA, sheetB, fixed[5]!, fixed[23]!];

  it('the feet stay planted: no vertex at or below the foot line ever moves', () => {
    for (const g of cases) {
      const a = buildDragonArrays(g);
      const p = idleParams(g);
      const out: [number, number, number] = [0, 0, 0];
      let feet = 0, worst = 0;
      for (let i = 0; i < a.position.length / 3; i++) {
        if (a.position[3 * i + 1]! > SWAY_FOOT) continue;
        feet++;
        const bs = a.idleBreathSway.subarray(4 * i, 4 * i + 4), bk = a.idleBlink.subarray(3 * i, 3 * i + 3);
        for (const t of TIMES) worst = Math.max(worst, len(idleOffset(bs, bk, p, t, 1, out)));
      }
      expect(worst).toBe(0);
      expect(feet).toBeGreaterThan(100); // the toes and feet really are down there
    }
  });

  it('every vertex offset stays inside its structural bound, and the body really moves', () => {
    for (const g of cases) {
      const a = buildDragonArrays(g);
      const p = idleParams(g);
      const out: [number, number, number] = [0, 0, 0];
      const swayMax = p.swayAmp * Math.hypot(1, 0.35);
      let moved = 0, worstBreath = 0, worstSway = 0, worstOver = -Infinity;
      for (let i = 0; i < a.position.length / 3; i++) {
        const bs = a.idleBreathSway.subarray(4 * i, 4 * i + 4), bk = a.idleBlink.subarray(3 * i, 3 * i + 3);
        const breathLen = len(bs);
        worstBreath = Math.max(worstBreath, breathLen);
        worstSway = Math.max(worstSway, Math.abs(bs[3]! - 0.5));
        const bound = p.breathDepth * breathLen + len(bk) + swayMax * bs[3]!;
        for (const t of TIMES) {
          const m = len(idleOffset(bs, bk, p, t, 1, out));
          worstOver = Math.max(worstOver, m - bound);
          if (m > 0.01) moved++;
        }
      }
      expect(worstBreath).toBeLessThanOrEqual(1 + 1e-6);   // the breath field is a unit field
      expect(worstSway).toBeLessThanOrEqual(0.5);          // the sway weight is in [0, 1]
      expect(worstOver).toBeLessThanOrEqual(1e-9);
      expect(moved).toBeGreaterThan(1000);
    }
  });

  it('the rest pose (mix 0) is the mesh as built', () => {
    const a = buildDragonArrays(sheetA);
    const p = idleParams(sheetA);
    const out: [number, number, number] = [9, 9, 9];
    for (let i = 0; i < a.position.length / 3; i += 37) {
      idleOffset(a.idleBreathSway.subarray(4 * i, 4 * i + 4), a.idleBlink.subarray(3 * i, 3 * i + 3), p, 1.7, 0, out);
      expect(len(out)).toBe(0);
    }
  });

  it('a blink shuts each eye toward its own centre, to a slit, and opens it again', () => {
    for (const g of cases) {
      const a = buildDragonArrays(g);
      const p = idleParams(g);
      const tMid = blinkMidTime(p, 2);
      expect(tMid).toBeGreaterThanOrEqual(2);
      expect(tMid).toBeLessThan(2 + p.blinkInterval);
      expect(idleWaves(p, tMid).shut).toBeCloseTo(1, 9);
      expect(idleWaves(p, tMid + p.blinkDuration).shut).toBeLessThan(1e-12); // open again after it
      expect(idleWaves(p, tMid - p.blinkDuration).shut).toBeLessThan(1e-12); // and open before it
      // Each eyeball: its vertical extent at mid-blink is 1 - BLINK_SQUASH of its open one,
      // about the same centre, and nothing on it moves sideways.
      let start = 0;
      a.parts.forEach((part, pi) => {
        const kind = a.kinds[pi];
        if (kind !== 'eye') return;
        const vs = new Set<number>();
        for (let t = part.start; t < part.start + part.count; t++) vs.add(a.index[t]!);
        let y0 = Infinity, y1 = -Infinity, s0 = Infinity, s1 = -Infinity;
        const out: [number, number, number] = [0, 0, 0];
        for (const v of vs) {
          const y = a.position[3 * v + 1]!;
          const bs = new Float32Array(4); // the blink alone
          idleOffset(bs, a.idleBlink.subarray(3 * v, 3 * v + 3), p, tMid, 1, out);
          expect(out[0]).toBe(0);
          expect(out[2]).toBe(0);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          s0 = Math.min(s0, y + out[1]); s1 = Math.max(s1, y + out[1]);
        }
        expect((s1 - s0) / (y1 - y0)).toBeCloseTo(1 - BLINK_SQUASH, 4);
        expect((s0 + s1) / 2).toBeCloseTo((y0 + y1) / 2, 4);
        start++;
      });
      expect(start).toBe(2);
    }
  });

  it('only the eyes and glints carry a blink', () => {
    const a = buildDragonArrays(sheetB);
    const blinking = new Set<number>();
    a.parts.forEach((part, pi) => {
      if (a.kinds[pi] !== 'eye' && a.kinds[pi] !== 'glint') return;
      for (let t = part.start; t < part.start + part.count; t++) blinking.add(a.index[t]!);
    });
    for (let v = 0; v < a.position.length / 3; v++) {
      if (blinking.has(v)) continue;
      expect(Math.hypot(a.idleBlink[3 * v]!, a.idleBlink[3 * v + 1]!, a.idleBlink[3 * v + 2]!)).toBe(0);
    }
  });

  it('breathing swells the rib cage, not the hips, the neck or the feet', () => {
    const a = buildDragonArrays(sheetA);
    const xs = a.graph.v.map((v) => v[0]);
    const hipX = a.graph.v[a.idx.hip]![0], shX = a.graph.v[a.idx.shoulder]![0];
    let chest = 0;
    for (let v = 0; v < a.position.length / 3; v++) {
      const x = a.position[3 * v]!;
      const m = Math.hypot(a.idleBreathSway[4 * v]!, a.idleBreathSway[4 * v + 1]!, a.idleBreathSway[4 * v + 2]!);
      if (x <= hipX || x >= shX + 0.1 * (shX - hipX)) expect(m, `x ${x}`).toBe(0);
      else if (m > 0.5) chest++;
    }
    expect(chest).toBeGreaterThan(100);
    expect(Math.max(...xs)).toBeGreaterThan(shX); // the neck and head are really ahead of it
  });

  it('the geometry carries both attributes', () => {
    const { geometry } = buildDragon(sheetA);
    expect(geometry.getAttribute('idleBreathSway').itemSize).toBe(4);
    expect(geometry.getAttribute('idleBlink').itemSize).toBe(3);
    expect(geometry.getAttribute('idleBlink').count).toBe(geometry.getAttribute('position').count);
  });
});

describe('withIdle (the material patch)', () => {
  it('sets the shared time uniform in place', () => {
    const before = IDLE_UNIFORMS.uIdleTime;
    setIdleTime(8.25);
    expect(IDLE_UNIFORMS.uIdleTime).toBe(before);
    expect(IDLE_UNIFORMS.uIdleTime.value).toBe(8.25);
    setIdleTime(0);
  });

  it('patches the vertex shader only, composes with an earlier patch, and keeps per-dragon params apart', () => {
    const material = new THREE.MeshStandardMaterial();
    let earlierRan = 0;
    material.onBeforeCompile = (shader) => {
      earlierRan++;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n// rim');
    };
    material.customProgramCacheKey = () => 'rim-v4';
    const pa = idleParams(sheetA), pb = idleParams(sheetB);
    const ma = withIdle(material, pa);
    const mb = withIdle(new THREE.MeshStandardMaterial(), pb);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    ma.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(earlierRan).toBe(1);
    expect(shader.fragmentShader).toContain('// rim');
    expect(shader.fragmentShader).not.toContain('idle');
    expect(shader.vertexShader).toContain('attribute vec4 idleBreathSway;');
    expect(shader.vertexShader).toContain('attribute vec3 idleBlink;');
    expect(shader.vertexShader.indexOf('transformed += uIdleMix')).toBeGreaterThan(shader.vertexShader.indexOf('#include <begin_vertex>'));
    expect(shader.uniforms['uIdleTime']).toBe(IDLE_UNIFORMS.uIdleTime);
    expect(ma.customProgramCacheKey()).toBe('rim-v4|dragonvein-idle-v1');
    // Two dragons: one program key, their own params.
    const mc = withIdle(new THREE.MeshStandardMaterial(), pa);
    expect(mb.customProgramCacheKey()).toBe(mc.customProgramCacheKey());
    expect(mb.customProgramCacheKey()).toMatch(/\|dragonvein-idle-v1$/);
    expect(ma.idleUniforms.uIdleBreathBlink.value.x).toBeCloseTo(pa.breathPeriod, 6);
    expect(mb.idleUniforms.uIdleBreathBlink.value.x).toBeCloseTo(pb.breathPeriod, 6);
    expect(ma.idleUniforms.uIdleBreathBlink).not.toBe(mb.idleUniforms.uIdleBreathBlink);
  });

  it('works on a depth material, so the shadow moves with the dragon', () => {
    const m = withIdle(new THREE.MeshDepthMaterial(), idleParams(sheetA));
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.depth.vertexShader,
      fragmentShader: THREE.ShaderLib.depth.fragmentShader,
    };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('transformed += uIdleMix');
  });
});
