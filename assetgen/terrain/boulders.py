"""C2 boulders — a pile of rounded boulders (docs/ASSET_PLAN.md §C2, ROADMAP M4b).

Weathered boulders, big ones settled into the ground and smaller ones resting on them: the
soft, lumpy rock the set needs beside the hard edges of the butte and the columns. The main
silhouette axis, `heap`, is stratified on the seed and runs from a low scatter of a few
broad stones (0) to a tall stacked cairn (1).

Each boulder is an icosphere pushed out of round by a sum of sine fields, squashed, and
sunk a little into the ground so it sits. `plan(seed)` draws every boulder; LODs change only
the icosphere's subdivision (2 / 1 / 0), so the pile is the same pile at every LOD.
Colours: the rock ramp, pale where a face looks up at the sky, deep where it faces the
ground.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "boulders"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = {k: K.PALETTE[k] for k in K.ROCK}
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.ROCK)]}
METRIC_AXES = ["width", "height", "boulders", "flatness", "roughness"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 74.0, "ground": True}

PARAMS = {
    "heap": (0.0, 1.0, "stratified: 0 low scatter of broad stones, 1 tall stacked cairn"),
    "count": (3, 9, "boulders in the pile"),
    "size": (0.55, 1.35, "radius of the largest boulder, metres"),
    "shrink": (0.55, 0.85, "each next boulder's radius against the one before"),
    "squash": (0.45, 0.95, "vertical scale of a boulder"),
    "rough": (0.12, 0.34, "how far the sine fields push the surface, in radii"),
}
_LOD = {0: 2, 1: 1, 2: 0}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def plan(seed):
    r = Rng(int(seed))
    heap = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    count = r.int(3, 9)
    size = _p("size", r.range(0.0, 1.0))
    shrink = _p("shrink", r.range(0.0, 1.0))
    squash_base = _p("squash", r.range(0.0, 1.0))
    rough = _p("rough", r.range(0.0, 1.0))
    boulders = []
    for i in range(count):
        rad = size * shrink ** i * r.range(0.85, 1.12)
        sq = min(1.0, squash_base * r.range(0.85, 1.15) * (0.85 + 0.3 * heap))
        fields = [(r.range(1.5, 4.5), _unit3(r), r.range(0.0, 2.0 * math.pi), r.range(0.4, 1.0))
                  for _ in range(4)]
        # Ridged fields cut grooves: weathering cracks, so a boulder is not a smooth lump.
        cracks = [(r.range(4.0, 8.0), _unit3(r), r.range(0.0, 2.0 * math.pi)) for _ in range(2)]
        yaw = r.range(0.0, 2.0 * math.pi)
        tone = r.range(0.0, 1.0)
        ang = r.range(0.0, 2.0 * math.pi)
        pick = r.range(0.0, 1.0)
        if not boulders:
            pos = (0.0, 0.0, rad * sq * 0.82)
        else:
            # Rest on a boulder already placed, nearer its top the higher the heap. A low
            # heap lays boulders beside each other instead.
            host = boulders[min(len(boulders) - 1, int(pick * len(boulders)))]
            climb = heap
            out = host["r"] * (1.05 - 0.55 * climb) + rad * (0.75 - 0.35 * climb)
            hx = host["pos"][0] + out * math.cos(ang)
            hy = host["pos"][1] + out * math.sin(ang)
            hz = rad * sq * 0.82 + climb * (host["pos"][2] + host["r"] * host["sq"] * 0.55)
            pos = (hx, hy, hz)
        boulders.append({"r": rad, "sq": sq, "pos": pos, "fields": fields, "cracks": cracks,
                         "yaw": yaw, "tone": tone})
    return {"heap": heap, "boulders": boulders, "rough": rough}


def _unit3(r):
    z = r.range(-1.0, 1.0)
    a = r.range(0.0, 2.0 * math.pi)
    s = math.sqrt(max(0.0, 1.0 - z * z))
    return (s * math.cos(a), s * math.sin(a), z)


def _shape(b, rough, d):
    """Surface point of boulder b in direction d (a unit vector)."""
    k = 1.0 + rough * sum(amp * math.sin(f * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) + ph)
                          for f, u, ph, amp in b["fields"]) / 2.0
    k -= rough * 0.45 * sum((1.0 - abs(math.sin(f * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) + ph))) ** 4
                            for f, u, ph in b["cracks"])
    c, s = math.cos(b["yaw"]), math.sin(b["yaw"])
    x, y, z = d[0] * k * b["r"], d[1] * k * b["r"], d[2] * k * b["r"] * b["sq"]
    x, y = c * x - s * y, s * x + c * y
    return (b["pos"][0] + x, b["pos"][1] + y, max(-0.12 * b["r"], b["pos"][2] + z))


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    verts, faces = K.icosphere(_LOD[lod])
    m = K.Mesh()
    for b in pl["boulders"]:
        base = len(m.v)
        for d in verts:
            # Up-facing pale, ground-facing deep: the direction's z stands in for the normal.
            t = 0.30 + 0.16 * b["tone"] + 0.50 * K.smooth(0.5 - 0.6 * d[2])
            m.vert(_shape(b, pl["rough"], d), K.ramp(K.ROCK, t))
        for a, bb, c in faces:
            m.face((base + a, base + bb, base + c))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def metrics(seed, lod=0):
    pl = plan(int(seed))
    bs = pl["boulders"]
    xs = [b["pos"][0] - b["r"] for b in bs] + [b["pos"][0] + b["r"] for b in bs]
    ys = [b["pos"][1] - b["r"] for b in bs] + [b["pos"][1] + b["r"] for b in bs]
    top = max(b["pos"][2] + b["r"] * b["sq"] for b in bs)
    return {
        "seed": int(seed),
        "width": round(max(max(xs) - min(xs), max(ys) - min(ys)), 3),
        "height": round(top, 3),
        "boulders": len(bs),
        "flatness": round(sum(b["sq"] for b in bs) / len(bs), 3),
        "roughness": round(pl["rough"], 3),
        "heap": round(pl["heap"], 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
