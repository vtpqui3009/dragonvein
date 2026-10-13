"""B3 moss — a seeded low patch of moss for the ground (docs/ASSET_PLAN.md §B3, ROADMAP M5e).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Every patch is a closed thin solid (treekit's `lobed_patch`): a lumpy top over a lobed,
star-shaped footprint, a short wall at the edge and a flat bottom sunk a few millimetres
into the ground. Never a plane. Cushions are small overlapping domes on top of their
parent, so the dark crevices where they meet carry the moss read, and a two-scale mottle
moves each vertex up and down the foliage ramp so no cushion is one smooth lime.

Four habits, each in two forms that differ in structure (cycle 2 of M5e: a pair that
differs only in colour is one object):

- **cushion**: a *hummock* (one tall domed pin-cushion, a satellite leaning on it) or a
  *trail* (an uneven strand of cushions along a crack, with side shoots);
- **cluster**: *few* (three big cushions) or *many* (a dozen small ones dotted about);
- **carpet**: a *mat* (wide, flat, ragged, small cushions over it) or a *drape* (the
  carpet thrown over a buried stone: a broad hump 20-26 cm high with a skirt);
- **collar**, moss round the foot of a rock or a trunk: a *ring* (closed) or an *arc*
  (two or three broken arcs, wider).

Some seeds carry sporophytes: tufts of stalks each holding up a nodding capsule, in
the ART_BIBLE's `dusk` -> `sky horizon` (moss capsules ripen red-brown to orange), declared
as an optional ramp.

Axes
----
Habit is stratified on pi - 3 (each habit twice in seeds 1..8), the form on sqrt(6) - 2
(which splits every habit pair), sporophytes on the golden ratio, lightness (where the moss
sits on the foliage ramp) on sqrt(2) - 1, size on the plastic number and raggedness on 1/e.

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
SQRT2M1 = T.SQRT2M1                # sqrt(2) - 1: lightness
#: each habit's two forms, split by the variant on sqrt(6) - 2 (which splits every habit
#: pair of seeds 1..8): the pair differs in structure, never only in colour
FORMS = {"cushion": ("hummock", "trail"), "cluster": ("few", "many"),
         "carpet": ("mat", "drape"), "collar": ("ring", "arc")}
SINK = -0.006                      # the flat bottom, a few millimetres into the ground
EDGE = 0.004                       # the top surface's height at the footprint edge

PARAMS = {
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: cushion, cluster, carpet, "
                        "collar"),
    "form": (0.0, 1.0, "stratified on sqrt(6) - 2, in halves: cushion hummock / trail; "
                       "cluster few big / many small; carpet flat mat / drape over a hump; "
                       "collar closed ring / broken arcs"),
    "spores": (0.0, 1.0, "stratified on the golden ratio: above 0.5, 6-10 sporophytes in "
                         "tufts of three"),
    "lightness": (0.0, 1.0, "stratified on sqrt(2) - 1: 0 shade-dark moss ... 1 sunlit "
                            "lime"),
    "size": (0.0, 1.0, "stratified on the plastic number: footprint and height within the "
                       "habit's band"),
    "ragged": (0.0, 1.0, "stratified on 1/e: how lobed the footprint edge is, how many "
                         "cushions a patch carries, and two or three broken arcs"),
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
                   tone=rng.range(-0.04, 0.16))
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
    var_t = T.stratify(seed, SQRT6M2, 0.004, rng)
    spore_t = T.stratify(seed, T.GOLDEN, 0.004, rng)
    light = T.stratify(seed, SQRT2M1, 0.04, rng)
    size = T.stratify(seed, T.PLASTIC, 0.05, rng)
    rag = T.stratify(seed, INV_E, 0.05, rng)
    habit = HABITS[min(3, int(habit_t * 4.0))]
    form = FORMS[habit][1 if var_t >= 0.5 else 0]
    az0 = rng.range(0.0, 2.0 * math.pi)
    pl = {"seed": seed, "habit": habit, "form": form, "spores": spore_t >= 0.5,
          "light": light, "size": size, "rag": rag, "patches": [], "bands": []}
    P = pl["patches"]
    if form == "hummock":       # one tall domed pin-cushion, a satellite leaning on it
        R0 = T.lerp(0.20, 0.30, size)
        main = _patch(rng, (0.0, 0.0), R0, T.lerp(0.10, 0.15, size), 2.0,
                      T.lerp(0.03, 0.08, rag), 3, 0.10, _RES_BASE)
        main["piece"] = 0
        P.append(main)
        a = az0
        r = R0 * rng.range(0.42, 0.52)
        d = R0 * 0.95 + r * 0.35
        sat = _patch(rng, (math.cos(a) * d, math.sin(a) * d), r, r * rng.range(0.42, 0.52),
                     2.0, 0.05, 2, 0.10, _RES_HUMMOCK)
        sat["piece"] = 0
        P.append(sat)
        _domes_on(rng, pl, main, int(round(T.lerp(8, 10, rag))), 0.30 * R0, 0.44 * R0, 0.74,
                  hfrac=0.62, keep2=2)
        _domes_on(rng, pl, sat, 2, 0.38 * r, 0.5 * r, 0.45)
    elif form == "trail":       # an uneven strand of cushions along a crack, side shoots off it
        n = int(round(T.lerp(6, 7, rag)))
        L = T.lerp(0.95, 1.25, size)
        bend = rng.range(0.5, 0.9) * (1.0 if rng.next() < 0.5 else -1.0)
        ux, uy = math.cos(az0), math.sin(az0)
        k = 0
        for j in range(n + 3):
            if j < n:
                f = (j + rng.range(-0.25, 0.25)) / (n - 1)
                r = rng.range(0.07, 0.13) * (1.0 - 0.35 * f)
                off = rng.range(-0.5, 0.5) * r
            else:   # side shoots, a cushion's width off the strand
                f = rng.range(0.1, 0.8)
                r = rng.range(0.045, 0.07)
                off = (1.0 if j % 2 else -1.0) * rng.range(0.13, 0.18)
            along = (f - 0.5) * L
            side = 0.14 * L * math.sin(f * math.pi * 1.6) * bend + off
            c = (ux * along - uy * side, uy * along + ux * side)
            hm = _patch(rng, c, r, r * rng.range(0.50, 0.72), 2.0, 0.09, 2, 0.12,
                        {0: (10, 2), 1: (8, 2), **({2: (6, 2)} if j < n and j % 2 == 0
                                                   else {})},
                        tone=rng.range(-0.06, 0.14))
            hm["piece"] = k
            hm["lod2R"] = r * 1.4
            k += 1
            P.append(hm)
            if j < 3:
                _domes_on(rng, pl, hm, 1, 0.40 * r, 0.52 * r, 0.4)
    elif form == "few":         # three big cushions, ground between
        spread = T.lerp(0.30, 0.40, size)
        for j in range(3):
            a = az0 + j * 2.1 + rng.range(-0.25, 0.25)
            d = spread * (0.0 if j == 0 else rng.range(0.85, 1.05))
            r = (0.24 if j == 0 else rng.range(0.15, 0.19)) * T.lerp(0.95, 1.12, size)
            hm = _patch(rng, (math.cos(a) * d, math.sin(a) * d), r, r * rng.range(0.50, 0.60),
                        2.2, 0.06, 2, 0.10, _RES_HUMMOCK)
            hm["piece"] = j
            P.append(hm)
            _domes_on(rng, pl, hm, 4 if j == 0 else 3, 0.32 * r, 0.46 * r, 0.6)
    elif form == "many":        # a dozen small cushions dotted about
        n = int(round(T.lerp(10, 13, rag)))
        Rs = T.lerp(0.36, 0.46, size)
        for j in range(n):
            a = az0 + j * 2.39996 + rng.range(-0.25, 0.25)
            d = Rs * math.sqrt((j + 0.5) / n) * rng.range(0.9, 1.1)
            r = rng.range(0.050, 0.085)
            hm = _patch(rng, (math.cos(a) * d, math.sin(a) * d), r, r * rng.range(0.55, 0.75),
                        2.0, 0.08, 2, 0.14,
                        {0: (9, 2), 1: (7, 2), **({2: (6, 2)} if j % 2 == 0 else {})},
                        tone=rng.range(-0.06, 0.14))
            hm["piece"] = j
            hm["lod2R"] = r * 1.35
            P.append(hm)
    elif form in ("mat", "drape"):
        R0 = T.lerp(0.45, 0.70, size) * (1.0 if form == "mat" else 0.85)
        base = _patch(rng, (0.0, 0.0), R0, T.lerp(0.012, 0.020, size), 6.0,
                      T.lerp(0.14, 0.26, rag), 4, 0.4, _RES_BASE)
        base["piece"] = 0
        base["sheet"] = True
        P.append(base)
        if form == "mat":
            _domes_on(rng, pl, base, int(round(T.lerp(11, 14, rag))), 0.14 * R0 / 0.7,
                      0.22 * R0 / 0.7, 0.78, hfrac=0.28, keep2=4)
        else:
            # the carpet drapes over a buried stone: a broad hump, off centre, cushions on it
            hr = R0 * rng.range(0.52, 0.60)
            hc = (math.cos(az0) * R0 * 0.12, math.sin(az0) * R0 * 0.12)
            hump = _patch(rng, hc, hr, T.lerp(0.20, 0.26, size), 1.8, 0.10, 3, 0.10,
                          {0: (22, 4), 1: (14, 3), 2: (10, 2)}, tone=0.0)
            hump["lift"] = _surface_z(base, hc) - 0.004 - EDGE
            hump["piece"] = 0
            P.append(hump)
            _domes_on(rng, pl, hump, 8, 0.24 * hr, 0.34 * hr, 0.80, hfrac=0.62, keep2=3)
            _domes_on(rng, pl, base, 4, 0.10 * R0, 0.16 * R0, 0.85, hfrac=0.28, keep2=1)
    else:   # ring / arc: moss round the foot of a rock or trunk
        full = form == "ring"
        Rc = T.lerp(0.28, 0.36, size) if full else T.lerp(0.40, 0.50, size)
        r = T.lerp(0.10, 0.12, size)
        if full:
            segs = [(az0, 2.0 * math.pi)]
        else:   # two or three arcs with gaps between, the whole ~250 degrees
            m = 2 if rag < 0.5 else 3
            segs = []
            span = 4.4 / m
            for j in range(m):
                segs.append((az0 + (j - (m - 1) / 2.0) * (span + 0.55), span))
        for sid, (mid, span) in enumerate(segs):
            for row, (off, sc, gap) in enumerate(((0.25, 1.0, 1.65), (-0.40, 0.66, 2.5))):
                n = max(3, int(round(span * (Rc + off * r) / (gap * r * sc))))
                for k in range(n):
                    if full:
                        u = (k + 0.5 * row) / n
                        a = mid + u * span
                        taper = 1.0
                    else:
                        u = (k + 0.5 * row) / (n - 1 + 0.5 * row)
                        a = mid + (u - 0.5) * span * (1.0 if row == 0 else 0.8)
                        taper = 0.6 + 0.4 * math.sin(math.pi * min(1.0, u))
                    rr = Rc + off * r + rng.range(-0.30, 0.30) * r * sc
                    rk = r * sc * taper * rng.range(0.80, 1.20)
                    d = _patch(rng, (math.cos(a) * rr, math.sin(a) * rr), rk,
                               rk * rng.range(0.50, 0.64), 2.0, 0.10, 2, 0.15,
                               {0: (7 - row, 2), 1: (5, 2)}, tone=rng.range(-0.06, 0.14))
                    d["stretch"] = (a + 0.5 * math.pi + rng.range(-0.3, 0.3), 0.30)
                    d["piece"] = sid
                    P.append(d)
            # LOD2: each arc as one flattened band swept along it
            sp = span * (1.0 if full else 0.97)
            k8 = 12 if full else 7
            pts = [(math.cos(mid + (u / k8 - (0.0 if full else 0.5)) * sp * (0.985 if full
                                                                              else 1.0)) * Rc,
                    math.sin(mid + (u / k8 - (0.0 if full else 0.5)) * sp * (0.985 if full
                                                                              else 1.0)) * Rc,
                    0.022) for u in range(k8 + 1)]
            pl["bands"].append({"pts": pts, "r": r * 1.05, "res": {2: (5 if full else 6,
                                                                      k8 + 1)}})

    # sporophytes: tufts of stalks on the higher parts of the patches
    stalks = []
    if spore_t >= 0.5:
        want = int(round(T.lerp(6, 10, (spore_t - 0.5) * 2.0)))
        ntuft = max(2, want // 3)
        hosts = [pa for pa in P if pa["R0"] > 0.08 and not pa["sheet"]] or P
        for k in range(ntuft):
            pa = hosts[(k * 3) % len(hosts)]
            a = rng.range(0.0, 2.0 * math.pi)
            f = rng.range(0.0, 0.35)
            for q in range(want // ntuft):
                aa = a + rng.range(-0.3, 0.3)
                ff = min(0.6, max(0.0, f + rng.range(-0.08, 0.08)))
                stalks.append({"patch": pa, "f": ff, "a": aa, "h": rng.range(0.06, 0.09),
                               "lean": (rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)),
                               "r": rng.range(0.0050, 0.0060), "cap": rng.range(0.017, 0.021),
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


def _mottle(x, y):
    """A fixed two-scale mottle over the ground plane, -1..1: patches of darker and paler
    moss inside the ramp, so no cushion is one smooth lime."""
    return 0.6 * math.sin(23.0 * x + 7.0 * y) * math.sin(19.0 * y - 11.0 * x) + \
        0.4 * math.sin(61.0 * x - 37.0 * y + 1.3) * math.sin(53.0 * y + 29.0 * x)


def _top_fn(pa, light):
    t0 = T.lerp(0.10, 0.34, light) + pa["tone"]

    def fn(f, th):
        h, lump = _height(pa, f, th)
        R = _radius(pa, th)
        x = pa["c"][0] + f * R * math.cos(th)
        y = pa["c"][1] + f * R * math.sin(th)
        mot = 0.13 * _mottle(x, y)
        if pa["sheet"]:     # the low sheet under the cushions is their shade
            t = t0 - 0.06 + 0.12 * (h / pa["H"]) + 0.08 * (lump - 0.5) + mot
        else:               # dark in the crevice at the foot of every dome, lit on its crown
            t = t0 - 0.06 + 0.62 * (h / pa["H"]) ** 0.7 + 0.10 * (lump - 0.5) + mot
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
        if lod == 2 and pa.get("lod2R"):    # half the cushions, each grown to cover
            pa = dict(pa, R0=pa["lod2R"], H=pa["H"] * pa["lod2R"] / pa["R0"])
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
        "seed": int(seed), "habit": pl["habit"], "form": pl["form"], "spores": len(pl["stalks"]),
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
