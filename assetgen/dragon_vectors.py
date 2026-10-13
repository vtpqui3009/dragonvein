#!/usr/bin/env python3
"""Write docs/fixtures/dragon-graphs.json: the reference skin graph for the 32 fixed genomes.

    python3 -I assetgen/dragon_vectors.py

`assetgen/dragon/builder.py` builds a dragon in two stages. First a *skin graph* — nodes
with a position and a radius, joined by edges — from pure arithmetic on the phenotype
(`skeleton`, `add_limbs`, `add_wings`, `add_crown`). Then Blender skins that graph with
its Skin modifier and Subsurf. TypeScript cannot reproduce the second stage vertex for
vertex, but it can reproduce the first exactly, so that is what this fixture pins
(STATE.md run 11). src/assets/dragon/graph.ts must rebuild every graph here with every
number equal; tests/dragon-graph.test.ts checks it.

The genomes are the ones in docs/fixtures/genomes.json, rebuilt from their recipes by
genome.py, so this fixture and that one cannot describe different dragons.

Stages:
- `body`: skeleton + add_limbs (M3a).
- `full`: skeleton, add_limbs, add_wings, add_crown, in place()'s order (M3b).
- `wingForm`: the wing form `wing_form` derives from wingFingers and wingShape (M3e).
- `placed`: the whole dragon as `place()` builds it, its bounding box over face vertices (M3d,
  for gate:parity).
- `parts`: the pieces that are not skin graph (M3b). Each holds:
  - the membrane polygons per wing, before modifiers;
  - each dorsal spike's and the tail ornament's primitive parameters;
  - what Blender builds from them: world-space vertices for the primitives, and the vertex
    count and bounding box for each membrane after Solidify and Subsurf.

The graph and parameters are pure arithmetic. The `blender` entries are Blender's own
output, rounded to 6 decimals because Blender stores float32. Byte-identical on every run;
pins builder.py's and genome.py's SHA-256.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import genome as G  # noqa: E402
import dragon as D  # noqa: E402
from dragon import builder as B  # noqa: E402

GENOMES = os.path.join(REPO, "docs", "fixtures", "genomes.json")
OUT = os.path.join(REPO, "docs", "fixtures", "dragon-graphs.json")

ANCHORS = ("tailTip", "hip", "chest", "shoulder", "neck", "headBack", "headMid", "nose")
POINTS = ("headPos", "headMidPos", "headBackPos")


def sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def rebuild(records):
    out = []
    for rec in records:
        r = rec["recipe"]
        if r["op"] == "wild":
            gm = G.wild(r["seed"], r["element"])
        else:
            gm = G.breed(out[r["a"]], out[r["b"]], r["seed"])
        if gm.gid() != rec["gid"]:
            raise SystemExit(f"genome #{len(out)} rebuilt as {gm.gid()}, fixture says {rec['gid']}: "
                             "re-run assetgen/genome_vectors.py first")
        out.append(gm)
    return out


def body_graph(p):
    g, idx, _ = B.skeleton(p)
    B.add_limbs(g, idx, p)
    return {
        "v": [list(v) for v in g.v],
        "r": list(g.r),
        "e": [list(e) for e in g.e],
        "idx": {k: idx[k] for k in ANCHORS},
        "points": {k: list(idx[k]) for k in POINTS},
    }


def full_graph(p):
    g, idx, _ = B.skeleton(p)
    B.add_limbs(g, idx, p)
    B.add_wings(g, idx, p)
    B.add_crown(g, idx, p)
    return {"v": [list(v) for v in g.v], "r": list(g.r), "e": [list(e) for e in g.e]}


def r6(x):
    return round(float(x), 6) + 0.0  # + 0.0 turns -0.0 into 0.0


def world_verts(ob):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    return [[r6(c) for c in ob.matrix_world @ v.co] for v in ev.data.vertices]


def parts(p):
    out = {"membrane": [], "spikes": B.spike_params(p), "ornament": B.ornament_params(p)}
    for s in (1, -1):
        V, F = B.membrane_polys(p, s)
        out["membrane"].append({"side": s, "v": [list(v) for v in V], "f": [list(f) for f in F]})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    blender = {"spikes": [world_verts(o) for o in B.dorsal_spikes(p)],
               "ornament": [world_verts(o) for o in B.tail_ornament(p)], "membrane": []}
    for s in (1, -1):
        mv = world_verts(B.membrane(p, s))
        lo = [r6(min(v[k] for v in mv)) for k in range(3)]
        hi = [r6(max(v[k] for v in mv)) for k in range(3)]
        blender["membrane"].append({"side": s, "vertices": len(mv), "min": lo, "max": hi})
    out["blender"] = blender
    return out


def placed_bbox(gm):
    """The whole dragon as place() builds it, at the origin and unrotated: the box over every
    vertex that belongs to a face, across all its meshes. Faces only: the Skin modifier
    leaves loose vertices (STATE.md run 12) that no renderer draws."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = D.place(gm, name="d")
    bpy.context.view_layer.update()
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for o in objs:
        if o.type != "MESH":
            continue
        m, mw = o.data, o.matrix_world
        for vi in {v for f in m.polygons for v in f.vertices}:
            w = mw @ m.vertices[vi].co
            for k in range(3):
                lo[k], hi[k] = min(lo[k], w[k]), max(hi[k], w[k])
    return {"min": [r6(x) for x in lo], "max": [r6(x) for x in hi]}


def jsonable(x):
    """Tuples to lists, recursively, so the fixture is plain JSON arrays."""
    if isinstance(x, dict):
        return {k: jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    return x


def main():
    with open(GENOMES) as fh:
        fixture = json.load(fh)
    genomes = rebuild(fixture["genomes"])
    data = {
        "builderSha256": sha256(os.path.join(HERE, "dragon", "builder.py")),
        "genomeSha256": sha256(os.path.join(HERE, "genome.py")),
        "stages": ["body", "full", "parts", "placed", "wingForm"],
        "graphs": [jsonable({"gid": gm.gid(), "wingForm": B.wing_form(gm.phenotype),
                             "body": body_graph(gm.phenotype),
                             "full": full_graph(gm.phenotype), "parts": parts(gm.phenotype),
                             "placed": placed_bbox(gm)})
                   for gm in genomes],
    }
    with open(OUT, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
        fh.write("\n")
    nodes = [len(g["full"]["v"]) for g in data["graphs"]]
    forms = {f: sum(g["wingForm"] == f for g in data["graphs"]) for f in B.WING_FORMS}
    print(f"wrote {os.path.relpath(OUT, REPO)}: {len(nodes)} genomes, full graphs of "
          f"{min(nodes)}-{max(nodes)} nodes, wing forms {forms}, builder.py {data['builderSha256'][:12]}")


if __name__ == "__main__":
    main()
