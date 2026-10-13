"""B2 flowering shrub — a seeded shrub whose blossoms are the main read (docs/ASSET_PLAN.md
§B2, ROADMAP M5e).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Not flora/bush with flowers stuck on: the blossom *is* the structure. Four habits, each
with two growth variants, so seeds 1..8 fall in eight classes:

- **plume** (lilac / buddleia): a vase of woody branches, leaves along them, each ending in
  a long tapering panicle of florets. Variant 0 holds the panicles upright like candles;
  variant 1 lets them nod over and hang outward.
- **tiered** (lacecap viburnum): horizontal leafy layers on a short trunk, their tops
  crowded with flat lacecap flowers. Variant 0 a pagoda of three or four tiers narrowing
  upward; variant 1 a low, wide spread of two broad layers, the upper one set aside.
- **dome** (hydrangea / azalea): a low leafy cushion carpeted in round flower heads.
  Variant 0 a few big mop heads; variant 1 many small clusters.
- **spire** (lupin / delphinium): a basal leaf mound with tall woody stalks, each topped by
  a long knobbly spike of florets. Variant 0 a tight upright bundle; variant 1 a candelabra
  fanning out at different heights.

Every piece is a closed shell: tubes are capped, blobs have both poles. Spikes and
panicles end in a blunt rounded floret, never a point.

Colour
------
Stems are the one `bark` surface, leaves the `canopyDark -> canopyMid -> canopyLight`
ramp. Each seed flowers in one of three ART_BIBLE colourways, each a straight ramp between
two bible entries: **gold** and **flame** are the two ends of `sky horizon` -> `UI accent`
(flora/bush's warm pair), **blue** is `sky zenith` -> `water`. Both blossom ramps are
declared optional, because a seed carries one or the other.

Axes
----
Habit is stratified on pi - 3 (each habit twice in seeds 1..8), the variant on sqrt(6) - 2
(which splits every habit pair), the colourway on the golden ratio (thirds; also splits
every habit pair), size on the plastic number and density on 1/e.

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
NAME = "flowershrub"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
#: Blossoms are four ART_BIBLE entries: `sky horizon` and `UI accent` (the warm pair
#: flora/bush uses), `sky zenith` and `water` (the cool pair).
PALETTE = {**T.PALETTE, "bloomWarm": "#ff9044", "bloomLight": "#ffd479",
           "bloomDeep": "#0a1c4f", "bloomBlue": "#2d92ba"}
_WARM = ["bloomWarm", "bloomLight", "bloomLight"]
_BLUE = ["bloomDeep", "bloomBlue", "bloomBlue"]
PALETTE_ROLES = {"surfaces": ["bark"],
                 "ramps": [["canopyDark", "canopyMid", "canopyLight"], _WARM, _BLUE],
                 "optional": ["→".join(_WARM), "→".join(_BLUE)]}
#: `heads` counts the blossom units LOD0 draws (heads, lacecaps, spikes or panicles);
#: `bloomShare` is the blossoms' share of the surface area; `leafTop` is the top of the
#: leafy mass over the height (low where spikes or panicles rise clear of the leaves, near
#: 1 where the blossoms sit on the foliage).
METRIC_AXES = ["height", "width", "heads", "bloomShare", "leafTop"]
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 76.0,
         "ground": True, "gap": 0.40, "band": 1.0, "drop": 0.16}

PI_M3 = 0.14159265358979312        # pi - 3: the habit, each twice in seeds 1..8
SQRT6M2 = 0.4494897427831779       # sqrt(6) - 2: the variant, splits every habit pair
INV_E = 0.36787944117144233        # 1 / e: density
HABITS = ("plume", "tiered", "dome", "spire")
COLOURS = ("gold", "blue", "flame")
#: where on its ramp each colourway sits (t0 shade ... t1 sunlit)
COLOUR_T = {"gold": (0.55, 1.0), "flame": (0.0, 0.42), "blue": (0.50, 1.0)}

PARAMS = {
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: plume (vase of branches ending "
                        "in long panicles), tiered (horizontal leafy layers topped with flat lacecaps), "
                        "dome (leafy cushion carpeted in round heads), spire (leaf mound "
                        "with tall knobbly flower spikes)"),
    "variant": (0.0, 1.0, "stratified on sqrt(6) - 2, in halves: plume upright / nodding "
                          "panicles; tiered pagoda / low two-layer spread; dome few big "
                          "mop heads / many small clusters; spire tight bundle / fanned "
                          "candelabra"),
    "colour": (0.0, 1.0, "stratified on the golden ratio, in thirds: gold (UI accent), blue "
                         "(sky zenith -> water), flame (sky horizon)"),
    "size": (0.0, 1.0, "stratified on the plastic number: height within the habit's band "
                       "(plume 1.2-1.8 m, tiered 0.95-1.45 m pagoda or 0.55-0.85 m spread, dome "
                       "0.6-1.1 m, spire "
                       "1.1-1.8 m)"),
    "density": (0.0, 1.0, "stratified on 1/e: how many canes, branches, spikes or heads"),
    "tone": (0.92, 1.06, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


def _ramp(a, b, c, t):
    """Quadratic Bezier through three linear-light stops (the probe's ramp curve)."""
    s = T.clamp01(t)
    u = 1.0 - s
    return tuple(a[k] * u * u + b[k] * 2.0 * s * u + c[k] * s * s for k in range(3))


_LIN = {k: T.hex_linear(v) for k, v in PALETTE.items()}


def _bloom(colour, t):
    t0, t1 = COLOUR_T[colour]
    s = T.lerp(t0, t1, T.clamp01(t))
    r = _BLUE if colour == "blue" else _WARM
    return _ramp(_LIN[r[0]], _LIN[r[1]], _LIN[r[2]], s)


# ---------------------------------------------------------------- element constructors
def _leaf(rng, c, r, squash=None, res=None):
    """A small leafy clump: treekit's `cloud`."""
    bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.3, 0.9))),
              rng.range(0.5, 1.0)) for _ in range(6)]
    return {"kind": "leaf", "c": c, "r": r,
            "squash": squash if squash is not None else rng.range(0.62, 0.80),
            "droop": rng.range(0.03, 0.08), "lumps": rng.range(0.40, 0.60), "bumps": bumps,
            "tone": rng.range(0.86, 1.08), "res": res or {0: (6, 4), 1: (5, 3)}}


