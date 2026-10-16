# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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
