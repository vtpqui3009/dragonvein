"""C3 floatshard — fragments of sky island hanging in the air (docs/ASSET_PLAN.md §C3,
ROADMAP M4d).

Each fragment is a piece broken off a sky-island: a flat-ish slab whose outline has
straight broken edges, a short vertical slab edge, and under it a jagged, faceted
inverted cone tapering to a tip (the island's underside, docs/concept/03-island-scene.png,
in miniature). Fragments float in a cluster at different heights and tilts; none touches
the ground, and the asset's lowest point is lifted clear of z = 0.

The main silhouette axis, `dominance`, is stratified on the seed and runs from a loose
scatter of many small shards of similar size (0) to one big chunk with a few small
satellites (1). Some seeds carry grass on the slab tops (the grass ramp is declared
optional for that reason, as stratified's cap is).

`plan(seed)` draws every fragment, its outline, broken edges, keel and pose up front. Each
fragment is a closed polar sweep (top centre, top rings, rim, slab edge, underside rings,
tip), so a lower LOD samples the same fragment with fewer segments and rings, and LOD2
keeps the largest fragments only. Flat-shaded. Colours: the rock ramp based on rock mid,
deep shadow down the keel, dusk only on small up-facing facets; grass on the ramp
foliage dark -> mid -> light on grassed tops, with its own lip ring so it does not bleed.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "floatshard"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = dict(K.PALETTE)
#: The grass tops are on some seeds only, so the probe must not demand the grass ramp on
#: the committed seed; it still holds it to ΔE 3 wherever it appears.
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.GRASS), list(K.ROCK)],
                 "optional": ["→".join(K.GRASS)]}
METRIC_AXES = ["width", "span", "fragments", "dominance", "keel"]
SHEET = {"widthKey": "width", "topKey": "top", "bottomKey": "bottom", "rx": 74.0,
         "ground": False}

PARAMS = {
    "dominance": (0.0, 1.0, "stratified: 0 a loose scatter of many small shards, 1 one big "
                            "chunk with few satellites"),
    "satellites": (1, 9, "fragments besides the main one (many on low-dominance seeds)"),
    "size": (0.7, 2.6, "main fragment's slab radius, metres (grows with dominance)"),
    "satSize": (0.15, 0.9, "satellite radius against the main one's (shrinks with dominance)"),
    "elongation": (1.0, 1.6, "slab outline ellipse ratio"),
    "breaks": (2, 4, "straight broken edges cut across each slab's outline"),
    "breakDepth": (0.08, 0.32, "how deep a broken edge cuts in, in radii"),
    "thick": (0.12, 0.34, "slab edge height against the radius"),
    "keel": (0.8, 2.3, "underside depth against the radius: a shallow bowl or a long spike"),
    "taper": (0.6, 1.8, "taper exponent of the underside: under 1 full, over 1 a needle"),
    "keelLean": (0.0, 0.4, "tip offset from the axis, in radii"),
    "jag": (0.08, 0.20, "jaggedness of the underside: lumps and facets, in radii"),
    "tilt": (0.0, 0.5, "fragment tilt, radians (small on the main chunk, larger on satellites)"),
    "drift": (0.0, 1.0, "0 satellites ring the main chunk, 1 they trail off one way"),
    "rise": (0.6, 2.0, "vertical scatter of the satellites, in main radii plus a metre"),
    "clearance": (0.5, 1.3, "height of the cluster's lowest tip above z = 0, metres"),
    "grass": (0.0, 1.0, "chance (0.5) the seed's slabs carry grass tops"),
}
#: Per LOD: segments per metre^0.5 of radius (with clamps), underside rings, the inner top
#: ring and grass lip, and how many fragments are kept (largest first).
_LOD = {0: {"seg": 13, "segMin": 7, "segMax": 18, "under": 5, "inner": True, "lip": True, "keep": 99},
        1: {"seg": 8, "segMin": 5, "segMax": 11, "under": 2, "inner": False, "lip": True, "keep": 99},
        2: {"seg": 5, "segMin": 4, "segMax": 6, "under": 1, "inner": False, "lip": False, "keep": 6}}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def _wrap(a):
    return (a + math.pi) % (2.0 * math.pi) - math.pi


def _fragment(r, R, tilt_max, grass_p, tone_bias):
    """Draw one fragment's every random number, in a fixed order."""
    elong = _p("elongation", r.range(0.0, 1.0))
    heading = r.range(0.0, 2.0 * math.pi)
    harm = [(k, r.range(0.02, 0.07) / (k - 1), r.range(0.0, 2.0 * math.pi)) for k in (2, 3, 5)]
    breaks = []
    for _ in range(r.int(2, 4)):
        breaks.append((r.range(0.0, 2.0 * math.pi), 1.0 - _p("breakDepth", r.range(0.0, 1.0))))
    thick = _p("thick", r.range(0.0, 1.0)) * R
    keel = _p("keel", r.range(0.0, 1.0)) * R
    taper = _p("taper", r.range(0.0, 1.0))
    lean = _p("keelLean", r.range(0.0, 1.0)) * R
    lean_a = r.range(0.0, 2.0 * math.pi)
    jag = _p("jag", r.range(0.0, 1.0))
    lumps = [(r.int(3, 7), r.range(0.4, 1.0), r.range(0.0, 2.0 * math.pi)) for _ in range(2)]
    facets = [(r.int(8, 14), r.range(0.0, 2.0 * math.pi), r.range(2.0, 6.0)) for _ in range(2)]
    dome = r.range(0.0, 0.08) * R
    top_wave = (r.int(2, 4), r.range(0.0, 2.0 * math.pi), r.range(0.01, 0.04) * R)
    tilt = r.range(0.2, 1.0) * tilt_max
    tilt_a = r.range(0.0, 2.0 * math.pi)
    yaw = r.range(0.0, 2.0 * math.pi)
    grass = r.range(0.0, 1.0) < grass_p
    tone = K.clamp01(r.range(0.0, 1.0) * 0.7 + tone_bias)

    def outline(th):
        """Slab rim radius: an ellipse with low lobes, then straight broken edges."""
        a = th - heading
        rr = R / math.sqrt((math.cos(a) / elong) ** 2 + math.sin(a) ** 2) * math.sqrt(elong)
        rr *= 1.0 + sum(am * math.cos(k * th + ph) for k, am, ph in harm)
        for ang, d in breaks:
            c = math.cos(_wrap(th - ang))
            if c > 1e-3:
                rr = min(rr, d * R / c)
        return rr

    def under(v, th):
        """Underside at depth fraction v (0 the slab edge's foot, 1 the tip): radius scale,
        (x, y) offset, z below the slab top."""
        s = (1.0 - v) ** taper
        k = 1.0 + jag * sum(a * math.sin(n * th + ph) for n, a, ph in lumps) * (1.0 - 0.5 * v)
        k += 0.5 * jag * sum(math.sin(n * th + ph + dr * v) for n, ph, dr in facets) * (1.0 - v)
        ox, oy = lean * v * v * math.cos(lean_a), lean * v * v * math.sin(lean_a)
        return s * k, (ox, oy), -thick - keel * v

    def top_z(rho, th):
        n, ph, am = top_wave
        return dome * (1.0 - rho * rho) + am * rho * math.sin(n * th + ph)

    return {"R": R, "thick": thick, "keel": keel, "taper": taper, "tilt": tilt,
            "tiltA": tilt_a, "yaw": yaw, "grass": grass, "tone": tone, "outline": outline,
            "under": under, "topZ": top_z, "pos": (0.0, 0.0, 0.0)}


