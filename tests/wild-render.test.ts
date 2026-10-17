/**
 * M8b: the render half of the wild dragon (src/render/wild.ts, src/render/wild-dragon.ts) —
 * the tells ease and stay bounded, a flight's pose is continuous and lands at rest, the deck's
 * height grid reads the deck, the keeper is one geometry, and the dragon's one material skins
 * from a uniform array.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { wild } from '../src/core/genome';
import { buildDragon } from '../src/assets/dragon/builder';
import { flightParams } from '../src/assets/dragon/flight';
import { walkParams } from '../src/assets/dragon/walk';
import { BONE } from '../src/assets/dragon/rig';
import { DragonFlight } from '../src/render/flight';
import { DragonWalk } from '../src/render/walk';
import { ATTITUDES, DeckHeights, DragonAttitude, LOOK_MAX, fleePose, keeperGeometry, withKeeper } from '../src/render/wild';
import { withBones, withRough } from '../src/render/wild-dragon';

describe('the tells (DragonAttitude)', () => {
  it('eases toward each state\'s pose without overshoot, and reaches it', () => {
    for (const [state, goal] of Object.entries(ATTITUDES)) {
      const a = new DragonAttitude();
      let last = { ...a };
      for (let i = 0; i < 240; i++) {
        a.setTargets(state, 0.8);
        a.update(1 / 60);
        for (const k of ['neck', 'head', 'lower', 'tail'] as const) {
          const g = goal[k];
          // Monotone toward the goal from 0: never past it.
          expect(Math.abs(a[k] - g)).toBeLessThanOrEqual(Math.abs(last[k] - g) + 1e-12);
        }
        last = { ...a };
      }
      expect(a.neck).toBeCloseTo(goal.neck, 3);
      expect(a.lower).toBeCloseTo(goal.lower, 3);
      expect(a.look).toBeCloseTo(goal.lookShare * 0.8, 3);
    }
  });

  it('turns the head at most LOOK_MAX, whatever the bearing', () => {
    const a = new DragonAttitude();
    a.setTargets('alert', Math.PI);
    a.snap();
    expect(a.look).toBeCloseTo(LOOK_MAX, 9);
    a.setTargets('alert', -3);
    a.snap();
    expect(a.look).toBeCloseTo(-LOOK_MAX, 9);
  });

  it('alert lifts the head and turns it to the keeper; wary crouches and tucks the tail; on the skeleton', () => {
    const g = wild(3, 'stone');
    const body = buildDragon(g);
    const walk = new DragonWalk(body.rig, walkParams(g));
    const att = new DragonAttitude();
    walk.attitude = att;
    const head = new THREE.Vector3(), pelvis = new THREE.Vector3();
    const at = (bone: number, out: THREE.Vector3) => out.set(...body.rig.pivot.slice(3 * bone, 3 * bone + 3) as [number, number, number])
      .applyMatrix4(walk.bones[bone]!.matrixWorld);
    const neutral = { head: new THREE.Vector3(), pelvis: new THREE.Vector3(), foot: new THREE.Vector3() };
    att.setTargets('wander', 0); att.snap(); walk.pose(null);
    at(BONE.head, neutral.head); at(BONE.pelvis, neutral.pelvis); walk.ball(0, neutral.foot);
    att.setTargets('alert', 0.9); att.snap(); walk.pose(null);
    at(BONE.head, head);
    expect(head.y).toBeGreaterThan(neutral.head.y + 0.1);            // head up
    expect(head.z).toBeLessThan(neutral.head.z - 0.1);               // turned toward +look (the dragon's left, −z)
    att.setTargets('wary', 0); att.snap(); walk.pose(null);
    at(BONE.pelvis, pelvis);
    expect(pelvis.y).toBeLessThan(neutral.pelvis.y - 0.05);         // crouched
    // The feet stay where they were: the IK bends the knees.
    const foot = new THREE.Vector3();
    walk.ball(0, foot);
    expect(foot.distanceTo(neutral.foot)).toBeLessThan(1e-6);
  });
});

describe('a flight\'s shape (fleePose)', () => {
  it('starts and ends on the ground at rest, flies in between, and never jumps', () => {
    const out = { flap: 0, glide: 0, altitude: 0 };
    // The sim's shortest flight is TAKEOFF_S + MIN_AIR_S + LAND_S = 3.2 s.
    for (const dur of [3.2, 4, 5.5]) {
      let prev = fleePose(0, dur, 0.9, 0.9, 2.5, { ...out });
      expect(prev).toEqual({ flap: 0, glide: 0, altitude: 0 });
      let peak = 0;
      for (let t = 0.01; t <= dur + 1e-9; t += 0.01) {
        const p = fleePose(t, dur, 0.9, 0.9, 2.5, { ...out });
        expect(p.flap + p.glide).toBeLessThanOrEqual(1 + 1e-12);
        for (const k of ['flap', 'glide', 'altitude'] as const) expect(Math.abs(p[k] - prev[k])).toBeLessThan(k === 'altitude' ? 0.07 : 0.05);
        peak = Math.max(peak, p.altitude);
        prev = p;
      }
      const end = fleePose(dur, dur, 0.9, 0.9, 2.5, { ...out });
      expect(end.flap + end.glide).toBeCloseTo(0, 9);
      expect(end.altitude).toBeCloseTo(0, 9);
      expect(peak).toBeGreaterThan(2);
    }
  });
});

describe('the deck\'s heights', () => {
  it('reads a flat deck at its height, and the fallback off it, once built', () => {
    const parent = new THREE.Group();
    parent.rotation.y = 0.7;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1.1, 32).translate(0, 0, 0));
    parent.add(deck);
    const h = new DeckHeights(deck, 6, 17, -1);
    expect(h.at(0, 0)).toBe(-1);                                     // not built yet
    expect(h.build()).toBeGreaterThanOrEqual(0);
    expect(h.at(0, 0)).toBeCloseTo(0.55, 5);
    expect(h.at(3, -2.5)).toBeCloseTo(0.55, 5);
  });
});

describe('the keeper', () => {
  it('is one geometry: figure, lantern and ring, with its glow and mark', () => {
    const g = keeperGeometry();
    const n = g.getAttribute('position').count;
    for (const a of ['color', 'glow', 'mark', 'normal']) expect(g.getAttribute(a).count).toBe(n);
    const glow = g.getAttribute('glow').array, mark = g.getAttribute('mark').array;
    let glowing = 0, marked = 0;
    for (let i = 0; i < n; i++) { if (glow[i]! > 0) glowing++; if (mark[i]! > 0) marked++; }
    expect(glowing).toBeGreaterThan(marked);                          // the lantern glows too
    expect(marked).toBeGreaterThan(0);
    expect(g.groups).toHaveLength(0);
  });

  it('patches its materials, colour and depth, and keys their programs apart', () => {
    const m = withKeeper(new THREE.MeshStandardMaterial({ vertexColors: true }));
    const d = withKeeper(new THREE.MeshDepthMaterial());
    const shader = {
      uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('uMark');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance');
    expect(m.customProgramCacheKey()).not.toBe(d.customProgramCacheKey());
  });
});

describe('the dragon\'s one material', () => {
  it('skins from a uniform array the size of its rig, with roughness per vertex', () => {
    const g = wild(1, 'ember');
    const body = buildDragon(g);
    const walk = new DragonWalk(body.rig, walkParams(g));
    new DragonFlight(walk, body.rig, flightParams(g));
    const bones = new Float32Array(walk.boneCount * 16);
    const m = withBones(withRough(new THREE.MeshStandardMaterial({ vertexColors: true })), bones);
    expect(m.defines?.['USE_SKINNING']).toBe('');
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\n#include <skinning_pars_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <roughnessmap_fragment>',
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain(`uniform mat4 uBones[ ${walk.boneCount} ]`);
    expect(shader.vertexShader).not.toContain('#include <skinning_pars_vertex>');
    expect(shader.fragmentShader).toContain('roughnessFactor = vRough');
    expect((shader.uniforms as Record<string, THREE.IUniform>)['uBones']!.value).toBe(bones);
  });
});
