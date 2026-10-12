"""B1 broadleaf — a seeded broadleaf canopy tree (docs/ASSET_PLAN.md §B).

A generator, not a model. `build(seed, lod)` returns one Blender object whose every
vertex is placed by a parameter drawn from the seeded xorshift128 `Rng` in
`assetgen/genome.py`. Nothing is hand-placed; there is no wall clock and no unseeded
`random` anywhere in this module.

Construction order
------------------
1. `plan(seed)` draws the whole tree as data: trunk spine, branch list, foliage lobes.
   Every random draw happens here, in a fixed order, so the stream does not depend on
   the LOD. That is what makes LOD2 of seed 3 the *same tree* as LOD0 of seed 3 rather
   than a different tree at a lower resolution.
2. `build(seed, lod)` tessellates that plan at the resolution LOD<n> asks for. The
   silhouette is held fixed across LODs; only the triangle count moves.

The form axis
-------------
`form` in 0..1 blends three archetype silhouettes — spreading (0.0), upright (0.5) and
vase (1.0) — and is the main reason eight seeds read as eight trees. It is *stratified*
on the seed by a golden-ratio sequence, so any run of consecutive seeds samples the whole
axis instead of clustering by luck. That is a property of the generator, not of a
hand-picked seed list: seeds 41..48 cover the range as evenly as seeds 1..8.

Colour
------
Three values per asset (`docs/ART_BIBLE.md` §Direction), carried in a single vertex
colour layer so the whole tree is one material and one draw call:
  bark `#4a3b2f`, canopy dark `#1e4a21`, canopy mid `#3f8a33`, canopy light `#8fd24a`.
The canopy dark→mid→light ramp is driven by surface normal and by height inside the
canopy, so undersides are dark and sunlit upper tips are light. No textures, no Draco —
both were measured to break byte-for-byte export (`.claude/skills/asset-env/SKILL.md`).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from genome import Rng  # noqa: E402  (path must be set first)

import bpy  # noqa: E402

# ---------------------------------------------------------------- identity
FAMILY = "flora"
NAME = "broadleaf"
ASSET_ID = f"{FAMILY}/{NAME}"

#: The seed whose mesh is committed under public/assets/.
SEED_FOR_COMMITTED = 1

#: Triangle ceilings per LOD. LOD2 is what 200 instances on screen use, so it must
#: still read as a tree in silhouette; 500 buys five canopy lobes plus real branches.
BUDGET = {"lod0": 6000, "lod1": 2000, "lod2": 500}

PALETTE = {
    "bark": "#4a3b2f",
    "canopyDark": "#1e4a21",
    "canopyMid": "#3f8a33",
    "canopyLight": "#8fd24a",
}

# ---------------------------------------------------------------- parameters
#: name -> (lo, hi, what it does). Every number the mesh is built from is here.
PARAMS = {
    # --- the form axis: the main silhouette lever ---
    "form": (0.0, 1.0, "0 spreading / 0.5 upright / 1 vase. Blends three archetype "
                       "silhouettes: branch elevation, trunk share of height, canopy "
                       "flatness and how far masses sit from the axis. Stratified on "
                       "the seed so consecutive seeds cover the axis."),
    # --- trunk ---
    "height": (4.6, 9.4, "metres, base of trunk to top of crown before form scaling"),
    "trunkRadius": (0.058, 0.105, "base trunk radius as a fraction of height"),
    "taper": (0.26, 0.56, "radius at the top of the trunk / radius at the base"),
    "leanDir": (0.0, 6.2831853, "radians; which way the trunk leans"),
    "leanAmount": (0.02, 0.26, "lateral offset of the trunk top, in trunk heights"),
    "sCurve": (0.05, 0.52, "counter-bend at mid trunk, in units of leanAmount*height; "
                           "turns a lean into an S"),
    "rootFlare": (1.35, 2.35, "base radius multiplier where the trunk meets the ground"),
    "rootCount": (3, 6, "number of root buttresses in the flare (angular lobes)"),
    "barkRelief": (0.03, 0.10, "amplitude of the trunk's radial waver, as a fraction of r"),
    # --- branching ---
    "branchCount": (3, 6, "primary branches forking off the trunk"),
    "branchStart": (0.26, 0.58, "height fraction of the lowest primary branch"),
    "branchEnd": (0.74, 0.98, "height fraction of the highest primary branch"),
    "branchLength": (0.30, 0.62, "primary branch length in trunk heights, before form"),
    "branchElev": (-8.0, 34.0, "degrees added to the form's branch elevation"),
    "branchDroop": (0.05, 0.55, "how much a primary sags over its length"),
    "branchTwist": (0.0, 6.2831853, "radians; azimuth of the first primary"),
    "branchJitter": (0.10, 0.75, "irregularity of primary azimuth spacing"),
    "forkChance": (0.25, 0.95, "probability a primary forks into two secondaries"),
    "forkAngle": (16.0, 46.0, "degrees of separation between the two secondaries"),
    # --- canopy ---
    "canopyRadius": (0.19, 0.32, "foliage lobe radius in trunk heights, before form"),
    "canopyLumps": (0.36, 0.80, "radial lump amplitude on a lobe; chunk vs ball"),
    "canopySquash": (0.58, 1.06, "vertical scale of a lobe, before form"),
    "canopyDroop": (0.04, 0.46, "how far a lobe's underside skirts downward"),
    "canopyLift": (0.0, 0.34, "vertical scatter of lobes, in canopy radii"),
    "canopySpread": (0.8, 1.45, "how far lobes push out past their branch tip"),
    "canopyFill": (0.40, 0.95, "probability a branch tip carries a second lobe"),
    "canopyTone": (0.84, 1.12, "shifts the dark->light ramp position; same three values, "
                               "more or less sun on the crown"),
}

# ---------------------------------------------------------------- archetypes
# form 0.0 / 0.5 / 1.0. Everything here is a multiplier or an absolute angle; the
# per-seed params above ride on top, so two trees at the same form still differ.
_ARCHETYPES = (
    {  # 0.0 spreading — short bole, long near-horizontal limbs, wide flat crown
        "trunkShare": 0.46, "heightMul": 0.88, "elev": 14.0, "branchLenMul": 1.42,
        "radiusMul": 1.18, "squashMul": 0.64, "spreadMul": 1.40, "droopMul": 1.35,
        "liftMul": 0.55, "startMul": 0.74,
    },
    {  # 0.5 upright — tall bole, limbs rising, egg-shaped crown
        "trunkShare": 0.66, "heightMul": 1.16, "elev": 44.0, "branchLenMul": 0.84,
        "radiusMul": 0.90, "squashMul": 1.18, "spreadMul": 0.82, "droopMul": 0.70,
        "liftMul": 1.00, "startMul": 1.00,
    },
    {  # 1.0 vase — bole splits high, limbs sweep steeply up and out, crown held above
        "trunkShare": 0.58, "heightMul": 1.02, "elev": 66.0, "branchLenMul": 1.20,
        "radiusMul": 0.96, "squashMul": 0.88, "spreadMul": 1.26, "droopMul": 0.38,
        "liftMul": 1.30, "startMul": 1.22,
    },
)


def _blend_archetype(form):
    """Triangular-basis blend of the three archetypes."""
    t = min(max(form, 0.0), 1.0) * 2.0
    i = 0 if t < 1.0 else 1
    f = t - i
    a, b = _ARCHETYPES[i], _ARCHETYPES[i + 1]
    return {k: a[k] + (b[k] - a[k]) * f for k in a}


# ---------------------------------------------------------------- small vector math
def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(_dot(a, a))


def _norm(a):
    n = _len(a)
    return (0.0, 0.0, 1.0) if n < 1e-12 else (a[0] / n, a[1] / n, a[2] / n)


def _lerp(a, b, t):
    return a + (b - a) * t


def _clamp01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


# ---------------------------------------------------------------- colour
def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_linear(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


_BARK = _hex_linear(PALETTE["bark"])
_DARK = _hex_linear(PALETTE["canopyDark"])
_MID = _hex_linear(PALETTE["canopyMid"])
_LIGHT = _hex_linear(PALETTE["canopyLight"])


def _mix(a, b, t):
    return (_lerp(a[0], b[0], t), _lerp(a[1], b[1], t), _lerp(a[2], b[2], t))


def _foliage_ramp(t):
    """dark -> mid -> light, as a quadratic Bezier blend of exactly those three values.

    A piecewise-linear dark|mid|light ramp has a derivative discontinuity at the knee,
    and the knee is a surface on the mesh: it renders as a hard waterline drawn straight
    across the crown. The Bezier weights are C1, so there is no crease, and the endpoints
    are still exactly the palette's dark and light.
    """
    s = _clamp01(t)
    u = 1.0 - s
    wd, wm, wl = u * u, 2.0 * s * u, s * s
    return (_DARK[0] * wd + _MID[0] * wm + _LIGHT[0] * wl,
            _DARK[1] * wd + _MID[1] * wm + _LIGHT[1] * wl,
            _DARK[2] * wd + _MID[2] * wm + _LIGHT[2] * wl)


def _bark_value(t):
    """Bark stays one value; `t` only moves its brightness inside +-12%, which is
    well inside the palette tolerance and keeps crevices from going flat."""
    s = 0.76 + 0.26 * _clamp01(t)
    return (_BARK[0] * s, _BARK[1] * s, _BARK[2] * s)


# ---------------------------------------------------------------- mesh accumulator
class _Mesh:
    """Vertex/face/colour lists, turned into one object at the end."""

    def __init__(self):
        self.v = []
        self.c = []
        self.f = []

    def vert(self, p, col):
        self.v.append((p[0], p[1], p[2]))
        self.c.append(col)
        return len(self.v) - 1

    def face(self, idx):
        self.f.append(tuple(idx))

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

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
    """One material for the whole tree: base colour comes from the vertex colours."""
    existing = bpy.data.materials.get("broadleaf")
    if existing is not None:
        return existing
    mat = bpy.data.materials.new("broadleaf")
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


# ---------------------------------------------------------------- framed tube
def _frames(path):
    """Rotation-minimising frames along a polyline, so tubes do not twist."""
    n = len(path)
    tangents = []
    for i in range(n):
        if i == 0:
            t = _sub(path[1], path[0])
        elif i == n - 1:
            t = _sub(path[-1], path[-2])
        else:
            t = _sub(path[i + 1], path[i - 1])
        tangents.append(_norm(t))
    ref = (0.0, 0.0, 1.0)
    if abs(_dot(tangents[0], ref)) > 0.9:
        ref = (1.0, 0.0, 0.0)
    u = _norm(_cross(tangents[0], ref))
    out = []
    for t in tangents:
        u = _sub(u, _mul(t, _dot(u, t)))
        if _len(u) < 1e-6:
            alt = (1.0, 0.0, 0.0) if abs(t[2]) > 0.9 else (0.0, 0.0, 1.0)
            u = _cross(t, alt)
        u = _norm(u)
        out.append((u, _norm(_cross(t, u))))
    return out


def _tube(mesh, path, radii, sides, colour_fn, lobe_fn=None, cap_end=True):
    """Sweep a ring of `sides` around `path`. `colour_fn(u, shade)` gives the vertex
    colour; `lobe_fn(u, theta)` optionally modulates the radius (root flare, bark)."""
    frames = _frames(path)
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        u_param = i / max(1, len(path) - 1)
        fu, fv = frames[i]
        ring = []
        for s in range(sides):
            theta = 2.0 * math.pi * s / sides
            m = 1.0 if lobe_fn is None else lobe_fn(u_param, theta)
            rr = r * m
            q = _add(p, _add(_mul(fu, rr * math.cos(theta)), _mul(fv, rr * math.sin(theta))))
            ring.append(mesh.vert(q, colour_fn(u_param, m)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for s in range(sides):
            t = (s + 1) % sides
            mesh.face((a[s], a[t], b[t], b[s]))
    # Close the bottom so the trunk is not a hollow pipe when seen from below.
    base = rings[0]
    for s in range(1, sides - 1):
        mesh.face((base[0], base[s + 1], base[s]))
    if cap_end:
        top = rings[-1]
        for s in range(1, sides - 1):
            mesh.face((top[0], top[s], top[s + 1]))
    return rings


# ---------------------------------------------------------------- the plan
def _stratify(seed, irrational, jitter, rng):
    """Low-discrepancy stratification of one axis on the seed.

    A plain uniform draw lets eight consecutive seeds cluster by chance; an additive
    golden-ratio (or plastic-number) sequence guarantees any eight consecutive seeds
    spread across the axis. Still a pure function of the seed, so still deterministic.
    """
    base = ((seed * irrational) % 1.0)
    return (base + rng.range(-jitter, jitter)) % 1.0


def _p(name, t):
    lo, hi, _ = PARAMS[name]
    return lo + (hi - lo) * t


def plan(seed):
    """Draw the whole tree as data. Every random number in the generator is drawn here,
    in this order, independent of LOD."""
    rng = Rng(seed)

    # Three silhouette drivers are stratified so consecutive seeds cover their range.
    form = _p("form", _stratify(seed, 0.6180339887498949, 0.10, rng))   # golden ratio
    height = _p("height", _stratify(seed, 0.7548776662466927, 0.12, rng))   # plastic no.
    canopy_r_t = _stratify(seed, 0.4142135623730951, 0.13, rng)  # sqrt(2) - 1

    A = _blend_archetype(form)

    trunk_radius = _p("trunkRadius", rng.next())
    taper = _p("taper", rng.next())
    lean_dir = _p("leanDir", rng.next())
    lean_amount = _p("leanAmount", rng.next())
    s_curve = _p("sCurve", rng.next())
    root_flare = _p("rootFlare", rng.next())
    root_count = rng.int(int(PARAMS["rootCount"][0]), int(PARAMS["rootCount"][1]))
    bark_relief = _p("barkRelief", rng.next())
    bark_phase = rng.range(0.0, 6.2831853)

    branch_count = rng.int(int(PARAMS["branchCount"][0]), int(PARAMS["branchCount"][1]))
    branch_start = _p("branchStart", rng.next()) * A["startMul"]
    branch_end = _p("branchEnd", rng.next())
    branch_length = _p("branchLength", rng.next())
    branch_elev = _p("branchElev", rng.next())
    branch_droop = _p("branchDroop", rng.next())
    branch_twist = _p("branchTwist", rng.next())
    branch_jitter = _p("branchJitter", rng.next())
    fork_chance = _p("forkChance", rng.next())
    fork_angle = _p("forkAngle", rng.next())

    canopy_radius = _p("canopyRadius", canopy_r_t)
    canopy_lumps = _p("canopyLumps", rng.next())
    canopy_squash = _p("canopySquash", rng.next())
    canopy_droop = _p("canopyDroop", rng.next())
    canopy_lift = _p("canopyLift", rng.next())
    canopy_spread = _p("canopySpread", rng.next())
    canopy_fill = _p("canopyFill", rng.next())
    canopy_tone = _p("canopyTone", rng.next())

    H = height * A["heightMul"]
    trunk_len = H * A["trunkShare"]
    r_base = H * trunk_radius
    lean = (math.cos(lean_dir), math.sin(lean_dir), 0.0)
    lateral = lean_amount * trunk_len
    s_amp = s_curve * lateral

    def spine(u):
        """Trunk centreline at height fraction `u`: lean plus a gentle S."""
        off = lateral * (u ** 1.7) - s_amp * math.sin(math.pi * u) * 0.9
        return (lean[0] * off, lean[1] * off, trunk_len * u)

    def trunk_radius_at(u):
        r = _lerp(r_base, r_base * taper, u ** 0.82)
        flare = max(0.0, 1.0 - u / 0.16)
        return r * (1.0 + (root_flare - 1.0) * flare * flare)

    def flare_lobes(u, theta):
        """Root buttresses near the ground plus a slow bark waver up the trunk."""
        near = max(0.0, 1.0 - u / 0.22)
        lobe = max(0.0, math.cos(root_count * (theta - bark_phase)))
        return (1.0 + 0.55 * near * near * (lobe ** 1.4)
                + bark_relief * math.sin(u * 11.3 + theta * 2.0 + bark_phase))

    # --- primaries, then secondaries; tips collect the foliage ---
    branches = []   # (path_fn-ready data) dicts
    tips = []       # (point, direction, scale)
    for i in range(branch_count):
        f = i / max(1, branch_count - 1)
        u0 = _lerp(branch_start, branch_end, f) + rng.range(-0.05, 0.05)
        u0 = min(0.97, max(0.14, u0))
        az = branch_twist + i * (2.0 * math.pi / branch_count) \
            + rng.range(-1.0, 1.0) * branch_jitter * (math.pi / branch_count)
        elev = math.radians(A["elev"] + branch_elev * rng.range(0.55, 1.0)
                            + 10.0 * (u0 - branch_start))
        elev = max(math.radians(-6.0), min(math.radians(84.0), elev))
        length = trunk_len * branch_length * A["branchLenMul"] * rng.range(0.78, 1.18)
        droop = branch_droop * A["droopMul"] * rng.range(0.7, 1.3)
        r0 = trunk_radius_at(u0) * rng.range(0.44, 0.62)
        origin = spine(u0)
        d = (math.cos(az) * math.cos(elev), math.sin(az) * math.cos(elev), math.sin(elev))
        branches.append({"origin": origin, "dir": d, "len": length, "droop": droop,
                         "r0": r0, "level": 0})
        end = _add(origin, _add(_mul(d, length), (0.0, 0.0, -droop * length)))
        end_dir = _norm(_sub(end, origin))

        if rng.chance(fork_chance):
            # Two secondaries off the far third of the primary, splitting in azimuth.
            u_fork = rng.range(0.52, 0.74)
            fo = _add(origin, _add(_mul(d, length * u_fork),
                                   (0.0, 0.0, -droop * length * u_fork * u_fork)))
            for k in (-1, 1):
                da = math.radians(fork_angle) * 0.5 * k
                de = math.radians(rng.range(-6.0, 26.0))
                a2, e2 = az + da, max(math.radians(-18.0), min(math.radians(86.0), elev + de))
                d2 = (math.cos(a2) * math.cos(e2), math.sin(a2) * math.cos(e2), math.sin(e2))
                l2 = length * rng.range(0.42, 0.68)
                dr2 = droop * rng.range(0.8, 1.4)
                branches.append({"origin": fo, "dir": d2, "len": l2, "droop": dr2,
                                 "r0": r0 * 0.62, "level": 1})
                e2p = _add(fo, _add(_mul(d2, l2), (0.0, 0.0, -dr2 * l2)))
                tips.append((e2p, _norm(_sub(e2p, fo)), rng.range(0.74, 1.04)))
        else:
            tips.append((end, end_dir, rng.range(0.88, 1.22)))
        # A long limb carries foliage along its length, not only at its tip. Without
        # this, spreading forms read as satellites orbiting a crown.
        if length > trunk_len * 0.34 and rng.chance(0.72):
            u_mid = rng.range(0.52, 0.72)
            mp = _add(origin, _add(_mul(d, length * u_mid),
                                   (0.0, 0.0, -droop * length * u_mid * u_mid)))
            tips.append((mp, _norm(_sub(mp, origin)), rng.range(0.52, 0.76)))

    crown = spine(1.0)
    tips.append((crown, (0.0, 0.0, 1.0), rng.range(1.0, 1.32)))

    # --- foliage lobes seated on the tips ---
    base_r = trunk_len * canopy_radius * A["radiusMul"]
    squash = canopy_squash * A["squashMul"]
    lobes = []
    for (p, d, s) in tips:
        n_lobes = 2 if rng.chance(canopy_fill) else 1
        for j in range(n_lobes):
            # Tip lobes are deliberately smaller than the crown core: a clump budding
            # off a mass reads as foliage, two equal spheres interpenetrating reads as
            # a seam drawn across the crown.
            r = base_r * s * rng.range(0.58, 0.92) * (1.0 if j == 0 else rng.range(0.62, 0.9))
            push = canopy_spread * A["spreadMul"] * r * (0.26 if j == 0 else rng.range(0.5, 1.0))
            c = _add(p, _mul(d, push))
            c = (c[0] + rng.range(-0.5, 0.5) * r * 0.55,
                 c[1] + rng.range(-0.5, 0.5) * r * 0.55,
                 c[2] + rng.range(-1.0, 1.0) * canopy_lift * A["liftMul"] * base_r)
            bumps = [((rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)),
                      rng.range(0.45, 1.0)) for _ in range(4)]
            bumps = [(_norm(ax), amp) for ax, amp in bumps]
            lobes.append({"c": c, "r": r, "squash": squash * rng.range(0.88, 1.12),
                          "droop": canopy_droop * A["droopMul"] * rng.range(0.7, 1.3),
                          "lumps": canopy_lumps * rng.range(0.8, 1.2), "bumps": bumps,
                          "tone": rng.range(0.90, 1.10), "core": False})

    # --- the crown core ---
    # Tip lobes alone read as separate balloons on sticks. One to three larger masses
    # at the canopy's centre of mass tie them into a single crown, so the silhouette is
    # a lumpy canopy with clumps on its rim rather than a bunch of grapes. The vase form
    # gets a smaller, higher core so its middle stays open.
    wsum = sum(lb["r"] ** 3 for lb in lobes)
    cen = tuple(sum(lb["c"][k] * lb["r"] ** 3 for lb in lobes) / wsum for k in (0, 1, 2))
    reach = sum(_len(_sub(lb["c"], cen)) + lb["r"] for lb in lobes) / len(lobes)
    openness = _clamp01((form - 0.55) / 0.45)            # 0 spreading/upright, 1 vase
    core_n = 1 if len(lobes) <= 6 else (2 if len(lobes) <= 11 else 3)
    for k in range(core_n):
        r = reach * _lerp(0.64, 0.44, openness) * (1.0 if k == 0 else rng.range(0.55, 0.80))
        off = 0.0 if k == 0 else reach * rng.range(0.18, 0.44)
        ang = rng.range(0.0, 6.2831853)
        c = (cen[0] + math.cos(ang) * off,
             cen[1] + math.sin(ang) * off,
             cen[2] + reach * (0.08 + openness * 0.22 + rng.range(-0.10, 0.18)))
        bumps = [(_norm((rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1))),
                  rng.range(0.5, 1.0)) for _ in range(4)]
        lobes.append({"c": c, "r": r, "squash": squash * rng.range(0.82, 1.0),
                      "droop": canopy_droop * A["droopMul"] * rng.range(0.5, 0.9),
                      "lumps": canopy_lumps * rng.range(0.9, 1.35), "bumps": bumps,
                      "tone": rng.range(0.88, 1.02), "core": True})

    # No foliage mass may sink into the ground: a lobe whose skirt would clip the
    # terrain is lifted until it clears. Spreading forms still sweep low, they just
    # stop short of intersecting.
    clearance = 0.30 * trunk_len
    for lb in lobes:
        bottom = lb["c"][2] - lb["r"] * lb["squash"] - lb["droop"] * lb["r"]
        if bottom < clearance:
            lb["c"] = (lb["c"][0], lb["c"][1], lb["c"][2] + (clearance - bottom))

    zmin = min(lb["c"][2] - lb["r"] * lb["squash"] for lb in lobes)
    zmax = max(lb["c"][2] + lb["r"] * lb["squash"] for lb in lobes)

    return {
        "seed": seed, "form": form, "height": H, "trunkLen": trunk_len,
        "spine": spine, "trunkRadiusAt": trunk_radius_at, "flareLobes": flare_lobes,
        "branches": branches, "lobes": lobes, "tips": tips,
        "canopyZ": (zmin, max(zmax, zmin + 1e-3)), "tone": canopy_tone,
        "rootCount": root_count, "branchCount": branch_count,
    }


# ---------------------------------------------------------------- LOD table
# Resolution only. Nothing here changes a position, so the silhouette is LOD-stable.
_LOD = {
    0: {"trunk_rings": 12, "trunk_sides": 10, "pri_rings": 6, "pri_sides": 8,
        "sec_rings": 5, "sec_sides": 6, "lobe_seg": 13, "lobe_ring": 6,
        "max_lobes": 24, "merge": 0, "lump_scale": 1.00},
    1: {"trunk_rings": 7, "trunk_sides": 6, "pri_rings": 4, "pri_sides": 5,
        "sec_rings": 3, "sec_sides": 4, "lobe_seg": 7, "lobe_ring": 4,
        "max_lobes": 16, "merge": 1, "lump_scale": 0.82},
    2: {"trunk_rings": 5, "trunk_sides": 5, "pri_rings": 3, "pri_sides": 3,
        "sec_rings": 0, "sec_sides": 0, "lobe_seg": 8, "lobe_ring": 4,
        "max_lobes": 5, "merge": 2, "lump_scale": 0.55},
}


def _merge_lobes(lobes, target):
    """Collapse lobes into at most `target` larger ones, deterministically, keeping the
    canopy's envelope. Used by LOD1/LOD2 so the crown still reads in silhouette.

    The grouping is *spatial* — farthest-point seeding from the largest lobe, then
    nearest-seed assignment. Grouping by size instead (round robin over a sorted list)
    merges a crown lobe with a lobe on the opposite limb, and the replacement sphere has
    to be big enough to contain both: the crown turns into two balloons.
    """
    if len(lobes) <= target:
        return lobes
    order = sorted(range(len(lobes)), key=lambda i: (-lobes[i]["r"], i))
    seeds = [order[0]]
    while len(seeds) < target:
        best, best_d = None, -1.0
        for i in order:
            if i in seeds:
                continue
            d = min(_len(_sub(lobes[i]["c"], lobes[s]["c"])) for s in seeds)
            if d > best_d + 1e-9:
                best_d, best = d, i
        seeds.append(best)
    groups = [[] for _ in seeds]
    for i in range(len(lobes)):
        j = min(range(len(seeds)),
                key=lambda k: (_len(_sub(lobes[i]["c"], lobes[seeds[k]]["c"])), k))
        groups[j].append(i)
    out = []
    for g in groups:
        if not g:
            continue
        members = sorted((lobes[i] for i in g), key=lambda m: -m["r"])
        w = sum(m["r"] ** 3 for m in members)
        c = (sum(m["c"][0] * m["r"] ** 3 for m in members) / w,
             sum(m["c"][1] * m["r"] ** 3 for m in members) / w,
             sum(m["c"][2] * m["r"] ** 3 for m in members) / w)
        # radius that still reaches the furthest member's outer surface
        r = max(_len(_sub(m["c"], c)) + m["r"] for m in members) * 0.92
        seedl = members[0]
        out.append({"c": c, "r": r, "squash": seedl["squash"], "droop": seedl["droop"],
                    "lumps": seedl["lumps"], "bumps": seedl["bumps"],
                    "tone": seedl.get("tone", 1.0), "core": True})
    return out


# ---------------------------------------------------------------- tessellation
def _lobe(mesh, lb, seg, rings, zrange, tone, lump_scale=1.0):
    """One foliage mass: a lumpy, squashed, drooping sphere.

    The lump function is a function of *direction*, not of vertex index, so the shape is
    identical at every LOD — only how finely it is sampled changes.
    """
    cx, cy, cz = lb["c"]
    R, sq, droop = lb["r"], lb["squash"], lb["droop"]
    # Lumps are damped at the lower LODs: at 6 segments a strong lump stops reading as
    # a clump of leaves and starts reading as a faceting artefact.
    amp = lb["lumps"] * lump_scale
    bumps = lb["bumps"]
    z0, z1 = zrange

    def radial(d):
        m = 1.0
        for ax, a in bumps:
            m += amp * a * max(0.0, _dot(d, ax)) ** 1.8
        norm = 1.0 + amp * 0.46
        return R * m / norm, m / norm

    def place(d):
        r, m = radial(d)
        x, y, z = d[0] * r, d[1] * r, d[2] * r * sq
        # Skirt: the underside of a canopy mass hangs, it does not sit flat. The
        # exponent must be > 1 — at 0.7 the derivative blows up at the equator and
        # every lobe gets a hard crease ringing it, which renders as a waterline
        # straight across the crown.
        if d[2] < 0.0:
            sag = (-d[2]) ** 1.5
            z -= droop * R * sag
            x *= 1.0 + droop * 0.30 * sag
            y *= 1.0 + droop * 0.30 * sag
        p = (cx + x, cy + y, cz + z)
        # dark -> light. Weighted mostly on the surface normal, so the knee of the ramp
        # follows each mass's own shoulder; a global-height-dominated ramp puts the knee
        # on one horizontal plane and draws a visible waterline straight across the crown.
        # The third term lets a lump that sticks out of the mass catch a little more sun.
        th = (0.64 * (0.5 + 0.5 * d[2])
              + 0.30 * _clamp01((p[2] - z0) / (z1 - z0))
              + max(-0.10, min(0.10, 0.26 * (m - 1.0))))
        return mesh.vert(p, _foliage_ramp(_clamp01(_clamp01(th) ** 1.26 * tone)))

    top = place((0.0, 0.0, 1.0))
    bot = place((0.0, 0.0, -1.0))
    loops = []
    for j in range(1, rings):
        phi = math.pi * j / rings
        sp, cp = math.sin(phi), math.cos(phi)
        loop = []
        for s in range(seg):
            th = 2.0 * math.pi * s / seg
            loop.append(place((sp * math.cos(th), sp * math.sin(th), cp)))
        loops.append(loop)
    for s in range(seg):
        t = (s + 1) % seg
        mesh.face((top, loops[0][s], loops[0][t]))
        mesh.face((bot, loops[-1][t], loops[-1][s]))
    for j in range(len(loops) - 1):
        a, b = loops[j], loops[j + 1]
        for s in range(seg):
            t = (s + 1) % seg
            mesh.face((a[s], a[t], b[t], b[s]))


def _branch(mesh, br, rings, sides, trunk_len):
    o, d, L, droop, r0 = br["origin"], br["dir"], br["len"], br["droop"], br["r0"]
    path, radii = [], []
    for i in range(rings):
        u = i / (rings - 1)
        p = _add(o, _add(_mul(d, L * u), (0.0, 0.0, -droop * L * u * u)))
        path.append(p)
        radii.append(_lerp(r0, r0 * 0.34, u ** 0.8))
    base_t = _clamp01(o[2] / max(1e-6, trunk_len))
    _tube(mesh, path, radii, sides,
          lambda u, m: _bark_value(0.30 + 0.45 * base_t + 0.25 * u), cap_end=True)


def build(seed, lod=0, params=None):
    """Build one broadleaf tree.

    seed: any int. lod: 0 (hero) / 1 / 2 (instanced). `params` optionally overrides
    entries of the plan dict after it is drawn, for tuning; production never uses it.
    Returns the Blender object, which is already linked into the active collection.
    """
    lod = int(lod)
    if lod not in _LOD:
        raise ValueError(f"lod must be 0, 1 or 2 (got {lod})")
    cfg = _LOD[lod]
    pl = plan(int(seed))
    if params:
        pl.update(params)

    mesh = _Mesh()
    spine, rad_at = pl["spine"], pl["trunkRadiusAt"]
    n = cfg["trunk_rings"]
    # The lowest ring is pushed into the ground so the flare never floats.
    path = [spine(i / (n - 1)) for i in range(n)]
    path[0] = (path[0][0], path[0][1], -0.06 * pl["trunkLen"] * 0.25)
    radii = [rad_at(i / (n - 1)) for i in range(n)]
    _tube(mesh, path, radii, cfg["trunk_sides"],
          lambda u, m: _bark_value(0.20 + 0.55 * u + 0.35 * (m - 1.0)),
          lobe_fn=pl["flareLobes"], cap_end=True)

    for br in pl["branches"]:
        if br["level"] == 0:
            _branch(mesh, br, cfg["pri_rings"], cfg["pri_sides"], pl["trunkLen"])
        elif cfg["sec_rings"] >= 3:
            _branch(mesh, br, cfg["sec_rings"], cfg["sec_sides"], pl["trunkLen"])

    lobes = pl["lobes"]
    if cfg["merge"]:
        lobes = _merge_lobes(lobes, cfg["max_lobes"])
    elif len(lobes) > cfg["max_lobes"]:
        lobes = _merge_lobes(lobes, cfg["max_lobes"])
    for lb in lobes:
        _lobe(mesh, lb, cfg["lobe_seg"], cfg["lobe_ring"], pl["canopyZ"],
              pl["tone"] * lb.get("tone", 1.0), cfg["lump_scale"])

    ob = mesh.to_object(f"{NAME}_s{int(seed)}_lod{lod}")
    ob["seed"] = int(seed)
    ob["lod"] = lod
    ob["form"] = round(pl["form"], 4)
    return ob


def metrics(seed, lod=0):
    """Silhouette numbers for the variant probe / this module's self-test."""
    pl = plan(int(seed))
    zmin, zmax = pl["canopyZ"]
    width = 0.0
    for lb in pl["lobes"]:
        width = max(width, _len((lb["c"][0], lb["c"][1], 0.0)) + lb["r"])
    top = pl["spine"](1.0)
    return {
        "seed": int(seed), "form": round(pl["form"], 3),
        "height": round(max(zmax, top[2]), 3),
        "canopyWidth": round(width * 2.0, 3),
        "trunkLean": round(_len((top[0], top[1], 0.0)) / max(1e-6, pl["trunkLen"]), 4),
        "branches": pl["branchCount"],
        "lobes": len(pl["lobes"]),
        "canopyBase": round(zmin, 3),
    }


if __name__ == "__main__":
    for s in range(1, 9):
        print(metrics(s))
