# assetgen — the authoring pipeline

Python + Blender (`bpy`, installed via `pip install bpy`). No Blender GUI, no `.blend`
files: every asset is a script, so a later run can re-tune it and a reviewer can read it.

```
genome.py            the gene spec and breeding maths (mirrored by src/core/genome.ts)
dragon/builder.py    genome -> mesh. The reference implementation.
dragon/__init__.py   re-exports builder's public surface, so `import dragon` works
render_proof.py      renders the species lineup and the breeding triptych
build_all.py         exports every generator to public/assets/**/*.glb (LOD0-2)
render_all.py        renders variant sheets and turntables into artifacts/
```

## Running it

```sh
pip install bpy
# headless rendering needs GL/EGL libraries present:
apt-get install -y libegl1 libgl1 libglx-mesa0 libgl1-mesa-dri libxi6 libxxf86vm1 \
                   libxrender1 libxfixes3 libxkbcommon0 libsm6 libice6 libgomp1
export LIBGL_ALWAYS_SOFTWARE=1
python3 -I render_proof.py
```

Cycles renders on CPU — roughly 25–100 s for a review frame at 1700×980 on 4 cores. That
is fast enough to gate every asset on a render, which is the whole point: an asset nobody
looked at is not finished.

## Why Blender and not only runtime generation

Runtime generation (TypeScript, in `src/assets/`) is what builds a *bred* dragon, because
that mesh does not exist until the player breeds it. Blender is for everything else:
authored props, LOD chains, baked textures, and the high-quality reference renders the
`art-critic` scores against. The dragon exists in both, and `gate:parity` keeps them honest.
