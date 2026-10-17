# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M8b — run 35, 2026-10-17 — cycle 2, at `f243058`

**Scores: art-critic 8.1 · perf-critic 7.3 · gameplay-critic 8.4.** No blocking defect.
art rose 7.4 → 8.1 and gameplay fell 8.6 → 8.4; perf fell 7.5 → 7.3 on a strictly better build.

**The finding that decides the step.** Two critics, independently and with numbers, report that
M8b's tells are not legible **at the camera the player actually has**. gameplay drove the build
and measured through `__dragonveinWild.screen()`: at the default view the dragon is **97 px**
wide and the keeper **21 px**; wheel-zoomed to the minimum, **103 px** and 22 px. Cycle 2's
shots read well because they are framed from 3.3–4.5 units, and `ORBIT_LIMITS` only allows
15–32 — a framing no player can reach. art says the same in its A9: "valid evidence of the
tells, but it is not a framing a player gets."

That is cycle 2's own doing. Cycle 1's defect was that the artefacts did not show their
subject; the fix framed them close, which proved the tells exist but moved the evidence away
from play. **Run 33's criterion 6 requires no blocking or major defect and that "the reaction
must read without the indicator". gameplay's D1 and D2 are majors on exactly that, so
criterion 6 is not met and M8b does not close.** The remaining five criteria are met (see the
run 35 entry in STATE.md).

## perf-critic — 7.3 (P1 1.3/2.5 · P2 1.8/1.8 · P3 1.4/1.8 · P4 1.0/1.5 · P5 1.2/1.2 · P6 0.6/1.2)
**Coverage:** `perf.json` and `meshgen.json` in full, `dragon-full.json` in part, ~40 of 122
lines of `playtest.log` by grep, the STATE.md real-GPU table, the RUBRIC perf table, cycle 1's
perf section. 0 of 26 shots opened as images; no turntables.
- [major] P1 — no real-hardware row covers the M8b scene; newest is `6b06392`, 2026-10-13,
  and every row is a sighting, none a verification.
- [major] P3 — `meshgen.json` `maxMs` 684.5 for gid `b3511cbd37`, `glStallMs` 641.9 from
  `getProgramInfoLog` 485.8 + 122.0. Proposed fix: warm the material variants at load so a
  first breed never links a shader mid-play.
- [major] P4 — thin and noisy: `bytesPerFrame` 33 947 of 40 960, `uncorrectedBytesPerFrame`
  47 741, `idleBytesSubtracted` 5 076 149, spread 33 947–39 899 across three runs.
- [minor] P1 — reproducibility shown for the heap only; one `cpuFrameMs` run in evidence.
- [minor] P6 — no real-hardware Potato number for the current scene.
SCORE_MACHINE: 7.3

*Builder note on P3.* Real in that artefact and correctly partitioned by the gate itself:
`roundTripMs` 684.5 = `workerMs` 47.1 + `glStallMs` 641.9, with **`roundTripHeldMaxMs` 42.6**
against the 120 ms budget, and `stallPartitioned` naming the four calls. The stall is
SwiftShader's `getProgramInfoLog`, a CPU-rasteriser artefact of the gate's own GL timing, and
it is not stable: two `gate:perf`/`gate:meshgen` runs by this session on the same code read
**2 stalls then 0**, with "0 round trip(s) over budget" both times and round-trip maxima of
49.7 and 60.1 ms. Not attributable to M8b. The forward risk it names — a bred dragon linking
an unseen program mid-play — is real and belongs to M9; it is carried into NEXT.md.

