# STATE

Run journal. Newest at the top. Every scheduled run appends here, including runs that
ship nothing — a run with no entry is indistinguishable from a run that never happened.

---

Older run entries live in [`docs/archive/STATE-2026-10.md`](docs/archive/STATE-2026-10.md),
whole and unedited. This file keeps the runs still worth reading at the start of a run, every
`decisions` entry (code and tests cite them by heading), and the Real-GPU verification log,
which the perf-critic scores against. A run that closes a step moves its own entry to the
archive once two newer run entries sit above it.

---

## 2026-10-13 · owner session · the loop moves ahead of look dev

No code. Two owner decisions, and one session stood down.

**Run 25 was stopped** so the owner's second Pro account could work without two sessions
pushing to `main`. It had shipped no code — marker, criteria and handoff only — so `main` was
clean. Its `NEXT.md` still said "run 25 is in flight on M3f"; that was corrected, because a
handoff claiming work is underway when it is not is the failure this project has paid for
before. M3f's acceptance criteria stay on `main` for whoever takes the step.

**The resequencing.** Asked and answered by the owner after being shown the honest position:
**23 of 66 steps `DONE`, every one of them engine or asset, and the loop not started.** The
reading order now runs M3 → M5 → M7 → M8 → M9 → **▲ playable checkpoint** → M6 → M10… .

Only `## M6 — Look dev` moved, to after M9. That one move is the whole change, and it was
chosen over trimming M8 or M9: the loop's seven steps are each load-bearing — without
IndexedDB nothing persists, without the roster there is nothing to look at, and the gene
inspector *is* the pillar §The genome is visible. There was nothing in the loop worth cutting;
what was worth deferring was the lighting around it.

Milestone numbers are unchanged, as `docs/ROADMAP.md` §How big a step may be requires, so
`RUBRIC.md`'s live-from table and every existing `STATE.md` and `FINDINGS.md` reference still
resolve. §3.1 schedules on reading order, so the move alone redirects the runs.

**The checkpoint is a gate no run passes.** A run that closes M9c stops, writes the question
into `NEXT.md` and waits for the owner to play it. The question is "is this fun?", and it is
asked before any run is spent on bloom.

**Also recorded, deliberately unscheduled:** `docs/ROADMAP.md` §After M16 now carries the
owner's intent to build this out to a full game once every milestone is `DONE` and the
direction has proven out. It separates depth (more islands, more of the gene space visible,
more creatures from the same machinery — all consistent with the GDD) from live-service
apparatus (gacha, energy timers, login streaks, a backend — ruled out by `docs/GDD.md` and
`CLAUDE.md` §7). Only the owner may unlock the second kind, by changing those files first, in
their own commit. No run takes anything from that section.

**Next:** M3f, from the criteria already on `main` under a new run heading.

---

## 2026-10-13 · owner session · M4 closed, and M3e added ahead of M5e

No code. The owner reviewed both artefacts and made a roadmap decision; both are recorded here
because §7 requires the sighting and §4b.4 requires a roadmap change to be argued, not assumed.

### M4 is `DONE`

The owner opened the evidence page and accepted the nine 8-seed terrain sheets — island,
stratified, columnar, boulders, shard, eroded, arch and floatshard. That is CLAUDE.md §7's
requirement, and it was the only thing M4 was waiting on: every step was already `DONE` and the
last pass scored art **8.3**, perf **8.7**, gameplay **9.0** at `e699c95`, so §3.6's milestone
bar was already met. **M4 closes with nothing outstanding.**

### M3 does not close, and the reason is what the owner saw

§7 is now satisfied for M3 too — the `dragon.html` sighting is logged in §Real-GPU
verification log below. But §3.6 needs all three critics ≥ 8.0 and **art is 7.4**. So M3 stays
`IN_PROGRESS` on the score alone.

The owner's screenshot shows exactly what the art-critic has been deducting for: all eight
dragons carry the same upright flat triangular sail where `docs/concept/` shows spread bat
wings, and **the eight silhouettes differ far less than the eight hues do**. For a project whose
§0 says the genome *is* the parameter set the mesh is built from, a creature set that reads as
one shape in eight colours is the hook not landing. This is the first time a human has seen it
at full size rather than inferred it from a variant sheet.

### The decision: M3e before M5e

**Asked and answered by the owner, 2026-10-13.** Roadmap order put M5e — more flora, dressed
into the island — next. The owner chose the dragon silhouette instead. Recorded as a decision,
not drifted into:

- It is the one step that can close M3, since art 7.4 is the only thing left and the silhouette
  is what that score is about. More flora cannot move it.
- §0's tie-breaker says to pick what makes the genetics more visible. Shape carrying the genome
  is that, directly.
- The cost is real and is accepted: flora dressing waits, including the M5e heap note about
  merging the four understory types into one draw call.

**M3e's acceptance criteria are in `docs/ROADMAP.md`**, written to be checkable. The one worth
naming here is the **greyscale test**: render the eight dragons with all colour removed, and
they must still read as eight different creatures. It targets the defect precisely — if the
genome is carried by shape, removing hue changes nothing about how many creatures you can count.

M3e is marked `BLOCKED` rather than `TODO` so that a run reading in order does not take it ahead
of M5d, which is in flight with only fern's near-pairs left. The run that closes M5d flips it.

