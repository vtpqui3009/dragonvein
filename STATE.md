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

## 2026-10-17 · run 35 · M8b — took the step over from run 34; the keeper could not walk

**Step**: `M8b`, still the first step in reading order that is not `DONE`. **The acceptance
criteria are run 33's, below, unchanged.** This run does not rewrite them either.

**Why this run exists.** Run 34 ran from the owner's Windows machine and delegated its
perf-heavy fixing to a cloud agent on `wip/m8b-r34`. That branch's head `3fc0cf7` was pushed
at 03:19 UTC and had not moved in ten hours, which is the condition `NEXT.md` names: "if
`wip/m8b-r34` stops moving for hours, run 34 died. Take M8b from the head of that branch."
No other DRAGONVEIN session was running. This run starts from `3fc0cf7`, not from `main` and
not from scratch, and works on `wip/m8b-r35`.

**Step 0's push worked** (`cfbe02f`), so the credential path is sound. The marker is removed
by this commit.

### What run 34's unverified fixes turned out to be worth

`3fc0cf7`'s own message says "partial smoke and heap fixes, unit-tested only — gate:smoke and
gate:perf not yet run". This container is Linux, so the rasteriser cap works and both gates
could finally be run on that code rather than inferred. Both of run 34's claims check out:

- **The heap defect is fixed.** `gate:perf` passes at **32 821 B/frame against 40 960**, down
  from the 44 784 CI measured on `0846a99` (CI run 38993748999). The gate change on that
  branch does not touch the budget — it *tightens* the measurement, by refusing to report a
  reading unless `__dragonveinStats().wild` shows the dragon and the keeper really were in the
  scene. `artifacts/perf.json` records `wild: {"dragon":true,"keeper":true}`, so this is a
  budget met with the dragon present, not a budget met by measuring an empty island.
  `cpuFrameMs` p95 is 1.4 ms against 3.5 including the sim step; 21 draws against 180;
  meshgen worker max 49 ms against 120.
  - **Carried hazard:** `uncorrectedBytesPerFrame` is **41 013**, still a hair over the 40 960
    line. The gate scores the corrected figure, and the correction is justified in
    `perf.json`'s own note, but the uncorrected number no longer has headroom either.
- **The M8a save regression is gone.** Every save drill passes, stale-tab start-fresh
  included, with 0 page errors across all five save drill groups.

**So the seven cap-independent gates, `gate:meshgen` and `gate:perf` are all green on
`3fc0cf7`.** One gate fails: `gate:smoke`.

### The real defect behind "no open approach to the dragon to stage the keeper on"

All four wild drills and the M8b clip fail with that one message, and the "5 page errors" the
previous handoff reported are those same five failures, not five separate faults. Measured in
this container, not reasoned about:

1. **`__dragonveinWild.stage(dist)` returns null at every distance tried** — 3, 3.5, 4, 4.5,
   5, 5.36, 5.5, 6, 6.323, 6.5, 7 — including 5.36, which is where the keeper is *already
   standing* at boot. So the failure is not "the drill asked for too much room".
2. **It is not a NaN or a degenerate obstacle.** Instrumented, the deck holds **97 obstacle
   circles, all finite**, radii 0.27–0.87, on a disc of radius 5.6 (area ≈ 98 units²; the
   circles cover roughly half of it).
3. **`stage` looks for a straight open corridor, and this island has none.** Of 72 bearings at
   `notice + 2.2` = 6.32, 22 land inside the deck, and the **best corridor clearance over all
   of them is −0.14** against the function's own bar of +0.25. At dist 3, 70 bearings are in
   the deck and the best is **0.236** — still under the bar. There is no straight lane of that
   length on a dressed island, and there never was.
4. **The reason that matters is in the sim, not the drill.** `stepKeeper` has no pathfinding:
   it steps straight at the goal, lets `pushOut` slide it off obstacles, and when the slide
   stops making progress (`progress < 0.15 * want`) it **clears the goal and stands still**.
   A straight-ish lane is therefore exactly what the keeper needs, because a straight-ish lane
   is all it can walk.
5. **So the headline interaction of criterion 4 barely works.** Walking the keeper from its
   boot position to **40 deterministic deck targets, 2 arrived and 38 did not** — many without
   moving at all, because the first tick already registered no progress and cancelled the goal.
   Tap-to-move works on **5 %** of taps.

