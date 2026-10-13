"""B2 fern — a seeded crown of pinnate fronds (docs/ASSET_PLAN.md §B2, ROADMAP M5d).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A frond is **divided**, not a serrated blade: a bare stipe, then a rachis carrying discrete
leaflets — pinnae — stepping down each side of it, alternating, swept toward the frond tip
and shortening toward it so the blade tapers. Each pinna is its own closed shell (a thin
lozenge with a raised midrib, `_pinna`), so daylight shows between them and the frond reads
as a fern rather than as an agave. The rachis is a thin tapering tube; the crown is a dark,
squat, bark-coloured knob sunk at z = 0. Some seeds carry fiddleheads — young fronds still
rolled into a crozier — standing clear of the crown on their own stalks.

The axes
--------
`habit` is the silhouette's first fact, stratified on pi - 3 in quarters so each of the four
classes falls on exactly two of seeds 1..8 (bush's pattern):

  vase      a shuttlecock of steep fronds that only bend over at the tip
  spread    a low, wide rosette lying out from the crown, tips arching to the ground
  fountain  mid-height fronds whose tips fall most of the way back down
  bracken   a few big triangular fronds on long bare stipes, from a creeping rhizome,
            so the plant is a line rather than a rosette

`form` 0..1 is stratified on the golden ratio and moves size, frond length and rise inside
whatever the habit allows, so the two seeds of one habit are still two plants. Size, frond
count, blade breadth, the tip fall and the fiddleheads ride on their own stratified
sequences (plastic, 1/e, sqrt(3) - 1, golden**-4, sqrt(2) - 1).

The tip fall is a *parameter*, not an outcome: `_solve_turn` bisects the rachis' total turn
so the tip lands a chosen fraction of the way from the frond's apex back down to a ground
clearance. That is why `droop` varies across seeds at all — the old generator straightened
every frond that threatened the ground and left five of eight seeds dead stiff.

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
NAME = "fern"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
#: A prop: PERF_BUDGET §Other budgets, the row STATE.md run 22 names for understory.
BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}
PALETTE = dict(T.PALETTE)
#: The crown and rhizome are the bark surface; rachis, pinnae and fiddleheads the ramp.
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `fronds` counts the open fronds; `breadth` is the widest blade over the frond length (a
#: narrow sword fern ... a broad bracken); `droop` is how far the frond tips fall below
#: their highest point, over the height (stiff ... a fountain). The fiddlehead count is
#: reported as `curl` but not compared: at sheet scale a crozier is a detail, not a shape.
METRIC_AXES = ["height", "width", "fronds", "breadth", "droop"]
#: Small plants: render_all's tree gap, label band and camera drop scaled down.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 78.0,
         "ground": True, "gap": 0.3, "band": 0.78, "drop": 0.12}

INV_E = 0.36787944117144233          # 1 / e
PI_M3 = 0.14159265358979312          # pi - 3: the habit, each class twice in seeds 1..8

HABITS = ("vase", "spread", "fountain", "bracken")
#: Per habit, where in each PARAMS range that habit lives. `elev`, `len`, `nf` are read at
#: `form`, `droop` at its own stratified draw, `w` at `breadth`. `pow` is how late the
#: rachis bends (1 = evenly along it, 2.7 = a straight stipe that flops over at the top),
#: `stipe` the bare fraction, `vm` where the blade is widest, `young` the innermost frond's
#: length over the outermost's, `creep` whether the crown is a line instead of a point.
HABIT = {
    "vase": {"elev": (0.700, 1.000), "len": (0.400, 0.956), "nf": (0.222, 1.000),
             "droop": (0.022, 0.402), "w": (0.26, 0.42), "pow": 2.10, "stipe": 0.26,
             "vm": 0.42, "young": 0.66, "creep": False},
    "spread": {"elev": (0.260, 0.520), "len": (0.120, 0.420), "nf": (0.444, 1.000),
               "droop": (0.402, 0.967), "w": (0.34, 0.54), "pow": 1.50, "stipe": 0.16,
               "vm": 0.46, "young": 0.54, "creep": False},
    "fountain": {"elev": (0.500, 0.760), "len": (0.330, 0.700), "nf": (0.222, 0.667),
                 "droop": (0.565, 1.000), "w": (0.28, 0.46), "pow": 1.35, "stipe": 0.20,
                 "vm": 0.40, "young": 0.60, "creep": False},
    "bracken": {"elev": (0.722, 0.972), "len": (0.344, 0.789), "nf": (0.000, 0.333),
                "droop": (0.054, 0.380), "w": (0.46, 0.72), "pow": 2.70, "stipe": 0.50,
                "vm": 0.22, "young": 0.78, "creep": True},
}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "habit": (0.0, 1.0, "stratified on pi - 3, in quarters: vase (a steep shuttlecock), "
                        "spread (a low wide rosette), fountain (tips falling back to the "
                        "ground), bracken (a few broad triangular fronds on long bare "
                        "stipes, from a creeping rhizome)"),
    "form": (0.0, 1.0, "stratified on the golden ratio: 0 the small, low, shallow end of "
                       "whatever the habit allows ... 1 the big, tall, steep end"),
    "size": (0.86, 1.18, "multiplier on frond length and crown; stratified on the plastic "
                         "number"),
    "fronds": (3, 12, "open fronds, stratified on 1/e inside the habit's band: 3..6 for "
                      "bracken, 5..9 for a fountain, 7..12 for a vase or a spreading "
                      "rosette"),
    "breadth": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 the narrow end of the habit's blade "
                          "width ... 1 the broad end"),
    "curl": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.5 none; above, one to three "
                       "fiddleheads (coiled young fronds) standing clear of the crown"),
    "droop": (0.03, 0.95, "how far a frond tip falls from the frond's own apex back toward "
                          "the ground, as a fraction of that drop; stratified on golden**-4 "
                          "inside the habit's band. The rachis turn is bisected to hit it, "
                          "so the tip clears the ground by construction"),
    "length": (0.44, 1.34, "frond length in metres before `size`; the habit picks the band, "
                           "`form` the point inside it"),
    "elevation": (14.0, 86.0, "the outermost frond's rise from the crown, in degrees; the "
                              "habit picks the band, `form` the point inside it"),
    "fill": (0.78, 1.00, "a pinna's half-width over half the gap to the next pinna on its "
                         "side: airy and separated ... touching, a solid-looking blade"),
    "sweep": (16.0, 44.0, "degrees a pinna is swept from square to the rachis toward the "
                          "frond tip"),
    "pitch": (0.03, 0.26, "radians the pinnae are pitched below the blade plane, so a frond "
                          "is a shallow V across and catches the light on its midrib"),
    "tone": (0.90, 1.08, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole fern as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.02, rng))
    size = _p("size", T.stratify(seed, T.PLASTIC, 0.06, rng))
    nf_t = T.stratify(seed, INV_E, 0.03, rng)
    breadth = _p("breadth", T.stratify(seed, T.SQRT3M1, 0.05, rng))
    curl = _p("curl", T.stratify(seed, T.SQRT2M1, 0.03, rng))
    droop_t = T.stratify(seed, T.PHI_M4, 0.04, rng)
    habit_t = _p("habit", T.stratify(seed, PI_M3, 0.004, rng))
    tone = _p("tone", rng.next())
    fill = _p("fill", rng.next())
    sweep = math.radians(_p("sweep", rng.next()))
    pitch = _p("pitch", rng.next())

    habit = HABITS[min(3, int(habit_t * 4.0))]
    hb = HABIT[habit]
    L = _p("length", T.lerp(hb["len"][0], hb["len"][1], form)) * size
    e_out = math.radians(_p("elevation", T.lerp(hb["elev"][0], hb["elev"][1], form)))
    drop = _p("droop", T.lerp(hb["droop"][0], hb["droop"][1], droop_t))
    n = int(round(_p("fronds", T.lerp(hb["nf"][0], hb["nf"][1], nf_t))))
    wmax = T.lerp(hb["w"][0], hb["w"][1], breadth)
    stipe = hb["stipe"] * rng.range(0.92, 1.08)
    # Pinnae per side, against the triangle budget rather than taste: a crowded rosette of
    # twelve fronds divides each of them less finely, so LOD0 stays level across seeds.
    pside = max(4, min(11, int(round(80.0 / n))))
    pside1 = max(2, min(4, int(round(26.0 / n))))
    rc = (0.045 + 0.035 * form) * size

    # The crown: one knob, or for bracken a row of them on a creeping rhizome.
    if hb["creep"]:
        nn = max(2, min(4, n - 1))
        rdir = rng.range(0.0, 2.0 * math.pi)
        gap = L * rng.range(0.16, 0.26)
        nodes = []
        for k in range(nn):
            d = (k - (nn - 1) * 0.5) * gap
            lat = rng.range(-0.25, 0.25) * gap
            nodes.append((math.cos(rdir) * d - math.sin(rdir) * lat,
                          math.sin(rdir) * d + math.cos(rdir) * lat, 0.0))
        node_r = rc * 0.74
    else:
        nodes = [(0.0, 0.0, 0.0)]
        node_r = rc

    fronds = []
    az = rng.range(0.0, 2.0 * math.pi)
    for i in range(n):
        az += 2.39996 + rng.range(-0.25, 0.25)        # golden-angle phyllotaxis
        young = i / max(1, n - 1)                      # 0 outermost ... 1 innermost
        nd = nodes[i % len(nodes)]
        fl = L * T.lerp(1.0, hb["young"], young) * rng.range(0.90, 1.08)
        fr = {"az": az,
              "len": fl,
              "e0": min(math.radians(86.0), e_out + T.lerp(0.0, 0.30, young)
                        + rng.range(-0.07, 0.07)),
              "turn": 0.0,
              "pow": hb["pow"] * rng.range(0.94, 1.06),
              "w": wmax * rng.range(0.92, 1.08),
              "vm": hb["vm"] * rng.range(0.92, 1.08),
              "roll": rng.range(-0.16, 0.16),
              "drop": T.clamp01(drop * T.lerp(1.0, 0.70, young) * rng.range(0.88, 1.12)),
              "tone": T.lerp(0.96, 1.12, young) * rng.range(0.96, 1.04),
              "base": (nd[0] + math.cos(az) * node_r * 0.45,
                       nd[1] + math.sin(az) * node_r * 0.45, node_r * 0.34)}
        # The pinnae hang below the rachis, so the rachis must clear the ground by more
        # than nothing. `_solve_turn` then hits the wanted tip fall inside that clearance.
        fr["zfloor"] = 0.022 + 0.34 * 0.5 * fr["w"] * fr["len"]
        _solve_turn(fr)
        fronds.append(fr)

    heads = []
    apex = max(max(p[2] for p in _spine(fr, 16)) for fr in fronds)
    if curl > 0.5:
        nh = 1 + int((curl - 0.5) * 5.99)
        haz = rng.range(0.0, 2.0 * math.pi)
        for j in range(nh):
            haz += 2.0 * math.pi / nh + rng.range(-0.4, 0.4)
            nd = nodes[j % len(nodes)]
            h = (apex * rng.range(0.46, 0.80) + 0.04) * rng.range(0.94, 1.08)
            R = (0.040 + 0.180 * h) * rng.range(0.92, 1.10)
            heads.append({"az": haz, "h": h, "R": R, "r": R * rng.range(0.16, 0.22),
                          "lean": rng.range(0.10, 0.30),
                          "tilt": rng.range(0.55, 1.15) * (1.0 if j % 2 == 0 else -1.0),
                          "off": (nd[0] + math.cos(haz) * rc * rng.range(0.2, 0.5),
                                  nd[1] + math.sin(haz) * rc * rng.range(0.2, 0.5))})

    return {"seed": seed, "habit": habit, "form": form, "size": size, "breadth": breadth,
            "curl": curl, "tone": tone, "stipe": stipe, "fill": fill, "sweep": sweep,
            "pitch": pitch, "pside": pside, "pside1": pside1, "rc": rc, "nodes": nodes,
            "nodeR": node_r, "creep": hb["creep"], "fronds": fronds, "heads": heads}


# ---------------------------------------------------------------- the rachis
def _spine(fr, fine):
    """A frond's rachis: `fine` + 1 points from its base, turning down from e0 by `turn`."""
    az, L = fr["az"], fr["len"]
    pts = [fr["base"]]
    for s in range(fine):
        el = fr["e0"] - fr["turn"] * ((s + 0.5) / fine) ** fr["pow"]
        pts.append(T.add(pts[-1], T.mul(T.from_angles(az, el), L / fine)))
    return pts


