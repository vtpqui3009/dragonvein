"""B1 ancient giant — a seeded massive old tree (docs/ASSET_PLAN.md §B1, ROADMAP M5c).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
The tree the grove grew around. A short, enormous trunk rises from z = 0 on a skirt of
buttresses: plank-like ridges that flare at the ground and die away up the bole into
fluting, slightly twisted with the grain. Each big buttress runs on into a surface root
that snakes out over the ground and sinks just under it (never more than 0.07 m), so the
root plate is part of the silhouette. A few huge limbs leave the trunk at the fork, with
elbows, not as straight poles; upper-layer branches fork off them. The crown is layered:
two or three tiers of lobed foliage clusters, each upper tier set in the gaps of the one
below, so daylight shows between them. Some seeds carry a hollow scar in the trunk (a
dark, recessed patch), some a broken dead limb stub in weathered grey wood.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 a squat, spreading, oak-like giant about 10 m tall and 17 m across, with a low fork and
near-horizontal limbs; 1 a tall columnar giant about 17 m tall and 10 m across, its crown
high on a long clear bole. Height, crown spread, girth and root reach ride on their own
stratified sequences (plastic, golden**-4, sqrt(3) - 1, the bronze ratio), so neighbouring
seeds differ in more than one way.

Three habits ride on their own sequence (pi - 3), so any eight consecutive seeds hold each
at least twice, and two seeds of one habit are never close in form:
- dome: the tiers overlap into one crown, capped over the trunk;
- tiered: flat layers with daylight between them, each on its own limbs off the leader;
- lopsided: the crown slid toward a strong lean, thinner on the far side.
The crown's taper (top tier over bottom tier, sqrt(7) - 2) runs from a pointed, conical
crown to a flat-topped column.

The trunk's bottom and top rings are plain circles: a cap is a triangle fan, and a fan
over a star-shaped (buttressed) ring folds over itself.

Construction order: `plan(seed)` draws everything; `build(seed, lod)` only tessellates,
so LOD2 of a seed is the same tree as LOD0, sampled coarsely.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402  (path must be set first)
from flora import treekit as T  # noqa: E402

# ---------------------------------------------------------------- identity
FAMILY = "flora"
NAME = "ancientgiant"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
PALETTE = dict(T.PALETTE)
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
#: `rootSpan` is how far the surface roots reach over the crown's half-width; `daylight` the
#: open sky between crown tiers over the height (0 for a closed crown); `layers` the number
#: of crown tiers. `bole` (clear trunk / height) and `girth` (base diameter, buttresses
#: included / height) are reported, not compared: they track `form`, which height and
#: width already carry.
METRIC_AXES = ["height", "width", "rootSpan", "daylight", "layers"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

BRONZE = 0.3027756377319946        # (sqrt(13) - 3) / 2, windtwisted's fifth sequence
#: The habit's sequence. pi - 3 puts seeds 1..8 in three habits so that no two seeds of a
#: habit sit closer than 0.23 on the golden form axis (searched over 15 constants).
PI_M3 = 0.14159265358979312
#: The crown taper's sequence: sqrt(7) - 2 puts seeds a gap of 7 apart (1 and 8) at
#: opposite ends of the axis.
SQRT7M2 = 0.6457513110645906
HABITS = ("dome", "tiered", "lopsided")

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 squat spreading oak-like giant (~10 m tall, ~17 m "
                       "across, low fork) ... 1 tall columnar giant (~17 m tall, ~10 m "
                       "across, high crown on a long bole)"),
    "height": (0.92, 1.08, "multiplier on the form's height (10.4 m at 0, 16.8 m at 1); "
                           "stratified on the plastic number"),
    "spread": (0.82, 1.18, "multiplier on the form's crown half-width (0.80 H at 0, 0.30 H "
                           "at 1); stratified on golden**-4"),
    "girth": (0.84, 1.20, "multiplier on the form's trunk base radius (0.105 H at 0, 0.072 H "
                          "at 1); stratified on sqrt(3) - 1"),
    "rootReach": (0.0, 1.0, "stratified on the bronze ratio: surface roots reach 1.9 ... 3.8 "
                            "trunk radii from the axis"),
    "habit": (0.0, 1.0, "stratified on pi - 3, in thirds: dome (tiers stacked into one "
                        "crown with a cap over the trunk), tiered (flat layers with daylight "
                        "between, each on its own limbs off the leader), lopsided (the crown "
                        "slid toward a strong lean, its far side thinned)"),
    "crownTaper": (0.40, 1.0, "stratified on sqrt(7) - 2: the top tier's half-width over the "
                              "bottom tier's. 0.4 a pointed, conical crown ... 1 a flat-topped, "
                              "even column"),
    "bole": (-0.04, 0.04, "added to the form's clear-bole fraction (0.30 at 0, 0.50 at 1)"),
    "layers": (-0.45, 0.45, "added to the form's crown tier count (1.7 at 0, 3.3 at 1), "
                            "rounded to 2 or 3"),
    "buttresses": (5, 7, "buttress ridges round the base; the roots continue the big ones"),
    "buttress": (0.55, 1.00, "buttress flare at the ground, in trunk radii"),
    "buttressHeight": (2.0, 3.4, "how high the buttresses climb, in trunk radii"),
    "flute": (0.06, 0.11, "fluting depth up the bole, as a fraction of radius"),
    "twist": (0.0, 0.45, "turns of the fluting over the trunk's length"),
    "lean": (0.0, 0.05, "how far the trunk top sits off the base axis, in heights"),
    "elbow": (0.04, 0.14, "how far a limb's middle bows off its chord, in limb lengths"),
    "limbRadius": (0.46, 0.60, "a limb's base radius / the trunk's radius where it leaves"),
    "squash": (0.52, 0.80, "foliage cluster height / width, before the form's bias"),
    "subLobes": (1, 3, "extra lobes round each cluster's main lobe"),
    "scar": (0.0, 1.0, "chance 0.5 of a hollow scar: a dark recessed patch low on the trunk"),
    "scarDepth": (0.30, 0.42, "how far the scar sinks in, as a fraction of radius"),
    "stub": (0.0, 1.0, "chance 0.5 of a broken dead limb stub in weathered wood"),
    "tone": (0.80, 1.00, "shifts the foliage ramp position: an old crown is denser and "
                         "darker than broadleaf's (0.90 .. 1.10)"),
}


def _p(name, t):
    return T.param(PARAMS, name, t)


def _dir(theta):
    """World direction of tube angle `theta` on a vertical tube (treekit.frames: u = +y,
    v = -x), so roots leave exactly where the buttress ridges are."""
    return (-math.sin(theta), math.cos(theta), 0.0)


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole tree as data. Every random number is drawn here, in this order."""
    seed = int(seed)
    rng = Rng(seed)
    form = _p("form", T.stratify(seed, T.GOLDEN, 0.06, rng))
    h_t = T.stratify(seed, T.PLASTIC, 0.10, rng)
    spread_t = T.stratify(seed, T.PHI_M4, 0.10, rng)
    girth_t = T.stratify(seed, T.SQRT3M1, 0.10, rng)
    root_t = _p("rootReach", T.stratify(seed, BRONZE, 0.10, rng))
    habit = HABITS[min(2, int(_p("habit", T.stratify(seed, PI_M3, 0.005, rng)) * 3.0))]
    taper_top = _p("crownTaper", T.stratify(seed, SQRT7M2, 0.06, rng))

    H = T.lerp(10.4, 16.8, form) * _p("height", h_t)
    Rc = T.lerp(0.80, 0.30, form ** 0.85) * H * _p("spread", spread_t)
    r0 = T.lerp(0.105, 0.072, form) * H * _p("girth", girth_t)
    bole = T.lerp(0.30, 0.50, form) + _p("bole", rng.next())
    n_layers = 2 if T.lerp(1.7, 3.3, form) + _p("layers", rng.next()) < 2.5 else 3
    n_but = rng.int(int(PARAMS["buttresses"][0]), int(PARAMS["buttresses"][1]))
    but_amp = _p("buttress", rng.next())
    but_amps = [but_amp * rng.range(0.55, 1.15) for _ in range(n_but)]
    but_h = _p("buttressHeight", rng.next()) * r0
    flute = _p("flute", rng.next())
    twist = _p("twist", rng.next())
    lean = _p("lean", rng.next()) * H * (1.8 if habit == "lopsided" else 1.0)
    lean_az = rng.range(0.0, 2.0 * math.pi)
    elbow = _p("elbow", rng.next())
    limb_k = _p("limbRadius", rng.next())
    squash = _p("squash", rng.next()) * T.lerp(0.74, 1.04, form)
    tone = _p("tone", rng.next())
    has_scar = rng.chance(0.5)
    scar = {"theta": rng.range(0.0, 2.0 * math.pi), "z": rng.range(1.1, 1.8) * r0,
            "h": rng.range(1.6, 2.6) * r0, "w": rng.range(0.60, 0.90),
            "depth": _p("scarDepth", rng.next())}
    has_stub = rng.chance(0.5)
    stub_draw = [rng.next() for _ in range(5)]
    phase = rng.range(0.0, 2.0 * math.pi)

    zb = bole * H                      # where the form wants the crown's underside
    lx, ly = math.cos(lean_az) * lean, math.sin(lean_az) * lean

    # --- the crown: tiers of clusters, each upper tier set in the gaps of the one below
    clusters = []
    tiers = []
    for i in range(n_layers):
        v = i / (n_layers - 1)
        E = Rc * T.lerp(1.0, taper_top, v)                         # tier half-width
        R = E * T.lerp(0.42, 0.38, form) * T.lerp(1.0, 1.10, v)    # main lobe radius
        rho = max(0.0, E - 1.25 * R)
        sq = squash * rng.range(0.92, 1.08)
        droop = rng.range(0.05, 0.13) * (0.55 if habit == "tiered" else 1.0)
        if habit == "tiered":
            sq *= 0.78
        if rho < 0.6 * R:
            k = 1
            rho = 0.0
        else:
            # clusters two main radii apart round the ring: daylight between them
            k = max(2, min(6, int(round(2.0 * math.pi * rho / (2.2 * R)))))
        tiers.append({"E": E, "R": R, "rho": rho, "k": k, "sq": sq, "droop": droop})
    cap = tiers[-1]["k"] > 1          # a ring on top gets a dome over the trunk
    # Stack the tiers so each overlaps the one below, then stretch or squash the stack
    # (0.75x .. 1.35x) toward the crown depth the form asks for. The crown fills H; the
    # clear bole is what is left under it.
    offs = [0.0]
    for i in range(1, n_layers):
        lo, hi = tiers[i - 1], tiers[i]
        gap = 1.30 if habit == "tiered" else 0.78       # tiered: daylight between tiers
        offs.append(offs[-1] + gap * (lo["R"] * lo["sq"] + hi["R"] * hi["sq"]))
    top = offs[-1] + tiers[-1]["R"] * tiers[-1]["sq"] * (1.2 if cap else 1.0)
    bottom = tiers[0]["R"] * (tiers[0]["sq"] + tiers[0]["droop"])
    f = min(1.35, max(0.75, (H - zb) / (top + bottom)))
    for tr in tiers:
        tr["sq"] *= f
        tr["droop"] *= f
    offs = [o * f for o in offs]
    zb = H - (top + bottom) * f
    z0 = zb + bottom * f
    az0 = rng.range(0.0, 2.0 * math.pi)

    def lean_at(z):
        w = T.smoothstep(z / H) if z > 0.0 else 0.0
        return (lx * w, ly * w)

    side = (math.cos(lean_az), math.sin(lean_az))
    for i, tr in enumerate(tiers):
        v = i / (n_layers - 1)
        zc = z0 + offs[i]
        # lopsided: the whole crown slides toward the lean, and the far side thins
        shift = Rc * 0.30 * (1.0 - 0.4 * v) if habit == "lopsided" else 0.0
        step = 2.0 * math.pi / tr["k"]
        off = az0 + (0.5 * step if i % 2 else 0.0)
        for j in range(tr["k"] + (1 if cap and i == n_layers - 1 else 0)):
            centre = j == tr["k"]               # the dome over the top ring
            az = off + j * step + rng.range(-0.22, 0.22) * step
            rr = 0.0 if centre else tr["rho"] * rng.range(0.86, 1.10)
            ox, oy = lean_at(zc)
            ox, oy = ox + side[0] * shift, oy + side[1] * shift
            c = (ox + math.cos(az) * rr, oy + math.sin(az) * rr,
                 zc + rng.range(-0.10, 0.10) * tr["R"] * tr["sq"])
            R = tr["R"] * rng.range(0.88, 1.10)
            if shift > 0.0 and not centre:
                R *= 0.86 + 0.14 * math.cos(az - lean_az)    # thinner on the far side
            if centre:
                c = (lx + side[0] * shift, ly + side[1] * shift, zc + 0.35 * tr["R"] * tr["sq"])
                R *= 0.9 if habit != "tiered" else 0.7
            lobes = [_lobe(rng, c, R, tr["sq"], tr["droop"], tone)]
            n_sub = rng.int(int(PARAMS["subLobes"][0]), int(PARAMS["subLobes"][1]))
            out_az = math.atan2(c[1] - oy, c[0] - ox) if rr > 0.0 else rng.range(0.0, 6.28)
            for s in range(n_sub):
                # subs sit outward and up from the main lobe, not round it, so the
                # gaps between clusters stay open
                a = out_az + (s - (n_sub - 1) * 0.5) * rng.range(0.7, 1.1) \
                    + rng.range(-0.25, 0.25)
                d = R * rng.range(0.60, 0.76)
                sc = rng.range(0.56, 0.74)
                cs = (c[0] + math.cos(a) * d, c[1] + math.sin(a) * d,
                      c[2] + R * tr["sq"] * rng.range(-0.25, 0.30))
                lobes.append(_lobe(rng, cs, R * sc, tr["sq"] * rng.range(0.95, 1.15),
                                   tr["droop"], tone))
            clusters.append({"tier": i, "c": c, "R": R, "az": out_az, "rho": rr,
                             "axis": rr == 0.0, "lobes": lobes, "sq": tr["sq"]})

    # --- trunk axis: vertical at the base, leaning a little above the buttresses; it ends
    #     inside the highest cluster on the axis ---
    top_cl = max((c for c in clusters if c["axis"]), key=lambda c: c["c"][2])
    z_top = top_cl["c"][2]
    lx, ly = top_cl["c"][0], top_cl["c"][1]       # lopsided: the trunk leans into its crown
    z_fork = zb * T.lerp(0.55, 0.70, form)

    def trunk_r(z):
        """Trunk radius at height z, before buttresses and fluting."""
        if z <= z_fork:
            return r0 * T.lerp(1.0, 0.70, z / z_fork)
        u = (z - z_fork) / max(1e-6, z_top - z_fork)
        return r0 * T.lerp(0.70, 0.26, u ** 0.8)

    def axis_at(z):
        return _axis(lx, ly, z_fork, z_top, z)

    # --- limbs (tier 0 clusters, and every off-axis cluster of a two-cluster tier) and
    #     their forks (upper tiers) ---
    limbs = []
    base = [c for c in clusters if c["tier"] == 0 and not c["axis"]]
    for cl in base:
        tip = (cl["c"][0], cl["c"][1], cl["c"][2] - 0.30 * cl["R"] * cl["sq"])
        za = min(z_fork * rng.range(0.84, 1.10), tip[2] - 0.25 * cl["rho"])
        za = max(za, 0.55 * z_fork)
        a = axis_at(za)
        limbs.append(_branch(rng, a, tip, trunk_r(za) * limb_k, elbow, cl))
    for cl in clusters:
        if cl["tier"] == 0 or cl["axis"]:
            continue
        tip = (cl["c"][0], cl["c"][1], cl["c"][2] - 0.30 * cl["R"] * cl["sq"])
        # Each upper-tier cluster hangs off the leader on its own limb. A fork off a lower
        # limb would climb outside the lower tier and poke out of the crown.
        za = max(z_fork, tip[2] - 0.45 * cl["rho"])
        o = axis_at(za)
        r = trunk_r(za) * limb_k * 0.85
        limbs.append(_branch(rng, o, tip, r, elbow * 0.8, cl))

    # --- surface roots on the bigger buttresses ---
    reach = T.lerp(1.9, 3.8, root_t)
    roots = []
    order = sorted(range(n_but), key=lambda k: -but_amps[k])
    n_roots = max(3, n_but - 1)
    for k in sorted(order[:n_roots]):
        th = 2.0 * math.pi * k / n_but
        L = r0 * reach * rng.range(0.70, 1.15) * (0.75 + 0.35 * but_amps[k] / but_amp)
        rr0 = r0 * T.lerp(0.48, 0.64, but_amps[k] / (but_amp * 1.15))
        roots.append({"theta": th, "len": L, "r0": rr0,
                      "wig": rng.range(-0.18, 0.18), "wig2": rng.range(-0.10, 0.10),
                      "z0": rng.range(0.55, 0.85) * min(but_h, 1.6 * r0)})

    stub = None
    if has_stub:
        za = T.lerp(0.35, 0.80, stub_draw[0]) * z_fork
        az = stub_draw[1] * 2.0 * math.pi
        el = math.radians(T.lerp(5.0, 40.0, stub_draw[2]))
        ln = T.lerp(0.9, 1.7, stub_draw[3]) * r0 + 0.6
        o = axis_at(za)
        rs = trunk_r(za) * T.lerp(0.26, 0.36, stub_draw[4])
        d = T.from_angles(az, el)
        stub = {"pts": [o, T.add(o, T.mul(d, ln * 0.6)),
                        T.add(o, T.mul(T.from_angles(az + 0.15, el + 0.12), ln))],
                "r0": rs, "r1": rs * 0.72}

    lobes = [lb for c in clusters for lb in c["lobes"]]
    ztop = max(lb["c"][2] + lb["r"] * lb["squash"] for lb in lobes)
    zbot = min(T.cloud_bottom(lb) for lb in lobes)
    return {"seed": seed, "form": form, "height": H, "Rc": Rc, "r0": r0, "bole": bole,
            "nBut": n_but, "butAmps": but_amps, "butH": but_h, "flute": flute,
            "twist": twist, "phase": phase, "scar": scar if has_scar else None,
            "lean": (lx, ly), "zFork": z_fork, "zTop": z_top, "trunkR": trunk_r,
            "clusters": clusters, "limbs": limbs, "roots": roots, "stub": stub,
            "tone": tone, "canopyZ": (zbot, ztop), "layers": n_layers, "habit": habit}


