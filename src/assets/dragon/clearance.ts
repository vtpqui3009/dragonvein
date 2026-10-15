/**
 * The body's swept tubes as a solid, and how far a point is outside it (M7c). No three.js,
 * so the worker can use it at bake time (./rig.ts, the wing's junction falloff) and the
 * viewer when it measures a flap (src/render/flight-probe.ts).
 *
 * A tube is its sampled stations (./skin.ts `tubeStations`): centres and radii along the
 * path, the same circles the skin's rings lie on. Two consecutive stations bound a round
 * cone (the convex hull of their two spheres), and the tube is the union of those cones; its
 * end caps are the end stations' hemispheres, which the cones already contain. The skin's
 * rings are polygons inscribed in the circles, so the mesh lies on or inside this solid:
 * a point outside the solid is outside the mesh.
 *
 * `distance(x, y, z)` is the signed distance to the union: negative inside. Each cone keeps
 * a bounding sphere, and each run of CHUNK cones along a tube one round those, so a query
 * skips every chunk, then every cone, that cannot beat the best so far. Centres can be moved
 * (`centre`, then `refresh()`), so a posed body is measured as posed.
 */
/** Cones per bounding chunk. */
const CHUNK = 8;

export class TubeField {
  /** Station centres, 3 per station, and radii. Moving a centre needs `refresh()`. */
  readonly centre: Float64Array;
  readonly radius: Float64Array;
  /** Cones: the two stations each joins. */
  private readonly ia: Int32Array;
  private readonly ib: Int32Array;
  /** Per cone: bounding sphere (centre, radius). */
  private readonly bs: Float64Array;
  /** Chunks: their first cone and one past the last, and a bounding sphere round their cones' spheres. */
  private readonly c0: Int32Array;
  private readonly c1: Int32Array;
  private readonly cs: Float64Array;

  /** `tubes`: per tube, its stations' centres (x, y, z) and radii, in order along it. */
  constructor(tubes: readonly { c: readonly (readonly number[])[]; r: readonly number[] }[]) {
    let n = 0, m = 0;
    for (const t of tubes) { n += t.r.length; m += Math.max(0, t.r.length - 1); }
    this.centre = new Float64Array(3 * n);
    this.radius = new Float64Array(n);
    this.ia = new Int32Array(m);
    this.ib = new Int32Array(m);
    this.bs = new Float64Array(4 * m);
    const c0: number[] = [], c1: number[] = [];
    let s = 0, k = 0;
    for (const t of tubes) {
      const first = k;
      for (let i = 0; i < t.r.length; i++) {
        const c = t.c[i]!;
        this.centre[3 * (s + i)] = c[0]!; this.centre[3 * (s + i) + 1] = c[1]!; this.centre[3 * (s + i) + 2] = c[2]!;
        this.radius[s + i] = t.r[i]!;
        if (i > 0) { this.ia[k] = s + i - 1; this.ib[k] = s + i; k++; }
      }
      for (let j = first; j < k; j += CHUNK) { c0.push(j); c1.push(Math.min(k, j + CHUNK)); }
      s += t.r.length;
    }
    this.c0 = Int32Array.from(c0);
    this.c1 = Int32Array.from(c1);
    this.cs = new Float64Array(4 * c0.length);
    this.refresh();
  }

  /** How many stations. */
  get stations(): number { return this.radius.length; }

  /** Recompute the cones' bounding spheres after centres moved. */
  refresh(): void {
    const C = this.centre, R = this.radius;
    for (let k = 0; k < this.ia.length; k++) {
      const a = this.ia[k]!, b = this.ib[k]!;
      const dx = C[3 * b]! - C[3 * a]!, dy = C[3 * b + 1]! - C[3 * a + 1]!, dz = C[3 * b + 2]! - C[3 * a + 2]!;
      this.bs[4 * k] = (C[3 * a]! + C[3 * b]!) / 2;
      this.bs[4 * k + 1] = (C[3 * a + 1]! + C[3 * b + 1]!) / 2;
      this.bs[4 * k + 2] = (C[3 * a + 2]! + C[3 * b + 2]!) / 2;
      this.bs[4 * k + 3] = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2 + Math.max(R[a]!, R[b]!);
    }
    const B = this.bs, S = this.cs;
    for (let h = 0; h < this.c0.length; h++) {
      const from = this.c0[h]!, to = this.c1[h]!;
      let x = 0, y = 0, z = 0;
      for (let k = from; k < to; k++) { x += B[4 * k]!; y += B[4 * k + 1]!; z += B[4 * k + 2]!; }
      x /= to - from; y /= to - from; z /= to - from;
      let r = 0;
      for (let k = from; k < to; k++) {
        const ex = B[4 * k]! - x, ey = B[4 * k + 1]! - y, ez = B[4 * k + 2]! - z;
        r = Math.max(r, Math.sqrt(ex * ex + ey * ey + ez * ez) + B[4 * k + 3]!);
      }
      S[4 * h] = x; S[4 * h + 1] = y; S[4 * h + 2] = z; S[4 * h + 3] = r;
    }
  }

  /**
   * Signed distance from (x, y, z) to the solid, negative inside. Cones further than `cap`
   * are not resolved: the answer is then `cap` or more (pass Infinity for the exact value).
   */
  distance(x: number, y: number, z: number, cap = Infinity): number {
    let best = cap;
    const C = this.centre, R = this.radius, B = this.bs, S = this.cs;
    for (let h = 0; h < this.c0.length; h++) {
      const hx = x - S[4 * h]!, hy = y - S[4 * h + 1]!, hz = z - S[4 * h + 2]!;
      if (Math.sqrt(hx * hx + hy * hy + hz * hz) - S[4 * h + 3]! >= best) continue;
      for (let k = this.c0[h]!, end = this.c1[h]!; k < end; k++) {
        const ex = x - B[4 * k]!, ey = y - B[4 * k + 1]!, ez = z - B[4 * k + 2]!;
        const lower = Math.sqrt(ex * ex + ey * ey + ez * ez) - B[4 * k + 3]!;
        if (lower >= best) continue;
        const a = this.ia[k]!, b = this.ib[k]!;
        const d = roundCone(x, y, z, C[3 * a]!, C[3 * a + 1]!, C[3 * a + 2]!, C[3 * b]!, C[3 * b + 1]!, C[3 * b + 2]!, R[a]!, R[b]!);
        if (d < best) best = d;
      }
    }
    return best;
  }
}

/**
 * Signed distance from p to the round cone joining spheres (a, ra) and (b, rb): the convex
 * hull of the two (Quílez's exact form). Where one sphere holds the other, the bigger sphere.
 */
export function roundCone(
  px: number, py: number, pz: number, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, ra: number, rb: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  if (a2 <= 1e-12) {
    // One sphere inside the other: the solid is the bigger one.
    if (ra >= rb) return Math.sqrt(pax * pax + pay * pay + paz * paz) - ra;
    const qx = px - bx, qy = py - by, qz = pz - bz;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) - rb;
  }
  const il2 = 1 / l2;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const wx = pax * l2 - bax * y, wy = pay * l2 - bay * y, wz = paz * l2 - baz * y;
  const x2 = wx * wx + wy * wy + wz * wz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
