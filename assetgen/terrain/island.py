"""C1 island — a seeded floating sky-island (docs/ASSET_PLAN.md §C, ROADMAP M4a).

A generator, not a model. `build(seed, lod)` returns one closed Blender object: a grass
or rock deck, a cliff band of rock strata under its lip, and an underside that tapers to a
point, the shape every island in docs/concept/03-island-scene.png hangs in the sky with.
Every vertex comes from a parameter drawn from the seeded `Rng` in `assetgen/genome.py`.
Nothing is hand-placed; there is no wall clock and no unseeded `random`.

Construction order (the broadleaf pattern, assetgen/flora/broadleaf.py)
-----------------------------------------------------------------------
1. `plan(seed)` draws the whole island as data and functions of position. Every random
   draw happens there, in a fixed order, so LOD2 of seed 3 is the same island as LOD0.
2. `build(seed, lod)` tessellates that plan on a polar grid at the LOD's resolution.

What varies (the five things C1 names)
--------------------------------------
- **shape**: an outline r(theta) from low harmonics on an ellipse of random elongation;
- **size**: base radius;
- **biome**: meadow, highland or steppe. It is stratified on the seed like broadleaf's
  `form`, so any eight consecutive seeds see all three. Biome sets the deck's colour
  ramp, how much rock breaks through, and how terraced the deck is;
- **edge erosion**: bites taken out of the outline, and ledges in the cliff band;
- **underside**: depth, taper profile (convex bowl to needle), lean, and rock lumps.

Colour
------
Every vertex colour sits on one of two ramps (quadratic Beziers through three
docs/ART_BIBLE.md §Palette stops, as broadleaf's canopy), in one vertex-colour layer, so the island is one material and one draw call:
  grass  foliage dark #1e4a21 -> foliage mid #3f8a33 -> foliage light #8fd24a
  rock   dusk #844e32 -> rock mid #5a4a40 -> deep shadow #1a1420
The rock ramp runs from the warm lit lip of the cliff ("dusk ... island undersides") through
rock mid into the deep shadow the bible gives "underside of islands". `tools/variant-probe.mjs` holds every vertex to within
ΔE 3 of its ramp.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402  (path must be set first)

import bpy  # noqa: E402
import bmesh  # noqa: E402

# ---------------------------------------------------------------- identity
FAMILY = "terrain"
NAME = "island"
ASSET_ID = f"{FAMILY}/{NAME}"

#: The seed whose mesh is committed under public/assets/.
SEED_FOR_COMMITTED = 1

#: Triangle ceilings per LOD. An island is a hero prop: one per sky-island, so LOD0 can
#: spend more than a tree (broadleaf 6000) on its deck and underside.
BUDGET = {"lod0": 8000, "lod1": 2500, "lod2": 700}

PALETTE = {
    "grassDark": "#1e4a21",
    "grassMid": "#3f8a33",
    "grassLight": "#8fd24a",
    "rockMid": "#5a4a40",
    "dusk": "#844e32",
    "deepShadow": "#1a1420",
}

#: How tools/variant-probe.mjs judges the shipped colours (rubric A2). Surfaces are held to
#: ΔE 12 of one colour; a ramp is a gradient held to ΔE 3 of its line through the stops.
PALETTE_ROLES = {
    "surfaces": [],
    "ramps": [["grassDark", "grassMid", "grassLight"], ["dusk", "rockMid", "deepShadow"]],
}

#: The variant probe's A4 axes: two seeds fail as a pair if within 8 % on every one.
METRIC_AXES = ["width", "depth", "relief", "roughness", "taper"]

#: How assetgen/render_all.py frames the 8-seed sheet: the metric that is an island's
#: footprint, how far it reaches down, and a camera that sees the deck from above.
SHEET = {"widthKey": "width", "topKey": "top", "bottomKey": "bottom", "rx": 62.0, "ground": False}

BIOMES = ("meadow", "highland", "steppe")

# ---------------------------------------------------------------- parameters
#: name -> (lo, hi, what it does). Every number the mesh is built from is here.
PARAMS = {
    "biome": (0.0, 1.0, "stratified on the seed: <1/3 meadow, <2/3 highland, else steppe"),
    # --- shape and size ---
    "radius": (3.0, 6.2, "base radius of the deck, metres"),
    "elongation": (1.0, 1.65, "ellipse ratio of the outline"),
    "heading": (0.0, 6.2831853, "radians; the long axis's direction"),
    "lobing": (0.03, 0.15, "amplitude of the outline's low harmonics (2..5)"),
    # --- edge erosion ---
    "bites": (1, 6, "bites eroded out of the outline"),
    "biteDepth": (0.07, 0.24, "how deep a bite cuts, in radii"),
    "biteWidth": (0.16, 0.42, "angular half-width of a bite, radians"),
    "cliff": (0.35, 1.05, "height of the cliff band under the deck's lip, metres"),
    "ledges": (0.04, 0.16, "how far the cliff's strata step in and out, in radii"),
    # --- deck relief ---
    "hill": (0.15, 1.25, "height of the deck's rise, metres"),
    "hillOffset": (0.0, 0.45, "how far the high ground sits off centre, in radii"),
    "terraces": (0, 3, "terrace steps on the deck (biome raises the count)"),
    "bumps": (0.02, 0.12, "small undulation of the deck, metres per metre of radius"),
    # --- underside ---
    "depth": (0.85, 2.3, "underside depth below the cliff, in radii"),
    "taper": (0.55, 1.9, "taper exponent: <1 a full bowl, >1 a needle"),
    "lean": (0.0, 0.35, "tip offset from the axis, in radii"),
    "lumps": (0.05, 0.22, "angular rock lumps on the underside, in radii"),
}

_LOD = {
    0: {"seg": 96, "rings": 14, "cliff": 4, "under": 12},
    1: {"seg": 48, "rings": 8, "cliff": 2, "under": 6},
    2: {"seg": 20, "rings": 3, "cliff": 1, "under": 3},
}


# ---------------------------------------------------------------- small maths
def _lerp(a, b, t):
    return a + (b - a) * t


def _clamp01(x):
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def _smooth(t):
    t = _clamp01(t)
    return t * t * (3.0 - 2.0 * t)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_linear(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def _ramp(stops, t):
    """A palette ramp: the quadratic Bezier through three stops in linear RGB, t in 0..1.
    The same curve broadleaf's canopy uses, so tools/variant-probe.mjs judges every ramp
    by one rule."""
    t = _clamp01(t)
    a, b, c = (_hex_linear(PALETTE[s]) for s in stops)
    u = 1.0 - t
    return tuple(u * u * a[k] + 2.0 * t * u * b[k] + t * t * c[k] for k in range(3))


GRASS = ("grassDark", "grassMid", "grassLight")
ROCK = ("dusk", "rockMid", "deepShadow")


def _stratify(seed, irrational, jitter, rng):
    """Low-discrepancy stratification of one axis on the seed (see broadleaf)."""
    base = ((seed * irrational) % 1.0)
    return (base + rng.range(-jitter, jitter)) % 1.0


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


# ---------------------------------------------------------------- the plan
def plan(seed):
    """Draw the whole island. Returns a dict of numbers and closures of position."""
    r = Rng(int(seed))
    pl = {"seed": int(seed)}
    # The golden ratio's fractional part: any 8 consecutive seeds land in all 3 biomes.
    pl["biomeT"] = _stratify(int(seed), 0.6180339887498949, 0.05, r)
    biome = BIOMES[min(2, int(pl["biomeT"] * 3.0))]
    pl["biome"] = biome

    u = {k: r.range(0.0, 1.0) for k in (
        "radius", "elongation", "heading", "lobing", "biteDepth", "biteWidth", "cliff",
        "ledges", "hill", "hillOffset", "bumps", "depth", "taper", "lean", "lumps")}
    R = _p("radius", u["radius"])
    elong = _p("elongation", u["elongation"])
    heading = _p("heading", u["heading"])
    lobing = _p("lobing", u["lobing"])
    harmonics = [(k, lobing * r.range(0.35, 1.0) / (k - 1), r.range(0.0, 2.0 * math.pi)) for k in (2, 3, 4, 5)]

    nbites = r.int(int(PARAMS["bites"][0]), int(PARAMS["bites"][1]))
    bite_depth = _p("biteDepth", u["biteDepth"])
    bite_width = _p("biteWidth", u["biteWidth"])
    bites = []
    for _ in range(nbites):
        bites.append((r.range(0.0, 2.0 * math.pi), bite_depth * r.range(0.45, 1.0),
                      bite_width * r.range(0.6, 1.2)))

    def outline(theta):
        """Deck radius at angle theta: ellipse, harmonics, then erosion bites."""
        a = theta - heading
        ell = 1.0 / math.sqrt((math.cos(a) / elong) ** 2 + math.sin(a) ** 2) * math.sqrt(elong)
        h = 1.0 + sum(amp * math.cos(k * theta + ph) for k, amp, ph in harmonics)
        bite = 0.0
        for c, d, w in bites:
            dt = math.atan2(math.sin(theta - c), math.cos(theta - c))
            bite = max(bite, d * math.exp(-(dt / w) ** 2))
        return R * ell * h * (1.0 - bite)

    # --- deck relief ---
    hill = _p("hill", u["hill"]) * {"meadow": 0.8, "highland": 1.45, "steppe": 0.55}[biome]
    off = _p("hillOffset", u["hillOffset"]) * R
    off_a = r.range(0.0, 2.0 * math.pi)
    hx, hy = off * math.cos(off_a), off * math.sin(off_a)
    terraces = r.int(0, 3) + {"meadow": 0, "highland": 1, "steppe": 0}[biome]
    bumps = _p("bumps", u["bumps"]) * R
    waves = [(r.range(0.6, 2.4) / R, r.range(0.0, 2.0 * math.pi), r.range(0.0, 2.0 * math.pi),
              r.range(0.5, 1.0)) for _ in range(5)]

    def field(x, y):
        """Small undulation, a sum of plane waves. Also drives where rock shows."""
        return sum(amp * math.sin(f * (x * math.cos(d) + y * math.sin(d)) + ph)
                   for f, d, ph, amp in waves) / 3.0

    def deck(x, y, rho):
        """Height of the deck at (x, y); rho is the fraction of the way to the rim."""
        dx, dy = x - hx, y - hy
        dome = math.exp(-(dx * dx + dy * dy) / (0.55 * R) ** 2)
        hgt = hill * dome
        if terraces:
            # Soft steps: quantise the dome, then blend each step's riser over 30 %.
            steps = hgt / hill * terraces if hill > 0 else 0.0
            base = math.floor(steps)
            hgt = hill * (base + _smooth((steps - base - 0.35) / 0.3)) / terraces
        lip = 1.0 - _smooth((rho - 0.82) / 0.18) * 0.35  # the deck rolls over at the rim
        return hgt * lip + bumps * field(x, y) * (1.0 - rho * 0.6)

    rock_share = {"meadow": 0.18, "highland": 0.52, "steppe": 0.80}[biome]

    def deck_colour(x, y, rho, z):
        """Grass ramp by height and exposure, rock where the field and biome let it out."""
        f = field(x * 1.7 + 3.1, y * 1.7 - 1.3)
        rocky = _smooth((f + 0.35 - (1.0 - rock_share) * 0.7) / 0.18) * (0.35 + 0.65 * rho)
        # Capped at 0.74: the light stop on a whole hilltop read as a glowing blob (run 15).
        t = min(0.74, _clamp01(0.30 + 0.42 * (z / max(0.2, hill)) + 0.18 * f - 0.22 * rho))
        if biome == "steppe":
            t *= 0.55
        if rocky > 0.5:
            return _ramp(ROCK, 0.42 + 0.22 * (1.0 - t))   # rock mid, a little darker low down
        return _ramp(GRASS, t)

    # --- cliff band and underside ---
    cliff = _p("cliff", u["cliff"]) * (1.25 if biome == "highland" else 1.0)
    ledges = _p("ledges", u["ledges"])
    ledge_ph = [r.range(0.0, 2.0 * math.pi) for _ in range(4)]
    depth = _p("depth", u["depth"]) * R
    taper = _p("taper", u["taper"])
    lean = _p("lean", u["lean"]) * R
    lean_a = r.range(0.0, 2.0 * math.pi)
    lumps = _p("lumps", u["lumps"])
    lump_k = [(r.int(3, 9), r.range(0.0, 2.0 * math.pi), r.range(0.4, 1.0)) for _ in range(3)]
    # Fine facets: higher harmonics whose phase drifts with depth, so the underside reads as
    # broken rock rather than a lathe-turned cone.
    facet_k = [(r.int(11, 23), r.range(0.0, 2.0 * math.pi), r.range(2.0, 6.0)) for _ in range(2)]

    def cliff_scale(v, theta):
        """Radius multiplier down the cliff band, v in 0..1: strata stepping in and out."""
        step = sum(math.sin(theta * (2 + i) + ledge_ph[i] + v * 5.0) for i in range(2)) * 0.5
        return 1.0 - ledges * (0.25 + 0.75 * v) * (0.5 + 0.5 * step)

    def under(v, theta):
        """Underside at depth fraction v (0 = cliff foot, 1 = tip): radius scale, (x, y) offset, z."""
        s = (1.0 - v) ** taper
        lump = 1.0 + lumps * sum(a * math.sin(k * theta + ph) for k, ph, a in lump_k) / 2.0 * (1.0 - v)
        lump += 0.05 * sum(math.sin(k * theta + ph + drift * v) for k, ph, drift in facet_k) * (1.0 - v)
        ox, oy = lean * v * v * math.cos(lean_a), lean * v * v * math.sin(lean_a)
        return s * lump, (ox, oy), -cliff - depth * v

    pl.update({
        "radius": R, "elongation": elong, "outline": outline, "deck": deck,
        "deckColour": deck_colour, "hill": hill, "terraces": terraces, "cliff": cliff,
        "cliffScale": cliff_scale, "under": under, "depth": depth, "taper": taper,
        "lean": lean, "lumps": lumps, "bites": nbites,
    })
    return pl


# ---------------------------------------------------------------- mesh accumulator
class _Mesh:
    """Vertex/face/colour lists, turned into one object at the end (as broadleaf's)."""

    def __init__(self):
        self.v, self.c, self.f = [], [], []

    def vert(self, p, col):
        self.v.append((p[0], p[1], p[2]))
        self.c.append(col)
        return len(self.v) - 1

    def face(self, idx):
        self.f.append(tuple(idx))

    def to_object(self, name):
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
        ob.data.materials.append(_material())
        bpy.context.collection.objects.link(ob)
        return ob


def _material():
    """One material for the whole island: base colour from the vertex colours."""
    existing = bpy.data.materials.get("island")
    if existing is not None:
        return existing
    mat = bpy.data.materials.new("island")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.86
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.10
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- build
def build(seed, lod=0, params=None):
    """Build one island. Returns the Blender object, linked into the active collection.

    The surface is one closed polar grid, wound outward: a pole at the deck's centre, deck
    rings out to the rim, the cliff band down from the rim, underside rings down to a pole
    at the tip. Every ring has `seg` vertices and the rings share their seams, so there is
    no hole and no duplicated rim.
    """
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)
    seg, nr, nc, nu = cfg["seg"], cfg["rings"], cfg["cliff"], cfg["under"]
    thetas = [2.0 * math.pi * j / seg for j in range(seg)]
    rim = [pl["outline"](t) for t in thetas]
    mesh = _Mesh()

    centre_z = pl["deck"](0.0, 0.0, 0.0)
    top_pole = mesh.vert((0.0, 0.0, centre_z), pl["deckColour"](0.0, 0.0, 0.0, centre_z))
    rings = []
    for i in range(1, nr + 1):
        rho = i / nr
        ring = []
        for j, th in enumerate(thetas):
            x, y = rho * rim[j] * math.cos(th), rho * rim[j] * math.sin(th)
            z = pl["deck"](x, y, rho)
            ring.append(mesh.vert((x, y, z), pl["deckColour"](x, y, rho, z)))
        rings.append(ring)
    rim_z = [mesh.v[k][2] for k in rings[-1]]

    # Cliff band: from just under the lip down `cliff` metres, strata stepping in and out.
    for i in range(1, nc + 1):
        v = i / nc
        ring = []
        for j, th in enumerate(thetas):
            sc = pl["cliffScale"](v, th)
            x, y = rim[j] * sc * math.cos(th), rim[j] * sc * math.sin(th)
            z = _lerp(rim_z[j] - 0.06, -pl["cliff"], v)
            # Strata: alternate rings sit lighter and darker on the dusk -> rock mid stretch.
            stripe = 0.10 if i % 2 else 0.0
            ring.append(mesh.vert((x, y, z), _ramp(ROCK, 0.06 + 0.34 * v + stripe)))
        rings.append(ring)

    # Underside: rings down to the tip, tapering and leaning, lumpy, darkening with depth.
    foot = [pl["cliffScale"](1.0, th) for th in thetas]
    for i in range(1, nu + 1):
        v = i / (nu + 1)
        ring = []
        for j, th in enumerate(thetas):
            s, (ox, oy), z = pl["under"](v, th)
            rr = rim[j] * foot[j] * s
            ring.append(mesh.vert((ox + rr * math.cos(th), oy + rr * math.sin(th), z),
                                  _ramp(ROCK, 0.48 + 0.52 * v ** 0.7)))
        rings.append(ring)
    _, (tx, ty), tz = pl["under"](1.0, 0.0)
    tip = mesh.vert((tx, ty, tz), _ramp(ROCK, 1.0))

    # Faces, wound so the normals point out (checked by `inward_faces`).
    first = rings[0]
    for j in range(seg):
        mesh.face((top_pole, first[j], first[(j + 1) % seg]))
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            mesh.face((a[j], b[j], b[k], a[k]))
    last = rings[-1]
    for j in range(seg):
        mesh.face((last[j], tip, last[(j + 1) % seg]))

    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}")
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["biome"] = pl["biome"]
    return ob


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