**Next:** close M5d (fern), then M3e.

---

## 2026-10-13 · dispatcher · two rulings: per-asset acceptance, and a blocker that was not one

No code. Run 23 ended `IN_PROGRESS` on M5d and named two owner items. Both are settled here.

### 1. Criterion 6: defects, not sub-scores (`CLAUDE.md` §4)

**The evidence run 23 produced is the strongest measurement argument this project has made.**
Between cycle 1 (`9e1a2b6`) and cycle 2 (`d1dcabe`) only `fern.py` and three `fern.lod*.glb`
changed. `bush`, `reeds` and `grassclump` were **byte-identical**. Their art could not have
moved. Their per-generator scores moved anyway: bush 8.6 → 7.8, grassclump 8.1 → 7.8, reeds
8.2 → 8.0. That is ±0.8 of scorer noise against a bar set at 8.0.

**The ruling.** A generator fails its step's per-generator criterion when a critic lists a
`blocking` or `major` defect pointing at that generator's own artefact — its variant sheet or
its turntable. Per-generator numbers are commentary and never decide a step.

Why this and not the alternatives:

1. `docs/RUBRIC.md` scores nine art lines **over the whole artefact set**. There is no
   per-generator line, so a per-generator number is the critic's improvised split of a
   whole-set score. Nothing anywhere says what 8.1 rather than 7.8 means for one sheet.
2. §3.2 requires a criterion be checkable by a command or a named screenshot. A measurement
   whose noise (±0.8) exceeds the margin it judges (0.1–0.2 either side of 8.0) is not a check.
3. §4 already requires every defect to carry a pointer — a screenshot region, a number, or a
   reproduction command. Defects reproduce by construction. Improvised sub-scores do not. The
   gate moves onto the one per-artefact signal the contract already makes rigorous.
4. It keeps the intent. Criterion 6 existed so one bad generator could not hide behind a good
   average, and under this rule one still cannot.

**The test that this is a ruling and not score-fishing: it does not close the step.** Applied
to cycle 2, fern carries a `major` A4 defect (seeds 1 and 8 the same upright vase; 3 and 5
both low uncurled fans), so **fern still fails and M5d stays `IN_PROGRESS`**. Bush, reeds and
grassclump carry only minors and pass. The favourable reading was available under the old
wording too — cycle 1 passed three of four — and run 23 refused it. This rule discards the
noise and keeps the one genuinely actionable item, which is what run 23 said was left.

**Also added to §4: a critic states its coverage.** Cycle 2's art-critic read three of fourteen
shots and opened no turntables; cycle 1's opened more. Only run 23's builder note made that
visible, and it is a plausible part of the ±0.8. Coverage is now part of the report.

§7 forbids rewriting `docs/RUBRIC.md` to match what was built, so `RUBRIC.md` is untouched.
The rule lives in `CLAUDE.md` §4, which governs how critics are read.

### 2. The `3ab6e84` real-GPU row is sound — the blocker was a shallow clone

Run 23 reported that the newest real-GPU row cites a commit that does not resolve, and both
perf rounds deducted P1 over it. **It resolves.** `3ab6e84` is `docs(next): the owner's
real-GPU command, now that it can pass`, 2026-10-12 08:13, and
`git merge-base --is-ancestor 3ab6e84 main` confirms it is on main's history. This clone has
210 commits and `git rev-parse --is-shallow-repository` returns false.

A build container's checkout is **shallow** — `create_session`'s `clone_depth` defaults to 50
— so a hash further back than that genuinely returns "unknown revision" there. The row needs
no correction and the owner need do nothing. Recorded in `NEXT.md` §Open items as a standing
hazard: an old hash failing to resolve means the clone is shallow, not that history is wrong.

Two perf rounds spent deductions on this. It was never a defect in the project.

**Next:** fix fern's two `major` near-pairs and close M5d. Still owner-only: a
verification-grade real-GPU row and a Potato row, and the M3 and M4 sightings (§7).

---

## 2026-10-14 · run 30 · M7b — walk cycle, feet planted, no sliding

**Step**: `M7b`, the first step in reading order that is not `DONE`. The marker commit
precedes this one.

**The animation path, decided before code: skinning.** M7a's vertex-shader idle could shear
a leg but not bend a knee; both critics said the legs "shear rather than bend". A walk needs
limbs that rotate about joints, and feet that stay still on the ground while the body moves
over them. So the dragon becomes a three.js `SkinnedMesh`:
- **Bones** come from the skin graph's own nodes. `graph.ts` already has the hip, shoulder
  and the per-leg node chain down to the toes. The torso, neck and tail nodes become a spine
  chain, and the wings ride their roots. No new bone layout is invented.
- **Skin weights** are baked in the worker by the tube sweep. Every ring knows its path
  segment, so it is weighted to that segment's two nodes, with up to 4 influences per vertex.
- **Parity** is untouched. It compares skin graphs and limb anchors, not weights, and the
  graph does not change.
- **Two-bone analytic IK** places each foot: hip or shoulder → knee → foot. A planted foot's
  target is fixed in world space for its whole stance phase.
- **M7a's idle stays as it is.** It composes with skinning: breath and blink on the bind pose,
  sway as root motion.

The risk is CPU: bone updates every frame. It is measured in criterion 4.

