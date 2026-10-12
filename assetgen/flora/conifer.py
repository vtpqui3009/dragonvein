"""B1 conifer — a seeded tiered conifer spire (docs/ASSET_PLAN.md §B1, ROADMAP M5b).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. No wall clock, no unseeded `random`.

Shape
-----
A straight trunk rising from z = 0 through a stack of separate foliage tiers. Each tier is
a closed shell of revolution with a star-shaped rim: its branch tips hang lower and reach
further than the notches between them, so a tier reads as a whorl of drooping limbs, not
as a smooth cone. Tiers shrink up the trunk along an envelope that can be convex (bullet)
or concave (pagoda), are spaced irregularly (some gaps show the trunk, some tiers overlap),
are pushed off-axis toward one side (crown asymmetry), and the top tier ends in a leader.

The form axis
-------------
`form` 0..1 is stratified on the seed by the golden-ratio sequence (broadleaf's pattern):
0 is a squat, broad fir with three or four flat tiers, 1 a tall narrow spruce spire with
nine or ten. Height, droop and tier spacing ride on top as their own draws, two of them
stratified too, so neighbouring seeds differ in more than one way.

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
NAME = "conifer"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(T.BUDGET)
PALETTE = dict(T.PALETTE)
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
METRIC_AXES = ["height", "width", "tiers", "bare", "droop"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 83.0, "ground": True}

# ---------------------------------------------------------------- parameters
PARAMS = {
    "form": (0.0, 1.0, "stratified: 0 squat broad few-tier fir ... 1 tall narrow many-tier "
                       "spruce spire. Drives height, crown width, tier count."),
    "height": (0.70, 1.36, "multiplier on the form's height (3.4 m at form 0, 10.5 m at 1); "
                           "stratified on the plastic number"),
    "aspect": (0.85, 1.18, "multiplier on the form's crown radius / height"),
    "tiers": (-0.7, 0.7, "added to the form's tier count (3 at form 0, 9.5 at 1), rounded"),
    "bare": (0.03, 0.36, "bare lower trunk, as a fraction of height, before the first tier"),
    "profile": (0.45, 1.60, "envelope exponent: <1 convex bullet crown, >1 concave pagoda"),
    "droop": (0.0, 1.0, "stratified: 0 flat plate-like tiers ... 1 tall hanging skirts"),
    "gap": (0.72, 1.45, "tier skirt length / tier spacing: <1 the trunk shows between "
                        "tiers, >1 tiers overlap into a dense spire"),
    "spacingJitter": (0.10, 0.55, "irregularity of the gaps between tiers"),
    "points": (5, 8, "branch tips per tier (the star rim)"),
    "notch": (0.14, 0.32, "how far the rim pulls in between tips, in tier radii"),
    "asym": (0.04, 0.30, "how far tiers shift toward one side, in tier radii"),
    "asymDir": (0.0, 6.2831853, "radians; which side the crown is heavy on"),
    "ragged": (0.0, 1.0, "stratified on sqrt(3) - 1: 0 a neat, regular "
                         "ornamental spire ... 1 a wild one, tiers tilted, uneven in size, "
                         "spacing and outline"),
    "wobble": (0.03, 0.10, "per-tier angular radius noise amplitude, before ragged"),
    "trunkRadius": (0.026, 0.044, "trunk base radius as a fraction of height"),
    "rootFlare": (1.25, 1.75, "base radius multiplier where the trunk meets the ground"),
    "leader": (0.05, 0.14, "leader spike above the top tier, as a fraction of height"),
    "tone": (0.90, 1.10, "shifts the foliage ramp position; more or less sun on the crown"),
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
    droop_t = T.stratify(seed, T.PHI_M4, 0.10, rng)
    ragged = _p("ragged", T.stratify(seed, T.SQRT3M1, 0.10, rng))

    H = T.lerp(3.4, 10.5, form ** 0.9) * _p("height", h_t)
    aspect = T.lerp(0.78, 0.16, form ** 0.8) * _p("aspect", rng.next())
    n_tiers = int(round(T.lerp(3.0, 9.5, form) + _p("tiers", rng.next())))
    n_tiers = max(3, min(10, n_tiers))
    bare = _p("bare", rng.next()) * T.lerp(1.0, 0.8, form)
    profile = _p("profile", rng.next())
    droop = _p("droop", droop_t)
    gap = _p("gap", rng.next())
    jitter = _p("spacingJitter", rng.next()) * T.lerp(0.5, 1.4, ragged)
    points = rng.int(int(PARAMS["points"][0]), int(PARAMS["points"][1]))
    notch = _p("notch", rng.next())
    asym = _p("asym", rng.next())
    asym_dir = _p("asymDir", rng.next())
    wobble = _p("wobble", rng.next()) * T.lerp(0.6, 2.2, ragged)
    trunk_r = _p("trunkRadius", rng.next()) * H * T.lerp(1.25, 0.9, form)
    flare = _p("rootFlare", rng.next())
    leader = _p("leader", rng.next()) * H
    tone = _p("tone", rng.next())

    R_max = aspect * H                     # crown radius at the lowest tier
    crown_top = H - leader                 # top of the highest tier
    z_low = bare * H                       # rim of the lowest tier
    # Irregular spacing: tier rim heights from cumulative jittered weights.
    weights = [rng.range(1.0 - jitter, 1.0 + jitter) for _ in range(n_tiers)]
    tot = sum(weights)
    rims, acc = [], 0.0
    for w in weights:
        rims.append(z_low + (crown_top - z_low) * 0.92 * acc / tot)
        acc += w
    spacing = (crown_top - z_low) / n_tiers
    tiers = []
    for i, zr in enumerate(rims):
        u = (zr - z_low) / max(1e-6, crown_top - z_low)
        rv = T.lerp(0.04, 0.24, ragged)
        R = R_max * max(0.10, (1.0 - u) ** profile) * rng.range(1.0 - rv, 1.0 + rv * 0.6)
        # Tier height: a skirt from its collar on the trunk down to its rim tips.
        h = spacing * gap * T.lerp(0.75, 1.55, droop) * rng.range(0.85, 1.15)
        h = max(h, R * T.lerp(0.22, 0.75, droop))
        q = T.lerp(0.75, 2.1, droop) * rng.range(0.9, 1.1)      # >1 hangs at the rim
        zt = zr + h
        if i == n_tiers - 1:
            zt = max(zt, crown_top)
            h = zt - zr
        sh = asym * R * rng.range(0.5, 1.3) * (0.4 + 0.6 * u)
        off = (math.cos(asym_dir) * sh, math.sin(asym_dir) * sh)
        harm = [(rng.int(2, 3), rng.range(0.0, 6.2831853), wobble * rng.range(0.5, 1.0)),
                (rng.int(4, 5), rng.range(0.0, 6.2831853), wobble * rng.range(0.2, 0.6))]
        tiers.append({"zr": zr, "zt": zt, "h": h, "R": R, "q": q, "off": off, "harm": harm,
                      "phase": rng.range(0.0, 6.2831853),
                      "tilt": T.lerp(0.0, 0.16, ragged) * rng.range(0.3, 1.0),
                      "tiltDir": rng.range(0.0, 6.2831853),
                      "under": rng.range(0.22, 0.38), "tone": rng.range(0.92, 1.08)})
    # The top of the highest tier carries on as the leader spike.
    tiers[-1]["zt"] = H
    tiers[-1]["h"] = H - tiers[-1]["zr"]
    tiers[-1]["q"] = max(tiers[-1]["q"], 1.6)

    return {"seed": seed, "form": form, "height": H, "tiers": tiers, "points": points,
            "notch": notch, "trunkR": trunk_r, "flare": flare, "tone": tone, "droop": droop,
            "bare": bare, "ragged": ragged, "canopyZ": (min(t["zr"] for t in tiers), H)}


# ---------------------------------------------------------------- LOD table
# rho samples on the top skin (rim last), on the underside, and samples per tip.
_LOD = {
    0: {"top": (0.22, 0.48, 0.74, 1.0), "under": (0.55,), "per_tip": 4,
        "trunk_rings": 7, "trunk_sides": 8},
    1: {"top": (0.45, 1.0), "under": (0.5,), "per_tip": 2,
        "trunk_rings": 4, "trunk_sides": 6},
    2: {"top": (1.0,), "under": (), "per_tip": 2,
        "trunk_rings": 3, "trunk_sides": 5},
}


def _rim(tr, theta, points, notch, per_tip):
    """Rim radius multiplier at angle theta: a star with `points` tips. Every LOD samples
    at least every tip and every notch, so the silhouette's reach is the same at each."""
    a = (theta - tr["phase"]) * points
    star = 1.0 - notch * (0.5 - 0.5 * math.cos(a))          # 1 at tips, 1-notch between
    wob = 1.0
    for k, ph, amp in tr["harm"]:
        wob += amp * math.cos(k * theta + ph)
    return star * wob, star


