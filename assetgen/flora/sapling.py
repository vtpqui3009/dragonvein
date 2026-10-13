"""B2 sapling — seeded young trees for grove edges (docs/ASSET_PLAN.md §B2, ROADMAP M5c).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
The seed picks the kind, and the kind picks the whole build:
- broadleaf: a slender whip of a stem with a loose, open crown of small leaf clusters
  carried on short side shoots all the way down to a third of its height, so the crown is
  a tall irregular spray, never a ball on a stick;
- conifer: a little spire of drooping whorls from near the ground to a leader tip, the
  same star-rimmed tier shells as `flora/conifer`, fuller and lower;
- palm: a short, stout, ringed stem (sometimes almost none) under an arching rosette of
  folded fronds and an upright spear leaf.

The form axis
-------------
`kind` 0..1 is stratified on the seed by the golden-ratio sequence: its thirds are
broadleaf, conifer and palm, so any eight consecutive seeds hold every kind at least twice.
Where a seed falls inside its third is its age: young and small (~1.3 m) to older and
taller (~3.4 m). Height, lean and crown fullness ride on their own stratified sequences
(plastic, golden**-4, sqrt(3) - 1), so two saplings of a kind differ in more than size.

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
NAME = "sapling"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
PALETTE = dict(T.PALETTE)
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `crownBase` is the lowest foliage over the height; `mass` the foliage's centroid height
#: over the height (a conifer's sits low, a palm's high); `lean` the foliage centroid's
#: offset from the base axis over the height.
METRIC_AXES = ["height", "width", "crownBase", "mass", "lean"]
#: `sheetWidth` (not `width`) frames the sheet, as in flora/windtwisted: 1.64 x the reach
#: from the base axis is exactly what render_all needs between neighbours and at the frame
#: edge, so these small trees are drawn as large as the row allows.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 83.0,
         "ground": True}

KINDS = ("broadleaf", "conifer", "palm")

# ---------------------------------------------------------------- parameters
PARAMS = {
    "kind": (0.0, 1.0, "stratified on the golden ratio, in thirds: broadleaf, conifer, palm. "
                       "The position inside the third is the age: 0 young and small ... 1 "
                       "older and taller"),
    "height": (0.88, 1.12, "multiplier on the kind's height at its age; stratified on the "
                           "plastic number"),
    "lean": (0.0, 1.0, "stratified on golden**-4: 0 upright ... 1 the stem bows 12% of its "
                       "height to one side"),
    "fullness": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 a sparse, see-through crown ... 1 a "
                           "full one (more shoots, tiers or fronds, bigger clusters)"),
    "stemRadius": (0.012, 0.018, "stem base radius as a fraction of height, plus 1 cm"),
    # broadleaf
    "shoots": (3, 4, "broadleaf: side shoots, before fullness adds up to 1.5"),
    "shootLength": (0.12, 0.20, "broadleaf: side shoot length, in heights"),
    "cluster": (0.10, 0.14, "broadleaf: leaf cluster radius, in heights"),
    # conifer
    "tiers": (3, 6, "conifer: whorls, before fullness"),
    "spread": (0.26, 0.36, "conifer: lowest whorl radius, in heights"),
    "points": (5, 7, "conifer: branch tips per whorl"),
    # palm
    "stem": (0.08, 0.50, "palm: stem height, as a fraction of total height"),
    "fronds": (5, 8, "palm: fronds, before fullness"),
    "frondLength": (0.50, 0.68, "palm: frond length, in heights"),
    "arch": (1.1, 1.9, "palm: radians a frond turns from its base to its tip"),
    "tone": (0.92, 1.10, "shifts the foliage ramp position: young leaves are bright"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole sapling as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    kind_t = _p("kind", T.stratify(seed, T.GOLDEN, 0.005, rng))
    k = min(2, int(kind_t * 3.0))
    kind = KINDS[k]
    age = T.clamp01(kind_t * 3.0 - k)
    h_t = _p("height", T.stratify(seed, T.PLASTIC, 0.08, rng))
    lean_t = _p("lean", T.stratify(seed, T.PHI_M4, 0.08, rng))
    full = _p("fullness", T.stratify(seed, T.SQRT3M1, 0.08, rng))
    tone = _p("tone", rng.next())
    lean_az = rng.range(0.0, 2.0 * math.pi)
    r_k = _p("stemRadius", rng.next())

    base_h = {"broadleaf": (1.7, 3.4), "conifer": (1.3, 3.0), "palm": (1.6, 3.1)}[kind]
    H = T.lerp(base_h[0], base_h[1], age) * h_t
    lean = T.lerp(0.0, 0.12, lean_t) * H
    ld = (math.cos(lean_az), math.sin(lean_az))

    def stem_point(z, top):
        """The stem's axis at height z: vertical at the foot, bowing toward the lean."""
        u = T.clamp01(z / top)
        w = u * u
        return (ld[0] * lean * w, ld[1] * lean * w, z)

    pl = {"seed": seed, "kind": kind, "age": age, "height": H, "full": full, "tone": tone,
          "lean": lean, "ld": ld, "leanT": lean_t}
    if kind == "broadleaf":
        _plan_broadleaf(rng, pl, stem_point, r_k)
    elif kind == "conifer":
        _plan_conifer(rng, pl, stem_point, r_k)
    else:
        _plan_palm(rng, pl, stem_point, r_k)
    return pl