**Ownership**: one sequential owner, the integrator, across `src/assets/dragon/` (weights,
bone table), `src/render/`, `src/dragon-view.ts`, `tools/` and `tests/`.

### Acceptance criteria

1. **The genome drives the gait.** `walkParams(genome)` gives:
   - a stride length that grows with legLength;
   - a cadence that slows with bodyMass;
   - the duty factor, the share of each cycle a foot is down;
   - a quadruped gait order, the lateral sequence: left hind, left fore, right hind, right
     fore.

   The body travels at stride ÷ cycle period. `tests/dragon-walk.test.ts` proves it monotone,
   bounded and deterministic.
2. **Skinning.** The mesher emits `skinIndex` and `skinWeight` (≤ 4 influences, weights sum to
   1, tested) and a bone table derived from the graph. `dragon.html` renders a `SkinnedMesh`
   that is pixel-identical at rest to the static mesh. Measure it: the rest-pose diff is ≤ a
   few pixels on edges only.
3. **No sliding, as a number.** A tool walks each sheet dragon for 2 cycles and records each
   foot's world position across its stance phase. The **stance drift is ≤ 1 % of the stride**
   for every foot of every dragon. It is written to `artifacts/variants/dragon-walk.json`, and
   the tool fails above that. Knees visibly bend: the knee angle range over a cycle is reported
   and is > 15°.
4. **Budgets.**
   - meshgen ≤ 120 ms, with no regression past noise (~44 ms max now);
   - `gate:parity` green;
   - no new draw on `dragon.html`;
   - `cpuFrameMs` on `dragon.html` with 8 dragons walking is measured and reported. It must
     stay under the 3.5 ms main-thread budget;
   - no per-frame allocation in the walk or IK path;
   - `npm run gates` exits 0.
5. **Seen.** `artifacts/turntables/dragon-walk.webm` is a tracking side view of one dragon
   walking across 2+ cycles, framed whole. `dragon-walk-a.png` and `dragon-walk-b.png` show
   two phases.
6. **No blocking or major art defect**:
   - no foot sliding;
   - no tearing or candy-wrapper collapse at the knees or shoulders;
   - wings and tail ride the body;
   - the idle still works at rest.

---

## 2026-10-14 · run 29 · M7a DONE — procedural idle driven by the genome

**Step**: `M7a`, the first step in reading order that is not `DONE`. M5 waits only on the
owner's look. The marker commit precedes this one.

**The animation path, decided before code.** The idle is a **vertex-shader deformation keyed
on per-vertex attributes that the mesher bakes**, the same pattern as `windBend` (M5f). It
is not skinning. The reasons:
- it allocates nothing per frame and adds no draw call (P4 headroom is about 3.4 kB);
- the dragon stays one draw;
- `gate:parity`, which compares skin graphs, is untouched, because the attributes are an
  output of the TS mesher only.

Bone skinning stays open for M7b (walk) and M7c (flap), where limbs must rotate rather than
breathe. Whether the attributes are enough there is M7b's call.

**Ownership**: one sequential owner, the integrator, across `src/assets/dragon/` (mesher
attributes), `src/render/` (the idle patch), `src/dragon-view.ts`, `tools/` and `tests/`.

### Acceptance criteria

1. **The genome drives the idle.** A pure TS function `idleParams(genome)` gives the breath
   rate and depth, the blink interval and the weight-shift amplitude and period from body
   genes. For example:
   - heavier bodyMass breathes slower and deeper;
   - chestDepth scales the chest swell;
   - legLength and bodyMass set the sway.

   `tests/dragon-idle.test.ts` proves:
   - monotonic in the genes it names;
   - bounded;
   - deterministic: the same genome gives the same params, with no `Math.random` or
     `Date.now`;
   - two different sheet genomes give different params.
2. **Baked attributes.** The worker mesher emits the per-vertex weights the shader needs:
   chest or breath, eyelid, sway. They are applied in a vertex-only patch, with one shared
   time uniform set once per frame without allocating.
3. **Seen moving.** `dragon.html` animates the idle. `tools/dragon-sheet.mjs` writes
   `artifacts/variants/dragon-idle-a.png` and `dragon-idle-b.png`: the same camera at two
   fixed idle times, with one time at mid-blink. It logs the changed-pixel count and fails if
   it is 0, and the changed pixels lie on the dragons. It also writes
   `artifacts/turntables/dragon-idle.webm`, a few seconds of one dragon idling.
4. **Budgets.**
   - `gate:meshgen` ≤ 120 ms, with no regression past the noise of the current ~50 ms;
   - `gate:parity` green;
   - no new draw call on `dragon.html`;
   - `npm run gates` exits 0.
5. **No blocking or major art defect** on the idle frames or turntable: no tearing, no
   eyelid through the skull, no wing or body interpenetration from the sway (§4).

---

### Result — M7a DONE (M7 IN_PROGRESS)

All five criteria hold at `6cbc451`.