def _fall(fr, turn):
    """The share of the way from this frond's apex down to its ground clearance that its
    tip actually falls, at a given total turn. 0 stiff, 1 the tip on the clearance.

    A turn so large that the frond never gets above its own clearance has fallen further
    than any target, not zero: returning 0 there is what used to hand a flat rosette the
    maximum turn and bury its fronds in the ground.
    """
    fr["turn"] = turn
    sp = _spine(fr, 24)
    apex = max(p[2] for p in sp)
    head = apex - fr["zfloor"]
    if head <= 1e-5:
        return 9.0
    return (apex - sp[-1][2]) / head


def _solve_turn(fr):
    """Bisect the rachis turn so the tip falls `fr['drop']` of the way back to the ground.

    The arch is the thing the eye reads, so it is set directly rather than left to whatever
    survives a collision fix-up. If the frond is too short or too flat to have any headroom,
    its rise is raised until it does, which is the only case that moves `e0`.
    """
    fr["turn"] = 0.0
    for _ in range(10):
        sp = _spine(fr, 12)
        if max(p[2] for p in sp) - fr["zfloor"] > 0.02 or fr["e0"] >= math.radians(86.0):
            break
        fr["e0"] = min(math.radians(86.0), fr["e0"] + 0.09)
    lo, hi = 0.0, min(2.7, fr["e0"] + 1.95)
    if _fall(fr, hi) < fr["drop"]:
        fr["turn"] = hi
        return
    for _ in range(26):
        mid = 0.5 * (lo + hi)
        if _fall(fr, mid) < fr["drop"]:
            lo = mid
        else:
            hi = mid
    fr["turn"] = 0.5 * (lo + hi)


