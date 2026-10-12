#!/usr/bin/env python3
"""Write docs/fixtures/genomes.json: 32 fixed genomes the TypeScript port must reproduce.

    python3 -I assetgen/genome_vectors.py

`docs/GENOME.md` makes `assetgen/genome.py` the reference and `src/core/genome.ts` the
runtime, and `npm run gate:parity` the enforcer. This file is the evidence that gate reads:
every genome is described by the recipe that made it (wild or bred, with its seed), plus
everything the reference computed from it — alleles, element, generation, lineage,
phenotype, rarity and gid. The port rebuilds each one from its recipe and must match all
of it exactly.

`edge` holds vectors aimed at the places Python and JS arithmetic differ (STATE.md run 10):
banker's rounding, floor-mod on negatives, signed zero in min/max, `round(x, 5)` on an
exact decimal tie, and Python's float repr inside `json.dumps`.

Pure Python. Byte-identical on every run; pins genome.py's SHA-256.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import genome as G  # noqa: E402

OUT = os.path.join(REPO, "docs", "fixtures", "genomes.json")


def build_recipes():
    """32 genomes: 14 wild, then four bred generations. Deterministic, no search state
    leaks between runs."""
    genomes, recipes = [], []

    def add(gm, recipe):
        genomes.append(gm)
        recipes.append(recipe)
        return len(genomes) - 1

    # Wild: every element forced, two seeds each, plus two that pick their own element
    # (the `element or r.pick(...)` branch consumes one extra draw).
    wild_by_el = {}
    for el in G.ELEMENTS:
        for seed in (11, 29):
            i = add(G.wild(seed, el), {"op": "wild", "seed": seed, "element": el})
            wild_by_el.setdefault(el, []).append(i)
    add(G.wild(3), {"op": "wild", "seed": 3, "element": None})
    add(G.wild(7), {"op": "wild", "seed": 7, "element": None})

    def breed(ia, ib, seed):
        return add(G.breed(genomes[ia], genomes[ib], seed),
                   {"op": "breed", "a": ia, "b": ib, "seed": seed})

    e = wild_by_el
    gen1 = [
        breed(e["ember"][0], e["tide"][0], 777),     # the red x blue hue cross from GENOME.md
        breed(e["stone"][0], e["jade"][0], 101),
        breed(e["gale"][0], e["umbra"][0], 202),
        breed(e["ember"][0], e["ember"][1], 303),    # homozygous element
        breed(e["tide"][1], e["gale"][1], 404),
        breed(e["umbra"][1], e["jade"][1], 505),
    ]
    gen2 = [
        breed(gen1[0], gen1[1], 606), breed(gen1[2], gen1[3], 707),
        breed(gen1[4], gen1[5], 808), breed(gen1[0], gen1[5], 909),
        breed(gen1[1], gen1[4], 1001), breed(gen1[2], e["stone"][1], 1101),
    ]
    gen3 = [breed(gen2[0], gen2[1], 1201), breed(gen2[2], gen2[3], 1301),
            breed(gen2[4], gen2[5], 1401), breed(gen2[1], gen2[2], 1501)]
    breed(gen3[0], gen3[3], 1601)                    # generation 4

    # A fusion (8% of mismatched-element crosses). The seed is found by a fixed, ordered
    # search, so the result is the same on every run; it is recorded as a plain seed.
    a, b = e["ember"][1], e["tide"][1]
    for seed in range(1, 10000):
        child = G.breed(genomes[a], genomes[b], seed)
        if child.element[0] not in (genomes[a].element[0], genomes[b].element[0]):
            breed(a, b, seed)
            break
    assert len(genomes) == 32, len(genomes)
    return genomes, recipes


def edge_vectors():
    halves = [0.5, 1.5, 2.5, 3.5, 4.5, -0.5, -1.5, -2.5, 2.4999999999999996, 2.5000000000000004]
    mods = [-0.3, 1.7, -1.0, 0.0, -0.0, -1e-17, 2.0, -2.75, 0.9999999999999999]
    circ = [[0.06, 0.57], [0.57, 0.06], [0.99, 0.01], [0.01, 0.99], [0.25, 0.75],
            [0.0, 0.5], [0.3, 0.3], [0.97, 0.02]]
    clamps = [[-0.0, 0.0, 1.0], [0.0, -0.0, 1.0], [1.5, 0.0, 1.0], [-0.5, 0.0, 1.0]]
    reprs = [0.015625, 0.046875, 1e-05, 5e-06, -1e-06, -4e-06, 1.0, 14.0, 0.1 + 0.2,
             0.123455, 0.123445, 12345.678915, -0.22, 1e16, 123456789012.34567, 0.7, 3]
    return {
        "roundHalfEven": [[x, round(x)] for x in halves],
        "floorMod1": [[x, x % 1.0] for x in mods],
        "circMean": [[a, b, G.circ_mean(a, b)] for a, b in circ],
        # [x, lo, hi, min(max(x, lo), hi)] — signed zero survives Python's tie rule
        "clamp": [[x, lo, hi, min(max(x, lo), hi)] for x, lo, hi in clamps],
        # [x, json.dumps(round(x, 5))] — the exact text gid() hashes
        "round5Repr": [[x, json.dumps(round(x, 5))] for x in reprs],
    }


def constructed(genomes):
    """Genomes with hand-set alleles that land expression on the cases random draws never
    hit. A co-dominant blend of two integers lands exactly on .5, and only there do
    Python's round() and JS Math.round() disagree. Run 10 swapped pyRound for Math.round
    in the port and all 32 random genomes still passed. These are what catch that."""
    import copy
    cases = [
        # 4.5 -> 4 (Math.round says 5); 2.5 -> 2 (3); 0.5 -> 0 (1); 3.5 -> 4 (both)
        {"base": 0, "set": {"toeCount": [[4.0, True], [5.0, True]],
                            "hornCount": [[2.0, False], [3.0, False]],
                            "tailTip": [[0.0, True], [1.0, True]],
                            "pattern": [[3.0, True], [4.0, True]]}},
        # hue across the wheel's zero, co-dominant -> short arc; 6.5 -> 6 at hornCount's top
        {"base": 5, "set": {"hue": [[0.98, True], [0.04, True]],
                            "hornCount": [[6.0, True], [7.0, True]],
                            "wingFingers": [[2.0, False], [5.0, False]],
                            "crestType": [[1.0, True], [2.0, True]]}},
        # a dominant allele wins outright, so no blend and no rounding tie
        {"base": 12, "set": {"spineCount": [[8.5, True], [3.0, False]],
                             "hue": [[0.5, False], [0.25, True]]}},
    ]
    out = []
    for c in cases:
        gm = copy.deepcopy(genomes[c["base"]])
        for k, pair in c["set"].items():
            gm.g[k] = [G.Allele(v, d) for v, d in pair]
        out.append({"base": c["base"], "set": c["set"], "phenotype": gm.phenotype,
                    "rarity": gm.rarity(), "gid": gm.gid()})
    return out


def main():
    with open(os.path.join(HERE, "genome.py"), "rb") as fh:
        genome_sha = hashlib.sha256(fh.read()).hexdigest()
    genomes, recipes = build_recipes()
    records = []
    for gm, recipe in zip(genomes, recipes):
        rec = gm.to_json()
        rec["recipe"] = recipe
        rec["phenotype"] = gm.phenotype
        rec["rarity"] = gm.rarity()
        records.append(rec)
    data = {
        "generatedBy": "assetgen/genome_vectors.py",
        "genomeSha256": genome_sha,
        # A list, not a dict: sort_keys would reorder a dict, and this order is the Rng
        # draw order the port must follow.
        "genes": [[k, *v] for k, v in G.GENES.items()],
        "genomes": records,
        "constructed": constructed(genomes),
        "edge": edge_vectors(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
        fh.write("\n")
    els = sorted({"/".join(r["element"]) for r in records})
    fusions = sum(1 for r in records if r["recipe"]["op"] == "breed"
                  and r["element"][0] not in (records[r["recipe"]["a"]]["element"][0],
                                              records[r["recipe"]["b"]]["element"][0]))
    print(f"{os.path.relpath(OUT, REPO)}: {len(records)} genomes "
          f"(max generation {max(r['generation'] for r in records)}, {fusions} fusion(s), "
          f"{len(els)} element pairs), genome.py {genome_sha[:12]}")


if __name__ == "__main__":
    main()
