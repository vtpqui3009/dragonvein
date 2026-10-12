"""C2 shard — a cluster of shattered stone fangs (docs/ASSET_PLAN.md §C2, ROADMAP M4c).

Tall, sharp, faceted spikes jutting out of a rubble base at irregular lean angles, like rock
split along its cleavage and pushed up: the hard, pointed read no other rock in the set has.
Each spike is an irregular 3-5 sided prism (never a hexagon, never parallel to its
neighbours) that tapers, kinks and bends toward a point, or ends in a steep broken cut.
The main silhouette axis, `dominance`, is stratified on the seed and runs from a low spread
of leaning wedges of similar size (0) to one tall, near-upright dominant spike with smaller
satellites splaying out around it (1).

`plan(seed)` draws every spike, every facet jitter and every rubble stone. LODs keep the
same spikes and drop rings: LOD0 has four rings below the tip, LOD1 two, LOD2 one (and
only the tallest spikes); rubble goes from a once-subdivided icosphere to a plain one,
and LOD2 keeps the biggest three stones. Each LOD is therefore cheaper on every seed.
Flat-shaded, so the cleavage facets read. Colours: the rock ramp from each vertex's own
normal, rock mid on the flanks, dusk only where a facet looks at the sky, deep shadow
toward the ground.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402
from terrain import rockkit as K  # noqa: E402

FAMILY = "terrain"
NAME = "shard"
ASSET_ID = f"{FAMILY}/{NAME}"
SEED_FOR_COMMITTED = 1
BUDGET = dict(K.PROP_BUDGET)
PALETTE = {k: K.PALETTE[k] for k in K.ROCK}
PALETTE_ROLES = {"surfaces": [], "ramps": [list(K.ROCK)]}
METRIC_AXES = ["width", "height", "spikes", "dominance", "sweep"]
SHEET = {"widthKey": "width", "topKey": "height", "bottomKey": None, "rx": 74.0, "ground": True}

PARAMS = {
    "dominance": (0.0, 1.0, "stratified: 0 low spread of leaning wedges, 1 one tall spike "
                            "with satellites"),
    "satellites": (3, 10, "spikes besides the main one (more on low-dominance seeds)"),
    "size": (1.0, 1.5, "height scale of the main spike, metres (times 1.3-3.4 by dominance)"),
    "slimness": (0.12, 0.30, "spike base radius against its height (thin needles, fewer "
                             "chunky wedges)"),
    "flat": (1.0, 2.2, "cross-section aspect: 1 a prism, 2 a blade-like wedge"),
    "sides": (3, 5, "facets around a spike (irregular angles)"),
    "bias": (0.0, 1.0, "0 spikes splay out radially, 1 they all lean one way (a wind-sheared "
                       "outcrop)"),
    "spread": (0.6, 1.6, "how far satellites stand from the main spike"),
    "bend": (0.0, 0.22, "how much a fang curves over along its length, in heights"),
    "broken": (0.1, 0.6, "chance a spike ends in a steep broken cut instead of a point"),
    "rubble": (4, 9, "rubble stones around the feet"),
    "mound": (0.35, 0.6, "radius of the fractured base mound against the cluster's"),
}
#: Ring fractions along a spike below its tip, per LOD (the base ring, buried, is always
#: first). The tip itself is a point or a broken cut on top of the last ring.
_RINGS = {0: (0.22, 0.45, 0.66), 1: (0.45,), 2: ()}
#: (max spikes kept, rubble icosphere subdivision, max rubble stones kept)
_LOD = {0: (99, 1, 99), 1: (99, 0, 99), 2: (6, 0, 3)}
_ALL_RINGS = (0.22, 0.45, 0.66)


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def _ang_lerp(a, b, t):
    d = (b - a + math.pi) % (2.0 * math.pi) - math.pi
    return a + d * t


def _spike(r, foot, h, rad, lean, az, sides, flat, bend, broken, twist, tone):
    """Draw one spike's every random number (in a fixed order) and return its record."""
    jit = math.pi / sides * 0.35
    angs = [2.0 * math.pi * j / sides + r.range(-jit, jit) for j in range(sides)]
    radii = [r.range(0.78, 1.15) for _ in range(sides)]
    # Facet jitter per ring per corner, drawn for every ring LOD0 has, so a lower LOD is
    # the same spike with rings left out.
    ring_jit = [[r.range(-0.12, 0.12) for _ in range(sides)] for _ in _ALL_RINGS]
    ring_off = [(r.range(-0.06, 0.06), r.range(-0.06, 0.06)) for _ in _ALL_RINGS]
    is_broken = r.range(0.0, 1.0) < broken
    cut_beta = r.range(0.62, 0.95)             # cut plane tilt from the axis, radians
    cut_phi = r.range(0.0, 2.0 * math.pi)
    tip_off = (r.range(-0.18, 0.18), r.range(-0.18, 0.18))
    spin = r.range(0.0, 2.0 * math.pi)
    return {"foot": foot, "h": h, "r": rad, "lean": lean, "az": az, "sides": sides,
            "flat": flat, "bend": bend, "angs": angs, "radii": radii, "ringJit": ring_jit,
            "ringOff": ring_off, "broken": is_broken, "cutBeta": cut_beta, "cutPhi": cut_phi,
            "tipOff": tip_off, "twist": twist, "spin": spin, "tone": tone}


