/**
 * The genome: what a dragon is. The runtime port of `assetgen/genome.py`.
 *
 * docs/GENOME.md is the contract and genome.py the reference. This file must agree with
 * the reference on every allele, phenotype value, rarity and id — `npm run gate:parity`
 * checks 32 fixed genomes (docs/fixtures/genomes.json, written by
 * assetgen/genome_vectors.py) for exact equality. The rules for staying exact:
 *
 *   - Same Rng (./rng), and the Rng is drawn in the same order as the Python. `wild` draws
 *     range, range, chance, chance per gene in table order; `breed` draws per gene the two
 *     parent picks, then for each allele mutate? / delta / flip?, then the element picks.
 *   - Same float expressions in the same order, e.g. `value + range * span * SPREAD`
 *     is `(range * span) * SPREAD` in both languages.
 *   - Python's semantics where JS differs (./py): banker's `round`, floor-mod `%`,
 *     tie-keeping `min`/`max`, `round(x, 5)` and the float repr `json.dumps` writes.
 *
 * The gene table's insertion order is the iteration order in both languages, and it is
 * the Rng draw order, so it must never be re-sorted.
 */
import { Rng } from './rng';
import { pyFloatRepr, pyMax, pyMin, pyMod1, pyRound, pyRound5 } from './py';
import { sha1Hex } from './sha1';

export type GeneKind = 'f' | 'i' | 'e' | 'c';

/** name -> [lo, hi, kind]. Order matters: it is the Rng draw order. */
export const GENES = {
  bodyMass: [0.7, 1.45, 'f'],
  bodyLength: [0.8, 1.35, 'f'],
  chestDepth: [0.8, 1.3, 'f'],
  neckLength: [0.6, 1.7, 'f'],
  neckArc: [0.0, 1.0, 'f'],
  headSize: [0.78, 1.4, 'f'],
  snoutLength: [0.45, 1.6, 'f'],
  jawWidth: [0.75, 1.3, 'f'],
  tailLength: [0.6, 1.8, 'f'],
  tailTaper: [0.5, 1.3, 'f'],
  tailTip: [0, 3, 'e'],
  legLength: [0.7, 1.4, 'f'],
  legThickness: [0.7, 1.5, 'f'],
  toeCount: [3, 5, 'i'],
  wingSpan: [0.55, 1.65, 'f'],
  wingFingers: [2, 4, 'i'],
  wingShape: [0.0, 1.0, 'f'],
  wingDroop: [0.0, 1.0, 'f'],
  hornCount: [0, 6, 'i'],
  hornLength: [0.5, 1.8, 'f'],
  hornCurve: [0.0, 1.0, 'f'],
  crestType: [0, 3, 'e'],
  spineCount: [4, 14, 'i'],
  spineHeight: [0.4, 1.6, 'f'],
  hue: [0.0, 1.0, 'c'],
  hueShift: [-0.22, 0.22, 'f'],
  saturation: [0.35, 1.0, 'f'],
  value: [0.28, 0.92, 'f'],
  pattern: [0, 4, 'e'],
  glow: [0.0, 1.0, 'f'],
} as const satisfies Record<string, readonly [number, number, GeneKind]>;

export type GeneName = keyof typeof GENES;
export const GENE_NAMES = Object.keys(GENES) as GeneName[];

export const ELEMENTS = ['ember', 'tide', 'stone', 'gale', 'jade', 'umbra'] as const;
export type Element = (typeof ELEMENTS)[number];
export const TAIL_TIPS = ['none', 'fin', 'spade', 'club'] as const;
export const CRESTS = ['none', 'frill', 'fin', 'antler'] as const;
export const PATTERNS = ['plain', 'banded', 'mottled', 'gradient', 'iridescent'] as const;

export const MUTATION_RATE = 0.06;
export const MUTATION_SPREAD = 0.14;