def _head(rng, c, r, res, florets=10, amp=0.26, squash=None):
    """A round blossom head: a sphere studded with floret bumps."""
    bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.5, 1.0))),
              rng.range(0.6, 1.0)) for _ in range(florets)]
    return {"kind": "head", "c": c, "r": r,
            "squash": squash if squash is not None else rng.range(0.80, 0.94),
            "bumps": bumps, "amp": amp, "res": res, "t": rng.range(0.0, 0.25)}


def _tube(kind, pts, prof, res, **kw):
    """A swept, capped tube through control points `pts`; `prof` is [(u, radius)] knots;
    `res[lod]` = (sides, samples per span)."""
    d = {"kind": kind, "pts": pts, "prof": prof, "res": res}
    d.update(kw)
    return d


def _prof_at(prof, u):
    for (u0, r0), (u1, r1) in zip(prof, prof[1:]):
        if u <= u1:
            return T.lerp(r0, r1, (u - u0) / max(1e-9, u1 - u0))
    return prof[-1][1]


def _up_normal(t):
    """Unit vector perpendicular to tangent t, as close to +z as possible."""
    n = T.sub((0.0, 0.0, 1.0), T.mul(t, t[2]))
    if T.length(n) < 1e-6:
        n = (1.0, 0.0, 0.0)
    return T.norm(n)


def _sample(pts, n=24):
    """Points along the catmull curve through pts with unit tangents, n per span."""
    path = T.catmull(pts, n)
    out = []
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        out.append((p, T.norm(T.sub(b, a)), i / (len(path) - 1)))
    return out


def _arc(samples):
    acc = [0.0]
    for (p, _, _), (q, _, _) in zip(samples, samples[1:]):
        acc.append(acc[-1] + T.length(T.sub(q, p)))
    return acc


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole shrub as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    habit_t = T.stratify(seed, PI_M3, 0.004, rng)
    var_t = T.stratify(seed, SQRT6M2, 0.004, rng)
    col_t = T.stratify(seed, T.GOLDEN, 0.002, rng)
    size = T.stratify(seed, T.PLASTIC, 0.05, rng)
    dens = T.stratify(seed, INV_E, 0.05, rng)
    tone = _p("tone", rng.next())
    habit = HABITS[min(3, int(habit_t * 4.0))]
    variant = 1 if var_t >= 0.5 else 0
    colour = COLOURS[min(2, int(col_t * 3.0))]
    az0 = rng.range(0.0, 2.0 * math.pi)
    pl = {"seed": seed, "habit": habit, "variant": variant, "colour": colour,
          "size": size, "density": dens, "tone": tone, "els": []}
    {"plume": _plume, "tiered": _tiered, "dome": _dome, "spire": _spire}[habit](
        rng, pl, size, dens, variant, az0)
    for i, el in enumerate(pl["els"]):
        el["id"] = i
    # nothing hangs more than 4 cm into the ground: lift any leaf or head that would
    for el in pl["els"]:
        if el["kind"] in ("leaf", "head"):
            sag = el.get("droop", 0.0) + el["squash"] * (1.0 + el.get("lumps", 0.0) * 0.3)
            low = el["c"][2] - el["r"] * sag
            if low < -0.04:
                c = el["c"]
                el["c"] = (c[0], c[1], c[2] - 0.04 - low)
    return pl