def _lobe(rng, c, r, sq, droop, tone):
    bumps = [(T.norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.4, 0.8))),
              rng.range(0.5, 1.0)) for _ in range(6)]
    return {"c": c, "r": r, "squash": sq, "droop": droop, "lumps": rng.range(0.30, 0.48),
            "bumps": bumps, "tone": rng.range(0.94, 1.06)}


def _branch(rng, o, tip, r0, elbow, cl):
    """A limb from `o` to `tip` with two interior control points bowed off the chord: up
    near the base (it rises out of the trunk), sideways and down in the middle (an elbow)."""
    ch = T.sub(tip, o)
    L = T.length(ch)
    side = T.norm(T.cross(ch, (0.0, 0.0, 1.0)))
    s1, s2 = rng.range(-1.0, 1.0), rng.range(-1.0, 1.0)
    p1 = T.add(T.add(o, T.mul(ch, 0.30)), T.add((0.0, 0.0, L * elbow * rng.range(0.3, 1.0)),
                                                T.mul(side, L * elbow * 0.5 * s1)))
    p2 = T.add(T.add(o, T.mul(ch, 0.66)), T.add((0.0, 0.0, -L * elbow * rng.range(0.0, 0.7)),
                                                T.mul(side, L * elbow * s2)))
    return {"pts": [o, p1, p2, tip], "r0": r0, "r1": r0 * 0.36, "cl": cl}


