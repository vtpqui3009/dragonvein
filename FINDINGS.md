# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M4d — run 18, 2026-10-12 — cycle 1, at `e699c95`

**Scores: art-critic 8.3 · perf-critic 8.7 · gameplay-critic 9.0.** No blocking defect. Art per
generator: arch 8.4, floatshard 8.2. Every critic and every generator is ≥ 8.0, so **M4d
ships** on its first pass. Every M4 step is now `DONE`. The milestone waits on the owner
seeing the assets (CLAUDE.md §7).

## perf-critic — 8.7 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [minor] The perf artefacts do not exercise M4d: nothing under `src` loads the landmarks.
  Draws 27 and triangles 42 268 are unchanged.
- [minor] The real-GPU log is stale for M4: the last row is a sighting at `3ab6e84`.
- [minor, forward] P4 headroom: `heap.bytesPerFrame 33025` of 40 960, about 4 more draws.
  Place the assets as one `InstancedMesh` per type.
- [minor] There is no real-hardware Potato figure.

SCORE_MACHINE: 8.7

## art-critic — 8.3 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.25 · A5 0.9 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.5.

- [major] A4 `variants/floatshard.png`: seeds 1 and 3 are both one big grass-capped cone
  plus a satellite, and seeds 5 and 6 are both bare debris fields.
- [major, carried] A6 `shots/01-wide.png`: no landmark is placed (M5e).
- [minor] A1 `variants/floatshard.png`, seed 6 (x≈1300–1450): the fragments fuse into one
  mound, and the tiny satellites vanish at 25 %.
- [minor] A4 `variants/arch.png`, seeds 2 and 5: each reads as a squat block with a tunnel
  (seed 5 hole 0.40).
- [minor] A5 `turntables/floatshard.webm` at about 1.0 s: a fragment clips into the main
  rim.
- [minor] A5 `variants/arch.png`, seed 7: rubble sits inside the span, and the opening has
  step-like ledges.
- [minor] A3 floatshard: the undersides are near deepShadow, so the facets are hard to
  read.
- [minor] A2 arch: dusk reads as orange clay.
- [minor] A8: LOD1 and LOD2 are never rendered in the artefacts.

SCORE_MACHINE: 8.3

## gameplay-critic — 9.0 (G2, G4, G5 n/a)

G1 2.2 · G3 1.4 · G6 1.6, less 0.5 for the unexercised-asset gap and 0.3 for the sheet
minors.

- [major, informational] G1: no arch or floatshard appears in any shot or in the log. A
  placement step must add a shot.
- [minor] `variants/arch.png`, seeds 2 and 5: not clearly two-legged arches.
- [minor] `variants/floatshard.png`, seed 6: one fused mass; seeds 5 and 6 have no green.
- [minor] The probe prints "(fails at ≤ 8%)" on a passing run, which is easy to misread.

SCORE_MACHINE: 9.0

---

# M4c — run 17, 2026-10-12 — cycle 1, at `3a2287f`

**Scores: art-critic 8.3 · perf-critic 8.5 · gameplay-critic 9.0.** No blocking defect. Art per
generator: shard 8.4, eroded 8.3. Every critic and every generator is ≥ 8.0, so **M4c ships**
on its first pass.

## perf-critic — 8.5 (all six lines)

P1 1.6 · P2 1.8 · P3 1.8 · P4 1.2 · P5 1.2 · P6 0.9.

- [major] P1: the newest real-GPU row is a sighting at `3ab6e84`, before M3 and M4. There is
  no verification-grade row and no Potato row.
- [minor] P4 headroom is thin: 33 135 of 40 960 B/frame, about 4 draws' worth. Place the
  rocks as one `InstancedMesh` per kind, with no extra draw per LOD.
- [minor] The new rocks are not loaded by `src`, so no frame measures them. Re-run
  `gate:perf` at the step that places them.
- [minor, informational] The SwiftShader frame figures are advisory
  (`frameCostMs.p95 503.189`).

SCORE_MACHINE: 8.5

## art-critic — 8.3 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.2 · A5 0.9 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.5.

- [major] A6 `shots/01-wide.png`: none of the five rock kinds is placed (M5e).
- [major] A4 `variants/eroded.png`: seeds 6/8 and 4/7 are near-pairs, and 2/5 are two low
  domes. Seed 5 is the weakest "eroded" read.
- [minor] A9/A1 `variants/shard.png`: the spires read as copper or wood splinters, and
  concept 03 has no counterpart for them.
- [minor] A5/A3 `turntables/shard.webm` frames 7–10: a pale base plate, and smooth oval
  base blobs that clash with the faceted spikes.
- [minor] A5 `turntables/eroded.frame00.png`: sliver triangles on the cap, and a notch at
  about 1.1 s.
- [minor] A3 `variants/eroded.png`, seeds 1, 3 and 6: dark smears on the shafts.
- [minor] A8: LOD1 and LOD2 are never rendered. Check eroded seeds 5 and 8 for hollows that
  show through.
- [minor] A2: dusk dominance reads as orange clay, as on the earlier rocks.

SCORE_MACHINE: 8.3

## gameplay-critic — 9.0 (5.1 of 5.2, rounded down; G2, G4, G5 n/a)

G1 2.2 · G3 1.3 · G6 1.6.

- [minor] G3 `playtest.log`: no input-to-frame latency is logged.
- [minor] G1/G3: SwiftShader runs at 6–7 FPS, so the log cannot show interaction
  smoothness.
- [minor] Coverage: neither rock appears in any shot.

SCORE_MACHINE: 9.0

---