1. **`idleParams(genome)`** (`src/assets/dragon/idle.ts`) is pure and deterministic. With the
   body genes normalised as m (bodyMass), c (chestDepth), l (legLength) and h (headSize):

   | parameter | formula | range |
   |---|---|---|
   | breathPeriod | 2.6 + 2.4m | 2.6–5.0 s |
   | breathDepth | (0.014 + 0.014m)(1 + 0.8c) | — |
   | blinkInterval | 3.5 + 2.5m | 3.5–6.0 s |
   | blinkDuration | 0.16 + 0.10h | — |
   | swayAmp | (0.025 + 0.025l)(1.2 − 0.4m) | — |
   | swayPeriod | (5 + 2.5m)·√legLength | — |

   The phases come from `Rng(gid)`. There are 17 tests, covering monotonicity, bounds,
   determinism, still feet, and mix 0 equalling the built mesh.
2. **Baked attributes**, with the worker transferring 6 buffers:
   - `idleBreathSway` (vec4): the breath field about the torso line, plus a sway weight that
     is 0 at the feet;
   - `idleBlink`: the eye squashes to a slit about its centre.

   The vertex-only `withIdle` patch (`src/render/idle.ts`) composes with `withRim`. It uses a
   shared time uniform, and a per-dragon material clone that matches the depth material.
3. **Seen moving.**
   - `dragon-idle-a/b` (b at mid-blink) differ by 49 592 px, 83 % of them on the dragons.
   - `dragon-idle.webm`.
   - `__dragonView.idleAt` and `idlePlay`.
4. **Budgets.**
   - No new draw on `dragon.html`: 50 per frame before and after, measured by the builder and
     by the perf critic.
   - meshgen round-trip max 36.5–43.8 ms, within noise of the base.
   - Parity is exact, and the rest pose is unchanged.
   - `npm run gates` exits 0.
5. No blocking or major art defect. The feet are template-matched at (0,0), and the blink is
   clean.

**Scores (cycle 1):** art 9.1, perf 9.5, gameplay 8.4.

**Hazard.** `gate:meshgen` flaked once on unmodified HEAD, at 243.8 ms. It passed on rerun at
25.4 ms. The cause is not found yet.

**Open, carried to FINDINGS:**
- the idle is subtle at sheet scale;
- the blink is a squint and there is no lid;
- the clip covers one dragon;
- there is no `dragon.html` smoke coverage;
- the meshgen flake.

---

## 2026-10-14 · run 28 · M5f DONE (M5 awaits the owner) — dress the island with the generated flora and rocks

**Step**: `M5f`, the first step in reading order that is not `DONE`. The marker commit
precedes this one.

**Ownership**: one sequential owner, the integrator, across `src/main.ts`, `src/render/` and
`tools/` (CLAUDE.md §2.4).

**Baseline** (perf, M5e at `4310718`):
- `drawCalls` 28, `triangles` 174 012;
- `heap.bytesPerFrame` 35 232 of 40 960, about 3 draws of headroom at ~1.8 kB per draw;
- `cpuFrameMs.p95` 2.3;
- Potato: 20 draws and 142 800 triangles.

The generated assets in the scene today are only `flora/broadleaf` (220 instances). The
hero island's other trees, bushes, rocks and snags are hand-built placeholders.

### Acceptance criteria

1. **The generated set dresses the hero island.** It must include at least:
   - trees: conifer, broadleaf and one more kind;
   - understory: bush, fern, grassclump and flowershrub;
   - ground cover: moss, lichen and fallenleaves;
   - rocks: one M4 rock kind or more;
   - `flora/deadtree` in place of the hand-built snags.

   `__dragonveinStats()` reports an instance count per kind. `gate:smoke` logs it and
   **fails if any listed kind is 0**.
2. **Merged draws.**
   - All placed flora renders as **at most one draw per LOD**: one batched or merged draw
     per LOD across every kind, with the vertex-colour material and wind in the vertex
     shader.
   - Shadow-pass draws are limited to the near trees.
   - Ground cover casts no shadow.
   - Hand-built placeholders that the generated set replaces are removed, so their draws
     are freed.
3. **Inside budget, with no budget raised.** `npm run gate:perf` gives:
   - `drawCalls` ≤ 31 (the baseline plus the ~3-draw headroom);
   - `heap.withinBudget` true;
   - `cpuFrameMs.p95` ≤ 3.5 with the tail enforced;
   - `triangles` ≤ 900 000;
   - Potato draws ≤ 23.

   Before and after are both recorded.
4. **Seen.**
   - `artifacts/shots/01-wide.png` shows the dressed island.
   - A new smoke shot `artifacts/shots/12-island-close.png` frames the ground at close range,
     so the ground cover and understory read.
   - The wind shots (`11-wind-a/b`) still show sway on the placed flora.
   - Lichen does not z-fight against ground or rock in the close shot.
5. `npm run gates` exits 0.
6. No blocking or major art defect against the scene shots (§4).

**Contract change (integrator, for the other owners):** `docs/ARCHITECTURE.md` §Render
contract now allows a `BatchedMesh` where many prop kinds share one material, beside the
existing `InstancedMesh`-per-type rule. The hero island's flora and rocks are one
`FloraBatch` (`src/render/flora.ts`), and its shadow pass draws only the caster prefix. The
wind patch (`src/render/wind.ts`) now reads a baked per-vertex `windBend` attribute
(`bakeWindBend`) instead of a height uniform, and it handles `batchingMatrix` as well as
`instanceMatrix`. Any new wind-patched mesh must bake the attribute; a mesh without it
stands still.

---

### Result — M5f DONE; M5 IN_PROGRESS until the owner sees it

