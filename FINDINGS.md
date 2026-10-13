# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M5d — run 23, 2026-10-13 — cycle 1, at `9e1a2b6`

**Scores: art-critic 8.3 · perf-critic 8.65 · gameplay-critic 9.7.** No blocking defect, and
all three critics are ≥ 8.0 — but M5d is accepted **per generator** (run 22 criterion 6), and
art puts **fern at 7.7**: bush 8.6, reeds 8.2, grassclump 8.1, fern 7.7. **M5d does not close
on this pass.** Fern goes to rework cycle 2; the other three are done.

**Which perf run this is, and why it was re-run.** Run 22's perf-critic scored this same code
tree 8.6 before its session died. That score is recorded here for the history, attributed to
run 22 — but it is **not** the score this round uses. `artifacts/` is git-ignored, so run 22's
`perf.json` never reached this container; it was measured on another machine under another
load and cannot be read or reproduced here. RUBRIC P1 is "frame cost **measured
reproducibly**", so the measurement *is* the artefact: adopting 8.6 would attach a score to a
`perf.json` no critic has seen. Perf was therefore re-run alone on a quiet container against
artefacts generated at `9e1a2b6`. This is not score-fishing (CLAUDE.md §4) — that is
re-rolling a scorer on an artefact that still exists, and this artefact did not. The two
numbers landing 0.05 apart is corroboration, not a reason to have skipped it.

## perf-critic — 8.65 (all six lines live)

P1 1.75 · P2 1.8 · P3 1.8 · P4 1.5 · P5 1.2 · P6 0.6.

Measured: draws 28/180 · triangles 174 012/900 000 · `cpuFrameMs` p50 0.9, p95 1.4 of 3.5
(enforced, rasteriser cap verified, 369 samples of a 360 target) · meshgen max 27.3 ms of 120
· heap 36 292 B/frame of 40 960 · bundle 193 792 B of 1 400 000 · boot 292.8 ms of 2 500.

New generators against the PERF_BUDGET prop row 4000/1200/300 — all 12 LODs inside budget:

| asset | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| bush | 1244 | 624 | 216 |
| fern | 1212 | 456 | 156 |
| reeds | 984 | 424 | 152 |
| grassclump | 1564 | 836 | 162 |

- [major, standing] The real-hardware half of P1 is stale and unverifiable. The newest
  §Real-GPU verification log row cites `3ab6e84`, which does not resolve in this repo, and it
  predates M5a's 220 wind instances. *Builder note: confirmed — `git log -1 3ab6e84` returns
  "unknown revision".* This step cannot move it; it is an owner item.
- [major, standing] P6 has no wall-clock evidence: `potato.frameCostMs.p95` 448.973 ms vs
  33.3 ms, advisory only because `potato.frameBudgetEnforced = false`, and no real-hardware
  Potato row exists anywhere. The remedy is a real-GPU Potato row, never raising the budget.
- [major, forward — M5e] **Draw calls and heap churn are coupled, and the wall is close.**
  PERF_BUDGET §heap churn models ~2 kB per draw and puts the real draw ceiling near 20, not
  180. The scene is already at 28 draws and 36 292 B/frame, leaving ~4 668 B — about **two
  draws** of headroom. `heap.uncorrectedBytesPerFrame` is 45 200, over budget, passing only
  via the idle-baseline subtraction. **Placing the four understory types at M5e as separate
  draws, or one draw per LOD, will trip the heap gate.** Merge them: one `InstancedMesh` per
  plant type with LOD chosen per instance bucket, or one merged instanced batch for the
  understory, keeping the 220 trees on the existing path. *Run 22's perf-critic reached this
  same conclusion independently; two rounds now agree.*
- [minor] PERF_BUDGET.md's SwiftShader figures ("~135 ms", "~170 ms for 20 draws") are stale
  against `gpuFrameMs.p50 = 593.298` for 28 draws. Record the M5 figures.
- [minor] Heap sawtooth 3 748 kB over 18 scavenges, within the churn budget. `gc.worstCpuFrameMs`
  8.7 bounds any GC pause but does not confirm it is under 2 ms.

SCORE_MACHINE: 8.65

## art-critic — 8.3 (all nine lines live)

A1 1.0 · A2 0.9 · A3 1.0 · A4 1.3 · A5 1.0 · A6 0.95 · A7 0.9 · A8 0.8 · A9 0.45.

**Per generator: bush 8.6 · reeds 8.2 · grassclump 8.1 · fern 7.7.**

- [major] A4 `variants/fern.png`: seeds 1 and 3 are the same upright vase of 6–7 fronds
  (breadth 0.31 and 0.24); seeds 2, 5 and 7 are three small low rosettes. Structure — frond
  count, breadth, droop — does not vary enough: **3 silhouettes across 8 seeds.**
- [major] A9/form `variants/fern.png`, every seed: the fronds are single wide serrated
  blades, not divided pinnae, so they read as an agave or leaf fan rather than a fern. The
  fiddlehead curl is barely visible (seed 7).