# ----- plume: a vase of branches ending in panicles
def _plume(rng, pl, size, dens, variant, az0):
    els = pl["els"]
    H = T.lerp(1.2, 1.8, size)
    n = int(round(T.lerp(4, 8, dens)))
    pl["H"] = H
    s = H / 1.5
    for i in range(n):
        az = az0 + i * 2.0 * math.pi / n + rng.range(-0.35, 0.35)
        e = math.radians(rng.range(56.0, 72.0))
        root = (math.cos(az) * 0.05, math.sin(az) * 0.05, -0.04)
        tipz = H * (rng.range(0.52, 0.64) if variant == 0 else rng.range(0.70, 0.84))
        L = tipz / math.sin(e) * 0.92
        p1 = T.add(root, T.mul(T.from_angles(az, e + 0.22), 0.34 * L))
        p2 = T.add(p1, T.mul(T.from_angles(az, e), 0.34 * L))
        tip = T.add(p2, T.mul(T.from_angles(az + rng.range(-0.2, 0.2), e - 0.12), 0.32 * L))
        tip = (tip[0], tip[1], max(tip[2], tipz))
        r0 = 0.022 * s
        els.append(_tube("stem", [root, p1, p2, tip], [(0.0, r0), (1.0, r0 * 0.5)],
                         {0: (5, 3), 1: (4, 1), 2: (3, 0)}))
        # leaves along the branch, alternate sides
        smp = _sample([root, p1, p2, tip], 8)
        for k, u in enumerate((0.40, 0.58, 0.76, 0.92)):
            p, t, _ = smp[int(u * (len(smp) - 1))]
            side = T.norm(T.cross(t, (0.0, 0.0, 1.0)))
            sgn = 1.0 if k % 2 == 0 else -1.0
            rl = rng.range(0.080, 0.105) * s
            c = T.add(p, T.add(T.mul(side, sgn * rl * 0.7), (0.0, 0.0, -rl * 0.1)))
            els.append(_leaf(rng, c, rl, res={0: (6, 3), 1: (5, 3)} if k == 2
                             else {0: (6, 3)}))
        # the panicle: a long knobbly cone of florets
        lp = H * (rng.range(0.26, 0.34) if variant == 0 else rng.range(0.32, 0.40))
        rmax = (rng.range(0.080, 0.100) if variant == 0 else rng.range(0.066, 0.080)) * s
        t_end = smp[-1][1]
        start = T.sub(tip, T.mul(t_end, rmax * 0.6))
        if variant == 0:
            ep = math.radians(rng.range(72.0, 86.0))
            q1 = T.add(start, T.mul(T.from_angles(az, ep - 0.15), lp * 0.5))
            q2 = T.add(q1, T.mul(T.from_angles(az, ep), lp * 0.5))
            pts = [start, q1, q2]
            prof = [(0.0, rmax * 0.70), (0.16, rmax), (0.50, rmax * 0.80), (0.82, rmax * 0.52),
                    (1.0, rmax * 0.32)]
        else:
            q1 = T.add(start, T.mul(T.from_angles(az, e - 0.35), lp * 0.36))
            q2 = T.add(q1, T.mul(T.from_angles(az, -0.10), lp * 0.34))
            q3 = T.add(q2, T.mul(T.from_angles(az, -1.05), lp * 0.32))
            pts = [start, q1, q2, q3]
            prof = [(0.0, rmax * 0.72), (0.22, rmax), (0.60, rmax * 0.80), (0.86, rmax * 0.55),
                    (1.0, rmax * 0.36)]
        els.append(_tube("bloom", pts, prof, {0: (8, 5), 1: (6, 4), 2: (3, 3)},
                         ring={0: rmax * 0.55, 1: rmax * 1.25, 2: 9.0},
                         florets=5, famp=0.26, t=rng.range(0.0, 0.2)))
    # a leafy heart at mid height so the vase is not bare sticks
    m = 3
    for j in range(m):
        a = az0 + 0.5 + j * 2.0 * math.pi / m
        rr = rng.range(0.20, 0.26) * s
        c = (math.cos(a) * 0.12 * s, math.sin(a) * 0.12 * s, H * rng.range(0.30, 0.40))
        els.append(_leaf(rng, c, rr, squash=0.75, res={0: (8, 5), 1: (6, 4)}))
        if j < 2:   # LOD2: the heart grows to stand for the leaves along the branches
            els.append(dict(els[-1], r=rr * 1.45, c=(c[0] * 1.3, c[1] * 1.3, c[2] + 0.06 * H),
                            squash=0.85, res={2: (6, 4)}))


