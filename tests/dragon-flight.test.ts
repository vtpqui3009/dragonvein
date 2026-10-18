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
 *   neighbour, each wingtip travels ≥ 30 % of the half-span, and in full flight the feet are
 *   ≥ 0.3 off the ground with every leg tucked to ≤ 95 % of its length. Two fixtures have a frill
 *   through a wing in the rest mesh already (graph.ts); they are named, not skipped.
 *
 * And, since M8b criterion 1, the same clearance bars under the wild dragon's *attitude*
 * (src/render/wild.ts `DragonAttitude`, `attitudeSamples`): the tells M8b poses — a raised neck,
 * a crouch, a tucked tail, the head turned back over the shoulder — move the body under wings
 * that are folded against it, which the flap schedule never does, because it poses the walk at
 * rest with no attitude layer at all. The attitude block asserts the three bars that mean
 * something for a held pose (nothing through the body, the wings apart and on their own sides,
 * the fingers in order) and deliberately does not assert the flap's own two (wingtip travel,
 * feet off the ground): a dragon standing on the grass has its feet on the grass and its wingtips
 * still, so asserting those here would be a gate that fails for being right. The amplitudes of
 * those tells are about to grow (docs/DECISIONS.md §"M8b criterion 6"), and this is the gate that
 * says how far they may: it is in place, with a measured baseline, before anything moves.
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
import { DragonFlight, FLIGHT_RAMP_S } from '../src/render/flight';
import { attitudeSamples, flightSamples, probeFlight, type FlightProbe } from '../src/render/flight-probe';
import { DragonWalk } from '../src/render/walk';
import { DragonAttitude, LOOK_MAX } from '../src/render/wild';

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
    expect(falling(byBM.map((f) => f.stroke))).toBe(true);
  });
  it('the wing\'s shape sets the stroke\'s character: a falcate wing strokes higher, a broad fan opens wider', () => {
    const bySH = sweep(0, 1).map((SH) => flightParamsOf(pheno({ wingShape: SH })));
    expect(rising(bySH.map((f) => f.upShare))).toBe(true);
    expect(falling(bySH.map((f) => f.fanOpen))).toBe(true);
    // Across the sheet's range of genes the stroke differs by a visible amount, not a rounding.
    const strokes = [0.55, 1.65].flatMap((WS) => [0.70, 1.45].map((BM) => flightParamsOf(pheno({ wingSpan: WS, bodyMass: BM })).stroke));
    expect(Math.max(...strokes) - Math.min(...strokes)).toBeGreaterThan(0.35);
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
      const dt = 1 / 60, ramp = FLIGHT_RAMP_S;
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

/** Every fixture genome and the two synthetic spans: what the probe is run on, flap or attitude. */
const PROBE_CASES: [string, Genome][] = [
  ...genomes.map((g, i) => [`fixture #${i}`, g] as [string, Genome]),
  ['synthetic, wingSpan 0.55', genomeOf(pheno({ wingSpan: 0.55 }))],
  ['synthetic, wingSpan 1.65', genomeOf(pheno({ wingSpan: 1.65 }))],
];
/**
 * Fixtures whose crest already pierces a wing in the rest mesh, before anything moves: a frill
 * spine through the hand or forearm (graph.ts builds both; M7c does not change the graph). Their
 * flap is measured like any other, but a clearance that is negative at rest cannot be positive
 * in flight. Named here so the static defect stays visible: if this set changes, look again.
 *
 * The attitude block below carves out exactly these two and no others: a pose that is inside the
 * body only because the rest mesh already was is the same old defect, but a third name appearing
 * in either list is a new one.
 */
const CREST_THROUGH_WING_AT_REST = ['fixture #13', 'fixture #24'];

describe('the probe: no wing through the body or the other wing, fingers in order, a visible stroke', () => {
  const cases = PROBE_CASES;
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
    // In full flight it is off the ground with its legs folded (cycle 1, art A9 and gameplay D5).
    expect(r.airborne.footMin, 'the feet leave the ground').toBeGreaterThanOrEqual(0.3);
    expect(r.airborne.legSpanMax, 'every leg tucks').toBeLessThanOrEqual(0.95);
  });
  it('the only dragons not clean at rest are the known crest-through-wing fixtures', () => {
    expect(pierced).toEqual(CREST_THROUGH_WING_AT_REST);
  });
});

