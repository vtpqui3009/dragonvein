# ROADMAP

One **step** per scheduled run. Take the first step in reading order that is not `DONE`.
Do not skip ahead. Status lives here; the narrative lives in `STATE.md`.

Roughly half of these milestones are asset milestones. That is deliberate: this is a 3D
game and the world has to feel alive before any system matters.

## How big a step may be

**One step, one run, one thing three critics can score.** A step that needs two runs is a
defect in this file, not in the run that could not finish it — say so in `STATE.md` and
split it further.

Measured, so this is not a guess: M0 was written as "toolchain, CI, deploy and a placeholder
that meets the art bible". It took five runs, cost about $137, and is still open. Every
milestone below it was written the same way — M1 asked for thirteen generators in one run,
M6 for five rendering systems. Splitting them is not bookkeeping; it is the difference
between a run that lands and a run that evaporates at the usage limit.

Steps carry letters inside a phase. Take the **first step in reading order** that is not
`DONE`. Phase numbers are kept so that `docs/RUBRIC.md`, `STATE.md` and `FINDINGS.md` keep
meaning what they said.

## M0 — Toolchain & deploy spine

| step | done when | status |
|---|---|---|
| M0a | `npm run gates` exits 0; CI green on `main` | DONE |
| M0b | Pages serves the build; a human has seen it running and the sighting is logged | DONE |
| M0c | `gate:perf` measures frame **cost**, reproducibly, with the Potato tier and heap churn recorded | DONE |
| M0d | the placeholder frame meets `docs/ART_BIBLE.md` — contact shadows land, all three lights reach the frame, prefab variety reads, no bare ground, no off-bible haze. art-critic ≥ 8.0 | DONE |
| M0e | HUD readable at 360 px; the context-loss line visible; `__dragonveinStats()` has no stale-frame hole | DONE |
| M0f | the camera answers the pointer — drag to orbit, wheel/pinch to zoom — under both a mouse and a `hasTouch` context, so rubric G6 has a subject at M0 | DONE |

M0a–M0c were delivered and verified inside the M0 runs — gates and CI are green, the
sighting is in `STATE.md`. They were never scored as separate steps, because this split did
not exist yet.

M0d closed on 2026-10-11 at `953f156`, art-critic **8.3** against its bar of ≥ 8.0, with
perf 8.7 alongside it and no blocking defect in four scoring rounds.

