# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M7b — run 30, 2026-10-15 — cycle 2, at `6e1debb`

**Scores: art-critic 8.2 · perf-critic 9.1 · gameplay-critic 9.4.** No blocking or major
defect, so **M7b ships**. Cycle 1's two gameplay majors (D1 drag, D2 zoom in `?view=walk`) and
its perf major (`gate:meshgen` with no rasteriser-cap partition) are fixed:
- `fff1fa3` is the gate fix, in its own commit;
- `6e1debb` is the view fix, plus the walk-weight ramp and the gait roll.

## perf-critic — 9.1 (all six lines)

P1 2.0 · P2 1.8 · P3 1.8 · P4 1.2 · P5 1.2 · P6 1.1.

Readings:
- **Game page:** cpuFrameMs p95 1.2 ms (cap verified), 17 draws, 216 714 triangles, heap
  31 873 B per frame against 40 960, bundle 214 153 B gzip.
- **meshgen:** round trip max 39.5 ms, worker max 31.9 ms. `stallPartitioned = []`,
  `glStallsObserved = 0`.
- **Parity:** exact (worst box gap 0.0237).
- **Walk:** 8 dragons walking at p95 1.4 ms, and 50 draws in every mode.
- P3 rose from 1.6 to 1.8, because the cycle 1 major is resolved.

Defects:
- [minor] There is no real-GPU row since `6b06392`, which predates M7. Ask the owner for a
  sighting of `dragon.html?walk=1` before M7 closes.
- [minor] The walk adds 8 396 B per frame on the 8-dragon sheet (`dragon-walk.json`
  `heap.walkAddsBytesPerFrame`), about 1 kB per walking dragon. Nobody has attributed it;
  it is probably three's bone-texture upload. The game page has about 9 kB of headroom.
- [minor] The potato pass was not cap-verified. In `perf.json`, `potato.rasteriserCap.verified`
  is false: one gpu-process thread was on cpus 0–3.
- [minor] `dragon-walk.json` may predate the final `dragon-view.ts` edit by about 30 s. That
  edit is camera-only.
- [minor, info] The advisory `frameCostMs` p95 of 494.8 ms is SwiftShader confined to 2
  cores. It is not a regression.
- [minor, info] Single-frame cpu outliers of 4.8 to 5.3 ms. Only p50 and p95 are enforced.

*Builder note:* the gate's partition fired 0 times in 6 real runs. The 178.8 ms stall from
cycle 1 was not reproduced. An injected 200 ms GL wait was partitioned and passed, and an
injected 200 ms non-GL stall failed. A recurrence is therefore caught only if it shows up as
a GL wait.

SCORE_MACHINE: 9.1

## art-critic — 8.2 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.1 · A6 0.9 · A7 0.6 · A8 0.7 · A9 0.4.

All 84 frames of `dragon-walk.webm` were block-matched. In stance the toe moves by the same
dx as the ground in every frame, so the feet are planted to the pixel. The lateral sequence
is visible: the hind foot swings, then the fore foot about 8 frames later. The tail-tip
swing is now about 28 px (6 px in cycle 1), and the torso bobs 12 px. No pops (frame diff
1.4–2.1 with no outlier), and no candy-wrapper collapse at the knees.

Defects:
- [minor] A9: the walk is a low crouch, belly near the ground with the wings folded as bars,
  against concept 01's upright dragons (`dragon-walk-a.png`, `dragon-walk-b.png`). Unchanged
  from cycle 1.
- [minor] A5/A9: the head and neck are nearly rigid while walking, with 5.5 px of nod
  (`dragon-walk.webm` f1–30).
- [minor] A4/A9: the gait varies narrowly. Stride is 0.46–0.60 and period 0.94–1.16 s.
  B, E, F and H are within about 4 % on stride, and LH = RH with identical phase offsets in
  every dragon.
- [minor] A4: the clip shows dragon A only, so B–H are evidenced only in json. Add a
  multi-dragon walk clip or sheet.
- [minor] A5: no artefact shows the new rest↔walk ramp, because the clip starts and ends
  mid-gait. Capture rest-walk-rest.
- [minor] A7: the `dragon.html` caption contrast is 2.19:1 (`dragon-walk-a.png` y≈703) and
  2.68:1 on `dragon-full.png`. Pre-existing.
- [minor] A6: the walk is on a bare checkerboard with a grey band. It is viewer-scoped.
- [minor, pre-existing] A8: a neck-collar crease at (700,270), and a flat shoulder facet.
- [minor] `dragon-full.json` is stale.
- [minor] The drift of 0 % is computed on the IK target, so it is true by construction. The
  pixel check is the independent proof.

The score fell from 8.7 to 8.2, mainly on A7, which was measured for the first time (0.9 →
0.6), and on A9 (0.5 → 0.4).

SCORE_MACHINE: 8.2

## gameplay-critic — 9.4 (4.9 of 5.2; G2, G4 and G5 n/a)

G1 2.1 · G3 1.3 · G6 1.5.

D1, D2 and D3 from cycle 1 are fixed. They were driven headlessly with mouse and with touch
(CDP pinch) on `?view=walk&i=0..7`:
- `walkViewState().ndc` stayed at [0,0] through drag, zoom and 30 s of walking;
- zoom is clamped to 0.3–3;
- the ground and backdrop follow the dragon.

