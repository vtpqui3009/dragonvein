"""C2 columnar — a cluster of basalt columns (docs/ASSET_PLAN.md §C2, ROADMAP M4b).

Tightly packed prisms (mostly hexagonal) on a honeycomb, tallest near a crest and falling
away, each top cut on a slight tilt: the Giant's Causeway read, which no other rock in the
set has. The main silhouette axis, `crest`, is stratified on the seed and runs from a
low stepped pavement (0) through a mound to a tall organ-pipe stack (1).

`plan(seed)` draws every column; `build(seed, lod)` tessellates them. Lower LODs drop the
shortest columns first, so the cluster's outline survives. Colours: the rock ramp, the
column sides darkening toward the ground, the cut tops pale.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "columnar"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = {k: K.PALETTE[k] for k in K.ROCK}
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.ROCK)]}
METRIC_AXES = ["width", "height", "columns", "spread", "stepping"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 70.0, "ground": True}

PARAMS = {
    "crest": (0.0, 1.0, "stratified: 0 low pavement, 0.5 mound, 1 tall organ-pipe stack"),
    "rings": (2, 4, "honeycomb rings of columns around the first"),
    "columnRadius": (0.22, 0.42, "column circumradius, metres"),
    "peak": (0.8, 4.6, "tallest column, metres (scaled by crest)"),
    "falloff": (0.35, 0.95, "how fast columns shorten away from the crest"),
    "stepping": (0.05, 0.40, "random height difference between neighbours, in peaks"),
    "tilt": (0.0, 0.28, "slope of each column's cut top, rise per radius"),
    "missing": (0.0, 0.30, "chance a cell is empty"),
}
#: max columns kept (tallest first); bevel = a chamfer ring under each cut top (LOD0 only);
#: floor = the buried base caps (dropped at LOD2, where nobody sees under a rock). Each LOD
#: is cheaper than the one above even when a small cluster keeps every column.
_LOD = {0: {"max": 40, "bevel": True, "floor": True},
        1: {"max": 18, "bevel": False, "floor": True},
        2: {"max": 6, "bevel": False, "floor": False}}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def plan(seed):
    r = Rng(int(seed))
    crest = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    rings = r.int(2, 4)
    cr = _p("columnRadius", r.range(0.0, 1.0))
    peak = _p("peak", r.range(0.0, 1.0)) * (0.55 + 0.9 * crest)
    falloff = _p("falloff", r.range(0.0, 1.0))
    stepping = _p("stepping", r.range(0.0, 1.0))
    tilt = _p("tilt", r.range(0.0, 1.0))
    missing = _p("missing", r.range(0.0, 1.0))
    crest_dir = r.range(0.0, 2.0 * math.pi)
    crest_off = r.range(0.0, 0.8) * rings
    pitch = cr * math.sqrt(3.0) * 1.02            # flat-to-flat spacing, a hair of grout
    cols = []
    for q in range(-rings, rings + 1):
        for rr in range(max(-rings, -q - rings), min(rings, -q + rings) + 1):
            x = pitch * (q + rr / 2.0)
            y = pitch * rr * math.sqrt(3.0) / 2.0
            draw_gap = r.range(0.0, 1.0)
            sides = 6 if r.range(0.0, 1.0) < 0.78 else (5 if r.range(0.0, 1.0) < 0.5 else 7)
            jitter = r.range(-1.0, 1.0)
            tilt_dir = r.range(0.0, 2.0 * math.pi)
            spin = r.range(0.0, 2.0 * math.pi / sides)
            tone = r.range(0.0, 1.0)
            if (q, rr) != (0, 0) and draw_gap < missing:
                continue
            cx, cy = math.cos(crest_dir) * crest_off * pitch, math.sin(crest_dir) * crest_off * pitch
            d = math.hypot(x - cx, y - cy) / (pitch * (rings + 0.5))
            h = peak * max(0.22, max(0.0, 1.0 - d) ** (1.0 / falloff) + stepping * jitter * 0.5)
            cols.append({"x": x, "y": y, "h": h, "sides": sides, "r": cr * (0.92 + 0.08 * tone),
                         "tiltDir": tilt_dir, "spin": spin, "tone": tone})
    # Tallest first: the order LODs keep them in.
    cols.sort(key=lambda c: (-c["h"], c["x"], c["y"]))
    return {"crest": crest, "cols": cols, "peak": peak, "tilt": tilt, "stepping": stepping,
            "radius": cr, "rings": rings}


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    m = K.Mesh()
    keep = pl["cols"][:_LOD[lod]["max"]]
    cfg = _LOD[lod]
    for c in keep:
        n = c["sides"]
        ring_b, ring_t, ring_v = [], [], []
        for j in range(n):
            a = c["spin"] + 2.0 * math.pi * j / n
            x, y = c["x"] + c["r"] * math.cos(a), c["y"] + c["r"] * math.sin(a)
            # The cut top slopes along tiltDir, so neighbouring columns catch light apart.
            dz = pl["tilt"] * c["r"] * math.cos(a - c["tiltDir"])
            ring_b.append(m.vert((x, y, -0.05), K.ramp(K.ROCK, 0.90)))
            if cfg["bevel"]:
                bv = 0.07 * c["r"]
                ring_v.append(m.vert((x, y, c["h"] + dz - bv), K.ramp(K.ROCK, 0.46 + 0.18 * c["tone"])))
                xi = c["x"] + (c["r"] - bv) * math.cos(a)
                yi = c["y"] + (c["r"] - bv) * math.sin(a)
                ring_t.append(m.vert((xi, yi, c["h"] + dz), K.ramp(K.ROCK, 0.10 + 0.14 * c["tone"])))
            else:
                ring_t.append(m.vert((x, y, c["h"] + dz), K.ramp(K.ROCK, 0.46 + 0.18 * c["tone"])))
        top = m.vert((c["x"], c["y"], c["h"]), K.ramp(K.ROCK, 0.04 + 0.12 * c["tone"]))
        side_top = ring_v if cfg["bevel"] else ring_t
        for j in range(n):
            k = (j + 1) % n
            m.face((ring_b[j], ring_b[k], side_top[k], side_top[j]))
            if cfg["bevel"]:
                m.face((ring_v[j], ring_v[k], ring_t[k], ring_t[j]))
            m.face((top, ring_t[j], ring_t[k]))
        if cfg["floor"]:
            for j in range(1, n - 1):
                m.face((ring_b[0], ring_b[j + 1], ring_b[j]))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME, smooth_shade=False)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def metrics(seed, lod=0):
    pl = plan(int(seed))
    cols = pl["cols"]
    xs = [c["x"] for c in cols]
    ys = [c["y"] for c in cols]
    width = max(max(xs) - min(xs), max(ys) - min(ys)) + 2.0 * pl["radius"]
    hs = [c["h"] for c in cols]
    return {
        "seed": int(seed),
        "width": round(width, 3),
        "height": round(max(hs), 3),
        "columns": len(cols),
        "spread": round((max(hs) - min(hs)) / max(hs), 3),
        "stepping": round(pl["stepping"], 3),
        "crest": round(pl["crest"], 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
