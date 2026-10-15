# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M7c — run 31, 2026-10-15 — cycle 2, at `9242ee2`

**Scores: art-critic 8.1 · perf-critic 8.9 · gameplay-critic 9.3.** No blocking or major defect,
so **M7c ships**. Both cycle-1 majors are fixed in `9242ee2`:
- art A9: the dragon now lifts off, tucks its legs and holds altitude in the glide, and the clip
  camera sits three-quarters high;
- gameplay D1: Flap, Glide and Land buttons for touch, and the keys are guarded against
  modifiers.

## perf-critic — 8.9 (all six lines)

P1 2.0 · P2 1.8 · P3 1.8 · P4 1.0 · P5 1.2 · P6 1.1.

- Game page: cpuFrameMs p95 1.6 ms (cap verified), 17 draws, heap 38 687 B per frame against
  40 960 (43 514 uncorrected), bundle 225 976 B gzip.
- meshgen: round trip max 56.7 ms, worker max 52.7 ms.
- Flapping: p95 2.6 ms with 8 dragons, 50 draws in every mode.

Defects:
- [minor] P4: the headroom is narrowing, at about 5.5 %. Flight adds 7 133 B per frame for 8
  dragons, which is about 3 dragons' worth of what remains. Attribute the skinned-path cost before
  M8 puts dragons on the game page.
- [minor] P1: there is no real-GPU row since `6b06392`, which predates M7.
- [minor] Flapping adds 0.7 ms (p95 2.6 against idle 1.9), max 7.6 ms. That is 74 % of 3.5 on a
  sheet with no sim.
- [minor] P3: the worker is rising, 39.5 → 50.5 → 56.7 ms, and `startupMs` is 110.2, one-off.
- [minor] P3: the main-thread setup in `new DragonFlight` (`src/dragon-view.ts:287-288`) is
  still untimed.
- [minor, info] gpuFrameMs p95 942.7 ms is advisory on SwiftShader.

SCORE_MACHINE: 8.9

## art-critic — 8.1 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.0 · A6 0.9 · A7 0.5 · A8 0.7 · A9 0.5.

The cycle-1 major is fixed. The feet leave the ground by about frame 70, and the shadow detaches
and keeps its own wing silhouette. The landing at frames 150–165 is smooth. Across all 171 frame
pairs the RMSE diff has no spike. The shadow-based altitude cue is the strongest read in the set.
All three wing forms flap distinctly, and all 8 dragons stay distinct.

Defects:
- [minor] A9, frames ~90–135: the glide's near wing is a rake swept along the spine, and the far
  wing is a small panel. It reads as a hover rather than a soar. The wings are smaller than
  concept 01's (carried).
- [minor] A1, frames 90–135: at thumbnail scale the swept wing merges with the body and tail.
- [minor] A8, `dragon-flap-a.png`, A, C, E and H: the folded membrane shows hard black patches
  and a dark cavity at the flank (self-shadow acne).
- [minor] A8: facets on C and G's sail (carried).
- [minor] A5: G's body clearance is 0.0030 and C's is 0.0035, both equal to their rest values,
  so this is not new.
- [minor] A7: in the sheets, row-2 wings and horns cross the row-1 captions, and the hint line is
  below 4.5:1.
- [minor] A4: kinematic variation is shallow: stroke 0.91–1.02, upShare 0.60–0.69, fanOpen
  1.04–1.11.
- [minor] A6: a bare checkerboard or flat sheet.

*Builder note:* the art-critic wrote its report into `FINDINGS.md` despite the freeze. That edit
was reverted, and the report is recorded here in the standard form.

SCORE_MACHINE: 8.1

## gameplay-critic — 9.3 (6.3 of 6.8; G2 and G4 n/a)

G1 2.1 · G3 1.2 · G5 1.6 · G6 1.5.

D1 is fixed. Rest → flap → glide → land → rest completes by mouse, touch (390×700, `hasTouch`)
and keys. All five transitions were traced per frame: weights stay smooth, flap + glide ≤ 1, and
a 30-step spam produced no NaN or negative values. Every `i` value boots, and the walk, static
and game pages show 0 errors.

Defects:
- [minor] G3: the buttons show no active mode. Only `:active` is styled (`dragon.html:22`).
- [minor] G3: onset weight is 0.104 at the first frame (93–155 ms) and 0.352 at about 0.5 s.
  This is acceptable.
- [minor] G6: the default framing on a 390×700 phone is small. The dragon fills about a third of
  the width.
- [minor] G1: from the default camera the glide reads edge-on, like a hover, until you drag.
- [minor, info] The artefact mtimes (13:2x–13:38) are earlier than the commit time (16:33).
  *Builder note:* the gates and tools ran on the same tree before a usage-limit pause, and the
  commit landed after it. The perf-critic confirmed that the last source edit (13:04) predates
  every artefact.
- [minor, G2 advisory] On the sheet, child G (A × B) has a sail wing with a yellow membrane that
  matches neither parent. M9b must make the inherited wing visible.

SCORE_MACHINE: 9.3

---

# M7c — run 31, 2026-10-15 — cycle 1, at `88441ed`

