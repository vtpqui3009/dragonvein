# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M0f — run 6, 2026-10-11 — cycle 1, at `c6995c4`

**Scores: art-critic 8.3 · perf-critic 7.8 · gameplay-critic 8.8 (from 6.7).** No
blocking defect from any critic. G6 went from 0.5 to 1.5 / 1.6.

Before the fix, the new drill against the previous build failed every G6 assertion. It also
found a defect nobody had listed: on a `hasTouch` context, a pinch zoomed the **page** to
`visualViewport.scale 5`.

## perf-critic — 7.8 (6.4 of 8.2; P3 n/a)

P1 1.8 · P2 1.8 · P4 1.0 · P5 1.2 · P6 0.6.

- [major] P1: no real-GPU verification at this milestone. The only row is a `sighting` at
  `c429d4a`. **Only the owner can supply this**; see `docs/PERF_BUDGET.md` §Real-GPU verification.
- [major] P1: the SwiftShader `frameCostMs.p95` drifts across runs: 423 → 495 → 547 ms at
  identical draws and tris. It is advisory. *Builder note:* 27 draws and 42 268 tris have
  been unchanged since M0d, and M0e/M0f changed no geometry, material or shadow setting,
  so the drift is the container. A next run could test that by running `gate:perf` three
  times on one commit.
- [major] P4: `heap.bytesPerFrame 33 632` vs 40 960. It was 31 565 at M0e and 34 944 at M0d,
  so this is within the run-to-run spread. `applyOrbit` returns early without input.
- [minor] P6: no Potato row on real hardware.
- [minor] `tier.configured=false`, which is "Medium minus post".

SCORE_MACHINE: 7.8

## art-critic — 8.3 (7.0 of 8.4; A4 n/a)

A1 1.0 · A2 0.8 · A3 1.0 · A5 1.1 · A6 1.1 · A7 0.9 · A8 0.7 · A9 0.4. The critic found
that every reachable orbit pose still lands on a composed frame.

- [minor] A6 `09-orbit-mouse.png`: at dist 23 the frame is mostly sky.
- [minor] A5/A6 `09` (0–135, 590–720): two satellites overlap on screen, cropped by the frame edge.
- [minor] A8 `01-wide.png` (990–1005, 30–90), (510–525, 115–150): thin black shards read as glitches.
- [minor] A2 `01-wide.png` (180–285, 545–625): a yellow-olive satellite side.
- [minor] A3: the satellites have no contact shadow.
- [minor] A9: the sky is darker than the concept's pastel.

SCORE_MACHINE: 8.3

## gameplay-critic — 8.8 (4.6 of 5.2; G2, G4, G5 n/a)

G1 1.9 · G3 1.2 · G6 1.5.

- [minor] G3: input-to-presented-frame latency is not measured. Only CPU cost is credited.
- [minor] G6: pinch-in and wheel-up are not asserted on their own; only the wheel flood covers them.
- [minor] G6: these edge cases are untested: a pinch ending into a one-finger drag, a third
  finger, and a release outside the window.
- [minor] G1: the arc is narrow (az −15..105, pitch 6..22). This is deliberate until the far
  side is dressed.
- [minor] There is no keyboard orbit, which is not in M0f's scope.

SCORE_MACHINE: 8.8

---

# M0e — run 5, 2026-10-11 — cycle 1, at `b92c867`

**Scores: art-critic 8.6 · perf-critic 7.9 · gameplay-critic 6.7.** No blocking defect from any
critic. Every M0e acceptance criterion was confirmed by both the art and gameplay critics,
and each is asserted by `gate:smoke`.

Before the fix, the same drill against the previous build reproduced all three defects:
`hud @360 right = 527.6`, status line at x 505–599 of 360, and restore-gap stats
`drawCalls 0, cpuFrameMs 0.8` (stale). After the fix: `right = 350`, the status line at
x 21–339, and the restore gap reads all `null` with `contextLost: false`.

## perf-critic — 7.9 (6.5 of 8.2; P3 n/a)

| line | score | evidence |
|---|---|---|
| P1 | 1.9 / 2.5 | `cpuFrameMs.p95 1.5` vs 3.5, enforced. `frameCostMs.p95 495.3` advisory (SwiftShader). Real-GPU row is a stale `sighting` at `c429d4a`. |
| P2 | 1.8 / 1.8 | 27 draws, 42 268 tris |
| P4 | 1.0 / 1.5 | `heap.bytesPerFrame 31 565` vs 40 960. `scavenges 18`, `netGrowthKB −1726` |
| P5 | 1.2 / 1.2 | gzip 144 486, boot 376 ms |
| P6 | 0.6 / 1.2 | Potato settings verified, cpu p95 1.1. `frameCostMs.p95 256` advisory |

- [major] P1: "GPU frame cost does not reproduce: STATE says ~135 ms, this run 423/495 ms".
  **Builder note, with evidence, for the next critic to check rather than take on trust:**
  the M0d round (above, `953f156`, scored 8.7) read `frameCostMs.p95` 415.8 / 404.5 ms at
  the same 27 draws. The 135 ms figure is from the 20-draw scene before M0d. M0e changed
  no rendering code. The comparison baseline is stale, so this is not a regression.
- [major] P1/P6: the real-GPU sighting is stale (`c429d4a`, 21 draws, about 1365×610). This
  needs the owner and is already listed in `NEXT.md`.
- [major] P4: the loop still allocates about 31 kB/frame, almost all of it inside
  `three.WebGLRenderer.render` (`docs/PERF_BUDGET.md` §Heap churn). This is *lower* than
  at M0d (34 944).
- [minor] The smoke `frameMs 2166` is SwiftShader backpressure.
- [minor] `tier.configured=false`, which is "Medium minus post".

SCORE_MACHINE: 7.9

## art-critic — 8.6 (7.2 of 8.4; A4 n/a)

A1 1.0 · A2 0.8 · A3 0.9 · A5 1.2 · A6 1.2 · A7 0.9 · A8 0.8 · A9 0.4.

- [minor] A9 `01-wide.png`: a saturated orange and navy sunset against the concept's muted peach and lilac.
- [minor] A3 `01-wide.png` deck: cast shadows are subtle. Compare `05-potato.png`.
- [minor] A1 `01-wide.png`: the island underside merges with the near-black lower sky.
- [minor] A6 `01-wide.png` (x430–600, y120–190; x900–940, y40–100): dark slivers read as debris.
- [minor] A7 `01-wide.png` HUD: the FPS, DRAWS and TRIS labels are small and dim.
- [minor] `08-hud-320.png` is 640×960, which is DSF 2 and expected.

SCORE_MACHINE: 8.6

## gameplay-critic — 6.7 (3.5 of 5.2; G2, G4, G5 n/a)

G1 2.0 / 2.2 · G3 1.0 / 1.4 · G6 0.5 / 1.6.

- [major] G6: the camera does not answer the pointer. This is M0f, by design, and the reason
  the score cannot reach 8 at M0e.
- [minor] G3: no player action exists to time the 100 ms feedback line.
- [minor] `07-context-lost-360.png`: the canvas area is flat dark while lost, with no backdrop message.
- [minor] The held-lost check runs only at 360 px. There is no lost-state shot at 320.
- [minor] The `context loss:` log line says `"lost":false`, which could be labelled "restored".

SCORE_MACHINE: 6.7

---

