"""B1 fan palm — a seeded palm (docs/ASSET_PLAN.md §B1, ROADMAP M5b).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
Bare trunks, ringed with leaf scars, tapering and bowed (a C, or an S that straightens at
the top), rising vertically out of a flare at z = 0. At the top of each a crown boss
carries the fronds. Fronds are thin *solid* sheets, never zero-thickness planes, and each
grows continuously out of the crown:
- fan (palmate): a thick petiole whose tip opens straight into a pleated, drooping fan
  with a torn edge. The fan's root is exactly as wide as the petiole tip, so the blade
  never floats on a bare stalk;
- feather (pinnate): a rachis (a real tapered stem) carrying a V-folded, serrated blade
  from the crown outward.
A deterministic clearance pass lifts any frond whose stem or blade would clip a trunk.

Three axes give a crown its character, each stratified on its own sequence:
- `habit`: a clump of two or three stems, a single clean stem, or a single stem wearing a
  skirt of dead fronds (bark coloured) under its crown;
- `kind`: fan or feather fronds;
- `crownDroop`: an upright shuttlecock ... a drooping mop.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 is a short, stout palm with a dense crown, 1 a tall, slender, bowed palm with a sparser
one. Even the sparsest crown carries nine fronds, so it never reads as broken.

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
NAME = "fanpalm"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
PALETTE = dict(T.PALETTE)
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
METRIC_AXES = ["height", "width", "fronds", "bow", "crownDepth"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 short stout palm, dense crown ... 1 tall slender "
                       "bowed palm, sparser crown"),
    "height": (0.80, 1.22, "multiplier on the form's trunk height (2.8 m at 0, 9 m at 1); "
                           "stratified on the plastic number"),
    "bow": (0.0, 1.0, "stratified on golden**-4: how far the trunk bows, on top of form"),
    "kind": (0.0, 1.0, "stratified on sqrt(3) - 1: below 0.55 fan (palmate) fronds, "
                       "above, feather (pinnate) fronds"),
    "crownDroop": (0.0, 1.0, "stratified on the bronze ratio (sqrt(13) - 3) / 2: 0 an "
                             "upright shuttlecock crown ... 1 a drooping mop"),
    "habit": (0.0, 1.0, "stratified on sqrt(2) - 1: below 0.365 a clump of 2-3 stems, "
                        "below 0.60 a single clean stem, above, a single stem with a "
                        "skirt of dead fronds"),
    "trunkRadius": (0.85, 1.20, "multiplier on the form's base radius / height"),
    "taper": (0.52, 0.76, "trunk radius at the crown / at the base"),
    "rootFlare": (1.18, 1.60, "base radius multiplier where the trunk meets the ground"),
    "sShape": (0.0, 1.0, "0 a C bow ... 1 an S: the bow straightens toward the crown"),
    "bowDir": (-0.5, 0.5, "radians off the +x or -x axis that the main trunk bows toward"),
    "wobble": (-0.05, 0.05, "sideways wander of the trunk, in heights"),
    "ringSpacing": (0.20, 0.42, "metres between leaf-scar rings on the trunk"),
    "ringRelief": (0.05, 0.11, "ring bulge, as a fraction of the trunk radius"),
    "stems": (2, 3, "stems in a clump (habit < 0.365)"),
    "stemHeight": (0.48, 0.80, "a clump's side stem height / the main stem's"),
    "fronds": (-1.5, 1.5, "added to the form's frond count (16 at 0, 10 at 1; fan crowns "
                          "x0.85), rounded, never below 9"),
    "frondLength": (0.88, 1.14, "multiplier on the form's frond length / trunk height"),
    "elevHigh": (-8.0, 8.0, "degrees added to the crown's most upright frond (72 ... 34)"),
    "elevLow": (-10.0, 10.0, "degrees added to its most drooping frond (4 ... -55)"),
    "sag": (0.12, 0.50, "how far a frond's rachis arcs down over its length"),
    "spread": (130.0, 190.0, "degrees; the angle a fan blade opens across"),
    "petiole": (0.36, 0.48, "petiole share of frond length (fan kind)"),
    "pleat": (0.06, 0.12, "pleat depth of a fan blade, as a fraction of its radius"),
    "curl": (0.16, 0.40, "how far a fan blade's edge droops, in blade radii"),
    "tear": (0.22, 0.42, "how much shorter every other fan segment is: a torn edge"),
    "featherWidth": (0.14, 0.24, "feather blade half-width, in frond lengths"),
    "fold": (0.25, 0.65, "V-fold of a feather blade: edge drop per unit half-width"),
    "roll": (18.0, 48.0, "degrees a blade may roll about its stem, either way: fans held "
                         "at mixed angles instead of one stack of umbrellas"),
    "skirt": (8, 12, "dead fronds in a skirt (habit above 0.60), bark coloured"),
    "seedCluster": (0.0, 1.0, "chance of a cluster of seeds under the crown"),
    "tone": (0.90, 1.10, "shifts the foliage ramp position"),
}

GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- stems
def _stem(base, Ht, r0, taper, flare, bow, bow_dir, s_shape, wobble, n_rings):
    """One trunk: closures for its centreline and radius, base at (base, z = 0) with a
    vertical tangent there (every lateral term has zero slope at u = 0)."""
    bdir = (math.cos(bow_dir), math.sin(bow_dir), 0.0)
    perp = (-bdir[1], bdir[0], 0.0)

    def spine(u):
        c = u * u                                  # C
        s = u * u * (3.0 - 2.0 * u)                # S: also level at the crown
        lat = bow * T.lerp(c, s, s_shape)
        w = wobble * u * math.sin(math.pi * u)
        return (base[0] + bdir[0] * lat + perp[0] * w,
                base[1] + bdir[1] * lat + perp[1] * w, Ht * u)

    def radius(u):
        r = T.lerp(r0, r0 * taper, u ** 0.9)
        f = max(0.0, 1.0 - u / 0.10)
        return r * (1.0 + (flare - 1.0) * f * f)

    top = spine(1.0)
    boss_r = max(radius(1.0) * 1.9, 0.16)
    return {"base": base, "Ht": Ht, "r0": r0, "spine": spine, "radius": radius,
            "nRings": n_rings, "bossR": boss_r,
            "boss": (top[0], top[1], top[2] + boss_r * 0.25)}


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole palm as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.07, rng))
    h_t = T.stratify(seed, T.PLASTIC, 0.12, rng)
    bow_t = _p("bow", T.stratify(seed, T.PHI_M4, 0.10, rng))
    kind_t = _p("kind", T.stratify(seed, T.SQRT3M1, 0.06, rng))
    kind = "fan" if kind_t < 0.55 else "feather"
    droop_t = _p("crownDroop", T.stratify(seed, 0.3027756377319946, 0.08, rng))
    habit_t = _p("habit", T.stratify(seed, T.SQRT2M1, 0.03, rng))
    habit = "cluster" if habit_t < 0.365 else ("single" if habit_t < 0.60 else "skirted")

    Ht = T.lerp(2.8, 9.0, form) * _p("height", h_t)            # main trunk to the crown
    r0 = Ht * T.lerp(0.070, 0.028, form) * _p("trunkRadius", rng.next())
    taper = _p("taper", rng.next())
    flare = _p("rootFlare", rng.next())
    s_shape = _p("sShape", rng.next())
    bow_dir = (0.0 if rng.chance(0.5) else math.pi) + _p("bowDir", rng.next())
    wobble = _p("wobble", rng.next()) * Ht
    ring_spacing = _p("ringSpacing", rng.next())
    ring_relief = _p("ringRelief", rng.next())
    bow = Ht * (T.lerp(0.02, 0.15, form) + T.lerp(0.0, 0.16, bow_t))

    stems = [_stem((0.0, 0.0), Ht, r0, taper, flare, bow, bow_dir, s_shape, wobble,
                   max(6, min(22, int(round(Ht / ring_spacing)))))]
    n_extra = rng.int(int(PARAMS["stems"][0]), int(PARAMS["stems"][1])) - 1
    extra_draws = [(rng.range(0.0, 1.0), _p("stemHeight", rng.next()), rng.range(0.6, 0.9),
                    rng.range(0.10, 0.22), rng.range(0.0, 1.0)) for _ in range(2)]
    if habit == "cluster":
        # Side stems share the root flare: their bases sit just off the main base, and they
        # bow away from it, so the clump reads as one plant fanning out of one footing.
        for k in range(n_extra):
            a_t, h_k, r_k, b_k, s_k = extra_draws[k]
            a = bow_dir + math.pi * (0.55 + 0.6 * a_t) * (1.0 if k == 0 else -1.0)
            hk = Ht * h_k
            rk = r0 * r_k
            off = (r0 + rk) * 0.62
            stems.append(_stem((math.cos(a) * off, math.sin(a) * off), hk, rk, taper,
                               flare * 0.9, hk * b_k * 1.6, a, s_k, 0.0,
                               max(5, min(14, int(round(hk / ring_spacing))))))

    n_base = T.lerp(16.0, 10.0, form) * (0.85 if kind == "fan" else 1.0)
    n_fronds = max(9, min(16, int(round(n_base + _p("fronds", rng.next())))))
    L = Ht * T.lerp(0.62, 0.32, form) * _p("frondLength", rng.next())
    L = max(L, 1.4) * (0.95 if kind == "fan" else 1.0)
    e_hi = math.radians(T.lerp(72.0, 34.0, droop_t) + _p("elevHigh", rng.next()))
    e_lo = math.radians(T.lerp(4.0, -55.0, droop_t) + _p("elevLow", rng.next()))
    sag = _p("sag", rng.next()) * T.lerp(0.8, 1.2, form)
    spread = math.radians(_p("spread", rng.next()))
    pf = _p("petiole", rng.next())
    pleat = _p("pleat", rng.next())
    curl = _p("curl", rng.next())
    tear = _p("tear", rng.next())
    fw = _p("featherWidth", rng.next())
    fold = _p("fold", rng.next())
    n_skirt = rng.int(int(PARAMS["skirt"][0]), int(PARAMS["skirt"][1]))
    has_seeds = rng.chance(0.55)
    tone = _p("tone", rng.next())
    az0 = rng.range(0.0, 6.2831853)
    roll_max = math.radians(_p("roll", rng.next()))
    shared = {"kind": kind, "pf": pf, "pleat": pleat, "tear": tear, "fw": fw, "fold": fold}

    fronds = []
    live = 0
    for si, st in enumerate(stems):
        # a clump's side crowns are smaller and carry fewer fronds, never fewer than seven
        n = n_fronds if si == 0 else max(7, int(round(n_fronds * 0.62)))
        ls = L if si == 0 else L * 0.78
        live += n
        for i in range(n):
            az = az0 + si * 1.3 + i * GOLDEN_ANGLE + rng.range(-0.22, 0.22)
            rank = (i + rng.range(0.0, 0.9)) / n
            el = T.lerp(e_hi, e_lo, rank)
            fr = dict(shared, az=az, el=el, L=ls * rng.range(0.82, 1.08),
                      sag=sag * rng.range(0.8, 1.2), spread=spread * rng.range(0.9, 1.06),
                      curl=curl * rng.range(0.8, 1.2), tone=rng.range(0.86, 1.10), dead=False,
                      roll=rng.range(-1.0, 1.0) * roll_max)
            fronds.append(_place(fr, st, stems))
        if habit == "skirted" and si == 0:
            for i in range(n_skirt):
                az = az0 + (i + rng.range(-0.3, 0.3)) * (2.0 * math.pi / n_skirt)
                el = math.radians(rng.range(-84.0, -74.0))
                ln = L * rng.range(0.62, 0.88)
                ln = min(ln, max(0.5, (st["boss"][2] - 0.35 * Ht) * 0.95))
                fr = dict(shared, az=az, el=el, L=ln, sag=0.04, spread=spread * 0.6,
                          curl=curl * 0.4, tone=1.0, dead=True, fw=fw * 0.7, roll=0.0)
                fronds.append(_place(fr, st, stems))
        elif si == 0 and rng.chance(0.5):
            az = az0 + rng.range(0.0, 6.2831853)
            ln = min(L * 0.6, max(0.5, (st["boss"][2] - 0.35 * Ht) * 0.95))
            fr = dict(shared, az=az, el=math.radians(-74.0), L=ln, sag=0.04,
                      spread=spread * 0.6, curl=curl * 0.4, tone=1.0, dead=True, fw=fw * 0.7,
                      roll=0.0)
            fronds.append(_place(fr, st, stems))

    main = stems[0]
    seeds_ = []
    if has_seeds:
        k = rng.int(3, 7)
        az = rng.range(0.0, 6.2831853)
        br = main["bossR"]
        sr = br * rng.range(0.30, 0.42)
        bx, by, bz = main["boss"]
        for j in range(k):
            a = az + rng.range(-0.7, 0.7)
            d = br * rng.range(0.7, 1.05)
            seeds_.append(((bx + math.cos(a) * d, by + math.sin(a) * d,
                            bz - br * rng.range(0.45, 1.0)), sr * rng.range(0.8, 1.15)))

    return {"seed": seed, "form": form, "kind": kind, "habit": habit, "stems": stems,
            "ringRelief": ring_relief, "fronds": fronds, "seeds": seeds_, "tone": tone,
            "bow": bow, "live": live, "crownDroop": droop_t, "trunkHeight": Ht, "r0": r0}


def _frond(fr, st):
    """Fill in a frond's geometry from its stem's boss and its angles."""
    d = T.from_angles(fr["az"], fr["el"])
    side = (-math.sin(fr["az"]), math.cos(fr["az"]), 0.0)
    out = dict(fr)
    out.update({"start": T.add(st["boss"], T.mul(d, st["bossR"] * 0.45)), "d": d,
                "side": side, "thick": max(0.026, 0.016 * fr["L"]),
                "wp": max(0.040, 0.030 * fr["L"])})
    return out


def _place(fr, st, stems):
    """Lift a frond until its stem and blade clear every trunk (deterministic: a fixed
    5-degree step, at most 16 steps)."""
    need = 0.03 if fr["dead"] else 0.10          # a dead skirt hugs the trunk
    for _ in range(16):
        f = _frond(fr, st)
        if _clearance(f, stems) >= need:
            return f
        fr = dict(fr, el=fr["el"] + math.radians(5.0))
    return _frond(fr, st)


def _clearance(fr, stems):
    pts = [_centre(fr, k / 10.0) for k in range(1, 11)]
    grid, _ = _frond_grid(fr, _PROBE)
    for row in grid:
        pts.extend(row)
    worst = 1e9
    for p in pts:
        for st in stems:
            u = p[2] / st["Ht"]
            if u < 0.0 or u > 1.0:
                continue
            c = st["spine"](u)
            worst = min(worst, math.hypot(p[0] - c[0], p[1] - c[1]) - st["radius"](u))
    return worst


# ---------------------------------------------------------------- frond geometry
def _centre(fr, u):
    return T.add(fr["start"], T.add(T.mul(fr["d"], fr["L"] * u),
                                    (0.0, 0.0, -fr["sag"] * fr["L"] * u * u)))


def _tangent(fr, u):
    return T.norm(T.add(T.mul(fr["d"], fr["L"]), (0.0, 0.0, -2.0 * fr["sag"] * fr["L"] * u)))


def _blade_frame(fr, u):
    t = _tangent(fr, u)
    s = fr["side"]
    n = T.norm(T.cross(t, s))                     # the blade's upper side
    if fr["roll"]:
        c, sn = math.cos(fr["roll"]), math.sin(fr["roll"])
        s, n = T.add(T.mul(s, c), T.mul(n, sn)), T.sub(T.mul(n, c), T.mul(s, sn))
    return t, s, n


def _petiole_tip_r(fr):
    return fr["wp"] * 0.7


def _fan_root(fr):
    """Radius fraction at which the fan is exactly as wide as the petiole tip."""
    rb = fr["L"] * (1.0 - fr["pf"])
    return min(0.3, 2.2 * _petiole_tip_r(fr) / (rb * 2.0 * math.sin(fr["spread"] * 0.5)))


def _fan_point(fr, rho, phi, pleat_sign=0.0, torn=0.0):
    """A point on the fan blade: radius fraction rho, angle phi off the petiole's line.
    The fan's origin sits behind the petiole tip so its root row lands on the tip."""
    t, s, n = _blade_frame(fr, fr["pf"])
    rb = fr["L"] * (1.0 - fr["pf"])
    q = T.sub(_centre(fr, fr["pf"]), T.mul(t, _fan_root(fr) * rb))
    r = rb * rho * (1.0 - fr["tear"] * torn)
    p = T.add(q, T.add(T.mul(t, r * math.cos(phi)), T.mul(s, r * math.sin(phi))))
    p = T.add(p, T.mul(n, fr["pleat"] * rb * rho * pleat_sign))
    p = T.add(p, T.mul(n, -fr["curl"] * rb * rho * rho * (0.4 + 0.6 * abs(math.sin(phi)))))
    p = T.add(p, (0.0, 0.0, -fr["sag"] * 0.35 * rb * rho * rho))
    return p, n


