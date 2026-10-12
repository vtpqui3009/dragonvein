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

Stages present: `body` = skeleton + add_limbs (M3a). The wing and crown stages join at M3b.

Needs `bpy` importable only because builder.py imports it at module level; nothing here
calls Blender. Byte-identical on every run; pins builder.py's and genome.py's SHA-256.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import genome as G  # noqa: E402
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


def main():
    with open(GENOMES) as fh:
        fixture = json.load(fh)
    genomes = rebuild(fixture["genomes"])
    data = {
        "builderSha256": sha256(os.path.join(HERE, "dragon", "builder.py")),
        "genomeSha256": sha256(os.path.join(HERE, "genome.py")),
        "stages": ["body"],
        "graphs": [{"gid": gm.gid(), "body": body_graph(gm.phenotype)} for gm in genomes],
    }
    with open(OUT, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
        fh.write("\n")
    nodes = [len(g["body"]["v"]) for g in data["graphs"]]
    print(f"wrote {os.path.relpath(OUT, REPO)}: {len(nodes)} body graphs, "
          f"{min(nodes)}-{max(nodes)} nodes, builder.py {data['builderSha256'][:12]}")


if __name__ == "__main__":
    main()
