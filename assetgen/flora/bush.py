"""B2 bush — a seeded low, rounded, multi-lobed shrub (docs/ASSET_PLAN.md §B2, ROADMAP M5d).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A bush is a cluster of lumpy foliage lobes (treekit's `cloud`, the same leaf mass the trees
use) packed over an envelope, with a core lobe filling the middle so no daylight shows
through it, on a few short splayed stems that end inside the foliage. There is no trunk.
Lobes are big and few or small and many, so one bush is three or four distinct domes and
another one lumpy mass. Some seeds flower: clusters of small warm blossoms on the sunlit
tops of the lobes, in the ART_BIBLE's golden-hour colours (`sky horizon` -> `UI accent`),
declared as an optional ramp because most seeds carry none.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a low spreading mound (~0.6 m tall, ~2.2 m across) that sits on the ground like a
cushion; 1 a tall upright clumped bush (~1.9 m) shaped like an egg standing on short stems.
Size, lobe count and lopsidedness ride on their own stratified sequences (plastic,
golden**-4, sqrt(3) - 1), and flowering on a fifth (sqrt(2) - 1).

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
NAME = "bush"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
#: The blossoms are two ART_BIBLE entries, `sky horizon` and `UI accent`: the warm
#: golden-hour pair, the only warm lights in the palette.
PALETTE = {**T.PALETTE, "bloomWarm": "#ff9044", "bloomLight": "#ffd479"}
_BLOOM = ["bloomWarm", "bloomLight", "bloomLight"]
PALETTE_ROLES = {"surfaces": ["bark"],
                 "ramps": [["canopyDark", "canopyMid", "canopyLight"], _BLOOM],
                 "optional": ["→".join(_BLOOM)]}
#: `lobes` counts the visible foliage lobes; `lopsided` is the foliage centroid's offset
#: from the stem base over the reach; `bloom` counts blossom clusters (0 on most seeds).
METRIC_AXES = ["height", "width", "lobes", "lopsided", "bloom"]
#: Small plants: the gap between neighbours, the label band and the camera drop are scaled
#: down from render_all's tree defaults (1.1 / 2.9 / 0.5 m) so a 0.6 m bush is not a speck.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 80.0,
         "ground": True, "gap": 0.45, "band": 1.05, "drop": 0.18}

SQRT2M1 = T.SQRT2M1
MAX_LOBES = 14
SQUASH_MIN, SQUASH_MAX = 0.62, 1.22
COVER = 3.0
PI_M3 = 0.14159265358979312               # pi - 3: the habit, each class twice in seeds 1..8
INV_E = 0.36787944117144233               # 1 / e: the lobe count, apart from form and habit
HABITS = ("dome", "oval", "vase", "clump")
#: (height of the widest point, width at the foot), both as fractions
HABIT_PROFILE = {"dome": (0.0, 1.0), "oval": (0.42, 0.34), "vase": (0.70, 0.24)}


def _profile(h, hm, base_w):
    """Envelope width at height fraction h: an ellipse above the widest point hm, and below
    it an ellipse that narrows to `base_w` at the foot."""
    h = T.clamp01(h)
    if h >= hm:
        e = 1.0 - ((h - hm) / max(1e-6, 1.0 - hm)) ** 2
        return math.sqrt(max(0.0, e))
    e = 1.0 - ((hm - h) / hm) ** 2
    return base_w + (1.0 - base_w) * math.sqrt(max(0.0, e))

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified on the golden ratio: 0 low spreading mound (~0.6 m tall, "
                       "~2.2 m wide) ... 1 tall upright clumped egg (~1.9 m) on short stems"),
    "size": (0.90, 1.18, "multiplier on height and width; stratified on the plastic number"),
    "lobeSize": (0.34, 0.62, "lobe radius over the crown's half-width, stratified on 1/e: "
                             "many small lumps ... few big distinct domes. The count follows "
                             "from covering the envelope (4..14), so a tall bush has more"),
    "lopsided": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 symmetric ... 1 heavily one-sided, "
                           "the top pushed out and the far side cut back"),
    "bloom": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.58 no flowers; above, 5..12 "
                        "clusters of three warm blossoms on the lobe tops"),
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: dome (a cushion widest at the "
                        "ground), oval (widest at mid-height, narrow foot), vase (narrow foot, "
                        "flaring to a broad rounded top), clump (three crowns of different "
                        "heights side by side)"),
    "stems": (3, 5, "short splayed stems from the root to inside the foliage (two more, "
                    "and thicker, under a vase)"),
    "lumps": (0.45, 0.70, "how knobbly each lobe is"),
    "tone": (0.90, 1.08, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole bush as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.02, rng))
    size = _p("size", T.stratify(seed, T.PLASTIC, 0.06, rng))
    lob_t = T.stratify(seed, INV_E, 0.04, rng)
    lop = _p("lopsided", T.stratify(seed, T.SQRT3M1, 0.06, rng))
    bloom_t = _p("bloom", T.stratify(seed, SQRT2M1, 0.04, rng))
    habit_t = _p("habit", T.stratify(seed, PI_M3, 0.004, rng))
    tone = _p("tone", rng.next())
    lumps = _p("lumps", rng.next())
    lop_az = rng.range(0.0, 2.0 * math.pi)

    habit = HABITS[min(3, int(habit_t * 4.0))]
    H = T.lerp(0.62, 1.62, form) * size
    A = T.lerp(1.08, 0.58, form) * size                 # half-width
    # clearance: a hint of stems and no trunk, except that a vase stands on a V of stems
    zb = (max(0.13, T.lerp(0.15, 0.21, form) * H) if habit == "vase"
          else T.lerp(0.0, 0.05, form) * H)
    ld = (math.cos(lop_az), math.sin(lop_az))
    k = (H - zb) / A                                    # height in half-widths
    # Lobe size is set against the width, and the count follows from covering the envelope,
    # so a tall bush is a heap of lumps and never two balls stacked on a stick.
    r_frac = _p("lobeSize", lob_t)

    # Crowns: one, or for the clump habit three side by side of different heights.
    if habit == "clump":
        m = 3                       # three never all line up in depth from one view
        caz = rng.range(0.0, 2.0 * math.pi)
        crowns = []
        for j in range(m):
            a_j = caz + 2.0 * math.pi * j / m + rng.range(-0.35, 0.35)
            hs = 1.0 if j == 0 else rng.range(0.45, 0.66)
            crowns.append({"off": (math.cos(a_j) * 0.82, math.sin(a_j) * 0.82),
                           "w": rng.range(0.38, 0.48), "h": hs,
                           "hm": rng.range(0.25, 0.45), "base": 0.45})
    else:
        hm0, bw0 = HABIT_PROFILE[habit]
        crowns = [{"off": (0.0, 0.0), "w": 1.0, "h": 1.0, "hm": hm0, "base": bw0}]
    cap = MAX_LOBES // len(crowns)

    lobes = []
    az0 = rng.range(0.0, 2.0 * math.pi)
    for cr in crowns:
        _crown(rng, lobes, cr, r_frac, cap, k, lop, lop_az, lumps, az0)
        az0 += 1.3
    # Fit: scale the cluster about the root so its top is H and its reach A (the lobes'
    # bulge would otherwise make a 0.6 m mound a 1 m one). Lobes are ellipsoids squashed
    # only in z, so a horizontal x vertical scale stays exact: radius by the horizontal
    # factor, squash and droop by the ratio.
    # Measured on the lobes' real surface (lumps and tufts included), so H and A are what
    # the mesh has, and nothing dips below the ground.
    ext = [_extent(lb) for lb in lobes]
    top0 = max(lb["c"][2] + e[1] for lb, e in zip(lobes, ext))
    bot0 = min(lb["c"][2] + e[0] for lb, e in zip(lobes, ext))
    reach0 = max(e[2] for e in ext)
    sx = A / reach0
    sz = (H - zb + 0.04) / max(1e-6, top0 - bot0)
    for lb in lobes:                                # the lowest lobe sinks 4 cm: contact
        c = lb["c"]
        lb["c"] = (c[0] * sx, c[1] * sx, zb - 0.04 + (c[2] - bot0) * sz)
        lb["r"] *= sx
        # a lobe stays a lobe: never a pancake under a low bush, never a flame on a tall one
        f = max(SQUASH_MIN, min(SQUASH_MAX, lb["squash"] * sz / sx)) / lb["squash"]
        lb["squash"] *= f
        lb["droop"] *= f
    # The clamp moved the extents a little; close the gap by moving centres only.
    for _ in range(3):
        ext = [_extent(lb) for lb in lobes]
        top1 = max(lb["c"][2] + e[1] for lb, e in zip(lobes, ext))
        bot1 = min(lb["c"][2] + e[0] for lb, e in zip(lobes, ext))
        reach1 = max(e[2] for e in ext)
        rmax = max(lb["r"] for lb in lobes)
        gz = ((H - zb + 0.04) - (top1 - bot1)) / max(1e-6, top1 - bot1 - rmax)
        gx = (A - reach1) / max(1e-6, reach1 - rmax)
        for lb in lobes:
            c = lb["c"]
            lb["c"] = (c[0] * (1.0 + gx), c[1] * (1.0 + gx), c[2] + (c[2] - bot1) * gz)
        bot2 = min(lb["c"][2] + _extent(lb)[0] for lb in lobes)
        for lb in lobes:
            c = lb["c"]
            lb["c"] = (c[0], c[1], c[2] + (zb - 0.04) - bot2)
    top = max(lb["c"][2] + _extent(lb)[1] for lb in lobes)

    # Stems: from a spread of root points, splayed, each ending inside one of the lowest
    # lobes, so no stem shows a bare end.
    ns = rng.int(int(PARAMS["stems"][0]), int(PARAMS["stems"][1])) + (2 if habit == "vase" else 0)
    r_stem = (0.024 + 0.026 * size * T.lerp(0.6, 1.0, form)) * (1.3 if habit == "vase" else 1.0)
    low = sorted(range(len(lobes)), key=lambda i: (T.cloud_bottom(lobes[i]), i))[:ns]
    stems = []
    for i in low:
        c = lobes[i]["c"]
        saz = math.atan2(c[1], c[0]) + rng.range(-0.3, 0.3)
        r0 = A * rng.range(0.03, 0.08)
        root = (math.cos(saz) * r0, math.sin(saz) * r0, -0.04)
        foot = (root[0], root[1], 0.03)              # a short vertical foot: a level base
        mid = (T.lerp(root[0], c[0], 0.45), T.lerp(root[1], c[1], 0.45),
               T.lerp(0.0, c[2], 0.38))
        stems.append({"pts": [root, foot, mid, c],
                      "r0": r_stem * rng.range(0.8, 1.1), "r1": r_stem * 0.45})

    # Flowers: clusters of three on the outward faces of the lobes, never inside a neighbour.
    blooms = []
    if bloom_t > 0.58:
        want = int(round(T.lerp(5, 10, (bloom_t - 0.58) / 0.42)))
        bs = 0.048 + 0.016 * size
        tries = 0
        while len(blooms) < want and tries < want * 12:
            tries += 1
            k = rng.int(0, len(lobes) - 1)
            lb = lobes[k]
            if lb.get("core"):
                continue
            d = T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.1, 0.9)))
            p = _surface(lb, d, 1.0)
            if any(_inside(o, p) for j, o in enumerate(lobes) if j != k):
                continue
            if any(T.length(T.sub(p, b["c"])) < bs * 5.0 for b in blooms):
                continue
            t1 = T.norm(T.cross(d, (0.0, 0.0, 1.0) if abs(d[2]) < 0.95 else (1.0, 0.0, 0.0)))
            t2 = T.cross(d, t1)
            ph = rng.range(0.0, 2.0 * math.pi)
            cl = []
            for m in range(3):
                a = ph + m * 2.0944
                off = T.add(T.mul(t1, math.cos(a) * bs * 1.25), T.mul(t2, math.sin(a) * bs * 1.25))
                cl.append({"dir": T.norm(T.add(d, T.mul(off, 1.0 / max(1e-6, lb["r"])))),
                           "s": bs * rng.range(0.85, 1.15), "t": rng.range(0.0, 1.0)})
            blooms.append({"lobe": k, "c": p, "flowers": cl})

    return {"seed": seed, "form": form, "size": size, "H": H, "A": A, "zb": zb, "habit": habit,
            "lop": lop, "ld": ld, "lobes": lobes, "stems": stems, "blooms": blooms,
            "tone": tone, "top": top, "bloomT": bloom_t}


def _crown(rng, lobes, cr, r_frac, cap, k, lop, lop_az, lumps, az0):
    """One crown's lobes, in half-width units, on its profile of revolution: heights evenly
    spaced (on a sphere that is equal area, Archimedes), azimuths on the golden angle, each
    lobe pushed in so about 60% of it stands proud of the envelope; then one core lobe that
    fills the middle so no daylight shows through. Appends to `lobes`."""
    hm, base_w, W, hs = cr["hm"], cr["base"], cr["w"], cr["h"]
    ox, oy = cr["off"]
    kc = k * hs
    ld = (math.cos(lop_az), math.sin(lop_az))

    def wid(h):
        return W * _profile(h, hm, base_w)
    S = sum(2.0 * math.pi * wid((j + 0.5) / 40.0) * math.hypot(
        wid((j + 1) / 40.0) - wid(j / 40.0), kc / 40.0) for j in range(40))
    r_mean = r_frac * W
    # Each lobe stands for about 3 r^2 of envelope: the gaps between them show the dark
    # core below, which is what makes the crevices.
    n = max(4, min(cap, int(round(S / (COVER * r_mean * r_mean)))))
    r_mean = max(r_mean, math.sqrt(S / (COVER * n)))   # the cap never leaves a bald patch
    h_lo = 0.10 if hm < 0.1 else 0.16
    for i in range(n):
        # the first lobe crowns the top on the axis, big enough that it is never a head
        h = 1.0 - (i + rng.range(0.3, 0.7)) / n * (1.0 - h_lo) if i else 0.85
        az = az0 + i * 2.39996 + rng.range(-0.3, 0.3)
        c_l = math.cos(az - lop_az)
        w = wid(h)
        r = r_mean * (0.72 + 0.28 * w / W) * rng.range(0.82, 1.18) * (1.0 + lop * 0.25 * c_l)
        if i == 0:
            r = r_mean * rng.range(0.98, 1.08)
        r = min(r, 0.55 * kc + 0.1 * W)
        nrm = T.norm((w * math.cos(az), w * math.sin(az), (h - hm) * 1.2 * W))
        rho = w * (1.0 + lop * 0.30 * c_l) * (0.25 if i == 0 else 1.0)
        q = (ox + rho * math.cos(az), oy + rho * math.sin(az), h * kc)
        q = T.sub(q, T.mul(nrm, r * 0.40))
        # lopsided: the top leans out over the near side, which also stands taller
        lean = lop * 0.45 * (h * hs) ** 1.2
        q = (q[0] + ld[0] * lean, q[1] + ld[1] * lean, q[2] + lop * 0.22 * kc * c_l * h)
        lobes.append(_lobe(rng, q, r, lumps))
    # Cores stacked up the axis, each a little inside the shell of lobes round it, so they
    # only ever show as shade between the lobes, never above them.
    nc = max(1, int(math.ceil(kc / 1.1)))
    hcs = [0.5 / nc + i / nc * 0.9 for i in range(nc)] if nc > 1 else [max(hm, 0.32)]
    for hc in hcs:
        core_w = 0.66 * W * max(0.40, _profile(hc, hm, base_w))
        lean = lop * 0.25 * hc * hs
        core = _lobe(rng, (ox + ld[0] * lean, oy + ld[1] * lean, hc * kc), core_w,
                     lumps * 0.7)
        core["squash"] = max(0.5, min(1.0, 0.62 * kc / nc / core_w))
        core["core"] = True
        core["tone"] = 0.70        # the heart of the bush is in its own shade: dark crevices
        lobes.append(core)


def _lobe(rng, c, r, lumps):
    bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.2, 0.9))),
              rng.range(0.5, 1.0)) for _ in range(7)]
    # tufts lean outward, never straight up, so no lobe ends in a point
    tufts = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.4, 0.55))),
              rng.range(0.6, 1.0)) for _ in range(9)]
    return {"c": c, "r": r, "squash": rng.range(0.74, 0.92), "droop": rng.range(0.04, 0.10),
            "lumps": lumps * rng.range(0.85, 1.15), "bumps": bumps, "tufts": tufts,
            "tone": rng.range(0.88, 1.10)}


def _surface(lb, d, lump_scale):
    """The point of `_leafy`'s surface for direction d."""
    return T.add(lb["c"], _shape(lb, d, lump_scale))