def _plan_broadleaf(rng, pl, stem_point, r_k):
    H, full = pl["height"], pl["full"]
    top = H * 0.86
    r0 = r_k * H + 0.01
    n = int(PARAMS["shoots"][0]) + rng.int(0, 1) + int(round(1.5 * full))
    length = _p("shootLength", rng.next()) * H
    cl_r = _p("cluster", rng.next()) * H * T.lerp(0.9, 1.15, full)
    low = rng.range(0.26, 0.36)
    az = rng.range(0.0, 2.0 * math.pi)
    shoots, lobes = [], []

    def lobe(c, r):
        bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.3, 0.8))),
                  rng.range(0.5, 1.0)) for _ in range(4)]
        return {"c": c, "r": r, "squash": rng.range(0.72, 0.88), "droop": rng.range(0.05, 0.15),
                "lumps": rng.range(0.25, 0.40), "bumps": bumps, "tone": rng.range(0.94, 1.06)}

    for i in range(n):
        # up to just under the top, so the leader's cluster never sits on a bare neck
        f = T.lerp(low, 0.94, (i + rng.range(0.25, 0.85)) / n)
        o = stem_point(f * top, top)
        az += 2.39996 + rng.range(-0.35, 0.35)            # golden angle phyllotaxis
        el = math.radians(rng.range(30.0, 55.0))
        ln = length * rng.range(0.75, 1.15) * T.lerp(1.15, 0.7, f)   # longer low down
        d = T.from_angles(az, el)
        mid = T.add(o, T.mul(d, ln * 0.55))
        tip = T.add(mid, T.mul(T.from_angles(az + rng.range(-0.3, 0.3), el + 0.25), ln * 0.45))
        r = cl_r * rng.range(0.80, 1.10) * T.lerp(1.0, 0.85, f)
        shoots.append({"pts": [o, mid, tip], "r0": r0 * T.lerp(0.55, 0.40, f), "r1": 0.008})
        # the shoot ends inside its cluster, which sits a little above and beyond the tip
        # clusters big enough to swallow their shoot and reach back to the stem: no
        # bare neck under any of them
        c = T.add(tip, (d[0] * r * 0.10, d[1] * r * 0.10, r * 0.10))
        lobes.append(lobe(c, r))
        if rng.chance(0.35 + 0.4 * full):
            a = az + rng.range(-1.6, 1.6)
            lobes.append(lobe(T.add(c, (math.cos(a) * r * 0.6, math.sin(a) * r * 0.6,
                                        rng.range(-0.1, 0.35) * r)), r * rng.range(0.65, 0.8)))
    # the leader's own cluster at the top, with a second one stacked on it
    tip = stem_point(top, top)
    rt = cl_r * rng.range(1.05, 1.2)
    lobes.append(lobe(T.add(tip, (0.0, 0.0, rt * 0.05)), rt))
    lobes.append(lobe(T.add(tip, (rng.range(-0.3, 0.3) * rt, rng.range(-0.3, 0.3) * rt,
                                  rt * 0.75)), rt * rng.range(0.55, 0.7)))
    pl.update({"top": top, "r0": r0, "shoots": shoots, "lobes": lobes, "stemFn": stem_point})


