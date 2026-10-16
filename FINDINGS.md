# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M8a — run 32, 2026-10-16 — cycle 2, at `3b6e71d`

**Scores: art-critic 8.5 · perf-critic 8.8 · gameplay-critic 8.4.** No blocking defect. Cycle 1's
two majors are fixed:
- **D1:** a localStorage write-ahead journal, plus pipelined writes keyed on gen + writer + seq;
- **D2:** export and start-fresh, which sets the record aside byte-identical in `refused.<n>`
  and salvages the dragons that validate.

A new **gameplay major**, D1 below, was found in the start-fresh path, so the step goes to rework
cycle 3.

## perf-critic — 8.8 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.1 · P5 1.2 · P6 1.1.

- **Game page:** cpuFrameMs p95 1.4 ms (cap verified), 17 draws, heap 37 363 B/frame against
  40 960. The uncorrected figure is flat at 42 929; the corrected figure moved because the
  baseline did.
- **Bundle:** 235 783 B gzip (+3.5 kB). bootMs is 313.
- **Saves:** 29 saves, worst main-thread time 0.8 ms; the smoke save of 6 398 B took 1.0 ms.
- **meshgen:** max 56.2 ms.

Defects:
- [minor] P4: the pass depends on the baseline subtraction, with 8.8 % headroom. The
  post-scavenge floor climbs from 5 053 to 6 042 KB over 274 s; promotion has not been
  separated from retention.
- [minor] The save timing is unrepresentative: `save.last` is a 149 B empty world, and there is
  only one 6 kB sample. At about 2.1 kB per dragon, 100 dragons is about 210 kB on the main
  thread, and nothing is budgeted. Add a roster-scaled save probe (50 and 200 dragons) and
  budget `maxMainThreadMs`.
- [minor, forward] Every save serialises in full and issues at once, with no coalescing, so a
  burst of M9 events means N full serialisations.
- [minor, becomes major at M8b/M9] `cpuFrameMs` excludes the sim step: `startedAt` is at
  `src/main.ts:2592`, after the step loop at 2568–2574. Move `startedAt` above the sim loop.
- [minor] A save's cost cannot be attributed to a frame; `cpuFrameMs.max` is 4.3 ms.
- [minor] There is no real-GPU row since `6b06392`.
- [minor, info] The unpaced pass is backpressure only. The restored roster has no mesh timing.

SCORE_MACHINE: 8.8

## art-critic — 8.5 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.0 · A6 0.9 · A7 0.9 · A8 0.7 · A9 0.5.

The refused-save state (14) is clear. The buttons measure 11.5:1, the status line 7.3:1 and the
values 15.7:1. The panel collapses back after start-fresh (15) and wraps at 360 and 320 px.

Defects:
- [minor] A6/A9: the HUD says "DRAGONS 2" or "DRAGONS 3" and no dragon is drawn (09, 10, 15).
  Concept 03's dragon is still missing. Carried.
- [minor] A7: the refused panel is 1252×90 px and covers the hanging island (14). 13 and
  06-hud-360 do the same. This is occlusion, not contrast.
- [minor] A6: the frame outside the hero island is bare sky and void (01, 03).
- [minor] A5/A8: thin black slivers and an orange speck float in the sky, at about (715,98) and
  (952,185) in 09 and at (38,135) in 14.
- [minor, carried] The dragon sheet captions are below 4.5:1. C and G's sails show facets.
  Island seeds 3 and 5 are close.

SCORE_MACHINE: 8.5

## gameplay-critic — 8.4 (6.9 of 8.2; G2 n/a until M9b)

G1 2.1 · G3 1.2 · G4 1.0 · G5 1.3 · G6 1.3.

These held:
- 8 cycles of a held store with a roster change before each reload: 0 losses;
- a reload storm of 6 × 12 reloads: 0 losses;
- three tabs closed in different orders;
- a newer-schema record across autosave and close, left byte-identical;
- junk, incomplete and unparseable records refused, then start-fresh and reload;
- 15 reloads with localStorage blocked;
- touch taps at 360 and 320 px.

Defects:
- **[major] D1 (G4): "start fresh" in a stale tab moves another tab's live, valid save aside.**
  `setAside(expectGen)` (`src/core/save.ts`, in both stores) guards on gen alone. Gen repeats
  after a set-aside, so the guard can match the wrong record.
  - Repro: put garbage at gen 2 in `main`. Open tabs A and B; both show corrupt. A starts fresh
    and saves up to gen 2. B then starts fresh.
  - Result: A's valid record moves to `refused.2` and B's fresh world becomes `main`. Nothing is
    deleted, but the roster is out of the game with no UI to restore it.
  - Fix: guard `setAside` on gen + writer + seq, as `write` does.