def _feather_width(fr, u):
    """Half-width: the blade starts at the crown (no bare stalk) and closes at the tip."""
    b = T.clamp01((u - 0.04) / 0.96)
    return fr["wp"] * 0.9 + fr["fw"] * fr["L"] * math.sin(math.pi * b) ** 0.6


def _frond_grid(fr, cfg):
    """(points, normals) of the frond's sheet at this LOD."""
    pts, nrm = [], []
    if cfg.get("lod2") == "kite":
        # LOD2's cheapest frond: a closed kite from the crown through the blade's two
        # widest points to its tip. 12 triangles, and still a leaf, not a sliver.
        c0 = _centre(fr, 0.0)
        if fr["kind"] == "fan":
            half = fr["spread"] * 0.5 * 0.8
            (lp, n1), (rp, _), (tp, _) = (_fan_point(fr, 0.8, -half), _fan_point(fr, 0.8, half),
                                         _fan_point(fr, 1.0, 0.0))
        else:
            c = _centre(fr, 0.45)
            t, s, n1 = _blade_frame(fr, 0.45)
            w = _feather_width(fr, 0.45)
            drop = T.mul(n1, -fr["fold"] * w * 0.5)
            lp = T.add(T.add(c, T.mul(s, -w)), drop)
            rp = T.add(T.add(c, T.mul(s, w)), drop)
            tp = _centre(fr, 1.0)
        return [[c0, rp], [lp, tp]], [[n1, n1], [n1, n1]]
    if fr["kind"] == "fan":
        if cfg["fan_from_base"]:
            # LOD2: crown -> petiole tip -> fan edge, one strip, two columns
            us = (0.0, fr["pf"])
            for u in us:
                c = _centre(fr, u)
                t, s, n = _blade_frame(fr, u)
                w = fr["wp"] * 1.2
                pts.append([T.add(c, T.mul(s, -w)), T.add(c, T.mul(s, w))])
                nrm.append([n, n])
            half = fr["spread"] * 0.5 * 0.72
            row = [_fan_point(fr, 1.0, phi) for phi in (-half, half)]
            pts.append([p for p, _ in row])
            nrm.append([n for _, n in row])
            return pts, nrm
        nr, na = cfg["fan_rows"], cfg["fan_cols"]
        rho0 = _fan_root(fr)
        for i in range(nr + 1):
            rho = T.lerp(rho0, 1.0, i / nr)
            row, rown = [], []
            for j in range(na + 1):
                phi = fr["spread"] * (j / na - 0.5)
                sign = 0.0 if i == 0 else (1.0 if j % 2 == 0 else -1.0)
                p, n = _fan_point(fr, rho, phi, sign, 1.0 if (i == nr and j % 2) else 0.0)
                row.append(p)
                rown.append(n)
            pts.append(row)
            nrm.append(rown)
        return pts, nrm
    if cfg.get("lod2") == "strip":
        us = [0.0, 0.5, 1.0]
    else:
        m = cfg["feather_rows"]
        us = [k / m for k in range(m + 1)]
    for i, u in enumerate(us):
        c = _centre(fr, u)
        t, s, n = _blade_frame(fr, u)
        w = _feather_width(fr, u)
        if cfg["serrate"] and 0 < i < len(us) - 1 and i % 2 == 1:
            w = max(fr["wp"] * 0.9, w * 0.62)
        drop = T.mul(n, -fr["fold"] * w)
        if cfg["feather_cols"] == 2:
            row = [T.add(T.add(c, T.mul(s, -w)), drop), c, T.add(T.add(c, T.mul(s, w)), drop)]
        else:
            row = [T.add(T.add(c, T.mul(s, -w)), T.mul(drop, 0.5)),
                   T.add(T.add(c, T.mul(s, w)), T.mul(drop, 0.5))]
        pts.append(row)
        nrm.append([n] * len(row))
    return pts, nrm