def _plan_conifer(rng, pl, stem_point, r_k):
    H, full = pl["height"], pl["full"]
    r0 = r_k * H * 1.2 + 0.01
    n = int(PARAMS["tiers"][0]) + rng.int(0, 2) + int(round(1.5 * full))
    R = _p("spread", rng.next()) * H * T.lerp(0.9, 1.1, full)
    points = rng.int(int(PARAMS["points"][0]), int(PARAMS["points"][1]))
    bare = rng.range(0.05, 0.14) * H
    leader = rng.range(0.07, 0.12) * H
    crown_top = H - leader
    # droop rides on the lean's sequence, so the two conifers of any eight seeds differ:
    # 0 flat, open plates with the stem showing between them ... 1 a dense, hanging spire
    droop = T.clamp01(1.0 - pl["leanT"] + rng.range(-0.1, 0.1))
    tiers = []
    for i in range(n):
        u = i / n
        zr = bare + (crown_top - bare) * 0.9 * u * rng.range(0.95, 1.05) if i else bare
        Ri = R * max(0.14, (1.0 - u) ** rng.range(0.85, 1.15)) * rng.range(0.9, 1.08)
        h = (crown_top - bare) / n * T.lerp(0.75, 1.9, droop)
        h = max(h, Ri * T.lerp(0.25, 0.8, droop))
        c = stem_point(zr, H)
        tiers.append({"zr": zr, "zt": zr + h, "h": h, "R": Ri,
                      "q": T.lerp(0.8, 1.9, droop) * rng.range(0.9, 1.1),
                      "off": (c[0], c[1]), "phase": rng.range(0.0, 2.0 * math.pi),
                      "wob": [(rng.int(2, 3), rng.range(0.0, 6.2832), rng.range(0.03, 0.09))],
                      "under": rng.range(0.22, 0.36), "tone": rng.range(0.94, 1.06)})
    tiers[-1]["zt"] = H
    tiers[-1]["h"] = H - tiers[-1]["zr"]
    tiers[-1]["q"] = max(tiers[-1]["q"], 1.6)
    tiers[-1]["off"] = stem_point(H, H)[:2]
    pl.update({"top": tiers[-1]["zr"] + 0.4 * tiers[-1]["h"], "r0": r0, "tiers": tiers,
               "points": points, "notch": rng.range(0.16, 0.30), "stemFn": stem_point,
               "stemTop": H})


