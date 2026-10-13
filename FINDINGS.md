# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M5e — run 27, 2026-10-13 — cycle 1, at `4310718`

**Scores: art-critic 8.0 · perf-critic 9.5 · gameplay-critic 8.5.** No blocking defect. **Majors
point at `flora/moss` and `flora/lichen`'s own sheets**, so criterion 6 fails for those two
(CLAUDE.md §4, decided by defects). flowershrub and fallenleaves pass with minors only.
Moss and lichen go to rework cycle 2.

## perf-critic — 9.5 (all six lines)

P1 2.3 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 1.1.

- **[major, forward to M5f, not scored against M5e]** Heap-churn headroom is 5 728 B, about 3
  draws (`heap.bytesPerFrame 35232` of 40 960).
  - Four kinds × 3 LODs placed separately would come to about 57 kB per frame.
  - **Merge the flora per LOD into one batched draw per LOD.** Ground cover casts no shadow
    and sits mostly at LOD1/2. Wind stays in the vertex shader.
  - Never raise the budget.
- [minor] `perf.json` has no commit or timestamp key.
- [minor] meshgen max 84 ms in this run (70 % of 120), up from earlier runs, from a single
  run on SwiftShader. Watch it.
- [minor] The new assets are unplaced, so their runtime cost is unmeasured until M5f.

SCORE_MACHINE: 9.5

## art-critic — 8.0 (all nine lines)

A1 1.0 · A2 0.85 · A3 0.95 · A4 1.05 · A5 1.0 · A6 1.0 · A7 0.95 · A8 0.75 · A9 0.45.

- **[major] A4 `variants/moss.png`:**
  - seeds 4/5 (x 790–1210) are the same flat carpet plate; shape axes are within 9 %, and
    the probe's 15.7 % comes from lightness alone;
  - seeds 6/7 (x 1290–1670) are the same open crescent ("collar");
  - the sheet is four silhouette classes, each repeated twice.
- **[major] A4 `variants/lichen.png`:**
  - pairs 2/3 (crust), 4/5 (ring) and 6/7 (cups) are each the same shape in orange and then
    pale green;
  - for 4/5, shape axes are within 12 %, and the warmth axis is a colour swap;
  - the "26.9 %" rests on a 3.5 mm height difference.
- [minor, tool] `tools/variant-probe.mjs` credits colour axes as variation. It should report
  a shape-only distance too.
- [minor] A4 fallenleaves 2/3 (loose scatters, width 12 % apart) and flowershrub 6/7 (mound
  plus orange spires) are close, but legible.
- [minor] A5 `fallenleaves.frame00.png`: leaves interpenetrate in the drift piles (seeds 1
  and 8).
- [minor] A9/A3 moss: a glossy, uniform lime "jelly" with no fine surface variation.
- [minor] A1: moss spore stalks, the lichen ring specks and the leaf petioles are needle-thin
  and vanish at 25 %.
- [minor] A8: lichen is 6–16 mm thick, so check for z-fighting when placed (M5f).
- [minor] A1/A9 flowershrub: seed 5 blooms read as popcorn balls, and seed 8's blooms sit on
  thin sticks.
- [minor] A9 fallenleaves seed 8: mostly green, so it reads as a sprig.
- [minor, carried] LOD1 and LOD2 are never rendered, and nothing is placed (M5f).

SCORE_MACHINE: 8.0

## gameplay-critic — 8.5 (G2 and G4 n/a)

G1 8.6 · G3 8.2 · G6 8.6. The playable scene is unchanged.

- [minor] The placement path is unexercised. M5f must add a smoke check for the placed
  instances.
- [minor] Moss seeds 3 and 8 are small, so they may read as debris when placed.
- [minor] Flowershrub 6/7 and fallenleaves 5/6 may collapse together at game distance.

SCORE_MACHINE: 8.5

---

# M3f — run 26, 2026-10-13 — cycle 1, at `61a228b`

**Scores: art-critic 8.2 · perf-critic 9.5 · gameplay-critic 9.5.** No blocking or major defect.
The "shared body plan" major from M3e is **downgraded to a minor**: the greyscale sheet
reads as eight individuals. **M3f ships** on its first pass, and **M3 the milestone closes**:
every step is `DONE`, the last pass is ≥ 8.0 everywhere, and the owner's sighting is logged.

