/**
 * The wing forms and the spread rest pose (M3e criteria 1 and 2), in the TS builder. The
 * reference's agreement with every number here is tests/dragon-graph.test.ts's job; this
 * file checks what the numbers are for.
 *
 * 1. `wingForm` is the rule builder.py and graph.ts both state: wingFingers <= 2 → sail,
 *    else wingShape < 0.5 → spread, else segmented. The 8-dragon sheet shows all three.
 * 2. Each form's membrane is shaped as the form says: a sail is one straight-edged panel, a
 *    spread wing's trailing edge is scalloped between the tips, a segmented wing's vanes are
 *    separate pieces.
 * 3. Every wing rests spread: out to the side, never upright, above the torso's midline and
 *    clear of the tail — and in the sheet camera the far wing does not cross the tail or the
 *    belly (the M3 art defect: "a wing finger passes through the belly, and the hind membrane
 *    crosses the tail").
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breed, wild, type Element, type Genome, type Phenotype } from '../src/core/genome';
import { MEMBRANE_THICKNESS, WING_FORMS, fullGraph, membranePolys, torsoNodes, wingForm, wingNodes, wingRootZ, type Vec3 } from '../src/assets/dragon/graph';

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

/** src/dragon-view.ts SHEET, A–H: seeds 1–6 wild, G = A × B, H = G × C. */
const sheet: Genome[] = [];
(['ember', 'tide', 'stone', 'gale', 'jade', 'umbra'] as const).forEach((el, i) => sheet.push(wild(i + 1, el)));
sheet.push(breed(sheet[0]!, sheet[1]!, 7));
sheet.push(breed(sheet[6]!, sheet[2]!, 8));
/** src/dragon-view.ts SHEET_YAW and SHEET_ELEVATION_DEG: the sheet camera. */
const SHEET_YAW = -0.55;
const SHEET_ELEVATION = (32 * Math.PI) / 180;

const all = [...fixed, ...sheet];
const withGenes = (p: Phenotype, genes: Partial<Phenotype>): Phenotype => ({ ...p, ...genes });

describe('wingForm: derived from wingFingers and wingShape, no gene of its own', () => {
  const p = sheet[0]!.phenotype;
  it('two fingers make a sail, whatever the shape', () => {
    for (const wingShape of [0, 0.3, 0.5, 1]) expect(wingForm(withGenes(p, { wingFingers: 2, wingShape }))).toBe('sail');
  });
  it('three or four fingers: broad (shape < 0.5) spread, falcate (>= 0.5) segmented', () => {
    for (const wingFingers of [3, 4]) {
      expect(wingForm(withGenes(p, { wingFingers, wingShape: 0 }))).toBe('spread');
      expect(wingForm(withGenes(p, { wingFingers, wingShape: 0.4999 }))).toBe('spread');
      expect(wingForm(withGenes(p, { wingFingers, wingShape: 0.5 }))).toBe('segmented');
      expect(wingForm(withGenes(p, { wingFingers, wingShape: 1 }))).toBe('segmented');
    }
  });
  it('the 8-dragon sheet shows all three: A B E F spread, C D H segmented, G sail', () => {
    expect(sheet.map((g) => wingForm(g.phenotype)).join(' ')).toBe(
      'spread spread segmented segmented spread spread sail segmented');
    expect(new Set(sheet.map((g) => wingForm(g.phenotype)))).toEqual(new Set(WING_FORMS));
  });
});

/** Faces joined through shared corners: the membrane's separate pieces. */
function pieces(f: number[][]): number {
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  for (const face of f) for (const v of face) if (!parent.has(v)) parent.set(v, v);
  for (const face of f) for (const v of face.slice(1)) parent.set(find(v), find(face[0]!));
  return new Set([...parent.keys()].map(find)).size;
}

