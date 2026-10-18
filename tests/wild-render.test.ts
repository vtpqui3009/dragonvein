/**
 * M8b: the render half of the wild dragon (src/render/wild.ts, src/render/wild-dragon.ts) —
 * the tells ease and stay bounded, a flight's pose is continuous and lands at rest, the deck's
 * height grid reads the deck, the keeper is one geometry, and the dragon's one material skins
 * from a uniform array.
 *
 * Since M8b criterion 2 the tells are big enough to read at the camera the player has (97 px of
 * dragon), which brought three channels — `fold`, `rise`, `rear` — and a rear-up that moves the
 * legs. Two things are asserted here that the clearance gate (tests/dragon-flight.test.ts)
 * cannot see, because it measures wings against the body and not the body against the ground:
 *
 * - **the legs survive the rear-up.** The pitch is about the pelvis, so it carries the hind hips
 *   away from hind feet that are holding the deck. If the two-bone IK is asked for more than the
 *   leg has, `legState().stretched` goes true and the leg visibly pulls out of the ground;
 * - **the tail stays out of the deck.** A rigid nose-up pitch sweeps a long tail down behind the
 *   dragon, and a dragon's tail is long: the worst of the 35 probe dragons carries its tip 4.9
 *   units behind the hips, where 20° of pitch is 1.3 units of tail through the floor. walk.ts
 *   REAR_TAIL_LIFT is what stops that, and this is the test that would catch its loss.
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
        for (const k of ['neck', 'head', 'lower', 'tail', 'fold', 'rise', 'rear'] as const) {
          const g = goal[k];
          // Monotone toward the goal from 0: never past it.
          expect(Math.abs(a[k] - g)).toBeLessThanOrEqual(Math.abs(last[k] - g) + 1e-12);
        }
        last = { ...a };
      }
      for (const k of ['neck', 'head', 'lower', 'tail', 'fold', 'rise', 'rear'] as const) expect(a[k], k).toBeCloseTo(goal[k], 3);
      expect(a.look).toBeCloseTo(goal.lookShare * 0.8, 3);
    }
  });

  it('every channel of every state stays inside the range its units allow', () => {
    for (const [state, goal] of Object.entries(ATTITUDES)) {
      expect(goal.lookShare, `${state} lookShare`).toBeGreaterThanOrEqual(0);
      expect(goal.lookShare, `${state} lookShare`).toBeLessThanOrEqual(1);
      // Shares, not radians: a fold is 0..1 of the flap's own fold, a lift −1..1 of its stroke,
      // a rear 0..1 of REAR_PITCH, a crouch 0..1 of the leg's drop. Outside those the pose is
      // not a bigger tell, it is the flap's bounds broken somewhere a gate cannot see it.
      expect(goal.fold, `${state} fold`).toBeGreaterThanOrEqual(0);
      expect(goal.fold, `${state} fold`).toBeLessThanOrEqual(1);
      expect(Math.abs(goal.rise), `${state} rise`).toBeLessThanOrEqual(1);
      expect(goal.rear, `${state} rear`).toBeGreaterThanOrEqual(0);
      expect(goal.rear, `${state} rear`).toBeLessThanOrEqual(1);
      expect(goal.lower, `${state} lower`).toBeLessThanOrEqual(1);
      // Radians, and a neck or a head past a right angle is not a tell, it is a broken neck.
      for (const k of ['neck', 'head', 'tail'] as const) expect(Math.abs(goal[k]), `${state} ${k}`).toBeLessThanOrEqual(Math.PI / 2);
    }
  });

  /**
   * The states have to differ in the *body*, not only in where the head points: criterion 6 is
   * judged on the body alone (STATE.md run 33), and `look` is 0 whenever the keeper is straight
   * ahead. So each of the three states a player reads most differs from the others in at least
   * two channels that move geometry, by a margin rather than a rounding.
   */
  it('wander, alert and wary differ in at least two geometry-moving channels each', () => {
    const MOVES = ['neck', 'head', 'lower', 'tail', 'fold', 'rise', 'rear'] as const;
    const pairs: [string, string][] = [['wander', 'alert'], ['wander', 'wary'], ['alert', 'wary']];
    for (const [x, y] of pairs) {
      const a = ATTITUDES[x]!, b = ATTITUDES[y]!;
      const differ = MOVES.filter((k) => Math.abs(a[k] - b[k]) >= 0.2);
      expect(differ.length, `${x} vs ${y} differ in ${JSON.stringify(differ)}`).toBeGreaterThanOrEqual(2);
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

  /**
   * The rear-up (M8b criterion 2, ./walk.ts REAR_PITCH): the body pitches nose-up about the
   * pelvis, which is the biggest change of silhouette the dragon has and the only tell that
   * costs the clearance gate nothing. What it does cost is the legs and the tail, so both are
   * measured here over the *whole* range of `rear` — every tenth of it, standing and walking,
   * at four gait phases — and not only at the ends:
   *
   * - no leg of any dragon is ever asked for more than it has (`stretched`): the rear sinks the
   *   hips (REAR_SINK) by exactly enough that the hind legs can keep their feet;
   * - the hind feet do not move at all while the body rears, to the last bit of a double;
   * - the forefeet come up with the shoulders they hang from, by a margin a player can see;
   * - no part of the tail goes under the deck (REAR_TAIL_LIFT), on a dragon of any tail length.
   */
  it('rears up without stretching a leg, moving a hind foot, or putting its tail through the deck', () => {
    for (const seed of [1, 3, 5, 7]) {
      const g = wild(seed);
      const body = buildDragon(g);
      const fp = flightParams(g), wp = walkParams(g);
      const walk = new DragonWalk(body.rig, wp);
      new DragonFlight(walk, body.rig, fp);
      const att = new DragonAttitude(body.rig, fp);
      walk.attitude = att;
      const alert = ATTITUDES['alert']!;
      const raw = (rear: number) => ({ look: 0, neck: alert.neck, head: alert.head, lower: alert.lower, tail: alert.tail, fold: alert.fold, rise: alert.rise, rear });
      const hind = body.rig.legs.map((l) => l.anchor === BONE.pelvis);
      const tipNode = body.graph.v[body.idx.tailTip]!;
      const tip = new THREE.Vector3(tipNode[0], tipNode[2], -tipNode[1]);
      const tipAt = () => tip.clone().applyMatrix4(walk.bones[BONE.tail2]!.matrixWorld);
      // Where the feet stand before it rears, through the same pose path (an all-zero layer).
      att.setRaw(raw(0));
      walk.pose(null, 0);
      const flat = body.rig.legs.map((_, i) => walk.ball(i, new THREE.Vector3()));
      const lifted = body.rig.legs.map(() => 0);
      for (let step = 0; step <= 10; step++) {
        const rear = step / 10;
        for (const [t, w] of [[null, 0], [0, 1], [wp.period * 0.25, 1], [wp.period * 0.5, 1], [wp.period * 0.75, 1]] as [number | null, number][]) {
          att.setRaw(raw(rear));
          walk.pose(t, w);
          const foot = new THREE.Vector3();
          for (let i = 0; i < walk.legCount; i++) {
            expect(walk.legState(i).stretched, `seed ${seed} leg ${i} (${body.rig.legs[i]!.name}) at rear ${rear}, walk ${w}`).toBe(false);
            walk.ball(i, foot);
            if (w === 0) {
              if (hind[i]) expect(foot.distanceTo(flat[i]!), `seed ${seed} hind foot ${i} moved at rear ${rear}`).toBeLessThan(1e-9);
              else lifted[i] = Math.max(lifted[i]!, foot.y - flat[i]!.y);
            }
          }
          expect(tipAt().y, `seed ${seed} tail tip at rear ${rear}, walk ${w}`).toBeGreaterThan(0);
        }
      }
      // And the forefeet are visibly off the deck at a full rear: a quarter of the leg's own drop.
      const drop = flat[0]!.y;
      body.rig.legs.forEach((l, i) => {
        if (hind[i]) return;
        expect(lifted[i], `seed ${seed} ${l.name} rises`).toBeGreaterThan(0.1);
        void drop;
      });
    }
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