def _frond_colours(fr, pts, z_lo, z_hi, tone):
    R, C = len(pts), len(pts[0])
    top, bot = [], []
    for i in range(R):
        u = i / max(1, R - 1)
        rt, rb = [], []
        for j in range(C):
            if fr["dead"]:
                rt.append(T.bark(0.55 + 0.35 * u))
                rb.append(T.bark(0.25 + 0.25 * u))
                continue
            zf = T.clamp01((pts[i][j][2] - z_lo) / max(1e-6, z_hi - z_lo))
            t = 0.30 + 0.30 * u + 0.26 * zf
            rt.append(T.foliage(T.clamp01(t * tone * fr["tone"])))
            rb.append(T.foliage(T.clamp01((0.06 + 0.14 * u + 0.08 * zf) * tone)))
        top.append(rt)
        bot.append(rb)
    return top, bot


# ---------------------------------------------------------------- LOD table
# `levels`: overrides of the LOD's settings, finest first. A crown spends the finest
# level that fits its LOD's ceiling; a pure function of the plan, so still deterministic.
_LOD = {
    0: {"trunk_sides": 8, "ringed": True, "boss": (8, 5), "pet_sides": 5, "pet_rings": 4,
        "fan_rows": 4, "fan_from_base": False, "feather_cols": 2, "serrate": True,
        "rachis": (5, 5), "seed_seg": (6, 4), "limit": 5800,
        "levels": tuple({"fan_cols": a, "feather_rows": b, "ring_cap": c}
                        for a, b, c in ((12, 15, 22), (10, 12, 16), (8, 10, 12), (6, 8, 10),
                                        (4, 6, 8)))},
    1: {"trunk_sides": 6, "ringed": False, "trunk_samples": 6, "boss": (6, 4),
        "pet_sides": 4, "pet_rings": 3, "fan_rows": 2, "fan_from_base": False,
        "feather_cols": 2, "serrate": False, "rachis": (3, 3), "seed_seg": (4, 3),
        "limit": 1950,
        "levels": tuple({"fan_cols": a, "feather_rows": b, "ring_cap": 0}
                        for a, b in ((6, 6), (4, 5), (4, 4), (2, 3), (2, 2)))},
    2: {"trunk_sides": 5, "ringed": False, "trunk_samples": 4, "boss": (5, 3),
        "pet_sides": 0, "pet_rings": 0, "fan_rows": 0, "fan_from_base": True,
        "feather_cols": 1, "serrate": False, "rachis": None, "seed_seg": None,
        "limit": 490,
        "levels": ({"lod2": "strip"}, {"lod2": "kite"},
                   {"lod2": "kite", "trunk_samples": 3, "boss": (4, 3)})},
}
#: The coarse grid the clearance pass tests against (LOD-independent).
_PROBE = {"fan_rows": 2, "fan_cols": 4, "fan_from_base": False, "feather_rows": 4,
          "feather_cols": 2, "serrate": False}


