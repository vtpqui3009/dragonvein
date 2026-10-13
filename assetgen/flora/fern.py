"""B2 fern — a seeded rosette of arching pinnate fronds (docs/ASSET_PLAN.md §B2, ROADMAP M5d).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Fronds rise from a small, dark, bark-coloured crown sunk at z = 0 and arch outward. Each
frond is one closed thin solid (treekit's `thick_grid`): a short bare stipe, then a blade
whose edge steps in and out once per leaflet, the leaflet tips swept toward the frond tip,
ending in a blunt tip rather than a needle. Across its width the blade is a shallow ridge,
the midrib raised and the leaflets drooping, so the light picks out its spine. The inner
fronds are younger: shorter, steeper and lighter. Some seeds carry fiddleheads, young fronds
still coiled into a crozier, standing in the middle of the rosette.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a low, flat, spreading rosette (~0.25 m tall, ~1.2 m across) of fronds lying out from
the crown; 1 a tall, upright shuttlecock (~1.1 m) of fronds climbing steeply and only
arching at their tips. Size, frond count, blade breadth, the fiddleheads and the arch ride
on their own stratified sequences (plastic, 1/e, sqrt(3) - 1, sqrt(2) - 1, golden**-4).

`plan(seed)` draws everything; `build(seed, lod)` only tessellates.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402  (path must be set first)
from flora import treekit as T  # noqa: E402

# ---------------------------------------------------------------- identity
FAMILY = "flora"
NAME = "fern"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
PALETTE = dict(T.PALETTE)
#: The crown is the bark surface; fronds, stipes and fiddleheads are the canopy ramp.
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `fronds` counts the open fronds; `breadth` is the widest blade over the frond length (a
#: narrow sword fern ... a broad, lacy one); `droop` is how far the frond tips fall below
#: their highest point, over the height (stiff ... a fountain). The fiddlehead count is
#: reported as `curl` but not compared: at sheet scale a crozier is a detail, not a shape.
METRIC_AXES = ["height", "width", "fronds", "breadth", "droop"]
#: Small plants: render_all's tree gap, label band and camera drop scaled down.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 78.0,
         "ground": True, "gap": 0.3, "band": 0.78, "drop": 0.12}

INV_E = 0.36787944117144233          # 1 / e

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified on the golden ratio: 0 low flat spreading rosette "
                       "(~0.25 m) ... 1 tall upright shuttlecock (~1.1 m)"),
    "size": (0.86, 1.18, "multiplier on frond length; stratified on the plastic number"),
    "fronds": (5, 11, "open fronds, stratified on 1/e (5..8 leaflets a side each, fewer "
                      "when there are more fronds)"),
    "breadth": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 narrow sword fronds widest near the "
                          "middle ... 1 broad, deeply cut fronds widest low down"),
    "curl": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.5 none; above, one to three "
                       "fiddleheads (coiled young fronds) in the middle"),
    "length": (0.48, 1.34, "frond length at form 0 ... 1, in metres, before size"),
    "elevation": (16.0, 74.0, "the outer fronds' rise from the crown at form 0 ... 1, "
                              "in degrees"),
    "arch": (0.35, 2.10, "radians a frond turns down from its base to its tip, stratified "
                         "on golden**-4: stiff and straight ... a fountain whose tips droop"),
    "notch": (0.16, 0.32, "blade width in a notch between leaflets, over the leaflet width"),
    "tone": (0.92, 1.08, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole fern as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.02, rng))
    size = _p("size", T.stratify(seed, T.PLASTIC, 0.06, rng))
    nf_t = T.stratify(seed, INV_E, 0.03, rng)
    breadth = _p("breadth", T.stratify(seed, T.SQRT3M1, 0.05, rng))
    curl = _p("curl", T.stratify(seed, T.SQRT2M1, 0.03, rng))
    arch_t = T.stratify(seed, T.PHI_M4, 0.04, rng)
    tone = _p("tone", rng.next())
    arch = _p("arch", arch_t)
    notch = _p("notch", rng.next())

    n = int(round(_p("fronds", nf_t)))
    L = _p("length", form) * size
    e_out = math.radians(_p("elevation", form))
    # a shuttlecock's fronds stay straight longer and arch only near the tip
    arch_pow = T.lerp(1.15, 1.7, form)
    wmax = T.lerp(0.20, 0.38, breadth)                 # blade width over its length
    vm = T.lerp(0.55, 0.30, breadth)                   # where the blade is widest
    stipe = T.lerp(0.10, 0.22, form) * rng.range(0.85, 1.15)
    # leaflets per frond: fewer on a crowded rosette, so the triangle count stays level
    leaflets = max(5, min(8, int(round(42.0 / n)) + rng.int(0, 1)))
    rc = (0.045 + 0.04 * form) * size                  # the crown's radius

    fronds = []
    az = rng.range(0.0, 2.0 * math.pi)
    for i in range(n):
        az += 2.39996 + rng.range(-0.25, 0.25)        # golden-angle phyllotaxis
        young = i / max(1, n - 1)                      # 0 outermost ... 1 innermost
        fr = {"az": az,
              "len": L * T.lerp(1.0, 0.72, young) * rng.range(0.9, 1.08),
              "e0": min(math.radians(80.0), e_out + T.lerp(0.0, 0.32, young)
                        + rng.range(-0.08, 0.08)),
              "turn": arch * T.lerp(1.0, 0.75, young) * rng.range(0.85, 1.15),
              "pow": arch_pow,
              "w": wmax * rng.range(0.9, 1.1), "vm": vm,
              "roll": rng.range(-0.18, 0.18),
              "tone": T.lerp(0.96, 1.10, young) * rng.range(0.96, 1.04),
              "base": (math.cos(az) * rc * 0.45, math.sin(az) * rc * 0.45, rc * 0.30)}
        # a frond's tip never reaches the ground: a flat rosette's fronds get stiffer
        for _ in range(16):
            sp = _spine(fr, 32)
            if min(p[2] for p in sp[len(sp) // 3:]) >= 0.025 + 0.25 * fr["w"] * fr["len"]:
                break
            fr["turn"] *= 0.86
            fr["e0"] = min(math.radians(80.0), fr["e0"] + 0.03)
        fronds.append(fr)

    heads = []
    if curl > 0.5:
        nh = 1 + int((curl - 0.5) * 5.99)
        haz = rng.range(0.0, 2.0 * math.pi)
        for j in range(nh):
            haz += 2.0 * math.pi / nh + rng.range(-0.4, 0.4)
            heads.append({"az": haz, "h": L * rng.range(0.20, 0.34) * T.lerp(0.8, 1.2, form),
                          "R": (0.026 + 0.016 * size) * rng.range(0.85, 1.15),
                          "r": 0.016 + 0.005 * size, "lean": rng.range(0.05, 0.25),
                          "off": rc * rng.range(0.1, 0.35)})

    return {"seed": seed, "form": form, "size": size, "breadth": breadth, "curl": curl,
            "tone": tone, "notch": notch, "stipe": stipe, "leaflets": leaflets, "rc": rc,
            "fronds": fronds, "heads": heads}


def _spine(fr, fine):
    """A frond's midrib: `fine` + 1 points from its base, turning down from e0 by `turn`."""
    az, L = fr["az"], fr["len"]
    pts = [fr["base"]]
    for s in range(fine):
        el = fr["e0"] - fr["turn"] * ((s + 0.5) / fine) ** fr["pow"]
        pts.append(T.add(pts[-1], T.mul(T.from_angles(az, el), L / fine)))
    return pts