# ----- tiered: horizontal leafy layers carrying flat lacecap flowers
def _tiered(rng, pl, size, dens, variant, az0):
    els = pl["els"]
    if variant == 0:            # pagoda: three or four tiers narrowing upward
        H = T.lerp(0.95, 1.45, size)
        A = T.lerp(0.62, 0.82, size)
        nt = 3 if dens < 0.5 else 4
        lo, shrink = 0.46, 0.60
    else:                       # spread: two broad low layers, the upper one set aside
        H = T.lerp(0.55, 0.85, size)
        A = T.lerp(0.95, 1.18, size)
        nt = 2
        lo, shrink = 0.55, 0.70
    pl["H"] = H
    s = T.lerp(0.9, 1.1, size)
    rd = T.lerp(0.090, 0.115, size)
    nd = 3 if dens < 0.5 else 4
    disc_h = rd * 0.45
    side = (math.cos(az0 + 1.3), math.sin(az0 + 1.3))
    top_z = H - disc_h * 1.6
    # the trunk: three stems from the root to the top tier
    for i in range(3):
        a = az0 + i * 2.0 * math.pi / 3 + rng.range(-0.3, 0.3)
        root = (math.cos(a) * 0.05, math.sin(a) * 0.05, -0.04)
        off = 0.0 if variant == 0 else 0.18 * A
        tip = (side[0] * off + math.cos(a) * 0.05, side[1] * off + math.sin(a) * 0.05,
               top_z - 0.05)
        mid = (T.lerp(root[0], tip[0], 0.4) + math.cos(a) * 0.04,
               T.lerp(root[1], tip[1], 0.4) + math.sin(a) * 0.04, tip[2] * 0.4)
        els.append(_tube("stem", [root, mid, tip], [(0.0, 0.040 * s), (1.0, 0.026 * s)],
                         {0: (5, 2), 1: (4, 1), 2: (3, 0)} if i == 0 else
                         {0: (5, 2), 1: (4, 1)}))
    for k in range(nt):
        f = k / (nt - 1)
        zt = H * T.lerp(lo, 1.0, f) - disc_h * 1.6          # the tier's top surface
        R = A * T.lerp(1.0, shrink, f)
        cx = side[0] * (0.18 * A * f if variant == 1 else 0.0)
        cy = side[1] * (0.18 * A * f if variant == 1 else 0.0)
        rp = R * 0.46
        sq = 0.36
        m = max(3, int(round(2.0 * math.pi * 0.60 * R / (1.15 * rp))))
        pads = [(cx, cy)]
        a0 = az0 + rng.range(0.0, 2.0 * math.pi)
        for j in range(m):
            a = a0 + j * 2.0 * math.pi / m + rng.range(-0.15, 0.15)
            rr = R * 0.60 * rng.range(0.9, 1.08)
            pads.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        for j, (px, py) in enumerate(pads):
            r = rp * (1.08 if j == 0 else rng.range(0.9, 1.08))
            c = (px, py, zt - r * sq * 0.85)
            lf = _leaf(rng, c, r, squash=sq,
                       res={0: (8, 4), 1: (6, 3), 2: (5, 3)} if j == 0 else
                       {0: (8, 4), 1: (5, 3)})
            lf["lumps"] *= 0.45
            lf["droop"] = 0.10
            els.append(lf)
            if j:
                # a branch from the trunk out to the pad, hidden at both ends
                b0 = (cx * 0.5, cy * 0.5, zt - 0.10 - 0.08 * H)
                els.append(_tube("stem", [b0, (px * 0.85, py * 0.85, c[2] - 0.01)],
                                 [(0.0, 0.016 * s), (1.0, 0.011 * s)],
                                 {0: (4, 1)}))
            # lacecaps on the pad's top
            aa = rng.range(0.0, 2.0 * math.pi)
            for q in range(nd + (1 if j == 0 else 0)):
                aa += 2.39996 + rng.range(-0.3, 0.3)
                rho = r * (0.0 if (q == 0 and j == 0) else rng.range(0.22, 0.66))
                hx, hy = px + math.cos(aa) * rho, py + math.sin(aa) * rho
                hz = c[2] + r * sq * math.sqrt(max(0.0, 1.0 - (rho / r) ** 2)) + rd * 0.05
                hr = rd * rng.range(0.85, 1.15)
                els.append(_head(rng, (hx, hy, hz), hr, {0: (6, 3)},
                                 florets=10, amp=0.30, squash=0.45))
                if q == 0:      # LOD1: one bigger cap per pad stands for the cluster
                    els.append(_head(rng, (px, py, c[2] + r * sq * 0.98), r * 0.55, {1: (5, 3)},
                                     florets=8, amp=0.22, squash=0.32))
        # LOD2: each tier one leaf plate and one blossom plate
        els.append(_leaf(rng, (cx, cy, zt - R * 0.2 * 0.85), R * 0.98, squash=0.2,
                         res={2: (6, 3)}))
        els[-1]["lumps"] = 0.0
        els.append(_head(rng, (cx, cy, zt - R * 0.2 * 0.85 + R * 0.98 * 0.2 * 0.35), R * 0.80,
                         {2: (6, 3)}, florets=6, amp=0.10, squash=0.18))


