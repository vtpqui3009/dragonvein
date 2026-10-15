/**
 * The flap and glide (M7c, STATE.md run 31): the genome's flight (`flightParams`), the wing
 * chains the mesher bakes, and the pose on them.
 *
 * - flightParams is deterministic, bounded, and monotone in the genes it names: the beat slows
 *   with wingSpan and bodyMass, the stroke narrows with wingSpan, the downstroke lengthens with
 *   bodyMass, broad wings (low wingShape) soar slower and bank less;
 * - each wing is a chain read off the graph: humerus, forearm, hand, one bone per finger, its
 *   pivots on the wing's own nodes; every membrane vertex rides its own wing (and the body),
 *   never the other wing, with at most 4 influences summing to 1;
 * - `pose(t, 0)` (flap and glide weights 0) is the rest pose at any t, and so is the walk with the
 *   flight riding on it at weight 0;
 * - rest → flap → glide → rest at 60 fps on the page's eased ramps moves no wing node further in
 *   one frame than the beat itself does at full weight: no snap;
 * - the probe tools/dragon-flight.mjs runs in the browser, run here on every fixture genome and on
 *   the two synthetic spans (fewer phases): a dragon whose wings are clear of its body at rest
 *   keeps every wing vertex clear of it in flight, the wings never touch, no finger crosses its
 *   neighbour, and each wingtip travels ≥ 30 % of the half-span. Two fixtures have a frill
 *   through a wing in the rest mesh already (graph.ts); they are named, not skipped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GENES, GENE_NAMES, Genome, breed, wild, type Element, type Phenotype } from '../src/core/genome';
import { buildDragonArrays } from '../src/assets/dragon/arrays';
import { FLIGHT_BOUNDS, flightParams, flightParamsOf, type FlightParams } from '../src/assets/dragon/flight';
import { fullGraph } from '../src/assets/dragon/graph';
import { BODY_BONES, BONE } from '../src/assets/dragon/rig';
import { walkParams } from '../src/assets/dragon/walk';
import { DragonFlight } from '../src/render/flight';
import { flightSamples, probeFlight } from '../src/render/flight-probe';
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

/** A phenotype with every gene mid-range (integers rounded), then `over` applied. */
function pheno(over: Partial<Phenotype> = {}): Phenotype {
  const p = {} as Record<string, number>;
  for (const [k, spec] of Object.entries(GENES)) p[k] = spec[2] === 'i' || spec[2] === 'e' ? Math.round((spec[0] + spec[1]) / 2) : (spec[0] + spec[1]) / 2;
  return { ...(p as unknown as Phenotype), ...over };
}
/** A genome that expresses exactly `p`: both alleles dominant and equal. */
function genomeOf(p: Phenotype): Genome {
  const gm = new Genome();
  for (const k of GENE_NAMES) gm.g[k] = [{ value: p[k], dominant: true }, { value: p[k], dominant: true }];
  gm.element = ['ember', 'ember'];
  gm.lineage = 'test';
  return gm;
}
const sweep = (lo: number, hi: number, n = 8) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
const falling = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]!);

describe('flightParams', () => {
  it('is deterministic', () => {
    for (const g of genomes) expect(flightParams(g)).toEqual(flightParams(Genome.fromJSON(JSON.parse(JSON.stringify(g.toJSON())))));
  });
  it('stays inside FLIGHT_BOUNDS for every fixture genome and at the ends of every range it reads', () => {
    const ps: FlightParams[] = genomes.map(flightParams);
    for (const WS of [0.55, 1.65]) for (const BM of [0.70, 1.45]) for (const SH of [0, 1]) for (const DR of [0, 1]) {
      ps.push(flightParamsOf(pheno({ wingSpan: WS, bodyMass: BM, wingShape: SH, wingDroop: DR })));
    }
    for (const f of ps) {
      for (const [k, [lo, hi]] of Object.entries(FLIGHT_BOUNDS)) {
        const v = f[k as keyof typeof FLIGHT_BOUNDS];
        expect(v, k).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(v, k).toBeLessThanOrEqual(hi + 1e-9);
      }
      expect(f.down).toBeGreaterThan(0.5); // the downstroke is the longer half
    }
  });
  it('big wings and heavy bodies beat slower; big wings sweep a smaller stroke; heavy bodies push down longer', () => {
    const byWS = sweep(0.55, 1.65).map((WS) => flightParamsOf(pheno({ wingSpan: WS })));
    expect(rising(byWS.map((f) => f.period))).toBe(true);
    expect(falling(byWS.map((f) => f.stroke))).toBe(true);
    const byBM = sweep(0.70, 1.45).map((BM) => flightParamsOf(pheno({ bodyMass: BM })));
    expect(rising(byBM.map((f) => f.period))).toBe(true);
    expect(rising(byBM.map((f) => f.down))).toBe(true);
  });
  it('broad wings (low wingShape) soar slower and bank less; a drooping wing glides flatter', () => {
    const bySH = sweep(0, 1).map((SH) => flightParamsOf(pheno({ wingShape: SH })));
    expect(falling(bySH.map((f) => f.soarPeriod))).toBe(true);
    expect(rising(bySH.map((f) => f.bank))).toBe(true);
    const byDR = sweep(0, 1).map((DR) => flightParamsOf(pheno({ wingDroop: DR })));
    expect(falling(byDR.map((f) => f.glideLift))).toBe(true);
  });
  it('two different sheet genomes fly differently', () => {
    expect(flightParams(wild(1, 'ember'))).not.toEqual(flightParams(wild(4, 'gale')));
  });
});

