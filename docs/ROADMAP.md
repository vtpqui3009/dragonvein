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
| M3e | wing form from the genome (sail, spread membrane, segmented), spread at rest; the greyscale sheet and outline numbers that measure silhouette | DONE |
| M3f | neck arc, body mass and horn count push the outline until `dragon-greyscale.png` reads as eight creatures; no blocking or major defect on the dragon's sheet or turntable | DONE |

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

**M3 the milestone is `DONE` — closed 2026-10-13 in run 26** at `61a228b`. M3f closed on its first pass (art 8.2, perf 9.5, gameplay 9.5; no blocking or major defect), so every step is `DONE`, the last pass is ≥ 8.0 in all three, and §7 holds through the owner's sighting. *History:* **M3 was `IN_PROGRESS`.** §7 is now satisfied — the owner opened `dragon.html` on
2026-10-13 and the sighting is logged in `STATE.md`. What remains is the art score: **7.4**,
and the thing holding it down is what the owner saw at full size. **M3e is that work**, added
on the owner's decision of 2026-10-13 to take it ahead of M5e.

**M3e and M3f — what they must deliver** (M3e split in run 24: instruments and wing forms first, then the silhouette push they measure). Every one of the eight dragons on `dragon.html` carries the
same upright flat triangular sail where `docs/concept/` shows spread bat wings, and the eight
silhouettes differ far less than the eight hues do. §0 says the genome *is* the parameter set
the mesh is built from, and that an unclear call goes to whatever makes the genetics more
visible; a creature set that reads as one shape in eight colours is that promise unmet.

Acceptance, all checkable:

1. **A wing-form gene with at least three expressed forms** — spread membrane, segmented, and
   sail — chosen by genome, each visible in the 8-seed sheet.
2. **The greyscale test.** `artifacts/variants/dragon-greyscale.png` renders the eight with
   all colour removed. They must still read as eight different creatures. This is the
   criterion that targets the defect directly: if shape carries the genome, hue is decoration,
   and removing it changes nothing about how many creatures you can count.
3. Neck arc, body mass and horn count each measurably change the outline across the fixed
   genome set — reported as numbers, not prose.
4. `gate:parity` stays green. §1.5 means `assetgen/dragon/` and `src/assets/dragon/` move
   together, so this is **one sequential owner across two directories** (§2.4), never a
   parallel fan-out.
5. `gate:meshgen` stays under 120 ms and `npm run gates` exits 0.
6. No `blocking` or `major` defect against the dragon's own sheet or turntable (§4).

**Unblocked on 2026-10-13 by run 23, which closed M5d** (art 8.5, perf 8.3, gameplay 9.7
at `3364460`, gates green, all four generators passing under the amended §4). This row was
`BLOCKED — M5d closes first` so that no run was pulled off fern mid-rework; that is done, and
**M3e closed in run 24** at `8e5b5ba` after one rework cycle (last pass: art 7.9, perf 8.5, gameplay 9.7; no blocking or major wing defect). **M3f is now the first step in reading order that is not `DONE`.** M5e waits behind it, by the
owner's choice: M3's art score is 7.4 because of the silhouette, and no amount of flora moves it.

## M4 — Terrain assets

| step | done when | status |
|---|---|---|
| M4a | island generator — shape, size, biome, edge erosion, underside — with a passing variant sheet | DONE |
| M4b | 3 cliff/rock generators, each with a passing variant sheet | DONE |
| M4c | 2 more rock generators (shard, eroded), each with a passing variant sheet | DONE |
| M4d | arch and floating-shard landmark generators, each with a passing variant sheet | DONE |

M4a closed on 2026-10-12 at `b27bc4d` (run 15) on its first pass: art 8.3, perf 8.2,
gameplay 9.2. `terrain/island` meets §Definition of done:
1. 8 seeds read as 8 islands (most alike pair 30.6 % apart);
2. LOD0/1/2 = 5760/1536/280 against 8000/2500/700;
3. it is listed in MANIFEST.json with its script;
4. art ≥ 8.0.

M4b closed on 2026-10-12 at `b58251a` (run 16) after one rework cycle: art 8.5, perf 8.2,
gameplay 9.2. Each of `terrain/stratified`, `terrain/columnar` and `terrain/boulders` meets
§Definition of done:
1. 8 seeds read as 8 objects (most alike pairs 25.0 / 22.6 / 21.5 % apart);
2. LOD0/1/2 = 896/384/144, 470/304/105 and 400/100/80 against 4000/1200/300;
3. each is in MANIFEST.json with its script;
4. art per generator 8.4 / 8.6 / 8.1.