TUFT = 0.34          # how far a leaf tuft stands out of its lobe, in lobe radii
TUFT_POWER = 3.0     # how narrow a tuft is: cos**3 is about 38 degrees across at half height


def _tuft(lb, d, lump_scale):
    """Leaf tufts: narrow bumps over the lobe, so its outline is knobbly, not a balloon."""
    t = 0.0
    for ax, a in lb["tufts"]:
        t = max(t, a * max(0.0, T.dot(d, ax)) ** TUFT_POWER)
    return 1.0 + TUFT * lump_scale * (t - 0.35)


def _leafy(mesh, lb, seg, rings, zrange, tone, lump_scale):
    """treekit's `cloud` (same lumps, droop and foliage-ramp colouring) with leaf tufts on
    top, and the crevices between tufts a shade darker."""
    cx, cy, cz = lb["c"]
    R, sq, droop = lb["r"], lb["squash"], lb["droop"]
    amp = lb["lumps"] * lump_scale
    z0, z1 = zrange
    nk = 1.0 + amp * 0.46

    def place(d):
        m = 1.0
        for ax, a in lb["bumps"]:
            m += amp * a * max(0.0, T.dot(d, ax)) ** 1.8
        m /= nk
        tf = _tuft(lb, d, lump_scale)
        r = R * m * tf
        x, y, z = d[0] * r, d[1] * r, d[2] * r * sq
        if d[2] < 0.0:
            sag = (-d[2]) ** 1.5
            z -= droop * R * sag
            x *= 1.0 + droop * 0.30 * sag
            y *= 1.0 + droop * 0.30 * sag
        p = (cx + x, cy + y, cz + z)
        th = (0.64 * (0.5 + 0.5 * d[2])
              + 0.30 * T.clamp01((p[2] - z0) / max(1e-6, z1 - z0))
              + max(-0.10, min(0.10, 0.26 * (m - 1.0)))
              + 0.9 * (tf - 1.0))
        return p, T.foliage(T.clamp01(T.clamp01(th) ** 1.26 * tone * lb.get("tone", 1.0)))

    T.blob(mesh, seg, rings, place)