**The ruling, against CLAUDE.md §2.7.** The drill is not what is wrong, so the drill is not
what gets changed. A player tapping the island gets nowhere 95 % of the time; run 33's
criterion 6 ("it must not leave the island or get stuck") is failed by the keeper, and
criterion 4's tap-to-move is failed outright. **The keeper needs real navigation.** `stage`'s
straight-corridor search then stops being the right question too, but it is a consequence of
the fix, not the object of it: the drill's assertions about the approach — alert, wary, flee,
settle, calm rising monotonically while still — stay exactly as run 33 wrote them.

### What this run adds to run 33's criteria

Run 33's six criteria stand unchanged and are the bar. This run adds one, because the defect
above was invisible to all of them:

7. **The keeper goes where it is told.** Over a fixed, seeded set of at least 40 deck targets
   reachable on an open deck, the keeper arrives at **≥ 95 %** of them (within 0.45 units),
   and at **0 %** of targets inside an obstacle or off the deck, where it must instead stop
   clear and not jitter. Asserted by a test in `tests/`, and drilled in `gate:smoke` through
   real pointer events for a sample of them. The navigation is deterministic and lives in
   `src/sim/`, so `check:determinism` and `check:layers` still pass, and it must not cost the
   heap budget: `gate:perf` stays under 40 960 B/frame with the dragon present.

**Ownership**: `src/sim/wild.ts` (the navigation), `src/main.ts` (the `stage` hook),
`tools/playtest.mjs` (the drills) and `tests/`. Cross-directory, so **one sequential owner:
the integrator**, per CLAUDE.md §3.3.

### Integrator notes — what the fix turned out to require, and one contract change

`npm run gates` **exits 0** on `wip/m8b-r35` at `dc0df6c`, in this container: heap **40 084
B/frame** against 40 960 with `wild: {"dragon":true,"keeper":true}`, `cpuFrameMs` **p50 0.9 /
p95 1.6 ms** against 3.5, **21** draw calls against 180, meshgen worker **max 88.3 ms**
against 120, bundle 250.81 kB gzipped, 1 514 tests, and `gate:smoke` **0 page errors** with
all five wild drills, the four shots, the tap drill (8/8) and `m8b-approach.webm` (32.8 s).
A standalone `gate:perf` with the cap verified read **40 024 B/frame** and p95 1.6 ms
enforced. Seven commits: `0a60581`, `c124f8d`, `c7d3956`, `1ee72fb`, `fb7cc9a`, `9ff2c1b`
(the `docs/ARCHITECTURE.md` row), `dc0df6c` (a `gate:meshgen` probe race, below).

**The diagnosis above was right about the sim and incomplete about the deck.** `stepKeeper`
had no pathfinding, and it now walks a flow field (`src/sim/wild.ts` §the keeper's
navigation). But the reason `stage` found no corridor was underneath that: **the `Deck` the
page derived handed the sim each prop's scatter *reservation* rather than what a body meets.**
A trunk's reservation is "about the crown's half-width, so crowns may touch but trunks never
crowd"; a crystal shard's was its half-width × 1.45, where the shard itself is an octahedron
of radius 0.3 × scale. Measured: 97 circles summing to **94 % of the deck's area, 16 % of it
standable, in 54 disconnected pockets**, with the dragon's home spot and the keeper's gate
both inside an obstacle. No navigation can cross that, and criterion 7 is unreachable on it.
With each kind's real footprint below the keeper's height (read off its own GLB), the glade's
middle kept clear and the gate moved to a spot with a route out: coverage **37 %**, 45 % of
the deck standable, **97 % of that in one piece**.

The dragon was the other half of it: its footprint is 1.36 across, its largest standable
pocket on the dressed island was **1.4 m²**, and it could not take a step — so no run had
ever seen it wander. `artifacts/shots/17-wild-wander.png` is the first one drawn.

**Criterion 7, measured.** `tests/wild-nav.test.ts`, over the hero island's own deck frozen
as `tests/fixtures/hero-deck.json`: **46 of 47 reachable targets of a seeded 48 arrived
within 0.45 (97.9 %)**, worst miss 0.41, and **0 of 16** targets inside an obstacle or off
the deck, where it stops clear and does not move at all for 60 further ticks. Reachability is
decided by the test's own flood fill on a grid twice as fine as the navigation's. The one
miss is a target 0.61 from the dragon, where the dragon's body is in the way and the keeper
waits. `gate:smoke` drills eight tapped targets through real clicks: **8 of 8, every one
0.000 from the mark**, a tap answered in 3.0 ms.