M4c was split in run 17. It was written as four generators: two rocks, arches and floating
shards. M4b's three took the whole of run 16, including a rework cycle, so four would not
fit in one run (§How big a step may be). The landmarks moved to M4d.

M4c closed on 2026-10-12 at `3a2287f` (run 17) on its first pass: art 8.3, perf 8.5,
gameplay 9.0. `terrain/shard` and `terrain/eroded` meet §Definition of done:
1. 8 seeds read as 8 objects (most alike pairs 28.8 % and 26.0 % apart);
2. LOD0/1/2 = 808/268/128 and 500/182/72 against 4000/1200/300, strictly decreasing on
   every seed;
3. both are in MANIFEST.json;
4. art per generator 8.4 and 8.3.

M4d closed on 2026-10-12 at `e699c95` (run 18) on its first pass: art 8.3, perf 8.7,
gameplay 9.0. `terrain/arch` and `terrain/floatshard` meet §Definition of done:
1. 8 seeds read as 8 objects (most alike pairs 28.3 % and 25.0 % apart);
2. LOD0/1/2 = 940/292/140 and 738/250/90, strictly decreasing on every seed;
3. both are in MANIFEST.json;
4. art per generator 8.4 and 8.2.

**M4 the milestone is `DONE`, 2026-10-13.** Every step is `DONE`; the last pass had all three
critics ≥ 8.0 (art 8.3, perf 8.7, gameplay 9.0 at `e699c95`); and the owner reviewed the nine
8-seed sheets on the evidence page and accepted them, which is CLAUDE.md §7's requirement.
The sighting is logged in `STATE.md`. Nothing about M4 is outstanding.

## M5 — Flora wave 1

| step | done when | status |
|---|---|---|
| M5a | wind vertex shader, proven on one tree at 200+ instances inside budget | DONE |
| M5b | 3 canopy tree generators with passing variant sheets | DONE |
| M5c | 2 more trees, and saplings | DONE |
| M5d | 4 understory generators — bushes, ferns, reeds, grass clumps | DONE |
| M5e | 4 more generators — flowering shrub, moss, lichen, fallen leaves — each with a passing variant sheet | DONE |
| **M5f** | **dress the island with the generated flora and rocks, kinds merged per LOD into shared draws, inside budget** | **TODO** |

M5a closed on 2026-10-12 at `e377e1d` (run 19) on its first pass: art 8.4, perf 8.4,
gameplay 9.2. `src/render/wind.ts` sways 220 instances of the committed `flora/broadleaf` in
the game scene, which is where `gate:perf` measures it:
- draws 28 and triangles 174 012, against 180 and 900 000;
- heap within budget;
- `cpuFrameMs.p95` 1.9 against 3.5;
- the smoke run's two wind shots differ by 9 002 pixels, 86.8 % of them on foliage.

M5b closed on 2026-10-13 at `02a0495` (run 20) after one rework cycle: art 8.55, perf 8.4,
gameplay 8.8. `flora/conifer`, `flora/fanpalm` and `flora/windtwisted` meet §Definition of
done:
1. 8 seeds read as 8 trees (most alike pairs 24.7 / 22.1 / 23.9 % apart);
2. LODs are inside 6000/2000/500 on every seed;
3. all three are in MANIFEST.json;
4. art per generator 8.7 / 8.2 / 8.1.

M5c closed on 2026-10-13 at `0682cb6` (run 21) on its first pass: art 8.35, perf 8.9,
gameplay 8.7. The pieces are:
- `flora/ancientgiant`, the last §B1 tree;
- `flora/deadtree`, the second tree, chosen in run 21 to replace the hand-built snags;
- `flora/sapling`, the young broadleaf, conifer and palm.

