/**
 * Outline numbers for the dragon sheet (M3e criterion 4): the instrument M3f is judged by.
 *
 * Input is one flat-colour mask per dragon, rendered at the sheet camera by
 * `dragon.html?mask=1` (tools/dragon-sheet.mjs drives it): white dragon, black everything
 * else. From each mask:
 *
 *   - area, width and height of the silhouette, in pixels and in world units (the sheet is
 *     orthographic, so one pixel is the same size in every cell);
 *   - IoU against every other dragon, after aligning each mask on its own bounding box:
 *     horizontally on the box's centre, vertically on its base (the feet). Position on the
 *     sheet is layout, not shape, so it must not count.
 *
 * And from the genomes: which genes differ between each pair, so a pair whose outlines
 * coincide can be read against what their genes say should separate them.
 *
 * Pure functions, no browser: tests/gate-tools.test.ts runs them on synthetic masks.
 */

/**
 * A mask from RGB pixels: a pixel is in when its brightest channel is over `threshold`.
 * @param {{w:number,h:number,px:Uint8Array}} img
 * @returns {{w:number,h:number,on:Uint8Array}}
 */
export function maskFromRgb(img, threshold = 128) {
  const on = new Uint8Array(img.w * img.h);
  for (let i = 0; i < on.length; i++) {
    const r = img.px[i * 3], g = img.px[i * 3 + 1], b = img.px[i * 3 + 2];
    on[i] = Math.max(r, g, b) > threshold ? 1 : 0;
  }
  return { w: img.w, h: img.h, on };
}

/**
 * Area and bounding box of a mask. `x1`/`y1` are exclusive.
 * @param {{w:number,h:number,on:Uint8Array}} m
 */
export function maskStats(m) {
  let area = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.on[y * m.w + x]) continue;
      area++;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y >= y1) y1 = y + 1;
    }
  }
  if (!area) return { area: 0, x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0 };
  return { area, x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
}

/**
 * Intersection over union of two masks, each aligned on its own bounding box: centre in x,
 * base in y. The offset between the two is rounded to whole pixels.
 */
export function alignedIoU(a, sa, b, sb) {
  if (!sa.area || !sb.area) return 0;
  // b's pixel (x, y) lands on a's frame at (x + dx, y + dy).
  const dx = Math.round((sa.x0 + sa.x1) / 2 - (sb.x0 + sb.x1) / 2);
  const dy = sa.y1 - sb.y1;
  let inter = 0;
  for (let y = sb.y0; y < sb.y1; y++) {
    const ya = y + dy;
    if (ya < 0 || ya >= a.h) continue;
    for (let x = sb.x0; x < sb.x1; x++) {
      if (!b.on[y * b.w + x]) continue;
      const xa = x + dx;
      if (xa >= 0 && xa < a.w && a.on[ya * a.w + xa]) inter++;
    }
  }
  return inter / (sa.area + sb.area - inter);
}

/**
 * Genes that differ between two phenotypes. Integer and enum genes differ when unequal;
 * continuous genes when apart by at least `frac` of their range (hue on the short arc).
 * @param {Record<string, number>} pa
 * @param {Record<string, number>} pb
 * @param {Record<string, readonly [number, number, string]>} genes name -> [lo, hi, kind]
 * @returns {{gene:string, a:number, b:number, frac:number}[]} by the size of the gap, largest first
 */
export function geneDiffs(pa, pb, genes, frac = 0.1) {
  const out = [];
  for (const [name, [lo, hi, kind]] of Object.entries(genes)) {
    const a = pa[name], b = pb[name];
    let d;
    if (kind === 'i' || kind === 'e') {
      if (a === b) continue;
      d = Math.abs(a - b) / (hi - lo);
    } else if (kind === 'c') {
      const r = Math.abs(a - b) % 1;
      d = Math.min(r, 1 - r);
      if (d < frac) continue;
    } else {
      d = Math.abs(a - b) / (hi - lo);
      if (d < frac) continue;
    }
    out.push({ gene: name, a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000, frac: Math.round(d * 1000) / 1000 });
  }
  return out.sort((x, y) => y.frac - x.frac);
}

/**
 * The whole report from masks and the sheet description.
 * @param {{w:number,h:number,on:Uint8Array}[]} masks one per sheet cell, in sheet order
 * @param {{label:string,gid:string,phenotype:Record<string,number>,wingForm?:string}[]} sheet
 * @param {Record<string, readonly [number, number, string]>} genes
 * @param {number} pxPerUnit pixels per world unit at the sheet camera
 */
export function silhouetteReport(masks, sheet, genes, pxPerUnit) {
  const stats = masks.map(maskStats);
  const r2 = (x) => Math.round(x * 100) / 100;
  const dragons = sheet.map((d, i) => ({
    label: d.label, gid: d.gid, ...(d.wingForm ? { wingForm: d.wingForm } : {}),
    areaPx: stats[i].area, widthPx: stats[i].width, heightPx: stats[i].height,
    area: r2(stats[i].area / pxPerUnit ** 2), width: r2(stats[i].width / pxPerUnit), height: r2(stats[i].height / pxPerUnit),
  }));
  const pairs = [];
  for (let i = 0; i < masks.length; i++) {
    for (let j = i + 1; j < masks.length; j++) {
      const iou = alignedIoU(masks[i], stats[i], masks[j], stats[j]);
      const diffs = geneDiffs(sheet[i].phenotype, sheet[j].phenotype, genes);
      pairs.push({
        a: sheet[i].label, b: sheet[j].label, iou: Math.round(iou * 1000) / 1000,
        genesDiffering: diffs.length, genes: diffs,
      });
    }
  }
  const ious = pairs.map((p) => p.iou);
  const range = (k) => ({ min: Math.min(...dragons.map((d) => d[k])), max: Math.max(...dragons.map((d) => d[k])) });
  const mostAlike = [...pairs].sort((x, y) => y.iou - x.iou)[0];
  return {
    summary: {
      dragons: dragons.length, pairs: pairs.length,
      meanIoU: Math.round((ious.reduce((s, x) => s + x, 0) / ious.length) * 1000) / 1000,
      minIoU: Math.min(...ious), maxIoU: Math.max(...ious),
      mostAlike: mostAlike ? `${mostAlike.a}-${mostAlike.b}` : null,
      area: range('area'), width: range('width'), height: range('height'),
    },
    dragons, pairs,
  };
}