**Contract change, `docs/ARCHITECTURE.md` §Ownership table, `src/sim/wild.ts` row** (same
commit as this note): the `Deck`'s obstacle circles are documented as what a body *collides
with*, not what the scatter reserved, and **the keeper's route is derived, never saved** — a
pure function of the `Deck` and `keeper.goal`, so `World` and the schema do not grow for it
and schema 2 stands. A world saved mid-walk resumes bit-identically, asserted at four
different ticks.

**Drill changes, in their own commit (`fb7cc9a`), with no assertion about the approach
touched.** Gestures are dispatched as one burst instead of one awaited CDP call at a time:
in this container a press with three 1-pixel moves arrived with `pointerdown` and `pointerup`
**5.1 s apart**, and a double tap's two taps **2.1 s apart**, so TAP_MS (450 ms) and
DOUBLE_TAP_MS (380 ms) were right to refuse them and what was being measured was the
harness. An approach aims through the new `approach(gap)` hook at a spot the keeper can reach
rather than at a point on the straight line to the dragon, which on a dressed island is often
inside a trunk.

**Carried hazards for the next run.** (1) `uncorrectedBytesPerFrame` is **46 150**, over the
40 960 line; the gate scores the corrected 40 024, which leaves **936 B of headroom**. The
churn rose from 32 821 because both bodies now actually animate — the dragon's walk, flight
and attitude paths had never run on this island. Anything that buys it back is in
`src/render/`, which this run does not own. (2) The rasteriser cap failed to verify on two
`gate:perf` runs of three ("1 of 59 threads are not inside their intended cpu set"), which
silently demotes the p95 enforcement to p50 — the reading itself did not move (p95 1.6 ms
either way), but a gate that quietly measures less when the machine is busy is worth a look.
(2b) `gate:meshgen` had the same kind of race and is fixed in `dc0df6c`: the game page builds
its own wild dragon through the probe's worker, so a post could land inside the window and
the gate failed with "saw 33 build posts for 32 builds" on one run of three. It now waits for
`__dragonveinStats().wild.dragon` before opening the window; the post-for-build check is
unchanged. (3)
`tests/fixtures/hero-deck.json` is a snapshot: re-dump it with `__dragonveinWild.deck()` if
the island is re-dressed, and `gate:smoke`'s tap drill is what catches a stale one.

### What shipped

`npm run gates` exits 0 at `f243058`, verified by two independent full runs in this container.
Seven commits of code and gate work, all pushed.

| | before | after |
|---|---|---|
| seeded taps that reach their target | **2 of 40 (5 %)** | **46/47 reachable of 48 (97.9 %)**; 48/48 open deck; 8/8 real mouse clicks in `gate:smoke`, each 0.000 from the mark |
| heap B/frame (budget 40 960, unchanged) | 44 784 (CI, run 34) | **33 947**, with `wild:{"dragon":true,"keeper":true}` |
| `gate:smoke` wild drills | all 4 failed, 6 page errors | **all pass, 0 page errors** |
| deck standable area | 16 %, 54 disconnected pockets | **63 % obstacle-free, 97 % of the walkable deck in one piece** |
| flights that move the dragon | 0 (all ten drawn spots discarded) | 30 over 3 seeds, hops 1.55–9.53 |

1. **Keeper navigation** (`src/sim/wild.ts`). A flow field over a 0.05-unit grid, masked once
   per deck, BFS from the goal once per goal, with line-of-sight shortcutting so the grid
   staircase becomes straight runs. Allocated once at module load; a tick allocates nothing.
   **Derived, never saved** — a pure function of the `Deck` and `keeper.goal`, so schema 2 did
   not move and a world saved mid-walk resumes bit-identically, asserted at four ticks.
2. **The deck was the other half of the defect, and the larger half.** The `Deck` handed to the
   sim carried each prop's *scatter reservation* rather than its collision footprint: 97 circles
   over **94 % of the deck's area, 16 % standable, 54 disconnected pockets**, with the dragon's
   home and the keeper's gate *inside* obstacles. `SOLID_R` is now measured per kind off each
   committed GLB below the keeper's height. The glade's middle is kept open (`GLADE_OPEN`)
   because the dragon's 1.36-wide footprint had a largest pocket of 1.4 m² and literally could
   not step — `17-wild-wander.png` is the first wander ever drawn.