def _shape(lb, d, lump_scale=1.0):
    """The offset of `_leafy`'s vertex for direction d from the lobe centre (no colour)."""
    amp = lb["lumps"] * lump_scale
    m = 1.0
    for ax, a in lb["bumps"]:
        m += amp * a * max(0.0, T.dot(d, ax)) ** 1.8
    m /= 1.0 + amp * 0.46
    if "tufts" in lb:
        m *= _tuft(lb, d, lump_scale)
    r = lb["r"] * m
    x, y, z = d[0] * r, d[1] * r, d[2] * r * lb["squash"]
    if d[2] < 0.0:
        sag = (-d[2]) ** 1.5
        z -= lb["droop"] * lb["r"] * sag
        x *= 1.0 + lb["droop"] * 0.30 * sag
        y *= 1.0 + lb["droop"] * 0.30 * sag
    return (x, y, z)


def _extent(lb):
    """(lowest z offset, highest z offset, farthest reach from the z axis) of a lobe's
    surface, sampled finer than any LOD tessellates it."""
    lo, hi, reach = 0.0, 0.0, 0.0
    dirs = [(0.0, 0.0, 1.0), (0.0, 0.0, -1.0)]
    for j in range(1, 12):
        phi = math.pi * j / 12
        for i in range(24):
            th = 2.0 * math.pi * i / 24
            dirs.append((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th),
                         math.cos(phi)))
    for d in dirs:
        x, y, z = _shape(lb, d)
        lo, hi = min(lo, z), max(hi, z)
        reach = max(reach, math.hypot(lb["c"][0] + x, lb["c"][1] + y))
    return lo, hi, reach


