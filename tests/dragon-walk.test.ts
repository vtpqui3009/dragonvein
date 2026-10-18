/**
 * The walk (M7b, STATE.md run 30): the genome's gait (`walkParams`), the rig the mesher
 * bakes (bone table, skin weights), and the pose solver's planted feet.
 *
 * - walkParams is deterministic, bounded, monotone in the genes it names (stride in
 *   legLength, period and duty in bodyMass), a lateral-sequence gait, speed = stride / period;
 * - every vertex is bound: at most 4 influences, weights ≥ 0 summing to 1 within 1e-6, bone
 *   indices inside the table; the table's parents come first and its pivots are graph nodes;
 * - the solver at rest is the identity (the skinned mesh is the static one), so is walk weight
 *   0 at any time (the ramp starts and ends there), and walking two
 *   cycles every planted foot stays within 1 % of the stride in the world, the IK never runs
 *   out of reach, and every knee swings through more than 15°.
 * tools/dragon-walk.mjs measures the same drift in the browser, on the rendered skeleton.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GENES, Genome, breed, wild, type Element, type Phenotype } from '../src/core/genome';
import { buildDragonArrays } from '../src/assets/dragon/arrays';
import { fullGraph } from '../src/assets/dragon/graph';
import { boneCount, buildRig } from '../src/assets/dragon/rig';
import { LATERAL_SEQUENCE, WALK_BOUNDS, walkParams, walkParamsOf, type WalkParams } from '../src/assets/dragon/walk';
import { DragonWalk } from '../src/render/walk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
const fx = JSON.parse(readFileSync(path.join(ROOT, 'docs/fixtures/genomes.json'), 'utf8')) as { genomes: { recipe: Recipe }[] };
const genomes: Genome[] = [];
for (const { recipe: r } of fx.genomes) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}

/** A phenotype with every gene mid-range, then `over` applied. */
function pheno(over: Partial<Phenotype> = {}): Phenotype {
  const p = {} as Record<string, number>;
  for (const [k, spec] of Object.entries(GENES)) p[k] = spec[2] === 'f' || spec[2] === 'c' ? (spec[0] + spec[1]) / 2 : spec[0];
  return { ...(p as unknown as Phenotype), ...over };
}
const sweep = (lo: number, hi: number, n = 8) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