## perf-critic — 9.5 (all six lines)

P1 2.2 · P2 1.8 · P3 1.8 · P4 1.4 · P5 1.2 · P6 1.1. The real-hardware half now rests on the
owner's 2026-10-13 sightings at `6b06392`, Medium and Potato.

- [minor] D1: no artefact measures the frame cost of a scene with dragons in it. Add a
  dragon-on-screen pass to `gate:perf` when the dragons are placed, and merge each dragon's
  parts into one geometry.
- [minor] D2: the meshgen trend is upward. The round-trip max went 38.7 → 43.3 ms, about
  +10 % per body step. Hold it by cheapening `skin.ts`; never loosen `TRI_BUDGET`.
- [minor] D3: `cpuFrameMs.max 14.5` ms, a single outlier frame.
- [minor] D4: the real-hardware evidence is sightings only, with no percentile.

SCORE_MACHINE: 9.5

## art-critic — 8.2 (all nine lines)

A1 1.0 · A2 0.7 · A3 1.0 · A4 1.45 · A5 0.9 · A6 1.0 · A7 0.9 · A8 0.8 · A9 0.45.

Recomputed from the files:
- **Sheet silhouettes:** mean IoU 0.523 (0.292–0.677), height spread 1.42×.
- **Gene sweep:** every gene's low-vs-high IoU is ≤ 0.79, so 8/8 pass.
- **Reference sheet:** matches.
- **Wings (M3e):** not regressed.

- [minor, was major] A4 `dragon-greyscale.png` A/B/C/H/F: one stance and one thin cone
  tail. Pairs sit at IoU 0.62–0.68, and variation is in proportion rather than structure.
  That is acceptable "one species, many individuals" variation.
- [minor] A9: slimmer and longer-tailed than the bible's "chunky, front-heavy, wings
  generous". This matters more now that the genes sweep further.
- [minor] A2 F: near-black body, carried. A/G/C/H: the wing hue clashes with the body,
  carried and not fixed.
- [minor] A5 C/H/D: the segmented rib fan crosses the hind thigh, carried.
- [minor] A3/A5 C/H: a black belly wedge under the near wing, carried.
- [minor] A1: low value contrast on the wing panels in greyscale, carried. The far wing still
  reads steep on D/E/F from foreshortening.
- [minor, carried] A6: no dragon in any scene shot.

SCORE_MACHINE: 8.2

## gameplay-critic — 9.5 (G2, G4 and G5 n/a)

G1 2.2 · G3 1.4 · G6 1.5. The critic drove `dragon.html` itself: mouse, wheel, touch drag
and pinch, with 0 errors.

- [minor] D1: `gate:smoke` does not cover `dragon.html` input. Add a drill.
- [minor] D2: at 900×560 the sheet labels overlap, and `?view=turn` has an empty band at the
  top. This is the dev viewer.
- [minor, G2 advisory] G (A×B) shows little of B: no teal, and B–G IoU is below the mean. H
  shows both parents. Re-check across many pairs at M9b.

SCORE_MACHINE: 9.5

---

# M3e — run 24, 2026-10-13 — cycle 2, at `8e5b5ba`

**Scores: art-critic 7.9 · perf-critic 8.5 · gameplay-critic 9.7.** Perf and gameplay are carried
from cycle 1. The rework changed the wing pose in both builders and the viewer fill, and the
gates were re-run green. Meshgen stays ≤ 38.7 ms. **No blocking or major defect points at the
wings, and D1 is fixed**, so M3e's criterion 6 holds and **M3e closes** (CLAUDE.md §4: per-step
acceptance by defects). **M3 the milestone stays `IN_PROGRESS`**: art is 7.9, and the
remaining major (the shared body plan) is M3f's.

## art-critic — 7.9 (all nine lines)

A1 1.0 · A2 0.7 · A3 0.9 · A4 1.3 · A5 0.95 · A6 1.0 · A7 0.9 · A8 0.7 · A9 0.45.

**Fixed since cycle 1:**
- D1, the pair reading as one upright wing;
- spread and sail looking alike;
- E's tip over A's caption, and D touching the top edge;
- D's black near-wing slab;
- the missing spread and segmented turntables.

**Largely fixed:** the near wing over the tail root. **Partly fixed:** the black belly (C and H
remain).