# ----- dome: a leafy cushion carpeted in round heads
def _dome(rng, pl, size, dens, variant, az0):
    els = pl["els"]
    H = T.lerp(0.60, 1.10, size)
    A = T.lerp(0.50, 0.75, size) * (1.12 if variant == 1 else 1.0)
    pl["H"] = H
    zb = 0.06
    if variant == 0:
        nh = int(round(T.lerp(6, 10, dens)))
        rh = A * T.lerp(0.34, 0.28, dens)
        hres = {0: (9, 6), 1: (6, 4), 2: (4, 3)}
    else:
        nh = int(round(T.lerp(16, 24, dens)))
        rh = A * T.lerp(0.19, 0.16, dens)
        hres = {0: (6, 4), 1: (5, 3)}
    Ae, He = A - rh * 0.9, H - zb - rh * 1.15
    # foliage: a core and a ring of lobes, sunk inside the envelope the heads sit on
    core = _leaf(rng, (0.0, 0.0, zb + 0.36 * He), 0.74 * Ae,
                 squash=min(0.9, He / Ae * 0.70), res={0: (9, 6), 1: (7, 4)})
    core["lumps"] *= 0.5
    els.append(core)
    # LOD2: one lobe filling the whole envelope, so the heads still sit on leaves
    rf = 0.90 * Ae
    sqf = (zb + 0.90 * He) / (2.0 * rf * (1.0 + 0.5 * core["droop"]))
    far = dict(core, c=(0.0, 0.0, rf * sqf * (1.0 + core["droop"] * 1.2) - 0.03), r=rf,
               lumps=0.15, squash=sqf, res={2: (7, 4)})
    els.append(far)
    m = 6
    for i in range(m):
        az = az0 + i * 2.0 * math.pi / m + rng.range(-0.25, 0.25)
        e = rng.range(0.10, 0.40)
        r = Ae * rng.range(0.40, 0.48)
        q = (Ae * math.cos(e) * math.cos(az), Ae * math.cos(e) * math.sin(az),
             zb + He * math.sin(e))
        q = T.sub(q, T.mul(T.norm((q[0], q[1], (q[2] - zb) * Ae / He)), r * 0.45))
        q = (q[0], q[1], max(q[2], r * 0.62))
        els.append(_leaf(rng, q, r, squash=0.72, res={0: (8, 5), 1: (6, 4)}))
    # heads: Fibonacci over the upper cap of the envelope, standing proud of the leaves
    sin_min = math.sin(math.radians(12.0 if variant == 0 else 6.0))
    for i in range(nh):
        sz = 1.0 - (i + 0.5) / nh * (1.0 - sin_min)
        e = math.asin(sz)
        az = az0 + 0.4 + i * 2.39996 + rng.range(-0.15, 0.15)
        r = rh * rng.range(0.86, 1.12)
        q = (Ae * math.cos(e) * math.cos(az), Ae * math.cos(e) * math.sin(az),
             zb + He * math.sin(e))
        nrm = T.norm((q[0] / Ae, q[1] / Ae, (q[2] - zb) / He))
        q = T.add(q, T.mul(nrm, 0.30 * r))
        els.append(_head(rng, q, r, hres, florets=18 if variant == 0 else 9,
                         amp=0.20 if variant == 0 else 0.28))
        if variant == 1 and i % 2 == 0:     # LOD2: half the clusters, each grown to cover
            els.append(dict(els[-1], r=r * 1.40, res={2: (4, 3)}))
    # short stems under the cushion
    ns = 4
    for i in range(ns):
        az = az0 + i * 2.0 * math.pi / ns + rng.range(-0.3, 0.3)
        root = (math.cos(az) * 0.04, math.sin(az) * 0.04, -0.04)
        top = (math.cos(az) * Ae * 0.35, math.sin(az) * Ae * 0.35, zb + 0.35 * He)
        mid = (T.lerp(root[0], top[0], 0.4), T.lerp(root[1], top[1], 0.4), zb + 0.08)
        els.append(_tube("stem", [root, mid, top], [(0.0, 0.026), (1.0, 0.016)],
                         {0: (5, 2), 1: (4, 1), 2: (3, 0)} if i == 0 else
                         {0: (5, 2), 1: (4, 1)}))


