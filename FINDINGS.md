# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M3a — run 11, 2026-10-12 — cycle 3, at `e015a48`

**Scores: art-critic 7.6 · perf-critic 8.7 · gameplay-critic 9.0.** No blocking defect. This was
the third and last cycle the run may take. **M3a closes on its acceptance criteria. M3 stays
`IN_PROGRESS`**, with art below 8.0 (CLAUDE.md §3.6).

## perf-critic — 8.7 (all six lines)

P1 2.0 · P2 1.8 · P3 1.6 · P4 1.2 · P5 1.2 · P6 0.9.

- [major] P1: the newest real-GPU row is the `3ab6e84` sighting. No verification-grade row exists.
- [major] No measured frame holds a dragon. `dragon-body.json` has no draw, frame or heap
  numbers for N bodies.
- [minor] P3 is partial scope on the Node main thread (max 9.1, cold 22.74 ms; 5752 tris). In the
  browser the sheet is 99.6 ms for 8.
- [minor] P4 `heap.bytesPerFrame 34589` (34229 → 33893 → 34589 over the three cycles), and
  uncorrected 39931 of 40 960.
- [minor] P6: no real-hardware Potato number. Advisory GPU drift.

SCORE_MACHINE: 8.7

## art-critic — 7.6 (all nine lines)

A1 1.0 · A2 0.8 · A3 0.9 · A4 1.2 · A5 0.9 · A6 1.0 · A7 1.0 · A8 0.5 · A9 0.3.

- [major] A3/A5 `turntables/dragon-body.frame00.png` (430–450, 420–455), (565–590, 415–450): the
  far-side feet and lower legs crush to near black and read as detached boxes.
- [major] A8 `dragon-body.png` cell E chest and throat: a darker panel meets the neck with a
  jagged, stepped edge, which reads as intersecting parts.
- [major] A4 cells A, B, F: one pose and plan, differing mostly in hue. G reads as A recoloured
  and H as C. The variation that does show is neck arc, tail, mass and snout.
- [major] A6 `shots/01-wide.png`: no creature in the game. The satellite islands are sparse.
- [minor] A5 `?view=turn&i=0&cam=0.6,0.5,2.2,0,0.25,0`: facets and a crease at the shoulder.
- [minor] A2: lit D at s ≈ 0.28 and F at v ≈ 0.24 on screen. The genes are 0.35 and 0.30.
- [minor] A9: slim, horizontal, small-headed bodies against the bible's chunky, front-heavy
  ones with a head about 1/5 of body length. More than three values on G.
- [minor] A3/A9 game frame: black island undersides, and a navy-to-orange sky against the
  concept's pastel peach.

SCORE_MACHINE: 7.6

## gameplay-critic — 9.0 (4.7 of 5.2; G2, G4, G5 n/a)

G1 2.1 · G3 1.2 · G6 1.4.

- [major, G2 provisional] G = A × B reads as a recoloured A with a longer tail. The phenotypes
  are neckLength 1.256 / 1.115 / 1.260 and hue 0.027 / 0.532 / 0.050 (A / B / G).
- [major, G2 provisional] The sheet's second row is nearer the camera, so the children look
  about 30 % larger than their parents.
- [minor, G2 provisional] H reads as C with a longer neck. Horns, wings and crest are not drawn
  until M3b, so resemblance cannot be fully judged yet.
- [minor] The far-side legs are near black.
- [minor] G6: two-finger pinch in `dragon.html` rotates instead of zooming.
- [minor] G3: no input-latency measurement, and `gate:smoke` does not load `dragon.html`.
- [minor] `startPreview`'s fetch poll failed from the critic's shell under proxy variables,
  while curl reached the server.

SCORE_MACHINE: 9.0

*Builder note on G = A × B:* `breed` picks one allele per parent per gene, and the dominant
one is expressed (`docs/GENOME.md` §Diploid). A child that expresses mostly one parent's
dominant alleles is the genome working as specified, not a builder fault. G2 goes live at M9b,
with horns, wings and crest in view.

---

# M3a — run 11, 2026-10-12 — cycle 2, at `dda79a2`

**Scores: art-critic 7.2 · perf-critic 8.7 · gameplay-critic 9.0.** No blocking defect. Art is
still below 8.0, so cycle 3, the last this run may take (CLAUDE.md §3.6).

## perf-critic — 8.7 (all six lines)

P1 2.0 · P2 1.8 · P3 1.6 · P4 1.2 · P5 1.2 · P6 0.9.

- [major] P1 `STATE.md` real-GPU log: the newest row is the sighting at `3ab6e84`, before M2
  and M3.
- [major] No measured frame holds a dragon. `dragon-body.json` has build time and triangles,
  but no draw calls, frame cost or heap for N bodies.
- [minor] P3 is partial scope on the Node main thread (cold 28.12, max 10.6 ms, 5752 tris).
- [minor] P4 `heap.bytesPerFrame 33893`; `uncorrectedBytesPerFrame 40957` is 3 B under the budget.
- [minor] P1 `cpuFrameMs.max 17.2` lines up with a scavenge.
- [minor] P6: no real-hardware Potato number. Advisory GPU drift 434 → 453 ms.

