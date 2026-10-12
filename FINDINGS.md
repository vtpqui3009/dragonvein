# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M1b — run 8, 2026-10-12 — cycle 1, at `f7e5597`

**Scores: art-critic 8.7 · perf-critic 7.4 · gameplay-critic 8.7.** No blocking defect. The
step changes no runtime code or scene. All three critics scored unchanged frames and assets,
and the CI evidence came from Actions run `38216089403`.

## perf-critic — 7.4 (6.1 of 8.2; P3 n/a)

P1 1.5 · P2 1.8 · P4 1.0 · P5 1.2 · P6 0.6.

- [major] P1: the real-GPU log has nothing newer than the M0 `sighting` at `c429d4a`. Owner only.
- [major] P1: advisory SwiftShader `frameCostMs.p95 536.79` is at the top of the 423–547 spread,
  with no scene change since M0d.
- [major] P4: `heap.bytesPerFrame 33 282` (`uncorrectedBytesPerFrame 40 696`) vs 40 960.
  Placing flora will need instancing and no new per-frame allocation.
- [minor] P6: `potato.frameCostMs.p95 270.383` is advisory, and there is no Potato hardware row.
- [minor] `tier.configured=false` ("Medium minus post"). P3 is unmeasured until M3c.

SCORE_MACHINE: 7.4

## art-critic — 8.7 (all nine lines)

A1 1.0 · A2 1.0 · A3 1.0 · A4 1.5 · A5 1.1 · A6 1.0 · A7 1.0 · A8 0.7 · A9 0.4.

- [minor] A6 `01-wide.png` (620, 70) and (1040, 200): the satellite islets are nearly bare discs.
- [minor] A6/A9: no creature or dragon in frame. The concept's focal subject is not live yet.
- [minor] A4 `variants/broadleaf.png`: bark and canopy colour are identical across the 8 seeds.
- [minor] A8/A5: a branch stub under seed 5's canopy, and a flat root slab on seed 7.
- [minor] A8 `turntables/broadleaf.webm` frames 0–1: a pale streak under the trunk base,
  which looks like a ground-plane artefact of the render rig.
- [minor] A8: the seed labels overlap the trunk bases of seeds 1 and 6.
- [minor] the turntable is 36 frames at 18 fps, i.e. 2 s at 512². That is short for judging
  facets and LODs.
- [minor] A3 `01-wide.png`: tree-on-ground cast shadows are not legible on the hero island.

SCORE_MACHINE: 8.7

## gameplay-critic — 8.7 (4.5 of 5.2; G2, G4, G5 n/a)

G1 2.0 · G3 1.0 · G6 1.5.

- [minor] G3: pointer-to-frame latency is never timed in `playtest.log`.
- [minor] G3: SwiftShader cadence (`frameMs 2133`, FPS 5) means sub-100 ms visual feedback
  cannot be confirmed here. That needs the real-GPU check.
- [minor] `07-context-lost-360.png` has no in-world cue beyond the HUD line.
- [minor] the smoke script labels shot 04 "gameplay rubric G5", but G5 goes live at M8a.

SCORE_MACHINE: 8.7

---

