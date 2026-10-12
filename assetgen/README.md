# assetgen — the authoring pipeline

Python + Blender (`bpy`, installed via `pip install bpy`). No Blender GUI, no `.blend`
files: every asset is a script, so a later run can re-tune it and a reviewer can read it.

```
genome.py            the gene spec and breeding maths (mirrored by src/core/genome.ts)
dragon/builder.py    genome -> mesh. The reference implementation.
dragon/__init__.py   re-exports builder's public surface, so `import dragon` works
flora/broadleaf.py   B1 broadleaf canopy tree. seed -> tree, LOD0/1/2.
render_proof.py      renders the species lineup and the breeding triptych
build_all.py         exports every generator to public/assets/**/*.glb (LOD0-2)
render_all.py        renders variant sheets and turntables into artifacts/
```

## Writing a generator

Every authored generator is one module under `assetgen/<family>/<name>.py` exposing:

| name | what |
|---|---|
| `FAMILY`, `NAME` | the asset id is `FAMILY/NAME`, and that is the key in `MANIFEST.json` |
| `PARAMS` | `{name: (lo, hi, "what it does")}` — every number the mesh is built from |
| `BUDGET` | `{"lod0": n, "lod1": n, "lod2": n}` triangle ceilings; `build_all.py` fails the build if one is exceeded |
| `PALETTE` | the asset's three-plus-one values, copied verbatim into the manifest |
| `SEED_FOR_COMMITTED` | which seed's mesh is the committed `.glb` |
| `build(seed, lod)` | returns one linked Blender object |
| `metrics(seed)` | silhouette numbers (height, canopy width, lean, counts) for variant probes |

Two rules that are easy to get wrong:

1. **Draw every random number in a LOD-independent pass.** `broadleaf.plan(seed)` draws
   the entire tree as data, in a fixed order; `build(seed, lod)` only tessellates it.
   If the LOD changes how many times the `Rng` is called, LOD2 of a seed is a *different
   tree* from LOD0 of the same seed, and the chain is a lie.
2. **Noise must be a function of position or direction, not of vertex index.** Otherwise
   the same rule bites: a coarser mesh samples a different shape instead of the same
   shape more cheaply.

Register the module in `GENERATORS` in `build_all.py` — a list of dicts, so adding the
next generator is one row.

## Reproducibility

`python3 -I assetgen/build_all.py --verify` builds the whole set twice, **in two separate
processes**, into two scratch directories and compares SHA-256 per file. That is the
check `CLAUDE.md` §1.2 asks for. Keep exports free of textures, Draco and image
compression; each of those has its own source of nondeterminism.

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