/** Absolute colour targets per element: [hue, saturation, value]. */
const ELEMENT_COLOR: Record<Element, readonly [number, number, number]> = {
  ember: [0.03, 0.9, 0.5],
  tide: [0.555, 0.74, 0.5],
  stone: [0.085, 0.46, 0.38],
  gale: [0.505, 0.26, 0.8],
  jade: [0.35, 0.72, 0.46],
  umbra: [0.76, 0.58, 0.3],
};
const COLOR_SPREAD: Partial<Record<GeneName, number>> = { hue: 0.035, saturation: 0.1, value: 0.09 };

const ELEMENT_BIAS: Record<Element, Partial<Record<GeneName, number>>> = {
  ember: { hornCount: +0.5, spineHeight: +0.4, glow: +0.3 },
  tide: { wingShape: -0.5, neckLength: +0.4, tailLength: +0.5 },
  stone: { bodyMass: +0.6, legThickness: +0.6, wingSpan: -0.4 },
  gale: { wingSpan: +0.6, bodyMass: -0.4, wingShape: +0.5, legLength: +0.3 },
  jade: { crestType: +0.6, hornCurve: +0.4, glow: +0.2 },
  umbra: { wingDroop: +0.5, spineCount: +0.4, pattern: +0.5 },
};

/** Unordered pairs; the key is the two names sorted and joined. */
const FUSIONS: Record<string, Element> = {
  'ember+tide': 'umbra',
  'ember+gale': 'ember',
  'jade+stone': 'jade',
  'gale+tide': 'tide',
  'jade+umbra': 'jade',
  'ember+stone': 'stone',
};
const fusionKey = (a: string, b: string) => [a, b].sort().join('+');

/** Mean of two hues along the short arc of the wheel (docs/GENOME.md §Circular genes). */
export function circMean(a: number, b: number): number {
  const d = pyMod1(b - a + 0.5) - 0.5;
  return pyMod1(a + d * 0.5);
}

const clampGene = (v: number, lo: number, hi: number) => pyMin(pyMax(v, lo), hi);

export interface Allele { value: number; dominant: boolean }
export type Phenotype = Record<GeneName, number>;

export interface GenomeJson {
  g: Record<GeneName, [[number, boolean], [number, boolean]]>;
  element: [string, string];
  generation: number;
  lineage: string;
  gid: string;
}

export class Genome {
  g = {} as Record<GeneName, [Allele, Allele]>;
  element: [Element, Element] = ['ember', 'ember'];
  generation = 0;
  lineage = '';

  express(name: GeneName): number {
    const [a, b] = this.g[name];
    const [lo, hi, kind] = GENES[name];
    let v: number;
    if (a.dominant && !b.dominant) v = a.value;
    else if (b.dominant && !a.dominant) v = b.value;
    else if (kind === 'c') return pyMod1(circMean(a.value, b.value));
    else v = (a.value + b.value) * 0.5; // co-dominant -> blend
    if (kind === 'c') return pyMod1(v);
    v = clampGene(v, lo, hi);
    return kind === 'i' || kind === 'e' ? pyRound(v) : v;
  }

  get phenotype(): Phenotype {
    const p = {} as Phenotype;
    for (const k of GENE_NAMES) p[k] = this.express(k);
    return p;
  }

  get primaryElement(): Element { return this.element[0]; }
  get recessiveElement(): Element { return this.element[1]; }
  get isHybrid(): boolean { return this.element[0] !== this.element[1]; }

  /** 0..1. Extremes and hidden elements are what collectors chase. Derived, never stored. */
  rarity(): number {
    const p = this.phenotype;
    let score = 0.0;
    let continuous = 0;
    for (const k of GENE_NAMES) {
      const [lo, hi, kind] = GENES[k];
      if (kind !== 'f') continue;
      continuous++;
      const t = (p[k] - lo) / (hi - lo);
      score += Math.abs(t - 0.5) * 2;
    }
    score /= continuous;
    if (this.isHybrid) score += 0.18;
    if (p.hornCount >= 5) score += 0.10;
    if (p.wingFingers === 4) score += 0.08;
    if (p.pattern === 4) score += 0.12;
    return pyMin(1.0, score);
  }

