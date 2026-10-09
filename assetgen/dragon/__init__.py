"""`dragon` — the reference (Blender) dragon generator.

The implementation lives in `builder.py`, which stays the source of truth. This file
exists so that `assetgen/dragon/` is a real package: callers do

    import dragon as D
    D.place(genome, location=(0, 0, 0), rotz=0.0, name="d0")

Without it Python treats the directory as a PEP 420 namespace package, which has no
attributes at all, so a clean checkout dies with
`AttributeError: module 'dragon' has no attribute 'place'` — which is exactly how the
Assets workflow failed. Nothing is re-implemented here; the names below are the
builder's public surface, listed explicitly rather than star-imported so a reader can
see what the module promises and `__all__` stays checkable.
"""

from .builder import (
    # mesh scaffolding
    Graph,
    lerp,
    bez,
    # skeleton and appendages
    skeleton,
    add_limbs,
    wing_nodes,
    add_wings,
    membrane,
    add_crown,
    # torso-derived ornament
    TORSO_PROFILE,
    torso_at,
    dorsal_spikes,
    tail_ornament,
    # materials
    hsv,
    ELEMENT_TINT,
    mats,
    paint_belly,
    # assembly: the one entry point most callers want
    place,
)

__all__ = [
    "Graph",
    "lerp",
    "bez",
    "skeleton",
    "add_limbs",
    "wing_nodes",
    "add_wings",
    "membrane",
    "add_crown",
    "TORSO_PROFILE",
    "torso_at",
    "dorsal_spikes",
    "tail_ornament",
    "hsv",
    "ELEMENT_TINT",
    "mats",
    "paint_belly",
    "place",
]