**Defects:**
- [major, M3f, not charged to M3e] A4: the eight share one body plan. `dragon-silhouette.json`
  has mean IoU 0.632 (0.429–0.785, A–G the most alike). Area, height and width spread about
  20 %.
- [minor] m1, A1/A9: in the sheet camera the far wing still reads steep on D, E and F, from
  foreshortening. It is near-horizontal in the turntable back views.
- [minor] m2, A5: on C, D and H the segmented near-wing rib fans overlap the hind thigh and
  read as skewers.
- [minor] m3, A2: the wing hue clashes with the body (A, C, H, G), and F's body is near-black.
- [minor] m4, A1: the wings have low value contrast against the ground in
  `dragon-greyscale.png`.
- [minor] m5, A9: the wings are smaller and flatter than the concept's raised bat wings.
- [minor] m6, A3: the wing panels are flat-lit and read as cutout planes.
- [minor, carried] m7, A6: no dragon in any scene shot.

SCORE_MACHINE: 7.9

---

# M3e — run 24, 2026-10-13 — cycle 1, at `4581db2`

**Scores: art-critic 7.8 · perf-critic 8.5 · gameplay-critic 9.7.** No blocking defect. **One
major defect points at the wings (D1)**, so criterion 6 fails (CLAUDE.md §4: acceptance is
decided by defects). The step goes to rework cycle 2.

## perf-critic — 8.5 (all six lines)

P1 1.8 · P2 1.8 · P3 1.8 · P4 1.3 · P5 1.2 · P6 0.6.

- [minor] No dragon is in the frame-cost scene, so the runtime cost of the wings in the
  render loop is unmeasured. When dragons are placed, merge each one's meshes into a single
  draw.
- [minor] Meshgen `startupMs 107.6` is 89.7 % of 120, including worker boot. The worst
  per-dragon round trip went from 27.3 to 35.8 ms (+31 %), probably from the wing segments.
- [minor] P4 heap is 89 % of budget. Dragons in the scene must not add draws.
- [minor, carried] No real-hardware verification and no Potato row.

SCORE_MACHINE: 8.5

## art-critic — 7.8 (all nine lines)

A1 1.0 · A2 0.7 · A3 0.9 · A4 1.2 · A5 0.9 · A6 1.0 · A7 0.9 · A8 0.7 · A9 0.45.

- **[major] D1, A9 and criterion 2, wings** (`variants/dragon-full.png`, cells A
  (230–420, 140–330), E (290–420, 350–440), D and H (1440–1580, 95–200)).
  - In the sheet camera, the far wing reads as one steep, near-vertical sail, 100–130 px
    above the back.
  - The near wing foreshortens to a sliver (A), a dark slab (E, D) or bristles (D, H).
  - So the pair reads as one upright wing, which is the M3 defect.
  - The geometry is a spread V in the turntable front and back frames. The sheet camera sits
    where the near wing points at it.
- [major, carried to M3f, not wing scope] A4: the eight share one body plan. IoU is A–G
  0.811, C–H 0.772 and C–A 0.725.
- [minor] A9/A1: spread and sail are hard to tell apart at 25 % (A against G).
- [minor] A2: the wing hue clashes with the body (A yellow on red; D and H magenta on brown).
  F's body is near-black.
- [minor] A5: on F and H (also C and G) the near-wing membrane lies across the tail root.
- [minor] A3: the belly crushes to black under the near wing on A and E.
- [minor] A7/A5: E's far-wing tip overprints A's caption, and D's tip touches the top edge.
- [minor] A8: D's near wing is a black faceted slab at the shoulder.
- [minor] The turntable shows only slot 6, the sail form. Add spread and segmented
  turntables.
- [minor, carried] A6: no dragon in any scene shot.

SCORE_MACHINE: 7.8

## gameplay-critic — 9.7 (6.6 of 6.8; G2 and G4 n/a)

G1 2.2 · G3 1.2 · G5 1.6 · G6 1.6.

- [minor] G3: no input-latency figure is logged.
- [minor, advisory G2] G = A × B has a sail wing although both parents are spread. The hard
  `wingForm` threshold (`graph.ts:220`) flips the class on a one-step gene change. Consider a
  blended form before G2 goes live at M9b.
- [minor, advisory G2] H reads as C recoloured (IoU 0.772), with no ember hue.

SCORE_MACHINE: 9.7

---

