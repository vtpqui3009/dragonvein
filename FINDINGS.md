# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M5f — run 28, 2026-10-14 — cycle 1, at `1bb31e8`

**Scores: art-critic 8.6 · perf-critic 9.2 · gameplay-critic 9.3.** No blocking or major defect.
**M5f ships** on its first pass. Every M5 step is now `DONE`, but **M5 the milestone waits on
the owner seeing the dressed island** (CLAUDE.md §7).

## perf-critic — 9.2 (all six lines)

P1 2.2 · P2 1.8 · P3 1.8 · P4 1.2 · P5 1.2 · P6 1.0.

From `perf.json`:
- drawCalls 17 (≤ 31);
- heap 37 594 of 40 960, within budget;
- cpu p95 1.5, tail enforced;
- triangles 216 714;
- Potato 14 draws;
- no budget raised.

Defects:
- [minor] D1: before and after are not recorded in STATE.md from one source. The baseline
  (35 232 / 2.3) disagrees with the commit message (36 128 / 1.4).
- [minor] D2: P4 headroom is now 3 366 B (8.2 %). `bytesPerFrame` rose 6.7 % even though
  draws fell, and `uncorrectedBytesPerFrame` is 43 161. Find the per-frame allocation that
  grew (`FloraBatch` or the shadow-prefix path). Never raise the budget.
- [minor] D3: no real-hardware reading covers this scene (triangles +24 %, Potato +36 %).
  Ask the owner for a sighting at M5f or later.

SCORE_MACHINE: 9.2

## art-critic — 8.6 (all nine lines)

A1 1.0 · A2 0.9 · A3 1.0 · A4 1.4 · A5 1.1 · A6 1.0 · A7 0.9 · A8 0.8 · A9 0.5.

What the critic confirmed:
- every kind is nonzero, and the dead tree reads as a tree, not a pole;
- the lichen does not z-fight (12-island-close, about x1100–1250 y340–370);
- the wind diff shows sway on the hero and companion flora;
- nothing floats.

Defects:
- [minor] A6 01-wide (x420–680, y440–500): the front third of the deck is bare. The forest
  sits in the back half, like a "clump on a green plate".
- [minor] A6/A2 12-island-close: the ground is one flat, uniform green with no tonal
  variation or dirt, so the ground cover sits on it as objects.
- [minor] A6 12-island-close (x150–350): grass and fern blades render as 1–2 px wires with a
  bright rim.
- [minor] A4/A6: moss is scaled as big as the bushes and reads as green boulders.
- [minor] A2: the shadowed faces on the columnar stacks and boulders go to near-black
  (#05050c).
- [minor] A3: near-camera foliage blows out to cream under the warm key.
- [minor, pre-existing] A9/A1: the ice crystals are as tall as the conifers and pull the
  eye.
- [minor, pre-existing] A5: black unlit debris slivers in the sky.
- [minor] A7: the HUD panel lightens over the bright sky (09-orbit-mouse).

SCORE_MACHINE: 8.6

## gameplay-critic — 9.3 (G2, G4 and G5 n/a)

G1 2.2 · G3 1.4 · G6 1.6. The critic drove these scenarios itself:
- boot;
- a 404 on all the flora;
- a 10 s late load;
- a 404 on the conifers only;
- context loss;
- touch;
- `__dragonveinShot` pose and release.

All of them stayed playable.

- [minor] `loadFlora` is all-or-nothing: `Promise.all` means one missing GLB removes every
  plant and rock, and the companion groves too (`src/main.ts` ~1790–1870). Load per kind and
  skip the failures.
- [minor] There is no player-visible signal for a late or failed load, and the whole
  dressing pops in on a single frame.

SCORE_MACHINE: 9.3

---

# M5e — run 27, 2026-10-13 — cycle 2, at `ea77a4f`

**Scores: art-critic 8.2 · perf-critic 9.5 · gameplay-critic 8.5** (perf and gameplay carried from
cycle 1). The rework changed only `flora/{moss,lichen,fallenleaves}` and their `.glb` files,
none of them placed in the game, and the gates were re-run green. **No blocking or major
defect on any of the four generators**, so **M5e ships**.

## art-critic — 8.2 (all nine lines)

A1 1.0 · A2 0.85 · A3 0.95 · A4 1.25 · A5 1.0 · A6 1.0 · A7 0.95 · A8 0.75 · A9 0.45.

Fixed since cycle 1:
- **moss** now has 8 habits: hummock, scatter, clump, drape, mat, arc, ring and chain;
- **lichen**'s colour-swap pairs are restructured: rosette, scales, crust, double and single
  ring, cup-stalks, cup bed and thalli;
- **fallenleaves**' stacking and the seed-8 sprig.

Defects:
- [minor] A4 moss 4/5 share the same flat-plate footprint class, but differ in height
  (0.296 against 0.080) and internal structure.
- [minor] A4 lichen 4/5: the same pale ring, single against double. This is the weakest pair.
- [minor, tool] `tools/variant-probe.mjs` still credits the colour axes. Add a shape-only
  distance.
- [minor] A5 lichen 4/5: thin lens overlaps where the lobes cross.
- [minor] A3/A9 moss: still a smooth lime "jelly" surface.
- [minor] A1: moss spore stalks and fallenleaves petioles vanish at 25 %.
- [minor] A8 lichen: 6–16 mm thick, so check z-fighting at M5f.
- [minor] flowershrub, carried from cycle 1: seed 5 reads as popcorn and seed 8 sits on
  sticks; 6/7 are close.
- [minor, carried] LOD1 and LOD2 are never rendered, nothing is placed (M5f), and moss
  seeds 3 and 8 are small.

SCORE_MACHINE: 8.2

---

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

