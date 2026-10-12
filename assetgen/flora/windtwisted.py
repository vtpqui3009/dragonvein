"""B1 wind-twisted — a seeded gnarled, wind-bent tree (docs/ASSET_PLAN.md §B1, M5b).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
The cliff-pine / bonsai read. A trunk rises vertically out of a gnarled root flare at
z = 0 and then gives way to the wind, which always blows toward +x in the tree's own frame
(the game yaws every instance, so one fixed frame costs nothing and lets a sheet read as
one weather). Spiral ridges run up the trunk: the grain is twisted. Branches are thick,
swept to the lee side, and end *inside* their foliage pads. A pad is a solid, domed cloud:
a main clump, a crown clump on top and low side clumps, convex top and bottom, so it never
reads as a dish. A clearance pass pushes any pad the trunk would poke through further out
along its branch. Some seeds carry a bare dead snag pointing into the wind.

Four archetypes, stratified on the seed so any eight consecutive seeds hold each twice:
- flag: a trunk leaning hard downwind, every branch streaming one way off its top;
- cascade: the cliff-hanger, rising, arching over, descending and turning up at the tip;
- arm: a short leaning trunk that turns into one long, near-horizontal arm;
- twin: two trunks forking low, one leaning further than the other.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a low, crouched tree about 3 m tall, 1 a tall one about 7.5 m tall. The archetype rides
on its own sequence (sqrt(3) - 1), which puts each archetype's two seeds far apart in form.

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
NAME = "windtwisted"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
PALETTE = dict(T.PALETTE)
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `trunkTip` is the leader's tip height over the tree's: it is what separates a cascade
#: (tip hung low) or an arm from a flag or a twin when their sizes happen to match.
METRIC_AXES = ["height", "width", "lean", "flag", "trunkTip"]
#: `sheetWidth` (not `width`) frames the sheet. Every tree leans toward +x, so a neighbour
#: needs room for this tree's downwind reach plus the next one's upwind reach, not for
#: twice the longer of the two; see `metrics`.
SHEET = {"widthKey": "sheetWidth", "topKey": "height", "bottomKey": None, "rx": 83.0,
         "ground": True}

ARCHETYPES = ("flag", "cascade", "arm", "twin")

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 low crouched tree (~3 m) ... 1 tall tree (~7.5 m)"),
    "archetype": (0.0, 1.0, "stratified on sqrt(3) - 1, in quarters: flag, cascade, arm, "
                            "twin"),
    "height": (0.90, 1.12, "multiplier on the form's height (3.4 m at 0, 7.6 m at 1); "
                           "stratified on the plastic number"),
    "bend": (0.0, 1.0, "stratified on golden**-4: how hard the wind has bent it, within "
                       "its archetype"),
    "padShape": (0.0, 1.0, "stratified on the bronze ratio: 0 flatter cloud pads ... 1 "
                           "deep rounded clumps"),
    "windDir": (-0.25, 0.25, "radians off +x that the wind blows toward"),
    "baseLength": (0.07, 0.14, "vertical base, as a fraction of height"),
    "kink": (0.06, 0.16, "a jog in the trunk, as a fraction of height"),
    "wander": (0.03, 0.10, "sideways wander of trunk points, as a fraction of height"),
    "trunkRadius": (0.040, 0.056, "base radius as a fraction of height"),
    "taper": (0.38, 0.52, "trunk radius at the tip / at the base"),
    "rootFlare": (1.40, 1.90, "base radius multiplier at the ground"),
    "roots": (3, 5, "gnarled root lobes in the flare"),
    "twist": (0.5, 1.6, "turns of the spiral grain over the trunk's length"),
    "ridge": (0.06, 0.14, "spiral ridge depth, as a fraction of radius"),
    "branches": (2, 4, "live branches (per trunk for twin)"),
    "branchSweep": (0.15, 0.45, "radians either side of downwind the branches may point"),
    "branchLength": (0.14, 0.24, "branch length in heights"),
    "branchRadius": (0.55, 0.72, "branch base radius / the trunk's radius where it leaves"),
    "padRadius": (0.85, 1.15, "multiplier on the form's pad radius (0.22 H at 0, 0.155 H "
                              "at 1)"),
    "padStretch": (1.10, 1.35, "how much a pad is drawn out along the wind"),
    "padLumps": (0.30, 0.60, "outward lump amplitude on a clump (never an indent)"),
    "sideClumps": (0, 2, "low side clumps on a pad, besides its main and crown clumps"),
    "snag": (0.0, 1.0, "chance of a dead, bare snag pointing into the wind"),
    "tone": (0.90, 1.10, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole tree as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.07, rng))
    h_t = T.stratify(seed, T.PLASTIC, 0.12, rng)
    arch_t = _p("archetype", T.stratify(seed, T.SQRT3M1, 0.03, rng))
    bend = _p("bend", T.stratify(seed, T.PHI_M4, 0.10, rng))
    pad_shape = _p("padShape", T.stratify(seed, 0.3027756377319946, 0.08, rng))
    arch = ARCHETYPES[min(3, int(arch_t * 4.0))]

    H = T.lerp(3.4, 7.6, form) * _p("height", h_t)
    w_az = _p("windDir", rng.next())
    wd = (math.cos(w_az), math.sin(w_az), 0.0)
    lat = (-wd[1], wd[0], 0.0)

    def P(a, l, z):
        """A point `a` downwind, `l` across the wind, `z` up."""
        return (wd[0] * a + lat[0] * l, wd[1] * a + lat[1] * l, z)

    b = _p("baseLength", rng.next()) * H
    kink = _p("kink", rng.next()) * H * (1.0 if rng.chance(0.5) else -1.0)
    wander = _p("wander", rng.next()) * H
    wl = [rng.range(-1.0, 1.0) * wander for _ in range(6)]
    jit = [rng.range(0.9, 1.1) for _ in range(6)]
    r0 = _p("trunkRadius", rng.next()) * H
    taper = _p("taper", rng.next())
    flare = _p("rootFlare", rng.next())
    n_roots = rng.int(int(PARAMS["roots"][0]), int(PARAMS["roots"][1]))
    twist = _p("twist", rng.next())
    ridge = _p("ridge", rng.next())
    phase = rng.range(0.0, 6.2831853)
    n_br = rng.int(int(PARAMS["branches"][0]), int(PARAMS["branches"][1]))
    sweep = _p("branchSweep", rng.next())
    br_len = _p("branchLength", rng.next()) * H
    br_rad = _p("branchRadius", rng.next())
    pad_r = _p("padRadius", rng.next()) * T.lerp(0.22, 0.155, form) * H
    stretch = _p("padStretch", rng.next())
    lumps = _p("padLumps", rng.next())
    sq = T.lerp(0.42, 0.72, pad_shape)
    has_snag = rng.chance(0.5)
    tone = _p("tone", rng.next())

    # --- trunk control polylines (metres), each starting with three points on the axis
    #     so the Catmull-Rom base span is exactly vertical and the root ring sits level ---
    base = [(0.0, 0.0, -0.06), (0.0, 0.0, 0.5 * b), (0.0, 0.0, b)]
    trunks = []
    if arch == "flag":
        lean = math.radians(T.lerp(38.0, 52.0, bend))
        top = H * 0.78
        dx = (top - b) * math.tan(lean)
        pts = [P(dx * f ** 1.25 * jit[k] + (kink if k == 2 else 0.0), wl[k], b + (top - b) * f)
               for k, f in enumerate((0.25, 0.5, 0.75, 1.0), start=1)]
        trunks.append(base + pts)
    elif arch == "cascade":
        reach = H * T.lerp(0.72, 0.92, bend)
        pts = [P(0.10 * reach, wl[1], 0.52 * H),
               P(0.28 * reach * jit[2], wl[2], 0.76 * H),
               P(0.52 * reach, wl[3], 0.80 * H),
               P(0.74 * reach * jit[4], wl[4], 0.62 * H + 0.3 * kink),
               P(0.92 * reach, wl[5], 0.46 * H),
               P(1.04 * reach, wl[5] * 0.5, 0.56 * H)]
        trunks.append(base + pts)
    elif arch == "arm":
        reach = H * T.lerp(0.78, 0.98, bend)
        elbow = H * 0.58
        pts = [P(0.10 * reach, wl[1], 0.36 * H),
               P(0.20 * reach * jit[2], wl[2], elbow),
               P(0.46 * reach, wl[3], elbow + 0.04 * H + 0.3 * kink),
               P(0.74 * reach * jit[4], wl[4], elbow + 0.02 * H),
               P(1.0 * reach, wl[5], elbow + 0.12 * H)]
        trunks.append(base + pts)
    else:  # twin
        lean = math.radians(T.lerp(36.0, 46.0, bend))
        top = H * 0.80
        dx = (top - b) * math.tan(lean)
        pts = [P(dx * f ** 1.2 * jit[k] + (kink if k == 2 else 0.0), wl[k], b + (top - b) * f)
               for k, f in enumerate((0.25, 0.5, 0.75, 1.0), start=1)]
        trunks.append(base + pts)
        fork = T.catmull(trunks[0], 8)[int(len(T.catmull(trunks[0], 8)) * 0.22)]
        lean2 = math.radians(T.lerp(56.0, 68.0, bend))
        top2 = H * 0.56
        dx2 = (top2 - fork[2]) * math.tan(lean2)
        side = (1.0 if wl[0] >= 0.0 else -1.0) * 0.12 * H
        a0 = T.dot(fork, wd)
        trunks.append([fork] + [P(a0 + dx2 * f ** 1.1, side * f, fork[2] + (top2 - fork[2]) * f)
                                for f in (0.3, 0.65, 1.0)])

    dense = [T.catmull(t, 8) for t in trunks]

    def radius_at(ti, i):
        u = i / (len(dense[ti]) - 1)
        rb = r0 if ti == 0 else r0 * 0.72
        return rb * T.lerp(1.0, taper, u ** 0.85)

    # every trunk sample with its radius, for the pad clearance pass
    trunk_pts = [(p, radius_at(ti, i)) for ti, d in enumerate(dense) for i, p in enumerate(d)]

    # --- branches with their pads ---
    branches, pads = [], []

    def add_branch(ti, f, az_off, elev, length, scale):
        d = dense[ti]
        idx = min(len(d) - 2, max(2, int(round(f * (len(d) - 1)))))
        o = d[idx]
        r_b = radius_at(ti, idx) * br_rad
        a2off = rng.range(0.3, 0.75)
        e2 = elev + math.radians(rng.range(-14.0, 16.0))
        pr = pad_r * scale * rng.range(0.85, 1.12)
        pd_rng = [rng.next() for _ in range(96)]
        for it in range(8):
            ln = length * (1.0 + 0.18 * it)
            el = elev + math.radians(4.0 * it)
            d1 = T.from_angles(w_az + az_off, el)
            mid = T.add(o, T.mul(d1, ln * 0.5))
            tip = T.add(mid, T.mul(T.from_angles(w_az + az_off * (1.0 - a2off), e2 + 0.07 * it),
                                   ln * 0.5))
            pd = _pad(tip, wd, pr, sq, stretch, lumps, pd_rng)
            if _clear(pd, wd, trunk_pts, skip=None):
                break
        branches.append({"pts": [o, mid, tip], "r0": r_b, "r1": r_b * 0.62, "dead": False})
        pads.append(pd)

    def leader_pad(ti, scale):
        d = dense[ti]
        tip = d[-1]
        pd_rng = [rng.next() for _ in range(96)]
        pd = _pad(tip, wd, pad_r * scale, sq, stretch, lumps, pd_rng)
        pads.append(pd)

    if arch == "flag":
        leader_pad(0, 1.15)
        for k in range(n_br + 1):
            f = T.lerp(0.55, 0.92, (k + rng.range(0.2, 0.8)) / (n_br + 1))
            add_branch(0, f, rng.range(-sweep, sweep), math.radians(rng.range(-8.0, 12.0)),
                       br_len * rng.range(0.85, 1.25), rng.range(0.8, 1.05))
    elif arch == "cascade":
        leader_pad(0, 1.0)
        # a crown pad over the arch, then pads stepping down the descending limb
        add_branch(0, 0.55, rng.range(-0.3, 0.3), math.radians(rng.range(55.0, 75.0)),
                   br_len * 0.45, 1.1)
        for k in range(n_br):
            f = T.lerp(0.66, 0.92, (k + rng.range(0.2, 0.8)) / n_br)
            side = 1.0 if k % 2 == 0 else -1.0
            add_branch(0, f, side * rng.range(0.6, 1.1), math.radians(rng.range(-10.0, 15.0)),
                       br_len * rng.range(0.55, 0.85), rng.range(0.75, 0.95))
    elif arch == "arm":
        leader_pad(0, 1.1)
        add_branch(0, 0.40, rng.range(-0.4, 0.4), math.radians(rng.range(50.0, 70.0)),
                   br_len * 0.5, 1.0)
        for k in range(n_br):
            f = T.lerp(0.55, 0.90, (k + rng.range(0.2, 0.8)) / n_br)
            side = 1.0 if k % 2 == 0 else -1.0
            add_branch(0, f, side * rng.range(0.9, 1.4), math.radians(rng.range(20.0, 45.0)),
                       br_len * rng.range(0.45, 0.7), rng.range(0.7, 0.92))
    else:
        leader_pad(0, 1.15)
        leader_pad(1, 1.0)
        for ti in (0, 1):
            for k in range(max(1, n_br - 1)):
                f = T.lerp(0.55, 0.9, (k + rng.range(0.2, 0.8)) / max(1, n_br - 1))
                add_branch(ti, f, rng.range(-sweep, sweep), math.radians(rng.range(-6.0, 14.0)),
                           br_len * rng.range(0.7, 1.0), rng.range(0.75, 0.95))

    if has_snag:
        d = dense[0]
        idx = min(len(d) - 2, max(2, int(round(rng.range(0.3, 0.55) * (len(d) - 1)))))
        o = d[idx]
        a = w_az + math.pi + rng.range(-0.6, 0.6)
        e = math.radians(rng.range(12.0, 42.0))
        ln = br_len * rng.range(0.6, 0.9)
        mid = T.add(o, T.mul(T.from_angles(a, e), ln * 0.55))
        tip = T.add(mid, T.mul(T.from_angles(a + rng.range(-0.5, 0.5), e + 0.3), ln * 0.45))
        r_s = radius_at(0, idx) * 0.42
        branches.append({"pts": [o, mid, tip], "r0": r_s, "r1": r_s * 0.3, "dead": True})

    # No pad may touch the ground, at any LOD.
    for pd in pads:
        bottom = min(c[0][2] - c[3] * 0.62 * 1.3
                     for merge in (False, True) for c in _clumps(pd, wd, merge))
        if bottom < 0.18:
            pd["c"] = (pd["c"][0], pd["c"][1], pd["c"][2] + 0.18 - bottom)

    clumps = [c for pd in pads for c in _clumps(pd, wd, False)]
    zs = [c[0][2] - c[3] * 0.62 for c in clumps] + [c[0][2] + c[3] for c in clumps]
    return {"seed": seed, "form": form, "arch": arch, "height": H, "trunks": trunks,
            "r0": r0, "taper": taper, "flare": flare, "roots": n_roots, "twist": twist,
            "ridge": ridge, "phase": phase, "branches": branches, "pads": pads, "wdir": wd,
            "tone": tone, "canopyZ": (min(zs), max(zs))}


def _pad(tip, wd, r, sq, stretch, lumps, u):
    """A cloud pad seated over a branch tip, which ends inside it. A main clump, a crown
    clump on top and up to two low side clumps: highest in the middle, so a dome, never a
    dish with a rim. `u` is a list of pre-drawn uniforms (drawn whatever the clearance
    pass does, so the stream does not depend on it)."""
    k = iter(u)

    def rr(lo, hi):
        return lo + (hi - lo) * next(k)
    c = T.add(tip, T.add(T.mul(wd, r * stretch * 0.22), (0.0, 0.0, r * sq * 0.18)))
    n_side = int(next(k) * 2.999)
    subs = [{"off": (0.0, 0.0, 0.0), "scale": 1.0},
            {"off": (rr(-0.1, 0.25), rr(-0.15, 0.15), rr(0.40, 0.55)), "scale": rr(0.58, 0.72)}]
    for _ in range(n_side):
        a, l = rr(-0.35, 0.45), rr(-0.55, 0.55)
        subs.append({"off": (a, l, rr(-0.05, 0.12)), "scale": rr(0.50, 0.66)})
    for sb in subs:
        # outward bumps on the flanks only; the dome term in `_clump_mesh` holds the top
        sb["bumps"] = [(T.norm((rr(-1, 1), rr(-1, 1), rr(-0.3, 0.4))), rr(0.5, 1.0))
                       for _ in range(4)]
        sb["lumps"] = lumps * rr(0.8, 1.2)
    return {"c": c, "rx": r * stretch, "ry": r, "rz": r * sq * rr(0.9, 1.1),
            "subs": subs, "tone": rr(0.92, 1.08)}


def _clear(pd, wd, trunk_pts, skip):
    """True if no trunk sample (with its radius) is inside any clump of the pad."""
    ay = (-wd[1], wd[0], 0.0)
    for cen, rx, ry, rz, _ in _clumps(pd, wd, False):
        for p, r in trunk_pts:
            v = T.sub(p, cen)
            a = T.dot(v, wd) / (rx + r)
            b = T.dot(v, ay) / (ry + r)
            c = v[2] / (rz + r)
            if a * a + b * b + c * c < 1.0:
                return False
    return True


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"trunk_per": 4, "trunk_sides": 9, "br_per": 3, "br_sides": 6, "pad": (10, 6),
        "lump": 1.0, "merge": False},
    1: {"trunk_per": 2, "trunk_sides": 6, "br_per": 1, "br_sides": 4, "pad": (6, 4),
        "lump": 0.8, "merge": False},
    2: {"trunk_per": 1, "trunk_sides": 5, "br_per": 0, "br_sides": 3, "pad": (5, 3),
        "lump": 0.5, "merge": True},
}


def _clumps(pd, wdir, merge):
    """(centre, rx, ry, rz, sub) per clump of a pad. LOD2 merges a pad's clumps into one
    clump covering their envelope, so the pad keeps its reach."""
    ay = (-wdir[1], wdir[0], 0.0)
    out = []
    for sb in pd["subs"]:
        a, c, u = sb["off"]
        cen = T.add(pd["c"], T.add(T.mul(wdir, a * pd["rx"]),
                                   T.add(T.mul(ay, c * pd["ry"]), (0.0, 0.0, u * pd["rz"]))))
        k = sb["scale"]
        out.append((cen, pd["rx"] * k, pd["ry"] * k, pd["rz"] * k, sb))
    if not merge or len(out) == 1:
        return out
    w = [o[1] * o[2] * o[3] for o in out]
    cen = tuple(sum(o[0][i] * wi for o, wi in zip(out, w)) / sum(w) for i in range(3))
    rx = max(abs(T.dot(T.sub(o[0], cen), wdir)) + o[1] for o in out) * 0.92
    ry = max(abs(T.dot(T.sub(o[0], cen), ay)) + o[2] for o in out) * 0.92
    rz = max(abs(o[0][2] - cen[2]) + o[3] for o in out) * 0.9
    return [(cen, rx, ry, rz, out[0][4])]


def _pad_mesh(mesh, pd, wdir, seg, rings, zrange, tone, lump_scale, merge):
    for cen, rx, ry, rz, sb in _clumps(pd, wdir, merge):
        _clump_mesh(mesh, cen, rx, ry, rz, sb, wdir, seg, rings, zrange,
                    tone * pd["tone"], lump_scale)


def _clump_mesh(mesh, cen, rx, ry, rz, sb, wdir, seg, rings, zrange, tone, lump_scale):
    """One clump: an ellipsoid pushed *outward* by lumps (never indented), domed on top,
    and flattened but still convex underneath."""
    cx, cy, cz = cen
    ax = wdir
    ay = (-wdir[1], wdir[0], 0.0)
    amp = sb["lumps"] * lump_scale
    z0, z1 = zrange
    norm_k = 1.0 + amp * 0.55

    def place(d):
        m = 1.0 + 0.30 * amp * max(0.0, d[2]) ** 1.5           # the dome
        for b, a in sb["bumps"]:
            m += amp * a * max(0.0, T.dot(d, b)) ** 2.0
        m /= norm_k
        lx, ly, lz = d[0] * rx * m, d[1] * ry * m, d[2] * rz * m
        if d[2] < 0.0:
            lz *= 0.62
        p = (cx + ax[0] * lx + ay[0] * ly, cy + ax[1] * lx + ay[1] * ly, cz + lz)
        zf = T.clamp01((p[2] - z0) / max(1e-6, z1 - z0))
        t = 0.60 * (0.5 + 0.5 * d[2]) + 0.26 * zf + max(-0.08, min(0.08, 0.25 * (m - 1.0)))
        return p, T.foliage(T.clamp01(T.clamp01(t) ** 1.3 * tone))
    T.blob(mesh, seg, rings, place)


def build(seed, lod=0, params=None):
    """Build one wind-twisted tree. seed: any int. lod: 0 / 1 / 2. `params` optionally
    overrides plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    roots, twist, ridge, ph = pl["roots"], pl["twist"], pl["ridge"], pl["phase"]

    for ti, ctrl in enumerate(pl["trunks"]):
        path = T.catmull(ctrl, cfg["trunk_per"])
        n = len(path)
        rb = pl["r0"] if ti == 0 else pl["r0"] * 0.72
        flare = pl["flare"] if ti == 0 else 1.0
        radii = []
        for i in range(n):
            u = i / (n - 1)
            f = max(0.0, 1.0 - u / 0.14)
            radii.append(rb * T.lerp(1.0, pl["taper"], u ** 0.85) * (1.0 + (flare - 1.0) * f * f))

        def lobes(u, th, root_k=(1.0 if ti == 0 else 0.0)):
            near = max(0.0, 1.0 - u / 0.2) * root_k
            root = max(0.0, math.cos(roots * (th - ph))) ** 1.5
            grain = math.cos(3.0 * (th - ph - twist * 2.0 * math.pi * u))
            return 1.0 + 0.6 * near * near * root + ridge * grain
        T.tube(mesh, path, radii, cfg["trunk_sides"],
               lambda u, m: T.bark(0.2 + 0.45 * u + 0.9 * (m - 1.0)), lobe_fn=lobes)

    for br in pl["branches"]:
        pts = br["pts"]
        bp = T.catmull(pts, cfg["br_per"]) if cfg["br_per"] else [pts[0], pts[2]]
        m = len(bp)
        rr = [T.lerp(br["r0"], br["r1"], k / (m - 1)) for k in range(m)]
        if br["dead"]:
            col = lambda u, mm: T.bark(0.85 + 0.15 * u)       # weathered, the palest bark
        else:
            col = lambda u, mm: T.bark(0.35 + 0.3 * u)
        T.tube(mesh, bp, rr, cfg["br_sides"], col)

    for pd in pl["pads"]:
        _pad_mesh(mesh, pd, pl["wdir"], cfg["pad"][0], cfg["pad"][1], pl["canopyZ"],
                  pl["tone"], cfg["lump"], cfg["merge"])

    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES), plus `sheetWidth`.

    `sheetWidth` frames the sheet (render_all spaces seeds by 0.86 x the widest and leaves
    0.61 x it as margin). The tree leans toward +x, so it is 1.64 x the larger of its
    downwind and upwind reach. Reach is measured as the distance from the base axis, so a
    sheet yaw cannot swing any part further along x than this.
    """
    pl = plan(int(seed))
    pads = pl["pads"]
    wd = pl["wdir"]
    cl = [c for pd in pads for c in _clumps(pd, wd, False)]
    pts = [p for t in pl["trunks"] for p in t] + [q for br in pl["branches"] for q in br["pts"]]
    top = max(max(c[0][2] + c[3] for c in cl), max(p[2] for p in pts))
    down, up = 0.0, 0.0
    for c in cl:
        h = math.hypot(c[0][0], c[0][1]) + c[1]
        if c[0][0] >= 0.0:
            down = max(down, h)
        else:
            up = max(up, h)
        up = max(up, abs(c[0][1]) + c[2])
    for p in pts:
        h = math.hypot(p[0], p[1])
        if p[0] >= 0.0:
            down = max(down, h)
        else:
            up = max(up, h)
    w = sum(c[1] * c[2] * c[3] for c in cl)
    cx = sum(c[0][0] * c[1] * c[2] * c[3] for c in cl) / w
    cy = sum(c[0][1] * c[1] * c[2] * c[3] for c in cl) / w
    along = [T.dot(c[0], wd) for c in cl]
    span_h = max(a + c[1] for a, c in zip(along, cl)) - min(a - c[1] for a, c in zip(along, cl))
    span_v = pl["canopyZ"][1] - pl["canopyZ"][0]
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "arch": pl["arch"],
        "height": round(top, 3),
        "width": round(2.0 * max(down, up), 3),
        "sheetWidth": round(1.64 * max(down, up, 0.5), 3),
        "lean": round(math.hypot(cx, cy) / top, 4),
        "pads": len(pads),
        "flag": round(span_h / max(1e-6, span_v), 3),
        "trunkTip": round(pl["trunks"][0][-1][2] / top, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