3. **`stage()` asks an answerable question.** It had searched for a straight open corridor; the
   best clearance over 72 bearings was **−0.14** against its own +0.25 bar, because no dressed
   island has one. It now asks for a standing spot at the asked distance ±0.45 with a route to
   the dragon and the longest open lane available.
4. **Flights land somewhere** — `startFlee` had discarded all ten drawn spots, so the dragon
   "flew" from (1.40, 2.50) to (1.40, 2.50). Drawn spots are snapped with the existing
   `nearestClear`, so the Rng stream is unchanged.
5. **Framing, and an evidence-integrity fix.** Shot cameras are derived from the dragon's own
   bounding sphere, not from deck points padded by a flat 2.6 units (the pad *was* the subject);
   dragon 280 → 533 px, keeper 15 → 89 px, clip 100 → 478 px. An evaluate round trip here costs
   ~1 s, so with the sim running captures landed **after** the state they claimed: cycle 1's
   `20-wild-flee.png` was captured as `settle` with altitude 0.000 (the dragon had landed) and
   `21-wild-wary.png` as `alert`. `hold(true)` now zeroes the pose dt too, and a shot fails if
   its captured state differs from the state the drill waited for.
6. **Three new `gate:smoke` assertions, all tightening**: a wild shot fails if the dragon's
   sphere is not wholly inside the frame and clear of the HUD; if the captured state is not the
   awaited one; or if no island turn within ±23° clears all three keeper sight-rays.
7. **Two gate fixes, each in its own commit per §2.7, neither relaxing anything.**
   `gate:meshgen` now waits for the page's own wild dragon before opening its probe window — it
   had been counting that build as a 33rd post for 32 builds and failing on one run in three
   with the budget met at 41.7 ms of 120; the exact post-for-build check and every budget are
   unchanged. `gate:perf`'s heap comment and `perf.json` `note` now describe the subtraction the
   code actually makes (`min(perSecond, perCallback, risingBytes)`) instead of naming only
   `idleBytesPerSecond`; no budget, threshold or computation moved.

### Criteria: five of six met, plus the new seventh

Run 33's criteria 1–5 and run 35's criterion 7 are met — temperament monotone and spread, the
full state sequence deterministic and save/resume-exact, schema 2 with its migration and a
frozen `save-v2.json`, shots 17–21 and a 33.7 s clip, every budget green, and the keeper
arriving at 97.9 %. **Criterion 6 is not met**, and that is why M8b stays `IN_PROGRESS`.

**Criterion 6 requires "no blocking or major defect" and that "the reaction must read without
the indicator".** Measured through `__dragonveinWild.screen()` at the camera the player actually
has: the dragon is **97 px** wide and the keeper **21 px** (default view, distance 18.3; 103 px
and 22 px wheel-zoomed to the minimum). The posture tells — head up on alert, `lower` 0.289 on
wary against 0.063 on wander, tail turned away — do not read at that size. Cycle 2's shots read
well only because they are framed from 3.3–4.5 units, which `ORBIT_LIMITS` (15–32) does not
allow. **Two critics measured this independently**: gameplay's D1, and art's A9, "valid evidence
of the tells, but it is not a framing a player gets". gameplay's D2 adds that dragon and keeper
are both occluded behind trees and crystals, with no through-geometry marker for the keeper.

This was cycle 2's own doing, and worth recording as a lesson: cycle 1's defect was that the
artefacts did not show their subject, and framing them close proved the tells exist while moving
the evidence away from play. **Fixing the artefact is not the same as fixing the game.**

### The scores, and why perf cannot reach 8.0 here

| cycle | commit | art | perf | gameplay |
|---|---|---|---|---|
| 1 | `2901002` | 7.4 | 7.5 | 8.6 |
| 2 | `f243058` | **8.1** | **7.3** | **8.4** |