def plan(seed):
    r = Rng(int(seed))
    dom = K.stratify(int(seed), 0.6180339887498949, 0.06, r)
    slim_t = r.range(0.0, 1.0)
    slim = _p("slimness", slim_t)
    # Thin needles come in crowds, chunky wedges in few.
    n_sat = max(3, min(10, r.int(3, 6) + int(round(3.0 * (1.0 - dom) + 2.0 * (0.5 - slim_t)))))
    size = _p("size", r.range(0.0, 1.0))
    flat = _p("flat", r.range(0.0, 1.0)) * (1.0 - 0.35 * dom) + 0.35 * dom
    sides_base = r.int(3, 5)
    bias = _p("bias", r.range(0.0, 1.0))
    wind = r.range(0.0, 2.0 * math.pi)
    spread = _p("spread", r.range(0.0, 1.0))
    bend = _p("bend", r.range(0.0, 1.0))
    broken = _p("broken", r.range(0.0, 1.0))
    twist = r.range(-0.5, 0.5)
    a0 = r.range(0.0, 2.0 * math.pi)

    main_h = size * K.lerp(1.3, 3.4, dom)
    main_r = main_h * slim * K.lerp(1.2, 0.72, dom)
    main_lean = math.radians(K.lerp(r.range(26.0, 44.0), r.range(2.0, 11.0), dom))
    main_az = _ang_lerp(r.range(0.0, 2.0 * math.pi), wind, bias)
    spikes = [_spike(r, (0.0, 0.0), main_h, main_r, main_lean, main_az, sides_base, flat,
                     bend, broken * (1.0 - 0.7 * dom), twist, r.range(0.0, 1.0))]
    for i in range(n_sat):
        ang = a0 + i * 2.399963 + r.range(-0.45, 0.45)
        frac = math.sqrt((i + 1.0) / n_sat)
        dist = main_r * 0.55 + spread * main_h * K.lerp(0.42, 0.20, dom) * frac * r.range(0.75, 1.2)
        h = main_h * K.lerp(r.range(0.55, 1.0), r.range(0.18, 0.5), dom)
        rad = h * slim * r.range(0.8, 1.2) * K.lerp(1.15, 0.95, dom)
        lean = math.radians(K.lerp(r.range(30.0, 58.0), r.range(16.0, 42.0), dom))
        az = _ang_lerp(ang, wind, bias) + r.range(-0.5, 0.5)
        sides = sides_base if r.range(0.0, 1.0) < 0.6 else r.int(3, 5)
        sp = _spike(r, (dist * math.cos(ang), dist * math.sin(ang)), h, rad, lean, az, sides,
                    flat * r.range(0.85, 1.15), bend * r.range(0.6, 1.4), broken, twist,
                    r.range(0.0, 1.0))
        spikes.append(sp)

    n_rub = _p("rubble", r.range(0.0, 1.0))
    n_rub = int(round(n_rub))
    stones = []
    for _ in range(n_rub):
        host = spikes[min(len(spikes) - 1, int(r.range(0.0, 1.0) * len(spikes)))]
        ang = r.range(0.0, 2.0 * math.pi)
        out = host["r"] * r.range(0.9, 1.7)
        rad = max(0.2, host["r"] * r.range(0.6, 1.1))
        sq = r.range(0.45, 0.8)
        cuts = [(_unit3(r), r.range(0.55, 0.85)) for _ in range(r.int(3, 5))]
        stones.append({"pos": (host["foot"][0] + out * math.cos(ang),
                               host["foot"][1] + out * math.sin(ang), rad * sq * 0.25),
                       "r": rad, "sq": sq, "yaw": r.range(0.0, 2.0 * math.pi), "cuts": cuts,
                       "tone": r.range(0.0, 1.0)})
    # The base mound: one broad, flat, fractured slab the fangs break out of, centred on
    # the cluster's feet. It is the biggest stone, so every LOD keeps it.
    fx = sum(sp["foot"][0] for sp in spikes) / len(spikes)
    fy = sum(sp["foot"][1] for sp in spikes) / len(spikes)
    reach = max(math.hypot(sp["foot"][0] - fx, sp["foot"][1] - fy) + sp["r"] for sp in spikes)
    mrad = max(main_r * 1.6, _p("mound", r.range(0.0, 1.0)) * reach + main_r)
    msq = r.range(0.28, 0.42)
    mcuts = [(_unit3(r), r.range(0.6, 0.85)) for _ in range(r.int(4, 6))]
    stones.append({"pos": (fx, fy, -mrad * msq * 0.15), "r": mrad, "sq": msq,
                   "yaw": r.range(0.0, 2.0 * math.pi), "cuts": mcuts, "tone": r.range(0.0, 1.0)})
    # Tallest first: the order LOD2 keeps them in. Biggest stones first, likewise.
    order = sorted(range(len(spikes)), key=lambda k: (-spikes[k]["h"], k))
    spikes = [spikes[k] for k in order]
    stones.sort(key=lambda s: -s["r"])
    return {"dominance": dom, "spikes": spikes, "stones": stones, "bias": bias}


