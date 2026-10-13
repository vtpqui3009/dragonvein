# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M5d — run 23, 2026-10-13 — cycle 2, at `d1dcabe`

**Scores: art-critic 8.0 · perf-critic 8.15 · gameplay-critic 9.7.** No blocking defect, and
all three critics are ≥ 8.0. **M5d still does not close**, because criterion 6 is per
generator and cycle 2 puts three of four under 8.0: reeds 8.0, bush 7.8, grassclump 7.8,
fern 7.4.

## The reason this round did not close the step, stated plainly

Cycle 2 ran a second, independent art-critic over the **same artefacts** for three of the four
generators. `bush`, `reeds` and `grassclump` are **byte-identical** between `9e1a2b6` and
`d1dcabe` — only `assetgen/flora/fern.py` and the three `flora/fern.lod*.glb` changed. Their
art cannot have moved. Their scores did:

| generator | cycle 1 | cycle 2 | delta | asset changed between cycles? |
|---|---|---|---|---|
| bush | 8.6 | 7.8 | −0.8 | **no — byte-identical** |
| reeds | 8.2 | 8.0 | −0.2 | **no — byte-identical** |
| grassclump | 8.1 | 7.8 | −0.3 | **no — byte-identical** |
| fern | 7.7 | 7.4 | −0.3 | yes, rebuilt |

So the per-generator estimate carries roughly **±0.8 of scorer variance** on an unchanged
artefact. That is larger than the margin the step is being accepted on, which means criterion
6 as written is not a stable measurement. This is recorded, not worked around: the run did
**not** average the two cycles, did not take the kinder cycle, and did not re-roll a third
art-critic hoping for a friendlier number. Re-scoring an unchanged tree for a better result is
score-fishing (`CLAUDE.md` §4, `critic-round` §4) and the favourable reading was available and
was refused.

It also means **no rework cycle 3 was run**. A third cycle would have to "fix" `bush` and
`grassclump`, whose files did not change and whose only fault is that a second scorer rated
them lower. There is no defect in that code to fix, so changing it to move a number would be
chasing the scorer rather than the artefact. The one genuinely actionable item left is fern's
remaining near-pairs, carried to the next run below.

**On the fern rework itself.** Cycle 2's art-critic scored fern 7.4 while describing the
rebuild as "a real improvement — fronds now have a stipe, a rachis and discrete pinnae, and
the croziers read as ferns", and confirmed the four habits (vase, spread, fountain, bracken).
Both of cycle 1's form majors are gone: the "single wide serrated blade / reads as an agave"
finding and the "3 silhouettes across 8 seeds" finding do not appear in cycle 2. What replaced
them is a narrower A4 complaint about two specific near-pairs. The prose and the number
disagree; both are recorded, and the number is not adjusted.

## perf-critic — 8.15 (all six lines live)

P1 1.25 · P2 1.8 · P3 1.8 · P4 1.5 · P5 1.2 · P6 0.6.

Measured: draws 28/180 · triangles 174 012/900 000 · `cpuFrameMs` p50 0.8, p95 1.2 of 3.5
(enforced; rasteriser cap verified, `threadsWrong = 0`) · meshgen max 35.7 ms of 120 · heap
36 605 B/frame of 40 960, `netGrowthKB` −693 so it is churn, not a leak · bundle 193 792 B of
1 400 000 · boot 244.7 ms of 2 500.

Flora against the prop row 4000/1200/300 — all inside budget. Fern's rebuild raised LOD0 from
1212 to **2624** (66% of budget), LOD1 692, LOD2 176:

| asset | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| bush | 1244 | 624 | 216 |
| fern | 2624 | 692 | 176 |
| reeds | 984 | 424 | 152 |
| grassclump | 1564 | 836 | 162 |