describe.each(genomes.map((g, i) => [i, g] as const))('genome #%i', (_i, gm) => {
  const a = buildDragonArrays(gm);
  const p = gm.phenotype;

  it('has a chain per wing from the graph: humerus, forearm, hand and one bone per finger, pivots on its own nodes', () => {
    const { rig } = a;
    expect(rig.wings.length).toBe(2);
    const nodes = a.graph.v.map(([x, y, z]) => [x, z, -y]);
    const pivot = (b: number) => rig.pivot.slice(3 * b, 3 * b + 3);
    rig.wings.forEach((w, i) => {
      expect(w.side).toBe(i === 0 ? 1 : -1);
      expect(w.humerus).toBe(i === 0 ? BONE.wingL : BONE.wingR);
      expect(w.fingers.length).toBe(p.wingFingers);
      expect(rig.parent[w.forearm]).toBe(w.humerus);
      expect(rig.parent[w.hand]).toBe(w.forearm);
      for (const f of w.fingers) expect(rig.parent[f]).toBe(w.hand);
      expect(pivot(w.humerus)).toEqual(nodes[w.nodes.root]);
      expect(pivot(w.forearm)).toEqual(nodes[w.nodes.elbow]);
      expect(pivot(w.hand)).toEqual(nodes[w.nodes.wrist]);
      for (const f of w.fingers) expect(pivot(f)).toEqual(nodes[w.nodes.wrist]);
      for (const b of [w.forearm, w.hand, ...w.fingers]) expect(b).toBeGreaterThanOrEqual(BODY_BONES);
      // The graph's own wing nodes, as graph.ts lays them out: root, elbow, wrist, leading tip, then mid and tip per finger.
      expect([w.nodes.elbow, w.nodes.wrist, w.nodes.lead]).toEqual([w.nodes.root + 1, w.nodes.root + 2, w.nodes.root + 3]);
      w.nodes.tips.forEach((t, k) => { expect(w.nodes.mids[k]).toBe(w.nodes.root + 4 + 2 * k); expect(t).toBe(w.nodes.root + 5 + 2 * k); });
    });
    // The graph itself is the reference's (parity): the rig reads it, it does not change it.
    expect(a.graph).toEqual(fullGraph(p).g);
  });

  it('binds every membrane vertex to its own wing and the body, ≤ 4 influences summing to 1', () => {
    const wingOf = new Int8Array(a.rig.parent.length).fill(-1);
    a.rig.wings.forEach((w, i) => { for (const b of [w.humerus, w.forearm, w.hand, ...w.fingers]) wingOf[b] = i; });
    let membranes = 0;
    a.parts.forEach((part, pi) => {
      if (a.kinds[pi] !== 'membrane') return;
      const seen = new Set<number>();
      for (let t = part.start; t < part.start + part.count; t++) seen.add(a.index[t]!);
      const wings = new Set<number>();
      for (const v of seen) {
        let sum = 0;
        for (let j = 0; j < 4; j++) {
          const w = a.skinWeight[4 * v + j]!, b = a.skinIndex[4 * v + j]!;
          expect(w).toBeGreaterThanOrEqual(0);
          sum += w;
          if (w > 0 && wingOf[b]! >= 0) wings.add(wingOf[b]!);
        }
        expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-6);
      }
      expect(wings.size, 'a membrane rides exactly one wing').toBe(1);
      membranes++;
    });
    expect(membranes).toBeGreaterThanOrEqual(2);
  });

  it('pose(t, 0) is the rest pose at any t, and so is the walk with the flight at weight 0', () => {
    const walk = new DragonWalk(a.rig, walkParams(gm));
    const flight = new DragonFlight(walk, a.rig, flightParams(gm));
    const id = new THREE.Matrix4();
    for (const t of [0, 0.37, 1.81, 12.5]) {
      flight.pose(t, 0, 0);
      for (const b of walk.bones) expect(b.matrixWorld.equals(id)).toBe(true);
      flight.set(t, 0, 0);
      walk.pose(t, 0);
      for (const b of walk.bones) b.matrixWorld.elements.forEach((e, k) => expect(Math.abs(e - id.elements[k]!)).toBeLessThan(1e-9));
    }
    // And it does move at weight 1: the wing chains turn.
    flight.pose(0, 1, 0);
    expect(walk.bones[a.rig.wings[0]!.humerus]!.matrixWorld.equals(id)).toBe(false);
  });
});

