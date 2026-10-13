"""Shared pieces for the canopy tree generators (flora/conifer, flora/fanpalm,
flora/windtwisted; ROADMAP M5b). Not a generator itself; nothing here draws a random number.

`flora/broadleaf.py` predates this file and keeps its own copies, so its committed bytes do
not move. The pieces here follow broadleaf's choices exactly where it made one:

- one mesh, one material, colour in one vertex-colour layer, smooth shading on low-poly
  geometry (the facets come from the vertex count, not from split normals);
- bark is the one `bark` surface, foliage the `canopyDark -> canopyMid -> canopyLight` ramp
  as a quadratic Bezier through exactly those three stops (tools/variant-probe.mjs, A2).

Every primitive here is a **closed, outward-wound shell**: tubes are capped at both ends,
blobs have both poles, and thick sheets (`thick_grid`) are a top skin, a bottom skin and
the side walls stitched between them. Nothing is a zero-thickness plane, so every edge has
exactly two faces (`topology`).

Bark is lifted above broadleaf's range (x1.06..1.42 of `#4a3b2f` in linear light, plus a
small warm share of `dusk`): the art-critic saw generated trunks render near-black in game.
That stays well inside the probe's ΔE 12 for a surface.
"""
import math

import bpy  # before bmesh: bmesh only imports once bpy has initialised
import bmesh  # noqa: E402