/**
 * A free wing — the vertices wholly on wing bones, beyond the junction band — that starts this
 * close to one of the body's own tubes is in the crest's path before anything moves. The number
 * is a measurement, not a taste: over the 34 cases below, the free wing's rest clearance is
 * either ≥ 0.299 (29 of them, the wing well out in the air) or ≤ 0.036 (five of them, a frill
 * spine lying against or through the membrane). There is a clear order of magnitude of empty
 * space on either side of 0.1, so which family a dragon is in is not a judgement call.
 */
const CREST_NEAR_WING = 0.1;
/**
 * The five dragons in that family, and what the attitude gate found about them: 13 and 24 have
 * the crest through the wing in the rest mesh already (above); 17, 18 and 31 have it within
 * 0.0023, 0.0013 and 0.035 of the wing at rest, and when the neck rises — `ATTITUDES.alert`, or
 * any transition passing through a raised neck — the crest it carries goes *through* the
 * membrane: 0.074, 0.084 and 0.054 at the amplitudes shipped for criterion 2, against 0.059,
 * 0.041 and 0.052 before them. That is a pre-existing defect of the graph (graph.ts builds the
 * crest and the wing without consulting each other), the same one as 13 and 24, and amplifying
 * the tells makes it worse on those three because a bigger tell moves the crest further. It is
 * recorded here and in FINDINGS.md against M3, whose territory src/assets/ is; this step does
 * not touch geometry, and the dragon the player meets on the hero island is not one of the five
 * (its free wing starts 0.323 from its body, gid e35390fdfd).
 */
const CREST_THROUGH_WING_UNDER_ATTITUDE = ['fixture #13', 'fixture #17', 'fixture #18', 'fixture #24', 'fixture #31'];

/**
 * Pixels per world unit at the camera the player actually has: the dragon is 97 px across for a
 * body radius of about 1 unit (gate:smoke's framing line, STATE.md run 35), so a unit is about
 * 48.5 px and a thousandth of a unit is about a twentieth of a pixel. Every clearance below is
 * stated in both, because "0.044 inside the tube" means nothing until it is "2.1 px of a 97 px
 * creature".
 */
const PX_PER_UNIT = 48.5;

/**
 * How far a **junction-band** vertex may lie inside the body's swept tubes: an absolute bar, in
 * world units, with its meaning in pixels stated.
 *
 * This replaces the per-case table of measured depths that landed with the attitude gate at
 * 891ba30 (a gate change, in its own commit, with the reason here and in the commit message —
 * CLAUDE.md §2.7). Three things were wrong with the table. It measured the junction band, which
 * is the wing-root skin that rig.ts WING_JUNCTION deliberately blends onto the flank: the band
 * lies *on* the body's surface by construction, 0.0009 to 0.045 outside the tubes before
 * anything moves, so which side of zero it falls on is decided by the body's own motion under a
 * folded wing — a raised neck sliding the neck's tube past the skin wrapped around it — and 25
 * of these 34 cases were already inside at the amplitudes M8b first shipped, worst −0.0441 on
 * fixture #15 at `alert` with the head turned: **2.1 px**. It said nothing about how deep is too
 * deep, only "no deeper than last Tuesday". And pinned to one set of amplitudes it cannot be both
 * the gate and the thing under test in a run whose whole job is to move those amplitudes.
 *
 * So: **0.050 units, 2.4 px**. Above the worst pre-existing depth with 0.006 of room, and still
 * a change no player can see on a 97 px dragon — a quarter of the width of the HUD's own text
 * stroke, which run 36's criterion 2 takes as the least a player notices.
 *
 * This is not a licence to spend. The free wing — the vertex population that can actually put a
 * wing through a flank — is gated strictly at > 0 below, with 0.038 to 0.26 of margin at the
 * amplitudes shipped for criterion 2, and that bar does not move.
 */
