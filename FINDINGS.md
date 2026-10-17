# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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
