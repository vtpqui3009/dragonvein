#!/usr/bin/env python3
"""Render the review artefacts the art-critic scores.

    python3 -I assetgen/render_all.py                 # every registered generator
    python3 -I assetgen/render_all.py --only flora/broadleaf
    python3 -I assetgen/render_all.py --quick         # small + noisy, for iterating

Produces, per asset:
    artifacts/variants/<name>.png      8 seeds (1..8), one camera, one light rig,
                                       one scale, neutral backdrop, each labelled
    artifacts/turntables/<name>.webm   LOD0, a full 360 deg revolution, 36 frames

Seeds are always 1..8. If the eight read as one object the generator is wrong and gets
fixed; the seed list never does (`ops/build-prompt.md`, rubric A4 is blocking).

Lighting follows `docs/ART_BIBLE.md` §Lighting: one key sun, one cool fill at ~20% of
key from the opposite side, one warm rim. The ground plane is there so every tree has a
contact shadow — an object without one floats, and floating reads as broken.

The view transform is Standard, not AgX, on purpose: these frames are also the input to
the palette check (`STATE.md` run 7, criterion 7), and a film-emulation tone curve would
move every measured colour away from the palette it is being measured against.
"""
import argparse
import importlib
import math
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from build_all import GENERATORS  # noqa: E402  (one registry, not two)

VARIANT_SEEDS = (1, 2, 3, 4, 5, 6, 7, 8)

# --- light rig, tuned so a sunlit surface renders close to its own albedo ---
KEY_ENERGY = 3.80
KEY_COLOUR = (1.0, 0.957, 0.902)
FILL_ENERGY_FRACTION = 0.20
FILL_COLOUR = (0.52, 0.66, 1.0)
RIM_COLOUR = (1.0, 0.62, 0.36)
WORLD_GREY = 0.62
BACKDROP = (0.212, 0.224, 0.236)      # neutral, slightly cool
GROUND = (0.112, 0.121, 0.140)        # neutral grey; deliberately not a
                                      # bark-like brown, so a palette probe
                                      # cannot confuse backdrop with trunk


def _clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _world(strength=1.0):
    w = bpy.data.worlds.new("backdrop")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (*BACKDROP, 1.0)
    bg.inputs[1].default_value = WORLD_GREY * strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def _lights():
    """Key sun, cool fill, warm rim. One rig for every artefact in this file."""
    bpy.ops.object.light_add(type="SUN", location=(14.0, -10.0, 22.0))
    key = bpy.context.object
    key.data.energy = KEY_ENERGY
    key.data.angle = math.radians(2.6)          # tight-ish: a readable contact shadow
    key.data.color = KEY_COLOUR
    key.rotation_euler = (math.radians(52.0), 0.0, math.radians(38.0))

    bpy.ops.object.light_add(type="SUN", location=(-16.0, -12.0, 14.0))
    fill = bpy.context.object
    fill.data.energy = KEY_ENERGY * FILL_ENERGY_FRACTION
    fill.data.angle = math.radians(42.0)
    fill.data.color = FILL_COLOUR
    fill.rotation_euler = (math.radians(66.0), 0.0, math.radians(-124.0))

    bpy.ops.object.light_add(type="SUN", location=(-4.0, 18.0, 10.0))
    rim = bpy.context.object
    rim.data.energy = KEY_ENERGY * 0.34
    rim.data.angle = math.radians(14.0)
    rim.data.color = RIM_COLOUR
    rim.rotation_euler = (math.radians(74.0), 0.0, math.radians(188.0))


def _ground(size=150.0):
    bpy.ops.mesh.primitive_plane_add(size=size)
    g = bpy.context.object
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*GROUND, 1.0)
    b.inputs["Roughness"].default_value = 0.95
    g.data.materials.append(mat)
    return g


def _label(text, loc, size, rx, rz):
    """A seed label that faces the camera exactly, whatever the camera angle is."""
    bpy.ops.object.text_add(location=loc)
    t = bpy.context.object
    t.data.body = text
    t.data.align_x = "CENTER"
    t.data.align_y = "CENTER"
    t.data.size = size
    t.rotation_euler = (rx, 0.0, rz)
    mat = bpy.data.materials.get("label") or bpy.data.materials.new("label")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (0.92, 0.94, 0.96, 1.0)
    em.inputs[1].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    t.data.materials.append(mat)
    return t