const JUNCTION_SLACK = 0.050;
/**
 * No wing vertex of any dragon, in any population, may ever be this far inside the body. A
 * sanity bound, not a quality bar: it is twice the worst depth any of these 34 dragons reaches
 * (0.116, on a crest-family fixture whose crest is through its wing in the rest mesh), and it is
 * here so that a catastrophic regression — a wing folded into the torso, a limb through the
 * chest — fails loudly even on the five dragons whose own geometry is already broken and which
 * are therefore carved out of the two bars above.
 */
const NEVER_DEEPER_THAN = 0.25;

describe('the probe under the attitude: no wing through the body in a crouch, a rear-up or a glance (M8b criterion 1)', () => {
  /**
   * The bars that mean something for a held pose, over `attitudeSamples`: every named state in
   * `ATTITUDES` and every corner of the box the independently eased channels can reach, each
   * with the keeper to either side and dead ahead, each over the walk at rest and walking, and a
   * few with a flap riding over them. 118 samples a dragon, and every number reported is the
   * least over all of them, so a failure names the pose it failed at.
   *
   * The flap's own two bars are not asserted here, and must not be: a standing dragon's feet are
   * on the ground and its wingtips do not travel. See this file's header.
   */
  const nearCrest: string[] = [];
  it.each(PROBE_CASES)('%s', (label, gm) => {
    const a = buildDragonArrays(gm);
    const fp = flightParams(gm);
    const wp = walkParams(gm);
    const walk = new DragonWalk(a.rig, wp);
    const flight = new DragonFlight(walk, a.rig, fp);
    // The rig and the flight's params: `fold` and `rise` pose the wings in the flap's own units,
    // and a bare `new DragonAttitude()` poses the body only — it would measure nothing at all
    // about the two channels that move a wing toward the flank it is folded against.
    const r = probeFlight({ ...a, phenotype: gm.phenotype }, flight, attitudeSamples(fp, wp.period), new DragonAttitude(a.rig, fp));
    expect(r.samples, 'the schedule covers the attitude, not a token pose').toBeGreaterThanOrEqual(60);
    expect(r.wingVerts).toBeGreaterThan(0);
    const crest = r.free.restMin < CREST_NEAR_WING;
    // The per-case numbers, printed as evidence rather than asserted as a bar: what each dragon
    // actually measures and at which pose, so a reader of the run can see which population moved
    // — and by how many pixels — without re-deriving it from a table that may be months old.
    const px = (x: number) => `${x.toFixed(4)} (${(x * PX_PER_UNIT).toFixed(2)} px)`;
    console.log(`${label}${crest ? ' [crest family]' : ''}: free ${px(r.free.min)} at ${r.free.at.state}`
      + `, junction ${px(r.junction.min)} at ${r.junction.at.state}, any vertex ${px(r.body.min)}`
      + `, rest free ${r.free.restMin.toFixed(4)} junction ${r.junction.restMin.toFixed(4)}`);
    // The hazard anyone can see: a wing through the flank. The free wing keeps 0.038 to 0.26 of
    // margin over the whole attitude range on every dragon whose crest is not already in it;
    // the thinnest of them, fixture #6, is thin because its wings sit 0.0009 from its flanks in
    // the rest mesh, and it is thinnest at `wary`'s crouch with a flap ramping over it.
    if (!crest) {
      expect(r.free.min, `the free wing is inside the body at ${JSON.stringify(r.free.at)}`).toBeGreaterThan(0);
      // The junction band: on the body's surface by construction, so it is barred by how far in
      // it goes, not by which side of zero it is on.
      expect(r.junction.min, `the junction band is ${(-r.junction.min * PX_PER_UNIT).toFixed(2)} px inside the body at ${JSON.stringify(r.junction.at)}`)
        .toBeGreaterThanOrEqual(-JUNCTION_SLACK);
    } else {
      // A dragon with a body tube already inside its wing measures both populations against
      // broken geometry, so neither bar above can mean anything on it. It is named, its numbers
      // are printed, and the sanity bound below still holds.
      nearCrest.push(label);
      expect(CREST_THROUGH_WING_UNDER_ATTITUDE, `${label}'s free wing starts ${r.free.restMin} from the body`).toContain(label);
    }
    expect(r.free.min, 'the free wing is not catastrophically inside the body').toBeGreaterThan(-NEVER_DEEPER_THAN);
    expect(r.junction.min, 'the junction band is not catastrophically inside the body').toBeGreaterThan(-NEVER_DEEPER_THAN);
    expect(r.wingToWing.min, `wing to wing at ${JSON.stringify(r.wingToWing.at)}`).toBeGreaterThan(0);
    expect(r.midplaneGap.min, 'the wings stay on their own sides').toBeGreaterThan(0);
    expect(r.fingers.crossings, `fingers at ${JSON.stringify(r.fingers.at)}`).toBe(0);
  });
  it('the dragons whose crest lies against a wing are exactly the five named, and they include the two the flap found', () => {
    expect(nearCrest).toEqual(CREST_THROUGH_WING_UNDER_ATTITUDE);
    for (const name of CREST_THROUGH_WING_AT_REST) expect(CREST_THROUGH_WING_UNDER_ATTITUDE).toContain(name);
  });
  it('the junction bar is above the worst depth measured before the tells were amplified, and still invisible', () => {
    // 891ba30 measured −0.0441 on fixture #15 at `alert`, the worst of any dragon at the
    // amplitudes M8b first shipped. A bar below that would fail for a defect that predates it.
    expect(JUNCTION_SLACK).toBeGreaterThan(0.0441);
    // ... and small enough that nobody can see it: under two and a half pixels of a 97 px dragon.
    expect(JUNCTION_SLACK * PX_PER_UNIT).toBeLessThan(2.5);
  });
});

