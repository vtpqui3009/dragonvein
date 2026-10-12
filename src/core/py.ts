/**
 * Python's arithmetic, where it differs from JavaScript's — for `genome.ts`.
 *
 * `assetgen/genome.py` is the reference (docs/GENOME.md), so wherever Python and JS
 * disagree on the same expression, this file reproduces what Python does, bit for bit.
 * Each function names the Python operation it stands for. They are checked against
 * Python-written vectors in `docs/fixtures/genomes.json` (`edge`), via tests/genome.test.ts.
 *
 * Imports nothing (src/core).
 */

/** Python `round(x)` for a float: round half to EVEN, returning an integer (never -0). */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f; // exact for |x| < 2^52, which covers every gene
  let r: number;
  if (diff < 0.5) r = f;
  else if (diff > 0.5) r = f + 1;
  else r = f % 2 === 0 ? f : f + 1;
  return r === 0 ? 0 : r;
}

/** Python `x % 1.0`: floor-mod, so the result takes the divisor's sign; a zero is +0. */
export function pyMod1(x: number): number {
  let m = x % 1;
  if (m !== 0 && m < 0) m += 1;
  return m === 0 ? 0 : m;
}

/** Python `max(a, b)`: the first argument unless the second is strictly greater. */
export function pyMax(a: number, b: number): number {
  return b > a ? b : a;
}

/** Python `min(a, b)`: the first argument unless the second is strictly smaller. */
export function pyMin(a: number, b: number): number {
  return b < a ? b : a;
}

/**
 * Python `round(x, 5)` for a float. Python rounds the exact binary value to 5 decimal
 * places (half to even on an exact tie), then converts that decimal back to the nearest
 * double. `toFixed` rounds ties away from zero and is not the same: Python gives
 * round(0.015625, 5) == 0.01562, toFixed gives "0.01563". So: exact BigInt arithmetic.
 */
export function pyRound5(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp: number;
  if (expBits === 0) exp = -1074; // subnormal
  else { mant |= 1n << 52n; exp = expBits - 1075; }
  // |x| = mant * 2^exp exactly. q = round(|x| * 10^5), half to even.
  const scaled = mant * 100000n;
  let q: bigint;
  if (exp >= 0) q = scaled << BigInt(exp);
  else {
    const den = 1n << BigInt(-exp);
    q = scaled / den;
    const twice = (scaled % den) * 2n;
    if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  }
  const v = Number.parseFloat(`${q.toString()}e-5`); // correctly rounded, like strtod
  return negative ? -v : v;
}

/**
 * Python `repr(float)` — the text `json.dumps` writes for a float. The digits are the
 * shortest round-trip digits in both languages; only the layout differs. Python uses
 * scientific notation when the decimal exponent is < -4 or >= 16, always keeps a ".0" on
 * an integral value, and pads the exponent to two digits: 1.0, 1e-05, 1e+16, -0.0.
 */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const sign = x < 0 ? '-' : '';
  const [mantissa = '', expText = '0'] = Math.abs(x).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exp = Number(expText);
  if (exp < -4 || exp >= 16) {
    const frac = digits.length > 1 ? `.${digits.slice(1)}` : '';
    const e = Math.abs(exp).toString().padStart(2, '0');
    return `${sign}${digits[0]}${frac}e${exp < 0 ? '-' : '+'}${e}`;
  }
  const point = exp + 1; // digits before the decimal point
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}.0`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