Criteria 1–6 hold at `1bb31e8`.

1. **Kinds placed.** All 15 kinds are on the hero island:

   | kind | count | kind | count |
   |---|---|---|---|
   | conifer | 9 | flowershrub | 10 |
   | broadleaf | 6 | fern | 22 |
   | sapling | 4 | grassclump | 47 |
   | windtwisted | 2 | moss | 22 |
   | deadtree | 3 (replacing the snags) | fallenleaves | 20 |
   | boulders | 12 | lichen | 17 |
   | columnar | 2 | pathstone | 22 |
   | bush | 17 | | |

   The smoke fails if any of 13 required kinds is 0.
2. **One `BatchedMesh` for the island.** `FloraBatch` in `src/render/flora.ts` draws the whole
   island in 1 colour draw and 1 shadow draw. The shadow casters sit in a prefix, so the
   ground cover casts no shadow. Culling and sorting are off. The placeholders are removed.
   Wind is a baked per-vertex `windBend`, and the patch handles `batchingMatrix`.
   ARCHITECTURE §Render contract now allows a `BatchedMesh` where kinds share one material.
3. **Perf.** One source, `gate:perf` runs on `2c25da2` and `1bb31e8`:

   | | before | after | limit |
   |---|---|---|---|
   | draws | 28 | 17 | ≤ 31 |
   | triangles | 174 012 | 216 714 | ≤ 900 000 |
   | heap | 36 128 | 37 594 | ≤ 40 960 |
   | cpu p95 | 1.4 | 1.5 | ≤ 3.5 |
   | Potato draws | 20 | 14 | ≤ 23 |

   The run-28 baseline row above (35 232 / 2.3) came from M5e's run at `4310718`, which is
   noise between runs. No budget was raised.

   The first pass put every tree at LOD0: 343k triangles and a heap of 41 156, which failed.
   The fix made the frame cheaper rather than touching the gate: trees at LOD1, grass and
   fern at LOD2.
4. **Shots.**
   - `01-wide` shows the dressed island.
   - `12-island-close` is new.
   - The wind diff is 17 095 px, 76 % of it foliage.
   - The lichen is clean, with no z-fighting.
5. `npm run gates` exits 0.
6. No blocking or major defect.

**Scores (cycle 1):** art 8.6, perf 9.2, gameplay 9.3.

**Container restart.** The container restarted mid-run. The tree survived and was
snapshotted to `wip/m5f`, and the integrator resumed. `wip/m5f` is now superseded.

**Open, carried to FINDINGS:**
- P4 headroom is 3.4 kB;
- the front of the deck is sparse and the ground green is flat;
- the grass blades are wire-thin;
- the moss is scaled too big;
- the rock faces are near-black;
- `loadFlora` is all-or-nothing.

---

## 2026-10-12 · decision · CLAUDE.md §1.5: parity compares the graph, not vertex counts

**Asked and answered in session, by the owner.** §1.5 had `gate:parity` fail "if bounding box,
vertex count, or limb-anchor positions differ beyond tolerance". The two builders cannot
agree on vertex count:
- the reference skins its graph with Blender's Skin modifier and Subsurf, about 20 000
  vertices per body;
- the runtime sweeps tubes, about 5 000 per body.

