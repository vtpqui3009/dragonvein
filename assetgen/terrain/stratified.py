"""C2 stratified — a layered rock butte (docs/ASSET_PLAN.md §C2, ROADMAP M4b).

A stack of sedimentary layers, each its own band of rock with a ledge where it steps in or
out from the one below. The bedding dips, so the strata run on a slant. The main silhouette
axis, `slender`, is stratified on the seed and runs from a low wide mesa (0) through a
butte to a narrow stack (1), so eight consecutive seeds cover all three.

`plan(seed)` draws everything; `build(seed, lod)` tessellates it (see terrain/island.py).
Colours: the rock ramp dusk -> rock mid -> deep shadow, alternating by layer and darker
toward the base, and on some seeds a grass cap on the ramp foliage dark -> mid -> light.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "stratified"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = dict(K.PALETTE)
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.GRASS), list(K.ROCK)]}
METRIC_AXES = ["width", "height", "layers", "slenderness", "ledge"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 72.0, "ground": True}

PARAMS = {
    "slender": (0.0, 1.0, "stratified: 0 low wide mesa, 0.5 butte, 1 narrow stack"),
    "width": (2.2, 5.2, "base footprint, metres"),
    "layers": (3, 7, "sedimentary layers"),
    "ledge": (0.04, 0.16, "how far a layer steps in or out from the one below, in widths"),
    "dip": (0.0, 0.22, "bedding slope, rise per metre"),
    "lobing": (0.04, 0.14, "outline harmonics amplitude"),
    "taperTop": (0.55, 0.95, "top layer's radius against the base's"),
    "cap": (0.0, 1.0, "chance of a grass cap"),
}
_LOD = {0: {"seg": 56}, 1: {"seg": 24}, 2: {"seg": 9}}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def plan(seed):
    r = Rng(int(seed))
    slender = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    W = _p("width", r.range(0.0, 1.0)) * (1.0 - 0.35 * slender)
    H = W * (0.38 + 1.75 * slender)
    n = r.int(3, 7)
    thick = [r.range(0.6, 1.4) for _ in range(n)]
    tot = sum(thick)
    bounds = [0.0]
    for t in thick:
        bounds.append(bounds[-1] + H * t / tot)
    ledge = _p("ledge", r.range(0.0, 1.0))
    steps = [r.range(-1.0, 1.0) for _ in range(n)]
    dip = _p("dip", r.range(0.0, 1.0))
    dip_a = r.range(0.0, 2.0 * math.pi)
    lobing = _p("lobing", r.range(0.0, 1.0))
    harm = [(k, lobing * r.range(0.4, 1.0) / (k - 1), r.range(0.0, 2.0 * math.pi)) for k in (2, 3, 5)]
    layer_wobble = [[(k, r.range(0.01, 0.05), r.range(0.0, 2.0 * math.pi)) for k in (4, 7)] for _ in range(n)]
    taper_top = _p("taperTop", r.range(0.0, 1.0))
    cap = r.range(0.0, 1.0) < 0.55
    tones = [r.range(0.0, 1.0) for _ in range(n)]

    def outline(theta):
        return 0.5 * W * (1.0 + sum(a * math.cos(k * theta + ph) for k, a, ph in harm))

    def layer_scale(i, top, theta):
        """Radius multiplier for layer i at its bottom (top=False) or top edge."""
        u = (i + (0.9 if top else 0.0)) / n
        base = K.lerp(1.0, taper_top, u)
        step = 1.0 + ledge * steps[i] * (0.6 if top else 1.0)
        wob = 1.0 + sum(a * math.sin(k * theta + ph) for k, a, ph in layer_wobble[i])
        return base * step * wob

    def tilt(x, y, z):
        """Bedding dip on every boundary above the ground."""
        if z <= 0.0:
            return z
        return z + dip * (x * math.cos(dip_a) + y * math.sin(dip_a)) * min(1.0, z / (0.25 * H))

    return {"slender": slender, "W": W, "H": H, "n": n, "bounds": bounds, "ledge": ledge,
            "dip": dip, "outline": outline, "layerScale": layer_scale, "tilt": tilt,
            "cap": cap, "tones": tones}


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    seg = _LOD[lod]["seg"]
    th = [2.0 * math.pi * j / seg for j in range(seg)]
    base = [pl["outline"](t) for t in th]
    m = K.Mesh()
    rings = []
    n, b = pl["n"], pl["bounds"]
    for i in range(n):
        tone = pl["tones"][i]
        for top in (False, True):
            z0 = b[i + 1] if top else b[i]
            # Layer colour: alternate on the dusk -> rock mid stretch, darker near the base,
            # each layer's top edge a touch lighter than its bottom (a lit ledge).
            # Strata alternate between a warm dusk band and a rock-mid band, so the layering
            # reads at sheet scale; the lower layers sink toward deep shadow.
            band = 0.14 if i % 2 == 0 else 0.48
            t = band + 0.10 * tone + 0.22 * (1.0 - z0 / pl["H"]) - (0.06 if top else 0.0)
            ring = []
            for j, a in enumerate(th):
                rr = base[j] * pl["layerScale"](i, top, a)
                x, y = rr * math.cos(a), rr * math.sin(a)
                ring.append(m.vert((x, y, pl["tilt"](x, y, z0)), K.ramp(K.ROCK, t)))
            rings.append(ring)
    # Caps: the floor (rock, dark) and the top (grass on some seeds, else pale rock).
    bot = m.vert((0.0, 0.0, 0.0), K.ramp(K.ROCK, 0.85))
    topc = rings[-1]
    cx = sum(m.v[k][0] for k in topc) / seg
    cy = sum(m.v[k][1] for k in topc) / seg
    cz = sum(m.v[k][2] for k in topc) / seg + 0.04 * pl["W"]
    cap_col = K.ramp(K.GRASS, 0.55) if pl["cap"] else K.ramp(K.ROCK, 0.10)
    top = m.vert((cx, cy, cz), cap_col)
    if pl["cap"]:
        # The cap gets its own rim, a hair proud of the cliff top, so the grass colour stays
        # on the top and does not bleed down the rock face (run 16).
        lip = []
        for k in topc:
            x, y, z = m.v[k]
            lip.append(m.vert((cx + (x - cx) * 1.03, cy + (y - cy) * 1.03, z + 0.03 * pl["W"]),
                              K.ramp(K.GRASS, 0.30)))
        rings.append(lip)
        topc = lip
    for a, bb in zip(rings, rings[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            m.face((a[j], a[k], bb[k], bb[j]))
    for j in range(seg):
        k = (j + 1) % seg
        m.face((bot, rings[0][k], rings[0][j]))
        m.face((top, topc[j], topc[k]))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def metrics(seed, lod=0):
    pl = plan(int(seed))
    rs = [pl["outline"](2.0 * math.pi * j / 180) for j in range(180)]
    return {
        "seed": int(seed),
        "width": round(2.0 * max(rs), 3),
        "height": round(pl["H"], 3),
        "layers": pl["n"],
        "slenderness": round(pl["H"] / pl["W"], 3),
        "ledge": round(pl["ledge"], 4),
        "dip": round(pl["dip"], 3),
        "cap": pl["cap"],
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