def _trunk(mesh, st, cfg, ring_cap, relief):
    spine, radius = st["spine"], st["radius"]
    if cfg["ringed"]:
        nr = min(st["nRings"], ring_cap)
        n = 2 * nr + 1
        us = [k / (n - 1) for k in range(n)]
    else:
        # a short collar sample keeps the base ring level under a bowed trunk
        m = cfg["trunk_samples"]
        us = [0.0, 0.035] + [k / (m - 1) for k in range(1, m)]
        n = len(us)
    path = [spine(u) for u in us]
    path[0] = (path[0][0], path[0][1], -0.06)
    radii, cols = [], []
    for k, u in enumerate(us):
        r = radius(u)
        ridge = 0.0
        if cfg["ringed"] and 0 < k < n - 1 and u > 0.06:
            ridge = 1.0 if k % 2 else -1.0
            r *= 1.0 + relief * ridge
        radii.append(r)
        cols.append(T.bark(0.30 + 0.30 * u + 0.30 * ridge))
    T.tube(mesh, path, radii, cfg["trunk_sides"], lambda u, m: cols[int(round(u * (n - 1)))])

    bx, by, bz = st["boss"]
    br = st["bossR"]

    def boss_place(d):
        p = (bx + d[0] * br, by + d[1] * br, bz + d[2] * br * 1.25)
        return p, (T.bark(0.5) if d[2] < -0.2 else T.foliage(0.12 + 0.18 * (d[2] + 0.2)))
    T.blob(mesh, cfg["boss"][0], cfg["boss"][1], boss_place)