FINE = 64


def _at(spine, t):
    """Point and unit tangent of the finely sampled spine at fraction t."""
    x = T.clamp01(t) * (len(spine) - 1)
    k = min(len(spine) - 2, int(x))
    f = x - k
    p = tuple(spine[k][c] + (spine[k + 1][c] - spine[k][c]) * f for c in range(3))
    return p, T.norm(T.sub(spine[k + 1], spine[k]))


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"cols": 3, "leaflets": None, "crown": (8, 5), "head": (5, 3, 7)},
    1: {"cols": 2, "leaflets": 3, "crown": (6, 4), "head": (4, 2, 4)},
    2: {"cols": 2, "leaflets": 0, "crown": (4, 3), "head": None},
}


def _rows(pl, fr, leaflets):
    """(t of the midrib, t of the edge, blade width in metres) per grid row, base to tip.
    Each leaflet is a notch row and a tip row; the tip row's edge is swept toward the tip."""
    L, ts = fr["len"], pl["stipe"]
    wmax, vm = fr["w"] * L, fr["vm"]
    ws = 0.010 + 0.004 * pl["size"]

    def env(v):
        if v < vm:
            s = (v / vm) ** 0.55
        else:
            s = ((1.0 - v) / (1.0 - vm)) ** 0.85 * 0.84 + 0.16    # a blunt tip, no needle
        return max(ws * 1.4, wmax * s)

    rows = [(0.0, 0.0, ws)]
    if leaflets == 0:
        rows.append((ts + (1.0 - ts) * vm, ts + (1.0 - ts) * vm, wmax * 0.8))
        rows.append((1.0, 1.0, env(1.0)))
        return rows
    step = 1.0 / leaflets
    for k in range(leaflets):
        vn = k * step
        vt = (k + 0.50) * step
        rows.append((ts + (1.0 - ts) * vn, ts + (1.0 - ts) * vn,
                     max(ws, env(vn) * pl["notch"]) if k else ws * 1.2))
        sweep = 0.36 * step            # the tip stays behind the next notch: no fold
        rows.append((ts + (1.0 - ts) * vt, ts + (1.0 - ts) * min(1.0, vt + sweep), env(vt)))
    rows.append((1.0, 1.0, env(1.0)))
    return rows