def _unit3(r):
    z = r.range(-1.0, 1.0)
    a = r.range(0.0, 2.0 * math.pi)
    s = math.sqrt(max(0.0, 1.0 - z * z))
    return (s * math.cos(a), s * math.sin(a), z)


def _frame(sp):
    """Axis a, and u, w across it, right-handed (u x w = a)."""
    L, az = sp["lean"], sp["az"]
    a = (math.sin(L) * math.cos(az), math.sin(L) * math.sin(az), math.cos(L))
    u = (-math.sin(az), math.cos(az), 0.0)
    w = (a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0])
    return a, u, w


def _centre(sp, a, f):
    """Point on the (bent) axis at fraction f of the spike's length above the ground."""
    length = sp["h"] / math.cos(sp["lean"])
    bx, by = math.cos(sp["az"]), math.sin(sp["az"])
    b = sp["bend"] * sp["h"] * f * f
    return (sp["foot"][0] + a[0] * f * length + bx * b,
            sp["foot"][1] + a[1] * f * length + by * b,
            a[2] * f * length)


def _section(sp, k, rho, jit, off, u, w, c):
    """Corner k of the spike's cross-section at radius rho around centre c."""
    th = sp["angs"][k] + sp["spin"]
    rr = rho * sp["radii"][k] * (1.0 + jit)
    x = rr * math.cos(th) * sp["flat"] + off[0] * sp["r"]
    y = rr * math.sin(th) + off[1] * sp["r"]
    return (c[0] + x * u[0] + y * w[0], c[1] + x * u[1] + y * w[1], c[2] + x * u[2] + y * w[2])


def _twisted(sp, a, u, w, f):
    """The cross-section frame turned by the spike's twist at fraction f."""
    tw = sp["twist"] * f
    cu = tuple(math.cos(tw) * u[j] + math.sin(tw) * w[j] for j in range(3))
    cw = (a[1] * cu[2] - a[2] * cu[1], a[2] * cu[0] - a[0] * cu[2], a[0] * cu[1] - a[1] * cu[0])
    return cu, cw


def _taper(f):
    return (1.0 - 0.95 * f) ** 0.85


def _add_spike(m, sp, fracs):
    a, u, w = _frame(sp)
    n = sp["sides"]
    # The base ring sits below the ground, deep enough that its highest corner is buried
    # even on a steep lean, so the fang grows out of the ground rather than resting on it.
    reach = sp["r"] * max(sp["radii"]) * max(1.0, sp["flat"]) * 1.15
    s = -(reach * math.sin(sp["lean"]) + 0.08) / math.cos(sp["lean"])
    base_c = (sp["foot"][0] + a[0] * s, sp["foot"][1] + a[1] * s, a[2] * s)
    rings = [[m.vert(_section(sp, k, sp["r"], 0.0, (0.0, 0.0), u, w, base_c), (0, 0, 0))
              for k in range(n)]]
    prev_f = 0.0
    for f in fracs:
        i = _ALL_RINGS.index(f)
        c = _centre(sp, a, f)
        cu, cw = _twisted(sp, a, u, w, f)
        rings.append([m.vert(_section(sp, k, sp["r"] * _taper(f), sp["ringJit"][i][k],
                                      sp["ringOff"][i], cu, cw, c), (0, 0, 0)) for k in range(n)])
        prev_f = f
    if sp["broken"]:
        # A steep broken cut: one more ring at 0.84 of the length, its corners slid along
        # the axis onto a plane tilted from it, then capped from its centroid. The tilt is
        # limited so the slid corners stay well clear of the ring below.
        f = 0.84
        c = _centre(sp, a, f)
        cu, cw = _twisted(sp, a, u, w, f)
        rho = sp["r"] * _taper(f)
        pts = [_section(sp, k, rho, 0.0, (0.0, 0.0), cu, cw, c) for k in range(n)]
        qs = [tuple(p[j] - c[j] for j in range(3)) for p in pts]
        span = max(math.sqrt(sum(x * x for x in q)) for q in qs)
        gap = (f - prev_f) * sp["h"] / math.cos(sp["lean"])
        cb = min(sp["cutBeta"], math.atan(0.45 * gap / max(span, 1e-6)))
        cp = sp["cutPhi"]
        nrm = tuple(math.sin(cb) * (math.cos(cp) * u[j] + math.sin(cp) * w[j]) for j in range(3))
        top = []
        for p, q in zip(pts, qs):
            t = -sum(q[j] * nrm[j] for j in range(3)) / math.cos(cb)
            top.append(m.vert(tuple(p[j] + t * a[j] for j in range(3)), (0, 0, 0)))
        rings.append(top)
        cx = sum(m.v[k][0] for k in top) / n
        cy = sum(m.v[k][1] for k in top) / n
        cz = sum(m.v[k][2] for k in top) / n
        apex = m.vert((cx, cy, cz), (0, 0, 0))
    else:
        c = _centre(sp, a, 1.0)
        o = sp["tipOff"]
        apex = m.vert(tuple(c[j] + (o[0] * u[j] + o[1] * w[j]) * sp["r"] for j in range(3)),
                      (0, 0, 0))
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            m.face((lo[j], lo[k], hi[k], hi[j]))
    last = rings[-1]
    for j in range(n):
        m.face((last[j], last[(j + 1) % n], apex))
    b = rings[0]
    for j in range(1, n - 1):
        m.face((b[0], b[j + 1], b[j]))