def _kite(mesh, pts, n, thick, top, bot):
    """A closed kite slab, triangulated explicitly along its crown-to-tip ridge so the top
    and bottom skins can never take different diagonals and cross (a non-planar quad
    slab can, and then its volume goes negative)."""
    (c0, rp), (lp, tp) = pts
    ring = [c0, lp, tp, rp]
    cols_t = [top[0][0], top[1][0], top[1][1], top[0][1]]
    cols_b = [bot[0][0], bot[1][0], bot[1][1], bot[0][1]]
    if T.dot(T.cross(T.sub(lp, c0), T.sub(tp, c0)), n) < 0.0:
        ring.reverse()
        cols_t.reverse()
        cols_b.reverse()
    h = T.mul(n, 0.5 * thick)
    A = [mesh.vert(T.add(p, h), c) for p, c in zip(ring, cols_t)]
    B = [mesh.vert(T.sub(p, h), c) for p, c in zip(ring, cols_b)]
    # ridge: ring[0] -> ring[2] (crown to tip when not reversed, still a diagonal if so)
    mesh.face((A[0], A[1], A[2]))
    mesh.face((A[0], A[2], A[3]))
    mesh.face((B[0], B[2], B[1]))
    mesh.face((B[0], B[3], B[2]))
    for k in range(4):
        j = (k + 1) % 4
        mesh.face((A[j], A[k], B[k]))
        mesh.face((A[j], B[k], B[j]))


