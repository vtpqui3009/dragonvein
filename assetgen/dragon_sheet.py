#!/usr/bin/env python3
"""Render the reference dragon sheet: the same 8 dragons as dragon.html, built by Blender.

    LIBGL_ALWAYS_SOFTWARE=1 python3 -I assetgen/dragon_sheet.py

Writes artifacts/variants/dragon-reference.png. The genomes, cell layout, yaw, centring
rule and orthographic camera are src/dragon-view.ts's sheet constants, so the runtime
sheet (artifacts/variants/dragon-body.png, tools/dragon-sheet.mjs) and this one put each
dragon in the same place. Side by side they answer ROADMAP M3b's "the creature reads as
the Python one" (STATE.md run 12).

The renderer differs on purpose. This one is Cycles under render_proof's studio light, the
runtime one is three.js under the game's rig. So compare shapes, parts and colours, not
shading.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from genome import breed, wild  # noqa: E402
import dragon as D  # noqa: E402
from dragon import builder as B  # noqa: E402
from render_proof import aim_ortho, ground, shoot, sky, studio  # noqa: E402

OUT = os.path.join(REPO, "artifacts", "variants", "dragon-reference.png")

# src/dragon-view.ts: SHEET and the SHEET_* constants.
SHEET = [
    ("A", "wild", 1, "ember"), ("B", "wild", 2, "tide"), ("C", "wild", 3, "stone"),
    ("D", "wild", 4, "gale"), ("E", "wild", 5, "jade"), ("F", "wild", 6, "umbra"),
    ("G", "breed", (0, 1), 7), ("H", "breed", (6, 2), 8),
]
COLS, COL_GAP, ROW_GAP, YAW = 4, 9.5, 12, -0.55
ELEVATION_DEG, ORTHO_WIDTH, TARGET = 32, 44, (0.0, 0.0, 1.2)  # TARGET in Blender's z-up frame


def genomes():
    out = []
    for _, op, a, b in SHEET:
        out.append(wild(a, b) if op == "wild" else breed(out[a[0]], out[a[1]], b))
    return out


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for k, gm in enumerate(genomes()):
        p = gm.phenotype
        g, idx, _ = B.skeleton(p)
        B.add_limbs(g, idx, p); B.add_wings(g, idx, p); B.add_crown(g, idx, p)
        xs = [v[0] for v in g.v]
        cx = (min(xs) + max(xs)) / 2
        col, row = k % COLS, k // COLS
        # three.js cell (x, 0, z) is Blender (x, -z, 0); the dragon sits -cx along its own
        # x axis, turned by YAW about the vertical.
        cell = ((col - (COLS - 1) / 2) * COL_GAP, -(row - 0.5) * ROW_GAP)
        loc = (cell[0] - cx * math.cos(YAW), cell[1] - cx * math.sin(YAW), 0.0)
        D.place(gm, location=loc, rotz=YAW, name=f"d{k}")
        print(f"  {SHEET[k][0]} {gm.gid()} {gm.element} horns={int(p['hornCount'])} "
              f"crest={int(p['crestType'])} spines={int(p['spineCount'])} tail={int(p['tailTip'])} "
              f"wings={B.wing_form(p)} (fingers={int(p['wingFingers'])} shape={p['wingShape']:.3f})", flush=True)
    ground((0.36, 0.33, 0.33)); sky((0.36, 0.37, 0.38), (0.36, 0.37, 0.38), (0.36, 0.37, 0.38), 1.0); studio()
    aim_ortho(TARGET, 90 - ELEVATION_DEG, 0, 60, ORTHO_WIDTH)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    shoot(OUT, 1800, 760, 24)


if __name__ == "__main__":
    main()
