# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M2a — run 9, 2026-10-12 — cycle 1, at `7500613`

**Scores: art-critic 8.6 · perf-critic 8.5 · gameplay-critic 9.4.** No blocking defect. The step
is pure logic: `src/core/rng.ts` is not yet imported by the game, so the frames are M1's.

## perf-critic — 8.5 (7.0 of 8.2; P3 n/a)

P1 2.0 · P2 1.8 · P4 1.2 · P5 1.2 · P6 0.8.

- [major] P1: there is no verification-grade real-GPU row, only sightings (no GPU model, no
  percentile, a 943-px viewport). Repro: `npm run gate:perf -- --real-gpu`.
- [minor] P6: no real-hardware Potato evidence. `potato.gpuFrameMs.p95 261.55` is advisory.
- [minor] P4: `heap.bytesPerFrame 32 610` is 80% of 40 960 at 27 draws. Heap churn, not P2,
  will bind from M3 onward.
- [minor] `unpaced.cpuFrameMs.p95 1160` is SwiftShader backpressure, unbudgeted by design.

SCORE_MACHINE: 8.5

## art-critic — 8.6 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.0 · A4 1.5 · A5 1.1 · A6 1.0 · A7 1.0 · A8 0.7 · A9 0.4.

- [major] A6: no creatures, dragon, structures or ambient life in any shot. The world reads as a
  diorama with no inhabitant.
- [major] A9: no dragon, and the sky is dark navy to orange where the concept is pastel peach.
  The island undersides are near-black where the concept has brown rock cones.
- [minor] A3: the main island's underside (x 500–780, y 520–640) is a flat black wedge, and
  there are no contact shadows under props on the deck.
- [minor] A5: on seed 5 a branch stub lies at ground level.
- [minor] A8: on seed 7 the trunk-base flare reads as a mesh cut.
- [minor] A4: one leaf and bark colour and one lobe style across all seeds.
- [minor] A6: the satellite islands are sparse.

SCORE_MACHINE: 8.6

## gameplay-critic — 9.4 (4.9 of 5.2; G2, G4, G5 n/a)

G1 2.2 · G3 1.2 · G6 1.5.

- [minor] G3: there is no input-to-frame latency in `playtest.log`.
- [minor] G6: input is pointer and touch only, with no keyboard.
- [minor] AC3: the evidence that `*` instead of `Math.imul` fails lived only in a commit message.
  **Fixed** in `599106c`, a test pinning where the two diverge.
- [minor] observation: nothing in this step is player-visible yet. G2 is the first line that
  can test the hook.

SCORE_MACHINE: 9.4

---

# M0 + M1 milestone pass — perf re-scored on new evidence, 2026-10-12, at `634c4d7`

Only the perf-critic re-scored. The artefact it penalised most changed: the owner added a
current-commit real-hardware **sighting** (STATE.md log, `3ab6e84`, FPS 60, DRAWS 27). That
is new evidence, not a re-roll of an unchanged tree. No runtime file changed since the M1b
round, so its art 8.7 and gameplay 8.7 stand.

## perf-critic — 8.4 (6.9 of 8.2; P3 n/a), previous 7.4

P1 2.2 · P2 1.8 · P4 1.1 · P5 1.2 · P6 0.6.

- [major] P1/P6: no verification-grade real-GPU row and no real-hardware Potato measurement.
  Repro: `npm run gate:perf -- --real-gpu` on a GPU machine, also `?tier=potato`.
  Not blocking before M16.
- [major] P4: `heap.uncorrectedBytesPerFrame 40 365` (98.5% of 40 960), `bytesPerFrame
  33 825` (82.6%) at 27 draws. Every new draw call spends this margin, so instance or merge;
  never raise 40 960.
- [minor] P1: the sighting has no GPU model and its viewport was ~1919×943, not 1080p.
- [minor] P1: the SwiftShader GPU term is not comparable across runs. Only `cpuFrameMs` is a
  stable regression instrument here.
- [minor] docs drift: the STATE.md log intro quotes ~135 ms at 20 draws, and PERF_BUDGET.md
  §Potato quotes 14 draws / 24 960 tris (now 19 / 35 048). Both are figures from earlier scenes.
- [minor] P3 goes live at M3c, where `gate:meshgen` stops skipping.

SCORE_MACHINE: 8.4

---

