# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M3b — run 12, 2026-10-12 — cycle 2, at `4679aa6`

**Scores: art-critic 8.1 · perf-critic 8.2 · gameplay-critic 9.0.** No blocking defect. All three
are ≥ 8.0, so **M3b ships**. This is the first M3 pass with all three over the bar. M3 stays
`IN_PROGRESS` until M3c and M3d are done.

## perf-critic — 8.2 (all six lines)

P1 1.5 · P2 1.8 · P3 1.7 · P4 1.2 · P5 1.2 · P6 0.8.

- [major] P1: no real-GPU row for M2 or M3 code. The newest row is the `3ab6e84` sighting.
- [major] No measured frame holds a dragon. Up to 9294 triangles and 3 material groups per
  dragon, with draw, frame and heap cost unmeasured.
- [major] Breeding-stutter risk: the cold browser build `firstDragonMs 31.2` is on the main thread
  (two dropped frames). The worker is M3c's. Make the build cheaper; never raise 120.
- [minor] P4 `heap.bytesPerFrame 33155`, uncorrected 39561.
- [minor] P6: no real-hardware Potato. The advisory GPU term is about 3× PERF_BUDGET's quote,
  probably the rasteriser cap on 2 cores.
- [minor] P3 scope: Node and headless main thread, not Medium in a worker (M3c).

SCORE_MACHINE: 8.2

## art-critic — 8.1 (all nine lines)

A1 1.0 · A2 0.7 · A3 1.0 · A4 1.3 · A5 1.0 · A6 1.0 · A7 0.9 · A8 0.8 · A9 0.4.

- [major] A2 `dragon-full.png` cell F at V 0.19–0.24 and E at V 0.29, against the bible's
  0.28 floor. Repro: sample (690, 525) and (790, 510).
- [major] A6 `shots/*.png`: no dragon or creature in any game frame. The satellite islands
  are bare.
- [minor] A4: the tail ornament is the same cream blade on all eight (the reference's too).
  A, C, G and H share proportions.
- [minor] A2/A9: flat, saturated membranes, where the reference shows soft, faceted ones. The
  runtime is darker and more saturated than the reference and the concept.
- [minor] A5 cell A and turntable tile 2: a lower wing panel crosses the tail.
- [minor] A3 turntable tiles 1–2: the shadow-side legs and belly go black. The warm rim is weak.
- [minor] The turntable's grey horizon band (viewer).

"Reads as the Python one": strong. Silhouette, wing angle, crown, spike count, tail blade and
head line up in A–H. What remains is material.

SCORE_MACHINE: 8.1

## gameplay-critic — 9.0 (4.7 of 5.2; G2, G4, G5 n/a)

G1 2.0 · G3 1.2 · G6 1.5.

- [minor] `playtest.log` never loads `dragon.html`.
- [minor] The viewer drag turns yaw only, with no pitch or pan.
- [minor] The wheel zoom step is clamped per event.
- [minor] G2 advisory: the second parent shows weakly. G reads as A with greener wings, and H as C.

Criterion 4: all 8 cells agree on wing size and pose, horn count and crest, spike row, tail
ornament and silhouette. Colour and surface differ, and that is material, not shape.

SCORE_MACHINE: 9.0

---

# M3b — run 12, 2026-10-12 — cycle 1, at `027727f`

**Scores: art-critic 7.5 · perf-critic 8.4 · gameplay-critic 8.7.** No blocking defect. Art is
below 8.0, so the step is reworked (cycle 2).

## perf-critic — 8.4 (all six lines)

P1 1.8 · P2 1.8 · P3 1.6 · P4 1.2 · P5 1.2 · P6 0.8.

- [major] P1: the real-GPU log's newest row is the `3ab6e84` sighting, before M2 and M3.
- [major] No measured frame holds a dragon (`drawCalls 27`, `triangles 42268` are M0's). Whole
  dragons are about 7.8k triangles each (`dragon-full.json`).
- [major] P3: `dragon-full.json` gives only an 8-dragon total (`sheetBuildMs 148.9`), with no
  per-dragon max or cold time in the browser. Node: max 16.02, cold 37.56 ms.
- [minor] P4 `heap.bytesPerFrame 34338` (uncorrected 40472, 488 B under).
- [minor] P6: no real-hardware Potato number. Advisory GPU drift.
- [minor] One `cpuFrameMs 4.2` sample in `playtest.log` during video capture.

SCORE_MACHINE: 8.4

## art-critic — 7.5 (all nine lines)

A1 1.0 · A2 0.7 · A3 0.9 · A4 1.2 · A5 0.8 · A6 0.9 · A7 0.9 · A8 0.7 · A9 0.4.

- [major] A3/A2 `dragon-full.png` cells A, F, C and turntable frames 0–3: shadow sides crush to
  near black (about #1a0505 on A), under the folded wing, on the far legs and the belly.
- [major] A5 `?view=turn&i=0&cam=-3,3,8,0,1.3,0`: the inner membrane and its fold cut through the
  flank, and spikes poke through the membrane. On F the membrane slices into the torso at the
  wing root.
- [major] A3: the membranes carry a white-blue specular streak (cell D, E), so they read as glass,
  where the reference's are matte.
- [major] A4: one body plan and pose. A, C, G and H read as one silhouette recoloured.
  Wing, crown, spikes, tail and hue vary, and the children visibly inherit.
- [minor] "Reads as the Python one": gene for gene, every cell matches in wing hue, crown, spikes
  and ornament shape. The reference shows no tail, only a floating ornament. It is pastel where
  the runtime is saturated.
- [minor] A8: stair-stepped two-tone boundary on the thighs (close-up), and a hard ring where the
  horns meet the skull.
- [minor] A9: the concept's ball-chain tail, mottled belly and spread wings are absent; the wings
  are folded sails.
- [minor] A1: dragons fill about 25 % of a cell; the ornament vanishes at small scale.
- [minor] A6: no creature in the game scene. The turntable's grey horizon band is off-palette.

SCORE_MACHINE: 7.5

## gameplay-critic — 8.7 (4.5 of 5.2; G2, G4, G5 n/a)

G1 2.0 · G3 1.2 · G6 1.3.

- [major] D1: "reads as the Python one" fails on the tail. Every reference cell shows a floating
  ornament with no tail body; the runtime draws a tapering tail. Spikes and limbs are chunkier
  in the reference.
- [minor] D2: two-finger pinch in `dragon.html` rotates instead of zooming (carried).
- [minor] D3: near-black boxy far hips and legs at every yaw.
- [minor] D4 (G2 advisory): G is closest to A; both parents show (A's body, a membrane between
  A's and B's).
- [minor] D5: `gate:smoke` does not load `dragon.html`. D6: no dragon in the game.

SCORE_MACHINE: 8.7

*Builder note on the missing reference tail:* measured. The reference graph puts the tail root
(node 4) and the hip (node 5) at the same point. In Blender 5.2's Skin modifier, a zero-length
edge collapses the whole chain behind it to zero thickness. A five-node test chain skins at
2r (0.085 … 0.8). The same chain with a coincident hip node skins at 0.0 at every node, and
moving the hip 0.02 restores 2r. The TS skin merges coincident nodes (run 11), which is why it
drew the tail. The fix belongs in the reference (cycle 2).

---