- [minor] D2: in a stale refused tab, start-fresh silently does nothing. The `detail` ("the
  stored save changed before it could be set aside") is never shown, and no reload is offered.
- [minor] D3: export gives no HUD confirmation.
- [minor] D4: with localStorage blocked or full and the store busy, a reload loses the latest
  roster change, and the HUD says "saved". The HUD never warns that journalling is off.
- [minor] D5: `store.get(MAIN_KEY)` in `persist.ts` has no timeout. With the store held, the
  page sits on "loading" with no message and no ticking.
- [minor] D6: when the database is deleted under a running tab, the next save says "another tab
  took over saving", which is the wrong message.
- [minor] D7: a stale build against a newer DB version shows only "storage unavailable". The
  `detail` knows the cause, but it is not shown and no reload is offered.
- [minor] D8: "export the old save" is 171×27 px at 360 and 320 px, which is a small touch
  target.
- *Design note:* export has no import, and nothing surfaces `refused.*` in-game. A future build
  should scan `refused.*`.

SCORE_MACHINE: 8.4

---

# M8a — run 32, 2026-10-16 — cycle 1, at `5dad3b7`

**Scores: art-critic 8.4 · perf-critic 8.8 · gameplay-critic 8.2.** No blocking defect. There are two
**gameplay majors** in the save path, so the step goes to rework cycle 2.

## perf-critic — 8.8 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.1 · P5 1.2 · P6 1.1.

Measured:
- **Game page:** cpuFrameMs p95 1.3 ms (cap verified), 17 draws, heap 34 828 B/frame against
  40 960 (42 831 uncorrected).
- **Bundle:** 232 239 B gzip, +6 263 B for the save spine.
- **Boot:** bootMs 255. First frame at 215 ms, world ready at 264 ms, so load does not block
  the first frame.
- **meshgen:** max 53.5 ms.

By code read, nothing new allocates per frame:
- `step` is `tick++`;
- serialisation happens only on save;
- the HUD strings rebuild on the 250 ms timer only when they change.

Defects:
- [minor] There is no real-GPU row since `6b06392`, which is two milestones stale.
- [minor] The heap pass depends on the idle-baseline subtraction: 42 831 uncorrected.
- [minor] No artefact shows whether the 10 s autosave's allocation lands in the idle window or in
  the per-frame figure.
- [minor] Nothing times a save. The autosave payload grows with the roster, and the IndexedDB
  structured clone runs on the main thread. Record `saveMs`.
- [minor] `new DragonFlight` setup is untimed (carried).

SCORE_MACHINE: 8.8

## art-critic — 8.4 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.0 · A6 0.9 · A7 0.8 · A8 0.7 · A9 0.5.

The HUD is on-palette and is the most legible element in the frame. The pixel-measured contrast
ratios are:
- labels 11.4:1;
- values 14.8:1;
- the orange "not saved" text 7.1:1.

It wraps cleanly at 360 and 320 px.

Defects:
- [minor] A6/A9: shots 09 and 10 read "DRAGONS 3", but no dragon is drawn. Concept 03's subject,
  a dragon on the island, is still missing from the game frame.
- [minor] A7: the storage-blocked HUD widens to 1266×58 px and covers the hanging island (13), and
  the 3-row panel at 360 px does the same (06). This is occlusion, not contrast.
- [minor] A6: the frame outside the hero island is bare sky and void (01, 03).
- [minor] A5/A8: thin black slivers float in the sky at about (290,167) and (720,100) in 01. This
  is not new.
- [minor, carried] The dragon sheet's captions are below 4.5:1; C and G's sails show facets; the
  flap kinematics vary only narrowly.

SCORE_MACHINE: 8.4

## gameplay-critic — 8.2

G1 2.0 · G2 1.4 · G3 1.2 · G4 1.0 · G5 1.1 · G6 1.5.

*Builder note:* the gameplay critic scored G2, which `docs/RUBRIC.md` makes live only at M9b. It
does not change the decision, because the majors below decide it.

What held:
- the round trip;
- 14 rapid reloads, including some during boot;
- closing a stale tab;
- two tabs, where the older one stops on the broadcast;
- blocked storage.

Each refused record left the store byte-identical.

Defects:
- **[major] D1 (G4): a reload during a slow in-flight save loses the unsaved roster, bred dragon
  included, and the next HUD says "saved".** `SaveSession.drain` (`src/sim/persist.ts:98-129`)
  holds the newest world in `queued` until the in-flight write completes, and `pagehide` and the
  roster save only queue (`main.ts:2063-2079`). If the page unloads first, the queued write never
  starts.
  - Repro: hold a readwrite transaction for 2.5 s from a second page, then call
    `save(); seedRoster();` and reload after 300 ms. The roster comes back as 0.
  - It did not reproduce in 8 natural-timing trials.
  - `tests/save.test.ts:455` locks in the coalescing behaviour, and no test covers unload with a
    write in flight.
- **[major] D2 (G5): a refused record is a dead end.** The trigger can be:
  - a corrupt record;
  - a newer schema;
  - a non-envelope value;
  - one tampered `gid` among 4 good dragons.

  In every case the session can never save again: "unreadable save kept, not overwritten". There
  is no start-fresh, export or retry, and nothing tells the player what to do. The refusal is
  all-or-nothing, with no per-dragon salvage.
- [minor] D3: "the last save failed — retrying" is false once the DB handle is closed.
  `onversionchange` closes it (`src/core/save.ts:152`) and nothing reopens it; `onclose` is not
  handled.
- [minor] D4 (major once M9 lands): a stale tab keeps accepting play and silently discards it.
  Block world changes while the tab is in conflict.

SCORE_MACHINE: 8.2

---

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
