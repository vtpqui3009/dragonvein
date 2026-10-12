"""Shared pieces for the rock generators (terrain/stratified, terrain/columnar,
terrain/boulders; ROADMAP M4b). Not a generator itself; nothing here draws a random number.

- `Mesh`: vertex, face and colour lists turned into one Blender object with one material
  (the island's and broadleaf's pattern), so a rock is one draw call.
- `ramp`: the palette ramps, quadratic Beziers through three docs/ART_BIBLE.md stops, the
  rule tools/variant-probe.mjs judges every ramp by.
- `inward_faces`: how many faces bmesh would flip. 0 means consistently outward
  (NEXT.md §Mesh winding).
- `icosphere`: a subdivided icosahedron as plain vertex and face lists, for boulders.
"""
import math

import bmesh
import bpy

PALETTE = {
    "grassDark": "#1e4a21",
    "grassMid": "#3f8a33",
    "grassLight": "#8fd24a",
    "rockMid": "#5a4a40",
    "dusk": "#844e32",
    "deepShadow": "#1a1420",
}
GRASS = ("grassDark", "grassMid", "grassLight")
ROCK = ("dusk", "rockMid", "deepShadow")

#: Rock prop budget: docs/PERF_BUDGET.md §Other budgets, LOD0 / LOD1 / LOD2 per prop.
PROP_BUDGET = {"lod0": 4000, "lod1": 1200, "lod2": 300}


def clamp01(x):
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = clamp01(t)
    return t * t * (3.0 - 2.0 * t)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def ramp(stops, t):
    """Quadratic Bezier through three palette stops in linear RGB, t in 0..1."""
    t = clamp01(t)
    a, b, c = (hex_linear(PALETTE[s]) for s in stops)
    u = 1.0 - t
    return tuple(u * u * a[k] + 2.0 * t * u * b[k] + t * t * c[k] for k in range(3))


def stratify(seed, irrational, jitter, rng):
    """Low-discrepancy stratification of one axis on the seed (see flora/broadleaf.py)."""
    base = (seed * irrational) % 1.0
    return (base + rng.range(-jitter, jitter)) % 1.0


class Mesh:
    """Vertex/face/colour lists, turned into one object at the end."""

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

    def to_object(self, name, material_name, smooth_shade=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.validate(verbose=False)
        for poly in me.polygons:
            poly.use_smooth = smooth_shade
        layer = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        for i, col in enumerate(self.c):
            layer.data[i].color = (col[0], col[1], col[2], 1.0)
        me.update()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(material(material_name))
        bpy.context.collection.objects.link(ob)
        return ob


def material(name, roughness=0.9):
    """One matte material whose base colour is the vertex colour layer."""
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.10
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


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


def icosphere(subdivisions):
    """Unit icosphere: (vertices, triangles), outward-wound. Subdivision 0 is 20 faces,
    1 is 80, 2 is 320. Midpoints are cached, so shared edges share vertices."""
    t = (1.0 + math.sqrt(5.0)) / 2.0
    verts = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t),
             (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    verts = [_unit(v) for v in verts]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4),
             (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8),
             (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(subdivisions):
        cache = {}

        def mid(a, b):
            key = (a, b) if a < b else (b, a)
            if key not in cache:
                va, vb = verts[a], verts[b]
                verts.append(_unit(((va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2)))
                cache[key] = len(verts) - 1
            return cache[key]
        nxt = []
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nxt += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = nxt
    return verts, faces


def _unit(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return (v[0] / n, v[1] / n, v[2] / n)