*Builder note on P4.* Profiled rather than argued, with `HeapProfiler.startSampling` and
`includeObjectsCollectedByMinorGC`/`MajorGC` (without those flags the profiler reports only
survivors and attributes ~1 % of the churn). Sampled total 41 272 B/frame, agreeing with the
gate. The bytes are V8 boxing doubles inside `three`'s math — `Quaternion.get x`/`get z`/`get w`
show self-size — not object literals in this project's code; `updateWild`,
`WildDragonView.update`, `DragonWalk.pose`/`solveLeg`, `DragonFlight.set`/`locals`,
`DragonAttitude.update` and `src/sim/wild.ts` `step()` are already allocation-free by
construction. `docs/PERF_BUDGET.md` predicts this and names draw calls, not reuse, as the
lever. **The 2.6 % margin cycle 1 scored was largely noise:** three runs on identical per-frame
code read 39 899, 37 233 and 33 947, a ~15 % spread, because the window averages over whatever
the dragon happened to be doing. If that spread is unacceptable the fix is in the gate (hold
the dragon in one state for the heap window, or lengthen it), which is threshold-adjacent and
was deliberately not done this run.

*Builder note on P1 and P6, which together lock 1.8 points.* No GPU exists in CI or any
container here — SwiftShader only, a standing hazard in NEXT.md. No run can produce these rows;
only the owner can. They are carried in NEXT.md §Open items with the exact procedure.

## art-critic — 8.1 (A1 1.0/1.2 · A2 0.6/1.0 · A3 1.1/1.2 · A4 1.3/1.6 · A5 0.9/1.2 · A6 1.1/1.4 · A7 0.9/1.0 · A8 0.8/0.8 · A9 0.4/0.6)
**Coverage:** 6 of 26 shots opened as images (01, 17, 18, 19, 20, 21); `dragon-full.png` opened,
`dragon-silhouette.json` and `dragon-full.json` read; greyscale sheet, idle pair and
`dragon-sweep.json` not opened; no turntables decoded, so art-probe's ambient-motion line was
not exercised. Scores for unopened shots are inferred, not measured.
- [major] A4/A5 — `dragon-full.png` A, B, G, H: wings stand as upright panels above the back
  rather than resting spread to the side, against `docs/ART_BIBLE.md`, M3e and
  `tests/dragon-wings.test.ts`. The side-on sheet camera may hide some of it.
- [major] A4 — `dragon-full.png` E and F share a bipedal profile and proportions;
  `dragon-silhouette.json` names E–F "mostAlike". Variation is real overall (mean IoU 0.523,
  min 0.292) but body plan is the weak axis: area 7.06–8.06, height 3.2–4.55.
