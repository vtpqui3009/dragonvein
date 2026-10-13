"""B3 lichen — a seeded crusty patch for rocks and bark (docs/ASSET_PLAN.md §B3, ROADMAP M5e).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A flat patch at z = 0 meant to be laid on a rock face or a trunk. Every piece is a closed
thin solid a few millimetres thick (treekit's `lobed_patch`, or a closed shell of
revolution for the cups), never a plane. Four habits:

- **rosette** (foliose, Parmelia / Xanthoria): one to three rosettes of radiating lobes
  with round, slightly up-curled tips, the old centre darker than the growing margin;
- **crust** (crustose map lichen): a cracked mosaic of flat areolae inside a ragged
  outline, ground showing in the cracks;
- **ring**: an old colony dead in the middle, a ring of radial lobes round a bare centre;
- **cups** (Cladonia pyxie cups): a crust of small leafy scales with goblets standing up
  out of it.

Half the seeds carry a second tier: a smaller rosette on top of the first, round fruiting
discs (apothecia) on the crust and the ring, cups growing out of the rims of cups.

Colour
------
Two colourways, each a three-stop ramp of ART_BIBLE entries, declared optional because a
seed carries one: **pale** `rock mid` -> `foliage light` -> `UI accent` (olive in the old
centre, pale yellow-green on the margins, like Flavoparmelia) and **orange** `dusk` ->
`sky horizon` -> `UI accent` (Xanthoria's orange crust).

Axes
----
Habit is stratified on pi - 3 (each habit twice in seeds 1..8), the colourway on
sqrt(6) - 2 (which splits every habit pair), the tier on the golden ratio, size on the
plastic number and lobing on 1/e.

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
NAME = "lichen"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: The prop row (STATE.md run 27). Ground cover is placed by the hundreds, so LOD0 stays
#: under 1000.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
PALETTE = {"lichenBase": "#5a4a40", "lichenGreen": "#8fd24a", "lichenPale": "#ffd479",
           "lichenRust": "#844e32", "lichenOrange": "#ff9044"}
_PALE = ["lichenBase", "lichenGreen", "lichenPale"]
_ORANGE = ["lichenRust", "lichenOrange", "lichenPale"]
PALETTE_ROLES = {"surfaces": [], "ramps": [_PALE, _ORANGE],
                 "optional": ["→".join(_PALE), "→".join(_ORANGE)]}
#: `pieces` counts separate lichen bodies (rosettes, areolae, ring lobes, scales and cups
#: are each one); `height` is the relief (millimetres for a crust, centimetres for cups);
#: `warmth` is the mean colour's red over green (pale ~1, orange ~2.5+).
METRIC_AXES = ["width", "height", "pieces", "warmth", "cover"]
#: Flat cover needs a high camera: 38 degrees from straight down.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 38.0,
         "ground": True, "gap": 0.10, "band": 0.24, "drop": 0.0}

PI_M3 = 0.14159265358979312        # pi - 3: the habit, each twice in seeds 1..8
SQRT6M2 = 0.4494897427831779       # sqrt(6) - 2: the colourway, splits every habit pair
INV_E = 0.36787944117144233        # 1 / e: lobing
HABITS = ("rosette", "crust", "ring", "cups")
SINK = -0.002                      # the flat bottom, just under the surface it grows on
EDGE = 0.0015

PARAMS = {
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: rosette (radiating round-tipped "
                        "lobes), crust (a cracked map of flat areolae), ring (radial lobes "
                        "round a dead centre), cups (scales with standing goblets)"),
    "colour": (0.0, 1.0, "stratified on sqrt(6) - 2, in halves: pale (rock mid -> foliage "
                         "light -> UI accent) or orange (dusk -> sky horizon -> UI accent)"),
    "tier": (0.0, 1.0, "stratified on the golden ratio, in halves: a second tier (a rosette "
                       "on the rosette, fruiting discs, cups on cups)"),
    "size": (0.0, 1.0, "stratified on the plastic number: 0.15-0.5 m across"),
    "lobing": (0.0, 1.0, "stratified on 1/e: lobe count and how ragged the outline is"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


_LIN = {k: T.hex_linear(v) for k, v in PALETTE.items()}


def _col(pl, t):
    r = _ORANGE if pl["colour"] == "orange" else _PALE
    return T.ramp3(_LIN[r[0]], _LIN[r[1]], _LIN[r[2]], t)


# ---------------------------------------------------------------- pieces
def _angdiff(a, b):
    d = (a - b) % (2.0 * math.pi)
    return d - 2.0 * math.pi if d > math.pi else d


def _piece(c, R0, thick, res, **kw):
    d = {"c": c, "R0": R0, "thick": thick, "res": res, "lift": 0.0, "harm": [],
         "lobes": None, "core": 1.0, "stretch": None, "curl": 0.0, "ridge": 0,
         "t0": 0.3, "tr": 0.3, "kind": "plate"}
    d.update(kw)
    return d


def _radius(pc, th):
    r = pc["R0"]
    for k, a, ph in pc["harm"]:
        r += a * math.cos(k * th + ph)
    if pc["lobes"]:
        # round-tipped lobes: a semicircle in angle, so every tip is blunt
        g = 0.0
        for az, ln, w in pc["lobes"]:
            x = _angdiff(th, az) / w
            if abs(x) < 1.0:
                g = max(g, ln * math.sqrt(1.0 - x * x))
        r *= pc["core"] + (1.0 - pc["core"]) * g
    if pc["stretch"]:
        az, e = pc["stretch"]
        cth, sth = math.cos(th - az), math.sin(th - az)
        r *= 1.0 / math.sqrt((cth / (1.0 + e)) ** 2 + (sth / (1.0 - 0.45 * e)) ** 2)
    return max(0.15 * pc["R0"], r)


def _top_fn(pl, pc):
    def fn(f, th):
        h = pc["thick"] * (0.55 + 0.45 * f)
        h += pc["thick"] * pc["curl"] * T.smoothstep((f - 0.72) / 0.28)
        rid = math.cos(pc["ridge"] * th) if pc["ridge"] else 0.0
        h += 0.25 * pc["thick"] * rid * f
        t = pc["t0"] + pc["tr"] * f + 0.06 * rid
        return pc["lift"] + EDGE + h, _col(pl, T.clamp01(t))
    return fn


def _rosette(rng, c, R0, nl, rag, thick, res, t0):
    lobes = []
    a0 = rng.range(0.0, 2.0 * math.pi)
    for j in range(nl):
        az = a0 + j * 2.0 * math.pi / nl + rng.range(-0.12, 0.12)
        lobes.append((az, rng.range(0.70, 1.0), (math.pi / nl) * rng.range(1.05, 1.35)))
    harm = [(k, R0 * rag * rng.range(0.02, 0.06), rng.range(0.0, 6.3)) for k in (2, 3)]
    return _piece(c, R0, thick, res, lobes=lobes, harm=harm, core=rng.range(0.40, 0.52),
                  curl=rng.range(0.6, 1.1), ridge=nl, t0=t0, tr=0.40)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole patch as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    habit_t = T.stratify(seed, PI_M3, 0.004, rng)
    col_t = T.stratify(seed, SQRT6M2, 0.004, rng)
    tier_t = T.stratify(seed, T.GOLDEN, 0.004, rng)
    size = T.stratify(seed, T.PLASTIC, 0.05, rng)
    rag = T.stratify(seed, INV_E, 0.05, rng)
    habit = HABITS[min(3, int(habit_t * 4.0))]
    colour = "orange" if col_t >= 0.5 else "pale"
    tier = tier_t >= 0.5
    t0 = rng.range(0.16, 0.30)
    az0 = rng.range(0.0, 2.0 * math.pi)
    P, cups = [], []
    if habit == "rosette":
        R0 = T.lerp(0.10, 0.17, size)
        nl = int(round(T.lerp(9, 15, rag)))
        P.append(_rosette(rng, (0.0, 0.0), R0, nl, rag, 0.005, {0: (56, 2), 1: (32, 2),
                                                                2: (20, 1)}, t0))
        for j in range(1 if rag < 0.5 else 2):
            a = az0 + j * 2.4
            r = R0 * rng.range(0.45, 0.62)
            d = R0 * 0.95 + r * 0.55
            P.append(_rosette(rng, (math.cos(a) * d, math.sin(a) * d), r,
                              int(round(nl * 0.7)), rag, 0.004,
                              {0: (32, 2), 1: (20, 2), 2: (12, 1)}, t0 + 0.04))
        if tier:    # a younger rosette on top of the old one
            top = _rosette(rng, (R0 * 0.12, -R0 * 0.08), R0 * 0.48, int(round(nl * 0.8)), rag,
                           0.004, {0: (40, 2), 1: (22, 2), 2: (12, 1)}, t0 + 0.10)
            top["lift"] = 0.006
            P.append(top)
    elif habit == "crust":
        R0 = T.lerp(0.13, 0.20, size)
        g = T.lerp(0.054, 0.068, size)
        harm = [(k, R0 * T.lerp(0.10, 0.22, rag) * rng.range(0.4, 1.0) / (k - 1),
                 rng.range(0.0, 6.3)) for k in (2, 3, 4, 5)]
        out = _piece((0.0, 0.0), R0, 0.0, {}, harm=harm)
        rows = int(R0 / (g * 0.866)) + 1
        for i in range(-rows, rows + 1):
            for j in range(-rows - 1, rows + 2):
                x = (j + 0.5 * (i % 2)) * g + rng.range(-0.18, 0.18) * g
                y = i * g * 0.866 + rng.range(-0.18, 0.18) * g
                th = math.atan2(y, x) % (2.0 * math.pi)
                f = math.hypot(x, y) / _radius(out, th)
                if f > 1.0:
                    continue
                # areolae of uneven size, irregular outline, cracks a few millimetres wide
                r = g * rng.range(0.46, 0.62) * (1.0 - 0.40 * max(0.0, f - 0.6))
                hh = [(k, r * rng.range(0.06, 0.16), rng.range(0.0, 6.3)) for k in (2, 3, 5)]
                P.append(_piece((x, y), r, rng.range(0.0018, 0.0034),
                                {0: (7, 1), 1: (5, 1), **({2: (5, 1)} if (i + j) % 3 == 0
                                                         else {})},
                                harm=hh, t0=t0 + 0.10 + rng.range(-0.06, 0.10) - 0.12 * f,
                                tr=0.10, curl=0.3))
                if (i + j) % 3 == 0:    # LOD2: one areola in three stands for its neighbours
                    P[-1]["lod2R"] = r * 1.8
    elif habit == "ring":
        Rr = T.lerp(0.09, 0.15, size)
        nl = int(round(T.lerp(16, 21, rag)))
        for j in range(nl):
            a = az0 + j * 2.0 * math.pi / nl + rng.range(-0.08, 0.08)
            rr = Rr * rng.range(0.94, 1.06)
            ln = Rr * rng.range(0.34, 0.46)
            P.append(_piece((math.cos(a) * rr, math.sin(a) * rr), ln * 0.60, 0.004,
                            {0: (9, 1), 1: (6, 1), **({2: (5, 1)} if j % 2 == 0 else {})},
                            stretch=(a, 0.42), curl=1.0, t0=t0 + 0.05, tr=0.30,
                            harm=[(3, ln * 0.04, rng.range(0.0, 6.3))],
                            lod2R=ln * 0.55 * 1.25 if j % 2 == 0 else None))
        # fragments of the old colony scattered in the centre
        for j in range(int(round(T.lerp(3, 5, rag)))):
            a = rng.range(0.0, 2.0 * math.pi)
            d = Rr * rng.range(0.1, 0.5)
            P.append(_piece((math.cos(a) * d, math.sin(a) * d), Rr * rng.range(0.07, 0.11),
                            0.0025, {0: (7, 1), 1: (5, 1)},
                            harm=[(3, Rr * 0.02, rng.range(0.0, 6.3))], t0=t0 - 0.06, tr=0.1))
    else:   # cups
        R0 = T.lerp(0.11, 0.17, size)
        ns = int(round(T.lerp(9, 12, rag)))
        for j in range(ns):
            a = az0 + j * 2.39996 + rng.range(-0.2, 0.2)
            d = R0 * 0.80 * math.sqrt((j + 0.5) / ns)
            r = R0 * rng.range(0.19, 0.26)
            # small scales, deeply notched: a leafy crust, not a lily pad
            P.append(_rosette(rng, (math.cos(a) * d, math.sin(a) * d), r, 5, 0.3, 0.003,
                              {0: (10, 1), 1: (6, 1), **({2: (5, 1)} if j % 3 == 0 else {})},
                              t0 - 0.04))
            P[-1]["lod2R"] = r * 1.7 if j % 3 == 0 else None
        nc = int(round(T.lerp(4, 6, size)))
        for j in range(nc):
            a = az0 + 0.7 + j * 2.39996 + rng.range(-0.3, 0.3)
            d = R0 * 0.75 * math.sqrt((j + 0.3) / nc)
            h = rng.range(0.030, 0.055) * T.lerp(0.9, 1.15, size)
            rr = h * rng.range(0.36, 0.46)
            base = (math.cos(a) * d, math.sin(a) * d, 0.0)
            cups.append({"base": base, "h": h, "rr": rr, "lean": (rng.range(-0.12, 0.12),
                                                                    rng.range(-0.12, 0.12)),
                         "t": rng.range(0.0, 0.15), "lod2": j < 4})
            if tier and j % 2 == 0:     # a cup growing out of this cup's rim
                aa = rng.range(0.0, 2.0 * math.pi)
                b2 = (base[0] + math.cos(aa) * rr * 0.75, base[1] + math.sin(aa) * rr * 0.75,
                      h - 0.004)
                cups.append({"base": b2, "h": h * 0.55, "rr": rr * 0.65,
                             "lean": (math.cos(aa) * 0.25, math.sin(aa) * 0.25),
                             "t": rng.range(0.1, 0.25), "lod2": False})
    # fruiting discs (apothecia) on the crust and the ring
    discs = []
    if tier and habit in ("crust", "ring"):
        hosts = [pc for pc in P if pc["R0"] > 0.012]
        nd = int(round(T.lerp(6, 10, rag)))
        for j in range(nd):
            pc = hosts[(j * 7 + 3) % len(hosts)]
            rd = rng.range(0.008, 0.013)
            discs.append(_piece((pc["c"][0] + rng.range(-0.3, 0.3) * pc["R0"],
                                 pc["c"][1] + rng.range(-0.3, 0.3) * pc["R0"]), rd, 0.003,
                                {0: (7, 1), 1: (5, 1)}, lift=pc["thick"] + 0.0005,
                                t0=0.04 if colour == "pale" else 0.62, tr=-0.03, curl=1.6,
                                kind="disc"))
    return {"seed": seed, "habit": habit, "colour": colour, "tier": tier, "size": size,
            "rag": rag, "pieces": P, "cups": cups, "discs": discs}


# ---------------------------------------------------------------- tessellation
_CUP = {0: (6, True), 1: (5, False), 2: (4, False)}


def _cup(mesh, pl, cp, sides, full):
    """A goblet: a closed shell of revolution whose top pole is the floor of the cup."""
    h, rr = cp["h"], cp["rr"]
    w = 0.0025
    dep = 0.32 * h
    rs = max(0.0035, rr * 0.22)
    if full:
        prof = [(0.0, h - dep), (rr * 0.55, h - dep * 0.75), (rr - w, h - 0.001), (rr, h),
                (rr * 0.72, h - dep * 1.15), (rs, h * 0.35), (rs * 1.4, 0.0), (0.0, -0.001)]
    else:
        prof = [(0.0, h - dep), (rr - w, h - 0.001), (rr, h), (rs, h * 0.40), (rs * 1.3, 0.0),
                (0.0, -0.001)]
    bx, by, bz = cp["base"]
    lx, ly = cp["lean"]

    def place(k, th, rho, z):
        p = (bx + rho * math.cos(th) + lx * z, by + rho * math.sin(th) + ly * z, bz + z)
        inner = k < 3 if full else k < 2
        t = (0.10 if inner else 0.25) + 0.45 * (z / h) + cp["t"]
        return p, _col(pl, T.clamp01(t))
    T.revolve(mesh, prof, sides, place)


def _tess(pl, lod):
    mesh = T.Mesh()
    for pc in pl["pieces"] + pl["discs"]:
        res = pc["res"].get(lod)
        if not res:
            continue
        if lod == 2 and pc.get("lod2R"):
            pc = dict(pc, R0=pc["lod2R"])
        T.lobed_patch(mesh, pc["c"], res[0], res[1], lambda th, pc=pc: _radius(pc, th),
                      _top_fn(pl, pc), pc["lift"] + SINK,
                      lambda th, pc=pc: _col(pl, max(0.0, pc["t0"] - 0.08)))
    sides, full = _CUP[lod]
    for cp in pl["cups"]:
        if lod == 2 and not cp["lod2"]:
            continue
        _cup(mesh, pl, cp, sides, full)
    return mesh


def build(seed, lod=0, params=None):
    """Build one lichen patch. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _CUP:
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
    r = sum(c[0] for c in mesh.c) / len(mesh.c)
    g = sum(c[1] for c in mesh.c) / len(mesh.c)
    k = 60
    inside = total = 0
    for i in range(k):
        for j in range(k):
            x = reach * (2.0 * (i + 0.5) / k - 1.0)
            y = reach * (2.0 * (j + 0.5) / k - 1.0)
            if x * x + y * y > reach * reach:
                continue
            total += 1
            for pc in pl["pieces"]:
                if 0 not in pc["res"]:
                    continue
                dx, dy = x - pc["c"][0], y - pc["c"][1]
                if math.hypot(dx, dy) < _radius(pc, math.atan2(dy, dx) % (2.0 * math.pi)):
                    inside += 1
                    break
    return {
        "seed": int(seed), "habit": pl["habit"], "colourway": pl["colour"], "tier": pl["tier"],
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(2.0 * reach, 3),
        "height": round(max(p[2] for p in v), 4),
        "pieces": len([pc for pc in pl["pieces"] if 0 in pc["res"]]) + len(pl["cups"])
        + len(pl["discs"]),
        "warmth": round(r / max(1e-6, g), 3),
        "cover": round(inside / max(1, total), 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