def _tier(mesh, tr, cfg, points, notch, zrange, tone):
    R, h, zt, zr, q = tr["R"], tr["h"], tr["zt"], tr["zr"], tr["q"]
    ox, oy = tr["off"]
    z0, z1 = zrange
    sides = points * cfg["per_tip"]
    under_top = zr + tr["under"] * h
    # profile: top pole, top skin samples down to the rim, underside back up to the pole
    prof = [(0.0, zt)] + [(r, None) for r in cfg["top"]] + \
           [(r, "u") for r in cfg["under"]] + [(0.0, under_top)]
    bottom_k = len(prof) - 1

    def place(k, theta, rho, _z):
        m, star = _rim(tr, theta + 0.0, points, notch, cfg["per_tip"])
        tag = prof[k][1]
        if k == 0 or k == bottom_k:
            z = zt if k == 0 else under_top
            p = (ox, oy, z)
            under = k == bottom_k
            rr = 0.0
        else:
            rr = rho * m
            if tag == "u":
                # underside: rises from the rim toward the collar under the tier
                z = zr + (under_top - zr) * (1.0 - rho) ** 0.8 + h * 0.05 * (1.0 - star)
                under = True
            else:
                # top skin: a skirt that hangs at the rim (q > 1) or domes (q < 1); the
                # notches between tips sit higher, so each tip reads as a drooping limb
                z = zt - h * rr ** q
                under = False
            # tilt: a shear of the whole tier, so the top skin stays above the underside
            z += tr["tilt"] * R * rr * math.cos(theta - tr["tiltDir"])
            p = (ox + R * rr * math.cos(theta), oy + R * rr * math.sin(theta), z)
        zf = T.clamp01((p[2] - z0) / max(1e-6, z1 - z0))
        if under:
            t = 0.04 + 0.16 * zf + 0.10 * rr
        else:
            t = 0.24 + 0.30 * zf + 0.26 * rr * star + 0.06 * (1.0 - rr)
        return p, T.foliage(T.clamp01(T.clamp01(t) ** 1.15 * tone * tr["tone"]))

    T.revolve(mesh, [(r, 0.0) for r, _ in prof], sides, place)