describe('rest → flap → glide → rest', () => {
  it('eases with no snap: no wing node moves further in a 60 fps frame than the full beat moves it', () => {
    for (const gm of [genomes[0]!, genomes[3]!, genomeOf(pheno({ wingSpan: 1.65 }))]) {
      const a = buildDragonArrays(gm);
      const walk = new DragonWalk(a.rig, walkParams(gm));
      const fp = flightParams(gm);
      const flight = new DragonFlight(walk, a.rig, fp);
      const nodes: { bone: number; p: THREE.Vector3 }[] = [];
      for (const w of a.rig.wings) {
        nodes.push({ bone: w.hand, p: new THREE.Vector3(...w.lead) });
        w.fingers.forEach((b, k) => nodes.push({ bone: b, p: new THREE.Vector3(...w.tips[k]!) }));
      }
      const at = () => nodes.map((n) => n.p.clone().applyMatrix4(walk.bones[n.bone]!.matrixWorld));
      const step = (prev: THREE.Vector3[], next: THREE.Vector3[]) => Math.max(...next.map((q, i) => q.distanceTo(prev[i]!)));
      const dt = 1 / 60, ramp = 0.8;
      // The beat alone at full weight: the largest move in one frame.
      let beat = 0;
      flight.pose(0, 1, 0);
      let prev = at();
      for (let t = dt; t < 2 * fp.period; t += dt) { flight.pose(t, 1, 0); const now = at(); beat = Math.max(beat, step(prev, now)); prev = now; }
      // The page's schedule: linear weights, smoothstepped; rest, in, flap, cross, glide, out.
      const ease = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
      const tIn = 0.2, tCross = tIn + ramp + 1.3 * fp.period, tOut = tCross + ramp + 1.5, tEnd = tOut + ramp + 0.2;
      let worst = 0;
      flight.pose(0, 0, 0);
      prev = at();
      for (let t = dt; t < tEnd; t += dt) {
        const f = t < tCross ? ease((t - tIn) / ramp) : 1 - ease((t - tCross) / ramp);
        const g = t < tCross ? 0 : t < tOut ? ease((t - tCross) / ramp) : 1 - ease((t - tOut) / ramp);
        flight.pose(t, f, g);
        const now = at();
        worst = Math.max(worst, step(prev, now));
        prev = now;
      }
      expect(beat).toBeGreaterThan(0);
      expect(worst).toBeLessThanOrEqual(1.25 * beat);
      // ... and it ends at rest.
      flight.pose(tEnd, 0, 0);
      for (const b of walk.bones) expect(b.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
    }
  });
});

describe('the probe: no wing through the body or the other wing, fingers in order, a visible stroke', () => {
  const cases: [string, Genome][] = [
    ...genomes.map((g, i) => [`fixture #${i}`, g] as [string, Genome]),
    ['synthetic, wingSpan 0.55', genomeOf(pheno({ wingSpan: 0.55 }))],
    ['synthetic, wingSpan 1.65', genomeOf(pheno({ wingSpan: 1.65 }))],
  ];
  /**
   * Fixtures whose crest already pierces a wing in the rest mesh, before anything moves: a frill
   * spine through the hand or forearm (graph.ts builds both; M7c does not change the graph). Their
   * flap is measured like any other, but a clearance that is negative at rest cannot be positive
   * in flight. Named here so the static defect stays visible: if this set changes, look again.
   */
  const CREST_THROUGH_WING_AT_REST = ['fixture #13', 'fixture #24'];
  const pierced: string[] = [];
  it.each(cases)('%s', (label, gm) => {
    const a = buildDragonArrays(gm);
    const fp = flightParams(gm);
    const flight = new DragonFlight(new DragonWalk(a.rig, walkParams(gm)), a.rig, fp);
    const r = probeFlight({ ...a, phenotype: gm.phenotype }, flight, flightSamples(fp, 2, 16));
    expect(r.wingVerts).toBeGreaterThan(0);
    if (r.restClearance > 0) {
      expect(r.body.min, `body clearance at ${JSON.stringify(r.body.at)}`).toBeGreaterThan(0);
    } else {
      pierced.push(label);
      expect(CREST_THROUGH_WING_AT_REST, `${label} is inside its own body at rest (${r.restClearance})`).toContain(label);
    }
    expect(r.wingToWing.min, `wing to wing at ${JSON.stringify(r.wingToWing.at)}`).toBeGreaterThan(0);
    expect(r.midplaneGap.min, 'the wings stay on their own sides').toBeGreaterThan(0);
    expect(r.fingers.crossings, `fingers at ${JSON.stringify(r.fingers.at)}`).toBe(0);
    for (const t of r.tips) expect(t.ratio).toBeGreaterThanOrEqual(0.30);
  });
  it('the only dragons not clean at rest are the known crest-through-wing fixtures', () => {
    expect(pierced).toEqual(CREST_THROUGH_WING_AT_REST);
  });
});