They are different tessellations of the same graph by design (STATE.md run 11), and no
tolerance makes the count meaningful. Asked with three options (drop the count; keep it
with a loose tolerance; rewrite the TS skin to imitate Blender's), **the owner chose to drop
it.**

§1.5 now reads: parity fails if the skin graphs differ (positions, radii, edges, exactly),
or if bounding box or limb-anchor positions differ beyond tolerance. The graph half already
holds (`tests/dragon-graph.test.ts`, under the named 1-ulp `pow` exception). M3d writes
the gate on that wording.

---

## 2026-10-12 · decision · M0 and M1 closed

Both milestones met `CLAUDE.md` §3.6 today, on the owner's evidence:

- **Every step is `DONE`** in both M0 (a–f) and M1 (a–b).
- **All three critics are ≥ 8.0 on the last pass**: art 8.7 and gameplay 8.7 at `f7e5597`
  (M1b round), and perf **8.4** at `634c4d7`. The perf re-score was driven by new evidence,
  not a re-roll. Its lead deduction had been "the real-GPU log is stale", and the owner then
  sent a current-commit sighting. `git diff f7e5597 634c4d7 --stat -- src public` is empty,
  so all three scores describe the same running build.
- **A human has seen it run** (§7): the owner's screenshot of `v0.0.1+3ab6e84`, recorded in
  §Real-GPU verification log below.

Still open, and named so it is not mistaken for done: a verification-grade real-GPU row
(`gate:perf --real-gpu`, made possible by `bc5a56e`) and a real-hardware Potato number.
`docs/ROADMAP.md` M16 requires both. Perf's P4 headroom (98.5% uncorrected) is the forward
risk for every step that adds a draw call.

**Next step: M2a.**

---

## 2026-10-12 · dispatcher · ruling: how a step closes, and how a milestone closes

No code. The daily trigger fired at 02:07 UTC, every DRAGONVEIN session was idle, and run 6
(the owner's second Pro account) had already closed M0f overnight at `a654bd9`. Before
spawning M1a, the dispatcher closed the one question run 6 left open rather than leaving the
next run to re-derive it.

**The question.** `CLAUDE.md` §3.6 read "All three ≥ 8.0 and gates green → commit, push, mark
the milestone `DONE`." Runs 5 and 6 read that as a *milestone* bar and closed M0e (perf 7.9,
gameplay 6.7) and M0f (perf 7.8) on their own row criteria, flagging the ambiguity instead of
stretching a score. Read per *step*, both closures were wrong.

**The ruling: per milestone, and §3.6 now says so in two clauses.** A step closes on the
acceptance criteria written for it in §3.2 — the named commands and screenshots — with gates
green. A milestone closes only when every step in it is `DONE` **and** all three critics
scored ≥ 8.0. The 8.0 bar is untouched; what changed is that the sentence now names what it
applies to. Reasons, in order of weight:

1. **The alternative is unreachable by construction.** `docs/RUBRIC.md` §When each rubric line
   goes live puts lines live at a milestone, not a step. A step that ships no input cannot
   score G6, and a step that ships no GPU cannot score P1's absolute number. Per-step ≥ 8.0
   would make every such step permanently unclosable — which is what trapped M0e for two runs.
2. **Scoring an unchanged tree again is the behaviour the contract forbids.** The only route
   from a 7.8 on an artefact no run can change is to re-roll the critic. §4 exists to stop
   exactly that.
3. **It is already the practice, and it was the right call twice.** M0f's 8.8 gameplay — first
   over the bar since M0d — confirmed the run-4 diagnosis that G6 was a roadmap defect, not a
   build defect. Closing M0e per step would have blocked the step that fixed it.

**M0e and M0f stand as `DONE`. M0 stays `IN_PROGRESS`**, because perf sits at 7.8 and its
deductions are the two owner items below — a real-GPU verification row and a human sighting
(`CLAUDE.md` §7). Neither is a build defect; neither is closable from a container.

Also fixed: `docs/ROADMAP.md` §M0 History still said M0f "is waiting on the owner", stale since
run 6 landed it. An edit to that sentence was refused by the permission layer in run 5; it
went through this time.

Nothing here weakened a gate, a test or a score. If the owner reads §3.6 the other way, the
two clauses are one revert and this entry is the reasoning.

**Next:** M1a, spawned fresh per `ops/dispatcher-prompt.md`.

---

## 2026-10-11 — decisions — M0f approved, and A2 was asking the wrong question

Run 2026-10-11 closed M0d (art 8.3, perf 8.7, gameplay 6.9) and raised two items. Both are
defects in documents written at project setup, not in the build.

### 1. G6 had no subject at M0 — **M0f approved**

`docs/ROADMAP.md` made G6 "mouse and touch" live from M0, and no M0 step delivered input.
The gameplay-critic was therefore capped below the bar by a line nothing could satisfy —
the third instance of this pattern, after P1 and the no-subject rule. M0f is now approved
and worded in the roadmap: drag to orbit, wheel or pinch to zoom, asserted under both a
mouse and a `hasTouch` context.

The run proposed it and did not take it, because one step is one run. That was right.

### 2. The palette gap — measured, and the conclusion is the opposite of the proposal

The run asked whether `ART_BIBLE.md` wants a dusk entry, expecting that one would take A2
"to near zero". Measured before deciding, in CIELAB:

| ramp from `sky horizon` #ff9044 to `deep shadow` #1a1420 | peak ΔE from the nearest entry |
|---|---|
| direct | 47.1 |
| via `rock mid` (what shipped) | 33.9 |
| + 1 purpose-chosen stop | 23.7 |
| + 2 stops | 15.7 |
| + 3 stops | 12.2 |
| + 4 stops | **10.3** — the first that clears A2 |

So one entry does not fix it. **Four** do, which would leave five of fourteen palette
entries existing only to let one gradient pass one test. That is the palette serving the
rubric instead of the art, and it is the wrong trade.

The real defect is A2. A gradient passes through colours between its stops — that is what a
gradient is. Scoring a ramp's midpoint against the palette measures the definition of
interpolation, not the quality of the frame, and no correct work can satisfy it.

**A2 now scores surfaces** — a rock, a leaf, a panel, a dragon's scales — within ΔE 12.
For a **gradient** it asks three things that are real defects when they fail: both endpoints
are palette entries, the ramp is monotonic in value, and it does not band at the tier's bit
depth. `docs/RUBRIC.md` §A2 carries the measurement.

A `dusk` entry `#844e32` was added anyway, for a different reason. Routing a sky through
`rock mid` worked numerically and was wrong semantically — a cliff colour has no business in
a sky. `dusk` is named for the job it does.

### The pattern, now three for three

P1 asked for a number no available machine could measure. The no-subject rule let lines
score zero for things that did not exist. G6 went live at a milestone that delivered no
input. A2 scored interpolation as if it were art direction. Each cost a run or more to
discover, and each was written at setup by someone — me — who had not yet watched the
rubric meet a real build.

Worth saying plainly for whoever reads this later: when a critic cannot reach the bar with
any amount of correct work, suspect the instrument before the builder. Four times now, the
instrument was wrong.

---

## Real-GPU verification log

`gate:perf` enforces every budget it can measure honestly, but the 16.6 ms frame line is
wall-clock GPU time and this project has never once been measured on a GPU: the build
container and the CI runner both fall back to SwiftShader, a CPU rasteriser, where this
scene's GPU timer reports ~135 ms per frame for 20 draw calls.
`docs/PERF_BUDGET.md` §Real-GPU verification says that verification is a human step and
that its record lives here. This is that record.

| UTC date | commit | grade | machine / GPU | viewport | tier | `frameCostMs.p95` | verdict |
|---|---|---|---|---|---|---|---|
| 2026-10-10 | `c429d4a` | sighting | owner's machine, Chrome on Windows; GPU model not recorded | ~1365×610 browser window | auto-detected, not recorded | ~60 FPS sustained | PASS (ceiling only) |
| 2026-10-12 | `3ab6e84` | sighting | owner's machine, Chrome on Windows; GPU model not recorded | ~1919×943 browser window (from the owner's screenshot) | default, `medium-equivalent` | ~60 FPS sustained | PASS (ceiling only) |
| 2026-10-13 | `def6526` | sighting (meshgen) | owner's machine, Chrome on Windows; GPU model not recorded | ~1919×1030 browser window | default | not shown on `dragon.html` | PASS — see the M3 sighting note |
| 2026-10-13 | `6b06392` | sighting | owner's machine, Chrome on Windows; GPU model not recorded | ~1919×943 browser window (owner's screenshot) | default (Medium-equivalent), shadows on | ~60 FPS on the HUD; DRAWS 28, TRIS 174 012, so the 220 wind-swayed trees are loaded | PASS (ceiling only) |
| 2026-10-13 | `6b06392` | sighting | same machine and window | ~1919×943 | `?tier=potato` (shadows off) | ~60 FPS on the HUD; DRAWS 20, TRIS 142 800 | PASS (ceiling only), the first real-hardware Potato reading |