# ---------------------------------------------------------------- LOD table
_LOD = {
    0: {"trunk_rings": 16, "per_but": 4, "limb_per": 3, "limb_sides": 9, "fork_per": 2,
        "fork_sides": 7, "root_n": 7, "root_sides": 7, "lobe": (11, 6), "merge": None,
        "lump": 1.0, "roots": None, "cap": 5900},
    1: {"trunk_rings": 8, "per_but": 2, "limb_per": 2, "limb_sides": 6, "fork_per": 1,
        "fork_sides": 5, "root_n": 4, "root_sides": 5, "lobe": (8, 5), "merge": "cluster",
        "lump": 0.8, "roots": None, "cap": 1950},
    2: {"trunk_rings": 5, "per_but": 1, "limb_per": 1, "limb_sides": 4, "fork_per": 0,
        "fork_sides": 0, "root_n": 3, "root_sides": 4, "lobe": (8, 4), "merge": 5,
        "lump": 0.5, "roots": 4, "cap": 490},
}


def _trunk_zs(pl, n):
    """Ring heights: dense where the buttresses are, sparser up the bole."""
    z_top = pl["zTop"]
    out = []
    for i in range(n):
        u = i / (n - 1)
        out.append(-0.05 + (z_top + 0.05) * u ** 1.7)
    return out