def metrics(seed, lod=0):
    """Silhouette numbers for the variant probe (rubric A4) and the sheet's framing."""
    pl = plan(int(seed))
    n = 360
    rims = [pl["outline"](2.0 * math.pi * j / n) for j in range(n)]
    xs = [rims[j] * math.cos(2.0 * math.pi * j / n) for j in range(n)]
    ys = [rims[j] * math.sin(2.0 * math.pi * j / n) for j in range(n)]
    width = max(max(xs) - min(xs), max(ys) - min(ys))
    mean = sum(rims) / n
    roughness = math.sqrt(sum((x - mean) ** 2 for x in rims) / n) / mean
    tops = [pl["deck"](rho * rims[j] * math.cos(2 * math.pi * j / n),
                       rho * rims[j] * math.sin(2 * math.pi * j / n), rho)
            for j in range(0, n, 12) for rho in (0.0, 0.25, 0.5, 0.75)]
    top = max(tops)
    bottom = pl["under"](1.0, 0.0)[2]
    return {
        "seed": int(seed), "biome": pl["biome"],
        "width": round(width, 3),
        "depth": round(-bottom, 3),
        "relief": round(top - min(tops), 3),
        "roughness": round(roughness, 4),
        "taper": round(pl["taper"], 3),
        "top": round(top, 3),
        "bottom": round(bottom, 3),
        "bites": pl["bites"],
        "terraces": pl["terraces"],
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