FINE = 48


def _at(spine, t):
    """Point and unit tangent of the finely sampled spine at fraction t."""
    x = T.clamp01(t) * (len(spine) - 1)
    k = min(len(spine) - 2, int(x))
    f = x - k
    p = tuple(spine[k][c] + (spine[k + 1][c] - spine[k][c]) * f for c in range(3))
    return p, T.norm(T.sub(spine[k + 1], spine[k]))


def _blade_up(fr, d):
    """The frond's blade normal at a rachis tangent `d`, rolled a little about the rachis."""
    side0 = (-math.sin(fr["az"]), math.cos(fr["az"]), 0.0)
    up0 = T.norm(T.cross(side0, d))
    if up0[2] < 0.0:
        up0 = T.mul(up0, -1.0)
    cr, sr = math.cos(fr["roll"]), math.sin(fr["roll"])
    side = T.add(T.mul(side0, cr), T.mul(up0, sr))
    up = T.norm(T.cross(side, d))
    if up[2] < 0.0:
        up = T.mul(up, -1.0)
    return up


def _pinna_len(fr, v):
    """A pinna's length at blade fraction v, over the blade's half-width: shortest at the
    very base, longest at `vm`, then falling steadily to a small terminal leaflet."""
    vm = fr["vm"]
    if v < vm:
        return 0.52 + 0.48 * (v / max(1e-6, vm)) ** 0.8
    return 0.16 + 0.84 * ((1.0 - v) / max(1e-6, 1.0 - vm)) ** 0.80


