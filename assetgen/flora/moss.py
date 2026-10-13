"""B3 moss — a seeded low patch of moss for the ground (docs/ASSET_PLAN.md §B3, ROADMAP M5e).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Every patch is a closed thin solid (treekit's `lobed_patch`): a lumpy top over a lobed,
star-shaped footprint, a short wall at the edge and a flat bottom sunk a few millimetres
into the ground. Never a plane. Four habits:

- **cushion**: one round, domed hummock (pin-cushion moss), 0.3-0.6 m across and up to
  13 cm tall, with one or two smaller hummocks leaning on it;
- **cluster**: three to five separate hummocks of different sizes, ground showing between;
- **carpet**: one wide, flat sheet (1-2 m) with a ragged, lobed edge and a surface of
  small cushions, 2-5 cm tall;
- **collar**: a crescent of overlapping cushions round an empty centre, the way moss grows
  round the foot of a rock or a trunk (the gap faces the sun).

Some seeds carry sporophytes: tufts of thin stalks each holding up a nodding capsule, in
the ART_BIBLE's `dusk` -> `sky horizon` (moss capsules ripen red-brown to orange), declared
as an optional ramp.

Axes
----
Habit is stratified on pi - 3 (each habit twice in seeds 1..8), sporophytes on
sqrt(6) - 2 (which splits every habit pair), lightness (where the moss sits on the foliage
ramp: shade-dark to sunlit lime) on the golden ratio, size on the plastic number and
raggedness on 1/e.

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
NAME = "moss"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: The prop row (STATE.md run 27). Ground cover is placed by the hundreds, so LOD0 stays
#: under 1000.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
#: Moss is the canopy ramp; sporophytes are ART_BIBLE `dusk` -> `sky horizon`.
PALETTE = {k: T.PALETTE[k] for k in ("canopyDark", "canopyMid", "canopyLight")}
PALETTE.update({"sporeStalk": "#844e32", "sporeCapsule": "#ff9044"})
_SPORE = ["sporeStalk", "sporeCapsule", "sporeCapsule"]
PALETTE_ROLES = {"surfaces": [],
                 "ramps": [["canopyDark", "canopyMid", "canopyLight"], _SPORE],
                 "optional": ["→".join(_SPORE)]}
#: `pieces` counts separate hummocks or sheets; `cover` is the share of the patch's bounding
#: disc that is moss (low for a cluster or a collar, high for a carpet); `lightness` is the
#: moss's mean luminance (x10), shade-dark to sunlit lime.
METRIC_AXES = ["width", "height", "pieces", "cover", "lightness"]
#: Flat cover needs a high camera to read: 50 degrees from straight down, not 76.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 50.0,
         "ground": True, "gap": 0.30, "band": 0.55, "drop": 0.0}

PI_M3 = 0.14159265358979312        # pi - 3: the habit, each twice in seeds 1..8
SQRT6M2 = 0.4494897427831779       # sqrt(6) - 2: sporophytes, splits every habit pair
INV_E = 0.36787944117144233        # 1 / e: raggedness
HABITS = ("cushion", "cluster", "carpet", "collar")
SINK = -0.006                      # the flat bottom, a few millimetres into the ground
EDGE = 0.004                       # the top surface's height at the footprint edge

PARAMS = {
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: cushion (one round domed "
                        "hummock, 0.3-0.6 m), cluster (3-5 separate hummocks), carpet (a "
                        "wide flat lumpy sheet, 1-2 m), collar (a crescent of cushions round "
                        "an empty centre, for the foot of a rock or trunk)"),
    "spores": (0.0, 1.0, "stratified on sqrt(6) - 2: below 0.5 none; above, 6-10 "
                         "sporophytes in tufts of three"),
    "lightness": (0.0, 1.0, "stratified on the golden ratio: 0 shade-dark moss ... 1 "
                            "sunlit lime"),
    "size": (0.0, 1.0, "stratified on the plastic number: footprint and height within the "
                       "habit's band"),
    "ragged": (0.0, 1.0, "stratified on 1/e: how lobed the footprint edge is, how many "
                         "small cushions the surface carries and how far a collar wraps "
                         "round (210-310 degrees)"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


_LIN = {k: T.hex_linear(v) for k, v in PALETTE.items()}


def _spore(t):
    return T.ramp3(_LIN[_SPORE[0]], _LIN[_SPORE[1]], _LIN[_SPORE[2]], t)


# ---------------------------------------------------------------- the plan
def _patch(rng, c, R0, H, prof, rag, nb, bump_amp, res, tone=0.0):
    """One dome or sheet: footprint harmonics, a dome profile and surface lumps."""
    harm = [(k, R0 * rag * rng.range(0.3, 1.0) / (1.0 + 0.35 * (k - 2)),
             rng.range(0.0, 2.0 * math.pi)) for k in range(2, 8)]
    bumps = []
    for _ in range(nb):
        a = rng.range(0.0, 2.0 * math.pi)
        rr = math.sqrt(rng.next()) * 0.70
        bumps.append((rr * math.cos(a), rr * math.sin(a), rng.range(0.25, 0.40),
                      bump_amp * rng.range(0.6, 1.0)))
    ripple = [(rng.range(9.0, 15.0) / max(0.2, R0), rng.range(0.0, 6.3),
               rng.range(9.0, 15.0) / max(0.2, R0), rng.range(0.0, 6.3))]
    return {"c": c, "R0": R0, "H": H, "prof": prof, "harm": harm, "bumps": bumps,
            "ripple": ripple, "fingers": None, "res": res, "lift": 0.0, "tone": tone,
            "piece": None, "sheet": False, "stretch": None}


#: footprint (sides, rings) per LOD for a big base, a hummock and a small cushion dome
_RES_BASE = {0: (24, 3), 1: (16, 2), 2: (12, 2)}
_RES_HUMMOCK = {0: (12, 3), 1: (10, 2), 2: (8, 2)}
_RES_DOME = {0: (8, 2), 1: (6, 2)}


def _domes_on(rng, pl, parent, n, rmin, rmax, fmax, hfrac=0.55, keep2=0):
    """Small cushion domes sitting on `parent`, their flat bottoms hidden under its top:
    the crevices where they meet are what make moss read as moss."""
    for k in range(n):
        a = rng.range(0.0, 2.0 * math.pi)
        f = math.sqrt(rng.next()) * fmax
        R = _radius(parent, a)
        cx = parent["c"][0] + f * R * math.cos(a)
        cy = parent["c"][1] + f * R * math.sin(a)
        r = rng.range(rmin, rmax)
        d = _patch(rng, (cx, cy), r, r * hfrac * rng.range(0.8, 1.1), 2.0, 0.08, 2, 0.20,
                   {**_RES_DOME, **({2: (6, 2)} if k < keep2 else {})},
                   tone=rng.range(0.02, 0.12))
        lo = min(_surface_z(parent, (cx + r * math.cos(t), cy + r * math.sin(t)))
                 for t in (0.0, 1.571, 3.142, 4.712, 0.785, 2.356, 3.927, 5.498))
        d["lift"] = lo - 0.002 - EDGE
        d["piece"] = parent["piece"]
        pl["patches"].append(d)


def _surface_z(pa, xy):
    """Top height of patch `pa` above the point xy (EDGE if outside its footprint)."""
    dx, dy = xy[0] - pa["c"][0], xy[1] - pa["c"][1]
    th = math.atan2(dy, dx) % (2.0 * math.pi)
    f = math.hypot(dx, dy) / _radius(pa, th)
    if f >= 1.0:
        return pa["lift"]
    return pa["lift"] + EDGE + _height(pa, f, th)[0]


def plan(seed):
    """Draw the whole patch as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    habit_t = T.stratify(seed, PI_M3, 0.004, rng)
    spore_t = T.stratify(seed, SQRT6M2, 0.004, rng)
    light = T.stratify(seed, T.GOLDEN, 0.04, rng)
    size = T.stratify(seed, T.PLASTIC, 0.05, rng)
    rag = T.stratify(seed, INV_E, 0.05, rng)
    habit = HABITS[min(3, int(habit_t * 4.0))]
    az0 = rng.range(0.0, 2.0 * math.pi)
    pl = {"seed": seed, "habit": habit, "spores": spore_t >= 0.5, "light": light,
          "size": size, "rag": rag, "patches": []}
    P = pl["patches"]
    if habit == "cushion":
        R0 = T.lerp(0.20, 0.32, size)
        main = _patch(rng, (0.0, 0.0), R0, T.lerp(0.08, 0.13, size), 2.0,
                      T.lerp(0.03, 0.08, rag), 3, 0.10, _RES_BASE)
        main["piece"] = 0
        P.append(main)
        sats = []
        for j in range(1 if rag < 0.5 else 2):
            a = az0 + j * 2.2
            r = R0 * rng.range(0.40, 0.52)
            d = R0 * 0.95 + r * 0.35
            sat = _patch(rng, (math.cos(a) * d, math.sin(a) * d), r,
                         r * rng.range(0.40, 0.50), 2.0, 0.05, 2, 0.10, _RES_HUMMOCK)
            sat["piece"] = 0
            P.append(sat)
            sats.append(sat)
        _domes_on(rng, pl, main, int(round(T.lerp(7, 9, rag))), 0.34 * R0, 0.48 * R0, 0.72,
                  hfrac=0.62, keep2=2)
        for sat in sats:
            _domes_on(rng, pl, sat, 1, 0.40 * sat["R0"], 0.55 * sat["R0"], 0.4)
    elif habit == "cluster":
        n = 3 if rag < 0.33 else (4 if rag < 0.66 else 5)
        spread = T.lerp(0.34, 0.52, size)
        hums = []
        for j in range(n):
            a = az0 + j * 2.39996 + rng.range(-0.3, 0.3)
            d = 0.0 if j == 0 else spread * math.sqrt((j + 0.5) / n) * rng.range(0.85, 1.1)
            r = (T.lerp(0.15, 0.22, size) if j == 0 else rng.range(0.08, 0.15)) \
                * T.lerp(0.95, 1.15, size)
            hm = _patch(rng, (math.cos(a) * d, math.sin(a) * d), r,
                        r * rng.range(0.42, 0.56), 2.2, 0.06, 2, 0.10, _RES_HUMMOCK)
            hm["piece"] = j
            P.append(hm)
            hums.append(hm)
        for j, hm in enumerate(hums):
            _domes_on(rng, pl, hm, 3 if j == 0 else 1, 0.36 * hm["R0"], 0.52 * hm["R0"], 0.5)
    elif habit == "carpet":
        R0 = T.lerp(0.45, 0.70, size)
        base = _patch(rng, (0.0, 0.0), R0, T.lerp(0.012, 0.020, size), 6.0,
                      T.lerp(0.14, 0.26, rag), 4, 0.4, _RES_BASE)
        base["piece"] = 0
        base["sheet"] = True
        P.append(base)
        _domes_on(rng, pl, base, int(round(T.lerp(11, 14, rag))), 0.14 * R0 / 0.7,
                  0.22 * R0 / 0.7, 0.78, hfrac=0.28, keep2=4)
    else:   # collar: a crescent of cushions round the foot of a rock or trunk
        Rc = T.lerp(0.30, 0.46, size)
        span = T.lerp(3.7, 5.4, rag)
        r = T.lerp(0.10, 0.13, size)
        # two staggered rows, big cushions outside and small ones inside, ragged at the ends
        for row, (off, sc, gap) in enumerate(((0.28, 1.0, 1.55), (-0.38, 0.66, 1.55))):
            n = max(6, int(round(span * (Rc + off * r) / (gap * r * sc))))
            for k in range(n):
                u = (k + 0.5 * row) / (n - 1 + 0.5 * row)
                a = az0 + (u - 0.5) * span * (1.0 if row == 0 else 0.86)
                taper = 0.55 + 0.45 * math.sin(math.pi * min(1.0, u))
                rr = Rc + off * r + rng.range(-0.35, 0.35) * r * sc
                rk = r * sc * taper * rng.range(0.78, 1.22)
                d = _patch(rng, (math.cos(a) * rr, math.sin(a) * rr), rk,
                           rk * rng.range(0.48, 0.64), 2.0, 0.10, 2, 0.15,
                           {0: (7 - row, 2), 1: (5, 2)},
                           tone=rng.range(-0.02, 0.10))
                d["stretch"] = (a + 0.5 * math.pi + rng.range(-0.3, 0.3), 0.30)
                d["piece"] = 0
                P.append(d)

    if habit == "collar":
        # LOD2: the crescent as one flattened band swept along the arc
        pts = [(math.cos(az0 + (u / 8.0 - 0.5) * span * 0.97) * Rc,
                math.sin(az0 + (u / 8.0 - 0.5) * span * 0.97) * Rc, 0.022) for u in range(9)]
        pl["bands"] = [{"pts": pts, "r": r * 1.05, "res": {2: (6, 9)}}]
    else:
        pl["bands"] = []
    # sporophytes: tufts of stalks on the higher parts of the patches
    stalks = []
    if spore_t >= 0.5:
        want = int(round(T.lerp(6, 10, (spore_t - 0.5) * 2.0)))
        ntuft = max(2, want // 3)
        hosts = [pa for pa in P if pa["R0"] > 0.08] or P
        for k in range(ntuft):
            pa = hosts[(k * 3) % len(hosts)]
            a = rng.range(0.0, 2.0 * math.pi)
            f = rng.range(0.0, 0.35)
            for q in range(want // ntuft):
                aa = a + rng.range(-0.3, 0.3)
                ff = min(0.6, max(0.0, f + rng.range(-0.08, 0.08)))
                stalks.append({"patch": pa, "f": ff, "a": aa, "h": rng.range(0.05, 0.085),
                               "lean": (rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)),
                               "r": rng.range(0.0032, 0.0042), "cap": rng.range(0.011, 0.015),
                               "t": rng.range(0.0, 0.3)})
    pl["stalks"] = stalks
    return pl


# ---------------------------------------------------------------- surface
def _angdiff(a, b):
    d = (a - b) % (2.0 * math.pi)
    return d - 2.0 * math.pi if d > math.pi else d


def _radius(pa, th):
    r = pa["R0"]
    for k, a, ph in pa["harm"]:
        r += a * math.cos(k * th + ph)
    if pa["stretch"]:       # an ellipse along a finger: (direction, elongation)
        az, e = pa["stretch"]
        c, sn = math.cos(th - az), math.sin(th - az)
        r *= 1.0 / math.sqrt((c / (1.0 + e)) ** 2 + (sn / (1.0 - 0.4 * e)) ** 2)
    if pa["fingers"]:
        g = 0.30
        for az, ln, w in pa["fingers"]:
            g = max(g, ln * math.exp(-(_angdiff(th, az) / w) ** 2))
        r *= g
    return max(0.25 * pa["R0"] * (0.4 if pa["fingers"] else 1.0), r)


def _height(pa, f, th):
    """Top-surface height above EDGE, and a 0..1 'lump' value for colour."""
    R = _radius(pa, th)
    x, y = f * R * math.cos(th), f * R * math.sin(th)
    u, v = x / pa["R0"], y / pa["R0"]
    p = pa["prof"]
    base = max(0.0, 1.0 - f ** p) ** 0.5
    lump = 0.0
    for bx, by, sg, amp in pa["bumps"]:
        lump += amp * math.exp(-((u - bx) ** 2 + (v - by) ** 2) / (sg * sg))
    (fx, px, fy, py), = pa["ripple"]
    rip = 0.10 * math.sin(fx * x + px) * math.sin(fy * y + py)
    fade = max(0.0, 1.0 - f ** 4)
    h = pa["H"] * (base + (lump + rip) * fade) / (1.0 + 0.4 * max((b[3] for b in pa["bumps"]),
                                                                 default=0.0))
    return max(0.0, h), T.clamp01(0.5 * lump + 0.5 + rip * 2.0)


def _top_fn(pa, light):
    t0 = T.lerp(0.14, 0.40, light) + pa["tone"]

    def fn(f, th):
        h, lump = _height(pa, f, th)
        if pa["sheet"]:     # the low sheet under the cushions is their shade
            t = t0 - 0.06 + 0.12 * (h / pa["H"]) + 0.08 * (lump - 0.5)
        else:               # dark in the crevice at the foot of every dome, lit on its crown
            t = t0 - 0.04 + 0.62 * (h / pa["H"]) ** 0.7 + 0.10 * (lump - 0.5)
        return pa["lift"] + EDGE + h, T.foliage(T.clamp01(t))
    return fn


def _bottom_col(light):
    c = T.foliage(T.lerp(0.04, 0.16, light))
    return lambda th: c


# ---------------------------------------------------------------- LOD table
#: whether the sporophytes are drawn, per LOD: (stalk sides, capsule (seg, rings) or None)
_STALK = {0: (3, (4, 2)), 1: (3, None), 2: None}


def _tess(pl, lod):
    mesh = T.Mesh()
    for pa in pl["patches"]:
        res = pa["res"].get(lod)
        if not res:
            continue
        T.lobed_patch(mesh, pa["c"], res[0], res[1], lambda th, pa=pa: _radius(pa, th),
                      _top_fn(pa, pl["light"]), pa["lift"] + SINK, _bottom_col(pl["light"]))
    for bd in pl["bands"]:
        res = bd["res"].get(lod)
        if not res:
            continue
        n = len(bd["pts"])
        radii = [bd["r"] * (0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * i / (n - 1))))
                 for i in range(n)]
        t0 = T.lerp(0.14, 0.40, pl["light"])

        def lobe(u, th):    # a flat ellipse: wide on the ground, 0.32 as tall
            return 1.0 / math.sqrt(math.cos(th) ** 2 + (math.sin(th) / 0.32) ** 2)

        def col(u, m):
            # m is 0.32 on the crown and 1 at the ground edge: crown lit, edge in shade
            return T.foliage(T.clamp01(t0 + 0.40 * (1.0 - (m - 0.32) / 0.68)))
        T.tube(mesh, bd["pts"], radii, res[0], col, lobe)
    mesh.n_moss = len(mesh.v)
    st = _STALK[lod]
    if st:
        for k, s in enumerate(pl["stalks"]):
            if lod == 1 and k % 2:
                continue
            pa = s["patch"]
            R = _radius(pa, s["a"])
            x = pa["c"][0] + s["f"] * R * math.cos(s["a"])
            y = pa["c"][1] + s["f"] * R * math.sin(s["a"])
            z = pa["lift"] + EDGE + _height(pa, s["f"], s["a"])[0] - 0.006
            top = (x + s["lean"][0] * s["h"], y + s["lean"][1] * s["h"], z + s["h"])
            T.tube(mesh, [(x, y, z), top], [s["r"], s["r"] * 0.7], st[0],
                   lambda u, m, s=s: _spore(0.05 + 0.2 * u))
            if st[1]:
                d = T.norm((s["lean"][0], s["lean"][1], 0.35))
                cc = T.add(top, T.mul(d, s["cap"] * 0.5))
                cr = s["cap"]

                def place(dd, cc=cc, cr=cr, s=s):
                    p = (cc[0] + dd[0] * cr * 0.6, cc[1] + dd[1] * cr * 0.6,
                         cc[2] + dd[2] * cr)
                    return p, _spore(0.55 + 0.35 * (0.5 + 0.5 * dd[2]) + s["t"] * 0.3)
                T.blob(mesh, st[1][0], st[1][1], place)
            else:   # LOD1: a stalk thickened at its tip stands for the capsule
                T.tube(mesh, [top, T.add(top, (0.0, 0.0, s["cap"] * 1.4))],
                       [s["cap"] * 0.5, s["cap"] * 0.35], 3, lambda u, m: _spore(0.8))
    return mesh