def _tessellate(pl, cfg):
    mesh = T.Mesh()
    for st in pl["stems"]:
        _trunk(mesh, st, cfg, cfg.get("ring_cap", 0), pl["ringRelief"])

    zs = [_centre(f, 1.0)[2] for f in pl["fronds"]] + \
         [st["boss"][2] + st["bossR"] for st in pl["stems"]]
    z_lo, z_hi = min(zs), max(zs)
    sub = cfg
    for fr in pl["fronds"]:
        stem_col = (lambda u, mm: T.bark(0.6)) if fr["dead"] else \
                   (lambda u, mm: T.foliage(0.20 + 0.18 * u))
        if fr["kind"] == "fan" and cfg["pet_sides"]:
            # the petiole runs from inside the boss to the fan's root row
            m = cfg["pet_rings"]
            ppath = [_centre(fr, fr["pf"] * k / (m - 1)) for k in range(m)]
            pr = [T.lerp(fr["wp"], _petiole_tip_r(fr), k / (m - 1)) for k in range(m)]
            T.tube(mesh, ppath, pr, cfg["pet_sides"], stem_col)
        elif fr["kind"] == "feather" and cfg["rachis"]:
            sides, m = cfg["rachis"]
            ppath = [_centre(fr, 0.62 * k / (m - 1)) for k in range(m)]
            pr = [T.lerp(fr["wp"], fr["wp"] * 0.35, k / (m - 1)) for k in range(m)]
            T.tube(mesh, ppath, pr, sides, stem_col)
        pts, nrm = _frond_grid(fr, sub)
        top, bot = _frond_colours(fr, pts, z_lo, z_hi, pl["tone"])
        if sub.get("lod2") == "kite":
            _kite(mesh, pts, nrm[0][0], fr["thick"], top, bot)
            continue
        thick = [[fr["thick"]] * len(r) for r in pts]
        T.thick_grid(mesh, pts, nrm, thick, top, bot)

    if pl["seeds"]:
        if cfg["seed_seg"]:
            for c, r in pl["seeds"]:
                T.blob(mesh, cfg["seed_seg"][0], cfg["seed_seg"][1],
                       lambda d, c=c, r=r: ((c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r),
                                            T.bark(0.45 + 0.4 * max(0.0, d[2]))))
        else:
            n = len(pl["seeds"])
            cx = sum(c[0] for c, _ in pl["seeds"]) / n
            cy = sum(c[1] for c, _ in pl["seeds"]) / n
            cz = sum(c[2] for c, _ in pl["seeds"]) / n
            rr = max(r for _, r in pl["seeds"]) * 1.6
            T.blob(mesh, 4, 3, lambda d: ((cx + d[0] * rr, cy + d[1] * rr, cz + d[2] * rr),
                                          T.bark(0.5)))
    return mesh