# ---------------------------------------------------------------- primitives
#: A pinna outline, as (fraction along, fraction of the half-width). A closed ring; the
#: shell is that ring plus a raised point above and below its centroid, so a pinna is a
#: thin lozenge with a midrib and never a zero-thickness plane. 2 x len(ring) triangles.
RING6 = ((0.0, 0.0), (0.21, 0.90), (0.60, 0.68), (1.0, 0.0), (0.60, -0.68), (0.21, -0.90))
RING4 = ((0.0, 0.0), (0.36, 0.92), (1.0, 0.0), (0.36, -0.92))


def _lozenge(mesh, ring, up, thick, cols, c_up, c_dn):
    """Close a planar-ish ring into an outward-wound shell with an apex each side of it.

    The ring is reversed if it is not counter-clockwise about `up`, so the winding is a
    consequence of the geometry rather than of the caller remembering which way round.
    """
    m = len(ring)
    c = tuple(sum(p[k] for p in ring) / m for k in range(3))
    nsum = (0.0, 0.0, 0.0)
    for k in range(m):
        nsum = T.add(nsum, T.cross(T.sub(ring[k], c), T.sub(ring[(k + 1) % m], c)))
    if T.dot(nsum, up) < 0.0:
        ring = list(reversed(ring))
        cols = list(reversed(cols))
    idx = [mesh.vert(ring[k], cols[k]) for k in range(m)]
    a_up = mesh.vert(T.add(c, T.mul(up, 0.5 * thick)), c_up)
    a_dn = mesh.vert(T.sub(c, T.mul(up, 0.5 * thick)), c_dn)
    for k in range(m):
        j = (k + 1) % m
        mesh.face((idx[k], idx[j], a_up))
        mesh.face((idx[j], idx[k], a_dn))