SCORE_MACHINE: 8.7

## art-critic — 7.2 (all nine lines)

A1 0.8 · A2 0.6 · A3 0.9 · A4 1.0 · A5 0.9 · A6 1.0 · A7 1.0 · A8 0.7 · A9 0.3.

- [major] A2 `dragon-body.png` cell D (gale): lit body samples at s ≈ 0.11, near white; H at
  0.19 and C at 0.26 are under the bible's 0.35 floor on the lit surface.
- [major] A4: one body plan in all 8 cells. Neck, tail, bulk and colour vary; stance, head and
  toes do not.
- [major] A3 `frame00.png` far legs (x 430–500, 570–630): near black. There is no readable fill
  on the far side.
- [major] A6 `shots/01-wide.png`: no creature in the game world.
- [minor] A9: long, low, sprawling, with the head about 1/8 of body length, where the bible
  asks for chunky and front-heavy with the head about 1/5.
- [minor] A2 gradient: the belly underside runs orange → olive → teal on orange dragons.
- [minor] A5/A8: a faceted crease at the front shoulder, and a hump at the back of the skull.
- [minor] A1: the creatures fill about 12 % of the sheet.

SCORE_MACHINE: 7.2

## gameplay-critic — 9.0 (6.1 of 6.8; G2, G4 n/a)

G1 1.9 · G3 1.3 · G5 1.5 · G6 1.4.

- [minor] G2 advisory: G = A × B reads as a paler A with B's tail. Revisit at M3b and M9b.
- [minor] Far-side legs near black (`?view=turn&i=6&cam=-3,0.3,8,0,0.9,0`). Self-shadow plus
  weak fill, not flipped normals.
- [minor] Viewer: labels overlap after a drag, the sheet does not refit at 360 px, and there is
  no wheel or pinch zoom.
- [minor] The helmet-like head, the shoulder hump and a ragged belly edge on the throat.
- [minor] The game page still shows no dragon.

SCORE_MACHINE: 9.0

*Builder note on A9 and A4:* the proportions and the single body plan come from the reference
graph, which the port reproduces exactly (tests/dragon-graph.test.ts). The head is 4 nodes ending
0.52·snoutLength·headSize ahead of the skull. The legs are fixed four-node chains whose shape
only legLength and legThickness move. Changing either is a change to `assetgen/dragon/builder.py`
and to what the reference dragon is, which needs the owner (STATE.md run 11). It cannot be
fixed in the TS skin while parity holds.

---

# M3a — run 11, 2026-10-12 — cycle 1, at `84ce145`

**Scores: art-critic 7.4 · perf-critic 8.9 · gameplay-critic 8.7.** No blocking defect. Art is
below 8.0, so the step is reworked (cycle 2).

## perf-critic — 8.9 (all six lines)

P1 2.0 · P2 1.8 · P3 1.8 · P4 1.2 · P5 1.2 · P6 0.9.

- [major] P1: the real-GPU log's newest row is the sighting at `3ab6e84`, which predates M2 and
  M3. Ask the owner for a sighting or `gate:perf -- --real-gpu` once a dragon is in the game.
- [major] The measured frame holds no dragon: `drawCalls 27`, `triangles 42268` equal the
  `3ab6e84` sighting. Dragon draw, frame and heap cost in the scene are unmeasured.
- [minor] P3 is measured on partial scope (`meshgen.json` stages: skeleton, torso, limbs) on
  the Node main thread. M3b and M3c must re-measure. Max 7.52 ms of 120.
- [minor] P4: `heap.bytesPerFrame 34229` of 40 960, leaving about 6.7 kB.
- [minor] The advisory SwiftShader GPU term rose (`gpuFrameMs.p50 434`), unattributed. Main-thread
  cost reproduced (`cpuFrameMs.p95 1.6`).
- [minor] P6: no real-hardware Potato number.

SCORE_MACHINE: 8.9

## art-critic — 7.4 (all nine lines)

A1 0.9 · A2 0.8 · A3 1.1 · A4 1.0 · A5 0.9 · A6 1.0 · A7 1.0 · A8 0.4 · A9 0.3.

- [major] A4 `variants/dragon-body.png`: one body plan in eight paints. The variation is
  scale, tail length and neck thickness, with nothing in head shape, stance or mass.
- [major] A4 `dragon-body.png` #30: cropped by the right edge, and deep violet although its
  elements are tide and gale. Three of the eight cells are purple.
- [major] A6 `shots/01-wide.png`: still no dragon or creature in the world.
- [major] A8/A5 `dragon-body.png` #0 neck base, `frame00.png` (620–720, 270–330): a hard
  shading step and crease where neck meets torso. The head sits on the neck like a helmet
  with a stepped jaw rim. Faceted, patchy shading on the chest. Creases at shoulder and
  elbow. Read as major, not as the A8 "any seam" blocking case.