def build(seed, lod=0, params=None):
    """Build one palm. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides plan
    entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    for level in cfg["levels"]:
        mesh = _tessellate(pl, dict(cfg, **level))
        if mesh.tris() <= cfg["limit"]:
            break
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def _extent_points(pl):
    pts = []
    for st in pl["stems"]:
        pts += [st["spine"](1.0), (st["boss"][0], st["boss"][1], st["boss"][2] + st["bossR"])]
    for fr in pl["fronds"]:
        grid, _ = _frond_grid(fr, _PROBE)
        for row in grid:
            pts.extend(row)
        pts += [_centre(fr, k / 8) for k in range(9)]
    return pts


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    pts = _extent_points(pl)
    main = pl["stems"][0]
    top = main["spine"](1.0)
    tips = [_centre(f, 1.0)[2] for f in pl["fronds"]]
    ztop = max(p[2] for p in pts)
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "kind": pl["kind"],
        "habit": pl["habit"], "stems": len(pl["stems"]),
        "height": round(ztop, 3),
        "width": round(2.0 * max(math.hypot(p[0], p[1]) for p in pts), 3),
        "fronds": pl["live"],
        "bow": round(math.hypot(top[0], top[1]) / main["Ht"], 4),
        "crownDepth": round((ztop - min(tips)) / ztop, 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
