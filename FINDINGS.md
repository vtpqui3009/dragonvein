# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M1a — run 7b, 2026-10-12 — cycle 1, at `2adc4f1`

**Scores: art-critic 8.65 · perf-critic 7.4 · gameplay-critic 9.6.** No blocking defect from
any critic. A4 (variant sheets) went live at this step and scored 1.4 / 1.6.

## perf-critic — 7.4 (6.1 of 8.2; P3 n/a)

P1 1.5 · P2 1.8 · P4 1.0 · P5 1.2 · P6 0.6.

- [major] P1: the real-GPU log's only row is a `sighting` at `c429d4a` (M0). It is stale for
  this milestone, and only the owner can supply a new one.
- [major] P1: the advisory SwiftShader `gpuFrameMs.p50 389.976` against a ~135 ms note in
  PERF_BUDGET.md. *Builder note:* the 135 ms is from the pre-M0d 20-draw scene. The same
  instrument read 404–547 ms over M0d–M0f at the same 27 draws and 42 268 tris, and M1a
  changed nothing in the scene.
- [minor] P4: `heap.bytesPerFrame 33 047` vs 40 960 (`uncorrectedBytesPerFrame 39 017`).
  Thin headroom before flora is placed.
- [minor] P6: `potato.frameCostMs.p95 212.77` is advisory only.
- [minor] P5 / instrument: `bundle.gzipBytes 232 674` counts the shipped `.glb` files and
  MANIFEST, about 88 KB, which Vite copies into `dist/assets/`. CLAUDE.md §2.6 says the
  budget excludes assets. **Fixed after this round** in its own gate commit.
- [minor] the asset's runtime cost is unmeasured until it is placed in the scene.

SCORE_MACHINE: 7.4

## art-critic — 8.65 (of 10; all nine lines scored)

A1 1.1 · A2 0.9 · A3 0.9 · A4 1.4 · A5 1.1 · A6 1.1 · A7 0.9 · A8 0.8 · A9 0.45.

- [minor] A4 `variants/broadleaf.png`: there is no per-seed colour or value variation. Leaf
  tone, bark and lobe style are identical across seeds, and the metrics JSON has no colour axis.
- [minor] A4 seeds 6 and 8 (x 1300–1420, 1800–1950 at 2000 px): the weakest visual pair,
  though the probe has them apart.
- [minor] A5/A8 seed 5 (x 1075–1135, y 335–350): a bare branch stub pokes out under the canopy.
- [minor] A8 seeds 5 and 7, trunk bases: the root flare reads as a flat, lighter, hard-edged
  plate rather than roots.
- [minor] A3: the sheet shows no visible cool fill or warm rim, and the stage is a grey-mauve
  that is not a bible colour.
- [minor] A2 `tools/variant-probe.mjs`: bark is checked against the generator's own
  `#4a3b2f`, which is not an ART_BIBLE entry. That check is circular. Measured ΔE 6.8 to
  `rock mid`, so the colour passes, but the instrument should check against the bible.
- [minor] A6: the tree is not placed in the scene, so A6 cannot move at M1a.
- [minor] the turntable shows seed 1 only, at 512².

SCORE_MACHINE: 8.65

## gameplay-critic — 9.6 (5.0 of 5.2; G2, G4, G5 n/a)

G1 2.2 · G3 1.2 · G6 1.6.

- [minor] G3 `playtest.log` `input:` lines: event-to-render latency is not timed.
- [minor] G1: nothing playable changed, because the tree is not in the scene.
- [minor] process: the critic's own latency probe hung under SwiftShader and was killed. No
  product defect is claimed from it.

SCORE_MACHINE: 9.6

---

Reports for closed steps live in [`docs/archive/FINDINGS-2026-10.md`](docs/archive/FINDINGS-2026-10.md),
whole and unedited. This file keeps the two newest scoring rounds, whose defect lists are the
current open set. When a step closes, move the round two places below it to the archive.

---