- [major, standing] No current real-GPU entry; scored the real-hardware half of P1 at 0.
  *Builder note: this critic read the §Real-GPU verification log as having "one row only",
  the 2026-10-10 `c429d4a` sighting. The log has **two** rows — STATE.md line 459 adds a
  2026-10-12 `3ab6e84` sighting, which it did not see. Cycle 1's perf-critic read the newer
  row and scored the same half 0.5, which is the whole 0.5 difference between 8.65 and 8.15.
  Per `critic-round` §3 the score is recorded as given and **not** changed. Separately, and
  worse for the owner: `3ab6e84` does not resolve in this repo — `git log -1 3ab6e84` returns
  "unknown revision" — so the newest real-GPU row cites a commit that does not exist. Both
  cycles' critics are right that there is no usable current row.*
  **— Correction, entered after this round: that last sentence was wrong, and the error was
  the builder's, not the critics'. This container's clone is shallow (`clone_depth` 50; 60
  commits of 211), which is why the hash did not resolve. After `git fetch --unshallow`,
  `3ab6e84` is `docs(next): the owner's real-GPU command, now that it can pass`, 2026-10-12,
  on main's history. The row is sound. Both perf rounds deducted P1 over a defect that did
  not exist; check `git rev-parse --is-shallow-repository` before reading a missing hash as a
  missing commit.**
