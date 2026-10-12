"""C2 eroded — a wind-carved rock (docs/ASSET_PLAN.md §C2, ROADMAP M4c).

A mass of soft rock the wind has worked on: an undercut, pinched waist, scooped hollows
and pockmarks (tafoni) eaten into its flanks, and faint horizontal banding where harder
beds resisted. A body is a ring sweep whose radius profile pinches at the waist and flares
to a cap, so where the stratified butte steps out in ledges this one curves in.
The main silhouette axis, `hoodoo`, is stratified on the seed and runs from a squat,
lumpy block riddled with hollows (0) to a tall hoodoo whose cap is far wider than the neck
it balances on (1). Some seeds carry a smaller sibling of a different form beside it, as
hoodoos stand in groups.

`plan(seed)` draws everything: the profile, the outline lobes, every scoop and pock, the
banding and the facet noise, all as functions of (angle, height), so a lower LOD samples
the same rock with fewer rings and fewer segments. LOD2 also drops the talus stones.
Flat-shaded, so the facets read. Colours: the rock ramp from each vertex's own normal,
rock mid on the flanks, dusk only on faces that look at the sky (the cap), deep shadow
under the cap, toward the ground and inside the hollows.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "eroded"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = {k: K.PALETTE[k] for k in K.ROCK}
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.ROCK)]}
METRIC_AXES = ["width", "height", "pinch", "hollows", "capRatio"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 72.0, "ground": True}

PARAMS = {
    "hoodoo": (0.0, 1.0, "stratified: 0 squat lumpy block with hollows, 1 tall hoodoo with a "
                         "cap wider than its waist"),
    "width": (1.6, 2.8, "base diameter, metres (wider on squat seeds)"),
    "tallness": (0.5, 2.9, "height against base diameter, 0.5 + 2.4 * hoodoo^1.4"),
    "waistAt": (0.30, 0.60, "where the waist pinches, as a fraction of the body below the cap"),
    "waist": (0.36, 0.95, "waist radius against the base's (narrower as hoodoo rises)"),
    "cap": (0.66, 1.45, "cap rim radius against the base's (wider as hoodoo rises)"),
    "capThick": (0.10, 0.58, "cap thickness as a fraction of the height (thin slab on a "
                            "hoodoo, most of the height on a block)"),
    "dome": (2.0, 5.0, "cap top shape: low is a rounded dome, high a flat table (squat "
                       "blocks pulled toward round)"),
    "foot": (0.75, 1.4, "foot radius against the base width (times hoodoo): a straight stem "
                        "or a wide debris cone"),
    "capTilt": (0.0, 0.16, "cap tilt off level, radians (times hoodoo): a balanced rock"),
    "grain": (0.035, 0.06, "high-frequency facet noise, in radii: the chunky facets"),
    "lobing": (0.05, 0.18, "outline harmonics amplitude (lumpiness)"),
    "scoops": (2, 9, "wind-scoured hollows"),
    "pocks": (3, 8, "small deep pockmarks (tafoni)"),
    "bands": (3.0, 8.0, "harder beds up the height, read as faint ridges and tone"),
    "lean": (0.0, 0.22, "wind shear: top offset against height"),
    "asym": (0.0, 1.0, "0 the waist pinches all round, 1 only the windward side is undercut"),
    "capShift": (0.0, 0.22, "cap offset off the stem toward the lee, in base radii (times hoodoo)"),
    "talus": (0, 3, "fallen stones at the foot"),
    "sibling": (0.0, 1.0, "chance (0.45) of a smaller second body of its own form beside it"),
}
#: Per LOD: segments around; rings on the pedestal (base to waist), the neck (waist to cap),
#: and the dome; the two cap-rim rings are always there; talus icosphere subdivision, and
#: whether the talus is kept at all. A squat body trades rings for up to `wide` more
#: segments, so its facets keep their size both ways (see _slender).
_LOD = {0: {"seg": 14, "wide": 6, "ped": 5, "neck": 4, "dome": 3, "talusSub": 1, "talus": True},
        1: {"seg": 9, "wide": 3, "ped": 2, "neck": 2, "dome": 2, "talusSub": 0, "talus": True},
        2: {"seg": 6, "wide": 1, "ped": 1, "neck": 1, "dome": 1, "talusSub": 0, "talus": False}}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def _wrap(a):
    return (a + math.pi) % (2.0 * math.pi) - math.pi


def _body(r, hood, W, wind):
    """Draw one wind-carved body: every random number, in a fixed order, up front."""
    Rb = 0.5 * W
    H = W * (0.5 + 2.4 * hood ** 1.4) * r.range(0.9, 1.1)
    waist_at = _p("waistAt", r.range(0.0, 1.0))
    waist = K.lerp(r.range(0.80, 0.95), r.range(0.36, 0.55), hood)
    cap = K.lerp(r.range(0.66, 0.86), r.range(1.05, 1.45), hood ** 0.8)
    cap_thick = K.lerp(r.range(0.42, 0.58), r.range(0.10, 0.30), hood)
    # A hoodoo stands on a straight stem or on a wide talus cone of its own debris.
    foot = K.lerp(1.0, _p("foot", r.range(0.0, 1.0)), hood)
    dome = K.lerp(1.4, _p("dome", r.range(0.0, 1.0)), 0.3 + 0.7 * hood)
    lob = _p("lobing", r.range(0.0, 1.0)) * K.lerp(1.4, 0.6, hood)
    harm = [(k, lob * r.range(0.4, 1.0) / max(1.0, k - 1.5), r.range(0.0, 2.0 * math.pi))
            for k in (2, 3, 4)]
    # The undercut is deepest on the windward side: asym 0 pinches all round (a hoodoo's
    # neck), asym 1 keeps the lee side straight, so the rock overhangs like a breaking wave.
    asym = _p("asym", r.range(0.0, 1.0))
    # The cap sits off the stem's axis, overhanging toward the lee.
    cap_shift = _p("capShift", r.range(0.0, 1.0)) * hood
    # The cap has its own lobes, so it is not a coaxial copy of the stem.
    cap_harm = [(k, r.range(0.05, 0.14), r.range(0.0, 2.0 * math.pi)) for k in (2, 3)]
    scoops = []
    for _ in range(r.int(2, 6) + int(round(3.0 * (1.0 - hood)))):
        # Scoops gather on the windward side, the way wind-carving works.
        th = wind + r.range(-1.0, 1.0) * r.range(0.5, math.pi)
        wth = r.range(0.45, 0.85)
        # Round in metres, not in fractions of the height: a squat rock's hollows are
        # bowls, not horizontal slots that would read as stacked strata.
        scoops.append({"th": th, "u": r.range(0.12, 0.85), "wth": wth,
                       "wu": wth * Rb / H * r.range(0.8, 1.3), "d": r.range(0.22, 0.42)})
    pocks = []
    for _ in range(r.int(3, 8)):
        wth = r.range(0.30, 0.45)
        pocks.append({"th": r.range(0.0, 2.0 * math.pi), "u": r.range(0.08, 0.9), "wth": wth,
                      "wu": wth * Rb / H * r.range(0.8, 1.2), "d": r.range(0.25, 0.40)})
    bands = _p("bands", r.range(0.0, 1.0))
    band_amp = r.range(0.008, 0.02) * hood
    band_ph = r.range(0.0, 2.0 * math.pi)
    lean = _p("lean", r.range(0.0, 1.0))
    lean_dir = wind + math.pi + r.range(-0.6, 0.6)
    # Frequencies up the height are per base radius, so facets are the same size on a
    # squat block as on a tall hoodoo.
    noise = [(r.int(3, 7), r.range(0.4, 1.0) * H / Rb, r.range(0.0, 2.0 * math.pi),
              r.range(0.02, 0.045)) for _ in range(3)]
    grain_amp = _p("grain", r.range(0.0, 1.0))
    grain = [(r.int(9, 13), r.range(2.0, 3.5) * H / Rb, r.range(0.0, 2.0 * math.pi))
             for _ in range(2)]
    tilt = _p("capTilt", r.range(0.0, 1.0)) * hood
    tilt_dir = r.range(0.0, 2.0 * math.pi)
    tone = r.range(0.0, 1.0)

    cap_u0 = 1.0 - cap_thick
    waist_u = waist_at * cap_u0
    # A hoodoo's cap has a rim and a low dome; a squat block's top is mostly dome, so it
    # rounds over instead of wearing a lip.
    rim_u = (cap_u0 + K.lerp(0.08, 0.25, hood) * cap_thick,
             cap_u0 + K.lerp(0.22, 0.6, hood) * cap_thick)
    neck = K.lerp(waist, cap, 0.35)
    lee = wind + math.pi

    def profile(u):
        """Radius against Rb at height fraction u, before lobes, scoops and noise."""
        keys = ((0.0, foot), (waist_u, waist), (cap_u0, neck), (rim_u[0], cap), (rim_u[1], cap * 0.97))
        if u >= rim_u[1]:
            s = K.clamp01((u - rim_u[1]) / (1.0 - rim_u[1]))
            return cap * 0.97 * max(0.0, 1.0 - s ** dome) ** (1.0 / dome)
        for (u0, r0), (u1, r1) in zip(keys, keys[1:]):
            if u <= u1:
                return K.lerp(r0, r1, K.smooth((u - u0) / max(1e-6, u1 - u0)))
        return cap * 0.97

    def hollow(th, u):
        """How far into a scoop or pock (th, u) lies: the multiplier on radius, and a 0..1
        depth for colour."""
        k, deep = 1.0, 0.0
        for s in scoops + pocks:
            g = math.exp(-(_wrap(th - s["th"]) / s["wth"]) ** 2 - ((u - s["u"]) / s["wu"]) ** 2)
            k *= 1.0 - s["d"] * g
            deep = max(deep, g * s["d"] / 0.3)
        return k, min(1.0, deep)

    def radius(th, u):
        capness = K.smooth((u - cap_u0 + 0.05) / 0.1)
        base = profile(u)
        if u < cap_u0:
            # Lift the pinch back toward straight on the lee side.
            straight = K.lerp(1.0, min(1.0, cap) * 0.95, K.smooth(u / cap_u0))
            side = asym * (1.0 - 0.5 * hood) * (0.5 + 0.5 * math.cos(th - lee)) ** 2
            base = K.lerp(base, max(base, straight * 0.92), side)
        lobes = 1.0 + sum(a * math.cos(k * th + ph) for k, a, ph in harm)
        lobes *= 1.0 + capness * sum(a * math.cos(k * th + ph) for k, a, ph in cap_harm)
        band = 1.0 + band_amp * math.sin(2.0 * math.pi * bands * u + band_ph) * (1.0 - capness)
        fac = 1.0 + sum(a * math.sin(kk * th + f * u + ph) for kk, f, ph, a in noise)
        fac += grain_amp * sum(math.sin(kk * th + f * u + ph) for kk, f, ph in grain) * 0.5
        k, deep = hollow(th, u)
        return Rb * base * lobes * band * fac * k, deep

    def centre(u):
        off = lean * H * u ** 1.5
        cs = cap_shift * Rb * K.smooth((u - cap_u0 + 0.04) / 0.12)
        return (off * math.cos(lean_dir) + cs * math.cos(lee),
                off * math.sin(lean_dir) + cs * math.sin(lee))

    def cap_slope(u):
        """Vertical shear of the cap (rise per metre along tiltDir); 0 below the neck."""
        return math.tan(tilt) * K.smooth((u - cap_u0 + 0.02) / 0.1)

    return {"hoodoo": hood, "W": W, "Rb": Rb, "H": H, "foot": foot, "capU0": cap_u0,
            "waistU": waist_u, "rimU": rim_u, "lean": lean, "scoops": scoops, "pocks": pocks,
            "tone": tone, "bands": bands, "bandPh": band_ph, "tiltDir": tilt_dir,
            "profile": profile, "radius": radius, "centre": centre, "capSlope": cap_slope,
            "origin": (0.0, 0.0)}


def plan(seed):
    r = Rng(int(seed))
    hood = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    W = _p("width", r.range(0.0, 1.0)) * K.lerp(1.3, 0.75, hood)
    wind = r.range(0.0, 2.0 * math.pi)
    main = _body(r, hood, W, wind)
    bodies = [main]
    if r.range(0.0, 1.0) < 0.45:
        # A sibling of its own form, always a slimmer spire or hoodoo: beside a squat block
        # it stands taller than its parent, beside a tall hoodoo it is a younger, shorter one.
        # It stands just clear of the main body's foot.
        s_hood = r.range(0.55, 0.95)
        s_w = W * r.range(0.45, 0.65)
        sib = _body(r, s_hood, s_w, wind)
        ang = r.range(0.0, 2.0 * math.pi)
        dist = main["Rb"] * max(1.0, main["foot"]) * 0.95 + sib["Rb"] * max(1.0, sib["foot"]) * 0.9
        sib["origin"] = (dist * math.cos(ang), dist * math.sin(ang))
        bodies.append(sib)
    talus = []
    for _ in range(r.int(0, 3)):
        ang = r.range(0.0, 2.0 * math.pi)
        rad = main["Rb"] * r.range(0.14, 0.30)
        sq = r.range(0.45, 0.8)
        cuts = [(_unit3(r), r.range(0.55, 0.85)) for _ in range(r.int(3, 5))]
        out = main["Rb"] * max(1.0, main["foot"]) * r.range(1.0, 1.3) + rad * 0.6
        talus.append({"pos": (out * math.cos(ang), out * math.sin(ang), rad * sq * 0.25),
                      "r": rad, "sq": sq, "yaw": r.range(0.0, 2.0 * math.pi), "cuts": cuts,
                      "tone": r.range(0.0, 1.0)})
    return {"hoodoo": hood, "bodies": bodies, "talus": talus}


def _unit3(r):
    z = r.range(-1.0, 1.0)
    a = r.range(0.0, 2.0 * math.pi)
    s = math.sqrt(max(0.0, 1.0 - z * z))
    return (s * math.cos(a), s * math.sin(a), z)


def _slender(b):
    """0.45 (squat) .. 1 (slender): scales a body's ring count down and its segments up."""
    return min(1.0, max(0.45, b["H"] / b["W"] / 1.6))


