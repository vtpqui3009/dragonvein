# ASSET PLAN — the catalogue, and how one team of agents fills it

Assets are the largest workstream in this project. A sky-world that feels alive needs
hundreds of distinct things on screen, moving, lit, and varied. This document is the
target. `STATE.md` tracks what exists against it.

## The multiplier that makes this possible

We do not author 2 000 models. We author **~70 generators**, each taking a seed and a
parameter set, and each producing a family of variants that never repeat exactly.

```
authored generators (~70)  ×  seeded parameter space  =  effectively unbounded variety
```

This is the same trick as the dragon genome, applied to everything: a tree is a genome,
a rock is a genome, a hatchery is a genome. Variation is free; the generator is the work.

Rules that keep this honest:
- A generator that produces only one usable look is a failed generator. Every generator
  ships with a **variant sheet** (`artifacts/variants/<id>.png`, 8 seeds side by side),
  and the `art-critic` rejects it if the 8 read as the same object.
- Every generator exposes an **LOD parameter**. LOD0 is the hero mesh, LOD2 is what 200
  instances on screen use.
- Every generator declares its triangle budget and is failed by `gate:assets` if it
  exceeds it.

## A. Creatures

| id | what | generators | variants | notes |
|---|---|---|---|---|
| A1 | **Dragon** | 1 | unbounded | the genome system; see `GENOME.md` |
| A2 | Ambient fauna | 6 | ~8 each | sky-fish, lantern moths, rock crabs, cloud jellies, nest birds, grazers |
| A3 | Leviathan bosses | 3 | hand-tuned | built from the dragon generator with unique crown/tail parts |
| A4 | Hatchlings | — | derived | the dragon generator at juvenile proportions |

Liveliness depends on A2 more than on A1. An island with no birds, no insects and no
critters reads dead no matter how good the dragon is.

## B. Flora — the single biggest driver of a living world

| id | what | generators | notes |
|---|---|---|---|
| B1 | Canopy trees | 5 | broadleaf, conifer, fan-palm, wind-twisted, ancient giant |
| B2 | Understory | 8 | bushes, ferns, reeds, grass clumps, flowering shrubs, saplings |
| B3 | Ground cover | 4 | grass cards, moss, lichen, fallen leaves |
| B4 | Hanging growth | 4 | vines, root curtains, hanging moss, creepers |
| B5 | Crops & herbs | 6 | the garden loop; 4 growth stages each |
| B6 | Mushrooms & oddities | 3 | glowing fungi for night readability |

All flora is **wind-animated in the vertex shader** — no skinned animation, no CPU cost.
Static vegetation is the fastest way to make a 3D world look like a screenshot.

## C. Terrain

| id | what | generators | notes |
|---|---|---|---|
| C1 | Island base | 1 | shape, size, biome, edge erosion, underside taper |
| C2 | Cliffs & rock faces | 5 | stratified, columnar, boulder pile, shard, eroded |
| C3 | Landmarks | 4 | arches, pillars, floating shards, crater rims |
| C4 | Water | 3 | pond, waterfall, cloud-sea |
| C5 | Paths & terraces | 2 | |

## D. Structures

| id | what | count | tiers | notes |
|---|---|---|---|---|
| D1 | Creature buildings | 6 | 3 | hatchery, roost, nest, feeder, breeding shrine, pen |
| D2 | Traversal | 4 | 2 | bridge, gate, stair, lift |
| D3 | Decoration | 8 | 2 | totem, statue, banner, lantern, fence, bench, well, brazier |

~18 structures × tiers ≈ 54 distinct meshes, each with seeded dressing variation.

## E. VFX — ~20 effects

Element auras (6), breath attacks (6), hatch burst, level-up ring, pollen drift,
fireflies, dust puffs, rain, wind streaks, portal shimmer. GPU particles only.

## F. Audio

| id | what | notes |
|---|---|---|
| F1 | Ambient beds | wind, water, insects, birds — layered by biome and time of day |
| F2 | **Creature vocals** | **genome-driven**: body mass → pitch, neck length → formant, element → timbre. A bred dragon sounds like itself. |
| F3 | Interaction SFX | ~40 one-shots, synthesised |
| F4 | Music | 3 layers that rise with island population |

F2 is not a nice-to-have. It extends the hook: if the dragon you bred is visually unique
but sounds identical to every other dragon, the illusion breaks.

## G. UI

Element icons (6), gene icons (~28), item icons (~40), frames, buttons. SDF-rendered so
they stay crisp at any resolution.

## Pipeline

```
assetgen/<family>/<name>.py        authored generator (Python + bpy)
        │  npm run assets:build
        ▼
public/assets/<family>/<name>.glb   LOD0..LOD2, Draco-compressed
        │  npm run assets:render
        ▼
artifacts/variants/<name>.png       8-seed variant sheet  ──▶  art-critic
artifacts/turntables/<name>.webm    turntable              ──▶  art-critic
```

Runtime-generated assets (dragons) skip the `.glb` step: the TypeScript generator in
`src/assets/` builds `BufferGeometry` directly in a worker.

## Licence discipline

Third-party assets are permitted when the licence allows commercial redistribution. Every
one is recorded in `docs/ASSET_LICENSES.md` with source URL, licence, and date checked.
An asset with no entry there is deleted. HDRIs from Poly Haven (CC0) are the expected
exception to "everything is generated" — image-based lighting is worth the download.
