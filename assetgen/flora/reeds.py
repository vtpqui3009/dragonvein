"""B2 reeds — a seeded clump of tall blades and stems (docs/ASSET_PLAN.md §B2, ROADMAP M5d).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Reeds grow from one to three low, dark root mounds (the bark surface, so the clump sits in
the ground with a contact shape rather than on a point). Each mound sends up long, narrow
blades, closed thin solids that rise steeply, bend over a little near the top and end in a
blunt tip a third of their width, never a needle. Among the blades stand round stems
(culms); on some seeds the stems carry cattail heads, dark brown sausages a little below
the stem's top, with a short blunt spike above them. All of it leans with one wind.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a short, dense tuft (~0.6 m) of many splaying blades and almost no stems; 1 a tall,
sparse stand (~2 m) of fewer, straighter blades and up to seven stems. Size, footprint,
wind lean and the cattail heads ride on their own stratified sequences (plastic,
golden**-4, sqrt(3) - 1, sqrt(2) - 1).

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
NAME = "reeds"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
PALETTE = dict(T.PALETTE)
#: The root mounds and cattail heads are the bark surface; blades and stems the canopy ramp.
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `stems` counts the round stems; `heads` the cattail heads (0 on some seeds); `lean` is
#: the tips' mean offset from the base over the height (the wind).
METRIC_AXES = ["height", "width", "stems", "heads", "lean"]
#: Small plants: render_all's tree gap, label band and camera drop scaled down.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 80.0,
         "ground": True, "gap": 0.35, "band": 1.1, "drop": 0.2}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified on the golden ratio: 0 short dense splaying tuft "
                       "(~0.6 m, many blades, almost no stems) ... 1 tall sparse stand (~2 m, "
                       "fewer straighter blades, up to seven stems)"),
    "size": (0.86, 1.16, "multiplier on height; stratified on the plastic number"),
    "spread": (0.0, 1.0, "stratified on golden**-4: 0 one tight tussock ... 1 a stand over "
                         "a wide patch from three root mounds"),
    "wind": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 upright ... 1 every blade and stem "
                       "bent one way, tips 25% of the height downwind"),
    "heads": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.38 bare stems; above, cattail "
                        "heads on a growing share of them"),
    "blades": (11, 27, "blades: 27 at form 0 ... 11 at form 1, +-15%"),
    "bladeWidth": (0.032, 0.052, "blade width at its base, in metres"),
    "tone": (0.92, 1.08, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole clump as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.02, rng))
    size = _p("size", T.stratify(seed, T.PLASTIC, 0.06, rng))
    spread = _p("spread", T.stratify(seed, T.PHI_M4, 0.05, rng))
    wind = _p("wind", T.stratify(seed, T.SQRT3M1, 0.05, rng))
    heads_t = _p("heads", T.stratify(seed, T.SQRT2M1, 0.03, rng))
    tone = _p("tone", rng.next())
    w_az = rng.range(0.0, 2.0 * math.pi)
    bw = _p("bladeWidth", rng.next())

    H = T.lerp(0.62, 1.95, form) * size
    wv = (math.cos(w_az), math.sin(w_az), 0.0)

    # root mounds: one tight tussock, or up to three spread over a patch
    nm = 1 + int(spread * 2.99)
    patch = T.lerp(0.05, 0.42, spread) * T.lerp(0.8, 1.2, form)
    mounds = []
    maz = rng.range(0.0, 2.0 * math.pi)
    for k in range(nm):
        maz += 2.0 * math.pi / nm + rng.range(-0.5, 0.5)
        d = 0.0 if nm == 1 else patch * rng.range(0.6, 1.0)
        mounds.append({"c": (math.cos(maz) * d, math.sin(maz) * d),
                       "r": (0.07 + 0.05 * form) * rng.range(0.85, 1.15) * (1.0 if k == 0
                                                                               else 0.8),
                       "share": 1.0 if k == 0 else rng.range(0.45, 0.8)})
    shares = [m["share"] for m in mounds]

    def pick_mound():
        x = rng.next() * sum(shares)
        for i, s in enumerate(shares):
            x -= s
            if x <= 0.0:
                return i
        return len(shares) - 1

    nb = int(round(_p("blades", 1.0 - form) * rng.range(0.85, 1.15)))
    blades = []
    for i in range(nb):
        m = mounds[pick_mound()]
        az = rng.range(0.0, 2.0 * math.pi)
        rr = m["r"] * rng.range(0.0, 0.7)
        base = (m["c"][0] + math.cos(az) * rr, m["c"][1] + math.sin(az) * rr, -0.02)
        # a tuft splays: low blades lean out and arch over; a tall stand stays upright
        e0 = math.radians(T.lerp(62.0, 82.0, form) + rng.range(-10.0, 8.0))
        bl = {"base": base, "az": az, "e0": e0,
              "turn": T.lerp(0.9, 0.35, form) * rng.range(0.6, 1.3),
              "len": H * rng.range(0.55, 1.0) * T.lerp(1.15, 1.0, form),
              "w": bw * rng.range(0.8, 1.15) * T.lerp(1.0, 1.15, form),
              "roll": rng.range(-0.5, 0.5), "tone": rng.range(0.92, 1.08)}
        for _ in range(12):
            sp = _path(bl, wv, wind, 16)
            if min(p[2] for p in sp[4:]) >= 0.06:
                break
            bl["turn"] *= 0.85
        blades.append(bl)

    ns = int(round(T.lerp(0.0, 6.4, form) + rng.range(0.0, 0.8)))
    nh = 0 if heads_t < 0.38 or ns == 0 else max(1, int(round(ns * T.lerp(0.4, 1.0,
                                                                         (heads_t - 0.38) / 0.62))))
    stems = []
    for i in range(ns):
        m = mounds[pick_mound()]
        az = rng.range(0.0, 2.0 * math.pi)
        rr = m["r"] * rng.range(0.0, 0.5)
        base = (m["c"][0] + math.cos(az) * rr, m["c"][1] + math.sin(az) * rr, -0.02)
        st = {"base": base, "az": az, "e0": math.radians(rng.range(80.0, 89.0)),
              "turn": rng.range(0.0, 0.12), "len": H * rng.range(0.92, 1.06),
              "r": (0.007 + 0.004 * size) * rng.range(0.9, 1.1),
              "head": i < nh,
              "hlen": H * rng.range(0.085, 0.11), "hr": (0.026 + 0.008 * size) *
              rng.range(0.9, 1.1), "hpos": rng.range(0.80, 0.86)}
        stems.append(st)
    return {"seed": seed, "form": form, "size": size, "spread": spread, "wind": wind,
            "wv": wv, "H": H, "tone": tone, "mounds": mounds, "blades": blades,
            "stems": stems, "heads": nh}


def _path(el, wv, wind, fine):
    """A blade's or stem's centre line: `fine` + 1 points from its base, rising at e0,
    turning over by `turn` toward its azimuth, and bent downwind by `wind`."""
    az, L = el["az"], el["len"]
    pts = [el["base"]]
    for s in range(fine):
        u = (s + 0.5) / fine
        d = T.from_angles(az, el["e0"] - el["turn"] * u ** 1.6)
        d = T.norm(T.add(d, T.mul(wv, wind * 0.55 * u ** 1.4)))
        pts.append(T.add(pts[-1], T.mul(d, L / fine)))
    return pts


FINE = 24


def _sample(path, n):
    """`n` points along a finely sampled path, evenly in index."""
    out = []
    for i in range(n):
        x = i / (n - 1) * (len(path) - 1)
        k = min(len(path) - 2, int(x))
        f = x - k
        out.append(tuple(path[k][c] + (path[k + 1][c] - path[k][c]) * f for c in range(3)))
    return out


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"rows": 6, "stem": (5, 5), "head": (6, 6), "mound": (8, 4), "keep": 1},
    1: {"rows": 3, "stem": (4, 2), "head": (5, 4), "mound": (6, 3), "keep": 1},
    2: {"rows": 2, "stem": (3, 2), "head": (3, 3), "mound": (4, 2), "keep": 2},
}


def _blade(mesh, pl, bl, rows, widen):
    path = _path(bl, pl["wv"], pl["wind"], FINE)
    pts_c = _sample(path, rows)
    n_side = (-math.sin(bl["az"]), math.cos(bl["az"]), 0.0)
    pts, nrm, thick, ct, cb = [], [], [], [], []
    H = pl["H"]
    for i, p in enumerate(pts_c):
        t = i / (rows - 1)
        q = pts_c[min(rows - 1, i + 1)] if i < rows - 1 else p
        o = pts_c[max(0, i - 1)]
        d = T.norm(T.sub(q, o))
        side = T.norm(T.sub(n_side, T.mul(d, T.dot(n_side, d))))
        up = T.norm(T.cross(side, d))
        # at most 0.3 rad of roll between two rows: the skins are millimetres apart, and a
        # quad twisted further is non-planar enough for them to cross
        a = max(-0.3, min(0.3, bl["roll"] / (rows - 1))) * (rows - 1) * t
        cr, sr = math.cos(a), math.sin(a)
        side, up = (T.add(T.mul(side, cr), T.mul(up, sr)),
                    T.add(T.mul(up, cr), T.mul(side, -sr)))
        w = bl["w"] * widen * (0.75 + 0.25 * math.sin(math.pi * min(1.0, t * 3.0) * 0.5)) \
            * (1.0 - 0.68 * t ** 1.6)                   # a blunt tip, a third of the width
        pts.append([T.add(p, T.mul(side, -0.5 * w)), T.add(p, T.mul(side, 0.5 * w))])
        nrm.append([up, up])
        thick.append([0.0045, 0.0045])
        zf = T.clamp01(p[2] / max(1e-6, H))
        top = T.foliage(T.clamp01((0.22 + 0.36 * t + 0.22 * zf) * pl["tone"] * bl["tone"]))
        bot = T.foliage(T.clamp01((0.10 + 0.22 * t) * pl["tone"]))
        ct.append([top, top])
        cb.append([bot, bot])
    T.thick_grid(mesh, pts, nrm, thick, ct, cb)


def _stem(mesh, pl, st, sides, n):
    path = _sample(_path(st, pl["wv"], pl["wind"], FINE), n)
    m = len(path)
    radii = [st["r"] * T.lerp(1.0, 0.55, k / (m - 1)) for k in range(m)]
    H = pl["H"]
    T.tube(mesh, path, radii, sides,
           lambda u, mm: T.foliage(T.clamp01((0.25 + 0.45 * u) * pl["tone"])))
    if st["head"]:
        return path
    return None


def _head(mesh, pl, st, sides, rings):
    """A cattail head: a closed, round-ended sausage on the stem a little below its top."""
    fine = _path(st, pl["wv"], pl["wind"], FINE)
    L = st["len"]
    t0 = st["hpos"] - st["hlen"] / L
    t1 = st["hpos"]
    k0, k1 = t0 * FINE, t1 * FINE
    path, radii = [], []
    for j in range(rings):
        u = j / (rings - 1)
        x = T.lerp(k0, k1, u)
        k = min(FINE - 1, int(x))
        f = x - k
        path.append(tuple(fine[k][c] + (fine[k + 1][c] - fine[k][c]) * f for c in range(3)))
        radii.append(st["hr"] * (0.55 + 0.45 * math.sin(math.pi * u) ** 0.5))
    T.tube(mesh, path, radii, sides,
           lambda u, mm: T.bark_shade(0.80 + 0.35 * math.sin(math.pi * u)))


def _mound(mesh, m, seg, rings):
    r = m["r"]
    cx, cy = m["c"]

    def place(d):
        k = 1.0 + 0.15 * math.cos(4.0 * math.atan2(d[1], d[0]) + 1.3 * d[2])
        p = (cx + d[0] * r * k, cy + d[1] * r * k, -0.015 + d[2] * r * 0.45 * k)
        return p, T.bark_shade(0.75 + 0.35 * (0.5 + 0.5 * d[2]))
    T.blob(mesh, seg, rings, place)


def build(seed, lod=0, params=None):
    """Build one clump of reeds. seed: any int. lod: 0 / 1 / 2. `params` optionally
    overrides plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    for m in pl["mounds"]:
        _mound(mesh, m, *cfg["mound"])
    keep = cfg["keep"]
    # at LOD2 every other blade goes and the rest widen to keep the mass
    for i, bl in enumerate(pl["blades"]):
        if i % keep == 0:
            _blade(mesh, pl, bl, cfg["rows"], 1.0 if keep == 1 else 1.5)
    sides, n = cfg["stem"]
    for st in pl["stems"]:
        _stem(mesh, pl, st, sides, n)
        if st["head"]:
            _head(mesh, pl, st, *cfg["head"])
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    top, reach, tips = 0.0, 0.0, []
    for el in pl["blades"] + pl["stems"]:
        p = _path(el, pl["wv"], pl["wind"], FINE)
        top = max(top, max(q[2] for q in p))
        reach = max(reach, max(math.hypot(q[0], q[1]) for q in p) + 0.03)
        tips.append(p[-1])
    for m in pl["mounds"]:
        reach = max(reach, math.hypot(*m["c"]) + m["r"] * 1.15)
    cx = sum(q[0] for q in tips) / len(tips)
    cy = sum(q[1] for q in tips) / len(tips)
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.7 * reach, 3),
        "stems": len(pl["stems"]),
        "heads": pl["heads"],
        "lean": round(math.hypot(cx, cy) / top, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
