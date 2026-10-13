"""B1 dead tree — a seeded bare, weathered dead tree (docs/ASSET_PLAN.md §B1, ROADMAP M5c).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A trunk rises vertically from a gnarled root flare at z = 0, cracked by deep vertical
seams that twist a little with the grain, and wanders as it climbs. There is no canopy.
Limbs are closed tubes that bend at two kinks each, fork, and end either in a sharp,
tapered tip or in a broken, blunt stub; the snapped end of the trunk carries splinters.
Every limb tapers from where it leaves its parent, so nothing reads as a pole with a
ball on top. The wood is the bark surface bleached toward grey: dark and still brown at
the damp base and deep in the seams, grey-brown along the trunk, palest at the broken ends.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a short, thick, broken snag (~2.6 m) with a couple of stubs and splinters at its snapped
top; 1 a tall skeletal tree (~9.5 m) whose trunk opens into three or four limbs forking
twice or three times. Height, branch angle and lean ride on their own stratified
sequences, and a habit on a fourth: plain, split (the trunk cleft into two leaders) or
hollow (the foot rotted through: the trunk stands on two legs with daylight between).

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
NAME = "deadtree"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
#: Bark only: a dead tree carries no foliage, so it declares no ramp.
PALETTE = {"bark": T.PALETTE["bark"]}
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": []}
#: `tips` counts limb ends (sharp or broken); `bole` is the trunk's clear height before its
#: first limb, over the height; `spread` the crown's half-width over the height.
METRIC_AXES = ["height", "width", "tips", "bole", "spread"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

HABITS = ("plain", "split", "hollow")
PI_M3 = 0.14159265358979312

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 short thick broken snag (~2.6 m) with stubs ... 1 tall "
                       "skeletal tree (~9.5 m) of limbs forking two or three deep"),
    "height": (0.90, 1.12, "multiplier on the form's height; stratified on the plastic number"),
    "angle": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 limbs climb steeply (a broom) ... 1 "
                        "limbs spread wide and level (a candelabra)"),
    "lean": (0.0, 1.0, "stratified on golden**-4: 0 upright ... 1 leaning 20% (a snag) to "
                       "9% (a tall tree) of its height"),
    "habit": (0.0, 1.0, "stratified on pi - 3, in thirds: plain, split (two leaders from a "
                        "cleft), hollow (the foot rotted through into two legs)"),
    "trunkRadius": (0.85, 1.15, "multiplier on the form's base radius (0.13 H at 0, 0.05 H "
                                "at 1)"),
    "taper": (0.40, 0.60, "trunk radius at its top / at its base"),
    "rootFlare": (1.35, 1.85, "base radius multiplier at the ground"),
    "roots": (3, 5, "root lobes in the flare"),
    "cracks": (5, 8, "deep vertical seams in the dead wood"),
    "crackDepth": (0.14, 0.26, "seam depth, as a fraction of radius"),
    "twist": (0.0, 0.6, "turns of the seams over the trunk's height"),
    "wander": (0.03, 0.08, "sideways wander of the trunk's kinks, in heights"),
    "limbs": (-0.6, 0.6, "added to the form's main limb count (1 at 0, 4 at 1), rounded"),
    "depth": (-0.4, 0.4, "added to the form's fork depth (1 at 0, 3 at 1), rounded"),
    "limbLength": (0.32, 0.46, "main limb length, in heights"),
    "kink": (0.10, 0.28, "radians a limb turns at each of its two kinks"),
    "broken": (0.30, 0.55, "chance that a limb end is snapped (blunt) rather than sharp"),
    "stubs": (-0.6, 0.6, "added to the form's broken stub count (3 at 0, 2 at 1), rounded"),
    "splinters": (2, 4, "splinters on the snapped top"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


def _rot(v, axis, ang):
    """Rodrigues rotation of v about a unit axis."""
    c, s = math.cos(ang), math.sin(ang)
    return T.add(T.add(T.mul(v, c), T.mul(T.cross(axis, v), s)),
                 T.mul(axis, T.dot(axis, v) * (1.0 - c)))


def _perp(d):
    ref = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    return T.norm(T.cross(d, ref))


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole tree as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.06, rng))
    h_t = T.stratify(seed, T.PLASTIC, 0.10, rng)
    angle = _p("angle", T.stratify(seed, T.SQRT3M1, 0.08, rng))
    lean_t = _p("lean", T.stratify(seed, T.PHI_M4, 0.08, rng))
    habit = HABITS[min(2, int(_p("habit", T.stratify(seed, PI_M3, 0.005, rng)) * 3.0))]

    H = T.lerp(2.6, 9.5, form ** 1.05) * _p("height", h_t)
    r0 = T.lerp(0.13, 0.05, form ** 0.8) * H * _p("trunkRadius", rng.next())
    taper = _p("taper", rng.next())
    flare = _p("rootFlare", rng.next())
    n_roots = rng.int(int(PARAMS["roots"][0]), int(PARAMS["roots"][1]))
    n_cracks = rng.int(int(PARAMS["cracks"][0]), int(PARAMS["cracks"][1]))
    crack = _p("crackDepth", rng.next())
    twist = _p("twist", rng.next())
    wander = _p("wander", rng.next()) * H
    phase = rng.range(0.0, 2.0 * math.pi)
    lean_az = rng.range(0.0, 2.0 * math.pi)
    lean = T.lerp(0.0, T.lerp(0.20, 0.09, form), lean_t) * H     # snags lean harder
    n_limbs = int(round(T.lerp(1.0, 4.0, form) + _p("limbs", rng.next())))
    depth = max(1, min(3, int(round(T.lerp(1.0, 3.0, form) + _p("depth", rng.next())))))
    limb_len = _p("limbLength", rng.next()) * H * T.lerp(0.75, 1.0, form)
    kink = _p("kink", rng.next())
    p_broken = _p("broken", rng.next())
    n_stubs = max(1, int(round(T.lerp(3.0, 2.0, form) + _p("stubs", rng.next()))))
    n_spl = rng.int(int(PARAMS["splinters"][0]), int(PARAMS["splinters"][1]))

    # --- trunk: three points on the axis (vertical base), then kinks toward the lean ---
    # a snag's trunk is the whole tree; a skeletal tree's ends where the limbs take over
    full_top = H * T.lerp(0.96, 0.62, form)
    # a split trunk stops at the cleft and its two leaders carry on to the full height
    top = full_top * (T.lerp(0.55, 0.42, form) if habit == "split" else 1.0)
    ld = (math.cos(lean_az), math.sin(lean_az), 0.0)
    pts = [(0.0, 0.0, -0.06), (0.0, 0.0, 0.08 * top), (0.0, 0.0, 0.18 * top)]
    for f in (0.42, 0.70, 1.0):
        w = (rng.range(-1.0, 1.0) * wander, rng.range(-1.0, 1.0) * wander)
        pts.append((ld[0] * lean * f ** 1.5 + w[0] * f, ld[1] * lean * f ** 1.5 + w[1] * f,
                    top * f))
    trunk = {"pts": pts, "r0": r0, "r1": r0 * taper, "flare": flare}
    dense = T.catmull(pts, 6)

    def trunk_at(f):
        """(point, radius, tangent) a fraction f up the trunk."""
        i = min(len(dense) - 2, max(1, int(round(f * (len(dense) - 1)))))
        tan = T.norm(T.sub(dense[i + 1], dense[i - 1]))
        return dense[i], T.lerp(r0, r0 * taper, i / (len(dense) - 1)), tan

    branches = []

    def grow(o, d, length, r, lvl, budget_depth):
        """One limb from `o` along `d`, kinked twice; children fork off it; its end is sharp
        or snapped. Every draw happens whatever the LOD."""
        side = _perp(d)
        a1 = rng.range(-1.0, 1.0) * kink
        a2 = rng.range(-1.0, 1.0) * kink
        rise = rng.range(0.0, 0.6) * kink * (1.0 - angle * 0.6)
        d1 = T.norm(_rot(d, side, -rise))
        d1 = T.norm(_rot(d1, (0.0, 0.0, 1.0), a1))
        d2 = T.norm(_rot(d1, (0.0, 0.0, 1.0), a2))
        d2 = T.norm(_rot(d2, _perp(d2), -rise * 0.5))
        p1 = T.add(o, T.mul(d, length * 0.34))
        p2 = T.add(p1, T.mul(d1, length * 0.33))
        p3 = T.add(p2, T.mul(d2, length * 0.33))
        snapped = rng.chance(p_broken) or lvl == 0 and budget_depth == 0
        r_end = r * (rng.range(0.50, 0.65) if snapped else 0.0)
        br = {"pts": [o, p1, p2, p3], "r0": r, "r1": max(r_end, 0.012), "lvl": lvl,
              "snapped": snapped, "kind": "limb"}
        branches.append(br)
        if budget_depth <= 0 or length < 0.35:
            return
        n_ch = 1 if lvl >= 2 else rng.int(1, 2)
        path = T.catmull(br["pts"], 4)
        for k in range(n_ch):
            f = rng.range(0.40, 0.62) if n_ch == 1 else (0.38 + 0.30 * k + rng.range(-0.05, 0.05))
            i = min(len(path) - 2, int(round(f * (len(path) - 1))))
            q = path[i]
            tan = T.norm(T.sub(path[i + 1], path[i - 1]))
            spin = rng.range(0.0, 2.0 * math.pi)
            off = rng.range(0.45, 0.80)
            ax = _rot(_perp(tan), tan, spin)
            dc = T.norm(_rot(tan, ax, off))
            if dc[2] < -0.2:
                dc = T.norm((dc[0], dc[1], -dc[2] * 0.5))
            rc = T.lerp(r, max(r_end, 0.012), f) * rng.range(0.62, 0.78)
            grow(q, dc, length * rng.range(0.50, 0.68), rc, lvl + 1, budget_depth - 1)

    # --- the crown: main limbs from the top third of the trunk, or a split's two leaders
    top_pt, top_r, top_tan = trunk_at(1.0)
    leaders = []
    if habit == "split":
        o, r, tan = trunk_at(0.96)
        az = rng.range(0.0, 2.0 * math.pi)
        for s in (0, 1):
            a = az + math.pi * s + rng.range(-0.3, 0.3)
            el = math.radians(rng.range(58.0, 72.0))
            ln = (full_top - o[2]) * rng.range(0.85, 1.15) / math.sin(el) + 0.25 * limb_len
            leaders.append((o, T.from_angles(a, el), ln, r * 0.74))
    for o, d, ln, r in leaders:
        grow(o, d, ln, r, 0, max(0, depth - 1))
    if n_limbs > 0 and habit != "split":
        az0 = rng.range(0.0, 2.0 * math.pi)
        for k in range(n_limbs):
            f = T.lerp(0.55, 0.98, (k + rng.range(0.1, 0.9)) / n_limbs) if form > 0.3 \
                else rng.range(0.55, 0.85)
            o, r, tan = trunk_at(f)
            az = az0 + 2.0 * math.pi * k / n_limbs * rng.range(0.85, 1.15) + k * 0.4
            el = math.radians(T.lerp(68.0, 22.0, angle) + rng.range(-10.0, 10.0))
            grow(o, T.from_angles(az, el), limb_len * rng.range(0.75, 1.1),
                 r * rng.range(0.58, 0.72), 0, depth - 1)
    if form > 0.55 and habit != "split":
        # the leader carries on above the limbs and forks too
        grow(top_pt, T.norm(T.add(top_tan, (0.0, 0.0, 0.4))), limb_len * 0.8, top_r * 0.8,
             0, depth - 1)

    # --- broken stubs low on the trunk: short, blunt, slightly drooping or rising ---
    stubs = []
    splinters_low = []
    for k in range(n_stubs):
        f = rng.range(0.22, 0.80)
        o, r, tan = trunk_at(f)
        az = rng.range(0.0, 2.0 * math.pi)
        el = math.radians(rng.range(5.0, 45.0))
        ln = r * rng.range(1.3, 2.6) + 0.12
        d = T.from_angles(az, el)
        d2 = T.from_angles(az + rng.range(-0.3, 0.3), el + rng.range(0.0, 0.25))
        rs = r * rng.range(0.40, 0.58)
        mid = T.add(o, T.mul(d, ln * 0.5))
        end = T.add(mid, T.mul(d2, ln * 0.5))
        stubs.append({"pts": [o, mid, end], "r0": rs, "r1": rs * 0.62, "lvl": 1,
                      "snapped": True, "kind": "stub"})
        # the snap leaves a splinter standing off the stub's end
        sd = T.norm(T.add(d2, (0.0, 0.0, rng.range(0.1, 0.5))))
        sb = T.sub(end, T.mul(d2, rs * 0.5))
        sl = rs * rng.range(1.6, 3.0)
        splinters_low.append({"pts": [sb, T.add(sb, T.mul(sd, sl * 0.5)),
                                      T.add(sb, T.mul(sd, sl))],
                              "r0": rs * 0.42, "r1": 0.012, "lvl": 2, "snapped": False,
                              "kind": "splinter"})

    # --- the snapped top: splinters off the rim, unless the leader carries on ---
    splinters = []
    if not (form > 0.55 and habit != "split"):
        tops = [(top_pt, top_r, top_tan)] if habit != "split" else []
        for p, r, tan in tops:
            for k in range(n_spl):
                a = 2.0 * math.pi * k / n_spl + rng.range(-0.4, 0.4)
                side = _rot(_perp(tan), tan, a)
                base = T.add(T.sub(p, T.mul(tan, r * 0.6)), T.mul(side, r * 0.42))
                # the first is the torn strip of trunk still standing; the rest are short
                ln = r * (rng.range(3.0, 5.0) if k == 0 else rng.range(1.2, 2.8))
                d = T.norm(T.add(tan, T.mul(side, rng.range(0.05, 0.35))))
                tip = T.add(base, T.mul(d, ln))
                splinters.append({"pts": [base, T.add(base, T.mul(d, ln * 0.5)), tip],
                                  "r0": r * (0.55 if k == 0 else rng.range(0.32, 0.46)),
                                  "r1": 0.012, "lvl": 2, "snapped": False,
                                  "kind": "splinter"})
    splinters += splinters_low

    hollow = None
    if habit == "hollow":
        hollow = {"dir": rng.range(0.0, 2.0 * math.pi), "h": rng.range(0.22, 0.30) * top,
                  "spread": rng.range(0.66, 0.80)}

    return {"seed": seed, "form": form, "habit": habit, "height": H, "top": top,
            "trunk": trunk, "taper": taper, "roots": n_roots, "cracks": n_cracks,
            "crack": crack, "twist": twist, "phase": phase, "hollow": hollow,
            "branches": branches, "stubs": stubs, "splinters": splinters, "angle": angle}


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"trunk_per": 4, "trunk_sides": 16, "per_seam": 3, "per": (3, 2, 2, 1), "sides": (7, 6, 5, 4),
        "stub_sides": 6, "spl_sides": 4, "min_r": 0.0},
    1: {"trunk_per": 2, "trunk_sides": 9, "per_seam": 2, "per": (1, 1, 1, 1), "sides": (5, 4, 4, 3),
        "stub_sides": 4, "spl_sides": 3, "min_r": 0.0},
    2: {"trunk_per": 1, "trunk_sides": 5, "per_seam": 1, "per": (0, 0, 0, 0), "sides": (4, 3, 3, 3),
        "stub_sides": 3, "spl_sides": 3, "min_r": 0.035},
}


def _trunk_mesh(mesh, pl, cfg):
    tr = pl["trunk"]
    full = T.catmull(tr["pts"], cfg["trunk_per"])
    nf = len(full)
    radii_f = []
    for i in range(nf):
        u = i / (nf - 1)
        f = max(0.0, 1.0 - u / 0.16)
        radii_f.append(T.lerp(tr["r0"], tr["r1"], u ** 0.9) * (1.0 + (tr["flare"] - 1.0) * f * f))
    # the buried end ring is a plain circle (see `lobes`); keep it inside the flared,
    # seamed ring above it, or it shows as a plate round the foot
    radii_f[0] = tr["r0"] * 0.8
    nr, nc, crack, twist, ph = pl["roots"], pl["cracks"], pl["crack"], pl["twist"], pl["phase"]
    hol = pl["hollow"]
    sides = max(cfg["trunk_sides"], nc * cfg["per_seam"])
    # hollow: the trunk stands on two legs with daylight between them, so it starts higher
    k0 = 0
    if hol is not None:
        k0 = next(i for i, p in enumerate(full) if p[2] >= 0.6 * hol["h"])
    path, radii = full[k0:], radii_f[k0:]
    n = len(path)

    def seams(u, th):
        per = 2.0 * math.pi / nc
        a = (th - ph * 0.7 - twist * 2.0 * math.pi * u) % per
        # V-shaped grooves 0.6 of a half-period wide, so every LOD samples them
        return max(0.0, 1.0 - abs(a - 0.5 * per) / (0.3 * per))

    def lobes(u, th):
        i = min(n - 1, int(round(u * (n - 1))))
        if i == 0 or i == n - 1:
            return 1.0                   # convex end rings: the cap fans stay flat
        ug = (i + k0) / (nf - 1)
        near = max(0.0, 1.0 - ug / 0.22) if hol is None else 0.0
        root = max(0.0, math.cos(nr * (th - ph))) ** 1.5
        return 1.0 + 0.85 * near * near * root - crack * seams(ug, th) * (1.0 - near * 0.7)

    def colour(u, m):
        if m < 0.86:                     # deep in a seam: dark, still brown
            return T.bark_shade(T.lerp(0.36, 1.0, T.clamp01((m - 0.55) / 0.31)))
        # bleaching grows up the trunk; seam lips and root crests catch the light
        ug = (k0 + u * (n - 1)) / (nf - 1)
        return T.weathered(T.clamp01(0.55 * ug + 0.9 * max(0.0, m - 0.97)))

    T.tube(mesh, path, radii, sides, colour, lobe_fn=lobes)

    if hol is not None:
        r0, h = tr["r0"], hol["h"]
        d = (math.cos(hol["dir"]), math.sin(hol["dir"]), 0.0)
        top_c = path[0]
        leg_sides = max(5, sides // 2)
        for sgn in (-1.0, 1.0):
            x0 = T.mul(d, sgn * r0 * hol["spread"])
            # three points on a vertical line, so the foot ring sits level
            ctrl = [(x0[0], x0[1], -0.06), (x0[0], x0[1], 0.12 * h), (x0[0], x0[1], 0.26 * h),
                    T.add(T.mul(x0, 0.45), (0.0, 0.0, 0.55 * h)),
                    T.add(T.mul(x0, 0.10), (top_c[0], top_c[1], 0.95 * h))]
            lp = T.catmull(ctrl, max(1, cfg["trunk_per"] - 1))
            m_ = len(lp)
            lr = []
            for k in range(m_):
                u = k / (m_ - 1)
                f = max(0.0, 1.0 - u / 0.25)
                lr.append(r0 * T.lerp(0.62, 0.58, u) * (1.0 + 0.20 * f * f))
            lr[0] = r0 * 0.45             # the buried circle, inside the D-shaped ring above

            # each leg is half a trunk: D-shaped, round outside, flat toward the slot
            th_out = math.atan2(-sgn * d[0], sgn * d[1])     # tube angle facing outward

            def leg_lobes(u, th, m_=m_, th_out=th_out):
                k = min(m_ - 1, int(round(u * (m_ - 1))))
                if k == 0 or k == m_ - 1:
                    return 1.0
                dl = th - th_out
                half = 1.0 + (0.22 * math.cos(dl) + 0.22 * abs(math.sin(dl))) * (1.0 - u)
                near = max(0.0, 1.0 - u / 0.3)
                root = max(0.0, math.cos(nr * (th - ph))) ** 1.5 * max(0.0, math.cos(dl))
                return half + 0.7 * near * near * root - crack * seams(u * 0.3, th)
            T.tube(mesh, lp, lr, leg_sides,
                   lambda u, m: T.weathered(T.clamp01(0.10 * u + 0.9 * max(0.0, m - 0.97)))
                   if m >= 0.86 else T.bark_shade(0.8), lobe_fn=leg_lobes)


def _limb_mesh(mesh, br, cfg):
    lvl = min(3, br["lvl"])
    per = cfg["per"][lvl]
    if br["kind"] == "stub":
        sides, per = cfg["stub_sides"], max(1, per) if per else 0
    elif br["kind"] == "splinter":
        sides, per = cfg["spl_sides"], 0
    else:
        sides = cfg["sides"][lvl]
    pts = br["pts"]
    path = T.catmull(pts, per) if per else ([pts[0], pts[len(pts) // 2], pts[-1]]
                                             if len(pts) > 3 else list(pts))
    m = len(path)
    r1 = max(br["r1"], cfg["min_r"]) if br["kind"] != "stub" else br["r1"]
    radii = [T.lerp(br["r0"], r1, (k / (m - 1)) ** 0.85) for k in range(m)]
    snapped = br["snapped"]

    def colour(u, mm):
        t = 0.30 + 0.35 * u + (0.35 * u * u if snapped or br["kind"] == "splinter" else 0.0)
        return T.weathered(t)
    T.tube(mesh, path, radii, sides, colour)


def build(seed, lod=0, params=None):
    """Build one dead tree. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()
    _trunk_mesh(mesh, pl, cfg)
    for br in pl["branches"] + pl["stubs"] + pl["splinters"]:
        _limb_mesh(mesh, br, cfg)
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    pts = [p for p in pl["trunk"]["pts"]]
    for br in pl["branches"] + pl["stubs"] + pl["splinters"]:
        pts += T.catmull(br["pts"], 3)
    top = max(p[2] for p in pts)
    reach = max(math.hypot(p[0], p[1]) for p in pts)
    reach = max(reach, pl["trunk"]["r0"] * pl["trunk"]["flare"] * 1.5)
    limbs = pl["branches"]
    first = min((b["pts"][0][2] for b in limbs + pl["stubs"]), default=top)
    tips = len(limbs) + len(pl["stubs"]) + len(pl["splinters"])
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "habit": pl["habit"],
        "height": round(top, 3),
        "width": round(2.0 * reach + 0.4, 3),
        "tips": tips,
        "bole": round(first / top, 4),
        "spread": round(reach / top, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