def _trunk(mesh, pl, cfg):
    # A plain circle at -0.06 under the first buttressed ring at -0.05: the bottom cap is a
    # fan, and a fan over a star-shaped ring folds over itself (inward faces).
    zs = [-0.06] + _trunk_zs(pl, cfg["trunk_rings"])
    n = len(zs)
    sides = pl["nBut"] * cfg["per_but"]
    path = [_trunk_point(pl, z) for z in zs]
    radii = [pl["trunkR"](max(0.0, z)) for z in zs]
    nb, amps, bh = pl["nBut"], pl["butAmps"], pl["butH"]
    flute, twist, H = pl["flute"], pl["twist"], pl["height"]
    scar = pl["scar"]

    def lobes(u, th):
        i = min(n - 1, int(round(u * (n - 1))))
        if i == 0 or i == n - 1:
            return 1.0                  # convex end rings, so the cap fans stay flat
        z = zs[i]
        near = max(0.0, 1.0 - max(0.0, z) / bh)
        near = near * near
        k = int(round(th * nb / (2.0 * math.pi))) % nb
        dth = (th - 2.0 * math.pi * k / nb + math.pi) % (2.0 * math.pi) - math.pi
        g = max(0.0, math.cos(dth * nb * 0.5)) ** 1.4
        m = 1.0 + amps[k] * near * g + 0.25 * near
        fl = math.cos(2 * nb * (th - pl["phase"] - twist * 2.0 * math.pi * z / H))
        m += flute * fl * (1.0 - 0.6 * near)
        if scar is not None:
            dz = (z - scar["z"]) / (0.5 * scar["h"])
            da = ((th - scar["theta"] + math.pi) % (2.0 * math.pi) - math.pi) / scar["w"]
            e = dz * dz + da * da
            if e < 1.0:
                m *= 1.0 - scar["depth"] * T.smoothstep((1.0 - e) * 1.6)
        return m

    def colour(u, m):
        # Hollows and flute troughs darker, ridges and buttress crests lighter: the three
        # values come from the form, not from paint.
        if m < 0.9:
            return T.bark_shade(T.lerp(0.80, 1.0, T.clamp01((m - 0.68) / 0.22)))
        return T.bark_shade(1.04 + 0.30 * u + 0.40 * T.clamp01(m - 1.0))

    T.tube(mesh, path, radii, sides, colour, lobe_fn=lobes)