# ----- spire: a leaf mound with tall flower spikes
def _spire(rng, pl, size, dens, variant, az0):
    els = pl["els"]
    H = T.lerp(1.1, 1.8, size)
    pl["H"] = H
    n = int(round(T.lerp(3, 6, dens))) if variant == 0 else int(round(T.lerp(5, 8, dens)))
    s = T.lerp(0.95, 1.15, size)
    # basal mound
    mm = 5
    for j in range(mm):
        a = az0 + j * 2.0 * math.pi / mm + rng.range(-0.3, 0.3)
        rr = rng.range(0.24, 0.32) * s
        rho = rng.range(0.16, 0.26) * s
        sq = 0.64
        c = (math.cos(a) * rho, math.sin(a) * rho, rr * sq * 0.55)
        els.append(_leaf(rng, c, rr, squash=sq,
                         res={0: (8, 5), 1: (6, 4), 2: (5, 3)} if j < 2 else
                         ({0: (8, 5), 1: (6, 4)} if j < 3 else {0: (8, 5)})))
    for i in range(n):
        if variant == 0:
            az = az0 + i * 2.39996 + rng.range(-0.3, 0.3)
            rho0 = rng.range(0.02, 0.10)
            e = math.radians(rng.range(82.0, 88.0))
            h = H * (1.0 if i == 0 else rng.range(0.78, 0.96))
        else:
            az = az0 + (i / n) * 2.0 * math.pi + rng.range(-0.3, 0.3)
            rho0 = rng.range(0.04, 0.12)
            e = math.radians(rng.range(56.0, 74.0))
            h = H * (1.0 if i == 0 else rng.range(0.55, 0.90))
            if i == 0:
                e = math.radians(86.0)
        d = (math.cos(az), math.sin(az))
        root = (d[0] * rho0, d[1] * rho0, -0.04)
        spread = (h / math.tan(e)) * (0.75 if variant == 1 else 1.0)
        top = (root[0] + d[0] * spread, root[1] + d[1] * spread, h)
        # the stalk sets off at its lean and curves up: a candelabra, not a fan of sticks
        p1 = (root[0] + d[0] * spread * 0.45, root[1] + d[1] * spread * 0.45, h * 0.28)
        p2 = (root[0] + d[0] * spread * 0.85, root[1] + d[1] * spread * 0.85, h * 0.62)
        pts = [root, p1, p2, top]
        smp = _sample(pts, 12)
        arc = _arc(smp)
        L = arc[-1]
        rmax = rng.range(0.066, 0.082) * s
        bl = h * rng.range(0.42, 0.54)
        ub = 1.0 - (bl - rmax * 0.35) / L
        jb = next(q for q, a in enumerate(arc) if a >= ub * L)
        stalk = [smp[q][0] for q in range(0, jb + 1, 4)]
        if stalk[-1] != smp[jb][0]:
            stalk.append(smp[jb][0])
        r0 = 0.021 * s
        els.append(_tube("stem", stalk, [(0.0, r0), (1.0, r0 * 0.75)],
                         {0: (5, 2), 1: (4, 1), 2: (3, 0)}))
        bpts = [smp[q][0] for q in range(max(0, jb - 2), len(smp), 4)]
        if bpts[-1] != smp[-1][0]:
            bpts.append(smp[-1][0])
        prof = [(0.0, rmax * 0.70), (0.10, rmax), (0.40, rmax * 0.88), (0.75, rmax * 0.60),
                (0.92, rmax * 0.42), (1.0, rmax * 0.30)]
        els.append(_tube("bloom", bpts, prof, {0: (8, 5), 1: (6, 4), 2: (3, 3)},
                         ring={0: rmax * 0.62, 1: rmax * 1.4, 2: 9.0},
                         florets=5, famp=0.28, t=rng.range(0.0, 0.2)))
        # leaves up the bare stalk
        for k, u in enumerate((0.30, 0.52, 0.74)):
            uu = u * ub
            p, t, _ = smp[int(uu * (len(smp) - 1))]
            if p[2] < 0.30:
                continue
            side = T.norm(T.cross(t, (0.0, 0.0, 1.0)))
            sgn = 1.0 if (i + k) % 2 == 0 else -1.0
            rl = rng.range(0.065, 0.085) * s
            els.append(_leaf(rng, T.add(p, T.mul(side, sgn * rl * 0.65)), rl, squash=0.55,
                             res={0: (5, 3)}))


