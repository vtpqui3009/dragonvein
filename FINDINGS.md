# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

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

# M4b — run 16, 2026-10-12 — cycle 2, at `4cadbbc`

**Scores: art-critic 8.5 · perf-critic 8.2 · gameplay-critic 9.2** (perf and gameplay carried
from cycle 1). No blocking defect. The rework touched only `assetgen/terrain/boulders.py` and
its three `.glb` files. The game loads none of the rocks, so the frame that perf and
gameplay measured is the same, and the gates were re-run green at `b58251a`. Art per
generator: stratified 8.4, columnar 8.6, boulders 8.1. Every generator is ≥ 8.0, so
**M4b ships**.

## art-critic — 8.5 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.1 · A4 1.3 · A5 1.0 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.5.

- [major] A6 `shots/01-wide.png`: none of the new rocks is placed in the scene. This is M5e
  work, so it is not blocking.
- [minor] A4 `variants/boulders.png`: seeds 2 and 4 (a flat slab plus one small rock) and
  seeds 6 and 7 (a small cluster) are near-pairs.
- [minor] A4/A1 `variants/columnar.png` seeds 1, 2, 4 and 5: flat hex pavements of similar
  height.
- [minor] A3/A9 `variants/stratified.png`: the vertical smears read as baked occlusion, and
  the ledge skirts on seeds 3, 4 and 5 look like cloth.
- [minor] A5 `turntables/boulders.webm` at about 1.0 s: the main boulder of seed 1 tilts, so
  its lower edge looks lifted.
- [minor] A2 columnar and stratified: dusk dominates, so they read as orange clay.
- [minor] A8 `variants/columnar.png` seed 3: confirm that LOD1 and LOD2 show no floor
  through the dark pocket.

Fixed since cycle 1:
- the boulders facets, flat shading and rockMid base;
- the bud-sphere on seed 1.

SCORE_MACHINE: 8.5

---

# M4b — run 16, 2026-10-12 — cycle 1, at `5aa2665`

**Scores: art-critic 8.4 · perf-critic 8.2 · gameplay-critic 9.2.** No blocking defect. The art
score is combined over three generators; the critic's per-generator estimates are stratified
~8.7, columnar ~8.6, **boulders ~7.8**. ROADMAP §Definition of done for an asset milestone
holds each generator to art ≥ 8.0, so boulders goes to rework cycle 2.

## perf-critic — 8.2 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.0 · P5 1.2 · P6 0.6.

- [major] P1: the real-GPU log row is a sighting at `3ab6e84`, 80 commits back and before M4.
  It is stale, and it is not a verification.
- [major] P6: no real-hardware Potato number (`potato.frameBudgetEnforced = false`).
- [minor] P4 `heap.bytesPerFrame 34018` of 40960, nonzero per-frame allocation.
- [minor] `perf.json` carries no commit key; "produced at this commit" rests on timestamps.

SCORE_MACHINE: 8.2

## art-critic — 8.4 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.1 · A4 1.2 · A5 1.0 · A6 1.0 · A7 0.9 · A8 0.8 · A9 0.5.

- [major] A4 `variants/boulders.png`: every seed is the same smooth clay ovoid. Seeds 1 and 8
  both read as a big blob with a small one on top; seeds 2, 4, 6 and 7 are all low heaps.
  → cycle 2: fracture planes, flat shading.
- [major] A9/A1 `turntables/boulders.frame00.png`: smooth, subdivided blobs with no facets,
  out of style against concept 03 and the faceted canopies. → cycle 2.
- [major] A6 `shots/01-wide.png`: the new rocks are not placed in the scene, so the frame
  gains nothing. Placement is M5e's job (ROADMAP), so this stays open.
- [minor] A5 `boulders.frame00.png` (88,238): a small bud-like sphere pokes out of seed 1.
  → cycle 2: sizes floored at 0.34 of the base, and tighter seating on the host.
- [minor] A4/A1 `variants/columnar.png` seeds 1, 2, 4: flat hex scatter of similar height.
  Open.
- [minor] A3 `variants/stratified.png`: the vertical dark smears read as baked occlusion,
  and ledge skirts on seeds 3, 4, 5 read as cloth. Open.
- [minor] A2 boulders and columnar: `dusk` dominates, so the rock reads as orange clay.
  → cycle 2 for boulders: the base is rockMid, with dusk only on sky-facing faces. Columnar
  is open.
- [minor] A8 `variants/columnar.png` seed 3: a dark pocket between columns. Check that LOD1
  and LOD2 show no floor through it. Open.

SCORE_MACHINE: 8.4

## gameplay-critic — 9.2 (4.8 of 5.2; G2, G4, G5 n/a)

G1 2.1 · G3 1.2 · G6 1.5.

- [minor] G3 `playtest.log`: input-to-photon latency is not logged; at 6 to 8 fps under
  SwiftShader the 100 ms claim rests on state change.
- [minor] G1 `shots/01-wide.png`: none of the three rocks is in play yet. This is in scope
  for M4b.
- [minor, forward] `variants/dragon-full.png`: child H reads almost as parent C. Check this
  when G2 goes live at M9b.

SCORE_MACHINE: 9.2

---

