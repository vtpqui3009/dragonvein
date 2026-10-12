#!/usr/bin/env python3
"""Write the fixed vectors that prove src/core/rng.ts matches genome.Rng stream-for-stream.

    python3 -I assetgen/rng_vectors.py        # -> tests/fixtures/rng-vectors.json

CLAUDE.md §2.1: the seeded Rng in src/core/rng.ts "must match assetgen/genome.py
stream-for-stream". This script is the Python half of that proof; tests/rng.test.ts is
the TypeScript half, and it compares every value with `===`, not closeness.

The fixture pins genome.py's SHA-256. The test refuses a fixture written against an older
genome.py, so a change to the Python Rng cannot leave the two languages silently apart:
regenerate this file and the TS port has to keep up.

Pure Python, no bpy. Output is byte-identical on every run (sorted keys, fixed seeds).
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from genome import Rng  # noqa: E402

OUT = os.path.join(REPO, "tests", "fixtures", "rng-vectors.json")

# The edge cases of `seed & 0xFFFFFFFF or 0x9E3779B9`: zero and 2^32 hit the fallback,
# -1 and 0xFFFFFFFF both mask to all ones, 2^40+7 needs the mask to drop high bits, and
# the rest are ordinary. Every value is an integer JS represents exactly (< 2^53).
SEEDS = [1, 0, 2, 42, 123456789, 0x9E3779B9, 0xFFFFFFFF, -1, 2 ** 32, 2 ** 40 + 7]
STREAM = 1000
PICK_FROM = ["ember", "tide", "stone", "gale", "jade", "umbra", "void"]

# Interleaved calls, cycled, so the test also proves every helper consumes exactly the
# state Python's does — a helper that drew one extra next() would shift everything after.
OPS = [
    ("next",),
    ("range", -3.5, 7.25),
    ("int", 0, 9),
    ("int", -5, 5),
    ("chance", 0.3),
    ("pick",),
]
CYCLES = 200


def vectors_for(seed):
    r = Rng(seed)
    state = [r.a, r.b, r.c, r.d]
    stream = [r.next() for _ in range(STREAM)]
    r = Rng(seed)
    calls = []
    for _ in range(CYCLES):
        for op in OPS:
            if op[0] == "next":
                calls.append(r.next())
            elif op[0] == "range":
                calls.append(r.range(op[1], op[2]))
            elif op[0] == "int":
                calls.append(r.int(op[1], op[2]))
            elif op[0] == "chance":
                calls.append(r.chance(op[1]))
            else:
                calls.append(r.pick(PICK_FROM))
    return {"seed": seed, "stateAfterSeeding": state, "next": stream, "calls": calls}


def main():
    with open(os.path.join(HERE, "genome.py"), "rb") as fh:
        genome_sha = hashlib.sha256(fh.read()).hexdigest()
    data = {
        "generatedBy": "assetgen/rng_vectors.py",
        "genomeSha256": genome_sha,
        "ops": [list(op) for op in OPS],
        "cycles": CYCLES,
        "pickFrom": PICK_FROM,
        "vectors": [vectors_for(s) for s in SEEDS],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{os.path.relpath(OUT, REPO)}: {len(SEEDS)} seeds, {STREAM} next() + "
          f"{CYCLES * len(OPS)} interleaved calls each, genome.py {genome_sha[:12]}")


if __name__ == "__main__":
    main()