describe('walkParams', () => {
  it('is deterministic', () => {
    for (const g of genomes) expect(walkParams(g)).toEqual(walkParams(Genome.fromJSON(JSON.parse(JSON.stringify(g.toJSON())))));
  });
  it('stays inside WALK_BOUNDS for every fixture genome and at the ends of every range', () => {
    const ps: WalkParams[] = genomes.map(walkParams);
    for (const LL of [0.70, 1.40]) for (const BM of [0.70, 1.45]) for (const TL of [0.60, 1.80]) ps.push(walkParamsOf(pheno({ legLength: LL, bodyMass: BM, tailLength: TL })));
    for (const w of ps) {
      for (const [k, [lo, hi]] of Object.entries(WALK_BOUNDS)) {
        const v = w[k as keyof typeof WALK_BOUNDS];
        expect(v, k).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(v, k).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });
  it('stride grows with legLength; period and duty grow with bodyMass; speed is stride / period', () => {
    const byLL = sweep(0.70, 1.40).map((LL) => walkParamsOf(pheno({ legLength: LL })));
    for (let i = 1; i < byLL.length; i++) expect(byLL[i]!.stride).toBeGreaterThan(byLL[i - 1]!.stride);
    const byBM = sweep(0.70, 1.45).map((BM) => walkParamsOf(pheno({ bodyMass: BM })));
    for (let i = 1; i < byBM.length; i++) {
      expect(byBM[i]!.period).toBeGreaterThan(byBM[i - 1]!.period);
      expect(byBM[i]!.duty).toBeGreaterThan(byBM[i - 1]!.duty);
      expect(byBM[i]!.stride).toBe(byBM[0]!.stride);
    }
    for (const g of genomes) { const w = walkParams(g); expect(w.speed).toBeCloseTo(w.stride / w.period, 12); }
  });
  it('is a lateral-sequence walk: LH, LF, RH, RF a quarter cycle apart, more than half the cycle down', () => {
    for (const g of genomes) {
      const w = walkParams(g);
      expect(w.phase).toEqual([...LATERAL_SEQUENCE]);
      expect(w.duty).toBeGreaterThan(0.5);
    }
    expect(LATERAL_SEQUENCE).toEqual([0, 0.25, 0.5, 0.75]);
  });
  it('two different sheet genomes walk differently', () => {
    expect(walkParams(wild(1, 'ember'))).not.toEqual(walkParams(wild(3, 'stone')));
  });
});

describe.each(genomes.map((g, i) => [i, g] as const))('genome #%i', (_i, gm) => {
  const a = buildDragonArrays(gm);
  it('binds every vertex: ≤ 4 influences, weights ≥ 0 summing to 1, indices in the table', () => {
    const nv = a.position.length / 3;
    expect(a.skinIndex.length).toBe(4 * nv);
    expect(a.skinWeight.length).toBe(4 * nv);
    let worst = 0, negative = 0, outside = 0;
    for (let v = 0; v < nv; v++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        const w = a.skinWeight[4 * v + j]!;
        if (w < 0) negative++;
        if (a.skinIndex[4 * v + j]! >= a.rig.parent.length) outside++;
        sum += w;
      }
      worst = Math.max(worst, Math.abs(sum - 1));
    }
    expect(negative).toBe(0);
    expect(outside).toBe(0);
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
  it('has a bone table from the graph: parents first, pivots on graph nodes', () => {
    const { rig } = a;
    // The body's 26, then each wing's forearm, hand and one bone per finger (M7c).
    expect(rig.parent.length).toBe(boneCount(gm.phenotype));
    rig.parent.forEach((p, i) => expect(p).toBeLessThan(i));
    const nodes = a.graph.v.map(([x, y, z]) => [x, z, -y]);
    for (let i = 0; i < rig.parent.length; i++) {
      const q = rig.pivot.slice(3 * i, 3 * i + 3);
      expect(nodes.some((n) => n.every((c, k) => c === q[k])), rig.names[i]).toBe(true);
    }
    expect(buildRig(fullGraph(gm.phenotype).g, fullGraph(gm.phenotype).idx, gm.phenotype).rig).toEqual(rig);
  });
  it('at walk weight 0 is the rest pose at any time, and weight 1 is the default', () => {
    const w = walkParams(gm);
    const a0 = new DragonWalk(a.rig, w), a1 = new DragonWalk(a.rig, w);
    const id = new THREE.Matrix4();
    for (const t of [0, 0.37 * w.period, 1.81 * w.period]) {
      a0.pose(t, 0);
      for (const b of a0.bones) b.matrixWorld.elements.forEach((e, k) => expect(Math.abs(e - id.elements[k]!)).toBeLessThan(1e-9));
      a0.pose(t);
      a1.pose(t, 1);
      a0.bones.forEach((b, i) => expect(b.matrixWorld.equals(a1.bones[i]!.matrixWorld)).toBe(true));
    }
  });
  /**
   * The rest pose has to read as the rest pose through *every* way of asking, not only through
   * the bone matrices. `pose(null)` with no layers takes a shortcut — it writes the identity into
   * each `matrixWorld` and returns — but `ball()`, `toe()` and `legState()` answer from the
   * solver's own joint rotations, positions and leg states, which that shortcut used to leave
   * exactly as the previous pose had them. A rest reading taken after a walk was therefore a
   * walking dragon's: the trap cost half an hour of M8b criterion 2's measurement before it was
   * spotted, and it would have silently poisoned anything that measured a change *from* rest.
   * So: walk it, then ask for rest, and require rest's own answers.
   */
  it('reports the rest pose through ball, toe and legState after a walk, not the walk it just did', () => {
    const w = walkParams(gm);
    const walk = new DragonWalk(a.rig, w);
    const V = (v: readonly number[]) => new THREE.Vector3(v[0], v[1], v[2]);
    const atRest = () => {
      walk.pose(null);
      return a.rig.legs.map((_, i) => ({ ball: walk.ball(i, new THREE.Vector3()), toe: walk.toe(i, new THREE.Vector3()), st: walk.legState(i) }));
    };
    const cold = atRest();
    walk.pose(0.63 * w.period, 1);
    const warm = atRest();
    a.rig.legs.forEach((leg, i) => {
      // The rest ball and toe are the rig's own, to the last bit of a double — not near them.
      expect(warm[i]!.ball.distanceTo(V(leg.ball)), `leg ${i} rest ball`).toBeLessThan(1e-12);
      expect(warm[i]!.toe.distanceTo(V(leg.toe)), `leg ${i} rest toe`).toBeLessThan(1e-12);
      // And asking twice, once from cold and once after a walk, gives the same answer.
      expect(warm[i]!.ball.distanceTo(cold[i]!.ball), `leg ${i} ball, cold vs after a walk`).toBeLessThan(1e-12);
      expect(warm[i]!.st.planted, `leg ${i} planted at rest`).toBe(true);
      expect(warm[i]!.st.stretched, `leg ${i} stretched at rest`).toBe(false);
      // The rest knee angle is the rig's rest bend, not whatever the walk's last frame held.
      const rest = V(leg.hip).sub(V(leg.knee)).angleTo(V(leg.ankle).sub(V(leg.knee)));
      expect(warm[i]!.st.kneeAngle, `leg ${i} rest knee`).toBeCloseTo(rest, 12);
    });
  });

  it('rests at the identity, and walks with planted feet and bending knees', () => {
    const w = walkParams(gm);
    const walk = new DragonWalk(a.rig, w);
    walk.pose(null);
    for (const b of walk.bones) expect(b.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
    const steps = 480;
    const ball = new THREE.Vector3();
    const start = Array.from({ length: 4 }, () => new THREE.Vector3());
    const wasPlanted = [false, false, false, false];
    const drift = [0, 0, 0, 0];
    const knee = Array.from({ length: 4 }, () => [Infinity, -Infinity]);
    for (let s = 0; s <= steps; s++) {
      const t = (2 * w.period * s) / steps;
      walk.pose(t);
      for (let i = 0; i < 4; i++) {
        const st = walk.legState(i);
        expect(st.stretched, `leg ${i} out of reach at t ${t}`).toBe(false);
        knee[i]![0] = Math.min(knee[i]![0]!, st.kneeAngle);
        knee[i]![1] = Math.max(knee[i]![1]!, st.kneeAngle);
        walk.ball(i, ball);
        ball.x += walk.travel; // the world: the mesh moves by `travel`
        if (st.planted) {
          if (!wasPlanted[i]) start[i]!.copy(ball);
          drift[i] = Math.max(drift[i]!, ball.distanceTo(start[i]!));
        }
        wasPlanted[i] = st.planted;
      }
    }
    for (let i = 0; i < 4; i++) {
      expect(drift[i]! / w.stride, `leg ${i} drift`).toBeLessThanOrEqual(0.01);
      expect(((knee[i]![1]! - knee[i]![0]!) * 180) / Math.PI, `leg ${i} knee range`).toBeGreaterThan(15);
    }
  });
});