**What that row does and does not establish.** The owner opened
`https://vtpqui3009.github.io/dragonvein/` and read the overlay: build `v0.0.1+c429d4a`,
**FPS 60, DRAWS 21, TRIS 32568**. Draw calls and triangles are hardware-independent and sit
far inside the 180 / 900 000 budgets. Sustained 60 FPS on a vsync-locked display means no
frame in that window exceeded ~16.6 ms, so the budget is met as a ceiling — but FPS is not a
percentile, and nothing here measures the tail. It is a `sighting`, not a `verification`,
per `docs/PERF_BUDGET.md` §Two grades of evidence.

It is also the first time any human has seen this build run, which is what `CLAUDE.md` §7
requires before a milestone may be marked `DONE`.

**The M3 sighting, 2026-10-13 — `§7` is satisfied for M3.** The owner opened
`https://vtpqui3009.github.io/dragonvein/dragon.html` in Chrome on Windows and sent a
screenshot. Eight dragons rendered, labelled and lit, with the page footer reading
**"runtime dragons, built in a worker · 8 in 56 ms after a 313 ms warm-up · 62690 tris"**.

What that establishes, beyond the §7 requirement:

- **The breeding chain is real and visible in the mesh.** A–F are wild gen 0, one per element
  (ember, tide, stone, gale, jade, umbra). **G is `child of A × B`, ember/tide, gen 1**, and
  **H is `child of G × C`, stone/ember, gen 2** — a grandchild. Two generations of descent
  built from genomes in a worker on the owner's own machine, which is the project's hook
  doing the thing the hook claims.
- **Meshgen on real hardware: 8 dragons in 56 ms, about 7 ms each**, against `CLAUDE.md` §2.3's
  120 ms per dragon. `gate:meshgen` measures 27.3 ms in the SwiftShader container, so real
  hardware is roughly 4× faster than the gate's figure, and the gate is the conservative one.
  The 313 ms warm-up is one-off and is not per-dragon cost.
- 62 690 triangles for eight dragons at once, against the 900 000 scene budget.

**What it does not establish.** `dragon.html` shows no FPS overlay, so this row carries no
frame-cost evidence and does not touch P1. It is a `sighting` of meshgen and of the hook, not
a `verification` of anything. The verification-grade real-GPU row is still open.

**What the owner saw that the art-critic has been saying for three milestones.** In the
screenshot every one of the eight carries the same upright flat triangular sail where
`docs/concept/` shows spread bat wings, and the eight silhouettes differ far less than the
eight hues do. That is `NEXT.md` §The reference dragon's design, now confirmed by a human at
full size rather than inferred from a variant sheet. It is recorded here as owner-seen.

**Second row, 2026-10-12.** The owner opened the deployed page at HEAD and sent a screenshot
of the overlay: build `v0.0.1+3ab6e84`, **FPS 60, DRAWS 27, TRIS 42268**. Draws and triangles
match `gate:perf` exactly, so the deployed build is the measured build. That covers every
M0 and M1 change, including the orbit camera (M0f) and the HUD reflow (M0e). It is a
`sighting`: a ceiling at vsync with no percentile and no Potato row. A full `verification`
is now possible with `npm run gate:perf -- --real-gpu` (`bc5a56e`), which did not exist
before this date.

The procedure for a full verification is four steps in `docs/PERF_BUDGET.md`
§Real-GPU verification. `docs/ROADMAP.md` M16 accepts verifications only.

---

## 2026-10-10 — decision — rubric lines with no subject