def _pinna(mesh, base, along, up, length, hw, sag, thick, ring, c0, c1, c_dn):
    """One leaflet: a lozenge swept from `base` along `along`, its tip sagging by `sag`."""
    across = T.norm(T.cross(along, up))
    pts, cols = [], []
    for (fx, fy) in ring:
        q = T.add(base, T.add(T.mul(along, fx * length), T.mul(across, fy * hw)))
        q = T.add(q, T.mul(up, -sag * fx * fx * length))
        pts.append(q)
        cols.append(tuple(c0[k] + (c1[k] - c0[k]) * fx for k in range(3)))
    _lozenge(mesh, pts, up, thick, cols, c1, c_dn)


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"ring": RING6, "side": "pside", "rach": (4, 9), "crown": (8, 5), "head": (5, 4, 14),
        "blade": 0},
    1: {"ring": RING4, "side": "pside1", "rach": (3, 5), "crown": (6, 4), "head": (4, 3, 6),
        "blade": 0},
    2: {"ring": None, "side": None, "rach": None, "crown": (4, 3), "head": None, "blade": 3},
}


def _frond(mesh, pl, fr, cfg):
    """A stipe, a tapering rachis and alternating pinnae stepping down it to a terminal one."""
    spine = _spine(fr, FINE)
    ts = pl["stipe"]
    zt = max(p[2] for p in spine)
    half = 0.5 * fr["w"] * fr["len"]           # the longest pinna, at `vm`
    pside = pl[cfg["side"]]
    ring = cfg["ring"]
    # Rachis: a thin tube that keeps tapering, dark at the foot, green under the blade.
    sides, m = cfg["rach"]
    path = [_at(spine, k / (m - 1))[0] for k in range(m)]
    r0 = (0.0070 + 0.0032 * pl["size"]) * (0.80 + 0.5 * fr["w"])
    radii = [r0 * T.lerp(1.0, 0.34, k / (m - 1)) for k in range(m)]
    T.tube(mesh, path, radii, sides,
           lambda u, mm: T.foliage(T.clamp01((0.07 + 0.26 * u) * pl["tone"])))

    def colours(v, fx_light):
        zf = T.clamp01(_at(spine, ts + (1.0 - ts) * v)[0][2] / max(1e-6, zt))
        t0 = (0.20 + 0.34 * v + 0.14 * zf) * pl["tone"] * fr["tone"]
        t1 = t0 + 0.20 * fx_light
        return (T.foliage(T.clamp01(t0)), T.foliage(T.clamp01(t1)),
                T.foliage(T.clamp01(0.05 + 0.15 * v) * pl["tone"]))

    step = (1.0 - ts) / pside                  # the gap to the next pinna on the same side
    half_gap = 0.5 * step * fr["len"]
    npin = 2 * pside
    for i in range(npin):
        v = (i + 0.55) / npin
        t = ts + (1.0 - ts) * v
        p, d = _at(spine, t)
        up = _blade_up(fr, d)
        across = T.norm(T.cross(up, d))
        s = 1.0 if i % 2 == 0 else -1.0
        along = T.norm(T.add(T.mul(across, s * math.cos(pl["sweep"])),
                             T.mul(d, math.sin(pl["sweep"]))))
        along = T.norm(T.sub(T.mul(along, math.cos(pl["pitch"])),
                             T.mul(up, math.sin(pl["pitch"]))))
        e = _pinna_len(fr, v)
        length = half * e
        hw = max(0.0035, pl["fill"] * half_gap * (0.55 + 0.45 * e))
        c0, c1, cd = colours(v, 1.0)
        _pinna(mesh, p, along, up, length, hw, 0.22 + 0.5 * pl["pitch"],
               0.0030 + 0.030 * hw, ring, c0, c1, cd)
    # The terminal leaflet: longer than its neighbours and square on the rachis tip.
    p, d = _at(spine, 1.0)
    up = _blade_up(fr, d)
    along = T.norm(T.sub(T.mul(d, math.cos(pl["pitch"])),
                         T.mul(up, math.sin(pl["pitch"]))))
    c0, c1, cd = colours(1.0, 1.0)
    _pinna(mesh, p, along, up, half * _pinna_len(fr, 1.0) * 2.2,
           max(0.0035, pl["fill"] * half_gap * 0.66), 0.18, 0.0030, ring, c0, c1, cd)


