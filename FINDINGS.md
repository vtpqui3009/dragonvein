# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M5a — run 19, 2026-10-12 — cycle 1, at `e377e1d`

**Scores: art-critic 8.4 · perf-critic 8.4 · gameplay-critic 9.2.** No blocking defect. All
three are ≥ 8.0, so **M5a ships** on its first pass. Every criterion holds:
- 220 instances;
- 9 002 changed pixels between the two wind shots, 86.8 % of them on foliage;
- draws 28, triangles 174 012;
- heap within budget;
- `cpuFrameMs.p95` 1.9.

## perf-critic — 8.4 (all six lines)

P1 1.5 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [major] P1: the real-GPU row (`3ab6e84`, 42 268 triangles) says nothing about a scene with
  174 012 triangles and a vertex-shader patch. It needs a sighting at or after this commit.
  That is for the owner.
- [minor] There is no isolated cost for the wind, such as a run with wind off or with no
  trees. If a real GPU shows pressure:
  - LOD2 for the far trees;
  - no wind on LOD2;
  - no shadows past a radius.
- [minor] P6: no real-hardware Potato figure. Potato still draws 142 800 triangles, so drop
  the tree LOD on low tiers before M6.
- [minor] P4: the margin depends on the idle correction (`uncorrectedBytesPerFrame 47146`).
  Future props must not add draws.

SCORE_MACHINE: 8.4

## art-critic — 8.4 (all nine lines)

A1 1.0 · A2 0.8 · A3 1.1 · A4 1.4 · A5 0.9 · A6 1.1 · A7 1.0 · A8 0.7 · A9 0.45.

- [major → not this step] A5 `shots/01-wide.png`, x≈485 y≈345–400: "thin pale mauve
  columns". These are the existing snags, dead trunks that are pale by design
  (`src/main.ts` §snag). They predate M5a. Whether they read as poles is open for M5e.
- [major → not this step] A5 `01-wide.png`, companion x≈360–510 y≈625–650 and x 690–790:
  bushes and rocks hang past the rim. The companion dressing is unchanged by M5a, so this
  predates it. Open for M5e.
- [minor] A8/A3 `11-wind-a.png` 6× crop x440–640 y300–430: a thin orange rim-light fringe
  on the canopy lobe edges.
- [minor] A2: the generated trunks render near-black in game but brown on the sheet. Check
  the ambient and normals on the instanced material.
- [minor] A4: in-game, every tree is one seed and shares one canopy mass.
- [minor] A6: the left oval companion is half bare deck.
- [minor] A5: the sway is about 1 px at 720p, so it is restrained to the point of being
  under-sold. The conifers stay rigid.
- [minor, carried] AC7 haze: 17.2 % of the sky rows are over ΔE 12.
- [minor] A9: no dragon in the frame.

SCORE_MACHINE: 8.4

## gameplay-critic — 9.2 (5.2 of 5.2; G2, G4, G5 n/a)

G1 2.2 · G3 1.4 · G6 1.6.

The critic's own probes of loading:
- Trees that arrive late, during context loss, or not at all (404) all degrade gracefully.
- Input works before the trees exist.

Defects:
- [minor] The trees pop in after the boot splash is removed (`src/main.ts:2410`).
- [minor] A failed tree load shows only in `console.error`.
- [minor] The frame where the trees arrive costs 4.4 ms of CPU, once, outside the gate
  window.

SCORE_MACHINE: 9.2

---

# M4d — run 18, 2026-10-12 — cycle 1, at `e699c95`

**Scores: art-critic 8.3 · perf-critic 8.7 · gameplay-critic 9.0.** No blocking defect. Art per
generator: arch 8.4, floatshard 8.2. Every critic and every generator is ≥ 8.0, so **M4d
ships** on its first pass. Every M4 step is now `DONE`. The milestone waits on the owner
seeing the assets (CLAUDE.md §7).

## perf-critic — 8.7 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [minor] The perf artefacts do not exercise M4d: nothing under `src` loads the landmarks.
  Draws 27 and triangles 42 268 are unchanged.
- [minor] The real-GPU log is stale for M4: the last row is a sighting at `3ab6e84`.
- [minor, forward] P4 headroom: `heap.bytesPerFrame 33025` of 40 960, about 4 more draws.
  Place the assets as one `InstancedMesh` per type.
- [minor] There is no real-hardware Potato figure.

SCORE_MACHINE: 8.7

## art-critic — 8.3 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.25 · A5 0.9 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.5.

- [major] A4 `variants/floatshard.png`: seeds 1 and 3 are both one big grass-capped cone
  plus a satellite, and seeds 5 and 6 are both bare debris fields.
- [major, carried] A6 `shots/01-wide.png`: no landmark is placed (M5e).
- [minor] A1 `variants/floatshard.png`, seed 6 (x≈1300–1450): the fragments fuse into one
  mound, and the tiny satellites vanish at 25 %.
- [minor] A4 `variants/arch.png`, seeds 2 and 5: each reads as a squat block with a tunnel
  (seed 5 hole 0.40).
- [minor] A5 `turntables/floatshard.webm` at about 1.0 s: a fragment clips into the main
  rim.
- [minor] A5 `variants/arch.png`, seed 7: rubble sits inside the span, and the opening has
  step-like ledges.
- [minor] A3 floatshard: the undersides are near deepShadow, so the facets are hard to
  read.
- [minor] A2 arch: dusk reads as orange clay.
- [minor] A8: LOD1 and LOD2 are never rendered in the artefacts.

SCORE_MACHINE: 8.3

## gameplay-critic — 9.0 (G2, G4, G5 n/a)

G1 2.2 · G3 1.4 · G6 1.6, less 0.5 for the unexercised-asset gap and 0.3 for the sheet
minors.

- [major, informational] G1: no arch or floatshard appears in any shot or in the log. A
  placement step must add a shot.
- [minor] `variants/arch.png`, seeds 2 and 5: not clearly two-legged arches.
- [minor] `variants/floatshard.png`, seed 6: one fused mass; seeds 5 and 6 have no green.
- [minor] The probe prints "(fails at ≤ 8%)" on a passing run, which is easy to misread.

SCORE_MACHINE: 9.0

---

