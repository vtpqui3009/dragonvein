# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M5b — run 20, 2026-10-13 — cycle 2, at `02a0495`

**Scores: art-critic 8.55 · perf-critic 8.4 · gameplay-critic 8.8** (perf and gameplay carried
from cycle 1). The rework touched only `assetgen/flora/{fanpalm,windtwisted}.py` and their
`.glb` files, which the game does not load, and the gates were re-run green. Art per
generator: conifer 8.7, fanpalm 8.2, windtwisted 8.1. Every generator is ≥ 8.0, so **M5b
ships**.

## art-critic — 8.55 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.1 · A4 1.35 · A5 0.95 · A6 1.0 · A7 1.0 · A8 0.75 · A9 0.5.

Fixed since cycle 1:
- fanpalm's detached blades on wire stems;
- fanpalm's near-twins 3/6;
- windtwisted's shared upright silhouettes;
- windtwisted's dish-shaped pad.

Improved:
- the trunk poking through pads;
- conifer seeds 5/7.

Defects:
- [minor] A4 fanpalm seeds 1 and 4: both a single bowed trunk with a radial feather crown.
- [minor] A4 windtwisted seeds 2 and 6 are both the cascade arch, and 1 and 5 are both the
  arm. About five classes in eight seeds.
- [minor] A1 fanpalm seed 3: flat plates read as a banana or ficus plant.
- [minor] A5 fanpalm seed 8: a frond still clips the trunk. Seed 2's crown plates overlap.
- [minor] A1 windtwisted seeds 2, 5 and 7: 3.8–4.6 m tall, they thin out at 25 %. Bias their
  size up at placement.
- [minor] A5 windtwisted seed 7: the stacked pads read as a lollipop. Seed 1's lowest pad
  sits on a thin neck.
- [minor] A3: no contact ring at the trunk bases.
- [minor, carried] A8: LOD1 and LOD2 are never rendered. A6: the trees are unplaced (M5e).

SCORE_MACHINE: 8.55

---

# M5b — run 20, 2026-10-12 — cycle 1, at `4852e51`

**Scores: art-critic 8.25 · perf-critic 8.4 · gameplay-critic 8.8.** No blocking defect. Art per
generator: conifer 8.8, fanpalm **7.7**, windtwisted 8.0. Fanpalm is below the per-generator
bar (ROADMAP §Definition of done 4), and windtwisted is on it with two majors. Both go to
rework cycle 2.

## perf-critic — 8.4 (all six lines)

P1 1.5 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [major, forward] P4/P2: `heap.bytesPerFrame 37443` of 40 960, about 2 draws of headroom.
  When the trees are placed (M5e), merge the four kinds per LOD into a shared pass. Do not
  add an `InstancedMesh` per kind per LOD, and do not raise the budget.
- [major, carried, owner] P1: the real-GPU row predates the scene with 174k triangles and
  wind.
- [minor] The flora `triBudget` of 6000/2000/500 in MANIFEST is looser than the
  4000/1200/300 per prop in PERF_BUDGET §Other budgets. Make the two agree, or record why.
- [minor, carried] P6: no real-hardware Potato number. Potato draws 142 800 triangles.
- [minor] The new trees are unplaced, so their runtime cost is unmeasured.

SCORE_MACHINE: 8.4

## art-critic — 8.25 (all nine lines)

A1 0.95 · A2 0.9 · A3 1.1 · A4 1.25 · A5 0.8 · A6 1.0 · A7 1.0 · A8 0.75 · A9 0.5.

- [major] A5/A1 `variants/fanpalm.png` seeds 3, 6, 7 (x≈600–735, 1270–1380, 1570–1690):
  wire-thin frond stems carry detached wedge or fan blades partway along. They read as
  broken fronds. Seed 6 has a hanging wedge at (1345, 200).
- [major] A4 `variants/windtwisted.png`: seeds 1, 6 and 8 share one silhouette, a near-upright
  trunk with three stacked pads. Seeds 4 and 5 share another. Seeds 6 and 8 have lean 0.50
  and 0.44, so they do not read as wind-twisted.
- [major] A4/A5 `variants/fanpalm.png`: seeds 3 and 6 are near-twins, sparse and leaning.
  Seeds 1, 4 and 5 are one radial crown at three heights.
- [major] A5 `turntables/windtwisted.webm` at about 0.33 s: the bottom pad reads as a hollow
  dish with a rim. Seed 1's pads sit on thin necks, and seed 8's top pad is a lollipop.
- [minor] A5 fanpalm seed 8 (x≈2640–2690): a drooping frond's back clips against the trunk.
- [minor] A1 windtwisted seed 2: 2.0 m tall, it vanishes at 25 %.
- [minor] A5 windtwisted seeds 4 and 7: the trunk pokes through the pads.
- [minor] A4 conifer: seeds 5 and 7 are both squat bells.
- [minor, carried] A6: the trees are unplaced (M5e). A8: LOD1 and LOD2 are never rendered.

SCORE_MACHINE: 8.25

## gameplay-critic — 8.8 (G2, G4, G5 n/a)

G1, G3 and G6 pass. The playable build is unchanged since M5a.

- [minor] Fanpalm seeds 3, 6 and 7 have detached-looking fronds (art).
- [minor] Windtwisted seed 2 is tiny.
- [observation] The trees are not placed, so they are untestable in the game loop.

SCORE_MACHINE: 8.8

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