def _plan_palm(rng, pl, stem_point, r_k):
    H, full = pl["height"], pl["full"]
    stem_h = _p("stem", rng.next()) * H
    r0 = r_k * H * 2.2 + 0.03
    n = int(PARAMS["fronds"][0]) + rng.int(0, 1) + int(round(2.0 * full))
    L = _p("frondLength", rng.next()) * H
    arch = _p("arch", rng.next())
    width = rng.range(0.12, 0.18)
    rings = rng.int(4, 7)
    top = stem_point(stem_h, max(stem_h, 1e-3))
    fronds = []
    az = rng.range(0.0, 2.0 * math.pi)
    c = (top[0], top[1], max(stem_h, 0.12))
    for i in range(n):
        az += 2.39996 + rng.range(-0.25, 0.25)
        e0 = math.radians(rng.range(55.0, 82.0))
        fr = {"az": az, "e0": e0, "turn": arch * rng.range(0.8, 1.15),
              "len": L * rng.range(0.8, 1.1), "w": width * rng.range(0.85, 1.15),
              "fold": rng.range(0.25, 0.45), "tone": rng.range(0.94, 1.06)}
        # a frond never reaches the ground: a short stem gets stiffer fronds
        for _ in range(12):
            if min(p[2] for p in _spine(c, fr, 24)) >= 0.10 + 0.5 * fr["w"] * fr["len"]:
                break
            fr["turn"] *= 0.88
        fronds.append(fr)
    spear = {"len": L * rng.range(0.35, 0.5), "tilt": rng.range(0.0, 0.2),
             "az": rng.range(0.0, 2.0 * math.pi)}
    pl.update({"top": stem_h, "r0": r0, "fronds": fronds, "spear": spear, "rings": rings,
               "crownC": top, "stemFn": lambda z, _t: stem_point(z, max(stem_h, 1e-3))})


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"stem_rings": 7, "stem_sides": 8, "shoot_per": 2, "shoot_sides": 5, "lobe": (10, 6),
        "tier_top": (0.25, 0.55, 0.8, 1.0), "tier_under": (0.55,), "per_tip": 4,
        "frond_rows": 9, "frond_cols": 3, "merge": None, "lump": 1.0},
    1: {"stem_rings": 4, "stem_sides": 6, "shoot_per": 1, "shoot_sides": 4, "lobe": (7, 4),
        "tier_top": (0.5, 1.0), "tier_under": (0.5,), "per_tip": 2,
        "frond_rows": 5, "frond_cols": 3, "merge": None, "lump": 0.8},
    2: {"stem_rings": 3, "stem_sides": 5, "shoot_per": 0, "shoot_sides": 3, "lobe": (6, 4),
        "tier_top": (1.0,), "tier_under": (), "per_tip": 2,
        "frond_rows": 3, "frond_cols": 2, "merge": 5, "lump": 0.55},
}


def _stem(mesh, pl, cfg, top, r_top_k, flare=1.35, rings_fn=None):
    n = cfg["stem_rings"]
    path, radii = [], []
    fn = pl["stemFn"]
    for i in range(n):
        u = i / (n - 1)
        z = -0.05 + (top + 0.05) * u
        if i == 1:
            z = min(z, 0.04 * top + 0.02)       # a short vertical foot, so the base is level
        p = fn(max(0.0, z), pl.get("stemTop", top))
        path.append((p[0], p[1], z))
        f = max(0.0, 1.0 - u / 0.2)
        radii.append(pl["r0"] * T.lerp(1.0, r_top_k, u) * (1.0 + (flare - 1.0) * f * f))
    path[0] = (0.0, 0.0, -0.05)
    path[1] = (0.0, 0.0, path[1][2])
    T.tube(mesh, path, radii, cfg["stem_sides"],
           lambda u, m: T.bark(0.25 + 0.5 * u + 0.6 * (m - 1.0)), lobe_fn=rings_fn)


def _foliage_range(pl):
    zs = []
    if pl["kind"] == "broadleaf":
        for lb in pl["lobes"]:
            zs += [T.cloud_bottom(lb), lb["c"][2] + lb["r"] * lb["squash"]]
    elif pl["kind"] == "conifer":
        zs = [t["zr"] for t in pl["tiers"]] + [pl["height"]]
    else:
        zs = [pl["top"], pl["height"]]
    return min(zs), max(zs)


def _broadleaf(mesh, pl, cfg):
    _stem(mesh, pl, cfg, pl["top"], 0.35)
    if cfg["shoot_sides"]:
        for sh in pl["shoots"]:
            pts = sh["pts"]
            path = T.catmull(pts, cfg["shoot_per"]) if cfg["shoot_per"] else [pts[0], pts[-1]]
            m = len(path)
            T.tube(mesh, path, [T.lerp(sh["r0"], sh["r1"], k / (m - 1)) for k in range(m)],
                   cfg["shoot_sides"], lambda u, mm: T.bark(0.4 + 0.4 * u))
    lobes = pl["lobes"]
    if cfg["merge"]:
        lobes = T.merge_clouds(lobes, cfg["merge"])
    zr = _foliage_range(pl)
    for lb in lobes:
        T.cloud(mesh, lb, cfg["lobe"][0], cfg["lobe"][1], zr, pl["tone"], cfg["lump"])


def _conifer(mesh, pl, cfg):
    _stem(mesh, pl, cfg, pl["top"], 0.25, flare=1.5)
    zr = _foliage_range(pl)
    for tr in pl["tiers"]:
        _tier(mesh, tr, cfg, pl["points"], pl["notch"], zr, pl["tone"])