def _blade(mesh, pl, fr, rows):
    """LOD2's frond: no pinnae, one thin bent strip following the rachis. `rows` points."""
    spine = _spine(fr, FINE)
    ts = pl["stipe"]
    zt = max(p[2] for p in spine)
    half = 0.5 * fr["w"] * fr["len"]
    vmid = ts + (1.0 - ts) * fr["vm"]
    ts_t = [0.0, vmid, 1.0] if rows == 3 else [k / (rows - 1) for k in range(rows)]
    ws = [0.012 * pl["size"], 1.70 * half, 0.46 * half]
    pts, nrm, thick, ct, cb = [], [], [], [], []
    for k, t in enumerate(ts_t):
        p, d = _at(spine, t)
        up = _blade_up(fr, d)
        across = T.norm(T.cross(up, d))
        hw = 0.5 * ws[k]
        pts.append([T.add(p, T.mul(across, -hw)), T.add(p, T.mul(across, hw))])
        nrm.append([up, up])
        thick.append([0.006, 0.006])
        zf = T.clamp01(p[2] / max(1e-6, zt))
        top = T.foliage(T.clamp01((0.20 + 0.36 * t + 0.14 * zf) * pl["tone"] * fr["tone"]))
        ct.append([top, top])
        bot = T.foliage(T.clamp01((0.05 + 0.15 * t) * pl["tone"]))
        cb.append([bot, bot])
    T.thick_grid(mesh, pts, nrm, thick, ct, cb)