**perf fell on a strictly better build, and 1.8 of its lost points are not reachable by any
run.** P1 and P6 both want a real-hardware row, and there is no GPU in CI or in any build
container — SwiftShader only. The newest row is a *sighting* at `6b06392`, 2026-10-13, which
predates M8 and the first skinned animated dragon. Until the owner produces one, perf is capped
near 8.2 whatever the code does. Per `.claude/skills/critic-round` §4, re-scoring an unchanged
tree for a standing deduction is score-fishing, so this run did not attempt a third cycle at it.
Two of perf's three majors are answered with numbers in `FINDINGS.md`: the meshgen 684.5 ms is
`glStallMs` 641.9 of SwiftShader `getProgramInfoLog` with `roundTripHeldMaxMs` 42.6 of 120, and
unstable across runs (2 stalls then 0); and the heap "2.6 % margin" was mostly noise — three
runs on identical per-frame code read 39 899, 37 233 and 33 947.

**The heap was profiled rather than argued about.** `HeapProfiler.startSampling` with
`includeObjectsCollectedByMinorGC`/`MajorGC` reports 41 272 B/frame, agreeing with the gate. The
bytes are V8 boxing doubles inside `three`'s math — `Quaternion.get x`/`get z`/`get w` show
self-size — not object literals in this project's code. Every per-frame path named in the brief
was read and is already allocation-free by construction, so there is nothing left to reuse;
`docs/PERF_BUDGET.md` names draw calls as the lever. No per-frame code was changed for it.

### Decisions this run made, and the one it refused to make

- **The drill was not what was wrong, so the drill was not what changed** (§2.7). The straight-
  corridor search was failing because the keeper could only walk a straight-ish lane; the fix
  went into the navigation, and every drill assertion about the approach is still run 33's.
- **The resting wing spread was left alone.** Two critics read the wings as upright sails or
  flat sheets on a grounded dragon. Measured: each wing reaches 4.094 mesh units to the side and
  0.687 up (5.9 : 1, ~9.5° above horizontal), and `DragonFlight.pose(0,0,0)` moves **0 of 36
  bones**, so the renderer is not posing it — this is the mesh as built, and
  `tests/dragon-wings.test.ts` asserts exactly it for all 40 genomes as **M3e criterion 2**,
  with `gate:parity` holding Blender to the same graph. The build matches the target; whether
  the target is right is a §7 question for the owner, carried in `NEXT.md`. A run will not
  hand-tune a furl blind: the clearance cases make a wing-through-body **blocking** defect the
  likely result, which is worse than the minor it would fix.
- **Criterion 6's fix was left to the owner, and this is why the run stops here** (§3.1). The
  three ways out trade against each other and one is a decision the owner made today: amplify
  the tells so posture reads at 97 px (the only option that satisfies criterion 6 as written,
  but it carries the same wing-clearance hazard); add diorama-scale cues (cheap, and D2's keeper
  marker is worth doing regardless, but criterion 6 says the reaction must read *without* the
  indicator); or revisit the camera, which `docs/DECISIONS.md` §"The camera stays a diorama"
  settled today as keep. Guessing costs a cycle on the wrong one.
- **Recorded, relayed not witnessed:** the owner's camera decision reached this run through
  another Claude session, and is written into `docs/DECISIONS.md` §"The camera stays a diorama"
  with that provenance stated. Both code claims it rests on were verified first — `ORBIT_LIMITS`
  holds distance 15–32, pitch 6–22°, azimuth −15 to 105°, and run 33's criteria do say the
  camera keeps orbiting as it does today.

### Open blockers

1. **M8b criterion 6** — the owner's choice of option 1, 2 or 3 in `NEXT.md`.
2. **A real-hardware perf row** — owner-only, and it caps perf below 8.0 every cycle until it
   exists.
3. **The resting-wing target question** — owner-only, §7.

M8 the milestone stays `IN_PROGRESS` regardless: M8c and M8d are both `TODO`.

**Run 33's entry below is deliberately kept in this file, against the two-entry rule in
`.claude/skills/run-closeout`**: it holds M8b's live acceptance criteria, which `NEXT.md` cites
and the next run needs. The skill keeps entries that are cited by name for the same reason it
keeps `decision` entries. It moves to the archive when M8b closes.

---

## 2026-10-17 · run 34 · M8b — resumed from run 33's snapshot, gated on CI

**Step**: `M8b`, still the first step in reading order that is not `DONE`. **The acceptance
criteria are run 33's, below, unchanged.** Run 34 does not rewrite them.

