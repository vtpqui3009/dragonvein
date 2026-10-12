"""B1 wind-twisted — a seeded gnarled, wind-bent tree (docs/ASSET_PLAN.md §B1, M5b).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
The cliff-pine / bonsai read. A trunk rises vertically out of a gnarled root flare at
z = 0, then bends downwind through a chain of segments, with one or two kinks where it
jerked against the weather and a leader that often turns back up at the end. Spiral ridges
run up it: the grain is twisted. Branches leave the upper trunk swept to the lee side,
kinked once. The foliage is a set of flat, lumpy cloud pads stretched downwind, seated on
the branch tips, so the crown is a lopsided flag streaming one way. Some seeds carry a bare
dead snag pointing into the wind.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 is a low, crouched cliff shrub-tree whose trunk runs almost flat along the ground, 1 a
tall leaning tree carrying a flag of pads high up. Height, bend and pad shape are
stratified too, on sequences that separate the seeds the golden one puts close together.

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
METRIC_AXES = ["height", "width", "lean", "pads", "flag"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 low crouched cliff shrub-tree ... 1 tall leaning "
                       "flagged tree. Drives height, how flat the trunk runs, pad height."),
    "height": (0.80, 1.22, "multiplier on the form's height (1.7 m at 0, 7.4 m at 1); "
                           "stratified on the plastic number"),
    "bend": (0.0, 1.0, "stratified on golden**-4: extra bend downwind on top of form"),
    "padShape": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 thin flat cloud pads ... 1 deep "
                           "rounded clumps"),
    "windDir": (-0.30, 0.30, "radians off the +x or -x axis that the wind blows toward"),
    "segments": (4, 6, "trunk segments between the vertical base and the leader"),
    "baseLength": (0.08, 0.18, "vertical base segment, as a fraction of height"),
    "kinks": (1, 2, "abrupt changes of direction along the trunk"),
    "kinkAngle": (16.0, 34.0, "degrees each kink turns the trunk, up or down"),
    "wander": (0.08, 0.30, "radians of sideways wander per trunk segment"),
    "leaderRise": (0.0, 40.0, "degrees the last segment turns back up"),
    "reach": (0.85, 1.20, "multiplier on the form's horizontal trunk reach (2.3 m at form "
                          "0, 2.6 m at 1: a sprawl on a shrub, a lean on a tall tree)"),
    "trunkRadius": (0.050, 0.078, "base radius as a fraction of the trunk's length"),
    "rootFlare": (1.40, 1.95, "base radius multiplier at the ground"),
    "roots": (3, 5, "gnarled root lobes in the flare"),
    "twist": (0.5, 1.6, "turns of the spiral grain over the trunk's length"),
    "ridge": (0.06, 0.15, "spiral ridge depth, as a fraction of radius"),
    "branches": (2, 5, "live branches off the upper trunk"),
    "branchSweep": (0.20, 0.50, "radians either side of downwind the branches may point"),
    "branchLength": (0.15, 0.32, "branch length in heights"),
    "padRadius": (0.75, 1.20, "multiplier on the form's pad radius"),
    "padStretch": (1.15, 1.65, "how much a pad is drawn out along the wind"),
    "padLumps": (0.45, 0.85, "lump amplitude on a pad's clumps"),
    "padClumps": (2, 4, "faceted clumps a pad is built from, streaming downwind"),
    "extraPads": (0.25, 0.75, "chance a branch carries a second, smaller pad mid-way"),
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
    bend = _p("bend", T.stratify(seed, T.PHI_M4, 0.10, rng))
    pad_shape = _p("padShape", T.stratify(seed, T.SQRT3M1, 0.08, rng))

    H = T.lerp(1.7, 7.4, form) * _p("height", h_t)
    w_az = (0.0 if rng.chance(0.5) else math.pi) + _p("windDir", rng.next())
    wdir = (math.cos(w_az), math.sin(w_az), 0.0)
    n_seg = rng.int(int(PARAMS["segments"][0]), int(PARAMS["segments"][1]))
    base_len = _p("baseLength", rng.next())
    n_kinks = rng.int(int(PARAMS["kinks"][0]), int(PARAMS["kinks"][1]))
    kink_at = sorted({rng.int(1, n_seg - 1) for _ in range(n_kinks)})
    kink_angles = {k: math.radians(_p("kinkAngle", rng.next())) * (1.0 if rng.chance(0.45) else -1.0)
                   for k in kink_at}
    wander = _p("wander", rng.next())
    leader_rise = math.radians(_p("leaderRise", rng.next()))
    reach = _p("reach", rng.next()) * T.lerp(2.3, 2.6, form) * T.lerp(0.8, 1.15, bend)

    # --- trunk control polygon: vertical base, then bending downwind ---
    e_end = math.radians(T.lerp(8.0, 64.0, form) - T.lerp(0.0, 22.0, bend))
    # three points on the axis: the Catmull-Rom span between the first two is then exactly
    # vertical, so the flared root ring sits level and the wind sees a vertical base
    ctrl = [(0.0, 0.0, 0.0), (0.0, 0.0, 0.5 * base_len), (0.0, 0.0, base_len)]
    az = w_az
    lens = [rng.range(0.7, 1.3) for _ in range(n_seg)]
    for k in range(1, n_seg + 1):
        f = (k / n_seg) ** 0.65
        el = T.lerp(math.radians(80.0), e_end, f) + kink_angles.get(k, 0.0)
        if k == n_seg:
            el += leader_rise
        el = max(math.radians(3.0), min(math.radians(85.0), el))
        az += rng.range(-wander, wander)
        az = w_az + max(-0.45, min(0.45, az - w_az))
        d = T.from_angles(az, el)
        ctrl.append(T.add(ctrl[-1], T.mul(d, lens[k - 1] / n_seg)))
    # Scale to the height, but never let a crouched trunk sprawl past its reach.
    zmax = max(p[2] for p in ctrl)
    horiz = max(math.hypot(p[0], p[1]) for p in ctrl)
    s = min(0.84 * H / zmax, reach / max(1e-6, horiz))
    ctrl = [T.mul(p, s) for p in ctrl]
    ctrl[0] = (0.0, 0.0, -0.06)
    dense = T.catmull(ctrl, 8)
    trunk_len = sum(T.length(T.sub(dense[i + 1], dense[i])) for i in range(len(dense) - 1))
    r0 = max(0.07, trunk_len * _p("trunkRadius", rng.next()))
    flare = _p("rootFlare", rng.next())
    n_roots = rng.int(int(PARAMS["roots"][0]), int(PARAMS["roots"][1]))
    twist = _p("twist", rng.next())
    ridge = _p("ridge", rng.next())
    phase = rng.range(0.0, 6.2831853)

    # --- branches, swept downwind ---
    n_br = rng.int(int(PARAMS["branches"][0]), int(PARAMS["branches"][1]))
    sweep = _p("branchSweep", rng.next())
    br_len = _p("branchLength", rng.next())
    pad_r = _p("padRadius", rng.next()) * T.lerp(0.62, 0.85, form) * max(1.0, H / 4.0) ** 0.4
    pad_stretch = _p("padStretch", rng.next())
    pad_lumps = _p("padLumps", rng.next())
    extra = _p("extraPads", rng.next())
    has_snag = rng.chance(0.45)
    tone = _p("tone", rng.next())
    sq = T.lerp(0.30, 0.62, pad_shape)

    def r_at(i):
        u = i / (len(dense) - 1)
        return r0 * T.lerp(1.0, 0.30, u ** 0.85)

    branches, pads = [], []
    n_d = len(dense)
    for b in range(n_br):
        f = T.lerp(0.42, 0.92, (b + rng.range(0.1, 0.9)) / n_br)
        idx = min(n_d - 2, max(1, int(round(f * (n_d - 1)))))
        o = dense[idx]
        a1 = w_az + rng.range(-sweep, sweep)
        e1 = math.radians(rng.range(-6.0, 32.0))
        ln = br_len * H * rng.range(0.7, 1.2)
        d1 = T.from_angles(a1, e1)
        mid = T.add(o, T.mul(d1, ln * 0.5))
        a2 = T.lerp(a1, w_az, rng.range(0.4, 0.8))
        e2 = e1 + math.radians(rng.range(-28.0, 14.0))
        tip = T.add(mid, T.mul(T.from_angles(a2, e2), ln * 0.5))
        if tip[2] < 0.35:
            tip = (tip[0], tip[1], 0.35)
        if mid[2] < 0.3:
            mid = (mid[0], mid[1], 0.3)
        branches.append({"pts": [o, mid, tip], "r0": r_at(idx) * rng.range(0.42, 0.6),
                         "dead": False})
        pads.append(_pad(tip, wdir, pad_r * rng.range(0.75, 1.1), sq, pad_stretch, pad_lumps,
                         rng))
        if rng.chance(extra):
            pads.append(_pad(_lerp3(o, tip, rng.range(0.45, 0.7)), wdir,
                             pad_r * rng.range(0.5, 0.72), sq, pad_stretch, pad_lumps, rng))
    # the leader's own pad, the largest
    pads.append(_pad(dense[-1], wdir, pad_r * rng.range(1.0, 1.25), sq, pad_stretch,
                     pad_lumps, rng))
    if has_snag:
        idx = min(n_d - 2, max(1, int(round(rng.range(0.35, 0.7) * (n_d - 1)))))
        o = dense[idx]
        a = w_az + math.pi + rng.range(-0.6, 0.6)
        e = math.radians(rng.range(8.0, 42.0))
        ln = br_len * H * rng.range(0.4, 0.7)
        mid = T.add(o, T.mul(T.from_angles(a, e), ln * 0.55))
        tip = T.add(mid, T.mul(T.from_angles(a + rng.range(-0.5, 0.5), e + 0.3), ln * 0.45))
        branches.append({"pts": [o, mid, tip], "r0": r_at(idx) * 0.36, "dead": True})

    # No pad may touch the ground, at any LOD: lift it until its lowest clump (or the
    # merged LOD2 clump) clears. 0.62 is the flattened underside, 1.3 the largest lump.
    for pd in pads:
        bottom = min(c[0][2] - c[3] * 0.62 * 1.3
                     for merge in (False, True) for c in _clumps(pd, wdir, merge))
        if bottom < 0.18:
            pd["c"] = (pd["c"][0], pd["c"][1], pd["c"][2] + 0.18 - bottom)

    clumps = [c for pd in pads for c in _clumps(pd, wdir, False)]
    zs = [c[0][2] - c[3] * 0.62 for c in clumps] + [c[0][2] + c[3] for c in clumps]
    return {"seed": seed, "form": form, "height": H, "ctrl": ctrl, "r0": r0, "flare": flare,
            "roots": n_roots, "twist": twist, "ridge": ridge, "phase": phase,
            "branches": branches, "pads": pads, "wdir": wdir, "tone": tone,
            "canopyZ": (min(zs), max(zs)), "trunkLen": trunk_len}


def _pad(c, wdir, r, sq, stretch, lumps, rng):
    """A cloud pad: a main clump plus 1-3 smaller ones trailing downwind and to the side.
    Offsets are in the pad's own radii (along wind, across, up)."""
    c = T.add(c, T.add(T.mul(wdir, r * stretch * 0.30), (0.0, 0.0, r * sq * 0.35)))
    n = rng.int(int(PARAMS["padClumps"][0]), int(PARAMS["padClumps"][1]))
    subs = []
    for k in range(n):
        off = (0.0, 0.0, 0.0) if k == 0 else (rng.range(-0.25, 0.75), rng.range(-0.55, 0.55),
                                               rng.range(-0.2, 0.45))
        bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.2, 1))),
                  rng.range(0.45, 1.0)) for _ in range(4)]
        subs.append({"off": off, "scale": 1.0 if k == 0 else rng.range(0.52, 0.8),
                     "bumps": bumps, "lumps": lumps * rng.range(0.8, 1.2)})
    return {"c": c, "rx": r * stretch, "ry": r, "rz": r * sq * rng.range(0.85, 1.15),
            "subs": subs, "tone": rng.range(0.92, 1.08)}