def _crown(mesh, pl, seg, rings):
    """The rhizome: a dark, squat, lumpy knob at each node, and, when there is more than
    one, the creeping stem that joins them. Sunk so it sits in the ground."""
    rc = pl["nodeR"]
    for nd in pl["nodes"]:
        def place(d, nd=nd):
            m = 1.0 + 0.12 * math.cos(3.0 * math.atan2(d[1], d[0]) + d[2] * 2.0)
            p = (nd[0] + d[0] * rc * m, nd[1] + d[1] * rc * m,
                 rc * 0.15 + d[2] * rc * 0.62 * m)
            return p, T.bark_shade(0.85 + 0.30 * (0.5 + 0.5 * d[2]))
        T.blob(mesh, seg, rings, place)
    if len(pl["nodes"]) > 1:
        path = [(nd[0], nd[1], rc * 0.12) for nd in pl["nodes"]]
        radii = [rc * 0.42] * len(path)
        T.tube(mesh, path, radii, max(3, seg // 2), lambda u, m: T.bark_shade(0.80))


def _head(mesh, hd, sides, stalk_n, coil_n):
    """A fiddlehead: a stalk rising from the crown that rolls outward into a crozier coil.
    The coil tightens to a third of its radius, and the tube stays thick to its blunt end."""
    o = (math.cos(hd["az"]), math.sin(hd["az"]), 0.0)
    # The coil rolls in its own plane, turned off the lean's: a crozier seen exactly
    # edge-on is a straight stick, and three heads 120 deg apart guarantee one of them.
    oc = (math.cos(hd["az"] + hd["tilt"]), math.sin(hd["az"] + hd["tilt"]), 0.0)
    b = (hd["off"][0], hd["off"][1], 0.0)
    top = (b[0] + o[0] * hd["lean"] * hd["h"], b[1] + o[1] * hd["lean"] * hd["h"], hd["h"])
    path = []
    for k in range(stalk_n):
        u = k / stalk_n
        path.append((T.lerp(b[0], top[0], u * u), T.lerp(b[1], top[1], u * u),
                     T.lerp(-0.012, top[2], u)))
    R0 = hd["R"]
    cc = T.add(top, T.mul(oc, R0))
    for k in range(coil_n + 1):           # k = 0 is `top`: the stalk stops short of it
        u = k / coil_n
        phi = math.pi - u * 2.0 * math.pi * 1.45
        R = R0 * (1.0 - 0.74 * u)
        path.append(T.add(cc, T.add(T.mul(oc, R * math.cos(phi)),
                                   (0.0, 0.0, R * math.sin(phi)))))
    m = len(path)
    radii = [hd["r"] * T.lerp(1.0, 0.44, (k / (m - 1)) ** 0.8) for k in range(m)]
    T.tube(mesh, path, radii, sides,
           lambda u, mm: T.foliage(T.clamp01(0.34 + 0.46 * u)))


def build(seed, lod=0, params=None):
    """Build one fern. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides plan
    entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    _crown(mesh, pl, *cfg["crown"])
    for fr in pl["fronds"]:
        if cfg["blade"]:
            _blade(mesh, pl, fr, cfg["blade"])
        else:
            _frond(mesh, pl, fr, cfg)
    if cfg["head"]:
        sides, sn, cn = cfg["head"]
        for hd in pl["heads"]:
            _head(mesh, hd, sides, sn, cn)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    top, reach, drops = pl["rc"], pl["rc"], []
    for fr in pl["fronds"]:
        sp = _spine(fr, FINE)
        half = 0.5 * fr["w"] * fr["len"]
        apex = max(p[2] for p in sp)
        drops.append(apex - sp[-1][2])
        top = max(top, apex + 0.25 * half)
        for k, p in enumerate(sp):
            v = T.clamp01((k / (len(sp) - 1) - pl["stipe"]) / max(1e-6, 1.0 - pl["stipe"]))
            reach = max(reach, math.hypot(p[0], p[1]) + 0.80 * half * _pinna_len(fr, v))
    for hd in pl["heads"]:
        top = max(top, hd["h"] + 2.0 * hd["R"])
    return {
        "seed": int(seed), "habit": pl["habit"], "form": round(pl["form"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "sheetWidth": round(1.7 * reach, 3),
        "fronds": len(pl["fronds"]),
        "breadth": round(sum(fr["w"] for fr in pl["fronds"]) / len(pl["fronds"]), 4),
        "droop": round(sum(drops) / len(drops) / top, 4),
        "curl": len(pl["heads"]),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