def _ring_us(b, cfg):
    """Height fractions of a body's rings, bottom to top (not the top point)."""
    wu, cu, (r0, r1) = b["waistU"], b["capU0"], b["rimU"]
    # Fewer rings on a squat body, so its facets stay as big as a tall one's and do not
    # line up into horizontal strata. Segments differ per LOD, so the chain still drops.
    f = _slender(b)
    ped = max(1, int(round(cfg["ped"] * f)))
    neck = max(1, int(round(cfg["neck"] * f)))
    us = [wu * i / ped for i in range(ped)]
    us += [wu + (cu - wu) * i / neck for i in range(neck)]
    us += [cu, r0, r1]
    us += [r1 + (1.0 - r1) * (1.0 - (1.0 - i / (cfg["dome"] + 1)) ** 1.6)
           for i in range(1, cfg["dome"] + 1)]
    return us


def _add_body(m, b, cfg, deep, base_t):
    """Sweep one body's rings into m: closed, outward (rings counter-clockwise from above,
    floor and top fanned from their centres)."""
    seg = cfg["seg"] + int(round(cfg["wide"] * (1.0 - _slender(b)) / 0.55))
    H = b["H"]
    ox, oy = b["origin"]
    td = (math.cos(b["tiltDir"]), math.sin(b["tiltDir"]))
    rings = []
    for u in _ring_us(b, cfg):
        cx, cy = b["centre"](u)
        z = -0.08 if u == 0.0 else u * H
        sl = b["capSlope"](u)
        # The banding read as tone too on tall bodies: harder beds a touch lighter.
        bt = 0.56 + 0.08 * b["tone"] - 0.05 * b["hoodoo"] * math.sin(2.0 * math.pi * b["bands"] * u + b["bandPh"])
        ring = []
        for j in range(seg):
            # Alternate rings are offset half a segment, so the facets are triangles.
            th = 2.0 * math.pi * (j + 0.5 * (len(rings) % 2)) / seg
            rr, dp = b["radius"](th, u)
            dx, dy = rr * math.cos(th), rr * math.sin(th)
            ring.append(m.vert((ox + cx + dx, oy + cy + dy, z + sl * (dx * td[0] + dy * td[1])),
                               (0, 0, 0)))
            deep.append(dp)
            base_t.append(bt)
        rings.append(ring)
    cx, cy = b["centre"](0.0)
    bot = m.vert((ox + cx, oy + cy, -0.08), (0, 0, 0))
    cx, cy = b["centre"](1.0)
    top = m.vert((ox + cx, oy + cy, H), (0, 0, 0))
    deep += [0.0, 0.0]
    base_t += [0.6, 0.5]
    for lo, hi in zip(rings, rings[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            m.face((lo[j], lo[k], hi[k], hi[j]))
    for j in range(seg):
        k = (j + 1) % seg
        m.face((bot, rings[0][k], rings[0][j]))
        m.face((top, rings[-1][j], rings[-1][k]))


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    cfg = _LOD[lod]
    m = K.Mesh()
    deep, base_t = [], []
    for b in pl["bodies"]:
        _add_body(m, b, cfg, deep, base_t)
    if cfg["talus"]:
        for st in pl["talus"]:
            first, last = K.fractured_stone(m, cfg["talusSub"], st["pos"], st["r"], st["sq"],
                                            st["yaw"], st["cuts"], st["tone"])
            deep += [0.0] * (last - first)
            base_t += [0.58 + 0.1 * st["tone"]] * (last - first)
    H = pl["bodies"][0]["H"]
    for i, nrm in enumerate(K.vertex_normals(m)):
        ground = 1.0 - K.smooth(m.v[i][2] / (0.25 * H + 0.3))
        m.c[i] = K.ramp(K.ROCK, K.rock_tone(nrm[2], base_t[i], ground, deep[i]))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME, smooth_shade=False)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def _rmax(b, us, ths):
    return [max(b["radius"](t, u)[0] for t in ths) for u in us]


def metrics(seed, lod=0):
    pl = plan(int(seed))
    us = [i / 60.0 for i in range(61)]
    ths = [2.0 * math.pi * j / 48 for j in range(48)]
    xs, ys = [], []
    for b in pl["bodies"]:
        for u, rm in zip(us, _rmax(b, us, ths)):
            cx, cy = b["centre"](u)
            xs += [b["origin"][0] + cx - rm, b["origin"][0] + cx + rm]
            ys += [b["origin"][1] + cy - rm, b["origin"][1] + cy + rm]
    for st in pl["talus"]:
        xs += [st["pos"][0] - st["r"], st["pos"][0] + st["r"]]
        ys += [st["pos"][1] - st["r"], st["pos"][1] + st["r"]]
    main = pl["bodies"][0]
    rmax = _rmax(main, us, ths)
    widest = max(rmax)
    lo, hi = int(0.1 * 60), int(main["capU0"] * 60) + 1
    waist = min(rmax[lo:hi])
    wu = us[lo + rmax[lo:hi].index(waist)]
    at_waist = [main["radius"](t, wu)[0] for t in ths]
    return {
        "seed": int(seed),
        "width": round(max(max(xs) - min(xs), max(ys) - min(ys)), 3),
        "height": round(max(b["H"] for b in pl["bodies"]), 3),
        "pinch": round(waist / widest, 3),
        "hollows": sum(len(b["scoops"]) + len(b["pocks"]) for b in pl["bodies"]),
        # Widest cap radius against the foot's: under 1 a pedestal or block, over 1 a cap
        # that overhangs its own base.
        "capRatio": round(max(rmax[int(main["capU0"] * 60):]) / max(rmax[:7]), 3),
        # How one-sided the waist is: 0 pinched evenly all round, toward 1 cut deep on the
        # windward side only (a breaking-wave overhang).
        "undercut": round(1.0 - min(at_waist) / max(at_waist), 3),
        "bodies": len(pl["bodies"]),
        "hoodoo": round(pl["hoodoo"], 3),
        "talus": len(pl["talus"]),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
