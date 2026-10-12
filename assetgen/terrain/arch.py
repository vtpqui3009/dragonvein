"""C3 arch — a natural stone arch (docs/ASSET_PLAN.md §C3, ROADMAP M4d).

Two legs joined by a lintel around a true through-hole: the mesh is one closed genus-1
solid, a deformed torus, plus fallen rubble at its feet. The main silhouette axis,
`openness`, is stratified on the seed and runs from a squat sea-stack mass pierced by a
small window that sits on a rock sill (0), through a classic arch, to a tall slender span
around a big opening whose legs stand straight in the ground (1).

How it is built, so that it cannot self-intersect at any LOD
------------------------------------------------------------
Everything is polar about the hole's centre P, in the arch's plane (x, z). The hole is a
superellipse, rin(theta); the outer outline is a polygon (flared feet, shoulders, chamfered
top corners and a sagging lintel) read by ray-casting from P, rout(theta). A ring at angle
theta is a blocky cross-section (a superellipse in (radius, depth)) lying in the half-plane
at theta, spanning rin..rout. Rings at different angles lie in different half-planes, so
the swept solid never meets itself; broken facets clamp points along rays inside their own
half-plane, and the lean, bend and plan curl applied last are shears (bijections with
Jacobian 1), so the solid stays embedded and outward-wound. The lower part of the loop is
buried: on an open arch the hole's floor and the sill under it sit below z = 0, on a window
the sill is the visible rock under the hole.

`plan(seed)` draws everything; a lower LOD samples the same surface with fewer rings
(spaced by arc length, sparser where buried) and fewer cross-section corners, and keeps
fewer, plainer rubble stones. Flat-shaded. Colours: the rock ramp from each vertex's own
normal, based on rock mid toward deep shadow on the flanks, dusk only on small sky-facing
facets, deep shadow under the lintel, inside the hole and toward the ground.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "arch"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = {k: K.PALETTE[k] for k in K.ROCK}
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.ROCK)]}
METRIC_AXES = ["width", "slender", "solidity", "hole", "asym"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 78.0, "ground": True}

PARAMS = {
    "openness": (0.0, 1.0, "stratified: 0 a squat sea-stack with a small window on a sill, "
                           "1 a tall slender span around a big opening"),
    "height": (2.6, 6.4, "outer height, metres (taller as openness rises)"),
    "aspect": (0.55, 1.75, "stratified (plastic constant): outer width at the shoulders "
                           "against the height, a narrow gate or a wide, low natural bridge"),
    "legs": (0.12, 0.38, "leg thickness against the width, each (thinner as openness rises)"),
    "asym": (-0.38, 0.38, "leg asymmetry: one leg thicker, the other thinner, by this share"),
    "flare": (0.0, 0.45, "how far each foot spreads out into a buttress, in half-widths"),
    "lintel": (0.13, 0.46, "lintel thickness against the height (thin on an open span)"),
    "sag": (0.0, 0.5, "how far the lintel's top dips at mid-span, in lintel thicknesses"),
    "sill": (-0.08, 0.30, "hole floor height against the height: above 0 a window on a sill"),
    "roundness": (1.7, 3.0, "hole crown exponent: under 2 a pointed crown, 3 a square one"),
    "window": (0.0, 1.0, "stratified (sqrt 5 - 2): a stack's window, 0 a wide, low slot, "
                         "1 a tall, narrow keyhole"),
    "depth": (0.11, 0.21, "half the arch's thickness through the hole, against the height"),
    "thin": (0.55, 1.0, "lintel depth against the legs' (a lintel that has worn thin)"),
    "lean": (-0.16, 0.16, "the whole arch shears sideways, top offset per metre of height"),
    "bend": (0.0, 0.14, "the shear grows toward the top: the arch slumps one way"),
    "curl": (-0.10, 0.10, "plan curvature: the span bows in front or behind its feet"),
    "rib": (0.0, 1.0, "from the same stratified draw as window: 0 the outline is a block "
                      "with shoulders (a portal), 1 it follows the hole at band thickness "
                      "(a rainbow rib); scaled by openness"),
    "blockiness": (2.4, 4.2, "cross-section squareness: 2 rounded, 4 a squared block"),
    "facets": (3, 6, "broken facets chopped off the corners"),
    "rubble": (3, 8, "fallen stones at the feet and under the span"),
}
#: Per LOD: metres of mid-line per ring (and the ring-count clamps), cross-section corners,
#: rubble icosphere subdivision and how many stones are kept.
_LOD = {0: {"step": 0.46, "min": 30, "max": 60, "sec": 9, "sub": 1, "stones": 99},
        1: {"step": 0.90, "min": 16, "max": 30, "sec": 6, "sub": 0, "stones": 99},
        2: {"step": 1.70, "min": 10, "max": 14, "sec": 4, "sub": 0, "stones": 3}}


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def _sgnpow(v, e):
    return math.copysign(abs(v) ** e, v)


def _unit3(r):
    z = r.range(-1.0, 1.0)
    a = r.range(0.0, 2.0 * math.pi)
    s = math.sqrt(max(0.0, 1.0 - z * z))
    return (s * math.cos(a), s * math.sin(a), z)


def _ray_polygon(px, pz, th, poly):
    """Distance from (px, pz) along angle th to the polygon's boundary (star-shaped)."""
    dx, dz = math.cos(th), math.sin(th)
    best = None
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        ex, ez = bx - ax, bz - az
        den = dx * ez - dz * ex
        if abs(den) < 1e-12:
            continue
        wx, wz = ax - px, az - pz
        t = (wx * ez - wz * ex) / den
        s = (wx * dz - wz * dx) / den
        if t > 1e-9 and -1e-9 <= s <= 1.0 + 1e-9:
            best = t if best is None else min(best, t)
    return best if best is not None else 0.0