# ---------------------------------------------------------------- tessellation
def _tess(pl, lod):
    """Tessellate the plan into a treekit Mesh. Returns (mesh, bloom face ranges, leaf
    vertex ranges)."""
    mesh = T.Mesh()
    blooms = []
    leaves = []
    colour = pl["colour"]
    H = pl["H"]
    zr = (0.0, H)
    for el in pl["els"]:
        res = el["res"].get(lod)
        if not res:
            continue
        f0 = len(mesh.f)
        k = el["kind"]
        if k == "leaf":
            T.cloud(mesh, el, res[0], res[1], zr, pl["tone"], 1.0 if lod == 0 else 0.8)
            leaves.append((len(mesh.v) - 2 - (res[1] - 1) * res[0], len(mesh.v)))
        elif k == "head":
            _head_mesh(mesh, el, res[0], res[1], colour)
            blooms.append((f0, len(mesh.f)))
        else:
            _tube_mesh(mesh, el, res[0], res[1], colour, lod)
            if k == "bloom":
                blooms.append((f0, len(mesh.f)))
    return mesh, blooms, leaves


def _head_mesh(mesh, el, seg, rings, colour):
    cx, cy, cz = el["c"]
    R, sq, amp = el["r"], el["squash"], el["amp"]
    nk = 1.0 + amp * 0.5

    def place(d):
        m = 1.0
        for ax, a in el["bumps"]:
            m += amp * a * max(0.0, T.dot(d, ax)) ** 3.0
        m /= nk
        p = (cx + d[0] * R * m, cy + d[1] * R * m, cz + d[2] * R * m * sq)
        t = 0.30 + 0.45 * (0.5 + 0.5 * d[2]) + 0.9 * (m - 1.0) + el["t"]
        return p, _bloom(colour, t)
    T.blob(mesh, seg, rings, place)


def _tube_side(mesh, path, radii, sides, colour_fn, lobe_fn, side):
    """treekit's `tube`, but the ring's first axis is held to `side` (made perpendicular to
    the tangent) instead of a rotation-minimising frame, so a flat spray stays flat across
    its arch whatever its first tangent is. Same faces, same caps: a closed shell."""
    rings = []
    n = len(path)
    for i, (p, r) in enumerate(zip(path, radii)):
        t = T.norm(T.sub(path[min(n - 1, i + 1)], path[max(0, i - 1)]))
        fu = T.norm(T.sub(side, T.mul(t, T.dot(side, t))))
        fv = T.norm(T.cross(t, fu))
        u = i / max(1, n - 1)
        ring = []
        for k in range(sides):
            th = 2.0 * math.pi * k / sides
            m = lobe_fn(u, th)
            q = T.add(p, T.add(T.mul(fu, r * m * math.cos(th)), T.mul(fv, r * m * math.sin(th))))
            ring.append(mesh.vert(q, colour_fn(u, m)))
        rings.append(ring)
    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(sides):
            j = (k + 1) % sides
            mesh.face((a[k], a[j], b[j], b[k]))
    base, top = rings[0], rings[-1]
    for k in range(1, sides - 1):
        mesh.face((base[0], base[k + 1], base[k]))
        mesh.face((top[0], top[k], top[k + 1]))