- [major] A9 vs `concept/01-species-lineup.png`: no eyes or face, a small bulb head (about
  1/6 of body length against the bible's 1/5), long and low like a monitor lizard.
- [minor] A2 #4 stone and #6 gale read nearly grey and near-white (lit s ≈ 0.18, 0.23).
- [minor] A2/A3: the viewer floor and backdrop greys are off-palette (tooling).
- [minor] A3 `01-wide.png`: flat black island underside; carried over.
- [minor] A1: at 25 % the shadow blob weighs as much as the dragon, and with no wings or
  horns the silhouette does not read as a dragon.

*Builder note:* #30's hue is its genes, not a mixing fault. Its parents #26 and #29 express hue
0.545 and 0.875, and #30 inherits phenotype hue 0.765 through `circ_mean` along the short
arc. `src/core/genome.ts` equals `genome.py` on all 32 genomes (`gate:parity`). #6 gale's
genome saturation is 0.350, exactly the bible's floor, and #4 stone's is 0.521. The lit
readings are lower than the genes.

SCORE_MACHINE: 7.4

## gameplay-critic — 8.7 (5.9 of 6.8; G2, G4 n/a)

G1 1.5 · G3 1.3 · G5 1.6 · G6 1.5.

- [major] D1 `dragon-body.png` #0, #8, #10: identical bodyLength, bodyMass, neckLength,
  legLength, tailLength and chestDepth. They are the same mesh in three colours, so the sheet
  misses criterion 4 (8 different creatures).
- [major] D2 `frame00.png` neck and foreleg: the belly colour follows per-vertex normals and
  paints hard-edged blotches on the neck and limbs instead of a belly line.
- [major] D3 `frame00.png` (670–720, 250–300): the head is a lump on the neck with a notch at
  the jaw join. The shoulders and knees also step.
- [minor] D4: the sheet clips #30.
- [minor] D5: the two bred dragons' parents are not on the sheet.
- [minor] D6: `dragon.html` takes no pointer input.
- [minor] D7: no wings, horns, crest or tail ornament (M3b).

*Builder note:* the clones in D1 are what `wild(seed, element)` does by design. A forced element
draws nothing, so one seed gives the same body under every element, moved only by that
element's bias (`ELEMENT_BIAS`). The sheet used seed 11 for all six elements, which put that
into every cell. The sheet changes; the genome does not (docs/GENOME.md is the arbiter).

SCORE_MACHINE: 8.7

---

# M2b — run 10, 2026-10-12 — cycle 1, at `156321e`

**Scores: art-critic 8.2 · perf-critic 9.0 · gameplay-critic 9.2.** No blocking defect. The step
is pure logic; the genome is not imported by the game yet.

## perf-critic — 9.0 (7.4 of 8.2; P3 n/a)

P1 2.3 · P2 1.8 · P4 1.3 · P5 1.2 · P6 0.8.

- [minor] P1: no real-GPU percentile. Both log rows are sightings.
  Repro: `npm run gate:perf -- --real-gpu`.
- [minor] P6: no real-hardware Potato evidence.
- [minor] P4: `heap.bytesPerFrame 32 953` is 80% of 40 960. New draw calls will trip it
  before P2 does.
- [minor] `cpuFrameMs.p95 1.5`, `max 7.4` is a little above the documented capped range. It
  is within budget; re-run to confirm it is noise.
- [minor] forward: P3 and `gate:meshgen` become scoreable at M3c.

SCORE_MACHINE: 9.0

## art-critic — 8.2 (all nine lines)

A1 1.0 · A2 0.9 · A3 0.9 · A4 1.4 · A5 1.1 · A6 0.9 · A7 0.9 · A8 0.8 · A9 0.35.

- [major] A6 `01-wide.png`, `03-late.png`: no creature, no dragon, no ambient life, so the frame
  has no focal subject.
- [major] A3 `01-wide.png` hero deck: trees cast no readable shadow on the island top.
- [minor] A4 `variants/broadleaf.png`: one species idiom, and canopy hue is fixed across seeds.
- [minor] A5: the branch stub on seed 5, and the pale wedge on seed 7's trunk base.
- [minor] A5 `turntables/broadleaf.webm`: a pale smear on the stage floor under the trunk.
- [minor] A6: the satellite islands are sparse, with flat black undersides.
- [minor] A9: a saturated sky against the concept's soft peach-lavender.
- [minor] A7 `06-hud-360.png`: the HUD panel covers the top island at 360 px.

SCORE_MACHINE: 8.2

## gameplay-critic — 9.2 (4.8 of 5.2; G2, G4, G5 n/a)

G1 2.0 · G3 1.3 · G6 1.5.

- [minor] G1/G3: `playtest.log` has no genome line. Breeding is not exercised in a running page
  (expected before M9).
- [minor] G3: input-to-frame latency is not measured.
- [minor] SwiftShader FPS (3–6) is visible in the shots. That is perf territory.
- [note] at M9b, G2 needs a render-level check that a child resembles its parents.

SCORE_MACHINE: 9.2

---