def plan(seed):
    r = Rng(int(seed))
    o = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    H = K.lerp(r.range(2.6, 3.6), r.range(3.8, 6.4), o)
    # Aspect is stratified too, on the plastic constant: with openness on the golden ratio
    # the pair is an R2 lattice, so any eight seeds spread over both axes together and two
    # open spans do not come out the same gate.
    asp_t = K.stratify(int(seed), 0.7548776662466927, 0.06, r)
    aspect = _p("aspect", asp_t)
    # A sea stack is about as wide as it is tall; a span ranges from a gate to a bridge.
    Wm = H * K.lerp(K.lerp(0.62, 1.2, asp_t), aspect, o)
    leg = K.lerp(r.range(0.22, 0.40), r.range(0.12, 0.19), o) * Wm
    # Biased away from 0: most arches stand on one massive buttress and one slimmer leg.
    asym_u = r.range(-1.0, 1.0)
    asym = math.copysign(abs(asym_u) ** 0.6, asym_u) * PARAMS["asym"][1] * (0.4 + 0.6 * o)
    legL, legR = leg * (1.0 + asym), leg * (1.0 - asym)
    a = 0.5 * (Wm - legL - legR)
    hx = 0.5 * (legL - legR)
    lintel = max(0.4, K.lerp(r.range(0.36, 0.46), r.range(0.13, 0.22), o) * H)
    z_ht = H - lintel
    # The hole's floor: a window on a sill on squat seeds, buried below the ground once open.
    sill_t = K.smooth((o - 0.12) / 0.42)
    z_hb = H * K.lerp(r.range(0.10, 0.36), -0.08, sill_t)
    z_hb = min(z_hb, z_ht - 0.45)
    hu = 0.5 * (z_ht - z_hb)
    Pz = z_hb + hu
    p_top = _p("roundness", r.range(0.0, 1.0))
    p_bot = K.lerp(2.0, 4.0, sill_t)
    # A stack's window shape: a wide, low slot (0) to a tall, narrow keyhole (1). Area
    # roughly kept; the legs and the sill take up the difference. Spans are unaffected.
    stack = 1.0 - sill_t
    # The window shape (stacks) and the rib/portal choice (spans) share one stratified
    # draw, on sqrt(5) - 2: a stack never has a rib and a span never has a window, so
    # each gets the spread across any eight seeds.
    form_t = K.stratify(int(seed), 0.2360679774997897, 0.05, r)
    win_t = _p("window", form_t)
    a *= K.lerp(1.0, K.lerp(1.45, 0.72, win_t), stack)
    a = min(a, 0.5 * Wm - abs(hx) - 0.12 * Wm)
    hu *= K.lerp(1.0, K.lerp(0.72, 1.4, win_t), stack)
    # Keep a lintel of at least max(0.4 m, 0.12 H) and, on a window, a sill above 0.06 H.
    hu = min(hu, H - max(0.4, 0.12 * H) - Pz)
    if z_hb > 0.0:
        hu = min(hu, Pz - 0.06 * H)
    z_ht, z_hb = Pz + hu, Pz - hu
    legL, legR = 0.5 * Wm + hx - a, 0.5 * Wm - hx - a
    lintel = H - z_ht
    hole_harm = [(k, r.range(0.01, 0.045), r.range(0.0, 2.0 * math.pi)) for k in (2, 3, 5)]

    flareL = _p("flare", r.range(0.0, 1.0)) * K.lerp(0.5, 1.0, o)
    flareR = _p("flare", r.range(0.0, 1.0)) * K.lerp(0.5, 1.0, o)
    # A stack's shoulders sit low, so its top domes over the window; a span's sit high.
    shoulder = H * K.lerp(r.range(0.34, 0.56), r.range(0.50, 0.80), o)
    topw = K.lerp(r.range(0.32, 0.66), r.range(0.82, 1.02), o)
    # The two top corners stand at different heights: a stack weathers unevenly.
    tip = (1.0 - 0.6 * o) * lintel * r.range(-0.45, 0.45)
    sag = _p("sag", r.range(0.0, 1.0)) * lintel * o
    bury = 0.10 * H + 0.2
    # The outer outline, counter-clockwise in (x, z), arch-centred x. Every corner is a
    # parameter: flared feet, shoulders, chamfered top corners, a lintel top that sags.
    half = 0.5 * Wm
    tl = r.range(0.75, 0.92)
    tr = r.range(0.75, 0.92)
    outer = [
        (-half * (1.0 + flareL), -bury),
        (half * (1.0 + flareR), -bury),
        (half * (1.0 + 0.45 * flareR), 0.28 * shoulder),
        (half, shoulder),
        (half * K.lerp(1.0, topw, 0.55), K.lerp(shoulder, H, tr) - max(0.0, tip)),
        (half * topw * 0.82, H - max(0.0, tip)),
        (hx + r.range(-0.15, 0.15) * a, H - sag),
        (-half * topw * 0.82, H - max(0.0, -tip)),
        (-half * K.lerp(1.0, topw, 0.55), K.lerp(shoulder, H, tl) - max(0.0, -tip)),
        (-half, shoulder),
        (-half * (1.0 + 0.45 * flareL), 0.28 * shoulder),
    ]
    # The outline's own lumps, periodic in theta, so it is not a drafted polygon.
    out_harm = [(k, r.range(0.012, 0.035), r.range(0.0, 2.0 * math.pi)) for k in (3, 4, 6, 7)]
    tmin = max(0.30, 0.09 * H)
    # A rib arch: the outline follows the hole at a band's thickness instead of a block.
    # Near-bimodal: an arch reads as a portal or as a rib; halfway reads as neither.
    rib = K.smooth((form_t - 0.42) / 0.16) * K.smooth((o - 0.3) / 0.4)
    band_side = 0.5 * (legL + legR) * r.range(0.62, 0.82)
    band_top = lintel * r.range(0.70, 0.90)
    # A rib's crown is round, whatever the portal's would have been.
    p_top = K.lerp(p_top, 2.05, rib)

    def rin(th):
        c, s = math.cos(th), math.sin(th)
        p = p_top if s > 0.0 else p_bot
        rr = 1.0 / ((abs(c) / a) ** p + (abs(s) / hu) ** p) ** (1.0 / p)
        return rr * (1.0 + sum(am * math.sin(k * th + ph) for k, am, ph in hole_harm))

    def rout(th):
        rr = _ray_polygon(hx, Pz, th, outer)
        s = math.sin(th)
        if rib > 0.0 and s > -0.3:
            band = K.lerp(band_side, band_top, max(0.0, s) ** 1.5)
            w = rib * K.smooth((s + 0.3) / 0.5)
            rr = K.lerp(rr, min(rr, rin(th) + band), w)
        rr *= 1.0 + sum(am * math.sin(k * th + ph) for k, am, ph in out_harm)
        # Keep the rock at least tmin thick above ground; the buried sill may be thinner.
        need = K.lerp(0.18, tmin, K.smooth((math.sin(th) + 0.75) / 0.5))
        return max(rr, rin(th) + need)

    D0 = _p("depth", r.range(0.0, 1.0)) * H
    D0 = min(D0, 0.75 * a + 0.35)
    thin = K.lerp(r.range(0.85, 1.0), _p("thin", r.range(0.0, 1.0)), o)
    yflare = r.range(0.15, 0.55)
    D_asym = r.range(-0.15, 0.15)

    def depth(z, x):
        foot = 1.0 + yflare * (1.0 - K.smooth(z / (0.6 * H))) ** 2
        top = K.lerp(1.0, thin, K.smooth((z - 0.55 * z_ht) / max(0.3, H - 0.55 * z_ht)))
        return D0 * foot * top * (1.0 + D_asym * x / half)

    q = _p("blockiness", r.range(0.0, 1.0))
    # Surface facet noise, periodic in both the ring angle and the cross-section angle.
    noise = [(r.int(3, 9), r.int(1, 3), r.range(0.0, 2.0 * math.pi), r.range(0.03, 0.055))
             for _ in range(4)]
    # And a finer, chunkier layer: the facets a low-poly rock shows.
    noise += [(r.int(11, 19), r.int(2, 4), r.range(0.0, 2.0 * math.pi), r.range(0.03, 0.05))
              for _ in range(3)]
    lean = _p("lean", r.range(0.0, 1.0))
    bend = _p("bend", r.range(0.0, 1.0)) * (1.0 if r.range(0.0, 1.0) < 0.5 else -1.0)
    curl = _p("curl", r.range(0.0, 1.0))

    # Broken facets: planes chamfering the corner between the outer face and a broad face,
    # each cutting a little into the rock at a random place on the loop.
    cuts = []
    for _ in range(r.int(3, 6)):
        th = r.range(-0.35 * math.pi, 1.35 * math.pi)
        side = 1.0 if r.range(0.0, 1.0) < 0.5 else -1.0
        beta = r.range(0.35, 1.05)
        ro = rout(th)
        Q = (hx + ro * math.cos(th), side * depth(Pz + ro * math.sin(th), 0.0), Pz + ro * math.sin(th))
        n = (math.cos(beta) * math.cos(th), side * math.sin(beta), math.cos(beta) * math.sin(th))
        cuts.append((n, n[0] * Q[0] + n[1] * Q[1] + n[2] * Q[2] - r.range(0.10, 0.24) * D0))

    tone = r.range(0.0, 1.0)
    # Rubble at the feet, and on open spans a stone or two fallen under the lintel.
    stones = []
    n_rub = r.int(3, 8)
    for i in range(n_rub):
        rad = r.range(0.14, 0.42) * min(1.0, H / 4.0) + 0.06
        sq = r.range(0.45, 0.8)
        cuts_s = [(_unit3(r), r.range(0.55, 0.85)) for _ in range(r.int(3, 5))]
        pick = r.range(0.0, 1.0)
        if pick < 0.2 and sill_t > 0.5 and i > 0:
            x = hx + r.range(-0.6, 0.6) * a
            y = r.range(-0.6, 0.6) * D0
        else:
            sgn = -1.0 if r.range(0.0, 1.0) < 0.5 else 1.0
            fl = flareL if sgn < 0 else flareR
            if pick < 0.6:
                # Beside a foot, outside it.
                x = sgn * (half * (1.0 + 0.6 * fl) + rad * r.range(0.4, 1.3))
                y = r.range(-1.2, 1.2) * D0
            else:
                # In front of or behind a leg.
                x = sgn * (half - 0.5 * (legL if sgn < 0 else legR)) + r.range(-0.5, 0.5) * leg
                y = (1.0 if r.range(0.0, 1.0) < 0.5 else -1.0) * (D0 * (1.0 + yflare) + rad * r.range(0.5, 1.2))
        stones.append({"pos": (x, y, rad * sq * 0.25), "r": rad, "sq": sq,
                       "yaw": r.range(0.0, 2.0 * math.pi), "cuts": cuts_s,
                       "tone": r.range(0.0, 1.0)})
    stones.sort(key=lambda s: -s["r"])

    def warp(p):
        """The last, bijective shears: lean and slump sideways, curl in plan."""
        x, y, z = p
        zz = max(0.0, z)
        x = x + lean * zz + bend * zz * zz / H
        y = y + curl * x * x / max(1.0, half)
        return (x, y, z)

    return {"openness": o, "H": H, "Wm": Wm, "a": a, "hx": hx, "Pz": Pz, "zHt": z_ht,
            "zHb": z_hb, "legL": legL, "legR": legR, "lintel": lintel, "sag": sag,
            "outer": outer, "rin": rin, "rout": rout, "depth": depth, "D0": D0, "q": q,
            "noise": noise, "cuts": cuts, "warp": warp, "lean": lean, "bend": bend,
            "curl": curl, "tone": tone, "stones": stones, "flare": (flareL, flareR),
            "bury": bury, "rib": rib}