PALETTE = {
    "bark": "#4a3b2f",
    "canopyDark": "#1e4a21",
    "canopyMid": "#3f8a33",
    "canopyLight": "#8fd24a",
}
PALETTE_ROLES = {"surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]}
BUDGET = {"lod0": 6000, "lod1": 2000, "lod2": 500}

GOLDEN = 0.6180339887498949
PLASTIC = 0.7548776662466927
SQRT2M1 = 0.4142135623730951
#: The golden sequence nearly repeats at seed gaps of 3, 5 and 8, so a second stratified
#: axis on sqrt(2) - 1 or the plastic number can leave a gap-5 pair alike on both. These
#: two put gap-3 and gap-5 pairs far apart, and are still low-discrepancy.
PHI_M4 = 0.1458980337503155          # golden ratio ** -4
SQRT3M1 = 0.7320508075688772


# ---------------------------------------------------------------- small vector math
def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def length(a):
    return math.sqrt(dot(a, a))


def norm(a):
    n = length(a)
    return (0.0, 0.0, 1.0) if n < 1e-12 else (a[0] / n, a[1] / n, a[2] / n)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def smoothstep(t):
    t = clamp01(t)
    return t * t * (3.0 - 2.0 * t)


def from_angles(az, elev):
    """Unit direction from an azimuth (about +z, from +x) and an elevation above horizontal."""
    ce = math.cos(elev)
    return (math.cos(az) * ce, math.sin(az) * ce, math.sin(elev))


def stratify(seed, irrational, jitter, rng):
    """Low-discrepancy stratification of one axis on the seed (see flora/broadleaf.py)."""
    base = (seed * irrational) % 1.0
    return (base + rng.range(-jitter, jitter)) % 1.0


def param(params, name, t):
    lo, hi, _ = params[name]
    return lo + (hi - lo) * t


# ---------------------------------------------------------------- colour
def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


BARK = hex_linear(PALETTE["bark"])
DARK = hex_linear(PALETTE["canopyDark"])
MID = hex_linear(PALETTE["canopyMid"])
LIGHT = hex_linear(PALETTE["canopyLight"])
_DUSK = hex_linear("#844e32")          # ART_BIBLE dusk: a warm share keeps bark brown


def foliage(t):
    """dark -> mid -> light as a quadratic Bezier of exactly those three stops (C1, so the
    knee never draws a waterline; broadleaf's `_foliage_ramp`)."""
    s = clamp01(t)
    u = 1.0 - s
    wd, wm, wl = u * u, 2.0 * s * u, s * s
    return tuple(DARK[k] * wd + MID[k] * wm + LIGHT[k] * wl for k in range(3))


def bark(t):
    """The bark surface. `t` 0..1 moves brightness between x1.06 and x1.42 of `#4a3b2f`
    with 12% of dusk mixed in: brown under any light, worst ΔE about 7 from the swatch."""
    s = 1.06 + 0.36 * clamp01(t)
    return tuple((BARK[k] * 0.88 + _DUSK[k] * 0.12) * s for k in range(3))


# ---------------------------------------------------------------- mesh accumulator
class Mesh:
    """Vertex/face/colour lists, turned into one object at the end (broadleaf's pattern)."""

    def __init__(self):
        self.v, self.c, self.f = [], [], []

    def vert(self, p, col):
        self.v.append((p[0], p[1], p[2]))
        self.c.append(col)
        return len(self.v) - 1

    def face(self, idx):
        self.f.append(tuple(idx))

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def to_object(self, name, material_name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.validate(verbose=False)
        for poly in me.polygons:
            poly.use_smooth = True
        layer = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        for i, col in enumerate(self.c):
            layer.data[i].color = (col[0], col[1], col[2], 1.0)
        me.update()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(material(material_name))
        bpy.context.collection.objects.link(ob)
        return ob


def material(name):
    """One material for the whole tree, base colour from the vertex colours (broadleaf's)."""
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- primitives
def frames(path):
    """Rotation-minimising frames along a polyline, so tubes do not twist."""
    n = len(path)
    tangents = []
    for i in range(n):
        if i == 0:
            t = sub(path[1], path[0])
        elif i == n - 1:
            t = sub(path[-1], path[-2])
        else:
            t = sub(path[i + 1], path[i - 1])
        tangents.append(norm(t))
    ref = (0.0, 0.0, 1.0)
    if abs(dot(tangents[0], ref)) > 0.9:
        ref = (1.0, 0.0, 0.0)
    u = norm(cross(tangents[0], ref))
    out = []
    for t in tangents:
        u = sub(u, mul(t, dot(u, t)))
        if length(u) < 1e-6:
            u = cross(t, (1.0, 0.0, 0.0) if abs(t[2]) > 0.9 else (0.0, 0.0, 1.0))
        u = norm(u)
        out.append((u, norm(cross(t, u))))
    return out


def tube(mesh, path, radii, sides, colour_fn, lobe_fn=None):
    """A ring of `sides` swept along `path`, capped at both ends: a closed shell.
    `colour_fn(u, m)` colours a vertex at path fraction u with radius multiplier m;
    `lobe_fn(u, theta)` optionally modulates the radius (flare, ridges, rings)."""
    fr = frames(path)
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        u = i / max(1, len(path) - 1)
        fu, fv = fr[i]
        ring = []
        for s in range(sides):
            th = 2.0 * math.pi * s / sides
            m = 1.0 if lobe_fn is None else lobe_fn(u, th)
            q = add(p, add(mul(fu, r * m * math.cos(th)), mul(fv, r * m * math.sin(th))))
            ring.append(mesh.vert(q, colour_fn(u, m)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for s in range(sides):
            t = (s + 1) % sides
            mesh.face((a[s], a[t], b[t], b[s]))
    base, top = rings[0], rings[-1]
    for s in range(1, sides - 1):
        mesh.face((base[0], base[s + 1], base[s]))
        mesh.face((top[0], top[s], top[s + 1]))
    return rings


def blob(mesh, seg, rings, place):
    """A closed UV-sphere shell. `place(d)` maps a unit direction to (point, colour); the
    shape is a function of direction, so it is the same at every LOD (broadleaf's lobe)."""
    def vert(d):
        p, col = place(d)
        return mesh.vert(p, col)

    top = vert((0.0, 0.0, 1.0))
    bot = vert((0.0, 0.0, -1.0))
    loops = []
    for j in range(1, rings):
        phi = math.pi * j / rings
        sp, cp = math.sin(phi), math.cos(phi)
        loops.append([vert((sp * math.cos(2.0 * math.pi * s / seg),
                            sp * math.sin(2.0 * math.pi * s / seg), cp)) for s in range(seg)])
    for s in range(seg):
        t = (s + 1) % seg
        mesh.face((top, loops[0][s], loops[0][t]))
        mesh.face((bot, loops[-1][t], loops[-1][s]))
    for j in range(len(loops) - 1):
        a, b = loops[j], loops[j + 1]
        for s in range(seg):
            t = (s + 1) % seg
            mesh.face((a[s], b[s], b[t], a[t]))


def revolve(mesh, profile, sides, place):
    """A closed shell of revolution with a pole at each end. `profile` is a list of
    (rho, z) from the top pole (rho 0) round the rim and back to the bottom pole (rho 0);
    `place(k, theta, rho, z)` returns (point, colour) for profile index k at angle theta.
    The profile must run top -> rim -> bottom so the winding comes out outward."""
    top = mesh.vert(*place(0, 0.0, profile[0][0], profile[0][1]))
    bot_k = len(profile) - 1
    bot = mesh.vert(*place(bot_k, 0.0, profile[bot_k][0], profile[bot_k][1]))
    loops = []
    for k in range(1, bot_k):
        rho, z = profile[k]
        loops.append([mesh.vert(*place(k, 2.0 * math.pi * s / sides, rho, z))
                      for s in range(sides)])
    for s in range(sides):
        t = (s + 1) % sides
        mesh.face((top, loops[0][s], loops[0][t]))
        mesh.face((bot, loops[-1][t], loops[-1][s]))
    for j in range(len(loops) - 1):
        a, b = loops[j], loops[j + 1]
        for s in range(sides):
            t = (s + 1) % sides
            mesh.face((a[s], b[s], b[t], a[t]))


def thick_grid(mesh, pts, normals, thick, col_top, col_bot):
    """A thin solid sheet: a rows x cols grid of points offset +-thick/2 along `normals`,
    as a top skin, a bottom skin and the walls round the boundary. Closed, outward-wound,
    never a zero-thickness plane. `thick[i][j]`, `col_top[i][j]`, `col_bot[i][j]` per point.
    `normals` say which side is "top"; the winding is chosen to agree with them."""
    R, C = len(pts), len(pts[0])
    T = [[mesh.vert(add(pts[i][j], mul(normals[i][j], 0.5 * thick[i][j])), col_top[i][j])
          for j in range(C)] for i in range(R)]
    B = [[mesh.vert(sub(pts[i][j], mul(normals[i][j], 0.5 * thick[i][j])), col_bot[i][j])
          for j in range(C)] for i in range(R)]
    # Which cyclic order makes du x dv agree with the declared normal?
    vote = 0.0
    for i in range(R - 1):
        for j in range(C - 1):
            du = sub(pts[i + 1][j], pts[i][j])
            dv = sub(pts[i][j + 1], pts[i][j])
            vote += dot(cross(du, dv), normals[i][j])
    flip = vote < 0.0
    edges = {}
    for i in range(R - 1):
        for j in range(C - 1):
            cyc = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if flip:
                cyc.reverse()
            mesh.face(tuple(T[a][b] for a, b in cyc))
            mesh.face(tuple(B[a][b] for a, b in reversed(cyc)))
            for k in range(4):
                edges[(cyc[k], cyc[(k + 1) % 4])] = True
    # Walls: every directed top edge whose reverse is not a top edge is on the boundary.
    for (x, y) in sorted(edges):
        if (y, x) in edges:
            continue
        mesh.face((T[y[0]][y[1]], T[x[0]][x[1]], B[x[0]][x[1]], B[y[0]][y[1]]))


def grid_normals(pts, up_hint):
    """Per-point normals of a grid from central differences, turned to face `up_hint(i, j)`."""
    R, C = len(pts), len(pts[0])
    out = []
    for i in range(R):
        row = []
        for j in range(C):
            du = sub(pts[min(R - 1, i + 1)][j], pts[max(0, i - 1)][j])
            dv = sub(pts[i][min(C - 1, j + 1)], pts[i][max(0, j - 1)])
            n = norm(cross(du, dv))
            if dot(n, up_hint(i, j)) < 0.0:
                n = mul(n, -1.0)
            row.append(n)
        out.append(row)
    return out


def catmull(points, per_seg):
    """Centripetal-free uniform Catmull-Rom through `points`, `per_seg` samples a span."""
    n = len(points)
    out = []
    for k in range(n - 1):
        p0 = points[max(0, k - 1)]
        p1, p2 = points[k], points[k + 1]
        p3 = points[min(n - 1, k + 2)]
        for s in range(per_seg):
            t = s / per_seg
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2.0 * p1[c] + (-p0[c] + p2[c]) * t
                                    + (2.0 * p0[c] - 5.0 * p1[c] + 4.0 * p2[c] - p3[c]) * t2
                                    + (-p0[c] + 3.0 * p1[c] - 3.0 * p2[c] + p3[c]) * t3)
                             for c in range(3)))
    out.append(points[-1])
    return out


# ---------------------------------------------------------------- checks
def inward_faces(ob):
    """How many faces bmesh would flip to make the mesh consistently outward. 0 is right."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    before = [tuple(round(c, 6) for c in f.normal) for f in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    after = [tuple(round(c, 6) for c in f.normal) for f in bm.faces]
    flipped = sum(1 for a, b in zip(before, after) if a != b)
    bm.free()
    return flipped


def topology(ob):
    """Open edges (one face), non-manifold edges (three or more), the number of shells
    (face-connected pieces) and the smallest signed shell volume. A closed, outward tree
    has 0, 0, n and a positive minimum."""
    me = ob.data
    count = {}
    for poly in me.polygons:
        vs = list(poly.vertices)
        for k in range(len(vs)):
            a, b = vs[k], vs[(k + 1) % len(vs)]
            key = (a, b) if a < b else (b, a)
            count[key] = count.get(key, 0) + 1
    open_e = sum(1 for c in count.values() if c == 1)
    nonman = sum(1 for c in count.values() if c > 2)
    parent = list(range(len(me.vertices)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for (a, b) in count:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    vol = {}
    co = [v.co for v in me.vertices]
    for poly in me.polygons:
        vs = list(poly.vertices)
        a = co[vs[0]]
        for k in range(1, len(vs) - 1):
            b, c = co[vs[k]], co[vs[k + 1]]
            v6 = (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x)
                  + a.z * (b.x * c.y - b.y * c.x))
            r = find(vs[0])
            vol[r] = vol.get(r, 0.0) + v6 / 6.0
    return {"open": open_e, "nonManifold": nonman, "shells": len(vol),
            "minVolume": min(vol.values()) if vol else 0.0}


# ---------------------------------------------------------------- M5c additions
# Additive only: nothing above this line changed, so the M5b trees' bytes do not move.

def bark_shade(s):
    """The bark surface at an explicit brightness multiplier `s` (clamped 0.36..1.55), with
    `bark`'s 12% dusk. Below `bark`'s floor for the insides of hollows and seams, above it
    for sunlit buttress ridges. Worst ΔE from `#4a3b2f` about 10.9 at the floor, 10.5 at
    the top."""
    s = 0.36 if s < 0.36 else (1.55 if s > 1.55 else s)
    return tuple((BARK[k] * 0.88 + _DUSK[k] * 0.12) * s for k in range(3))


def weathered(t):
    """Dead, sun-bleached wood on the bark surface: 35% of the way to a neutral grey of the
    same luminance, 8% dusk, brightness x1.12..1.70 of `#4a3b2f` as `t` goes 0..1. Grey-brown
    rather than brown, and lighter, but never more than ΔE 10.3 from the swatch."""
    s = 1.12 + 0.58 * clamp01(t)
    base = tuple(BARK[k] * 0.92 + _DUSK[k] * 0.08 for k in range(3))
    y = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    return tuple((base[k] * 0.65 + y * 0.35) * s for k in range(3))


def cloud(mesh, lb, seg, rings, zrange, tone, lump_scale=1.0):
    """One foliage mass, broadleaf's `_lobe`: a lumpy, squashed sphere whose underside hangs
    a little. `lb` holds c (centre), r, squash, droop, lumps and bumps [(unit dir, amp)].
    Lumps only push outward, and the shape is a function of direction, so it is the same
    at every LOD. Colour runs the foliage ramp by normal and by height in `zrange`."""
    cx, cy, cz = lb["c"]
    R, sq, droop = lb["r"], lb["squash"], lb["droop"]
    amp = lb["lumps"] * lump_scale
    z0, z1 = zrange
    nk = 1.0 + amp * 0.46

    def place(d):
        m = 1.0
        for ax, a in lb["bumps"]:
            m += amp * a * max(0.0, dot(d, ax)) ** 1.8
        m /= nk
        r = R * m
        x, y, z = d[0] * r, d[1] * r, d[2] * r * sq
        if d[2] < 0.0:
            sag = (-d[2]) ** 1.5
            z -= droop * R * sag
            x *= 1.0 + droop * 0.30 * sag
            y *= 1.0 + droop * 0.30 * sag
        p = (cx + x, cy + y, cz + z)
        th = (0.64 * (0.5 + 0.5 * d[2])
              + 0.30 * clamp01((p[2] - z0) / max(1e-6, z1 - z0))
              + max(-0.10, min(0.10, 0.26 * (m - 1.0))))
        return p, foliage(clamp01(clamp01(th) ** 1.26 * tone * lb.get("tone", 1.0)))

    blob(mesh, seg, rings, place)


def cloud_bottom(lb):
    """Lowest z a `cloud` can reach (its hanging underside), for ground clearance."""
    return lb["c"][2] - lb["r"] * (lb["squash"] + lb["droop"])


def merge_clouds(lobes, target):
    """Collapse `cloud` lobes into at most `target`, keeping the envelope: farthest-point
    seeds from the largest, nearest-seed groups, one lobe covering each group (broadleaf's
    `_merge_lobes`, so a crown lobe never merges with one on the far side)."""
    if len(lobes) <= target:
        return list(lobes)
    order = sorted(range(len(lobes)), key=lambda i: -lobes[i]["r"])
    seeds = [order[0]]
    while len(seeds) < target:
        best, bd = None, -1.0
        for i in range(len(lobes)):
            if i in seeds:
                continue
            d = min(length(sub(lobes[i]["c"], lobes[s]["c"])) for s in seeds)
            if d > bd:
                best, bd = i, d
        seeds.append(best)
    groups = {s: [] for s in seeds}
    for i in range(len(lobes)):
        s = min(seeds, key=lambda k: (length(sub(lobes[i]["c"], lobes[k]["c"])), k))
        groups[s].append(lobes[i])
    out = []
    for s in seeds:
        g = groups[s]
        if len(g) == 1:
            out.append(g[0])
            continue
        w = [lb["r"] ** 3 * lb["squash"] for lb in g]
        tw = sum(w)
        cen = tuple(sum(lb["c"][k] * wi for lb, wi in zip(g, w)) / tw for k in range(3))
        r = max(math.hypot(lb["c"][0] - cen[0], lb["c"][1] - cen[1]) + lb["r"] for lb in g)
        top = max(lb["c"][2] + lb["r"] * lb["squash"] for lb in g)
        bot = min(cloud_bottom(lb) for lb in g)
        r *= 0.90
        main = max(g, key=lambda lb: lb["r"])
        droop = main["droop"]
        sq = max(0.3, ((top - bot) / r - droop) * 0.5 * 0.95)
        cz = top - r * sq * 0.97
        out.append({"c": (cen[0], cen[1], cz), "r": r, "squash": sq, "droop": droop,
                    "lumps": main["lumps"], "bumps": main["bumps"],
                    "tone": main.get("tone", 1.0)})
    return out


# ---------------------------------------------------------------- M5e additions
# Additive only: nothing above this line changed, so earlier generators' bytes do not move.

def ramp3(a, b, c, t):
    """Quadratic Bezier through three linear-light stops: the probe's ramp curve for any
    three palette entries (`foliage` is this with the canopy stops)."""
    s = clamp01(t)
    u = 1.0 - s
    return tuple(a[k] * u * u + b[k] * 2.0 * s * u + c[k] * s * s for k in range(3))


def lobed_patch(mesh, centre, sides, rings, radius_fn, top_fn, bottom_z, bottom_col):
    """A closed, flat-bottomed thin solid over a star-shaped footprint: ground cover that
    is never a zero-thickness plane.

    `radius_fn(theta)` is the footprint's edge distance from `centre` (x, y) at angle theta;
    `top_fn(f, theta)` returns (z, colour) for the top surface at fraction f (0 centre ..
    1 edge) of that distance. The top is a pole plus `rings` rings, the edge is a short
    wall down to `bottom_z`, and the bottom is one flat fan in `bottom_col(theta)`.
    Outward-wound: the top faces up, the wall out, the bottom down."""
    cx, cy = centre
    z0, c0 = top_fn(0.0, 0.0)
    pole = mesh.vert((cx, cy, z0), c0)
    loops = []
    for i in range(1, rings + 1):
        f = i / rings
        ring = []
        for s in range(sides):
            th = 2.0 * math.pi * s / sides
            r = radius_fn(th) * f
            z, col = top_fn(f, th)
            ring.append(mesh.vert((cx + r * math.cos(th), cy + r * math.sin(th), z), col))
        loops.append(ring)
    base = []
    for s in range(sides):
        th = 2.0 * math.pi * s / sides
        r = radius_fn(th)
        base.append(mesh.vert((cx + r * math.cos(th), cy + r * math.sin(th), bottom_z),
                              bottom_col(th)))
    bpole = mesh.vert((cx, cy, bottom_z), bottom_col(0.0))
    for s in range(sides):
        t = (s + 1) % sides
        mesh.face((pole, loops[0][s], loops[0][t]))
        for j in range(rings - 1):
            a, b = loops[j], loops[j + 1]
            mesh.face((a[s], b[s], b[t], a[t]))
        top = loops[-1]
        mesh.face((top[s], base[s], base[t], top[t]))
        mesh.face((bpole, base[t], base[s]))