Run 3 found that M0 could not close under `docs/RUBRIC.md` as written: lines whose subject
does not exist until a later milestone took the gameplay-critic's ceiling to 6.8 and the
perf-critic's to 7.9, below the 8.0 bar. The three critics each worked around it in a
different direction, so their scores stopped being comparable. The run did not edit the
rubric — `CLAUDE.md` §7 — and raised it here instead. Correct on both counts.

**Ruled: option 1, the run's own recommendation.** A line whose subject is absent from the
build under test is scored `n/a` — out of the denominator, never 0, never blocking. This is
the same remedy P1 got, for the same defect: the rubric was measuring things that were not
there yet. Nothing being measured has changed. Budgets, thresholds and the 8.0 bar are
untouched.

Two guards, because `n/a` is otherwise a loophole:

- `n/a` means the subject is **absent**, not unfinished. A variant sheet that exists and
  reads badly scores and can block; no generator at all is `n/a`.
- `docs/ROADMAP.md` now carries a table naming the milestone each line goes live. A line may
  be `n/a` before that milestone and never at or after it.

**Also fixed: P4 asked for something no browser can report.** "GC pauses < 2 ms" has no web
API behind it. P4 now reads "no frame-loop allocation; heap churn within the per-frame byte
budget", which is the figure the gate already measures. Another line I wrote that could not
be satisfied by any amount of correct work.

**P6 is live from M0, not M6.** The perf-critic is right that a 1280×720 pass with shadows
and post off needs only the constants `gate:perf` already has. The roadmap table records it.

### What this leaves on M0

Under this ruling the instrument problems are gone and **art at 6.1 is the single genuine
blocker** — real build work, all of it measured with pointers in `FINDINGS.md`: no contact
shadow anywhere (3369 grass pixels under fourteen objects, zero darkening, which falsifies
AC8's own claim), no warm rim reaching the canopy, nine islands and ~60 trees from one
prefab each varying only by scale and rotation, bare satellites with no ambient motion, and
an off-bible haze band over ~20% of the frame.

That list is the right outcome: the scores now point at the frame instead of at the ruler.

---

## 2026-10-10 — decisions — the three M0 blockers, resolved

The owner opened the deployed build (recorded above) and delegated the two judgement calls:
"về câu hỏi 2 với 3, hãy làm theo cách bạn nghĩ nó tốt nhất."

### 1. Human has seen it run — CLOSED

See the sighting row above. `CLAUDE.md` §7 is satisfied for M0.

### 2. Main-thread budget: p50 or p95 — RULED, in that order of preference

The perf-critic's objection is upheld in principle: after the change to p50, no p95 was
enforced on any machine this project has run on, and a tail you never look at is a tail you
never fix. The measurement behind the change is not in dispute and the budget number never
moved.

But the builder's evidence is real too. Across two machines on identical bytes, the
main-thread p50 moved +29% (0.7 → 0.9 ms) while its p95 moved +106% (1.8 → 3.7 ms), and the
GPU timer doubled (117 → 237 ms). A p95 that tracks how busy the *rasteriser* threads are is
measuring contention, not main-thread work, and SwiftShader does not rasterise on the main
thread.

So: take the perf-critic's fix if it can be built, and fall back if it cannot.

1. **Preferred.** Cap SwiftShader's rasteriser threads so the main thread stops competing
   with them, then hold the p95 to the same unchanged 3.5 ms on every machine. Verify the
   cap actually took effect — do not assume a flag worked because Chromium accepted it.
   Evidence that it worked: the main-thread p95/p50 ratio should fall towards the real-GPU
   case, and the gap between the two machines above should narrow.
2. **Fallback, only if no such cap is reachable.** Keep p50 on software renderers, hold p95
   on real GPUs, and write into `docs/PERF_BUDGET.md` exactly which flags were tried, what
   each one did, and why the cap could not be made to stick. A fallback with no record of
   the attempt reads as a shortcut later, even when it was not one.

Either way `tests/spine.test.ts` keeps failing if 16.6 / 180 / 900 000 move.

### 3. P1 was unreachable by construction — FIXED in the rubric

`docs/RUBRIC.md` P1 was written as "p95 frame ≤ 16.6 ms, blocking" while every machine this
project can reach rasterises through SwiftShader, where no scene meets that number. The
perf-critic was therefore capped at 5.9 in perpetuity and M0 could never close. That was a
defect in the rubric, authored in this repository's first commit, not a defect in the
renderer or in any build session's work.

P1 now has two halves: a continuous, blocking measurement on whatever renderer is present
(must exist, must reproduce, must sit inside that renderer class's recorded budget, with
draw calls and triangles always held to 180 / 900 000), and a periodic real-hardware entry
in the verification log above. `docs/PERF_BUDGET.md` defines the two grades of evidence.
M16 still accepts verifications only.

`CLAUDE.md` §7 forbids rewriting `RUBRIC.md` to match what was built, so this was put to the
owner rather than done quietly. The change is to make a budget *measurable*, not to lower
it. The three numbers are untouched.

### What this leaves

M0 is one re-criticise away from `DONE`: implement decision 2, re-run the three critics on a
frozen tree, and score P1 against its corrected definition. Rework cycles 2 and 3 are spent,
so under `CLAUDE.md` §3.6 this is a new run's cycle 1.

---