def _ring_thetas(pl, n):
    """n ring angles around P, equally spaced along the loop's mid-line, buried stretches
    weighted down; ring 0 at the bottom."""
    M = 720
    pts = []
    for i in range(M + 1):
        th = -0.5 * math.pi + 2.0 * math.pi * i / M
        rm = 0.5 * (pl["rin"](th) + pl["rout"](th))
        pts.append((th, pl["hx"] + rm * math.cos(th), pl["Pz"] + rm * math.sin(th)))
    cum = [0.0]
    for (_, x0, z0), (_, x1, z1) in zip(pts, pts[1:]):
        w = 0.3 if max(z0, z1) < 0.0 else 1.0
        cum.append(cum[-1] + w * math.hypot(x1 - x0, z1 - z0))
    total = cum[-1]
    out, k = [], 0
    for i in range(n):
        target = total * i / n
        while cum[k + 1] < target:
            k += 1
        f = (target - cum[k]) / max(1e-12, cum[k + 1] - cum[k])
        out.append(K.lerp(pts[k][0], pts[k + 1][0], f))
    return out, total


def _loop(pl, lod):
    cfg = _LOD[lod]
    _, total = _ring_thetas(pl, 4)
    n = int(round(total / cfg["step"] / 2.0)) * 2
    n = max(cfg["min"], min(cfg["max"], n))
    return n, cfg["sec"]