def _frond(mesh, pl, fr, cols, leaflets):
    spine = _spine(fr, FINE)
    az = fr["az"]
    side0 = (-math.sin(az), math.cos(az), 0.0)
    pts, nrm, thick, ct, cb = [], [], [], [], []
    rows = _rows(pl, fr, leaflets)
    zt = max(p[2] for p in spine)
    for (tm, te, w) in rows:
        pm, d = _at(spine, tm)
        pe, _ = _at(spine, te)
        # the blade plane rolls a little about the midrib: fronds catch the light differently
        up0 = T.norm(T.cross(side0, d))
        if up0[2] < 0.0:
            up0 = T.mul(up0, -1.0)
        cr, sr = math.cos(fr["roll"]), math.sin(fr["roll"])
        side = T.add(T.mul(side0, cr), T.mul(up0, sr))
        up = T.norm(T.cross(side, d))
        if up[2] < 0.0:
            up = T.mul(up, -1.0)
        hw = 0.5 * w
        row = []
        for j in range(cols):
            a = -1.0 + 2.0 * j / (cols - 1)
            base = pm if cols == 3 and j == 1 else pe
            q = T.add(base, T.mul(side, a * hw))
            ridge = 0.22 * hw if cols == 3 else 0.0
            q = T.add(q, T.mul(up, ridge * (1.0 - abs(a)) - 0.18 * hw * abs(a)))
            row.append(q)
        pts.append(row)
        nrm.append([up] * cols)
        thick.append([0.005 + 0.004 * (1.0 - tm)] * cols)
        zf = T.clamp01(pm[2] / max(1e-6, zt))
        top = []
        for j in range(cols):
            a = abs(-1.0 + 2.0 * j / (cols - 1))
            tt = (0.18 + 0.42 * tm + 0.16 * zf + 0.10 * (1.0 - a)) if tm > pl["stipe"] * 0.9 \
                else 0.12 + 0.3 * tm
            top.append(T.foliage(T.clamp01(tt * pl["tone"] * fr["tone"])))
        ct.append(top)
        cb.append([T.foliage(T.clamp01((0.06 + 0.16 * tm) * pl["tone"]))] * cols)
    T.thick_grid(mesh, pts, nrm, thick, ct, cb)