**Scores: art-critic 8.0 · perf-critic 9.0 · gameplay-critic 8.1.** No blocking defect, but there
are two **majors**, one art and one gameplay, so the step goes to rework cycle 2.

## perf-critic — 9.0 (all six lines)

P1 2.0 · P2 1.8 · P3 1.8 · P4 1.1 · P5 1.2 · P6 1.1.

- **Game page:** cpuFrameMs p95 1.6 ms (cap verified), 17 draws, heap 37 176 B per frame
  against 40 960.
- **meshgen:** round trip max 50.5 ms, worker max 45.8 ms.
- **Flapping:** 8 dragons flap at p95 2.2 ms, 50 draws in every mode.
- **Bundle:** 225 264 B gzip.
- The potato cap is now verified.

Defects:
- [minor] There is no real-GPU row for any M7 step. The newest is `6b06392`.
- [minor] The advisory `gpuFrameMs` p95 moved from 494.8 to 904.7 ms with the game-page code
  unchanged. SwiftShader variance.
- [minor] P4: churn rose 5.3 kB with no game-page change (31 873 → 37 176; uncorrected 45 065),
  leaving about 9 % headroom. The correction is noisy.
- [minor] P4, forward risk: flight adds 6 723 B per frame for 8 dragons, about 840 B each. Walk
  is the same (6 819). That is about 4.5 flying dragons' worth of the game page's headroom.
  Attribute the three skinned-path cost before M8.
- [minor] P3: `new DragonFlight` (`src/dragon-view.ts:287-288`) does main-thread setup (Vector3,
  Box3, clones) that no gate times.
- [minor] P3: worker time is rising, 39.5 → 50.5 ms round trip.
- [minor, info] cpu outlier: flapping max 6.2 ms.

SCORE_MACHINE: 9.0

## art-critic — 8.0 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.0 · A6 0.9 · A7 0.5 · A8 0.7 · A9 0.4.

The sheets show eight distinct dragons in flight, and all three wing forms flap: G's sail
swings as one slab, the segmented wings pleat, and the spread wings rake their fingers. All
193 clip frames were diffed: no pop, and the ramps are smooth. Rest, walk and idle are
unchanged.

Defects:
- **[major] A9: the glide in `dragon-flight.webm` (frames ~102–160) does not read as flight.**
  - The near wing lies flat along the back, and the far wing is a small panel.
  - Frames 122–152 look like rest. All four feet stay on the ground with the same contact
    shadow, so the dragon never lifts.
  - `dragon-glide.png` does read as spread wings, so the problem is the clip's camera,
    framing and altitude.
- [minor] A5: body clearance is razor thin: G 0.0030 (rest 0.0029), C 0.0035 (rest 0.0012).
- [minor] A5: in frames 50 and 54 the near-wing fingers rake across the tail and the membrane
  overlays the hind thigh. It reads as in front, not through.
- [minor] A8:
  - frames 38–44 and 62–66: the near-wing membrane has stair-step light/dark patches
    (wing-on-wing self-shadow);
  - the membrane pinches at the wrist;
  - triangulation seams on C's sail in `dragon-glide.png` and `dragon-flap-a.png`.
- [minor] A7: in the flap and glide sheets, row-2 wings and horns cross the row-1 captions,
  and the caption contrast is still low.
- [minor] A4: the flap kinematics are nearly uniform. `upShare` is 0.66 and `fanOpen` 1.06 for
  every dragon, and stroke ranges only 0.91–1.01.
- [minor] A9:
  - `dragon-flap-a.png`: at the top of the stroke the two wings read as asymmetric (camera);
  - the wings are smaller and more swept than concept 01's (carried).
- [minor] A6: a bare checkerboard viewer scene.

SCORE_MACHINE: 8.0

## gameplay-critic — 8.1 (4.2 of 5.2; G2 and G4 n/a)

G1 2.0 · G3 1.2 · G5 1.6 · G6 1.0.

Mouse and keyboard complete rest → flap → glide → land → rest on `?view=flight`. Key spam
settles cleanly, odd `i` values boot, and walk, static and the game page are unaffected
(0 errors).

Defects:
- **[major] D1: on touch, glide and land cannot be triggered.** `src/dragon-view.ts:966-973`
  binds only the F/G/L keys.
  - Repro: a `hasTouch` context at 390×700 on `?view=flight&i=5`, double-tap.
  - Observed: `flightState()` is unchanged.
  - The caption still says "F flap · G glide · L land".
  - Fix: on-screen buttons or tap-to-cycle.
- [minor] D2 (G2 advisory): flap amplitude barely varies, tip travel 79.8–84.0 % on the sheet.
- [minor] D3: the onset after a key press is slow to read: an 0.8 s ramp, with weight about
  0.04 at 100 ms.
- [minor] D4: root clearance is marginal (0.003). The junction effectively touches at rest.
- [minor] D5: the dragon hovers with its legs hanging straight down and no tuck.
- [minor] D6: on a 390 px page the caption wraps and is clipped.
- [minor] D7 (pre-existing): the sheet captions overlap at 1280×720.
- [minor] D8: the clip frames the glide from the side, so the wings are edge-on.
- [minor] D9: Ctrl+F also triggers flap, because there is no modifier guard.

SCORE_MACHINE: 8.1

---
