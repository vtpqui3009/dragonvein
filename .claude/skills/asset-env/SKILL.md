---
name: asset-env
description: Set up and use headless Blender (bpy) for assetgen/ work — install, GL libraries, Cycles CPU rendering, byte-for-byte .glb reproducibility. Use before any step that runs assetgen/, npm run assets:build or assets:render (M1a onward).
---

# Headless Blender for `assetgen/`

Verified in the cloud container on 2026-10-11 (run 6 follow-up). Re-verify and update this
file if any line stops being true; do not work around it silently.

## Install (about 1 minute)

```sh
pip install bpy                    # got bpy 5.2.2 LTS on Python 3.13
export LIBGL_ALWAYS_SOFTWARE=1
python3 -c "import bpy; print(bpy.app.version_string)"
```

- `bpy` is a pip wheel, not a Blender GUI. There are no `.blend` files: every asset is a
  script (`CLAUDE.md` §1.1).
- `assetgen/README.md` lists the GL libraries for `apt-get`. In this container all of them
  were already present except `libegl1`, and `import bpy` plus a Cycles render worked
  without it. Install it only if a render fails with an EGL error.
- Run asset scripts with `python3 -I` (isolated mode), as the README says.

## Rendering

- Cycles on CPU (`scene.cycles.device = 'CPU'`), 4 cores. A 320×240, 16-sample still took
  **0.8 s**. A review frame at 1700×980 is quoted at 25–100 s in the README. Budget a
  turntable as frames × that, and keep samples low with denoising on for variant sheets.
- Render into `artifacts/` (variant sheets `artifacts/variants/<name>.png`, turntables
  `artifacts/turntables/<name>.webm`). `ffmpeg` is installed for assembling frames.
- Look at what you rendered with the Read tool before calling it done (`CLAUDE.md` §1.4).

## Byte-for-byte `.glb` (`CLAUDE.md` §1.2)

Measured: `bpy.ops.export_scene.gltf(export_format='GLB')` of the same scene gave the same
SHA-256 twice in one process **and** across two separate processes. That was a plain mesh
with a default material: **no textures, no Draco, no image compression**. Each of those
can add timestamps or encoder nondeterminism, so:

1. Build twice into two directories and compare hashes before committing any binary.
2. Seed everything from the genome or a fixed seed. Never use `random` without a seed, and
   never use wall-clock time.
3. If an exporter option breaks reproducibility, drop the option rather than relaxing the
   check.

## Pipeline shape (`docs/ASSET_PLAN.md` §Pipeline)

`assetgen/<family>/<name>.py` → `npm run assets:build` → `public/assets/<family>/<name>.glb`
(LOD0–2) → `npm run assets:render` → 8-seed variant sheet + turntable → art-critic. Every
committed binary is named in `public/assets/MANIFEST.json` with its generating script, and
`check:assets` enforces both rules. As of run 6, `assetgen/build_all.py` and
`assetgen/render_all.py` **do not exist yet**, although `package.json` calls them.

## Ownership

`assetgen/` belongs to `asset-builder`. `tools/` (e.g. `check:assets`) and
`public/assets/MANIFEST.json` wiring belong to `integrator`. Run the two sequentially, never
as a parallel fan-out (`CLAUDE.md` §2.4).