def _section_point(pl, th, phi):
    """Surface point at ring angle th and cross-section angle phi (0 = outer face), before
    cuts and warp; also the cross-section centre and a 0..1 'inside the hole' weight."""
    ri, ro = pl["rin"](th), pl["rout"](th)
    rc, hw = 0.5 * (ri + ro), 0.5 * (ro - ri)
    ex, ez = math.cos(th), math.sin(th)
    cx, cz = pl["hx"] + rc * ex, pl["Pz"] + rc * ez
    D = pl["depth"](cz, cx)
    e = 2.0 / pl["q"]
    u = hw * _sgnpow(math.cos(phi), e)
    w = D * _sgnpow(math.sin(phi), e)
    k = 1.0 + sum(am * math.sin(kt * th + kp * phi + ph) for kt, kp, ph, am in pl["noise"])
    u, w = u * k, w * k
    p = (cx + u * ex, w, cz + u * ez)
    inner = K.smooth((-math.cos(phi) - 0.3) / 0.6)
    return p, (cx, 0.0, cz), inner


def _cut(pl, p, c):
    """Clamp p along the ray from the section centre c by every facet plane."""
    d = [p[j] - c[j] for j in range(3)]
    t = 1.0
    for n, off in pl["cuts"]:
        nc = n[0] * c[0] + n[1] * c[1] + n[2] * c[2]
        nd = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]
        if nd > 1e-9 and nc < off - 0.05 and nc + nd > off:
            t = min(t, max(0.45, (off - nc) / nd))
    return (c[0] + t * d[0], c[1] + t * d[1], c[2] + t * d[2])