def _inside(lb, p):
    q = T.sub(p, lb["c"])
    q = (q[0], q[1], q[2] / max(1e-6, lb["squash"]))
    return T.length(q) < lb["r"] * 0.86


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"lobe": ((6, (12, 7)), (9, (11, 6)), (11, (10, 6)), (99, (9, 5))), "core": (8, 5),
        "stem": (5, 1), "flower": (5, 2), "lump": 1.0, "merge": None},
    1: {"lobe": ((6, (8, 5)), (9, (7, 4)), (12, (6, 4)), (99, (6, 4))), "core": (7, 4),
        "stem": (4, 0), "flower": (4, 2), "lump": 0.8, "merge": None},
    2: {"lobe": ((4, (6, 3)), (6, (5, 3)), (10, (5, 3)), (99, (5, 3))), "core": (4, 3),
        "stem": (3, 0), "flower": None, "lump": 0.55, "merge": 8},
}


def _seg(cfg, n):
    for upto, sr in cfg["lobe"]:
        if n <= upto:
            return sr
    return cfg["lobe"][-1][1]


def build(seed, lod=0, params=None):
    """Build one bush. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides plan
    entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    sides, per = cfg["stem"]
    for st in pl["stems"]:
        p0 = st["pts"][0]
        path = (T.catmull(st["pts"], per) if per
                else [(p0[0], p0[1], -0.02), st["pts"][-1]])   # straight: shallower root
        m = len(path)
        T.tube(mesh, path, [T.lerp(st["r0"], st["r1"], k / (m - 1)) for k in range(m)],
               sides, lambda u, mm: T.bark(0.2 + 0.5 * u))
    zr = (0.0, pl["top"])
    outer = [lb for lb in pl["lobes"] if not lb.get("core")]
    if cfg["merge"]:
        outer = T.merge_clouds(outer, cfg["merge"])
    seg = _seg(cfg, len(outer))
    for lb in outer:
        if "tufts" not in lb:                       # a merged lobe (LOD2) is smooth
            lb = dict(lb, tufts=[])
        _leafy(mesh, lb, seg[0], seg[1], zr, pl["tone"], cfg["lump"])
    for lb in pl["lobes"]:
        if lb.get("core"):
            T.cloud(mesh, lb, cfg["core"][0], cfg["core"][1], zr, pl["tone"], cfg["lump"])
    if cfg["flower"]:
        fs, fr = cfg["flower"]
        for bl in pl["blooms"]:
            lb = pl["lobes"][bl["lobe"]]
            for fl in bl["flowers"]:
                _flower(mesh, lb, fl, fs, fr, cfg["lump"])
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


def _bloom(t):
    """`sky horizon` -> `UI accent` as the probe's quadratic Bezier (stops W, L, L)."""
    W, L = T.hex_linear(PALETTE["bloomWarm"]), T.hex_linear(PALETTE["bloomLight"])
    s = T.clamp01(t)
    u = 1.0 - s
    return tuple(W[k] * u * u + L[k] * (1.0 - u * u) for k in range(3))


def _flower(mesh, lb, fl, seg, rings, lump_scale):
    """A small closed bud sitting on the lobe surface, half proud of it."""
    c = _surface(lb, fl["dir"], lump_scale)
    c = T.add(c, T.mul(fl["dir"], fl["s"] * 0.35))
    s = fl["s"]

    def place(d):
        p = (c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s * 0.72)
        return p, _bloom(0.35 + 0.6 * (0.5 + 0.5 * d[2]) * (0.7 + 0.3 * fl["t"]))
    T.blob(mesh, seg, rings, place)


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    lobes = pl["lobes"]
    reach = max(_extent(lb)[2] for lb in lobes)
    w = [lb["r"] ** 3 * lb["squash"] for lb in lobes]
    tw = sum(w)
    cx = sum(lb["c"][0] * wi for lb, wi in zip(lobes, w)) / tw
    cy = sum(lb["c"][1] * wi for lb, wi in zip(lobes, w)) / tw
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "habit": pl["habit"],
        "height": round(pl["top"], 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.75 * reach, 3),
        "lobes": sum(1 for lb in lobes if not lb.get("core")),
        "lopsided": round(math.hypot(cx, cy) / reach, 4),
        "bloom": len(pl["blooms"]),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
