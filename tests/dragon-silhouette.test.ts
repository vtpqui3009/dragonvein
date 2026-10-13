/**
 * tools/silhouette.mjs, the outline numbers M3f is judged by (M3e criterion 4), on masks
 * whose answers are known by hand. An instrument nobody has seen give a known answer is not
 * a measurement.
 */
import { describe, expect, it } from 'vitest';
import { alignedIoU, frameIoU, geneDiffs, maskFromRgb, maskStats, silhouetteReport, sweepBase, sweepReport, sweepValues } from '../tools/silhouette.mjs';

type Mask = { w: number; h: number; on: Uint8Array };
/** A w×h mask with the given rectangles switched on ([x0, y0, x1, y1), exclusive). */
function rects(w: number, h: number, ...rs: [number, number, number, number][]): Mask {
  const on = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rs) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) on[y * w + x] = 1;
  return { w, h, on };
}

describe('silhouette instrument', () => {
  it('thresholds RGB on its brightest channel', () => {
    const px = new Uint8Array([0, 0, 0, 255, 255, 255, 0, 200, 0, 90, 90, 90]);
    expect([...maskFromRgb({ w: 4, h: 1, px }).on]).toEqual([0, 1, 1, 0]);
  });

  it('measures area and the bounding box', () => {
    const s = maskStats(rects(20, 10, [2, 3, 6, 5], [10, 4, 12, 9]));
    expect(s).toMatchObject({ area: 8 + 10, x0: 2, x1: 12, y0: 3, y1: 9, width: 10, height: 6 });
    expect(maskStats(rects(5, 5)).area).toBe(0);
  });

  it('IoU ignores where on the sheet a dragon stands: aligned on box centre and base', () => {
    const a = rects(40, 30, [2, 2, 8, 10]);
    const b = rects(40, 30, [25, 15, 31, 23]); // the same 6×8 block, elsewhere
    expect(alignedIoU(a, maskStats(a), b, maskStats(b))).toBe(1);
  });

  it('IoU of a block against its own lower half is 1/2, both standing on one base', () => {
    const a = rects(40, 30, [5, 5, 15, 15]);
    const b = rects(40, 30, [20, 20, 30, 25]);
    expect(alignedIoU(a, maskStats(a), b, maskStats(b))).toBe(0.5);
  });

  it('names the genes that differ: ints and enums when unequal, floats by range, hue on the short arc', () => {
    const genes = { n: [2, 4, 'i'], e: [0, 3, 'e'], f: [0, 2, 'f'], h: [0, 1, 'c'] } as const;
    const d = geneDiffs({ n: 2, e: 1, f: 0.1, h: 0.02 }, { n: 2, e: 3, f: 0.5, h: 0.97 }, genes);
    expect(d.map((x) => x.gene)).toEqual(['e', 'f']); // f is 20 % of range; hue only 5 % apart
  });

  it('reports every pair once, with a summary', () => {
    const masks = [rects(30, 30, [0, 0, 10, 10]), rects(30, 30, [0, 0, 10, 10]), rects(30, 30, [0, 0, 20, 5])];
    const sheet = ['A', 'B', 'C'].map((label) => ({ label, gid: label, phenotype: { x: 1 } }));
    const r = silhouetteReport(masks, sheet, { x: [0, 1, 'f'] }, 10);
    expect(r.pairs.map((p: { a: string; b: string }) => p.a + p.b)).toEqual(['AB', 'AC', 'BC']);
    expect(r.summary.maxIoU).toBe(1);
    expect(r.dragons[0]).toMatchObject({ area: 1, width: 1, height: 1 });
  });

  it('frame IoU does not align: the same block moved is a different outline', () => {
    const a = rects(40, 30, [5, 5, 15, 15]);
    expect(frameIoU(a, a)).toBe(1);
    expect(frameIoU(a, rects(40, 30, [10, 5, 20, 15]))).toBe(50 / 150);
    expect(frameIoU(rects(4, 4), rects(4, 4))).toBe(0);
  });

  it('the sweep base is mid-range, ints rounded, enums at their first value; a sweep is low, mid, high', () => {
    const genes = { f: [0.5, 1.5, 'f'], n: [0, 6, 'i'], e: [0, 3, 'e'] } as const;
    expect(sweepBase(genes)).toEqual({ f: 1, n: 3, e: 0 });
    expect(sweepValues(genes, 'f')).toEqual([0.5, 1, 1.5]);
    expect(sweepValues(genes, 'e')).toEqual([0, 2, 3]);
  });

  it('the sweep report judges low against high, aligned for the body and in place for the head', () => {
    const base = rects(40, 30, [5, 5, 15, 15]);
    const moved = rects(40, 30, [20, 5, 30, 15]); // the same block elsewhere
    const half = rects(40, 30, [20, 10, 30, 15]);
    const r = sweepReport([
      { gene: 'body', crop: 'body', base, samples: [base, base, moved].map((mask, i) => ({ value: i, mask })) },
      { gene: 'bodyHalf', crop: 'body', base, samples: [base, base, half].map((mask, i) => ({ value: i, mask })) },
      { gene: 'head', crop: 'head', base, samples: [base, base, moved].map((mask, i) => ({ value: i, mask })) },
    ], { body: 10, head: 10 });
    expect(r.summary.lowVsHigh).toEqual({ body: 1, bodyHalf: 0.5, head: 0 });
    expect(r.summary.failing).toEqual(['body']);
    expect(r.genes[0]!.low).toMatchObject({ area: 1, width: 1, height: 1, iouVsBase: 1 });
  });
});