- [major, forward — M5e] ~4 355 B of heap headroom at 36 605 of 40 960, about **2 draws** at
  PERF_BUDGET's ~1.8 kB per draw, with the scene already at 28 draws. Placement must use one
  `InstancedMesh` per plant type with LOD inside the instance, and merge existing draws.
  Consider splitting the pooled depth material. **Three independent perf rounds now agree on
  this** (run 22's, cycle 1's and cycle 2's).
- [minor] Potato 30 fps and Medium 16.6 ms are both unverified on real hardware
  (`frameCostMs.p95` 655.372; `potato.frameCostMs.p95` 366.907; `realGpuRequested false`).
- [minor] The 1080p tier is "Medium minus post", so any frame figure is a floor.
- [minor] Instanced plant LOD0s of 984–2624 triangles each multiply quickly at M5e; the scene
  is at 174 012 of 900 000 today.

SCORE_MACHINE: 8.15

## art-critic — 8.0 (all nine lines live)

A1 0.9 · A2 0.8 · A3 0.9 · A4 1.3 · A5 1.1 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.4.

**Per generator: reeds 8.0 · bush 7.8 · grassclump 7.8 · fern 7.4.**

- [major] A4 `variants/fern.png`: seeds 1 and 8 are the same upright vase at similar height
  and spread (seed 1: 8 fronds, height 0.86, width 1.60); seeds 3 and 5 are both low, wide,
  uncurled fans about 0.3 high. **This is the one actionable rework item left in M5d.**
- [major] A6 `shots/01-wide.png`, `shots/05-potato.png`: the four generators are not placed,
  so the ground between the trees carries no understory. Expected before M5e; the line is
  scored as it stands.
- [minor] A4 `variants/bush.png`: seeds 3, 6 and 8 are all tall stacked-blob forms, 3 and 8
  differing mainly in width; only seeds 2, 4 and 7 carry blooms.
- [minor] A2/A4 `variants/fern.png`: the pinnae are hard-edged, saw-toothed and uniformly
  bright green; seeds 1 and 8 read flat and busy in silhouette.
- [minor] A4 `variants/fern.png`: the bracken seeds 6 and 7 stand on stalk bases that read as
  logs or pebbles, and their stipes are very sparse.
- [minor] A4 `variants/grassclump.png`: seeds 3 and 8 are both low, sparse and droopy; seed 5
  is a tiny tuft.
- [minor] A3 `shots/05-potato.png`: with the shadow pass off, bushes and rocks lose contact
  grounding. Expected for Potato.
- [minor] A6 `shots/01-wide.png`: the distant island sprites read as speckle, not vegetation.

*Builder note: this critic states it did not open the turntables and read only three of the
fourteen shots, where cycle 1's opened more. Recorded as a difference in coverage between the
two rounds; neither score is adjusted for it.*

SCORE_MACHINE: 8.0

## gameplay-critic — 9.7 (6.6 of 6.8; G2 and G4 n/a)

G1 2.2 · G2 n/a · G3 1.2 · G4 n/a · G5 1.6 · G6 1.6. Identical to cycle 1, which is expected:
the playable build is byte-identical, since the game does not load the fern `.glb`.

- [minor] No input-latency line in `playtest.log`, so G3's 100 ms bound is unverified.
- [minor] The log's FPS 5 / `frameMs` 2649.9 is the software renderer, with `cpuFrameMs`
  0.7–0.9; it belongs to perf.
- [minor] Nothing in M5d can be seen in game until M5e places it.

SCORE_MACHINE: 9.7

---

# M5d — run 23, 2026-10-13 — cycle 1, at `9e1a2b6`

**Scores: art-critic 8.3 · perf-critic 8.65 · gameplay-critic 9.7.** No blocking defect, and
all three critics are ≥ 8.0 — but M5d is accepted **per generator** (run 22 criterion 6), and
art puts **fern at 7.7**: bush 8.6, reeds 8.2, grassclump 8.1, fern 7.7. **M5d does not close
on this pass.** Fern goes to rework cycle 2; the other three are done.

**Which perf run this is, and why it was re-run.** Run 22's perf-critic scored this same code
tree 8.6 before its session died. That score is recorded here for the history, attributed to
run 22 — but it is **not** the score this round uses. `artifacts/` is git-ignored, so run 22's
`perf.json` never reached this container; it was measured on another machine under another
load and cannot be read or reproduced here. RUBRIC P1 is "frame cost **measured
reproducibly**", so the measurement *is* the artefact: adopting 8.6 would attach a score to a
`perf.json` no critic has seen. Perf was therefore re-run alone on a quiet container against
artefacts generated at `9e1a2b6`. This is not score-fishing (CLAUDE.md §4) — that is
re-rolling a scorer on an artefact that still exists, and this artefact did not. The two
numbers landing 0.05 apart is corroboration, not a reason to have skipped it.

## perf-critic — 8.65 (all six lines live)

P1 1.75 · P2 1.8 · P3 1.8 · P4 1.5 · P5 1.2 · P6 0.6.

Measured: draws 28/180 · triangles 174 012/900 000 · `cpuFrameMs` p50 0.9, p95 1.4 of 3.5
(enforced, rasteriser cap verified, 369 samples of a 360 target) · meshgen max 27.3 ms of 120
· heap 36 292 B/frame of 40 960 · bundle 193 792 B of 1 400 000 · boot 292.8 ms of 2 500.

New generators against the PERF_BUDGET prop row 4000/1200/300 — all 12 LODs inside budget:

| asset | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| bush | 1244 | 624 | 216 |
| fern | 1212 | 456 | 156 |
| reeds | 984 | 424 | 152 |
| grassclump | 1564 | 836 | 162 |

- [major, standing] The real-hardware half of P1 is stale and unverifiable. The newest
  §Real-GPU verification log row cites `3ab6e84`, which did not resolve in this repo **because
  the clone is shallow — see the correction in the cycle 2 round above; the row is sound**, and it
  predates M5a's 220 wind instances. *Builder note: confirmed — `git log -1 3ab6e84` returns
  "unknown revision".* This step cannot move it; it is an owner item.
- [major, standing] P6 has no wall-clock evidence: `potato.frameCostMs.p95` 448.973 ms vs
  33.3 ms, advisory only because `potato.frameBudgetEnforced = false`, and no real-hardware
  Potato row exists anywhere. The remedy is a real-GPU Potato row, never raising the budget.
- [major, forward — M5e] **Draw calls and heap churn are coupled, and the wall is close.**
  PERF_BUDGET §heap churn models ~2 kB per draw and puts the real draw ceiling near 20, not
  180. The scene is already at 28 draws and 36 292 B/frame, leaving ~4 668 B — about **two
  draws** of headroom. `heap.uncorrectedBytesPerFrame` is 45 200, over budget, passing only
  via the idle-baseline subtraction. **Placing the four understory types at M5e as separate
  draws, or one draw per LOD, will trip the heap gate.** Merge them: one `InstancedMesh` per
  plant type with LOD chosen per instance bucket, or one merged instanced batch for the
  understory, keeping the 220 trees on the existing path. *Run 22's perf-critic reached this
  same conclusion independently; two rounds now agree.*
- [minor] PERF_BUDGET.md's SwiftShader figures ("~135 ms", "~170 ms for 20 draws") are stale
  against `gpuFrameMs.p50 = 593.298` for 28 draws. Record the M5 figures.
- [minor] Heap sawtooth 3 748 kB over 18 scavenges, within the churn budget. `gc.worstCpuFrameMs`
  8.7 bounds any GC pause but does not confirm it is under 2 ms.

SCORE_MACHINE: 8.65

## art-critic — 8.3 (all nine lines live)

A1 1.0 · A2 0.9 · A3 1.0 · A4 1.3 · A5 1.0 · A6 0.95 · A7 0.9 · A8 0.8 · A9 0.45.

**Per generator: bush 8.6 · reeds 8.2 · grassclump 8.1 · fern 7.7.**

- [major] A4 `variants/fern.png`: seeds 1 and 3 are the same upright vase of 6–7 fronds
  (breadth 0.31 and 0.24); seeds 2, 5 and 7 are three small low rosettes. Structure — frond
  count, breadth, droop — does not vary enough: **3 silhouettes across 8 seeds.**
- [major] A9/form `variants/fern.png`, every seed: the fronds are single wide serrated
  blades, not divided pinnae, so they read as an agave or leaf fan rather than a fern. The
  fiddlehead curl is barely visible (seed 7).
- [major] A4 `variants/grassclump.png`: seeds 2 and 7 are near-twins (heads 6 and 7, height
  0.65 and 0.74); seeds 1 and 4 are also similar tall fountains with 2–4 heads.
- [minor] A5 `variants/bush.png` seed 5: a flat slab of overlapping lobes, 0.82 m by 2.30 m,
  with almost no trunk. Reads as a rock or mat, not a bush.
- [minor] A1 `variants/reeds.png` seed 5 and `variants/grassclump.png` seeds 2 and 5: thin
  and small, they will vanish at 25%.
- [minor] A4 `variants/reeds.png` seeds 3 and 8: both tall headless fans, about 1.5 m.
- [minor] A3 `variants/*.png`: the bush ground shadows are faint and detached.
- [minor, carried] A6 `shots/01-wide.png`, `shots/06-hud-360.png`: the lower island meadow is
  bare green. M5e's placement must fill it.

SCORE_MACHINE: 8.3

## gameplay-critic — 9.7 (6.6 of 6.8; G2 and G4 n/a)

G1 2.2 · G2 n/a · G3 1.2 · G4 n/a · G5 1.6 · G6 1.6.

G2 is n/a because breeding arrives at M9 and no dragon is in the build; G4 because save
arrives at M8. The playable build is unchanged by M5d — the generators are unplaced until
M5e — and the log shows no regression: 28 draws, 174 012 tris, 220 wind instances, 0 page
errors, context loss induced and restored (1 attempt, loop running again), camera clamps held
under a wheel flood, HUD clean at 1280, 360 and 320 px.

- [minor] No input-latency line in `playtest.log`, so G3's 100 ms bound cannot be verified.
  `grep -i latency artifacts/playtest.log` returns nothing. The deduction is for the missing
  measurement, not an observed failure.
- [minor] The log's 4 FPS and `frameMs` 3083 are the software renderer, not a game defect.
  Noted so nobody reads gameplay smoothness from this run.
- [minor] M5d's generators are unplaced, so nothing in this step can be seen in game. That
  matches the plan. M5e must verify the understory in the scene.

SCORE_MACHINE: 9.7

---