def _ndc_to_world(cam, ndc_x, ndc_y, width, height, dist):
    """Exact placement for an ortho camera: put something at a chosen point of the
    frame instead of guessing a world position and hoping it is not clipped."""
    half_w = cam.data.ortho_scale * 0.5
    half_h = half_w * height / width
    return cam.matrix_world @ type(cam.location)((ndc_x * half_w, ndc_y * half_h, -dist))


def _aim_ortho(target, rx_deg, rz_deg, dist, scale):
    """Place an ortho camera so `target` is dead centre (same maths as render_proof)."""
    rx, rz = math.radians(rx_deg), math.radians(rz_deg)
    dx, dy, dz = 0.0, math.sin(rx), -math.cos(rx)
    wx = math.cos(rz) * dx - math.sin(rz) * dy
    wy = math.sin(rz) * dx + math.cos(rz) * dy
    loc = (target[0] - wx * dist, target[1] - wy * dist, target[2] - dz * dist)
    bpy.ops.object.camera_add(location=loc, rotation=(rx, 0.0, rz))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.data.clip_end = 2000.0
    bpy.context.scene.camera = cam
    return cam, (rx, rz)


def _aim_persp(target, rx_deg, rz_deg, dist, lens=58.0):
    rx, rz = math.radians(rx_deg), math.radians(rz_deg)
    dx, dy, dz = 0.0, math.sin(rx), -math.cos(rx)
    wx = math.cos(rz) * dx - math.sin(rz) * dy
    wy = math.sin(rz) * dx + math.cos(rz) * dy
    loc = (target[0] - wx * dist, target[1] - wy * dist, target[2] - dz * dist)
    bpy.ops.object.camera_add(location=loc, rotation=(rx, 0.0, rz))
    cam = bpy.context.object
    cam.data.lens = lens
    cam.data.clip_end = 2000.0
    bpy.context.scene.camera = cam
    return cam