def build(seed, lod=0, params=None):
    """Build one moss patch. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _STALK:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = _tess(pl, lod)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Numbers for tools/variant-probe.mjs (METRIC_AXES), measured on the LOD0 mesh."""
    pl = plan(int(seed))
    mesh = _tess(pl, 0)
    v = mesh.v
    reach = max(math.hypot(p[0], p[1]) for p in v)
    k = 60
    inside = total = 0
    for i in range(k):
        for j in range(k):
            x = reach * (2.0 * (i + 0.5) / k - 1.0)
            y = reach * (2.0 * (j + 0.5) / k - 1.0)
            if x * x + y * y > reach * reach:
                continue
            total += 1
            for pa in pl["patches"]:
                if 0 not in pa["res"]:
                    continue
                dx, dy = x - pa["c"][0], y - pa["c"][1]
                if math.hypot(dx, dy) < _radius(pa, math.atan2(dy, dx) % (2.0 * math.pi)):
                    inside += 1
                    break
    moss = mesh.c[:mesh.n_moss]
    lum = sum(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] for c in moss) / len(moss)
    return {
        "seed": int(seed), "habit": pl["habit"], "spores": len(pl["stalks"]),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(2.0 * reach, 3),
        "height": round(max(p[2] for p in v[:mesh.n_moss]), 3),
        "pieces": len(set(pa["piece"] for pa in pl["patches"])),
        "cover": round(inside / total, 3),
        "lightness": round(10.0 * lum, 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