def _axis(lx, ly, z_fork, z_top, z):
    """The trunk's axis at height z: vertical to 0.7 of the fork height, then leaning
    smoothly to (lx, ly) at the top. Limbs attach to exactly this line."""
    if z <= 0.7 * z_fork:
        return (0.0, 0.0, z)
    w = T.smoothstep((z - 0.7 * z_fork) / max(1e-6, z_top - 0.7 * z_fork))
    return (lx * w, ly * w, z)


def _trunk_point(pl, z):
    lx, ly = pl["lean"]
    return _axis(lx, ly, pl["zFork"], pl["zTop"], z)


def _roots(mesh, pl, cfg):
    roots = pl["roots"]
    if cfg["roots"] is not None:
        roots = sorted(roots, key=lambda r: -r["r0"])[:cfg["roots"]]
    n, sides = cfg["root_n"], cfg["root_sides"]
    for rt in roots:
        d = _dir(rt["theta"])
        lat = (-d[1], d[0], 0.0)
        L, rr0, z0 = rt["len"], rt["r0"], rt["z0"]
        path, radii = [], []
        start = 0.25 * pl["r0"]
        for i in range(n):
            s = i / (n - 1)
            dist = start + (L - start) * s
            r = max(0.08, rr0 * (1.0 - 0.86 * s ** 0.7))
            w = (rt["wig"] * math.sin(math.pi * s) + rt["wig2"] * math.sin(2.0 * math.pi * s)) \
                * L * s
            zc = max(r - 0.07, z0 * (1.0 - s) ** 2.2)
            path.append(T.add(T.add(T.mul(d, dist), T.mul(lat, w)), (0.0, 0.0, zc)))
            radii.append(r)
        T.tube(mesh, path, radii, sides, lambda u, m: T.bark_shade(1.02 + 0.22 * u))


