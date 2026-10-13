"""B2 grass clump — a seeded tuft of blades fanning from a point (docs/ASSET_PLAN.md §B2,
ROADMAP M5d).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Every blade starts at one small, dark base knot sunk at z = 0 and fans out from it: each is
a closed thin solid (treekit's `thick_grid`), widest a fifth of the way up and ending in a
blunt tip a third of its width, never a needle. Blades rise at their own angle, arch over by
their own amount and twist a little as they go, so the light catches them one by one. Some
seeds send up seed-head stalks: thin stems standing clear of the blades, each topped by a
pale, blunt, grain-like spike.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a short, dense, round tuft (~0.25 m), blades spread evenly over a dome like a
pincushion; 1 a tall, wispy, arching clump (~0.9 m) of fewer, longer, finer blades that
climb steeply and fall over at their tips like a fountain. Size, blade density, curl and
the seed heads ride on their own stratified sequences (plastic, 1/e, sqrt(3) - 1,
sqrt(2) - 1).

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
NAME = "grassclump"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
#: Grass has no bark: blades, base knot, stalks and seed heads are all the canopy ramp.
PALETTE = {k: T.PALETTE[k] for k in ("canopyDark", "canopyMid", "canopyLight")}
PALETTE_ROLES = {"surfaces": [], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `blades` counts the blades; `heads` the seed-head stalks (0 on some seeds); `droop` is
#: how far the blade tips fall below the clump's top, over the height (0 a stiff pincushion,
#: higher a fountain).
METRIC_AXES = ["height", "width", "blades", "heads", "droop"]
#: Small plants: render_all's tree gap, label band and camera drop scaled down further.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 78.0,
         "ground": True, "gap": 0.22, "band": 0.62, "drop": 0.1}

INV_E = 0.36787944117144233          # 1 / e

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified on the golden ratio: 0 short dense round tuft "
                       "(~0.25 m) ... 1 tall wispy arching fountain (~0.9 m)"),
    "size": (0.85, 1.18, "multiplier on blade length; stratified on the plastic number"),
    "density": (0.0, 1.0, "stratified on 1/e: 0 a sparse clump ... 1 a thick one (the "
                          "blade count, 18..44, also falls with form)"),
    "curl": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 flat straight blades ... 1 blades "
                       "that twist along their length and curl over further"),
    "seeds": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.4 no seed heads; above, 2..7 "
                        "stalks standing clear of the blades"),
    "length": (0.24, 1.30, "blade length at form 0 ... 1, in metres, before size"),
    "bladeWidth": (0.026, 0.040, "blade width at its widest, in metres (finer at form 1)"),
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
    dens = _p("density", T.stratify(seed, INV_E, 0.04, rng))
    curl = _p("curl", T.stratify(seed, T.SQRT3M1, 0.05, rng))
    seeds_t = _p("seeds", T.stratify(seed, T.SQRT2M1, 0.03, rng))
    tone = _p("tone", rng.next())
    bw = _p("bladeWidth", rng.next()) * T.lerp(1.0, 0.78, form)

    L = _p("length", form) * size
    nb = int(round(T.lerp(T.lerp(30, 44, dens), T.lerp(18, 30, dens), form)))
    blades = []
    az = rng.range(0.0, 2.0 * math.pi)
    for i in range(nb):
        az += 2.39996 + rng.range(-0.3, 0.3)          # golden angle: an even fan
        u = (i + rng.range(0.2, 0.8)) / nb
        # a tuft fills a dome from low to vertical; a fountain climbs steeply and falls over
        el = math.radians(T.lerp(T.lerp(22.0, 88.0, u), T.lerp(64.0, 89.0, u), form))
        bl = {"az": az, "e0": el,
              "turn": (T.lerp(0.25, 2.2, form) + 0.7 * curl) * rng.range(0.75, 1.2)
              * T.lerp(1.0, 0.7, u),
              "len": L * rng.range(0.7, 1.05) * T.lerp(0.95, 1.08, u),
              "w": bw * rng.range(0.8, 1.15),
              "twist": curl * rng.range(-2.6, 2.6), "tone": rng.range(0.92, 1.08)}
        for _ in range(14):
            if min(p[2] for p in _path(bl, 16)[3:]) >= 0.02 + 0.3 * bl["w"]:
                break
            bl["turn"] *= 0.86
        blades.append(bl)

    stalks = []
    if seeds_t > 0.4:
        ns = 2 + int((seeds_t - 0.4) / 0.6 * 5.99)
        saz = rng.range(0.0, 2.0 * math.pi)
        top = max(max(p[2] for p in _path(b, 16)) for b in blades)
        for j in range(ns):
            saz += 2.39996 + rng.range(-0.4, 0.4)
            h = top * rng.range(1.18, 1.42) + 0.06
            stalks.append({"az": saz, "e0": math.radians(rng.range(72.0, 86.0)),
                           "turn": rng.range(0.1, 0.45), "len": h, "w": 0.0,
                           "r": 0.0045 + 0.002 * size,
                           "hl": rng.range(0.09, 0.15) * T.lerp(0.9, 1.3, form),
                           "hr": rng.range(0.013, 0.018)})
    return {"seed": seed, "form": form, "size": size, "dens": dens, "curl": curl,
            "tone": tone, "blades": blades, "stalks": stalks, "L": L,
            "knot": 0.035 + 0.025 * dens}


def _path(bl, fine):
    """A blade's centre line: `fine` + 1 points from the base knot, rising at e0 and
    turning over by `turn` toward its azimuth."""
    az, L = bl["az"], bl["len"]
    pts = [(math.cos(az) * 0.01, math.sin(az) * 0.01, -0.01)]
    for s in range(fine):
        u = (s + 0.5) / fine
        d = T.from_angles(az, bl["e0"] - bl["turn"] * u ** 1.15)
        pts.append(T.add(pts[-1], T.mul(d, L / fine)))
    return pts


FINE = 24


def _sample(path, n):
    out = []
    for i in range(n):
        x = i / (n - 1) * (len(path) - 1)
        k = min(len(path) - 2, int(x))
        f = x - k
        out.append(tuple(path[k][c] + (path[k + 1][c] - path[k][c]) * f for c in range(3)))
    return out


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"rows": (7, 4), "keep": 1, "stalk": (3, 4), "head": (5, 4), "knot": (8, 4)},
    1: {"rows": (4, 3), "keep": 1, "stalk": (3, 2), "head": (4, 3), "knot": (6, 3)},
    2: {"rows": (3, 3), "keep": 4, "stalk": None, "head": (3, 3), "knot": (4, 2),
        "stalk_keep": 2},
}


def _blade(mesh, pl, bl, rows, widen):
    pts_c = _sample(_path(bl, FINE), rows)
    n_side = (-math.sin(bl["az"]), math.cos(bl["az"]), 0.0)
    pts, nrm, thick, ct, cb = [], [], [], [], []
    for i, p in enumerate(pts_c):
        t = i / (rows - 1)
        q = pts_c[min(rows - 1, i + 1)]
        o = pts_c[max(0, i - 1)]
        d = T.norm(T.sub(q, o))
        side = T.norm(T.sub(n_side, T.mul(d, T.dot(n_side, d))))
        up = T.norm(T.cross(side, d))
        # at most 0.3 rad of twist between two rows: a thin blade's skins are millimetres
        # apart, and a quad twisted further is non-planar enough for them to cross
        a = max(-0.3, min(0.3, bl["twist"] / (rows - 1))) * (rows - 1) * t
        ca, sa = math.cos(a), math.sin(a)
        side, up = (T.add(T.mul(side, ca), T.mul(up, sa)),
                    T.add(T.mul(up, ca), T.mul(side, -sa)))
        w = bl["w"] * widen * (0.70 + 0.30 * math.sin(math.pi * min(1.0, t * 2.5) * 0.5)) \
            * (1.0 - 0.66 * t ** 1.4)                   # a blunt tip, a third of the width
        pts.append([T.add(p, T.mul(side, -0.5 * w)), T.add(p, T.mul(side, 0.5 * w))])
        nrm.append([up, up])
        thick.append([0.0035, 0.0035])
        top = T.foliage(T.clamp01((0.20 + 0.58 * t) * pl["tone"] * bl["tone"]))
        bot = T.foliage(T.clamp01((0.08 + 0.26 * t) * pl["tone"]))
        ct.append([top, top])
        cb.append([bot, bot])
    T.thick_grid(mesh, pts, nrm, thick, ct, cb)


def _stalk(mesh, pl, st, cfg):
    """A seed-head stalk: a thin stem and, on its last stretch, a pale blunt spike that
    swells round the stem (one tube at LOD2, two closed tubes above it)."""
    fine = _path(st, FINE)
    L = st["len"]
    t0 = 1.0 - st["hl"] / L
    if cfg["stalk"]:
        sides, n = cfg["stalk"]
        path = _sample(fine[:int(t0 * FINE) + 2], n)
        m = len(path)
        T.tube(mesh, path, [st["r"] * T.lerp(1.0, 0.8, k / (m - 1)) for k in range(m)], sides,
               lambda u, mm: T.foliage(T.clamp01((0.35 + 0.35 * u) * pl["tone"])))
        hs, hn = cfg["head"]
        k0 = t0 * FINE
        path, radii = [], []
        for j in range(hn):
            u = j / (hn - 1)
            x = T.lerp(k0 - 0.3, FINE, u)
            k = min(FINE - 1, int(x))
            f = x - k
            path.append(tuple(fine[k][c] + (fine[k + 1][c] - fine[k][c]) * f for c in range(3)))
            radii.append(st["hr"] * (0.45 + 0.55 * math.sin(math.pi * T.lerp(0.12, 0.88, u))))
        T.tube(mesh, path, radii, hs,
               lambda u, mm: T.foliage(T.clamp01((0.78 + 0.2 * u) * pl["tone"])))
    else:
        hs, hn = cfg["head"]
        path = [fine[0], fine[int(t0 * FINE)], fine[-1]]
        T.tube(mesh, path, [st["r"] * 1.6, st["hr"], st["hr"] * 0.5], hs,
               lambda u, mm: T.foliage(T.clamp01((0.40 + 0.5 * u) * pl["tone"])))


def _knot(mesh, pl, seg, rings):
    r = pl["knot"]

    def place(d):
        p = (d[0] * r, d[1] * r, -0.012 + d[2] * r * 0.5)
        return p, T.foliage(T.clamp01((0.05 + 0.10 * (0.5 + 0.5 * d[2])) * pl["tone"]))
    T.blob(mesh, seg, rings, place)


def build(seed, lod=0, params=None):
    """Build one grass clump. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    _knot(mesh, pl, *cfg["knot"])
    keep = cfg["keep"]
    rows = cfg["rows"][0] if len(pl["blades"]) <= 30 else cfg["rows"][1]   # a crowded clump
    for i, bl in enumerate(pl["blades"]):
        if i % keep == 0:                 # LOD2: every fourth blade, widened to keep the mass
            _blade(mesh, pl, bl, rows, 1.0 if keep == 1 else 2.0)
    for j, st in enumerate(pl["stalks"]):
        if j % cfg.get("stalk_keep", 1) == 0:
            _stalk(mesh, pl, st, cfg)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    top, reach, drops = 0.0, pl["knot"], []
    for bl in pl["blades"]:
        p = _path(bl, FINE)
        hi = max(q[2] for q in p)
        top = max(top, hi)
        reach = max(reach, max(math.hypot(q[0], q[1]) for q in p) + 0.5 * bl["w"])
        drops.append(hi - p[-1][2])
    btop = top
    for st in pl["stalks"]:
        p = _path(st, FINE)
        top = max(top, max(q[2] for q in p) + st["hr"])
        reach = max(reach, max(math.hypot(q[0], q[1]) for q in p) + st["hr"])
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.7 * reach, 3),
        "blades": len(pl["blades"]),
        "heads": len(pl["stalks"]),
        "droop": round(sum(drops) / len(drops) / btop, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