- [minor] A2 — art-probe on `01-wide.png`: 128 of 720 sky rows (17.8 %) off-palette at dE > 12
  against a target under 8 %; worst y=145 (#af6a48, dE 34.6).
- [minor] A1 — `17-wild-wander.png`: the cobalt dragon's tail merges with same-hue shrubs at
  x400-560, y440-490; `20-wild-flee.png`: the dragon overlaps dark trunks at x500-800, y150-420.
- [minor] A1/A6 — the keeper is a brown cone-and-ball figure at 55–89 px; crystals dominate the
  lower-left foreground of 18, 19 and 21.
- [minor] A6 — every in-game frame holds exactly one creature.
- [minor] A9 — saturated cobalt and faceted shading against the concept's warmer palette; and
  the close-up cameras sit 3.3–4.5 units out, outside the `ORBIT_LIMITS` diorama range.
- [minor] A5 — `21-wild-wary.png`: the log records a crouch (lower 0.289) but the head is
  raised; the crouch is only subtly readable.
SCORE_MACHINE: 8.1

*Builder note on both A4/A5 majors.* Both point at the **dragon generator**, not at M8b. The
resting wing spread is the authored target, not a drift from it: measured on the seeded dragon
`e35390fdfd`, each wing reaches 4.094 mesh units to the side and 0.687 up (5.9 : 1, ~9.5° above
horizontal), `DragonFlight.pose(0,0,0)` moves **0 of 36 bones** so the renderer is not posing
it, and `tests/dragon-wings.test.ts` asserts `reach > 1.6` and under 45° for all 40 genomes as
M3e criterion 2, with `gate:parity` holding the Blender reference to the same graph. Changing
it is a dragon step (graph change in both builders, the reference and the `gate:parity` fixed
set) or a new ground-furl layer in `src/render/flight.ts`; hand-tuning a furl blind risks a
wing through the flank, a **blocking** defect in place of a minor. Per CLAUDE.md §7 this is a
target question for the owner, carried into NEXT.md. E–F body-plan similarity is an M3 matter
on the same footing.

## gameplay-critic — 8.4 (G1 1.7/2.2 · G2 1.2/1.8 · G3 1.3/1.4 · G4 1.3/1.4 · G5 1.4/1.6 · G6 1.5/1.6)
**Coverage:** all 122 lines of `playtest.log`, all five new shots, the RUBRIC gameplay table.
**Drove the build itself** with scratch scripts outside the repo: `stage(6.5)` → `approach(3.0)`
→ a real `mouse.click` on `project()`, polling `read()` for ~30 s; then a `clickCount: 2` rush;
then the same sequence again under `hasTouch` with `touchscreen.tap`. Did not open the clip or
`perf.json` in full, and did not repeat the drag/jitter/off-island/pinch drills.
- [major] D1 — G1/G3, reaction legibility at the camera the player gets. Measured via
  `screen()`: default view dragon **97 px**, keeper **21 px** (camera distance 18.3); zoomed to
  minimum, 103 px and 22 px. Posture tells (head up, crouch 0.29, tail to keeper) are not
  readable at that size. Shots 17-21 are framed from 3.3-4.5 units, which `ORBIT_LIMITS` does
  not allow. Explicitly **not** a request to change the camera, which is an owner decision;
  the ask is larger-scale cues, e.g. a ground ring or a mark above the head.
- [major] D2 — G1/G6, occlusion: dragon and keeper hidden behind trees and crystals; in one
  capture the settled dragon is not visible at all. The keeper has no through-geometry marker.
- [minor] D3 — shot 21's caption says "tail to the keeper" but the head is still turned toward
  the keeper (heading 2.570, keeper at x≈305 px).
- [minor] D4 — G3/G5, after settling calm saturates at 1.0 with no feedback and nothing to do;
  that is M8c's subject.
- [minor] D5 — HUD FPS 2-4 under SwiftShader; left to the perf-critic.
SCORE_MACHINE: 8.4

*Builder note on G2.* 1.2/1.8, and the critic says itself it is "not live at M8b, because
breeding arrives at M9". `docs/RUBRIC.md`'s live-from table does not make G2 live here. No fix
at this step can move it, and it costs 0.6 of the 1.6 points gameplay is short of full marks.

*Builder note on D3.* The caption is the drill's fixed string for the wary shot, not a reading
of the frame; the frame itself is correct for `wary` (the new assertion added this cycle proves
the capture is the state the drill waited for — `0 ticks` after it). The caption should describe
what the pose actually does per-shot. Carried as a `tools/playtest.mjs` fix.

---

# M8b — run 35, 2026-10-17 — cycle 1, at `2901002`

**Scores: art-critic 7.4 · perf-critic 7.5 · gameplay-critic 8.6.** No blocking defect, so no
§4 cap applied. Two critics below 8.0, so the step does not ship on this cycle.

**The convergent finding, and it is this run's own fault.** All three critics independently
report that M8b's artefacts do not show their subject. art calls the keeper a 25 px brown cone
and finds it fully hidden behind a shrub in `19-wild-settle.png`; gameplay measures the dragon
at ~100 px and the keeper at ~15 px in the clip; both find the mid-takeoff dragon clipped off
the top edge of `20-wild-flee.png`, the one shot whose whole job is to show the takeoff. The
step built a `__dragonveinWild.closeUp(dist, elevDeg, withKeeper)` hook and then framed every
shot and the clip wide anyway. That is a real defect in this step's evidence, not a scorer
quibble, and it also makes gameplay's D1 ("are the tells readable without the calm meter?")
unanswerable from these artefacts rather than answered badly.

## perf-critic — 7.5 (P1 1.2/2.5 · P2 1.8/1.8 · P3 1.8/1.8 · P4 1.0/1.5 · P5 1.2/1.2 · P6 0.5/1.2)
- [major] P1 — no real-hardware row covers the M8b scene; newest is `6b06392`, 2026-10-13,
  before M8. Pointer: STATE.md §Real-GPU verification log.
- [major] P1 — frame-cost reproducibility unproven: `gpuFrameMs.p50` 737.4 against ~135 ms
  recorded for this scene earlier, `presentIntervalMs.p95` 1466.6.
- [major] P4 — the heap budget passes by 2.6 %: `bytesPerFrame` 39 899 against 40 960,
  `uncorrectedBytesPerFrame` 45 184.
- [minor] P4 — `perf.json`'s note and the code disagree on the idle baseline:
  `idleBytesSubtracted` 1 902 446 (the per-callback figure) against the note's
  `idleBytesPerSecond` 48 340.
- [minor] P6 — no real-hardware Potato number at M8b; `potato.frameCostMs.p95` 511.0 unenforced.
- [minor] `potato.cpuFrameMs.max` 6.2 against 3.5 while p95 is the enforced line.
SCORE_MACHINE: 7.5

*Builder note on the second major.* Refuted by measurement, and the score stands regardless.
The ~135 ms baseline it cites is STATE.md's own SwiftShader figure for a **32 568-triangle**
scene at `c429d4a`, before M5 dressed the island; the measured scene here is **233 144**
triangles, 7.2×. M8b's own contribution is bounded by two `gate:perf` runs in one container on
one day: **688.9 ms p50 before the fix (`3fc0cf7`) and 737.4 ms after (`2901002`), about 7 %**
for an animated skinned dragon plus a second animated body. The gap the defect names is M5's
dressing, not this step, and `frameBudgetEnforced` is false on SwiftShader either way.

*Builder note on the fourth minor.* Real, and worth knowing which way it errs. The code
subtracts `idleBytesIfChargedPerCallback` (1 902 446 B); the note describes
`idleBytesPerSecond`, which over this 276.5 s window would be 13 366 088 B and would yield
~8 056 B/frame. **The code is the stricter of the two readings, so the pass is earned, not
inflated.** The note is what is wrong, and it is fixed in its own commit.

## art-critic — 7.4 (A1 0.8/1.2 · A2 0.6/1.0 · A3 1.0/1.2 · A4 0.9/1.6 · A5 1.0/1.2 · A6 1.0/1.4 · A7 0.9/1.0 · A8 0.8/0.8 · A9 0.4/0.6)
**Coverage:** 6 of 21 shots opened as images (01, 17, 18, 19, 20, 21); HUD 360/320, orbit and
save-state shots not opened; `m8b-approach.webm` decoded at 0.4 fps, 6 of 14 frames viewed;
`m0-island.webm` not decoded; `artifacts/variants/` absent so no variant sheet opened. No
lines n/a.
- [major] A4 — `artifacts/variants/` does not exist in the tree, so A4 was scored from in-frame
  flora variety alone. Every frame holds exactly one dragon, so dragon variation is unevidenced.
- [major] A1/A6 — `19-wild-settle.png`: the keeper is fully hidden behind the blue shrub at
  ~x470,y350. In 17/18/20 it is ~25 px tall and reads as a brown cone.
- [major] A1 — `20-wild-flee.png`: the mid-takeoff dragon (altitude 1.075) is clipped at the top
  edge, ~x720-810, y0-15, under the HUD. The flee is not visible.
- [minor] A1 — `17-wild-wander.png`: the blue dragon sits against blue shrubs of the same hue;
  tail and wing silhouettes merge with them.
- [minor] A9/A2 — the dragon is saturated cobalt with hard faceted shading against the concept's
  soft orange; ~200 px wide in a 1280 frame against ~40 % of the frame in `docs/concept/`.
- [minor] A5 — `21-wild-wary.png`: the log says "crouched low, lower 0.289" but the image shows
  wings spread and neck raised, with no crouch visible.
- [minor] A2 — `tools/art-probe.mjs artifacts/shots/01-wide.png`: 127 of 720 sky rows (17.6 %)
  over dE 12, worst y=145 (#af6a48, dE 34.6). The deck is flat saturated green between props.
- [minor] A6 — in the turntable frames the island holds one creature and nothing else moves.
SCORE_MACHINE: 7.4

*Builder note on A9's framing half.* The ~200 px dragon width is the camera's fixed arc, not a
choice this step made: `ORBIT_LIMITS` is distance 15-32, and widening it is an owner decision
recorded as **"The camera stays a diorama"** in `docs/DECISIONS.md` (2026-10-17). The hue half
stands on its own: cobalt is this seeded dragon's `tide/tide` element, so it is the genome
working, but nothing in the artefacts shows a critic that.

*Builder note on A4.* `artifacts/variants/` is produced by `npm run assets:render`, which needs
Blender, and by `node tools/dragon-sheet.mjs` for the dragon sheet. Neither ran this run, so the
absence is an artefact-availability gap rather than a judgement about the assets. The dragon
sheet is cheap to produce and should be, so A4 can be scored on evidence.

## gameplay-critic — 8.6 (G1 1.7/2.2 · G2 1.2/1.8 · G3 1.3/1.4 · G4 1.4/1.4 · G5 1.5/1.6 · G6 1.5/1.6)
**Coverage:** did not drive the build; read `playtest.log` lines 79-115, opened all five new
shots, extracted 7 frames from the clip and read 3 (t=20, 28, 33 s); grepped `perf.json` for p95
only. No calm-versus-spook attempts under mouse or touch, so the legibility judgements come from
stills and the clip, not live play.
- [major] D1 — the tells are hard to read without the calm meter. `17-wild-wander.png` and
  `21-wild-wary.png` both show a long flat wings-out body at similar size; `lower` differs by
  only 0.23 (0.063 vs 0.289). Alert (18) vs settle (19) is also subtle. Repro: open the five
  shots at 1280x720 and cover the HUD calm bar.
- [major] D2 — the clip does not show the tells: the dragon is ~100 px long and the keeper ~15 px
  at t=20/28/33 s; neck, head and tail changes cannot be seen. The flee in 20 is cut off at the
  top edge. Repro: `ffmpeg -ss 28 -i artifacts/turntables/m8b-approach.webm -frames:v 1 f.png`.
- [minor] D3 — the wander pose looks like a glide: shot 17 shows wings spread flat while the log
  reads altitude 0.000, glide 0.000, walk 0.802.
- [minor] D4 — touch evidence is by log only; no screenshot or clip of a touch tap or touch calm
  approach, and the touch drill checks only the camera and a goal point.
- [minor] D5 — the smoke run's frame pace is 2-3 FPS (`frameMs` 99.9/250/400), probably software
  GL; the critic could not tell whether it affects reaction timing.
SCORE_MACHINE: 8.6

*Builder note on G2.* Scored 1.2/1.8 and described by the critic itself as "a neutral score, not
a measurement": breeding does not exist until M9, and `docs/RUBRIC.md`'s live-from table does not
make G2 live at M8b. It is not a defect of this step, and no fix here can move it.

*Builder note on D3 and art's A5.* Two critics independently report wings spread flat on a
grounded dragon (`walk` 0.802/1.000, `altitude` 0.000, `glide` 0.000). That is the
"measure the pixels, not the prose" hazard in NEXT.md, and it is being investigated as a
possible M7 rest-pose defect rather than written off as a framing artefact.

---

# M8a — run 32, 2026-10-16 — cycle 3, at `9179782`

**Scores: art-critic 8.5 · perf-critic 8.8 · gameplay-critic 8.9.** No blocking or major defect, so
**M8a ships**. The cycle-2 major is fixed: `setAside` now matches the whole stored value the
session refused (gen, writer, seq, savedAt and text), so a stale tab's start-fresh moves nothing.
D2–D8 are also fixed, and `startedAt` now sits above the sim step.

## perf-critic — 8.8 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.1 · P5 1.2 · P6 1.1.

Readings at this commit:
- cpuFrameMs p50 0.9 ms and p95 1.5 ms, now including the sim step (it was 0.8 / 1.4);
- 17 draws;
- heap 37 874 B per frame against 40 960 (43 938 uncorrected);
- bundle 236 700 B gzip;
- bootMs 394;
- meshgen max 60.3 ms.

Defects:
- [minor] P4: 7.5 % headroom, falling. The post-scavenge floor rises from 5 251 to 6 017 KB
  over 298 s, and promotion has not been separated from retention.
- [minor] `save.maxMainThreadMs` is 4.0 ms, up from 0.8, probably a cold-JIT first save on
  a 152 B world. It is still unbudgeted, and there is still no save probe that scales with
  roster size. Record the per-save list; add 50- and 200-dragon probes with a budget.
- [minor, forward] Saves serialise in full and issue at once, with no coalescing.
- [minor] No real-GPU row since `6b06392`.
- [minor, info] Unpaced backpressure. The restored roster's mesh timing is still untimed.

SCORE_MACHINE: 8.8

## art-critic — 8.5 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.0 · A6 0.9 · A7 0.9 · A8 0.7 · A9 0.5.

All six save-state shots (09, 10, 13, 14, 15, 16) keep one consistent HUD style. The wording is
honest, and the buttons are 44 px, gold on navy: values about 14.8:1, button text 11.3:1.

Defects:
- [minor] A6/A9: the HUD shows "DRAGONS 3" and no dragon is drawn. Carried.
- [minor] A7: the warning panels in 13, 14 and 16 cover the hanging island. This is occlusion,
  not contrast.
- [minor] A5/A8: dark slivers float in the sky, at about (320,168) and (700,100) in 09, and
  (690,125) and (1190,45) in 16.
- [minor] A6: bare sky outside the islands. No change to density from this step.
- [minor, carried] The dragon-sheet captions are below 4.5:1, and the sails of C and G show
  facets.

*Coverage:* 14 of 21 shots and 3 variant sheets.

SCORE_MACHINE: 8.5

## gameplay-critic — 8.9 (7.3 of 8.2; G2 n/a until M9b)

G1 2.1 · G3 1.2 · G4 1.3 · G5 1.3 · G6 1.4.

The critic could not lose a bred dragon or wedge the game. It ran, all at 360 and 320 px for
the touch cases:
- the set-aside identity cases, including a double click and nine junk record types;
- "saved means durable" with the journal healthy, full or blocked, and with a `put` that throws;
- a storm of change-then-reload with the store held, which lost 0 dragons;
- the read timeout with the real 10 s default, and a hold released at 6 s;
- emptied-slot re-saves;
- touch taps on every action.

Defects:
- [minor] D1: "saved" can show for up to about 250 ms after a roster change, because
  `seedRoster` paints the HUD before `saveWorld()` bumps seq. Real callers at M8c and M9 must
  save first, or bump seq first.
- [minor, forward] D2: start-fresh parks the old record in `refused.*`, and nothing in-game
  reaches it. For a `newer` record this can strand a whole roster on a stale build. It becomes
  a major once a second schema ships. Either offer only reload for `newer`, or have the next
  build recover from `refused.*`.
- [minor] D3: when the IndexedDB open times out or fails (4 s), the HUD says "storage
  unavailable" and offers no reload button.
- [minor] D4: after storage is cleared under two tabs, the first tab to save wins the slot.
  `navigator.storage.persist()` is never called.
- [minor, info] D5: the journal sweep deletes entries it cannot decode, and ties sort by seq
  across writers.
- [minor, cosmetic] D6: a stale `detail` after a double-clicked start-fresh. D7: the "journal
  off" line never clears.

SCORE_MACHINE: 8.9

---

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