  /**
   * sha1(json.dumps({gene: round(value, 5)}, sort_keys=True) + "|".join(element))[:10],
   * reproducing Python's text exactly: ", " and ": " separators, integers bare (the
   * `i`/`e` genes express as Python ints), floats in Python's repr.
   */
  gid(): string {
    const p = this.phenotype;
    const body = [...GENE_NAMES].sort().map((k) => {
      const kind = GENES[k][2];
      const text = kind === 'i' || kind === 'e' ? String(p[k]) : pyFloatRepr(pyRound5(p[k]));
      return `"${k}": ${text}`;
    }).join(', ');
    return sha1Hex(`{${body}}${this.element.join('|')}`).slice(0, 10);
  }

  toJSON(): GenomeJson {
    const g = {} as GenomeJson['g'];
    for (const k of GENE_NAMES) {
      const [a, b] = this.g[k];
      g[k] = [[a.value, a.dominant], [b.value, b.dominant]];
    }
    return { g, element: [...this.element], generation: this.generation, lineage: this.lineage, gid: this.gid() };
  }
}

/** A wild-caught dragon: homozygous-ish, middling stats, element-typical bias. */
export function wild(seed: number, element?: Element): Genome {
  const r = new Rng(seed);
  // Python: `element or r.pick(ELEMENTS)` — a forced element draws nothing.
  const el: Element = element ?? r.pick(ELEMENTS);
  const gm = new Genome();
  gm.element = [el, el];
  gm.generation = 0;
  gm.lineage = 'wild';
  const bias = ELEMENT_BIAS[el];
  const [ch, cs, cv] = ELEMENT_COLOR[el];
  const anchor: Partial<Record<GeneName, number>> = { hue: ch, saturation: cs, value: cv };
  for (const k of GENE_NAMES) {
    const [lo, hi] = GENES[k];
    const mid = (lo + hi) / 2;
    let base: number;
    let spread: number;
    const anchored = anchor[k];
    if (anchored !== undefined) {
      base = anchored;
      spread = COLOR_SPREAD[k] ?? 0;
    } else {
      spread = (hi - lo) * 0.30;
      base = mid + (bias[k] ?? 0.0) * (hi - lo) * 0.5;
    }
    const a = clampGene(base + r.range(-spread, spread), lo, hi);
    const b = clampGene(base + r.range(-spread, spread), lo, hi);
    gm.g[k] = [{ value: a, dominant: r.chance(0.7) }, { value: b, dominant: r.chance(0.7) }];
  }
  return gm;
}

/** Meiosis: one allele from each parent, then mutation. This is the whole game. */
export function breed(a: Genome, b: Genome, seed: number): Genome {
  const r = new Rng(seed);
  const child = new Genome();
  child.generation = Math.max(a.generation, b.generation) + 1;
  child.lineage = `${a.gid()}x${b.gid()}`;
  for (const k of GENE_NAMES) {
    const [lo, hi, kind] = GENES[k];
    const fromA = a.g[k][r.chance(0.5) ? 0 : 1];
    const fromB = b.g[k][r.chance(0.5) ? 0 : 1];
    const pair: [Allele, Allele] = [
      { value: fromA.value, dominant: fromA.dominant },
      { value: fromB.value, dominant: fromB.dominant },
    ];
    for (const al of pair) {
      if (r.chance(MUTATION_RATE)) {
        const nv = al.value + r.range(-1, 1) * (hi - lo) * MUTATION_SPREAD;
        al.value = kind === 'c' ? pyMod1(nv) : clampGene(nv, lo, hi);
      }
      if (r.chance(MUTATION_RATE * 0.5)) al.dominant = !al.dominant;
    }
    child.g[k] = pair;
  }
  const ea = a.element[r.chance(0.5) ? 0 : 1];
  const eb = b.element[r.chance(0.5) ? 0 : 1];
  if (ea === eb) child.element = [ea, eb];
  else if (r.chance(0.08)) {
    child.element = [FUSIONS[fusionKey(ea, eb)] ?? ea, r.chance(0.5) ? ea : eb];
  } else child.element = r.chance(0.5) ? [ea, eb] : [eb, ea];
  return child;
}