def _rotate(frag, p):
    """Fragment-local point to world: yaw, then tilt about a horizontal axis, then move."""
    x, y, z = p
    c, s = math.cos(frag["yaw"]), math.sin(frag["yaw"])
    x, y = c * x - s * y, s * x + c * y
    ax, ay = math.cos(frag["tiltA"]), math.sin(frag["tiltA"])
    t = frag["tilt"]
    ct, st = math.cos(t), math.sin(t)
    # Rodrigues about (ax, ay, 0).
    d = ax * x + ay * y
    cx, cy, cz = ay * z, -ax * z, ax * y - ay * x
    x = x * ct + cx * st + ax * d * (1.0 - ct)
    y = y * ct + cy * st + ay * d * (1.0 - ct)
    z = z * ct + cz * st
    px, py, pz = frag["pos"]
    return (px + x, py + y, pz + z)


def _samples(frag, n=24):
    """World points on a fragment's rim, slab foot and tip: for bounds and placement."""
    pts = []
    for j in range(n):
        th = 2.0 * math.pi * j / n
        ro = frag["outline"](th)
        pts.append(_rotate(frag, (ro * math.cos(th), ro * math.sin(th), frag["topZ"](1.0, th))))
        sc, (ox, oy), z = frag["under"](0.0, th)
        pts.append(_rotate(frag, (ox + ro * sc * math.cos(th), oy + ro * sc * math.sin(th), z)))
    _, (tx, ty), tz = frag["under"](1.0, 0.0)
    pts.append(_rotate(frag, (tx, ty, tz)))
    return pts