describe('each form is built as its rule says', () => {
  all.forEach((gm, i) => {
    const p = gm.phenotype;
    const form = wingForm(p);
    it(`#${i} ${form}`, () => {
      // A sail is one unbroken panel: its finger bones sit inside the membrane's thickness.
      // Spread and segmented wings show theirs (M3e cycle 1: sail and spread alike at 25 %).
      const { g } = fullGraph(p);
      for (const s of [1, -1]) {
        for (const t of wingNodes(p, s).tips) {
          const tip = g.v.findIndex((q) => q[0] === t[0] && q[1] === t[1] && q[2] === t[2]);
          expect(tip, 'finger tip in the graph').toBeGreaterThan(0);
          const midR = g.r[tip - 1]!; // the chain is wrist → mid → tip
          if (form === 'sail') expect(midR).toBeLessThan(MEMBRANE_THICKNESS / 2);
          else expect(midR).toBeGreaterThan(MEMBRANE_THICKNESS / 2);
        }
      }
      for (const s of [1, -1]) {
        const { v, f } = membranePolys(p, s);
        const NF = p.wingFingers;
        // Only triangles and quads: Blender's simple Subsurf and parts.ts tessellate those alike.
        for (const face of f) expect([3, 4]).toContain(face.length);
        if (form === 'sail') {
          // inner quad + inner tri + one wedge per rib pair (leading tip, NF fingers, hip anchor)
          expect(f.length).toBe(2 + NF + 1);
          expect(v.length).toBe(4 + NF + 2);
          expect(pieces(f)).toBe(1);
        } else if (form === 'spread') {
          // each of the NF + 1 wedges cut into 4 fan triangles by 3 scallop points
          expect(f.length).toBe(2 + 4 * (NF + 1));
          expect(pieces(f)).toBe(1);
          // a scallop: its middle point sits nearer the wrist than the chord between the tips
          const W2 = v[2]!;
          const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          const ribs = [3, ...Array.from({ length: NF }, (_, k) => 4 + k), 4 + NF];
          for (let r = 0; r + 1 < ribs.length; r++) {
            const a = v[ribs[r]!]!, b = v[ribs[r + 1]!]!;
            const notch = v[4 + NF + 2 + 3 * r + 1]!;
            const chordMid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            expect(dist(notch, W2)).toBeLessThan(0.8 * dist(chordMid, W2));
          }
        } else {
          // the inner membrane, then one separate vane per finger and on the leading tip
          expect(f.length).toBe(2 + NF + 1);
          expect(pieces(f)).toBe(1 + NF + 1);
        }
      }
    });
  });
});

describe('every wing rests spread: out to the side, not upright', () => {
  all.forEach((gm, i) => {
    const p = gm.phenotype;
    it(`#${i}`, () => {
      // Since M3f the root rides on the shoulder (graph.ts wingRootZ), 1.22 at the middle of
      // the body genes; the torso's midline is the chest node's centre, 1.0 there.
      const WING_ROOT_Z = wingRootZ(p);
      const midline = torsoNodes(p)[2]![1];
      for (const s of [1, -1]) {
        const { arm, tips } = wingNodes(p, s);
        const pts = [...arm.map((a) => a[0]), ...tips];
        let reach = 0, rise = 0;
        for (const [, y, z] of pts) {
          const d = y * s;
          expect(d, 'every bone is on its own side').toBeGreaterThan(0);
          // under 45°: each point is further out than it is above the root
          expect(z - WING_ROOT_Z).toBeLessThanOrEqual(0.85 * (d - 0.26) + 1e-12);
          expect(z, 'never below the root: no finger through the belly').toBeGreaterThanOrEqual(WING_ROOT_Z);
          reach = Math.max(reach, d);
          rise = Math.max(rise, z - WING_ROOT_Z);
        }
        expect(reach, 'the wing reaches well past the body').toBeGreaterThan(1.6);
        expect(reach).toBeGreaterThan(1.15 * rise);
        // The membrane stays above the torso's midline and off the tail's line (y = 0).
        for (const [, y, z] of membranePolys(p, s).v) {
          expect(z).toBeGreaterThanOrEqual(midline);
          expect(y * s).toBeGreaterThanOrEqual(0.18);
        }
      }
    });
  });
});

