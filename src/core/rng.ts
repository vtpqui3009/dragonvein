/**
 * The seeded RNG: xorshift128, stream-for-stream identical to `assetgen/genome.py` `Rng`.
 *
 * CLAUDE.md §2.1 makes this the only source of randomness for `src/sim/`, and requires it
 * to match the Python reference exactly, because a bred dragon is built twice — by the
 * Python reference builder and by the runtime one — and the two must agree on every
 * gene. `tests/rng.test.ts` checks every value against `tests/fixtures/rng-vectors.json`,
 * which `assetgen/rng_vectors.py` writes from the Python class, with `===`.
 *
 * Where the two languages differ, and what this file does about it:
 *   - Python ints are unbounded; JS bitwise operators work on 32-bit signed ints. Every
 *     state word is therefore kept as an unsigned 32-bit value with `>>> 0`.
 *   - `(s * 0x85EBCA6B) & 0xFFFFFFFF` in Python is exact. In JS a plain `*` of two 32-bit
 *     values can exceed 2^53 and lose the low bits before the mask, so it is `Math.imul`,
 *     which multiplies modulo 2^32.
 *   - `seed & 0xFFFFFFFF` on a negative Python int gives the two's-complement low word;
 *     `seed >>> 0` gives the same for any integer seed below 2^53 in magnitude.
 *   - Floating point is IEEE 754 double in both, and every float expression below is the
 *     same operations in the same order as the Python, so the doubles are identical.
 *
 * Imports nothing: `src/core/` sits under every other layer (docs/ARCHITECTURE.md).
 */

/** The zero-seed fallback, as in Python: `seed & 0xFFFFFFFF or 0x9E3779B9`. */
const ZERO_SEED = 0x9e3779b9;
const TWO_POW_32 = 4294967296;

/**
 * Which stream this class produces. A save records it beside the four state words, because
 * the words only mean something to the algorithm that wrote them. It changes only if the
 * algorithm does — which would also break `assetgen/genome.py` parity, so in practice never.
 */
export const RNG_VERSION = 1;

/** The whole generator: four unsigned 32-bit words. Plain numbers, so it is JSON-able. */
export type RngState = [number, number, number, number];

/** True when `s` is four uint32 words, not all zero (xorshift's one dead state). */
export function isRngState(s: unknown): s is RngState {
  if (!Array.isArray(s) || s.length !== 4) return false;
  let any = 0;
  for (const w of s) {
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w >= TWO_POW_32) return false;
    any |= w;
  }
  return any !== 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** @param seed any integer whose magnitude is below 2^53; only its low 32 bits count. */
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError(`Rng seed must be a safe integer, got ${seed}`);
    }
    const s = (seed >>> 0) || ZERO_SEED;
    this.a = (s ^ 0x6d2b79f5) >>> 0;
    this.b = Math.imul(s, 0x85ebca6b) >>> 0;
    this.c = Math.imul(s, 0xc2b2ae35) >>> 0;
    this.d = (s ^ 0x27d4eb2f) >>> 0;
    for (let i = 0; i < 8; i++) this.next();
  }

  /** A double in [0, 1). */
  next(): number {
    const t = (this.b << 9) >>> 0;
    this.c = (this.c ^ this.a) >>> 0;
    this.d = (this.d ^ this.b) >>> 0;
    this.b = (this.b ^ this.c) >>> 0;
    this.a = (this.a ^ this.d) >>> 0;
    this.c = (this.c ^ t) >>> 0;
    this.d = ((this.d << 11) | (this.d >>> 21)) >>> 0;
    return ((this.a + this.d) >>> 0) / TWO_POW_32;
  }

  /** A double in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** An integer in [lo, hi], inclusive at both ends. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1 - 1e-9));
  }

  /** One element of `xs`, uniformly. */
  pick<T>(xs: readonly T[]): T {
    const v = xs[this.int(0, xs.length - 1)];
    if (v === undefined) throw new RangeError('Rng.pick from an empty list');
    return v;
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** The four state words, for tests and save files. A fresh array each call. */
  state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  /**
   * Continue a stream exactly where `state()` left it: the next draw from the result is the
   * draw the saved generator would have made next. Nothing about seeding is replayed, so the
   * Python reference needs no counterpart — the four words *are* its state too.
   */
  static fromState(s: readonly number[]): Rng {
    const r = new Rng(1);
    r.setState(s);
    return r;
  }

  /** Overwrite this generator's state in place. Throws on anything `isRngState` refuses. */
  setState(s: readonly number[]): this {
    if (!isRngState(s)) throw new RangeError(`Rng state must be four uint32 words, not all zero: ${JSON.stringify(s)}`);
    this.a = s[0];
    this.b = s[1];
    this.c = s[2];
    this.d = s[3];
    return this;
  }

  /** Write the state into `out` without allocating, for a caller that keeps it in place. */
  writeState(out: RngState): RngState {
    out[0] = this.a;
    out[1] = this.b;
    out[2] = this.c;
    out[3] = this.d;
    return out;
  }
}