def build(seed, lod=0, params=None):
    """Build one ancient giant. seed: any int. lod: 0 / 1 / 2. `params` optionally
    overrides plan entries, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()

    _trunk(mesh, pl, cfg)
    _roots(mesh, pl, cfg)
    n_base = sum(1 for c in pl["clusters"] if c["tier"] == 0 and not c["axis"])
    for i, br in enumerate(pl["limbs"]):
        fork = i >= n_base
        per = cfg["fork_per"] if fork else cfg["limb_per"]
        sides = cfg["fork_sides"] if fork else cfg["limb_sides"]
        if sides == 0:
            continue
        pts = br["pts"]
        path = T.catmull(pts, per) if per else [pts[0], pts[-1]]
        m = len(path)
        radii = [T.lerp(br["r0"], br["r1"], (k / (m - 1)) ** 0.8) for k in range(m)]
        T.tube(mesh, path, radii, sides, lambda u, mm: T.bark_shade(1.06 + 0.3 * u))
    if pl["stub"] is not None:
        st = pl["stub"]
        path = T.catmull(st["pts"], max(1, cfg["fork_per"])) if lod < 2 else \
            [st["pts"][0], st["pts"][-1]]
        m = len(path)
        T.tube(mesh, path, [T.lerp(st["r0"], st["r1"], k / (m - 1)) for k in range(m)],
               max(4, cfg["limb_sides"] - 2), lambda u, mm: T.weathered(0.25 + 0.7 * u))

    lobes = [lb for c in pl["clusters"] for lb in c["lobes"]]
    if cfg["merge"] == "cluster":
        lobes = [lb for c in pl["clusters"] for lb in T.merge_clouds(c["lobes"], 1)]
    elif cfg["merge"] is not None:
        lobes = T.merge_clouds(lobes, cfg["merge"])
    seg, rings = cfg["lobe"]
    # Whatever the wood cost, the foliage takes what is left of the budget: a crown with
    # more lobes than fit is merged spatially, so it keeps its envelope.
    per = seg * 2 + seg * (rings - 2) * 2
    room = max(4, (cfg["cap"] - mesh.tris()) // per)
    if len(lobes) > room:
        lobes = T.merge_clouds(lobes, room)
    for lb in lobes:
        T.cloud(mesh, lb, seg, rings, pl["canopyZ"], pl["tone"], cfg["lump"])

    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    lobes = [lb for c in pl["clusters"] for lb in c["lobes"]]
    top = max(pl["canopyZ"][1], pl["height"])
    crown = max(math.hypot(lb["c"][0], lb["c"][1]) + lb["r"] * (1.0 + 0.3 * lb["droop"])
                for lb in lobes)
    roots = max(rt["len"] + rt["r0"] * 0.3 for rt in pl["roots"])
    girth = 2.0 * pl["r0"] * (1.25 + max(pl["butAmps"]))
    # daylight: open sky between tiers (the tiered habit's signature), over the height
    spans = {}
    for c in pl["clusters"]:
        lo = min(T.cloud_bottom(lb) for lb in c["lobes"])
        hi = max(lb["c"][2] + lb["r"] * lb["squash"] for lb in c["lobes"])
        a, b = spans.get(c["tier"], (lo, hi))
        spans[c["tier"]] = (min(a, lo), max(b, hi))
    tiers = [spans[k] for k in sorted(spans)]
    day = sum(max(0.0, tiers[i + 1][0] - tiers[i][1]) for i in range(len(tiers) - 1))
    return {
        "seed": int(seed), "form": round(pl["form"], 3), "layers": pl["layers"],
        "height": round(top, 3),
        "width": round(2.0 * max(crown, roots), 3),
        "bole": round(pl["canopyZ"][0] / top, 4),
        "girth": round(girth / top, 4),
        "rootSpan": round(roots / crown, 4),
        "daylight": round(day / top, 4),
        "clusters": len(pl["clusters"]), "habit": pl["habit"],
        "scar": pl["scar"] is not None, "stub": pl["stub"] is not None,
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