def _lerp3(a, b, t):
    return (T.lerp(a[0], b[0], t), T.lerp(a[1], b[1], t), T.lerp(a[2], b[2], t))


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
    cx, cy, cz = cen
    ax = wdir
    ay = (-wdir[1], wdir[0], 0.0)
    amp = sb["lumps"] * lump_scale
    z0, z1 = zrange

    def place(d):
        m = 1.0
        for b, a in sb["bumps"]:
            m += amp * a * max(0.0, T.dot(d, b)) ** 1.8
        m /= 1.0 + amp * 0.46
        lx, ly, lz = d[0] * rx * m, d[1] * ry * m, d[2] * rz * m
        if d[2] < 0.0:
            lz *= 0.62                       # cloud pads sit flat underneath
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

    # --- trunk ---
    path = T.catmull(pl["ctrl"], cfg["trunk_per"])
    n = len(path)
    r0, flare = pl["r0"], pl["flare"]
    radii = []
    for i in range(n):
        u = i / (n - 1)
        f = max(0.0, 1.0 - u / 0.14)
        radii.append(r0 * T.lerp(1.0, 0.30, u ** 0.85) * (1.0 + (flare - 1.0) * f * f))
    roots, twist, ridge, ph = pl["roots"], pl["twist"], pl["ridge"], pl["phase"]

    def lobes(u, th):
        near = max(0.0, 1.0 - u / 0.2)
        root = max(0.0, math.cos(roots * (th - ph))) ** 1.5
        grain = math.cos(3.0 * (th - ph - twist * 2.0 * math.pi * u))
        return 1.0 + 0.6 * near * near * root + ridge * grain
    T.tube(mesh, path, radii, cfg["trunk_sides"],
           lambda u, m: T.bark(0.2 + 0.45 * u + 0.9 * (m - 1.0)), lobe_fn=lobes)

    # --- branches ---
    for br in pl["branches"]:
        pts = br["pts"]
        bp = T.catmull(pts, cfg["br_per"]) if cfg["br_per"] else [pts[0], pts[2]]
        m = len(bp)
        rr = [br["r0"] * T.lerp(1.0, 0.35, k / (m - 1)) for k in range(m)]
        if br["dead"]:
            col = lambda u, mm: T.bark(0.85 + 0.15 * u)       # weathered, the palest bark
        else:
            col = lambda u, mm: T.bark(0.35 + 0.3 * u)
        T.tube(mesh, bp, rr, cfg["br_sides"], col)

    # --- pads ---
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
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    pads = pl["pads"]
    wd = pl["wdir"]
    cl = [c for pd in pads for c in _clumps(pd, wd, False)]
    top = max(max(c[0][2] + c[3] for c in cl), max(p[2] for p in pl["ctrl"]))
    reach = max(math.hypot(c[0][0], c[0][1]) + c[1] for c in cl)
    reach = max(reach, max(math.hypot(p[0], p[1]) for p in pl["ctrl"]))
    w = sum(c[1] * c[2] * c[3] for c in cl)
    cx = sum(c[0][0] * c[1] * c[2] * c[3] for c in cl) / w
    cy = sum(c[0][1] * c[1] * c[2] * c[3] for c in cl) / w
    along = [T.dot(c[0], wd) for c in cl]
    span_h = max(a + c[1] for a, c in zip(along, cl)) - min(a - c[1] for a, c in zip(along, cl))
    span_v = pl["canopyZ"][1] - pl["canopyZ"][0]
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(top, 3),
        "width": round(2.0 * reach, 3),
        "lean": round(math.hypot(cx, cy) / top, 4),
        "pads": len(pads),
        "flag": round(span_h / max(1e-6, span_v), 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
