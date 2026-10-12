/**
 * src/core/genome.ts against the Python reference (M2b, docs/GENOME.md, CLAUDE.md §1.5).
 *
 * docs/fixtures/genomes.json is written by assetgen/genome_vectors.py from genome.py:
 * 32 genomes, each with the recipe that made it (wild or bred, and the seed) and
 * everything the reference computed. The port rebuilds each from its recipe and must
 * match every allele, phenotype value, rarity and id exactly — `Object.is`, so a signed
 * zero or a last-ulp difference fails. `npm run gate:parity` runs this file.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENES, GENE_NAMES, Genome, breed, circMean, wild, type Element } from '../src/core/genome';
import { pyFloatRepr, pyMax, pyMin, pyMod1, pyRound, pyRound5 } from '../src/core/py';
import { sha1Hex } from '../src/core/sha1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel));

type Recipe =
  | { op: 'wild'; seed: number; element: Element | null }
  | { op: 'breed'; a: number; b: number; seed: number };
interface Record_ {
  recipe: Recipe;
  g: Record<string, [[number, boolean], [number, boolean]]>;
  element: [string, string];
  generation: number;
  lineage: string;
  gid: string;
  phenotype: Record<string, number>;
  rarity: number;
}
interface Fixture {
  genomeSha256: string;
  genes: [string, number, number, string][];
  genomes: Record_[];
  constructed: {
    base: number;
    set: Record<string, [[number, boolean], [number, boolean]]>;
    phenotype: Record<string, number>;
    rarity: number;
    gid: string;
  }[];
  edge: {
    roundHalfEven: [number, number][];
    floorMod1: [number, number][];
    circMean: [number, number, number][];
    clamp: [number, number, number, number][];
    round5Repr: [number, string][];
  };
}
const fx = JSON.parse(read('docs/fixtures/genomes.json').toString('utf8')) as Fixture;

/** Rebuild every genome from its recipe, in order — later ones breed from earlier ones. */
function rebuild(): Genome[] {
  const out: Genome[] = [];
  for (const { recipe: r } of fx.genomes) {
    if (r.op === 'wild') out.push(wild(r.seed, r.element ?? undefined));
    else {
      const a = out[r.a];
      const b = out[r.b];
      if (!a || !b) throw new Error(`recipe refers forward: ${JSON.stringify(r)}`);
      out.push(breed(a, b, r.seed));
    }
  }
  return out;
}

describe('the fixture is current and covers what it claims', () => {
  it('was written from the current genome.py', () => {
    // Fails when genome.py changed after the fixture: run
    // `python3 -I assetgen/genome_vectors.py`, then port whatever moved.
    const sha = createHash('sha256').update(read('assetgen/genome.py')).digest('hex');
    expect(fx.genomeSha256).toBe(sha);
  });

  it('holds 32 genomes: every element wild, four bred generations, hybrids and a fusion', () => {
    expect(fx.genomes).toHaveLength(32);
    const wildEls = new Set(fx.genomes.filter((g) => g.recipe.op === 'wild').map((g) => g.element[0]));
    expect(wildEls.size).toBe(6);
    expect(Math.max(...fx.genomes.map((g) => g.generation))).toBe(4);
    expect(fx.genomes.some((g) => g.element[0] !== g.element[1])).toBe(true);
    const fusion = fx.genomes.some((g) => g.recipe.op === 'breed'
      && ![fx.genomes[g.recipe.a]?.element[0], fx.genomes[g.recipe.b]?.element[0]].includes(g.element[0]));
    expect(fusion).toBe(true);
  });

  it('uses the same gene table, in the same (Rng draw) order', () => {
    expect(fx.genes.map((g) => g[0])).toEqual(GENE_NAMES);
    for (const [k, ...spec] of fx.genes) expect(spec).toEqual([...GENES[k as keyof typeof GENES]]);
  });
});

