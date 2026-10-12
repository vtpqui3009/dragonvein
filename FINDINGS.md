# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M3d — run 14, 2026-10-12 — cycle 1, at `aaa19c7`

**Scores: art-critic 7.4 · perf-critic 8.15 · gameplay-critic 8.5.** No blocking defect.
**M3d closes on its criteria. Milestone M3 stays `IN_PROGRESS`**, with art under 8.0 and no
human sighting of the dragons yet.

This step added a comparison and changed nothing visible, so the art deductions are standing
ones. They sit in the reference's design or in later milestones, and are not in M3d's code.
No rework cycle was run, because re-scoring an unchanged look would be score-fishing (the
dispatcher ruling in STATE.md). The parity.json labelling minor was fixed (`8f73e84`).

## perf-critic — 8.15 (all six lines)

P1 1.75 · P2 1.8 · P3 1.8 · P4 1.0 · P5 1.2 · P6 0.6.

- [major] P1: the real-GPU log's newest row is `3ab6e84`, an ancestor of M3a, so it is stale for M3.
- [major] `gate:perf` renders no dragon. Draws 27 and triangles 42268 are M0's.
- [minor] P4 `uncorrectedBytesPerFrame 39866` is 97.3 % of budget.
- [minor] `cpuFrameMs.max 3.5` sits on the line (p95 1.6).
- [minor] P6: no real-hardware Potato number.

SCORE_MACHINE: 8.15

## art-critic — 7.4 (all nine lines)

A1 1.0 · A2 0.7 · A3 0.8 · A4 1.1 · A5 0.8 · A6 1.0 · A7 0.9 · A8 0.7 · A9 0.4.

- [major] A3 `turntables/dragon-full.frame00.png`, `dragon-full.png` cells A, E, F, H: the near
  flank, belly and far legs crush to black.
- [major] A5 `dragon-full.png` cell A (150–500, 290–340): a wing finger passes through the belly,
  and the hind membrane crosses the tail (also in E and G). This is the reference's geometry.
- [major] A4: one pose and body plan. A, C and F differ mostly in paint.
- [major] A9/A6: flat sail wings rather than the concept's spread bat wings.
- [major] A6: no dragon or creature in the game scene.
- [minor] A2: wing hue clashes with body hue (magenta on brown, yellow on red).
- [minor] A8: hard, faceted wing struts. G's horns read as a frayed cluster.
- [minor] A7: the dev sheet's sub-labels are about 3:1. parity.json gaps were unlabelled; fixed.

SCORE_MACHINE: 7.4

## gameplay-critic — 8.5 (4.4 of 5.2; G2, G4, G5 n/a)

G1 1.9 · G3 1.3 · G6 1.2.

- [major, G2 preview] H looks almost identical to its parent C.
- [minor, G2 preview] G shows none of B's body colour (hue A 0.03, B 0.53, G 0.05).
- [minor] The game page has no dragon, and `gate:smoke` never loads `dragon.html`.
- [minor] parity.json lacked anchor results and axis labels. Fixed in `8f73e84`.
- [minor] G6: the sheet is unusable at phone width. The viewer has no pitch and no zoom
  limits.
- [minor] Colour and material differ between the TS and reference renders; parity is geometry.

SCORE_MACHINE: 8.5

---

# M3c — run 13, 2026-10-12 — cycle 1, at `c01ccb8`

**Scores: art-critic 8.0 · perf-critic 8.5 · gameplay-critic 8.5.** No blocking defect. All three
are ≥ 8.0, so **M3c ships**. One defect in this step's own code was fixed after the pass:
gameplay's worker-failure hang, fixed in `c011d0c`. The next pass scores that fix.

## perf-critic — 8.5 (all six lines)

P1 1.6 · P2 1.8 · P3 1.8 · P4 1.2 · P5 1.2 · P6 0.9.

P3 is at full marks. On the game page, the worker build's median is 5 ms and its max
26.8 ms. The round trip's max is 31.2 ms, and the first build after the warm-up takes
30.4 ms. Startup is 62.4 ms and the warm-up 42 ms.

- [major] P1: the real-GPU log's newest row is `3ab6e84`, from before M3.
- [major] No dragon in any measured frame, and no frame cost recorded during meshgen.
- [minor] The first main-thread assembly is cold: `assembleMs.first 11.4` against a median of 0.4.
  `ready()` warms the worker but not `toGeometry`.
- [minor] The cold path is not wired into the game: only the viewer and the test hook call `ready()`.
- [minor] The gate's browser is not core-partitioned like `gate:perf`'s. Worker spikes reach 26.8.
- [minor] `dragon-full.json` `sheetBuildMs` is an 8-dragon sum, so it is easy to misread.
- [minor] P4 34863 of 40960 B/frame. P6: no real-hardware Potato. Advisory GPU drift.

SCORE_MACHINE: 8.5

## art-critic — 8.0 (all nine lines)

A1 1.0 · A2 0.8 · A3 1.0 · A4 1.1 · A5 1.0 · A6 1.0 · A7 1.0 · A8 0.7 · A9 0.4.

The worker build is look-neutral. The sheet matches the reference cell for cell.

- [major] A4 `dragon-full.png`: C and H are near-twins, as are A and G. One crouched side pose
  hides the structural variation.
- [minor] A9/A1: the wings are flat triangular sails with one bone line; the concept's are
  spread and finger-boned.
- [minor] A2/A3 turntable frames 0 and 36: the belly under the near wing crushes to black.
- [minor] A5 frame 0: the near membrane lies across the torso and hides it.
- [minor] A8/A2 `shots/01-wide.png` (480,135), (545,178), (890,10), (955,70): unlit black slivers in
  the sky, recurring in every shot.
- [minor] A6: no creature or ambient life in the game frame. The satellite islands are small.
- [minor] A2: the runtime is saturated and dark, the reference pastel. State the intended look.

SCORE_MACHINE: 8.0

## gameplay-critic — 8.5 (5.8 of 6.8; G2, G4 n/a)

G1 2.0 · G3 1.3 · G5 1.1 · G6 1.4.

Builds do not stall the main thread. A MessageChannel ping gap stayed ≤ 16.8 ms over three
runs of 32 builds. Over 192 builds in a row the worst round trip was 52 ms, with 0 errors.

- [major] G5: a worker that fails to load made `DragonMesher.ready()` hang forever, silently.
  `onerror` rejected only pending builds. **Fixed in `c011d0c`**: failure is sticky, and
  everything rejects. A dead-Worker test covers it.
- [major] G5: the same failure left `dragon.html` a blank grey page. **Fixed in `c011d0c`**:
  the page prints the error.
- [minor] The 120 ms holds only for a warmed worker, and nothing in the game calls `ready()`
  yet (M9).
- [minor] G2 advisory: G leans towards A, H towards C.
- [minor] G6: the viewer is illegible at 360 px. The wheel zooms to the centre, not the cursor.
- [minor] The game page shows no dragon.

SCORE_MACHINE: 8.5

---