def build(seed, lod=0, params=None):
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    pl = plan(int(seed))
    if params:
        pl.update(params)
    keep, sub, keep_st = _LOD[lod]
    m = K.Mesh()
    tones = []
    for sp in pl["spikes"][:keep]:
        first = len(m.v)
        _add_spike(m, sp, _RINGS[lod])
        tones += [0.56 + 0.10 * sp["tone"]] * (len(m.v) - first)
    for st in pl["stones"][:keep_st]:
        first, last = K.fractured_stone(m, sub, st["pos"], st["r"], st["sq"], st["yaw"],
                                        st["cuts"], st["tone"])
        tones += [0.58 + 0.10 * st["tone"]] * (last - first)
    # Colour from what each vertex looks at: dusk only toward the sky, rock mid on the
    # flanks, deep shadow toward and near the ground.
    for i, nrm in enumerate(K.vertex_normals(m)):
        ground = 1.0 - K.smooth(m.v[i][2] / 0.6)
        m.c[i] = K.ramp(K.ROCK, K.rock_tone(nrm[2], tones[i], ground))
    ob = m.to_object(f"{NAME}_s{int(seed)}_lod{lod}", NAME, smooth_shade=False)
    ob["seed"] = int(seed)
    ob["lod"] = lod
    return ob


inward_faces = K.inward_faces


def metrics(seed, lod=0):
    pl = plan(int(seed))
    xs, ys = [], []
    for sp in pl["spikes"]:
        a, _, _ = _frame(sp)
        reach = sp["r"] * max(sp["radii"]) * max(1.0, sp["flat"])
        for f in (0.0, 0.5, 1.0):
            c = _centre(sp, a, f)
            rr = reach * _taper(f)
            xs += [c[0] - rr, c[0] + rr]
            ys += [c[1] - rr, c[1] + rr]
    for st in pl["stones"]:
        xs += [st["pos"][0] - st["r"], st["pos"][0] + st["r"]]
        ys += [st["pos"][1] - st["r"], st["pos"][1] + st["r"]]
    hs = [sp["h"] for sp in pl["spikes"]]
    rest = sorted(hs)[:-1]
    return {
        "seed": int(seed),
        "width": round(max(max(xs) - min(xs), max(ys) - min(ys)), 3),
        "height": round(max(hs), 3),
        "spikes": len(pl["spikes"]),
        "lean": round(sum(math.degrees(sp["lean"]) for sp in pl["spikes"]) / len(hs), 2),
        "dominance": round(max(hs) / (sum(rest) / len(rest)), 3),
        # 1 when every spike leans the same way (a sheared outcrop), near 0 when they
        # splay out radially (a burst): the mean of their lean directions, weighted by lean.
        "sweep": round(math.hypot(sum(math.sin(sp["lean"]) * math.cos(sp["az"]) for sp in pl["spikes"]),
                                  sum(math.sin(sp["lean"]) * math.sin(sp["az"]) for sp in pl["spikes"]))
                       / sum(math.sin(sp["lean"]) for sp in pl["spikes"]), 3),
        "stones": len(pl["stones"]),
        "bias": round(pl["bias"], 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