def _tier(mesh, tr, cfg, points, notch, zrange, tone):
    """flora/conifer's whorl: a closed shell of revolution with a star rim that droops."""
    R, h, zt, zr, q = tr["R"], tr["h"], tr["zt"], tr["zr"], tr["q"]
    ox, oy = tr["off"]
    z0, z1 = zrange
    sides = points * cfg["per_tip"]
    under_top = zr + tr["under"] * h
    prof = [(0.0, zt)] + [(r, None) for r in cfg["tier_top"]] + \
           [(r, "u") for r in cfg["tier_under"]] + [(0.0, under_top)]
    bottom_k = len(prof) - 1

    def place(k, theta, rho, _z):
        star = 1.0 - notch * (0.5 - 0.5 * math.cos((theta - tr["phase"]) * points))
        m = star
        for kk, ph, amp in tr["wob"]:
            m *= 1.0 + amp * math.cos(kk * theta + ph)
        if k == 0 or k == bottom_k:
            p = (ox, oy, zt if k == 0 else under_top)
            under, rr = k == bottom_k, 0.0
        else:
            rr = rho * m
            if prof[k][1] == "u":
                z = zr + (under_top - zr) * (1.0 - rho) ** 0.8 + h * 0.05 * (1.0 - star)
                under = True
            else:
                z = zt - h * rr ** q
                under = False
            p = (ox + R * rr * math.cos(theta), oy + R * rr * math.sin(theta), z)
        zf = T.clamp01((p[2] - z0) / max(1e-6, z1 - z0))
        if under:
            t = 0.06 + 0.16 * zf + 0.10 * rr
        else:
            t = 0.28 + 0.32 * zf + 0.26 * rr * star + 0.06 * (1.0 - rr)
        return p, T.foliage(T.clamp01(T.clamp01(t) ** 1.15 * tone * tr["tone"]))

    T.revolve(mesh, [(r, 0.0) for r, _ in prof], sides, place)


def _palm(mesh, pl, cfg):
    rings = pl["rings"]

    def ringed(u, th):
        i_ring = 0.5 + 0.5 * math.cos(2.0 * math.pi * rings * u)
        return 1.0 + 0.07 * i_ring * (1.0 - u * 0.3)
    stem_top = max(pl["top"], 0.12)
    _stem(mesh, pl, cfg, stem_top, 0.78, flare=1.45, rings_fn=ringed)
    c = pl["crownC"]
    c = (c[0], c[1], stem_top)
    zr = _foliage_range(pl)
    rows, cols = cfg["frond_rows"], cfg["frond_cols"]
    for fr in pl["fronds"]:
        _frond(mesh, fr, c, rows, cols, zr, pl["tone"])
    sp = pl["spear"]
    d = T.norm((math.cos(sp["az"]) * sp["tilt"], math.sin(sp["az"]) * sp["tilt"], 1.0))
    base = T.sub(c, (0.0, 0.0, 0.05))
    path = [base, T.add(base, T.mul(d, sp["len"] * 0.5)), T.add(base, T.mul(d, sp["len"]))]
    T.tube(mesh, path, [pl["r0"] * 0.45, pl["r0"] * 0.3, 0.006], max(3, cfg["stem_sides"] - 2),
           lambda u, m: T.foliage(T.clamp01((0.45 + 0.4 * u) * pl["tone"])))


def _spine(c, fr, fine):
    """A frond's midrib: `fine` + 1 points from the crown, turning from e0 by `turn`."""
    az, L = fr["az"], fr["len"]
    pts = [T.add(c, (math.cos(az) * 0.01, math.sin(az) * 0.01, -0.02))]
    for s in range(fine):
        el = fr["e0"] - fr["turn"] * (s / fine) ** 1.3
        pts.append(T.add(pts[-1], T.mul(T.from_angles(az, el), L / fine)))
    return pts