def _add_arch(m, pl, lod, inner_w):
    n, s = _loop(pl, lod)
    ths, _ = _ring_thetas(pl, n)
    rings = []
    for i, th in enumerate(ths):
        ring = []
        for j in range(s):
            # Alternate rings are offset half a corner, so the facets are triangles.
            phi = 2.0 * math.pi * (j + 0.5 * (i % 2)) / s
            p, c, inner = _section_point(pl, th, phi)
            p = pl["warp"](_cut(pl, p, c))
            ring.append(m.vert(p, (0, 0, 0)))
            inner_w.append(inner)
        rings.append(ring)
    for i in range(n):
        lo, hi = rings[i], rings[(i + 1) % n]
        # Ring i+1 is offset +half (i even) or -half (i odd) against ring i.
        for j in range(s):
            k = (j + 1) % s
            if i % 2 == 0:
                m.face((lo[j], lo[k], hi[j]))
                m.face((lo[k], hi[k], hi[j]))
            else:
                m.face((lo[j], lo[k], hi[k]))
                m.face((lo[j], hi[k], hi[j]))


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    cfg = _LOD[lod]
    m = K.Mesh()
    inner = []
    _add_arch(m, pl, lod, inner)
    n_arch = len(m.v)
    tones = [0.66 + 0.06 * pl["tone"]] * n_arch
    for st in pl["stones"][:cfg["stones"]]:
        first, last = K.fractured_stone(m, cfg["sub"], st["pos"], st["r"], st["sq"], st["yaw"],
                                        st["cuts"], st["tone"])
        inner += [0.0] * (last - first)
        tones += [0.66 + 0.06 * st["tone"]] * (last - first)
    H = pl["H"]
    for i, nrm in enumerate(K.vertex_normals(m)):
        z = m.v[i][2]
        ground = 1.0 - K.smooth(z / (0.18 * H + 0.3))
        # Dusk only on small sky-facing facets: the up term is capped below rock_tone's.
        t = K.rock_tone(nrm[2], tones[i], ground, 0.22 * inner[i])
        if nrm[2] > 0.0:
            t = max(t, tones[i] - 0.17)
        m.c[i] = K.ramp(K.ROCK, t)
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME, smooth_shade=False)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def _solidity(pl, n=64):
    """Share of the arch's above-ground bounding box (in its own plane) that is rock."""
    xs = [x for x, z in pl["outer"]]
    x0, x1 = min(xs), max(xs)
    H = pl["H"]
    inside = total = 0
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        for k in range(n):
            z = H * (k + 0.5) / n
            dx, dz = x - pl["hx"], z - pl["Pz"]
            th = math.atan2(dz, dx)
            rho = math.hypot(dx, dz)
            total += 1
            if pl["rin"](th) < rho < pl["rout"](th):
                inside += 1
    return round(inside / total, 3)