def _crown(mesh, pl, seg, rings):
    """The rhizome crown: a dark, squat, lumpy knob, sunk so it sits in the ground."""
    rc = pl["rc"]

    def place(d):
        m = 1.0 + 0.12 * math.cos(3.0 * math.atan2(d[1], d[0]) + d[2] * 2.0)
        p = (d[0] * rc * m, d[1] * rc * m, rc * 0.15 + d[2] * rc * 0.62 * m)
        return p, T.bark_shade(0.85 + 0.30 * (0.5 + 0.5 * d[2]))
    T.blob(mesh, seg, rings, place)


def _head(mesh, hd, sides, stalk_n, coil_n):
    """A fiddlehead: a stalk rising from the crown that rolls outward into a crozier coil.
    The coil tightens to a third of its radius, and the tube stays thick to its blunt end."""
    o = (math.cos(hd["az"]), math.sin(hd["az"]), 0.0)
    b = (o[0] * hd["off"], o[1] * hd["off"], 0.0)
    top = (b[0] + o[0] * hd["lean"] * hd["h"], b[1] + o[1] * hd["lean"] * hd["h"], hd["h"])
    path = []
    for k in range(stalk_n):
        u = k / stalk_n
        path.append((T.lerp(b[0], top[0], u * u), T.lerp(b[1], top[1], u * u),
                     T.lerp(-0.01, top[2], u)))
    R0 = hd["R"]
    cc = T.add(top, T.mul(o, R0))
    for k in range(coil_n + 1):
        u = k / coil_n
        phi = math.pi - u * 2.0 * math.pi * 1.05
        R = R0 * (1.0 - 0.66 * u)
        path.append(T.add(cc, T.add(T.mul(o, R * math.cos(phi)), (0.0, 0.0, R * math.sin(phi)))))
    m = len(path)
    radii = [hd["r"] * T.lerp(1.0, 0.70, k / (m - 1)) for k in range(m)]
    T.tube(mesh, path, radii, sides,
           lambda u, mm: T.foliage(T.clamp01(0.30 + 0.45 * u)))


def build(seed, lod=0, params=None):
    """Build one fern. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides plan
    entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    _crown(mesh, pl, *cfg["crown"])
    leaflets = pl["leaflets"] if cfg["leaflets"] is None else cfg["leaflets"]
    for fr in pl["fronds"]:
        _frond(mesh, pl, fr, cfg["cols"], leaflets)
    if cfg["head"]:
        sides, sn, cn = cfg["head"]
        for hd in pl["heads"]:
            _head(mesh, hd, sides, sn, cn)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    top, reach, drops = pl["rc"], pl["rc"], []
    for fr in pl["fronds"]:
        sp = _spine(fr, FINE)
        hw = 0.5 * fr["w"] * fr["len"]
        drops.append(max(p[2] for p in sp) - sp[-1][2])
        top = max(top, max(p[2] for p in sp) + 0.2 * hw)
        reach = max(reach, max(math.hypot(p[0], p[1]) for p in sp) + 0.5 * hw)
    for hd in pl["heads"]:
        top = max(top, hd["h"] + 2.0 * hd["R"])
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.7 * reach, 3),
        "fronds": len(pl["fronds"]),
        "breadth": round(sum(fr["w"] for fr in pl["fronds"]) / len(pl["fronds"]), 4),
        "droop": round(sum(drops) / len(drops) / top, 4),
        "curl": len(pl["heads"]),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
