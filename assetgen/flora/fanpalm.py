"""B1 fan palm — a seeded palm (docs/ASSET_PLAN.md §B1, ROADMAP M5b).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A bare trunk, ringed with leaf scars, tapering and bowed (a C, or an S that straightens at
the top), rising vertically out of a small flare at z = 0. At its top a crown boss carries
the fronds. Fronds are thin *solid* sheets, never zero-thickness planes:
- fan (palmate): a petiole ending in a pleated, drooping fan with a torn edge;
- feather (pinnate): a long arching rachis with a V-folded, serrated blade.
Some seeds carry dead fronds hanging against the trunk and a cluster of seeds under the
crown, both in the bark colour.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 is a short, stout palm with a dense, round crown, 1 a tall, slender, strongly bowed palm
with a sparse, drooping crown. Height, bow and frond kind are stratified too, on
sequences that keep seeds 3 and 5 apart from each other where the golden one does not.

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
METRIC_AXES = ["height", "width", "fronds", "bow", "slender"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 short stout palm, dense round crown ... 1 tall "
                       "slender bowed palm, sparse drooping crown"),
    "height": (0.80, 1.22, "multiplier on the form's trunk height (2.6 m at 0, 9 m at 1); "
                           "stratified on the plastic number"),
    "bow": (0.0, 1.0, "stratified on golden**-4: how far the trunk bows, on top of form"),
    "kind": (0.0, 1.0, "stratified on sqrt(3) - 1: below 0.6 fan (palmate) fronds, "
                       "above, feather (pinnate) fronds"),
    "trunkRadius": (0.85, 1.20, "multiplier on the form's base radius / height"),
    "taper": (0.48, 0.74, "trunk radius at the crown / at the base"),
    "rootFlare": (1.18, 1.60, "base radius multiplier where the trunk meets the ground"),
    "sShape": (0.0, 1.0, "0 a C bow ... 1 an S: the bow straightens toward the crown"),
    "bowDir": (-0.5, 0.5, "radians off the +x or -x axis that the trunk bows toward"),
    "wobble": (-0.05, 0.05, "sideways wander of the trunk, in heights"),
    "ringSpacing": (0.20, 0.42, "metres between leaf-scar rings on the trunk"),
    "ringRelief": (0.05, 0.11, "ring bulge, as a fraction of the trunk radius"),
    "fronds": (-1.5, 1.5, "added to the form's frond count (17 at 0, 7 at 1), rounded"),
    "frondLength": (0.88, 1.14, "multiplier on the form's frond length / trunk height"),
    "crownDroop": (0.0, 1.0, "stratified on the bronze ratio (sqrt(13) - 3) / 2: 0 an "
                             "upright shuttlecock crown ... 1 a drooping mop"),
    "elevHigh": (-8.0, 8.0, "degrees added to the crown's most upright frond (72 ... 34)"),
    "elevLow": (-10.0, 10.0, "degrees added to its most drooping frond (2 ... -62), "
                             "before form"),
    "sag": (0.12, 0.55, "how far a frond's rachis arcs down over its length"),
    "spread": (92.0, 150.0, "degrees; the angle a fan blade opens across"),
    "petiole": (0.42, 0.58, "petiole share of frond length (fan kind)"),
    "pleat": (0.03, 0.08, "pleat depth of a fan blade, as a fraction of its radius"),
    "curl": (0.16, 0.42, "how far a fan blade's edge droops, in blade radii"),
    "tear": (0.0, 0.22, "how much shorter every other fan segment is: a torn edge"),
    "featherWidth": (0.14, 0.24, "feather blade half-width, in frond lengths"),
    "fold": (0.25, 0.65, "V-fold of a feather blade: edge drop per unit half-width"),
    "deadFronds": (0, 3, "dead fronds hanging against the trunk, bark coloured"),
    "seedCluster": (0.0, 1.0, "chance of a cluster of seeds under the crown"),
    "tone": (0.90, 1.10, "shifts the foliage ramp position"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole palm as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.07, rng))
    h_t = T.stratify(seed, T.PLASTIC, 0.12, rng)
    bow_t = _p("bow", T.stratify(seed, T.PHI_M4, 0.10, rng))
    kind_t = _p("kind", T.stratify(seed, T.SQRT3M1, 0.08, rng))
    kind = "fan" if kind_t < 0.6 else "feather"
    droop_t = _p("crownDroop", T.stratify(seed, 0.3027756377319946, 0.08, rng))

    Ht = T.lerp(2.6, 9.0, form) * _p("height", h_t)            # trunk height to the crown
    r0 = Ht * T.lerp(0.070, 0.026, form) * _p("trunkRadius", rng.next())
    taper = _p("taper", rng.next())
    flare = _p("rootFlare", rng.next())
    s_shape = _p("sShape", rng.next())
    bow_dir = (0.0 if rng.chance(0.5) else math.pi) + _p("bowDir", rng.next())
    wobble = _p("wobble", rng.next()) * Ht
    ring_spacing = _p("ringSpacing", rng.next())
    ring_relief = _p("ringRelief", rng.next())
    bow = Ht * (T.lerp(0.02, 0.15, form) + T.lerp(0.0, 0.16, bow_t))
    n_rings = max(6, min(22, int(round(Ht / ring_spacing))))

    bdir = (math.cos(bow_dir), math.sin(bow_dir), 0.0)
    perp = (-bdir[1], bdir[0], 0.0)

    def spine(u):
        c = u * u                                  # C: zero slope at the base
        s = u * u * (3.0 - 2.0 * u)                # S: zero slope at base and crown
        lat = bow * T.lerp(c, s, s_shape)
        w = wobble * u * math.sin(math.pi * u)     # zero slope at the base too
        return (bdir[0] * lat + perp[0] * w, bdir[1] * lat + perp[1] * w, Ht * u)

    def radius(u):
        r = T.lerp(r0, r0 * taper, u ** 0.9)
        f = max(0.0, 1.0 - u / 0.10)
        return r * (1.0 + (flare - 1.0) * f * f)

    crown = spine(1.0)
    r_top = radius(1.0)
    boss_r = max(r_top * 1.7, 0.14)
    boss = (crown[0], crown[1], crown[2] + boss_r * 0.25)

    n_fronds = T.lerp(17.0, 7.0, form) * (0.72 if kind == "fan" else 1.0)
    n_fronds = max(6, min(18, int(round(n_fronds + _p("fronds", rng.next())))))
    L = Ht * T.lerp(0.62, 0.30, form) * _p("frondLength", rng.next())
    L = max(L, 1.3) * (1.12 if kind == "fan" else 1.0)
    e_hi = math.radians(T.lerp(72.0, 34.0, droop_t) + _p("elevHigh", rng.next()))
    e_lo = math.radians(T.lerp(2.0, -62.0, droop_t) + _p("elevLow", rng.next()) - 10.0 * form)
    sag = _p("sag", rng.next()) * T.lerp(0.8, 1.25, form)
    spread = math.radians(_p("spread", rng.next()))
    pf = _p("petiole", rng.next())
    pleat = _p("pleat", rng.next())
    curl = _p("curl", rng.next())
    tear = _p("tear", rng.next())
    fw = _p("featherWidth", rng.next())
    fold = _p("fold", rng.next())
    n_dead = rng.int(int(PARAMS["deadFronds"][0]), int(PARAMS["deadFronds"][1]))
    has_seeds = rng.chance(0.55)
    tone = _p("tone", rng.next())
    az0 = rng.range(0.0, 6.2831853)

    fronds = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n_fronds):
        az = az0 + i * golden_angle + rng.range(-0.22, 0.22)
        # elevation by rank: fronds spiral from upright at the heart to drooping outside
        rank = (i + rng.range(0.0, 0.9)) / n_fronds
        el = T.lerp(e_hi, e_lo, rank)
        fronds.append(_frond(boss, boss_r, az, el, L * rng.range(0.80, 1.08),
                             sag * rng.range(0.8, 1.2), kind, pf, spread * rng.range(0.9, 1.06),
                             pleat, curl * rng.range(0.8, 1.2), tear, fw, fold,
                             rng.range(0.86, 1.10), False))
    for i in range(n_dead):
        az = az0 + rng.range(0.0, 6.2831853)
        el = math.radians(rng.range(-84.0, -66.0))
        ln = L * rng.range(0.50, 0.75)
        ln = min(ln, max(0.4, (boss[2] - 0.25 * Ht) * 0.95))   # never reaches the ground
        fronds.append(_frond(boss, boss_r * 0.9, az, el, ln, 0.05, kind, pf,
                             spread * 0.55, pleat, curl * 0.4, tear, fw * 0.7, fold, 1.0, True))

    seeds_ = []
    if has_seeds:
        k = rng.int(3, 7)
        az = rng.range(0.0, 6.2831853)
        sr = boss_r * rng.range(0.30, 0.42)
        for j in range(k):
            a = az + rng.range(-0.7, 0.7)
            d = boss_r * rng.range(0.7, 1.15)
            seeds_.append(((boss[0] + math.cos(a) * d, boss[1] + math.sin(a) * d,
                            boss[2] - boss_r * rng.range(0.55, 1.2)), sr * rng.range(0.8, 1.15)))

    return {"seed": seed, "form": form, "kind": kind, "trunkHeight": Ht, "spine": spine,
            "radius": radius, "r0": r0, "nRings": n_rings, "ringRelief": ring_relief,
            "boss": boss, "bossR": boss_r, "fronds": fronds, "seeds": seeds_, "tone": tone,
            "bow": bow, "live": n_fronds, "crownDroop": droop_t}


def _frond(base, boss_r, az, el, L, sag, kind, pf, spread, pleat, curl, tear, fw, fold,
           tone, dead):
    d = T.from_angles(az, el)
    side = (-math.sin(az), math.cos(az), 0.0)
    start = T.add(base, T.mul(d, boss_r * 0.55))
    return {"start": start, "d": d, "side": side, "L": L, "sag": sag, "kind": kind,
            "pf": pf, "spread": spread, "pleat": pleat, "curl": curl, "tear": tear,
            "fw": fw, "fold": fold, "tone": tone, "dead": dead,
            "thick": max(0.022, 0.016 * L), "wp": max(0.025, 0.018 * L)}


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
    return t, s, n


def _fan_point(fr, rho, phi, pleat_sign=0.0, torn=0.0):
    """A point on the fan blade: radius fraction rho, angle phi off the petiole's line.
    `pleat_sign` +-1 puts it on a ridge or in a valley; `torn` 1 shortens a segment."""
    q = _centre(fr, fr["pf"])
    t, s, n = _blade_frame(fr, fr["pf"])
    rb = fr["L"] * (1.0 - fr["pf"])
    r = rb * rho * (1.0 - fr["tear"] * torn)
    p = T.add(q, T.add(T.mul(t, r * math.cos(phi)), T.mul(s, r * math.sin(phi))))
    # pleats: alternate ridges and valleys; curl: the edge drops away from the centre
    p = T.add(p, T.mul(n, fr["pleat"] * rb * rho * pleat_sign))
    p = T.add(p, T.mul(n, -fr["curl"] * rb * rho * rho * (0.4 + 0.6 * abs(math.sin(phi)))))
    p = T.add(p, (0.0, 0.0, -fr["sag"] * 0.35 * rb * rho * rho))
    return p, n


def _feather_width(fr, u):
    b = T.clamp01((u - 0.18) / 0.82)
    return fr["wp"] + fr["fw"] * fr["L"] * math.sin(math.pi * b) ** 0.6 if b > 0.0 else fr["wp"]


def _frond_grid(fr, cfg):
    """(points, normals) of the frond's sheet at this LOD."""
    pts, nrm = [], []
    if fr["kind"] == "fan" and cfg["fan_rows"]:
        nr, na = cfg["fan_rows"], cfg["fan_cols"]
        if cfg["fan_from_base"]:
            # LOD2: one sheet from the crown out, no separate petiole
            for u in (0.0, fr["pf"]):
                c = _centre(fr, u)
                t, s, n = _blade_frame(fr, u)
                pts.append([T.add(c, T.mul(s, -fr["wp"] * 1.6)), T.add(c, T.mul(s, fr["wp"] * 1.6))])
                nrm.append([n, n])
            half = fr["spread"] * 0.5 * 0.72
            row, rown = [], []
            for phi in (-half, half):
                p, n = _fan_point(fr, 1.0, phi)
                row.append(p)
                rown.append(n)
            pts.append(row)
            nrm.append(rown)
            return pts, nrm
        for i in range(nr + 1):
            rho = T.lerp(0.07, 1.0, i / nr)
            row, rown = [], []
            for j in range(na + 1):
                phi = fr["spread"] * (j / na - 0.5)
                sign = 1.0 if j % 2 == 0 else -1.0
                p, n = _fan_point(fr, rho, phi, sign, 1.0 if (i == nr and j % 2) else 0.0)
                row.append(p)
                rown.append(n)
            pts.append(row)
            nrm.append(rown)
        return pts, nrm
    # feather (or a fan frond at a LOD with no fan rows): rows along the rachis
    us = cfg["feather_us"]
    serr = cfg["serrate"]
    for i, u in enumerate(us):
        c = _centre(fr, u)
        t, s, n = _blade_frame(fr, u)
        w = _feather_width(fr, u)
        if serr and 0 < i < len(us) - 1 and i % 2 == 1 and u > 0.2:
            w *= 0.62
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
_LOD = {
    0: {"trunk_sides": 8, "ringed": True, "trunk_samples": None, "boss": (8, 5),
        "pet_sides": 4, "pet_rings": 4, "fan_rows": 4, "fan_cols": (12, 10, 8, 6),
        "fan_from_base": False, "feather_us": 15, "feather_cols": 2, "serrate": True,
        "seed_seg": (6, 4), "limit": 5800},
    1: {"trunk_sides": 6, "ringed": False, "trunk_samples": 6, "boss": (6, 4),
        "pet_sides": 3, "pet_rings": 3, "fan_rows": 2, "fan_cols": (6, 4),
        "fan_from_base": False, "feather_us": 6, "feather_cols": 2, "serrate": False,
        "seed_seg": (4, 3), "limit": 1950},
    2: {"trunk_sides": 5, "ringed": False, "trunk_samples": 4, "boss": (5, 3),
        "pet_sides": 0, "pet_rings": 0, "fan_rows": 1, "fan_cols": (1,),
        "fan_from_base": True, "feather_us": 2, "feather_cols": 1, "serrate": False,
        "seed_seg": None, "limit": 490},
}