def _frond(mesh, fr, c, rows, cols, zrange, tone):
    """A folded blade along an arching spine: a closed thin sheet (treekit.thick_grid)."""
    az, L = fr["az"], fr["len"]
    side = (-math.sin(az), math.cos(az), 0.0)
    # the spine, integrated finely so every LOD samples the same curve
    fine = 48
    spine = _spine(c, fr, fine)
    tans = [T.from_angles(az, fr["e0"] - fr["turn"] * (s / fine) ** 1.3) for s in range(fine)]
    tans.append(tans[-1])
    pts, nrm_up, thick, ct, cb = [], [], [], [], []
    z0, z1 = zrange
    for i in range(rows):
        t = i / (rows - 1)
        k = int(round(t * fine))
        p, d = spine[k], tans[k]
        up = T.norm(T.cross(side, d))
        if up[2] < 0.0:
            up = T.mul(up, -1.0)
        w = fr["w"] * L * max(0.10, math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 0.8)
        if t < 0.12:
            w *= 0.35                                   # the petiole
        fold = fr["fold"] * w
        row = []
        for j in range(cols):
            a = -1.0 + 2.0 * j / (cols - 1)
            q = T.add(p, T.mul(side, a * w))
            q = T.add(q, T.mul(up, fold * (1.0 - abs(a))))    # midrib raised: a V fold
            row.append(q)
        pts.append(row)
        zf = T.clamp01((p[2] - z0) / max(1e-6, z1 - z0))
        thick.append([0.012 + 0.012 * (1.0 - t)] * cols)
        ct.append([T.foliage(T.clamp01((0.40 + 0.35 * zf + 0.15 * (1.0 - abs(-1.0 + 2.0 * j
                                                                             / (cols - 1))))
                                       * tone * fr["tone"])) for j in range(cols)])
        cb.append([T.foliage(T.clamp01((0.12 + 0.18 * zf) * tone)) for _ in range(cols)])
    normals = T.grid_normals(pts, lambda i, j: (0.0, 0.0, 1.0))
    T.thick_grid(mesh, pts, normals, thick, ct, cb)


def build(seed, lod=0, params=None):
    """Build one sapling. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides plan
    entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    {"broadleaf": _broadleaf, "conifer": _conifer, "palm": _palm}[pl["kind"]](mesh, pl, cfg)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["kind"] = pl["kind"]
    return ob


inward_faces = T.inward_faces


def _foliage_points(pl):
    """Weighted points standing for the foliage, for the metrics (no Blender needed)."""
    out = []
    if pl["kind"] == "broadleaf":
        for lb in pl["lobes"]:
            r, c = lb["r"], lb["c"]
            out.append((c, r ** 3, r, T.cloud_bottom(lb), c[2] + r * lb["squash"]))
    elif pl["kind"] == "conifer":
        for t in pl["tiers"]:
            c = (t["off"][0], t["off"][1], t["zr"] + 0.4 * t["h"])
            out.append((c, t["R"] ** 2 * t["h"], t["R"], t["zr"], t["zt"]))
    else:
        c0 = pl["crownC"]
        c = (c0[0], c0[1], max(pl["top"], 0.12))
        for fr in pl["fronds"]:
            acc = _spine(c, fr, 24)
            mid = acc[len(acc) // 2]
            reach = max(math.hypot(p[0], p[1]) for p in acc)
            out.append((mid, fr["len"], reach - math.hypot(mid[0], mid[1]),
                        min(p[2] for p in acc), max(p[2] for p in acc)))
    return out


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    fp = _foliage_points(pl)
    top = max(f[4] for f in fp)
    if pl["kind"] != "palm":
        top = max(top, pl["height"])
    reach = max(math.hypot(f[0][0], f[0][1]) + f[2] for f in fp)
    w = sum(f[1] for f in fp)
    cx = sum(f[0][0] * f[1] for f in fp) / w
    cy = sum(f[0][1] * f[1] for f in fp) / w
    cz = sum(f[0][2] * f[1] for f in fp) / w
    return {
        "seed": int(seed), "kind": pl["kind"], "age": round(pl["age"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.64 * reach, 3),
        "crownBase": round(max(0.0, min(f[3] for f in fp)) / top, 4),
        "mass": round(cz / top, 4),
        "lean": round(math.hypot(cx, cy) / top, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
