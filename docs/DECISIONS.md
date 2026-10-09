# DECISIONS

Decisions that are expensive to reverse, with the reasoning as it stood at the time.
Append; do not rewrite history.

## 2026-10-09 — Blender `bpy` as the authoring pipeline, not AI 3D generation

AI 3D generators (Meshy, Tripo, Hunyuan3D, TRELLIS) were evaluated first because the game
is asset-heavy. They were rejected as the *backbone*:

- Hosted services with clean commercial terms need a paid plan and an API key, so an
  unattended daily run cannot depend on them.
- The strongest self-hostable option (TRELLIS.2, MIT) wants roughly 24 GB of VRAM. The
  build container has no GPU at all.
- Terms shift and some carry territory clauses, which is a poor foundation for a project
  that will run unattended for months.

`pip install bpy` gives Blender 5.2.2 LTS as a Python module with no GUI. It models,
rigs, assigns PBR materials, exports glTF, and path-traces on CPU in tens of seconds.
The generator script is the source of truth, so it is reviewable, diffable, re-tunable by
a later run, and free.

AI generation stays available as an *accelerator* for hero assets if the owner supplies a
key. It is not a dependency.

## 2026-10-09 — Two dragon builders, kept in sync by a gate

A bred dragon has no mesh until the moment it is bred, so the runtime builder must be
TypeScript in a worker. But the review pipeline needs Blender-quality renders. Rather
than pick one, both exist and `gate:parity` fails the build when they disagree on a fixed
genome set. `docs/GENOME.md` is the arbiter.

The cost is real: every genome change touches two implementations. It is accepted because
the alternative — reviewing assets only through a software-rasterised browser screenshot —
would make the art bar unenforceable.

## 2026-10-09 — Runtime dependencies: `three` only

Physics, ECS and state libraries were all considered and all rejected for now. The bundle
budget is 1.4 MB gzipped and `three` alone is most of it. Anything added must record its
measured before/after cost here.