def plan(seed):
    r = Rng(int(seed))
    dom = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    n_sat = max(1, min(9, int(round(K.lerp(r.range(5.5, 9.4), r.range(0.6, 3.4), dom)))))
    R0 = K.lerp(r.range(0.75, 1.05), r.range(1.8, 2.6), dom)
    drift = _p("drift", r.range(0.0, 1.0))
    wind = r.range(0.0, 2.0 * math.pi)
    rise = _p("rise", r.range(0.0, 1.0))
    grass_p = 0.85 if r.range(0.0, 1.0) < 0.5 else 0.0
    tone_bias = r.range(0.0, 0.3)
    main = _fragment(r, R0, K.lerp(0.22, 0.08, dom), grass_p, tone_bias)
    frags = [main]
    a0 = r.range(0.0, 2.0 * math.pi)
    for i in range(n_sat):
        Rs = R0 * K.lerp(r.range(0.45, 0.9), r.range(0.15, 0.36), dom)
        f = _fragment(r, Rs, _p("tilt", r.range(0.3, 1.0)), grass_p, tone_bias)
        # Placement: an even spread around the main chunk, or a trail off one way. Draws
        # are fixed in number, so a rejected try does not shift the stream.
        tries = [(r.range(0.0, 1.0), r.range(-1.0, 1.0), r.range(-1.0, 1.0)) for _ in range(16)]
        placed = False
        for k, (u_d, u_a, u_z) in enumerate(tries):
            spread = 1.0 + 0.04 * k
            ang = K.lerp(a0 + i * 2.399963 + 0.5 * u_a, wind + 0.75 * u_a, drift)
            dist = (R0 * K.lerp(0.9, 1.15, dom) + Rs) * (1.05 + K.lerp(0.7, 0.35, dom) * u_d) * spread
            dist += K.lerp(0.15, 0.0, dom) * i * drift
            z = u_z * (rise * R0 * K.lerp(1.0, 0.55, dom) + 0.5)
            f["pos"] = (dist * math.cos(ang), dist * math.sin(ang), z)
            # A cluster, not a field: nothing strays further than this from the main chunk.
            if dist > K.lerp(1.9, 1.4, dom) * (R0 * K.lerp(0.9, 1.15, dom) + Rs) + 0.5:
                continue
            if all(not _overlap(f, g) for g in frags):
                placed = True
                break
        if placed:
            frags.append(f)
    # Lift the cluster so its lowest tip floats `clearance` above the ground.
    clearance = _p("clearance", r.range(0.0, 1.0))
    low = min(p[2] for f in frags for p in _samples(f))
    lift = clearance - low
    for f in frags:
        x, y, z = f["pos"]
        f["pos"] = (x, y, z + lift)
    # Recentre on the cluster's footprint so the sheet frames it.
    pts = [p for f in frags for p in _samples(f)]
    cx = 0.5 * (min(p[0] for p in pts) + max(p[0] for p in pts))
    cy = 0.5 * (min(p[1] for p in pts) + max(p[1] for p in pts))
    for f in frags:
        x, y, z = f["pos"]
        f["pos"] = (x - cx, y - cy, z)
    order = sorted(range(len(frags)), key=lambda k: (-frags[k]["R"], k))
    frags = [frags[k] for k in order]
    return {"dominance": dom, "frags": frags, "grass": grass_p > 0.0, "drift": drift}


def _overlap(f, g):
    """Bounding cylinders (slab radius, top to tip) with a gap: True if they would touch."""
    dx, dy = f["pos"][0] - g["pos"][0], f["pos"][1] - g["pos"][1]
    gap = 0.25 + 0.1 * (f["R"] + g["R"])
    if math.hypot(dx, dy) > 1.2 * (f["R"] + g["R"]) + gap:
        return False
    ftop, fbot = f["pos"][2] + 0.4 * f["R"], f["pos"][2] - f["thick"] - f["keel"] - 0.4 * f["R"]
    gtop, gbot = g["pos"][2] + 0.4 * g["R"], g["pos"][2] - g["thick"] - g["keel"] - 0.4 * g["R"]
    return not (fbot > gtop + gap or gbot > ftop + gap)


def _connect(m, A, B, offA, offB, quads=True):
    """Join two rings of equal size, A above (or inside) B. Offsets are 0 or 0.5 segments."""
    n = len(A)
    for j in range(n):
        k = (j + 1) % n
        if offA == offB:
            m.face((A[j], B[j], B[k], A[k]))
        elif offB > offA:
            m.face((A[j], B[j], A[k]))
            m.face((A[k], B[j], B[k]))
        else:
            m.face((A[j], B[j], B[k]))
            m.face((A[j], B[k], A[k]))