def metrics(seed, lod=0):
    pl = plan(int(seed))
    xs, ys = [], []
    for i in range(96):
        th = 2.0 * math.pi * i / 96
        for phi in (0.0, 0.5 * math.pi, math.pi, 1.5 * math.pi):
            p, _, _ = _section_point(pl, th, phi)
            if p[2] < 0.0:
                continue
            p = pl["warp"](p)
            xs.append(p[0])
            ys.append(p[1])
    for st in pl["stones"]:
        xs += [st["pos"][0] - st["r"], st["pos"][0] + st["r"]]
        ys += [st["pos"][1] - st["r"], st["pos"][1] + st["r"]]
    H, Wm = pl["H"], pl["Wm"]
    vis_h = pl["zHt"] - max(0.0, pl["zHb"])
    return {
        "seed": int(seed),
        "width": round(max(max(xs) - min(xs), max(ys) - min(ys)), 3),
        "height": round(H, 3),
        # The hole's visible area against the arch's outline box.
        "opening": round(2.0 * pl["a"] * vis_h / (Wm * H), 3),
        "slender": round(H / Wm, 3),
        # Rock area above ground against the outline's box: a rib is mostly air, a portal
        # is a frame, a stack is mostly rock.
        "solidity": _solidity(pl),
        # The visible hole's height against its width: a slot, a round window, a gate.
        "hole": round(vis_h / (2.0 * pl["a"]), 3),
        "asym": round(abs(pl["legL"] - pl["legR"]) / (pl["legL"] + pl["legR"]), 3),
        "sill": round(max(0.0, pl["zHb"]) / H, 3),
        "lintel": round(pl["lintel"] / H, 3),
        "lean": round(pl["lean"] + pl["bend"], 3),
        "stones": len(pl["stones"]),
        "openness": round(pl["openness"], 3),
        "rib": round(pl["rib"], 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