M5d closed on 2026-10-13 at `3364460` (runs 22–23) after two rework cycles: art 8.5, perf 8.3,
gameplay 9.7, gates green. `flora/bush`, `flora/fern`, `flora/reeds` and `flora/grassclump`
meet §Definition of done:
1. 8 seeds read as 8 plants (fern's most-alike pair 37.5% apart, up from 26.5%);
2. LODs strictly decreasing inside the 4000/1200/300 prop row on every seed, scanned to 64;
3. 0 inward, open and non-manifold edges at every LOD on every seed;
4. `--verify` reproduces all 57 shipped files byte-for-byte.

**It cost two rework cycles and a rule change, which is the part worth remembering.** Cycle 1
failed fern at 7.7 on a per-generator sub-score. Cycle 2 then scored `bush`, `reeds` and
`grassclump` *lower than cycle 1 on byte-identical files* — up to 0.8 — which exposed that the
per-generator estimate carried more noise than the 8.0 bar it was being judged against.
`CLAUDE.md` §4 was amended on that evidence: per-asset acceptance is now decided by
`blocking`/`major` defects pointing at that generator's own artefact, with sub-scores as
commentary. Under the rule, cycle 3 passes all four generators, and the two genuine fern
majors that cycle 1 and cycle 2 each raised were both fixed in the generator, never by
reseeding.

They meet §Definition of done:
1. most alike pairs 23.4 / 26.4 / 27.7 % apart;
2. LODs inside 6000/2000/500 on every seed;
3. all three are in MANIFEST.json;
4. art per generator 8.1 / 8.4 / 8.0.

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

## ▲ Playable checkpoint — the owner plays it and decides

**This is a gate, not a milestone. No run passes it.** When M9c is `DONE` the loop exists
end to end for the first time: a wild dragon reacts, is tamed, persists through a reload,
appears in the roster, pairs, lays, hatches, and the child's gene inspector names which
parent gave which trait.

At that point the owner plays it and answers one question: **is this fun?** Everything below
this line is an investment in a loop that is assumed to work. Spending runs on day/night
light, bloom and quality tiers before that answer is how a project ends up with beautiful
foundations and no game.

A run that reaches this line stops, writes the question into `NEXT.md`, and waits. It does
not start M6.

Owner decision, 2026-10-13: M6 Look dev was moved from before M7 to after this gate for
exactly this reason. Milestone numbers are unchanged — `docs/RUBRIC.md`, `STATE.md` and
`FINDINGS.md` keep meaning what they said — only reading order moved, and reading order is
what §3.1 schedules on.


## M6 — Look dev

| step | done when | status |
|---|---|---|
| M6a | orbit camera with touch and mouse, framing the island at every zoom | TODO |
| M6b | day/night sun — colour, elevation, the sky responding | TODO |
| M6c | cascaded shadows at the tier resolutions, no acne, no peter-panning | TODO |
| M6d | bloom and ACES, inside the post-processing budget | TODO |
| M6e | the five quality tiers, detected at boot, overridable, persisted | TODO |

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

## After M16 — what "a full game" would mean here

**Owner intent, 2026-10-13: once every milestone above is `DONE` and the direction has
proven out, build this into a game with the depth of a real one.** Recorded so it is not
forgotten, and deliberately *not* scheduled: nothing here is a commitment, and no run takes
anything from this section. It is reopened by the owner after M16, in the light of what the
playable checkpoint and M16's own numbers actually showed.

Two different things could be meant by "full features", and they are not the same decision.

**Depth — consistent with `docs/GDD.md`, and the likely direction.** More of what the game
already is, rather than a different kind of game:

- more islands, biomes and wild populations, with altitude as real progression;
- more of the gene space made visible — fusions, rare alleles, pattern genes, a gene library
  worth screenshotting;
- creature variety beyond dragons, built from the same genome machinery;
- deeper taming and bonding, with behaviour that rewards reading an animal;
- more buildings, higher tiers, a real island economy;
- weather, seasons, and time-of-day events that change what is out in the world;
- quests or expeditions that give the collection somewhere to go.

**Live-service apparatus — would contradict what is already written down.** `docs/GDD.md`
§What we are not building rules out gacha, energy timers, login streaks and a story campaign,
and `CLAUDE.md` §7 rules out telemetry, ads, a backend, a login and anything collecting
personal data. Multiplayer is excluded "at launch", so it is the one item here that a later
phase could take up without contradicting anything.

If the owner later wants any of the ruled-out items, **`docs/GDD.md` and `CLAUDE.md` are
changed first, by the owner, in their own commit** — never by a run, and never quietly as a
side effect of building something. §7 exists because a target that gets edited to match what
was built stops being a target.

**The honest prerequisite.** A game earns more features by being good at what it already
does. The playable checkpoint above answers whether the core loop is fun; M16's real-hardware
numbers answer whether it runs where it claims to. Both answers should be yes before this
section is opened, because every item here makes the thing bigger, and bigger is only better
when the middle already holds.

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