describe('Python arithmetic where JS differs', () => {
  it('round(): banker\'s rounding, not Math.round', () => {
    for (const [x, want] of fx.edge.roundHalfEven) expect(pyRound(x), `round(${x})`).toBe(want);
  });
  it('% 1.0: floor-mod, with +0 for a zero result', () => {
    for (const [x, want] of fx.edge.floorMod1) expect(Object.is(pyMod1(x), want), `${x} % 1.0`).toBe(true);
  });
  it('circ_mean along the short arc', () => {
    for (const [a, b, want] of fx.edge.circMean) expect(Object.is(circMean(a, b), want), `circ_mean(${a}, ${b})`).toBe(true);
  });
  it('min(max(x, lo), hi) keeps signed zeros the way Python does', () => {
    for (const [x, lo, hi, want] of fx.edge.clamp) {
      expect(Object.is(pyMin(pyMax(x, lo), hi), want), `clamp(${x}, ${lo}, ${hi})`).toBe(true);
    }
  });
  it('json.dumps(round(x, 5)) text, including the exact-tie and repr cases', () => {
    for (const [x, want] of fx.edge.round5Repr) {
      const got = Number.isInteger(x) && !String(x).includes('.') && want === String(x)
        ? String(x) : pyFloatRepr(pyRound5(x));
      expect(got, `json.dumps(round(${x}, 5))`).toBe(want);
    }
  });
  it('SHA-1 matches node:crypto', () => {
    for (const s of ['', 'abc', 'dragonvein', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(200)]) {
      expect(sha1Hex(s)).toBe(createHash('sha1').update(s).digest('hex'));
    }
  });
});

describe('32 genomes rebuilt from their recipes match the reference exactly', () => {
  const built = rebuild();
  fx.genomes.forEach((want, i) => {
    const got = built[i];
    const label = `#${i} ${want.recipe.op} ${JSON.stringify(want.recipe)} -> ${want.gid}`;
    describe(label, () => {
      it('alleles, element, generation, lineage', () => {
        if (!got) throw new Error('missing');
        const j = got.toJSON();
        for (const k of GENE_NAMES) {
          j.g[k].forEach(([v, d], n) => {
            const [wv, wd] = want.g[k]?.[n] ?? [NaN, false];
            expect(Object.is(v, wv), `${k}[${n}].value ${v} vs ${wv}`).toBe(true);
            expect(d, `${k}[${n}].dominant`).toBe(wd);
          });
        }
        expect(j.element).toEqual(want.element);
        expect(j.generation).toBe(want.generation);
        expect(j.lineage).toBe(want.lineage);
      });
      it('phenotype and rarity', () => {
        if (!got) throw new Error('missing');
        const p = got.phenotype;
        for (const k of GENE_NAMES) {
          expect(Object.is(p[k], want.phenotype[k]), `${k}: ${p[k]} vs ${want.phenotype[k]}`).toBe(true);
        }
        expect(Object.is(got.rarity(), want.rarity), `rarity ${got.rarity()} vs ${want.rarity}`).toBe(true);
      });
      it('gid', () => {
        expect(got?.gid()).toBe(want.gid);
      });
    });
  });
});

describe('hand-set alleles that land expression on exact .5 ties', () => {
  // Random genomes almost never blend to exactly x.5, the only place Python's round() and
  // Math.round() differ. Run 10 put Math.round into express() and all 32 genomes above
  // still passed. These cases are the ones that catch it.
  const built = rebuild();
  fx.constructed.forEach((c, i) => {
    it(`case ${i} on genome #${c.base}: ${Object.keys(c.set).join(', ')}`, () => {
      const base = built[c.base];
      if (!base) throw new Error('missing base');
      const gm = new Genome();
      gm.element = [...base.element];
      gm.generation = base.generation;
      gm.lineage = base.lineage;
      for (const k of GENE_NAMES) {
        const pair = (c.set[k] ?? base.toJSON().g[k]);
        gm.g[k] = [{ value: pair[0][0], dominant: pair[0][1] }, { value: pair[1][0], dominant: pair[1][1] }];
      }
      const p = gm.phenotype;
      for (const k of GENE_NAMES) {
        expect(Object.is(p[k], c.phenotype[k]), `${k}: ${p[k]} vs ${c.phenotype[k]}`).toBe(true);
      }
      expect(Object.is(gm.rarity(), c.rarity)).toBe(true);
      expect(gm.gid()).toBe(c.gid);
    });
  });
});