def _tessellate(pl, cfg, fan_cols):
    mesh = T.Mesh()
    spine, radius = pl["spine"], pl["radius"]
    Ht = pl["trunkHeight"]

    # --- trunk: leaf-scar rings at LOD0 (alternating bulge and pinch), plain above ---
    if cfg["ringed"]:
        n = 2 * pl["nRings"] + 1
        us = [k / (n - 1) for k in range(n)]
    else:
        # a short collar sample keeps the base ring level under a bowed trunk
        m = cfg["trunk_samples"]
        us = [0.0, 0.035] + [k / (m - 1) for k in range(1, m)]
        n = len(us)
    path = [spine(u) for u in us]
    path[0] = (path[0][0], path[0][1], -0.06)
    rel = pl["ringRelief"]
    radii, cols = [], []
    for k, u in enumerate(us):
        r = radius(u)
        ridge = 0.0
        if cfg["ringed"] and 0 < k < n - 1 and u > 0.06:
            ridge = 1.0 if k % 2 else -1.0
            r *= 1.0 + rel * ridge
        radii.append(r)
        cols.append(T.bark(0.30 + 0.30 * u + 0.30 * ridge))
    T.tube(mesh, path, radii, cfg["trunk_sides"], lambda u, m: cols[int(round(u * (n - 1)))])


    # --- crown boss: leaf bases, bark below and dark foliage above ---
    bx, by, bz = pl["boss"]
    br = pl["bossR"]

    def boss_place(d):
        p = (bx + d[0] * br, by + d[1] * br, bz + d[2] * br * 1.25)
        return p, (T.bark(0.5) if d[2] < -0.2 else T.foliage(0.12 + 0.18 * (d[2] + 0.2)))
    T.blob(mesh, cfg["boss"][0], cfg["boss"][1], boss_place)

    # --- fronds ---
    zs = [_centre(f, 1.0)[2] for f in pl["fronds"]] + [bz + br]
    z_lo, z_hi = min(zs), max(zs)
    sub = dict(cfg)
    sub["fan_cols"] = fan_cols
    if isinstance(cfg["feather_us"], int):
        m = cfg["feather_us"]
        sub["feather_us"] = [k / m for k in range(m + 1)]
    for fr in pl["fronds"]:
        if fr["kind"] == "fan" and cfg["pet_sides"]:
            m = cfg["pet_rings"]
            ppath = [_centre(fr, fr["pf"] * k / (m - 1)) for k in range(m)]
            pr = [fr["wp"] * T.lerp(1.3, 0.8, k / (m - 1)) for k in range(m)]
            colp = (lambda u, mm: T.bark(0.6)) if fr["dead"] else \
                   (lambda u, mm: T.foliage(0.22 + 0.15 * u))
            T.tube(mesh, ppath, pr, cfg["pet_sides"], colp)
        pts, nrm = _frond_grid(fr, sub)
        top, bot = _frond_colours(fr, pts, z_lo, z_hi, pl["tone"])
        thick = [[fr["thick"]] * len(r) for r in pts]
        T.thick_grid(mesh, pts, nrm, thick, top, bot)

    # --- seed cluster ---
    if pl["seeds"]:
        if cfg["seed_seg"]:
            for c, r in pl["seeds"]:
                T.blob(mesh, cfg["seed_seg"][0], cfg["seed_seg"][1],
                       lambda d, c=c, r=r: ((c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r),
                                            T.bark(0.45 + 0.4 * max(0.0, d[2]))))
        else:
            cx = sum(c[0] for c, _ in pl["seeds"]) / len(pl["seeds"])
            cy = sum(c[1] for c, _ in pl["seeds"]) / len(pl["seeds"])
            cz = sum(c[2] for c, _ in pl["seeds"]) / len(pl["seeds"])
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
    # A dense crown spends fewer fan segments per frond: the finest that fits the LOD's
    # ceiling. A pure function of the plan, so still deterministic.
    for fan_cols in cfg["fan_cols"]:
        mesh = _tessellate(pl, cfg, fan_cols)
        if mesh.tris() <= cfg["limit"]:
            break
    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def _extent_points(pl):
    pts = [pl["spine"](1.0), (pl["boss"][0], pl["boss"][1], pl["boss"][2] + pl["bossR"] * 1.25)]
    for fr in pl["fronds"]:
        for k in range(9):
            pts.append(_centre(fr, k / 8))
        if fr["kind"] == "fan":
            for j in range(9):
                pts.append(_fan_point(fr, 1.0, fr["spread"] * (j / 8 - 0.5))[0])
    return pts


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    pts = _extent_points(pl)
    top = pl["spine"](1.0)
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "kind": pl["kind"],
        "height": round(max(p[2] for p in pts), 3),
        "width": round(2.0 * max(math.hypot(p[0], p[1]) for p in pts), 3),
        "fronds": pl["live"],
        "bow": round(math.hypot(top[0], top[1]) / pl["trunkHeight"], 4),
        "slender": round(pl["trunkHeight"] / pl["r0"], 2),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