**Where run 33 stopped.** It hit the usage limit at 14:42 UTC. Its last push was
`origin/wip/m8b` at `e6126e2`, "snapshot at usage limit — gates not yet run": 16 files and
about 3 100 lines on top of `ce9fe29`, covering `src/sim/wild.ts`, `src/render/wild*.ts`,
schema 2 with `save-v2.json`, and the playtest shots. Run 34 starts from that snapshot.

**This run is local, on the owner's Windows machine** (`docs/OPERATIONS.md` §Running a build
from your own machine). Two things about that machine, both measured:

- **Line endings.** The clone had `core.autocrlf=true`, which writes 163 sources to disk as
  CRLF. Three hash-pinned tests then fail on `genome.py`'s sha (`rng`, `genome`,
  `dragon-graph`). The fix was `core.autocrlf=false` in this clone only, with the working
  files put back to LF. The index was LF throughout, so no commit carries a change from this.
- **`gate:meshgen` and `gate:perf` cannot be passed honestly here.** Both rely on
  `tools/rasteriser-cap.mjs`, which needs Linux `sched_setaffinity`. On win32, clean `main`
  (`80e88a6`) fails `gate:meshgen` with a worker max of 1 252 ms and then 1 062 ms; the CI
  runner measures 52 ms on the same code.

**Owner decision, 2026-10-17: CI is the gate runner for local runs.** Asked, with the
options shown, and answered "use CI as gate runner". The procedure:

1. The cap-independent gates run locally first: tsc, eslint, vitest, layers, determinism,
   assets, parity.
2. Each candidate is pushed to a `wip/` branch, and `.github/workflows/ci.yml` is dispatched
   on it. That workflow runs `npm run gates` unchanged on `ubuntu-latest`, with the cap
   verified, which is the environment `CLAUDE.md` §2.2 sets the budget on.
3. The critics score that run's uploaded `artifacts/`.

No gate, budget or threshold changes.

**Owner instruction, 2026-10-17: perf-heavy work goes to a cloud session.** "If my computer is
too slow to process performance tasks, note and delegate it to Claude Code in the cloud."

- **Where M8b stands.** The first CI gate pass on `wip/m8b-r34` (run 38993748999) failed
  `gate:perf` on heap churn: **44 784 B/frame against 40 960**. Every gate before it was green,
  and `gate:meshgen` measured a worker max of 56 ms with the cap verified.
- **Local `gate:smoke` fails functionally.** Every wild drill reports "no open approach to the
  dragon to stage the keeper on". There are 6 page errors, and the M8a stale-tab start-fresh
  drill regressed.
- **What happened to the local fix.** A local integrator started on both defects and was
  stopped. Its partial edits are pushed as `3fc0cf7` on `wip/m8b-r34`; they are unit-tested
  only.
- **What happens next.** The rest of the M8b fix, smoke and heap together, goes to one remote
  agent as the single sequential owner. Critics and close-out stay in the local session.

---

## 2026-10-16 · run 33 · M8b — approach and calm: a wild dragon reacts to the player

**Step**: `M8b`, the first step in reading order that is not `DONE`. M7 and M5 wait only on
the owner's look. The marker commit precedes this one.

**What exists.** No dragon is drawn in the game scene yet; the HUD counts a roster nobody
sees. `src/sim/` holds the world and the save, but `step` only advances `tick`. The dragon
runtime exists in `dragon.html`: a skinned mesh, idle, walk and flight. GDD: "find a wild
dragon → tame it ← reading its behaviour, not throwing a ball".

**Decisions, made before code.**
- **The player is a small keeper avatar on the hero island.** The player moves it by tapping
  or clicking a spot on the island deck, which works on touch and mouse alike, and the
  keeper walks there. It is deliberately simple and cheap: one draw, plus a soft lantern that
  is emissive only and adds no light. The camera keeps orbiting the island as it does today.
  A bare cursor would not give the dragon a body to react to, so it was not chosen.
- **One wild dragon lives on the hero island.** Its genome comes from the world's `Rng`
  (`wild(seed)`).
  - It is built through the existing worker mesher and drawn with the M7 runtime: idle, then
    walk, then flight when it flees.
  - It is placed on the deck at the deck height, read from a precomputed height grid. No
    per-frame raycast.