def build(seed, lod=0, params=None):
    """Build one conifer. seed: any int. lod: 0 / 1 / 2. `params` optionally overrides
    entries of the plan dict, for tuning; production never uses it."""
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    mesh = T.Mesh()

    H, r0, flare = pl["height"], pl["trunkR"], pl["flare"]
    n = cfg["trunk_rings"]
    top_z = pl["tiers"][-1]["zr"] + 0.4 * pl["tiers"][-1]["h"]   # hidden in the top tier
    path, radii = [], []
    for i in range(n):
        u = i / (n - 1)
        z = -0.06 + (top_z + 0.06) * (u ** 1.15)
        path.append((0.0, 0.0, z))
        f = max(0.0, 1.0 - (z / H) / 0.07)
        radii.append(T.lerp(r0, r0 * 0.22, z / top_z) * (1.0 + (flare - 1.0) * f * f))
    T.tube(mesh, path, radii, cfg["trunk_sides"],
           lambda u, m: T.bark(0.15 + 0.6 * u + 0.4 * (m - 1.0)),
           lobe_fn=lambda u, th: 1.0 + 0.05 * math.cos(3.0 * th + 7.0 * u))

    for tr in pl["tiers"]:
        _tier(mesh, tr, cfg, pl["points"], pl["notch"], pl["canopyZ"], pl["tone"])

    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


inward_faces = T.inward_faces


def metrics(seed, lod=0):
    """Silhouette numbers for tools/variant-probe.mjs (METRIC_AXES)."""
    pl = plan(int(seed))
    width = max(math.hypot(*t["off"]) + t["R"] * (1.0 + sum(a for _, _, a in t["harm"]))
                for t in pl["tiers"])
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(pl["height"], 3),
        "width": round(width * 2.0, 3),
        "tiers": len(pl["tiers"]),
        "bare": round(pl["tiers"][0]["zr"] / pl["height"], 4),
        "droop": round(pl["droop"], 4),
        "ragged": round(pl["ragged"], 4),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
