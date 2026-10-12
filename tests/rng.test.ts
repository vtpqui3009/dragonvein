/**
 * src/core/rng.ts against the Python reference, value for value (M2a, CLAUDE.md §2.1).
 *
 * The fixture is written by `assetgen/rng_vectors.py` from `assetgen/genome.py` `Rng`.
 * Every comparison is `toBe` — `Object.is` on doubles — not `toBeCloseTo`: "stream for
 * stream" means the same bits, and a last-ulp difference here is a different dragon later.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel));

interface Vector {
  seed: number;
  stateAfterSeeding: [number, number, number, number];
  next: number[];
  calls: (number | boolean | string)[];
}
interface Fixture {
  genomeSha256: string;
  ops: (string | number)[][];
  cycles: number;
  pickFrom: string[];
  vectors: Vector[];
}
const fixture = JSON.parse(read('tests/fixtures/rng-vectors.json').toString('utf8')) as Fixture;

describe('Rng matches assetgen/genome.py stream for stream', () => {
  it('is checked against a fixture written from the current genome.py', () => {
    // If this fails, genome.py changed after the fixture was written. Regenerate it with
    // `python3 -I assetgen/rng_vectors.py`, and if the stream moved, port the change here.
    const sha = createHash('sha256').update(read('assetgen/genome.py')).digest('hex');
    expect(fixture.genomeSha256).toBe(sha);
  });

  it('covers the seeds that exercise the mask and the zero fallback', () => {
    const seeds = fixture.vectors.map((v) => v.seed);
    for (const edge of [0, -1, 2 ** 32, 0xffffffff, 2 ** 40 + 7]) expect(seeds).toContain(edge);
  });

  for (const v of fixture.vectors) {
    describe(`seed ${v.seed}`, () => {
      it('seeds to the same state', () => {
        expect(new Rng(v.seed).state()).toEqual(v.stateAfterSeeding);
      });

      it(`produces the same first ${v.next.length} next() values`, () => {
        const r = new Rng(v.seed);
        const got = v.next.map(() => r.next());
        const first = got.findIndex((x, i) => !Object.is(x, v.next[i]));
        expect(first, `first mismatch at index ${first}`).toBe(-1);
      });

      it(`agrees on ${v.calls.length} interleaved range/int/pick/chance calls`, () => {
        const r = new Rng(v.seed);
        const got: (number | boolean | string)[] = [];
        for (let c = 0; c < fixture.cycles; c++) {
          for (const [op, x, y] of fixture.ops) {
            if (op === 'next') got.push(r.next());
            else if (op === 'range') got.push(r.range(Number(x), Number(y)));
            else if (op === 'int') got.push(r.int(Number(x), Number(y)));
            else if (op === 'chance') got.push(r.chance(Number(x)));
            else got.push(r.pick(fixture.pickFrom));
          }
        }
        const first = got.findIndex((x, i) => !Object.is(x, v.calls[i]));
        expect(first, `first mismatch at call ${first} (${String(got[first])} vs ${String(v.calls[first])})`)
          .toBe(-1);
      });
    });
  }

  it('refuses a seed it cannot represent exactly', () => {
    expect(() => new Rng(2 ** 53)).toThrow(RangeError);
    expect(() => new Rng(1.5)).toThrow(RangeError);
  });
});
