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
| **M0d** | **the placeholder frame meets `docs/ART_BIBLE.md`** — contact shadows land, all three lights reach the frame, prefab variety reads, no bare ground, no off-bible haze. art-critic ≥ 8.0 | **TODO** |
| M0e | HUD readable at 360 px; the context-loss line visible; `__dragonveinStats()` has no stale-frame hole | TODO |

M0a–M0c were delivered and verified inside the M0 runs — gates and CI are green, the
sighting is in `STATE.md`. They were never scored as separate steps, because this split did
not exist yet; the critic bar sits on M0d and M0e, which is where the open work is.

## M1 — Asset pipeline

| step | done when | status |
|---|---|---|
| M1a | one generator goes end to end: script → LOD0/1/2 `.glb` → 8-seed variant sheet → turntable → `MANIFEST.json` | TODO |
| M1b | `assets:build` and `assets:render` run in CI and publish their artefacts | TODO |

## M2 — Genome in TypeScript

| step | done when | status |
|---|---|---|
| M2a | `src/core/rng.ts` reproduces `assetgen/genome.py`'s stream exactly, proven on a fixed vector | TODO |
| M2b | `src/core/genome.ts` expresses, breeds and mutates identically; `gate:parity` green on 32 fixed genomes | TODO |

## M3 — Runtime dragon mesh

| step | done when | status |
|---|---|---|
| M3a | skeleton, torso and limbs build from a genome into a `BufferGeometry` | TODO |
| M3b | wings, crown, membrane and tail ornament; the creature reads as the Python one | TODO |
| M3c | built in a worker inside 120 ms on Medium; `gate:meshgen` green | TODO |
| M3d | `gate:parity` green between the two builders on the fixed genome set | TODO |

## M4 — Terrain assets

| step | done when | status |
|---|---|---|
| M4a | island generator — shape, size, biome, edge erosion, underside — with a passing variant sheet | TODO |
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
