# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

# M7b — run 30, 2026-10-14 — cycle 1, at `a68c77f`

**Scores: art-critic 8.7 · perf-critic 9.0 · gameplay-critic 7.5.** No blocking defect. Two
**gameplay majors** in the new `?view=walk`, and one **perf major** on the `gate:meshgen` tool,
so the step goes to rework cycle 2.

## perf-critic — 9.0 (all six lines)

P1 2.0 · P2 1.8 · P3 1.6 · P4 1.2 · P5 1.2 · P6 1.2.

Re-measured on a scratch copy:
- draws 50 in every mode;
- cpuFrameMs with 8 walking: p95 1.9–2.1;
- meshgen max 25–54 ms over 6 runs;
- parity green;
- no per-frame allocation, by code read and a Node probe (~0.5 kB per frame of boxed
  doubles once warm).

Defects:
- **[major] The recurring `gate:meshgen` main-thread stall is still unfixed.** It hit two
  consecutive steps: 243.8 ms at M7a and 178.8 ms at M7b, both with a fast worker (37.2 ms).
  `tools/gate-meshgen.mjs` has no rasteriser-cap partition. Run the page under
  `tools/rasteriser-cap.mjs` as `gate:perf` and `dragon-walk.mjs` do. Never loosen 120 ms.
- [minor] There is no real-GPU row since `6b06392`, which predates M7. Ask the owner for a
  sighting of `dragon.html?walk=1` before M7 closes.
- [minor] `dragon.html` heap churn is in no artefact. The raw walk figure was 47–51 kB per
  frame, unsubtracted. Record it in `dragon-walk.json` with the idle-floor subtraction.
- [minor] A cold-JIT allocation burst on walk start (boxed doubles). Optional: use
  `Float64Array` scratch, or warm it up.
- [minor] `dragon-full.json` is stale (04:13). Regenerate it.

SCORE_MACHINE: 9.0

## art-critic — 8.7 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.4 · A5 1.1 · A6 1.0 · A7 0.9 · A8 0.7 · A9 0.5.

Feet planted: the toe holds within ±2 px through each stance (camera scroll subtracted). The
knees bend 37–49° on all 8 bodies with no tearing or collapse. Wings and tail ride the body,
the rest pose is 0 px from static, and the idle is intact.

Defects:
- [minor] The switch from rest to walk is a hard snap (`walkAt(null)` → `walkAt(0)`): the
  body drops about 10 px in one frame. It becomes a major pop once gameplay triggers it.
  Add a walk-weight ramp.
- [minor] On `?walk=1` the sheet teleports back every 3 cycles.
- [minor] A4: the gait varies narrowly. Stride is 0.48 × legLength for all, with identical
  phases, so every dragon is "the same low skitter at slightly different speeds".
- [minor] A5/A9: the walk is leg-only. The head nods only about 7 px and the tail tip sways
  about 6 px, so it reads as legs under a rigid body.
- [minor] A9: the crouch is low, with the belly near the ground and the wings folded as
  bars. It is far from the concept's upright, alert dragons.
- [minor, pre-existing] A8: a faceted crease on the neck collar.

SCORE_MACHINE: 8.7

## gameplay-critic — 7.5 (3.9 of 5.2; G2, G4 and G5 n/a)

G1 2.0 · G3 0.9 · G6 1.0.

- **[major] D1: dragging in `?view=walk` loses the tracked dragon.** `setYaw` rotates the
  parent group, but `frame()` tracks world x only, so the dragon walks out of frame within
  about 7 s. Touch does the same. See `src/dragon-view.ts:661-692` against `:396-402`.
- **[major] D2: zoom does nothing in `?view=walk`** (wheel and pinch). `zoomBy` moves the
  camera, and `frame()` resets it from `walkCam.pos` (`:398`).
- [minor] D3: the walk view's world ends. The ground is a fixed 400×400 plane and the sky
  sphere has radius 150, so by t ≈ 320–450 s the dragon is in a black void.
- [minor] D4: `?walk=1` teleports every 3 cycles (by design).
- [minor, G2 advisory] The gait varies only in scale and tempo, and the walk reads as a slow
  shuffle (about 0.1 body-lengths per second). Children's gaits sit between their parents'.

SCORE_MACHINE: 7.5

---

# M7a — run 29, 2026-10-14 — cycle 1, at `6cbc451`

**Scores: art-critic 9.1 · perf-critic 9.5 · gameplay-critic 8.4.** No blocking or major defect.
**M7a ships** on its first pass.

## perf-critic — 9.5 (all six lines)

P1 2.0 · P2 1.8 · P3 1.8 · P4 1.5 · P5 1.2 · P6 1.2.

The critic's own A/B on the base `4db961c`:
- `dragon.html` 50 draws on both, so no new draw;
- meshgen per-dragon max is within noise (head 33.8–39.6, base 30.9–36.0);
- a code read finds no per-frame allocation in the idle path.

Defects:
- [minor] `dragon.html` draws and heap are in no artefact. Write `renderer.info.render.calls`
  into `dragon-idle.json`.
- [minor] There is no real-GPU row since `6b06392`, which predates M7.
- [minor] `gate:meshgen` fails on any single sample over 120 ms, and it flaked once on HEAD
  (243.8 ms). Apply the `rasteriserCap` affinity partition. Never loosen the gate.
- [minor] `dragon-view.ts` `frame()` builds label template strings per frame. This is
  viewer-only and pre-existing.
- [minor] The idle waves are evaluated per vertex in both passes. They could be per-dragon
  CPU uniforms, but the cost is negligible today.

SCORE_MACHINE: 9.5

## art-critic — 9.1 (all nine lines)

A1 1.1 · A2 0.9 · A3 1.1 · A4 1.5 · A5 1.1 · A6 1.1 · A7 1.0 · A8 0.8 · A9 0.5.

What held:
- **Feet planted:** template-matched (0,0) px shift over 6 s.
- **Clean blink:** frames 20–34.
- **No tearing or interpenetration:** none at 12 time points.

Defects:
- [minor] The idle clip covers dragon A only, at a fixed close camera that crops the tail
  and wing. Add a sail or antler dragon, framed whole.
- [minor] The idle is nearly imperceptible at sheet scale: the sway is ≤ 6 px and the breath
  sub-pixel. Only the blink reads.
- [minor] The blink is a squashed-eyeball slit and reads as a squint. There is no skin lid.
- [minor] There is no rest-pose render hash to prove that t=0 matches the pre-idle sheet
  byte for byte.
- [minor] `dragon-idle.webm` frame 128 has a change spike, read as a codec keyframe and not
  proven.

SCORE_MACHINE: 9.1

## gameplay-critic — 8.4 (G2 advisory, G4 n/a)

G1 8.5 · G3 8.3 · G5 8.5 · G6 8.6.

The critic's own drives:
- the idle plays in real time on load, with 8/8 distinct frames over 4 s;
- each dragon has its own periods and phases;
- orbit, zoom, touch drag and pinch all work while it idles;
- the main page is unchanged (17 draws).

G2 advisory: H's idle params sit between G and C. G's breath and blink fall 1.4 % under both
parents, which is the expressed bodyMass and normal.

Defects:
- [minor] At 1280×720 the `dragon.html` labels overlap and the dragons are tiny.
- [minor] The idle diff is mostly edges and shadows. Use a zoomed diff.
- [minor] `playtest.log` has no `dragon.html` or idle coverage. Add smoke drills.

SCORE_MACHINE: 8.4

---

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