- [major] A4 `variants/grassclump.png`: seeds 2 and 7 are near-twins (heads 6 and 7, height
  0.65 and 0.74); seeds 1 and 4 are also similar tall fountains with 2–4 heads.
- [minor] A5 `variants/bush.png` seed 5: a flat slab of overlapping lobes, 0.82 m by 2.30 m,
  with almost no trunk. Reads as a rock or mat, not a bush.
- [minor] A1 `variants/reeds.png` seed 5 and `variants/grassclump.png` seeds 2 and 5: thin
  and small, they will vanish at 25%.
- [minor] A4 `variants/reeds.png` seeds 3 and 8: both tall headless fans, about 1.5 m.
- [minor] A3 `variants/*.png`: the bush ground shadows are faint and detached.
- [minor, carried] A6 `shots/01-wide.png`, `shots/06-hud-360.png`: the lower island meadow is
  bare green. M5e's placement must fill it.

SCORE_MACHINE: 8.3

## gameplay-critic — 9.7 (6.6 of 6.8; G2 and G4 n/a)

G1 2.2 · G2 n/a · G3 1.2 · G4 n/a · G5 1.6 · G6 1.6.

G2 is n/a because breeding arrives at M9 and no dragon is in the build; G4 because save
arrives at M8. The playable build is unchanged by M5d — the generators are unplaced until
M5e — and the log shows no regression: 28 draws, 174 012 tris, 220 wind instances, 0 page
errors, context loss induced and restored (1 attempt, loop running again), camera clamps held
under a wheel flood, HUD clean at 1280, 360 and 320 px.

- [minor] No input-latency line in `playtest.log`, so G3's 100 ms bound cannot be verified.
  `grep -i latency artifacts/playtest.log` returns nothing. The deduction is for the missing
  measurement, not an observed failure.
- [minor] The log's 4 FPS and `frameMs` 3083 are the software renderer, not a game defect.
  Noted so nobody reads gameplay smoothness from this run.
- [minor] M5d's generators are unplaced, so nothing in this step can be seen in game. That
  matches the plan. M5e must verify the understory in the scene.

SCORE_MACHINE: 9.7

---

# M5c — run 21, 2026-10-13 — cycle 1, at `0682cb6`

**Scores: art-critic 8.35 · perf-critic 8.9 · gameplay-critic 8.7.** No blocking or major
defect. Art per generator: ancientgiant 8.1, deadtree 8.4, sapling 8.0. Every critic and
every generator is ≥ 8.0, so **M5c ships** on its first pass.

## perf-critic — 8.9 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.5 · P5 1.2 · P6 0.8.

- [minor] The per-seed LOD claim is not readable from an artefact, because MANIFEST counts
  seed 1 only. The builder's scratch table puts ancientgiant's LOD0 at 4194–5900 over seeds
  1–8. Record per-seed triangles in the metrics file.
- [minor] The flora budget of 6000/2000/500 is not reconciled with PERF_BUDGET's prop row
  of 4000/1200/300. ancientgiant is over the prop row at every LOD. Record the flora
  allowance in docs/DECISIONS.md.
- [minor, forward] Heap `bytesPerFrame 36496` of 40 960, and placement must instance per
  LOD. The giant at LOD0 must be rare.
- [minor, carried] There is no verification-grade real-GPU row and no Potato row.

SCORE_MACHINE: 8.9

## art-critic — 8.35 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.1 · A4 1.2 · A5 0.9 · A6 1.0 · A7 1.0 · A8 0.75 · A9 0.5.

- [minor] A4 `variants/sapling.png`: seeds 2, 5 and 7 are one broadleaf
  "balloon-on-stick" class, 1 and 4 one conifer class, and 3, 6 and 8 one palm class.
- [minor] A4 `variants/ancientgiant.png`: seeds 1, 6 and 8 are upright domes, and 2 and 5
  are wide-flat.
- [minor] A4 `variants/deadtree.png`: seeds 3 and 4 share a Y-fork, and 2, 5 and 7 are short
  stubs.
- [minor] A5 deadtree seed 5: a "trousers" base. Seed 6 has a hole at the foot.
- [minor] A5 sapling seeds 2, 5 and 7: the blobs sit on thin stems, and seed 7's trunk is a
  hairline.
- [minor] A1 deadtree seeds 1 and 8: the branch ends are needle-sharp pencil tips.
- [minor] Identity: the ancient giant reads as a broadleaf variant, with no monumental cue
  (girth, buttress, scale).
- [minor] A2/A3: the dead tree is a flat, dim clay-brown, not the pale snag it replaces.
- [minor] The sheet labels overlap the giant's root flares.
- [minor, carried] A3: no contact ring. A6: the trees are unplaced. A8: LOD1 and LOD2 are
  not rendered.

SCORE_MACHINE: 8.35

## gameplay-critic — 8.7 (G2, G4, G5 n/a)

G1, G3 and G6 pass. The playable build is unchanged.

- [minor] The new trees are not smoke-covered (M5e).
- [minor] The ancient giant does not read as massive.
- [minor] Deadtree seeds 2, 5 and 7, and sapling seeds 3 and 6, are similar.

SCORE_MACHINE: 8.7

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