def _configure(width, height, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.transparent_max_bounces = 2
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    return sc


def _shoot(path):
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ---------------------------------------------------------------- variant sheet
def variant_sheet(mod, out_path, quick=False):
    """8 seeds in one frame: one ortho camera, one rig, one scale."""
    _clean()
    _world()
    _lights()
    _ground()

    # Measure every tree first so the spacing and the frame come from the geometry
    # rather than from a guessed number.
    plans = [mod.metrics(s) for s in VARIANT_SEEDS]
    widths = [p["canopyWidth"] for p in plans]
    tallest = max(p["height"] for p in plans)
    pitch = max(widths) * 0.86 + 1.1
    span = pitch * (len(VARIANT_SEEDS) - 1)

    # rz must be 0: any camera yaw tilts a row laid out along X in screen space, and a
    # sheet whose eight panels slope is a sheet that crops the last one.
    rx_deg, rz_deg = 83.0, 0.0
    objs = []
    for i, seed in enumerate(VARIANT_SEEDS):
        ob = mod.build(seed, 0)
        ob.location = ((i - (len(VARIANT_SEEDS) - 1) / 2.0) * pitch, 0.0, 0.0)
        # A fixed per-index yaw, so neighbours do not line their branches up by accident.
        ob.rotation_euler = (0.0, 0.0, math.radians(-26.0 + 11.0 * i))
        objs.append(ob)

    # The frame comes from the content: as wide as the row, as tall as the tallest
    # tree plus a label band. Guessing a resolution is what leaves half a sheet empty.
    scale = span + max(widths) * 1.22
    width = 1200 if quick else 2880
    vert = tallest + 2.9                      # 1.9 under the row for labels, 1.0 over
    height = int(round(width * vert / scale / 2.0)) * 2
    vert = scale * height / width
    floor_z = -1.9
    centre_z = floor_z + vert * 0.5
    cam, (rx, rz) = _aim_ortho((0.0, 0.0, centre_z), rx_deg, rz_deg, 180.0, scale)

    half_w = scale * 0.5
    for i, seed in enumerate(VARIANT_SEEDS):
        x = (i - (len(VARIANT_SEEDS) - 1) / 2.0) * pitch
        pos = _ndc_to_world(cam, x / half_w, -0.80, width, height, 120.0)
        _label(f"seed {seed}", pos, scale * 0.018, rx, rz)

    _configure(width, height, 10 if quick else 44)
    print(f"  variant sheet {width}x{height}  pitch={pitch:.1f}m  ortho={scale:.1f}m",
          flush=True)
    _shoot(out_path)
    print(f"  -> {os.path.relpath(out_path, REPO)}", flush=True)
    return out_path


# ---------------------------------------------------------------- turntable
def turntable(mod, out_path, frames=36, quick=False):
    """LOD0, one full revolution, assembled with ffmpeg into a .webm."""
    seed = int(getattr(mod, "SEED_FOR_COMMITTED", 1))
    _clean()
    _world()
    _lights()
    _ground()
    ob = mod.build(seed, 0)
    # Fit the camera to the volume the tree *sweeps* as it turns, not to its bounding
    # box in one pose: the crown is off-axis, so a box fit clips it a quarter-turn later.
    radial = max(math.hypot(v.co.x, v.co.y) for v in ob.data.vertices)
    zs = [v.co.z for v in ob.data.vertices]
    zmin, zmax = min(zs), max(zs)
    centre_z = (zmin + zmax) * 0.5
    sphere = math.hypot(radial, (zmax - zmin) * 0.5)
    lens = 55.0
    half_angle = math.atan(36.0 * 0.5 / lens)
    dist = sphere / math.sin(half_angle) * 1.16
    _aim_persp((0.0, 0.0, centre_z), 80.0, 16.0, dist, lens=lens)

    size = 240 if quick else 512
    _configure(size, size, 10 if quick else 30)
    n = 8 if quick else frames
    scratch = tempfile.mkdtemp(prefix="dragonvein-turntable-")
    try:
        print(f"  turntable seed {seed}  {n} frames at {size}x{size}", flush=True)
        for i in range(n):
            ob.rotation_euler = (0.0, 0.0, 2.0 * math.pi * i / n)
            _shoot(os.path.join(scratch, f"f{i:03d}.png"))
            print(f"    frame {i + 1}/{n}", flush=True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        keep = os.path.join(REPO, "artifacts", "turntables",
                            f"{mod.NAME}.frame00.png")
        shutil.copyfile(os.path.join(scratch, "f000.png"), keep)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "18",
               "-i", os.path.join(scratch, "f%03d.png"),
               "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
               "-b:v", "0", "-crf", "33", "-row-mt", "1", out_path]
        proc = subprocess.run(cmd)
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise RuntimeError(f"ffmpeg failed ({proc.returncode}) for {out_path}")
        print(f"  -> {os.path.relpath(out_path, REPO)} "
              f"({os.path.getsize(out_path) // 1024} KiB)", flush=True)
        print(f"  -> {os.path.relpath(keep, REPO)} (frame 0, for eyeballing)", flush=True)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    return out_path


# ---------------------------------------------------------------- driver
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", default=None, help="asset id, e.g. flora/broadleaf")
    ap.add_argument("--frames", type=int, default=36, help="turntable frames (>= 24)")
    ap.add_argument("--quick", action="store_true", help="small and noisy, for iterating")
    ap.add_argument("--skip-turntable", action="store_true")
    ap.add_argument("--skip-variants", action="store_true")
    args = ap.parse_args(argv)
    if args.frames < 24:
        print("frames must be >= 24 (CLAUDE.md §1.4 / STATE.md criterion 6)",
              file=sys.stderr)
        return 1

    for spec in sorted(GENERATORS, key=lambda s: s["module"]):
        mod = importlib.import_module(spec["module"])
        asset_id = f"{mod.FAMILY}/{mod.NAME}"
        if args.only and args.only != asset_id:
            continue
        print(f"== {asset_id} ==", flush=True)
        if not args.skip_variants:
            variant_sheet(mod, os.path.join(REPO, "artifacts", "variants",
                                            f"{mod.NAME}.png"), quick=args.quick)
        if not args.skip_turntable:
            turntable(mod, os.path.join(REPO, "artifacts", "turntables",
                                        f"{mod.NAME}.webm"),
                      frames=args.frames, quick=args.quick)
    print("assets:render OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