/** A point of the reference's z-up frame on the sheet's screen (orthographic; world units). */
function toSheet([x, y, z]: Vec3): [number, number] {
  // z-up → three y-up: (x, y, z) → (x, z, −y); then the cell's yaw about +y; then the camera,
  // which looks down SHEET_ELEVATION from +z.
  const tx = x, ty = z, tz = -y;
  const c = Math.cos(SHEET_YAW), s = Math.sin(SHEET_YAW);
  const rx = tx * c + tz * s, rz = -tx * s + tz * c;
  return [rx, ty * Math.cos(SHEET_ELEVATION) - rz * Math.sin(SHEET_ELEVATION)];
}

/** Points along every membrane edge of one wing, and the tail and torso as screen discs. */
function sheetParts(p: Phenotype, side: number) {
  const { g } = fullGraph(p);
  const { v, f } = membranePolys(p, side);
  const samples: Vec3[] = [];
  for (const face of f) {
    for (let k = 0; k < face.length; k++) {
      const a = v[face[k]!]!, b = v[face[(k + 1) % face.length]!]!;
      for (let t = 0; t <= 1; t += 0.125) samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  // The membrane's root is inside the body by design; what must not cross is the part
  // outside it, beyond the torso's widest radius.
  const torsoR = Math.max(...[4, 5, 6, 7].map((n) => g.r[n]!));
  const outside = samples.filter(([, y]) => y * side > torsoR);
  // The tail (nodes 0-3, then the hip, 4) and the torso (4-7), sampled along each segment
  // with their skin radius: on screen a disc of that radius, in an orthographic camera.
  // `free` marks the tail samples behind the hip's own sphere: where the tail has left the body.
  const hipBack = g.v[4]![0] - g.r[4]!;
  const discs: { at: [number, number]; r: number; tail: boolean; free: boolean }[] = [];
  for (let n = 0; n < 7; n++) {
    const a = g.v[n]!, b = g.v[n + 1]!, ra = g.r[n]!, rb = g.r[n + 1]!;
    for (let t = 0; t <= 1; t += 0.1) {
      const q: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      discs.push({ at: toSheet(q), r: ra + (rb - ra) * t, tail: n < 4, free: n < 4 && q[0] < hipBack });
    }
  }
  return { outside, discs };
}

describe('in the sheet camera the far wing does not cross the tail or the belly', () => {
  sheet.forEach((gm, i) => {
    it(`sheet ${'ABCDEFGH'[i]}`, () => {
      // The far wing is the dragon's left (+y): the sheet camera sits on its right.
      const { outside, discs } = sheetParts(gm.phenotype, 1);
      expect(outside.length).toBeGreaterThan(20);
      for (const w of outside) {
        const [X, Y] = toSheet(w);
        for (const d of discs) {
          // Crossing the tail: the wing drawn inside the tail's outline.
          if (d.tail) expect(Math.hypot(X - d.at[0], Y - d.at[1]), 'far wing over the tail').toBeGreaterThan(d.r);
          // Crossing the belly: the wing drawn below the torso's centre line where they meet.
          else if (Math.abs(X - d.at[0]) < d.r) expect(Y, 'far wing below the torso midline').toBeGreaterThan(d.at[1]);
        }
      }
    });
  });
});

describe('in the sheet camera the near wing is not drawn across the tail (M3e cycle 1, A5)', () => {
  sheet.forEach((gm, i) => {
    it(`sheet ${'ABCDEFGH'[i]}`, () => {
      const { outside, discs } = sheetParts(gm.phenotype, -1);
      expect(outside.length).toBeGreaterThan(20);
      let worst = Infinity;
      for (const w of outside) {
        const [X, Y] = toSheet(w);
        // The near wing grows from the flank in front of the hip, so it may overlap the hip
        // itself; it must not be drawn over the tail once the tail has left the body.
        for (const d of discs) if (d.free) worst = Math.min(worst, Math.hypot(X - d.at[0], Y - d.at[1]) - d.r);
      }
      expect(worst, 'near wing over the tail: screen gap to the tail outline').toBeGreaterThan(0);
    });
  });
});