- **The reaction is sim state, deterministic in `src/sim/`** (`wild.ts`).
  - The dragon carries a position, a heading, a behaviour state and a `calm` value in [0, 1].
    The states are:
    - **wander or graze**, when the keeper is far;
    - **alert**, when the keeper enters its notice radius: head up, facing the keeper;
    - **wary**, when the keeper is closing: it backs away or circles;
    - **flee**, when the keeper rushes or comes too close: it takes off, lands elsewhere
      on the island, and loses calm;
    - **settle**, when the keeper is near and still: calm rises.
  - Calm rises only while the keeper stands still or moves slowly inside the dragon's
    comfort ring. It decays with distance and time.
  - M8b ends at the reaction and the calm meter. Taming completes in M8c.
- **The genome drives temperament** (CLAUDE.md §0, so the genetics are visible). Temperament
  is a pure function of existing genes, with no new gene: notice radius, flight distance and
  calm rate come from body mass, element, wing span and head size. It is tested to be
  monotone, and two sheet genomes behave measurably differently.
- **The render shows the tells, not a number first.**
  - Alert lifts the head and points it at the keeper.
  - Wary lowers the stance and turns the tail toward the keeper.
  - Flee is the M7c flap.
  - Settle eases back into the idle.
  - A small calm indicator near the dragon may supplement the tells but must not replace
    them.
- **The save** gains the wild dragon and the keeper's position, so this is **schema 2**. It
  gets the first real migration, 1 → 2, appended to the chain. `tests/fixtures/save-v1.json`
  must still load, migrated, and a new frozen `save-v2.json` is added.

**Ownership**: `src/sim/` (wild.ts, world, migrate), `src/assets/dragon/` (only if a
temperament helper belongs there), `src/render/` (dragon in scene, keeper, tells),
`src/main.ts` (input, wiring), `tools/` and `tests/`. Cross-directory, so one sequential
owner: the integrator.

### Acceptance criteria

1. **Temperament from genes.** `temperament(genome)` is pure and deterministic, and
   `tests/wild.test.ts` proves it monotone and bounded in the genes it names. Across the
   8 sheet genomes the notice radius and calm rate each spread by ≥ 30 %.
2. **Deterministic reaction.** A scripted keeper path stepped through `src/sim/` produces the
   expected state sequence, and the same seed and path produce identical worlds:
   - far → wander;
   - approach → alert → wary;
   - rush → flee;
   - slow approach and stillness → settle, with calm rising monotonically while still.

   The cases are covered by tests, including save mid-sequence and resume. `check:determinism`
   passes, and the sim imports only `core`.
3. **Schema 2 with a real migration.** `MIGRATIONS` gains 1 → 2. `save-v1.json` loads through
   it, its roster intact and a wild dragon added. `save-v2.json` is frozen. A reload
   mid-approach restores the dragon's state, position and calm, asserted in `gate:smoke` in
   real Chromium.
4. **Seen in the game.**
   - New shots:
     - `artifacts/shots/17-wild-wander.png`, the dragon on the island with the keeper far;
     - `18-wild-alert.png`, head up and facing the keeper;
     - `19-wild-settle.png`, the keeper near and still, calm visibly risen;
     - `20-wild-flee.png`, mid-takeoff after a rush.
   - A turntable or clip, `artifacts/turntables/m8b-approach.webm`, covering one approach
     from wander through alert to settle, and one rush to flee.
   - The tap-to-move input works under mouse and `hasTouch`, drilled in `gate:smoke`.
5. **Budgets.**
   - Game-page heap ≤ 40 960 B/frame. It is now 37 874, so this step must pay for the
     dragon. Attribute and cut the skinned-path cost if needed; **never raise the budget**.
   - `cpuFrameMs` p95 < 3.5 ms, including the sim step.
   - Draw calls ≤ 180, and the dragon and keeper add only a handful.
   - meshgen ≤ 120 ms. The wild dragon's mesh is built off the main thread and must not
     delay the first frame.
   - `npm run gates` exits 0.
6. **No blocking or major defect.**
   - The dragon must not float, sink or slide on the deck.
   - It must not interpenetrate the keeper or the flora.
   - It must not leave the island or get stuck.
   - The reaction must read without the indicator: the gameplay critic tries to calm it and
     to spook it, under mouse and touch.

**If this proves too big for one run** (§4b.4), the split is:
- **M8b-1:** the dragon and keeper in the scene, with the sim state machine and the save.
- **M8b-2:** the tells and the temperament tuning.

The run says so in STATE.md rather than half-landing both.

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

- run started 2026-10-18T03:27:15Z
