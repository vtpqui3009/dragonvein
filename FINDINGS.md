# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M2b — run 10, 2026-10-12 — cycle 1, at `156321e`

**Scores: art-critic 8.2 · perf-critic 9.0 · gameplay-critic 9.2.** No blocking defect. The step
is pure logic; the genome is not imported by the game yet.

## perf-critic — 9.0 (7.4 of 8.2; P3 n/a)

P1 2.3 · P2 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [minor] P1: no real-GPU percentile. Both log rows are sightings.
  Repro: `npm run gate:perf -- --real-gpu`.
- [minor] P6: no real-hardware Potato evidence.
- [minor] P4: `heap.bytesPerFrame 32 953` is 80% of 40 960. New draw calls will trip it
  before P2 does.
- [minor] `cpuFrameMs.p95 1.5`, `max 7.4` is a little above the documented capped range. It
  is within budget; re-run to confirm it is noise.
- [minor] forward: P3 and `gate:meshgen` become scoreable at M3c.

SCORE_MACHINE: 9.0

## art-critic — 8.2 (all nine lines)

A1 1.0 · A2 0.9 · A3 0.9 · A4 1.4 · A5 1.1 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.35.

- [major] A6 `01-wide.png`, `03-late.png`: no creature, no dragon, no ambient life, so the frame
  has no focal subject.
- [major] A3 `01-wide.png` hero deck: trees cast no readable shadow on the island top.
- [minor] A4 `variants/broadleaf.png`: one species idiom, and canopy hue is fixed across seeds.
- [minor] A5: the branch stub on seed 5, and the pale wedge on seed 7's trunk base.
- [minor] A5 `turntables/broadleaf.webm`: a pale smear on the stage floor under the trunk.
- [minor] A6: the satellite islands are sparse, with flat black undersides.
- [minor] A9: a saturated sky against the concept's soft peach-lavender.
- [minor] A7 `06-hud-360.png`: the HUD panel covers the top island at 360 px.

SCORE_MACHINE: 8.2

## gameplay-critic — 9.2 (4.8 of 5.2; G2, G4, G5 n/a)

G1 2.0 · G3 1.3 · G6 1.5.

- [minor] G1/G3: `playtest.log` has no genome line. Breeding is not exercised in a running page
  (expected before M9).
- [minor] G3: input-to-frame latency is not measured.
- [minor] SwiftShader FPS (3–6) is visible in the shots. That is perf territory.
- [note] at M9b, G2 needs a render-level check that a child resembles its parents.

SCORE_MACHINE: 9.2

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

