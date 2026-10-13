"""B3 fallen leaves — a seeded scatter of leaf litter and twigs (docs/ASSET_PLAN.md §B3,
ROADMAP M5e).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Every leaf is a closed thin solid about two millimetres thick: an outline (base, both
margins, a blunt tip) fanned from a point on the midrib, top and bottom, with a wall round
the rim. Leaves cup, curl at the tip and fold along the midrib, each by its own amount,
so they catch the light one by one. Four arrangements:

- **drift**: a heap blown together, leaves stacked in layers over a low mound;
- **scatter**: a loose, even scatter, leaves lying flat on their own;
- **trail**: a windblown streak, long and narrow, leaves turned along the wind;
- **clumps**: two to four small piles with strays between them.

Leaves come in four shapes, one per seed (ovate, lance, round, heart). Some seeds carry
twigs: forked sticks lying among the leaves.

Colour
------
Season moves the litter from late summer (mostly green, the canopy ramp) through autumn
(`sky horizon` orange to `UI accent` gold) to dry (`dusk` brown), the three autumn stops
being one ramp, `dusk` -> `sky horizon` -> `UI accent`. Twigs run from `bark` to `rock mid`
(dead grey-brown wood). All three are declared optional: a seed may carry no green, and
half the seeds carry no twigs.

Axes
----
Arrangement is stratified on pi - 3 (each twice in seeds 1..8), twigs on sqrt(6) - 2
(which splits every arrangement pair), leaf shape on the golden ratio (quarters), season
on the plastic number and density on 1/e.

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
NAME = "fallenleaves"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: The prop row (STATE.md run 27). Ground cover is placed by the hundreds, so LOD0 stays
#: under 1000.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
PALETTE = {"canopyDark": T.PALETTE["canopyDark"], "canopyMid": T.PALETTE["canopyMid"],
           "canopyLight": T.PALETTE["canopyLight"],
           "leafDry": "#844e32", "leafOrange": "#ff9044", "leafGold": "#ffd479",
           "bark": T.PALETTE["bark"], "twigGrey": "#5a4a40"}
_GREEN = ["canopyDark", "canopyMid", "canopyLight"]
_AUTUMN = ["leafDry", "leafOrange", "leafGold"]
_TWIG = ["bark", "twigGrey", "twigGrey"]
PALETTE_ROLES = {"surfaces": [], "ramps": [_AUTUMN, _GREEN, _TWIG],
                 "optional": ["→".join(_AUTUMN), "→".join(_GREEN), "→".join(_TWIG)]}
#: `leaves` counts the leaves; `aspect` is the scatter's length over its width (a trail is
#: long); `height` is how high the litter is heaped; `warmth` is the mean colour's red
#: over green (green litter ~0.5, gold ~1.5, dry brown 2+).
METRIC_AXES = ["width", "aspect", "leaves", "height", "warmth"]
#: Flat cover needs a high camera: 42 degrees from straight down.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 42.0,
         "ground": True, "gap": 0.20, "band": 0.40, "drop": 0.0}

PI_M3 = 0.14159265358979312        # pi - 3: the arrangement, each twice in seeds 1..8
SQRT6M2 = 0.4494897427831779       # sqrt(6) - 2: twigs, splits every arrangement pair
INV_E = 0.36787944117144233        # 1 / e: density
HABITS = ("drift", "scatter", "trail", "clumps")
SHAPES = ("ovate", "lance", "round", "heart")
THICK = 0.0022

PARAMS = {
    "arrangement": (0.0, 1.0, "stratified on pi - 3, in quarters: drift (a heap in layers), "
                              "scatter (loose and flat), trail (a long windblown streak), "
                              "clumps (two to four small piles)"),
    "twigs": (0.0, 1.0, "stratified on sqrt(6) - 2: above 0.5, one to three forked twigs"),
    "shape": (0.0, 1.0, "stratified on the golden ratio, in quarters: ovate, lance (narrow), "
                        "round, heart (wide notched base)"),
    "season": (0.0, 1.0, "stratified on the plastic number: 0 late summer (mostly green) "
                         "... 0.5 autumn orange and gold ... 1 dry brown"),
    "density": (0.0, 1.0, "stratified on 1/e: how many leaves (20-30) and how big"),
}

#: (length in metres at size 1, width over length, where the widest point sits 0..1)
SHAPE_DIMS = {"ovate": (0.16, 0.55, 0.42), "lance": (0.19, 0.27, 0.38),
              "round": (0.13, 0.90, 0.50), "heart": (0.15, 0.80, 0.30)}


def _p(name, t):
    return T.param(PARAMS, name, t)


_LIN = {k: T.hex_linear(v) for k, v in PALETTE.items()}


def _ramp(names, t):
    return T.ramp3(_LIN[names[0]], _LIN[names[1]], _LIN[names[2]], t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole scatter as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    habit_t = T.stratify(seed, PI_M3, 0.004, rng)
    twig_t = T.stratify(seed, SQRT6M2, 0.004, rng)
    shape_t = T.stratify(seed, T.GOLDEN, 0.004, rng)
    # the green end is early autumn, never a plain green sprig: 0.15 .. 1
    season = 0.15 + 0.85 * T.stratify(seed, T.PLASTIC, 0.04, rng)
    dens = T.stratify(seed, INV_E, 0.05, rng)
    habit = HABITS[min(3, int(habit_t * 4.0))]
    shape = SHAPES[min(3, int(shape_t * 4.0))]
    twigs = twig_t >= 0.5
    wind = rng.range(0.0, 2.0 * math.pi)
    n = int(round(T.lerp(17, 22, dens))) - (3 if twigs else 0)
    scale = T.lerp(0.9, 1.25, 1.0 - dens) * (1.15 if habit == "drift" else 1.0)

    # where each leaf lies: (x, y, z of its rest surface, slope normal, yaw)
    spots = []
    if habit == "drift":
        Rp = T.lerp(0.25, 0.33, dens)
        hp = T.lerp(0.05, 0.08, dens)
        for i in range(n):
            a = i * 2.39996 + rng.range(-0.3, 0.3)
            d = Rp * math.sqrt((i + 0.5) / n) * rng.range(0.8, 1.15)
            x, y = math.cos(a) * d, math.sin(a) * d
            # the heap: a squashed dome, leaves stacked in order so later ones lie on top
            q = d / (Rp * 1.15)
            z = hp * max(0.0, 1.0 - q * q) + 0.0025 * (n - i) / n
            slope = 2.0 * hp * q / (Rp * 1.15)
            spots.append((x, y, z, (math.cos(a) * slope, math.sin(a) * slope),
                          rng.range(0.0, 2.0 * math.pi)))
        spots.reverse()             # outer, lower leaves first; the crown last, on top
    elif habit == "scatter":
        Rs = T.lerp(0.40, 0.52, dens)
        for i in range(n):
            a = i * 2.39996 + rng.range(-0.4, 0.4)
            d = Rs * math.sqrt((i + 0.5) / n) * rng.range(0.85, 1.1)
            spots.append((math.cos(a) * d, math.sin(a) * d, 0.0025 * (i % 3), (0.0, 0.0),
                          rng.range(0.0, 2.0 * math.pi)))
    elif habit == "trail":
        L = T.lerp(0.52, 0.70, dens)
        W = T.lerp(0.14, 0.20, dens)
        ux, uy = math.cos(wind), math.sin(wind)
        for i in range(n):
            s = (i + rng.range(0.0, 1.0)) / n * 2.0 - 1.0
            w = rng.range(-1.0, 1.0) * W * (1.0 - 0.5 * abs(s)) + W * 0.35 * math.sin(s * 2.4)
            x, y = ux * s * L - uy * w, uy * s * L + ux * w
            # turned along the wind, within ~25 degrees, base upwind
            spots.append((x, y, 0.0025 * (i % 3), (0.0, 0.0), wind + rng.range(-0.45, 0.45)))
    else:   # clumps
        m = 2 if dens < 0.33 else (3 if dens < 0.66 else 4)
        centres = []
        for j in range(m):
            a = wind + j * 2.0 * math.pi / m + rng.range(-0.4, 0.4)
            d = T.lerp(0.24, 0.32, dens) * rng.range(0.8, 1.1)
            centres.append((math.cos(a) * d, math.sin(a) * d))
        for i in range(n):
            if i % 6 == 5:      # strays between the piles
                a = rng.range(0.0, 2.0 * math.pi)
                d = rng.range(0.1, 0.5)
                spots.append((math.cos(a) * d, math.sin(a) * d, 0.0, (0.0, 0.0),
                              rng.range(0.0, 2.0 * math.pi)))
                continue
            cx, cy = centres[i % m]
            a = rng.range(0.0, 2.0 * math.pi)
            d = rng.range(0.0, 0.13)
            q = d / 0.17
            z = 0.035 * (1.0 - q * q) + 0.002 * (i // m)
            slope = 2.0 * 0.035 * q / 0.17
            spots.append((cx + math.cos(a) * d, cy + math.sin(a) * d, z,
                          (math.cos(a) * slope, math.sin(a) * slope),
                          rng.range(0.0, 2.0 * math.pi)))

    ln0, wr, wpos = SHAPE_DIMS[shape]
    leaves = []
    for (x, y, z, sl, yaw) in spots:
        ln = ln0 * scale * rng.range(0.78, 1.18)
        # season: each leaf's own colour, around the seed's season
        s = T.clamp01(season + rng.range(-0.22, 0.22))
        if s < 0.30:        # green, some turning
            ramp, t = "green", T.lerp(0.35, 0.95, rng.next())
            if rng.next() < 0.58 + s / 0.30 * 0.35:
                ramp, t = "autumn", rng.range(0.70, 1.0)
        elif s < 0.72:      # autumn: orange and gold
            ramp, t = "autumn", T.lerp(0.40, 1.0, rng.next()) * T.lerp(1.0, 0.85, s)
        else:               # dry: brown, a little orange left
            ramp, t = "autumn", T.lerp(0.02, 0.38, rng.next())
        leaves.append({"x": x, "y": y, "z": z, "slope": sl, "yaw": yaw, "len": ln,
                       "wid": ln * wr * rng.range(0.88, 1.12), "wpos": wpos,
                       "cup": rng.range(0.08, 0.22), "fold": rng.range(0.18, 0.36),
                       "curl": rng.range(0.0, 0.12), "ramp": ramp, "t": t,
                       "stalk": rng.range(0.14, 0.24), "stalkAz": rng.range(-0.3, 0.3),
                       "tilt": (rng.range(-0.12, 0.12), rng.range(-0.12, 0.12))})

    if habit in ("drift", "clumps"):
        # a pile is stacked, not interpenetrating: each leaf, flatter than a lone one, rests
        # on top of the earlier leaves it overlaps
        for j, lf in enumerate(leaves):
            lf["cup"] *= 0.45
            lf["curl"] *= 0.3
            lf["fold"] *= 0.55
            sl = math.hypot(lf["slope"][0] + lf["tilt"][0], lf["slope"][1] + lf["tilt"][1])
            lf["relief"] = (lf["cup"] * lf["wid"] + lf["curl"] * lf["len"]
                            + sl * 0.5 * lf["len"])
            z = lf["z"]
            for o in leaves[:j]:
                if math.hypot(lf["x"] - o["x"], lf["y"] - o["y"]) < 0.42 * (lf["len"]
                                                                          + o["len"]):
                    z = max(z, o["z"] + 0.55 * o["relief"] + THICK + 0.001)
            lf["z"] = z

    tw = []
    if twigs:
        k = 1 if dens < 0.4 else (2 if dens < 0.75 else 3)
        for j in range(k):
            a = wind + 0.8 + j * 2.1 + rng.range(-0.3, 0.3)
            Lt = rng.range(0.32, 0.50)
            r = rng.range(0.006, 0.009)
            c = (rng.range(-0.15, 0.15), rng.range(-0.15, 0.15))
            p0 = (c[0] - math.cos(a) * Lt * 0.5, c[1] - math.sin(a) * Lt * 0.5)
            bend = rng.range(-0.25, 0.25)
            pts = []
            for q in range(4):
                f = q / 3.0
                aa = a + bend * (f - 0.5)
                pts.append((p0[0] + math.cos(aa) * Lt * f, p0[1] + math.sin(aa) * Lt * f,
                            r * 0.9 + 0.004 * math.sin(math.pi * f)))
            fork_f = rng.range(0.40, 0.65)
            fa = a + (1.0 if rng.next() < 0.5 else -1.0) * rng.range(0.45, 0.75)
            fp = (T.lerp(pts[1][0], pts[2][0], fork_f - 0.33),
                  T.lerp(pts[1][1], pts[2][1], fork_f - 0.33), r * 0.8)
            fl = Lt * rng.range(0.28, 0.42)
            fork = [fp, (fp[0] + math.cos(fa) * fl * 0.5, fp[1] + math.sin(fa) * fl * 0.5,
                         r * 0.7), (fp[0] + math.cos(fa) * fl, fp[1] + math.sin(fa) * fl,
                                    r * 0.6)]
            tw.append({"pts": pts, "r": r, "fork": fork, "t": rng.range(0.1, 0.6)})
    return {"seed": seed, "habit": habit, "shape": shape, "twigs": twigs, "season": season,
            "density": dens, "leaves": leaves, "twigsList": tw}


# ---------------------------------------------------------------- tessellation
#: outline points per leaf side, per LOD (plus a base and a blunt two-point tip), and
#: which leaves LOD2 keeps
_LOD = {0: {"side": 3, "twig": (4, 1), "stalk": True}, 1: {"side": 2, "twig": (4, 1),
                                                         "stalk": False},
        2: {"side": 1, "twig": (3, 0), "stalk": False}}


def _outline(lf, side):
    """The leaf's outline in its own frame (u along the leaf from the base, v across),
    counter-clockwise seen from above: base, one margin, a blunt tip, the other margin."""
    L, W, wp = lf["len"], lf["wid"], lf["wpos"]

    def half(u):
        if u <= wp:
            return 0.5 * W * math.sin(0.5 * math.pi * (u / wp)) ** 0.8
        return 0.5 * W * math.cos(0.5 * math.pi * (u - wp) / (1.0 - wp)) ** 0.9

    us = [0.20 + 0.66 * (k / max(1, side - 1)) for k in range(side)] if side > 1 else [wp]
    right = [(u * L, -max(half(u), 0.06 * W)) for u in us]
    tip = [(0.965 * L, -0.11 * W), (0.965 * L, 0.11 * W)]     # blunt, never a needle
    left = [(u * L, max(half(u), 0.06 * W)) for u in reversed(us)]
    base = [(0.0, 0.0)] if lf.get("shapeName") != "heart" else [(0.07 * L, 0.0)]
    return base + right + tip + left


def _leaf(mesh, lf, side, shape, stalk):
    lf = dict(lf, shapeName=shape)
    pts = _outline(lf, side)
    L, W = lf["len"], lf["wid"]
    cy, sy = math.cos(lf["yaw"]), math.sin(lf["yaw"])
    gx, gy = lf["slope"][0] + lf["tilt"][0], lf["slope"][1] + lf["tilt"][1]

    def world(u, v, lift):
        # cupped margins, a tip curling up, a midrib fold
        z = (lf["cup"] * W * (2.0 * abs(v) / W) ** 2 + lf["curl"] * L * (u / L) ** 3
             - lf["fold"] * W * 0.3 * (1.0 - 2.0 * abs(v) / W))
        x = lf["x"] + (u - 0.45 * L) * cy - v * sy
        y = lf["y"] + (u - 0.45 * L) * sy + v * cy
        # rest on the heap's slope (a plane through the leaf's spot)
        zz = lf["z"] + z + gx * (x - lf["x"]) + gy * (y - lf["y"]) + lift
        return (x, y, max(zz, lift - 0.0005))

    names = _AUTUMN if lf["ramp"] == "autumn" else _GREEN

    def col(u, v, top):
        # the midrib (v = 0) runs a shade darker than the blade
        rib = -0.10 if abs(v) < 1e-9 else 0.0
        t = lf["t"] + (0.06 if top else -0.10) + 0.05 * (u / L - 0.5) + rib
        return _ramp(names, T.clamp01(t))

    c_u = 0.45 * L
    top_pole = mesh.vert(world(c_u, 0.0, THICK), col(c_u, 0.0, True))
    bot_pole = mesh.vert(world(c_u, 0.0, 0.0), col(c_u, 0.0, False))
    tops = [mesh.vert(world(u, v, THICK), col(u, v, True)) for u, v in pts]
    bots = [mesh.vert(world(u, v, 0.0), col(u, v, False)) for u, v in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        mesh.face((top_pole, tops[i], tops[j]))
        mesh.face((bot_pole, bots[j], bots[i]))
        mesh.face((tops[i], bots[i], bots[j], tops[j]))
    if stalk:   # the petiole: what makes a leaf a leaf and not a chip
        u0 = pts[0][0]
        a = lf["stalkAz"]
        p0 = world(u0 + 0.02 * L, 0.0, THICK * 0.5)
        p1 = world(u0 - lf["stalk"] * L * math.cos(a), lf["stalk"] * L * math.sin(a),
                   THICK * 0.5)
        T.tube(mesh, [p0, (p1[0], p1[1], max(p1[2], 0.0028))], [0.0036, 0.0026], 3,
               lambda uu, mm: _ramp(names, T.clamp01(lf["t"] - 0.18)))


def _tess(pl, lod):
    cfg = _LOD[lod]
    mesh = T.Mesh()
    leaves = pl["leaves"]
    if lod == 2:    # the far LOD keeps every other leaf, a little larger
        leaves = [dict(lf, len=lf["len"] * 1.2, wid=lf["wid"] * 1.2)
                  for k, lf in enumerate(leaves) if k % 2 == 0]
    for lf in leaves:
        _leaf(mesh, lf, cfg["side"], pl["shape"], cfg["stalk"])
    sides, per = cfg["twig"]
    for tw in pl["twigsList"]:
        for path, r0, r1 in ((tw["pts"], tw["r"], tw["r"] * 0.55),
                             (tw["fork"], tw["r"] * 0.7, tw["r"] * 0.45)):
            if lod == 2 and path is tw["fork"]:
                continue
            p = T.catmull(path, per) if per else [path[0], path[-1]]
            m = len(p)
            T.tube(mesh, p, [T.lerp(r0, r1, k / (m - 1)) for k in range(m)], sides,
                   lambda u, mm, tw=tw: _ramp(_TWIG, T.clamp01(tw["t"] + 0.3 * u)))
    return mesh


def build(seed, lod=0, params=None):
    """Build one leaf scatter. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
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
    # length over width along the scatter's own principal axes
    n = len(v)
    mx = sum(p[0] for p in v) / n
    my = sum(p[1] for p in v) / n
    sxx = sum((p[0] - mx) ** 2 for p in v) / n
    syy = sum((p[1] - my) ** 2 for p in v) / n
    sxy = sum((p[0] - mx) * (p[1] - my) for p in v) / n
    tr, det = sxx + syy, sxx * syy - sxy * sxy
    l1 = tr / 2.0 + math.sqrt(max(0.0, tr * tr / 4.0 - det))
    l2 = tr / 2.0 - math.sqrt(max(0.0, tr * tr / 4.0 - det))
    r = sum(c[0] for c in mesh.c) / len(mesh.c)
    g = sum(c[1] for c in mesh.c) / len(mesh.c)
    return {
        "seed": int(seed), "arrangement": pl["habit"], "shape": pl["shape"],
        "twigs": len(pl["twigsList"]),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(2.0 * reach, 3),
        "aspect": round(math.sqrt(l1 / max(1e-9, l2)), 3),
        "leaves": len(pl["leaves"]),
        "height": round(max(p[2] for p in v), 4),
        "warmth": round(r / max(1e-6, g), 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