M0e closed on 2026-10-11 at `b92c867`: all three of its conditions are asserted by
`gate:smoke` and confirmed by two critics (art 8.6, perf 7.9, gameplay 6.7 — see `STATE.md`
for why the two sub-8 scores are not M0e's to move).

M0f closed on 2026-10-11 at `c6995c4`: gameplay-critic 6.7 → **8.8** (G6 0.5 → 1.5),
art 8.3, perf 7.8.

**M0 the milestone is `DONE` — closed 2026-10-12** together with M1, under `CLAUDE.md` §3.6.
Every step is `DONE`. The last pass scored art **8.7** and gameplay **8.7** at `f7e5597`, and
perf **8.4** at `634c4d7`. No runtime file changed between those commits (`git diff
f7e5597 634c4d7 --stat -- src public` is empty). The owner saw the deployed build run at
`3ab6e84` (STATE.md §Real-GPU verification log, `CLAUDE.md` §7). The perf score cleared
8.0 on the first current-commit sighting. A full `verification` (`gate:perf --real-gpu`)
is still outstanding, and M16 will require it.

*History, kept for the record:* **M0 the milestone does not close with M0e alone.** The gameplay-critic sits at 6.9 and
cannot rise without input existing, because §When each rubric line goes live puts **G6
(mouse and touch) live from M0** and no step in M0a–M0e delivers any. That is a defect in
this table, not in the build — M0f above was that fix. It landed in run 6 and gameplay
scored **8.8**, its first pass over the bar since M0d, which confirms the diagnosis.
The full reasoning, and the gameplay-critic's own words on why a smoke test of input that
nothing listens to proves nothing, are in `docs/archive/STATE-2026-10.md` run 4
§Roadmap defect.

## M1 — Asset pipeline

| step | done when | status |
|---|---|---|
| M1a | one generator goes end to end: script → LOD0/1/2 `.glb` → 8-seed variant sheet → turntable → `MANIFEST.json` | DONE |
| M1b | `assets:build` and `assets:render` run in CI and publish their artefacts | DONE |

**M1 the milestone is `DONE` — closed 2026-10-12**, on the same pass as M0: art 8.7, perf 8.4,
gameplay 8.7, with every step `DONE`. The Assets workflow reproduced the committed `.glb`
bytes on a GitHub runner (run `38216089403`). §Definition of done for an asset milestone holds for
its one generator, `flora/broadleaf`: (1) the 8-seed sheet reads as 8 trees (variant-probe:
most-alike pair 26.1% apart; art A4 1.5/1.6); (2) LOD0/1/2 = 3186/936/342 tris against
6000/2000/500 (`check:assets`, counted from the bytes); (3) listed in MANIFEST.json with
`assetgen/flora/broadleaf.py`; (4) art-critic 8.65, then 8.7.

## M2 — Genome in TypeScript

| step | done when | status |
|---|---|---|
| M2a | `src/core/rng.ts` reproduces `assetgen/genome.py`'s stream exactly, proven on a fixed vector | DONE |
| M2b | `src/core/genome.ts` expresses, breeds and mutates identically; `gate:parity` green on 32 fixed genomes | DONE |

**M2 the milestone is `DONE` — closed 2026-10-12** (CLAUDE.md §3.6): both steps are `DONE`, and
the M2b pass scored art 8.2, perf 9.0, gameplay 9.2. The running build is the one the owner saw
at `3ab6e84`; M2's code is not yet imported by the game, so nothing visible changed.

## M3 — Runtime dragon mesh

| step | done when | status |
|---|---|---|
| M3a | skeleton, torso and limbs build from a genome into a `BufferGeometry` | DONE |
| M3b | wings, crown, membrane and tail ornament; the creature reads as the Python one | DONE |
| M3c | built in a worker inside 120 ms on Medium; `gate:meshgen` green | DONE |
| M3d | `gate:parity` green between the two builders on the fixed genome set | DONE |

M3a closed on 2026-10-12 at `e015a48` (run 11), on its STATE.md criteria with gates green. The
graph is identical to the reference on 32 genomes, and the skin is closed and outward-wound.
`gate:meshgen` measures 9.1 ms max against 120. After three cycles the last pass scored art
**7.6**, perf 8.7 and gameplay 9.0, so **M3 stays `IN_PROGRESS`** until a pass clears 8.0 in all
three. The art deductions that remain are listed in FINDINGS.md, and the largest one, the
reference's proportions, is with the owner (NEXT.md).

M3b closed on 2026-10-12 at `4679aa6` (run 12). The whole dragon (wings, membranes, crown, spikes,
tail ornament) is exact to the reference in graph and primitive parameters. Its primitive
vertices are within 1e-5 of Blender's, and its sheet matches `dragon-reference.png` cell for cell.
The second cycle scored art **8.1**, perf **8.2** and gameplay **9.0**, the first M3 pass with all
three ≥ 8.0. The reference's invisible tail turned out to be a Skin-modifier collapse behind a
zero-length edge, and was fixed at the source (`df81a56`).

M3c closed on 2026-10-12 at `c01ccb8` (run 13), on its first pass: art **8.0**, perf **8.5**,
gameplay **8.5**. Dragons build in a Web Worker. `gate:meshgen` measures them on the built game
page at its default settings while it renders. The worst round trip is 26.7–31.2 ms against
120. The worker's one-off warm-up (about 70 ms) runs before any hatch, and is reported, not
hidden. Its failure path was fixed after the pass (`c011d0c`).

M3d closed on 2026-10-12 at `aaa19c7` (run 14). `gate:parity` compares the builders under
CLAUDE.md §1.5 as the owner amended it that day: skin graphs and limb anchors exactly, and
bounding boxes within 3 % (worst 2.04 %). Vertex counts are no longer compared. The pass scored
art 7.4, perf 8.15 and gameplay 8.5.

**M3 the milestone is `IN_PROGRESS`.** Every step is `DONE`, but the last pass has art at 7.4,
and no human has seen the dragons running (CLAUDE.md §7). Both are with the owner (NEXT.md):
a sighting of `dragon.html`, and the reference-design questions behind the art score.

## M4 — Terrain assets

| step | done when | status |
|---|---|---|
| **M4a** | **island generator — shape, size, biome, edge erosion, underside — with a passing variant sheet** | **TODO** |
| M4b | 3 cliff/rock generators, each with a passing variant sheet | TODO |
| M4c | 2 more rock generators plus arches and floating shards | TODO |

## M5 — Flora wave 1

| step | done when | status |
|---|---|---|
| M5a | wind vertex shader, proven on one tree at 200+ instances inside budget | TODO |
| M5b | 3 canopy tree generators with passing variant sheets | TODO |
| M5c | 2 more trees, and saplings | TODO |
| M5d | 4 understory generators — bushes, ferns, reeds, grass clumps | TODO |
| M5e | 4 more understory plus ground cover, dressed into the island | TODO |

## M6 — Look dev

| step | done when | status |
|---|---|---|
| M6a | orbit camera with touch and mouse, framing the island at every zoom | TODO |
| M6b | day/night sun — colour, elevation, the sky responding | TODO |
| M6c | cascaded shadows at the tier resolutions, no acne, no peter-panning | TODO |
| M6d | bloom and ACES, inside the post-processing budget | TODO |
| M6e | the five quality tiers, detected at boot, overridable, persisted | TODO |

## M7 — Dragon animation

| step | done when | status |
|---|---|---|
| M7a | procedural idle — breathing, blink, weight shift — driven by genome proportions | TODO |
| M7b | walk cycle, feet planted, no sliding | TODO |
| M7c | wing flap and glide, no interpenetration at any wing span | TODO |

## M8 — Taming & roster

| step | done when | status |
|---|---|---|
| M8a | IndexedDB save and load; a world survives reload; migrations in place | TODO |
| M8b | approach and calm — a wild dragon reacts to the player | TODO |
| M8c | taming completes and the dragon joins the roster | TODO |
| M8d | roster UI — list, select, inspect | TODO |

## M9 — Breeding

| step | done when | status |
|---|---|---|
| M9a | pair two dragons, lay an egg, persist the child genome | TODO |
| M9b | the hatch sequence, and a child mesh visibly its parents' | TODO |
| M9c | gene inspector — which trait came from which parent, and what is hidden | TODO |

## M10 — Ambient life

| step | done when | status |
|---|---|---|
| M10a | 3 fauna generators with passing variant sheets | TODO |
| M10b | 3 more, and their wander behaviour | TODO |
| M10c | VFX wave 1 — element auras, pollen, fireflies, dust | TODO |
| M10d | the island reads alive while the player stands still | TODO |

## M11 — Island building

| step | done when | status |
|---|---|---|
| M11a | placement and grid snapping, with a valid/invalid read | TODO |
| M11b | 3 creature buildings at tier 1 | TODO |
| M11c | 3 more at tier 1 | TODO |
| M11d | tiers 2 and 3 for all six | TODO |
| M11e | the economy — costs, income, progression gates | TODO |

## M12 — Flight

| step | done when | status |
|---|---|---|
| M12a | mount and dismount | TODO |
| M12b | take off, fly, land, with a camera that holds up | TODO |
| M12c | neighbouring islands stream in and out inside budget | TODO |

## M13 — Audio

| step | done when | status |
|---|---|---|
| M13a | the Web Audio graph, ambient beds, and a mixer that ducks | TODO |
| M13b | genome-driven creature vocals — a bred dragon sounds like itself | TODO |
| M13c | 40 interaction SFX | TODO |
| M13d | 3-layer music that rises with island population | TODO |

## M14 — Combat & boss

| step | done when | status |
|---|---|---|
| M14a | element strengths and the damage model | TODO |
| M14b | breath attacks shaped by genes | TODO |
| M14c | one leviathan encounter, start to finish | TODO |

## M15 — Flora wave 2 + props

| step | done when | status |
|---|---|---|
| M15a | hanging growth — vines, root curtains, moss | TODO |
| M15b | crops and herbs with their growth stages | TODO |
| M15c | 4 decoration generators | TODO |
| M15d | 4 more, and the full dressing pass | TODO |

## M16 — Polish & perf

| step | done when | status |
|---|---|---|
| M16a | real-GPU **verifications** across Potato through Ultra, logged in `STATE.md` | TODO |
| M16b | onboarding and the first-session flow | TODO |
| M16c | the final pass — bundle, boot time, every budget | TODO |

## When each rubric line goes live

`docs/RUBRIC.md` lets a critic score a line `n/a` while its subject does not exist. This
table is what makes that checkable: a line may be `n/a` **before** its milestone and never
at or after it. A run that marks a line `n/a` on or past its live milestone has written a
defect, not a dispensation.

| line | live from | subject |
|---|---|---|
| A1, A2, A3, A5, A6, A7, A8, A9 | M0 | anything rendered |
| A4 variant sheets | M1a | the first generator |
| P1, P2, P5 | M0 | any build |
| P4 | M0 | the frame loop |
| P3 bred-dragon mesh ≤ 120 ms | M3c | the runtime dragon builder |
| P6 Potato tier | M0 | reachable now at 1280×720 with shadows and post off; does not wait for M6's tier system |
| G1, G3, G6 | M0 | the milestone's own loop |
| G4 state survives reload | M8a | the save |
| G2 a bred dragon resembles its parents | M9b | breeding |
| G5 no softlock or unreachable state | M8a | persisted state |

## Definition of done for an asset milestone

An asset milestone is `DONE` only when, for every generator it adds:

1. `artifacts/variants/<id>.png` shows 8 seeds that read as 8 different objects.
2. LOD0, LOD1 and LOD2 all exist and each is within its triangle budget.
3. The generator is listed in `public/assets/MANIFEST.json` with its script path.
4. `art-critic` scored it ≥ 8.0.