def _resample(pts, spacing, min_rings):
    """Rings evenly spaced along the curve's arc length, `spacing` apart (at least
    `min_rings`), so florets are the same size on a short spike and a long one."""
    dense = T.catmull(pts, 16)
    acc = [0.0]
    for a, b in zip(dense, dense[1:]):
        acc.append(acc[-1] + T.length(T.sub(b, a)))
    L = acc[-1]
    n = max(min_rings, int(round(L / spacing)) + 1)
    out, j = [], 0
    for i in range(n):
        target = L * i / (n - 1)
        while j < len(acc) - 2 and acc[j + 1] < target:
            j += 1
        f = (target - acc[j]) / max(1e-9, acc[j + 1] - acc[j])
        out.append(tuple(T.lerp(dense[j][k], dense[j + 1][k], T.clamp01(f)) for k in range(3)))
    return out


def _tube_mesh(mesh, el, sides, per, colour, lod=0):
    if "ring" in el:
        path = _resample(el["pts"], el["ring"][lod], per)
    elif per == 0:
        path = [el["pts"][0], el["pts"][-1]]
    else:
        path = T.catmull(el["pts"], per) if len(el["pts"]) > 2 or per > 1 else list(el["pts"])
    m = len(path)
    radii = [_prof_at(el["prof"], i / (m - 1)) for i in range(m)]
    if el["kind"] == "stem":
        T.tube(mesh, path, radii, sides, lambda u, mm: T.bark(0.15 + 0.5 * u))
        return
    fl, fa, t0 = el.get("florets", 0), el.get("famp", 0.0), el.get("t", 0.0)
    bark_to = el.get("barkTo")

    flat = el.get("flat", 0.0)

    def lobe(u, th):
        j = int(round(u * (m - 1)))
        k = int(round(th / (2.0 * math.pi) * sides)) % sides
        w = 1.0 + flat * math.cos(2.0 * th)      # a flat spray is wider than it is deep
        if not fl or j == 0 or j == m - 1:
            return w            # the end rings stay convex, so the fan caps never fold
        # stacked whorls of florets: rings alternately swell and pinch, each vertex
        # nudged by an integer hash so no two whorls are the same
        hsh = ((j * 73856093) ^ (k * 19349663) ^ (el.get("id", 0) * 83492791)) % 1009
        return w * (1.0 + fa * (1.0 if j % 2 else -0.55) + 0.14 * (hsh / 1009.0 - 0.5))

    def col(u, mm):
        if bark_to is not None and u < bark_to:
            return T.bark(0.15 + 0.5 * u)
        return _bloom(colour, 0.25 + 0.45 * u + 1.6 * (mm - 1.0) + t0)
    if "side" in el:
        _tube_side(mesh, path, radii, sides, col, lobe, el["side"])
    else:
        T.tube(mesh, path, radii, sides, col, lobe if (fl or flat) else None)


def build(seed, lod=0, params=None):
    """Build one flowering shrub. seed: any int. lod: 0 / 1 / 2. `params` optionally
    overrides plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in (0, 1, 2):
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh, _, _ = _tess(pl, lod)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def _area(v, f):
    a = 0.0
    for face in f:
        p0 = v[face[0]]
        for k in range(1, len(face) - 1):
            a += 0.5 * T.length(T.cross(T.sub(v[face[k]], p0), T.sub(v[face[k + 1]], p0)))
    return a


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES), measured on the
    LOD0 tessellation itself."""
    pl = plan(int(seed))
    mesh, blooms, leaves = _tess(pl, 0)
    v = mesh.v
    reach = max(math.hypot(p[0], p[1]) for p in v)
    total = _area(v, mesh.f)
    bloom = sum(_area(v, mesh.f[a:b]) for a, b in blooms)
    els = pl["els"]
    heads = sum(1 for e in els if e["kind"] in ("head", "bloom") and 0 in e["res"])
    return {
        "seed": int(seed), "habit": pl["habit"], "variant": pl["variant"],
        "colour": pl["colour"],
        "height": round(max(p[2] for p in v), 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.75 * reach, 3),
        "heads": heads,
        "leafTop": round(max(v[i][2] for a, b in leaves for i in range(a, b))
                         / max(p[2] for p in v), 3),
        "stems": sum(1 for e in els if e["kind"] == "stem" and 0 in e["res"]),
        "bloomShare": round(bloom / total, 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