Odd `i` values (99, −1, abc, none) boot clean.

Defects:
- [minor] The D1 and D2 fix has no regression guard. Nothing in `tools/` or `tests/` calls
  `walkViewState`. Add a drag, wheel and pinch drill that asserts ndc ≈ [0,0] and that zoom
  changes.
- [minor] The walk reads as a slow shuffle: 0.45–0.65 u/s, about 0.1 body-lengths per second
  (estimated).
- [minor] Nothing on screen hints that drag turns the dragon or that wheel and pinch zoom.
  After a drag you see the dragon from behind.
- [minor] D4: `?walk=1` teleports every 3 cycles. This is by design and unchanged.
- [minor, G2 advisory] H's stride (0.480) is below both its parents' (G 0.516, C 0.493).
  Watch it at M9b.

SCORE_MACHINE: 9.4

---

# M7b — run 30, 2026-10-14 — cycle 1, at `a68c77f`

**Scores: art-critic 8.7 · perf-critic 9.0 · gameplay-critic 7.5.** No blocking defect. Two
**gameplay majors** in the new `?view=walk`, and one **perf major** on the `gate:meshgen` tool,
so the step goes to rework cycle 2.

## perf-critic — 9.0 (all six lines)

P1 2.0 · P2 1.8 · P3 1.6 · P4 1.2 · P5 1.2 · P6 1.2.

Re-measured on a scratch copy:
- draws 50 in every mode;
- cpuFrameMs with 8 walking: p95 1.9–2.1;
- meshgen max 25–54 ms over 6 runs;
- parity green;
- no per-frame allocation, by code read and a Node probe (~0.5 kB per frame of boxed
  doubles once warm).

Defects:
- **[major] The recurring `gate:meshgen` main-thread stall is still unfixed.** It hit two
  consecutive steps: 243.8 ms at M7a and 178.8 ms at M7b, both with a fast worker (37.2 ms).
  `tools/gate-meshgen.mjs` has no rasteriser-cap partition. Run the page under
  `tools/rasteriser-cap.mjs` as `gate:perf` and `dragon-walk.mjs` do. Never loosen 120 ms.
- [minor] There is no real-GPU row since `6b06392`, which predates M7. Ask the owner for a
  sighting of `dragon.html?walk=1` before M7 closes.
- [minor] `dragon.html` heap churn is in no artefact. The raw walk figure was 47–51 kB per
  frame, unsubtracted. Record it in `dragon-walk.json` with the idle-floor subtraction.
- [minor] A cold-JIT allocation burst on walk start (boxed doubles). Optional: use
  `Float64Array` scratch, or warm it up.
- [minor] `dragon-full.json` is stale (04:13). Regenerate it.

SCORE_MACHINE: 9.0

## art-critic — 8.7 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.1 · A6 1.0 · A7 0.9 · A8 0.7 · A9 0.5.

Feet planted: the toe holds within ±2 px through each stance (camera scroll subtracted). The
knees bend 37–49° on all 8 bodies with no tearing or collapse. Wings and tail ride the body,
the rest pose is 0 px from static, and the idle is intact.

Defects:
- [minor] The switch from rest to walk is a hard snap (`walkAt(null)` → `walkAt(0)`): the
  body drops about 10 px in one frame. It becomes a major pop once gameplay triggers it.
  Add a walk-weight ramp.
- [minor] On `?walk=1` the sheet teleports back every 3 cycles.
- [minor] A4: the gait varies narrowly. Stride is 0.48 × legLength for all, with identical
  phases, so every dragon is "the same low skitter at slightly different speeds".
- [minor] A5/A9: the walk is leg-only. The head nods only about 7 px and the tail tip sways
  about 6 px, so it reads as legs under a rigid body.
- [minor] A9: the crouch is low, with the belly near the ground and the wings folded as
  bars. It is far from the concept's upright, alert dragons.
- [minor, pre-existing] A8: a faceted crease on the neck collar.

SCORE_MACHINE: 8.7

## gameplay-critic — 7.5 (3.9 of 5.2; G2, G4 and G5 n/a)

G1 2.0 · G3 0.9 · G6 1.0.

- **[major] D1: dragging in `?view=walk` loses the tracked dragon.** `setYaw` rotates the
  parent group, but `frame()` tracks world x only, so the dragon walks out of frame within
  about 7 s. Touch does the same. See `src/dragon-view.ts:661-692` against `:396-402`.
- **[major] D2: zoom does nothing in `?view=walk`** (wheel and pinch). `zoomBy` moves the
  camera, and `frame()` resets it from `walkCam.pos` (`:398`).
- [minor] D3: the walk view's world ends. The ground is a fixed 400×400 plane and the sky
  sphere has radius 150, so by t ≈ 320–450 s the dragon is in a black void.
- [minor] D4: `?walk=1` teleports every 3 cycles (by design).
- [minor, G2 advisory] The gait varies only in scale and tempo, and the walk reads as a slow
  shuffle (about 0.1 body-lengths per second). Children's gaits sit between their parents'.

SCORE_MACHINE: 7.5

---