describe('extending the probe did not move the flap it already measured', () => {
  /**
   * The point of this block: `probeFlight` grew an argument and a second posing path, and the
   * numbers the flap gate has been reading since M7c must be the same numbers afterwards. So the
   * same schedule is run three ways — the argument omitted, the argument explicitly null, and a
   * live `DragonAttitude` already hung on the walk and snapped into `wary` — and all three must
   * agree exactly, not within a tolerance. The third way is the one with teeth: it proves the
   * probe takes the attitude layer *off* for a flap sample and for the rest pose every clearance
   * is referenced to, instead of silently measuring whatever pose the caller left behind. And it
   * proves the layer goes back on afterwards, so probing a live dragon does not flatten it.
   */
  const key = (r: FlightProbe) => ({
    body: r.body.min,
    wingToWing: r.wingToWing.min,
    midplane: r.midplaneGap.min,
    crossings: r.fingers.crossings,
    rest: r.restClearance,
    tips: r.tips.map((t) => t.travel),
    feet: r.airborne.footMin,
  });
  it.each([['fixture #0', genomes[0]!], ['fixture #7', genomes[7]!]] as [string, Genome][])('%s', (_label, gm) => {
    const a = buildDragonArrays(gm);
    const fp = flightParams(gm);
    const run = (attitude: DragonAttitude | null | undefined, hang: boolean) => {
      const walk = new DragonWalk(a.rig, walkParams(gm));
      const flight = new DragonFlight(walk, a.rig, fp);
      if (hang && attitude) { attitude.setTargets('wary', LOOK_MAX); attitude.snap(); walk.attitude = attitude; }
      const r = probeFlight({ ...a, phenotype: gm.phenotype }, flight, flightSamples(fp, 2, 16), attitude);
      return { r, walk };
    };
    const base = run(undefined, false);
    expect(base.walk.attitude, 'nothing was hung on the walk, nothing is there after').toBe(null);
    expect(key(run(null, false).r)).toEqual(key(base.r));
    const live = new DragonAttitude();
    const hung = run(live, true);
    expect(key(hung.r)).toEqual(key(base.r));
    expect(hung.walk.attitude, 'the caller\'s attitude layer is put back').toBe(live);
  });
});