def _add_fragment(m, f, cfg, cols):
    seg = int(round(cfg["seg"] * math.sqrt(f["R"])))
    seg = max(cfg["segMin"], min(cfg["segMax"], seg))
    step = 2.0 * math.pi / seg
    grass = f["grass"]
    tone = f["tone"]

    def put(p, t, kind):
        cols.append((kind, t))
        return m.vert(_rotate(f, p), (0, 0, 0))

    rings, offs = [], []

    def ring(off, point, t, kind):
        """One ring of seg vertices at angles step * (j + off); point(th) -> (x, y, z)."""
        rings.append([put(point(step * (j + off)), t, kind) for j in range(seg)])
        offs.append(off)

    def at(th, scale, z):
        ro = f["outline"](th) * scale
        return (ro * math.cos(th), ro * math.sin(th), z)

    top_kind = "grass" if grass else "rock"
    centre = put((0.0, 0.0, f["topZ"](0.0, 0.0)), 0.44 if grass else 0.66 + 0.06 * tone, top_kind)
    if cfg["inner"]:
        ring(0.0, lambda th: at(th, 0.55, f["topZ"](0.55, th)),
             0.38 if grass else 0.68 + 0.06 * tone, top_kind)
    # Every ring from the rim down is offset half a segment from the one above, so the thin
    # bands (grass lip, slab edge) are broad triangles rather than sliver-split quads.
    off = 0.0
    if grass and cfg["lip"]:
        # The grass lip, a hair proud of the rim, then the rock rim tucked just under it.
        ring(off, lambda th: at(th, 1.02, f["topZ"](1.0, th)), 0.22, "grass")
        drop = 0.10 * f["thick"] + 0.03
        off = 0.5 - off
        ring(off, lambda th: at(th, 0.97, f["topZ"](1.0, th) - drop), 0.64 + 0.06 * tone, "rock")
    elif grass:
        # No lip at this LOD: the rim itself is grass, so the top stays green at a distance
        # instead of fading to rock across the whole slab.
        ring(off, lambda th: at(th, 1.0, f["topZ"](1.0, th)), 0.26, "grass")
    else:
        ring(off, lambda th: at(th, 1.0, f["topZ"](1.0, th)), 0.64 + 0.06 * tone, "rock")

    def under_pt(v, scale):
        def point(th):
            sc, (ox, oy), z = f["under"](v, th)
            x, y, _ = at(th, scale * sc, 0.0)
            return (ox + x, oy + y, z)
        return point

    # The slab edge's foot: straight down, a touch in.
    off = 0.5 - off
    ring(off, under_pt(0.0, 0.96), 0.68 + 0.06 * tone, "rock")
    nu = cfg["under"]
    # Geometric spacing down the keel: the gap shrinks with the radius, so the facets near
    # the tip stay broad instead of turning into tall slivers.
    v_last = {1: 0.5, 2: 0.7}.get(nu, 0.86)
    for i in range(1, nu + 1):
        v = 1.0 - (1.0 - v_last) ** (i / nu)
        off = 0.5 - off
        ring(off, under_pt(v, 0.96), 0.70 + 0.06 * tone + 0.22 * v ** 0.8, "rock")
    _, (tx, ty), tz = f["under"](1.0, 0.0)
    tip = put((tx, ty, tz), 0.92, "rock")
    first = rings[0]
    for j in range(seg):
        m.face((centre, first[j], first[(j + 1) % seg]))
    for A, B, oa, ob in zip(rings, rings[1:], offs, offs[1:]):
        _connect(m, A, B, oa, ob)
    last = rings[-1]
    for j in range(seg):
        m.face((last[j], tip, last[(j + 1) % seg]))


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    cfg = _LOD[lod]
    m = K.Mesh()
    cols = []
    for f in pl["frags"][:cfg["keep"]]:
        _add_fragment(m, f, cfg, cols)
    for i, nrm in enumerate(K.vertex_normals(m)):
        kind, t = cols[i]
        if kind == "grass":
            m.c[i] = K.ramp(K.GRASS, t)
        else:
            # Rock mid on the flanks and keel, darker as the keel turns to face the ground,
            # dusk only on a small up-facing facet.
            t = t - 0.12 * max(0.0, nrm[2]) ** 2 + 0.06 * max(0.0, -nrm[2])
            m.c[i] = K.ramp(K.ROCK, K.clamp01(t))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME, smooth_shade=False)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def metrics(seed, lod=0):
    pl = plan(int(seed))
    pts = [p for f in pl["frags"] for p in _samples(f, 48)]
    xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
    main = pl["frags"][0]
    rest = [f["R"] for f in pl["frags"][1:]] or [main["R"]]
    return {
        "seed": int(seed),
        "width": round(max(max(xs) - min(xs), max(ys) - min(ys)), 3),
        "top": round(max(zs), 3),
        "bottom": round(min(zs), 3),
        "span": round(max(zs) - min(zs), 3),
        "fragments": len(pl["frags"]),
        "dominance": round(main["R"] / (sum(rest) / len(rest)), 3),
        # The main chunk's keel depth against its slab radius: a bowl or a spike.
        "keel": round((main["thick"] + main["keel"]) / main["R"], 3),
        "grass": pl["grass"],
        "dominanceAxis": round(pl["dominance"], 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
