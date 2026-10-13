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

## 2026-10-13 · run 25 · M3f — the genome drives the body outline

**Step**: `M3f`, the first step in reading order that is not `DONE`. The marker commit
precedes this one.

**The defect.** Art cycle 2 of M3e left one major: the eight share one body plan. The
numbers in `dragon-silhouette.json` at `8e5b5ba`:
- mean pairwise IoU 0.632, range 0.429–0.785, with A–G the most alike;
- area 6.50–7.77, height 3.42–4.18, width 5.21–6.51.

That is about a 20 % spread. `docs/GENOME.md` gives the body genes wide ranges, for example:
- bodyMass 0.70–1.45;
- neckLength 0.60–1.70, with neckArc 0–1;
- legLength 0.70–1.40;
- tailLength 0.60–1.80.

So the question is how weakly `builder.py` turns those genes into outline. GENOME.md is
not rewritten (§7). If a range itself is wrong, it is raised here and the owner is asked.

**Ownership**: one sequential owner, the integrator, across `assetgen/dragon/`,
`src/assets/dragon/` and `tools/`. Never a fan-out.

### Acceptance criteria

1. **Each body gene measurably moves the outline.** `tools/silhouette.mjs` gains a
   one-gene sweep. For each of bodyMass, neckLength, neckArc, legLength, tailLength,
   headSize, hornCount and crestType, it builds a fixed base genome at the gene's low,
   middle and high values and records the mask area, width, height and the IoU against the
   base, in `artifacts/variants/dragon-sweep.json`. Every gene listed must reach
   **IoU ≤ 0.85** between its low and high ends. hornCount and crestType are judged on head
   outline, so they may be measured on a head crop.
2. **The eight separate.** In `dragon-silhouette.json` for the fixed sheet A–H:
   - **mean pairwise IoU ≤ 0.55**, down from 0.632;
   - **the most-alike pair ≤ 0.72**, down from 0.785;
   - **area or height spread (max/min) ≥ 1.35**, up from about 1.20.
3. **The greyscale test.** `dragon-greyscale.png` reads as eight different creatures. It is
   judged by the art critic, with no major or blocking defect on the shared body plan.
4. `gate:parity` is green with the regenerated fixture, `gate:meshgen` is ≤ 120 ms, and
   `npm run gates` exits 0.
5. No blocking or major art defect against the dragon sheet or turntables (§4).

---

## 2026-10-13 · run 24 · M3e DONE (M3 IN_PROGRESS) — wing forms, and the instruments that measure silhouette

**Step**: `M3e`, the first step in reading order that is not `DONE`. The marker commit
precedes this one.

**Split first** (CLAUDE.md §4b.4). M3e as written has three parts:
- a new render tool;
- a wing-form change in two builders that must stay byte-exact under `gate:parity`;
- an open-ended push on neck, mass and horns until eight greyscale silhouettes read as
  eight creatures.

That is more than one run. The seam NEXT.md proposed is the instruments and the wing forms
first, then the silhouette push measured by them:
- **M3e (this run):** the greyscale sheet, the outline numbers, and the three wing forms
  (criteria 1, 4 and 5 of the old M3e, plus the instruments for criteria 2 and 3).
- **M3f:** neck arc, body mass and horn count pushed until the greyscale sheet reads as
  eight creatures (old criteria 2, 3 and 6).

**Owner decision, 2026-10-13 (asked this run).** The wing form is **derived from existing
genes**: `wingFingers` (2–4) and `wingShape` (0–1). It is not a new gene, so
`docs/GENOME.md` is unchanged. The genome layout, every gid and the Rng and genome parity
vectors stay valid, and breeding inherits the form through the two genes.

**Ownership**: one sequential owner, the integrator, across `assetgen/dragon/`,
`src/assets/dragon/` and `tools/` (CLAUDE.md §2.4). Never a fan-out.

### Acceptance criteria

1. **Three wing forms, from the genome.**
   - **sail**: the current single panel.
   - **spread membrane**: a bat wing, spread out from the body, with a scalloped trailing
     edge between the fingers.
   - **segmented**: separate feather-like or finned vanes on the finger chains.

   The form is a pure function of `wingFingers` and `wingShape`. It is written once in
   `assetgen/dragon/builder.py` and mirrored in `src/assets/dragon/graph.ts`, and its rule
   is stated in a comment in both. The 8-seed sheet `artifacts/variants/dragon-full.png`
   (A–H) shows all three forms, and its `.json` lists each dragon's form.
2. **Spread wings.** Every form rests spread outward from the body, not upright, and the far
   wing does not cross the tail or belly in the sheet camera. This is the M3 art defect.
3. **Greyscale sheet.** A tool writes `artifacts/variants/dragon-greyscale.png`: the same
   eight, same cameras, all colour removed (flat albedo, lit), from the built game page. It
   runs inside the existing dragon-sheet tool or alongside it.
4. **Outline numbers.** The same tool writes `artifacts/variants/dragon-silhouette.json`.
   For each of the eight it records the silhouette area, width, height and the IoU against
   every other dragon, measured from a flat-colour mask render. It also records which genes
   differ between each pair. This is the instrument M3f is judged by.
5. **Parity.** `npm run gate:parity` stays green: the skin graphs are exact and the limb
   anchors and box are within tolerance. `gate:meshgen` stays under 120 ms. `npm run gates`
   exits 0.
6. No `blocking` or `major` art defect against the dragon sheet or turntable that points at
   the wings.

---

### Result — M3e DONE; M3 IN_PROGRESS (M3f remains, art 7.9)

All six criteria hold at `8e5b5ba`.

1. **Three wing forms, derived from `wingFingers` and `wingShape`** (owner decision; no new
   gene). The rule is `wing_form` in `builder.py`, mirrored by `wingForm` in `graph.ts`:
   - `wingFingers ≤ 2` gives sail;
   - otherwise `wingShape < 0.5` gives spread;
   - otherwise segmented.

   On the sheet: sail G, spread A/B/E/F, segmented C/D/H. Across the fixed set: 9 sail,
   6 spread, 17 segmented.
2. **A gull-winged rest pose.**
   - The arm rises 8–22° and the hand tips down to −10°.
   - The membrane cambers, and the anchors sit off the tail.
   - Tests check that the far wing is off the tail and belly and that the near wing is off
     the tail in the sheet camera.
3. **`artifacts/variants/dragon-greyscale.png`**, through `?grey=1` in `src/dragon-view.ts`.
4. **`artifacts/variants/dragon-silhouette.json`**, written by `tools/silhouette.mjs` through
   `?mask=1`: area, width, height, IoU over 28 pairs, and the genes that differ.

   | | mean IoU | range |
   |---|---|---|
   | baseline | 0.605 | — |
   | cycle 1 | 0.602 | — |
   | cycle 2 | 0.632 | 0.429–0.785 |

5. **Gates.**
   - Parity exact with the regenerated fixture; worst box gap 2.04 % of 3 %.
   - meshgen worker max 34.7 ms, round trip 38.7 ms.
   - `npm run gates` exits 0, with 1052 tests.
6. **No blocking or major defect points at the wings** (art cycle 2).

**Scores.**

| critic | cycle 1 at `4581db2` | cycle 2 at `8e5b5ba` |
|---|---|---|
| art | 7.8 (major D1: the pair read as one upright wing in the sheet camera) | **7.9** (D1 fixed) |
| perf | 8.5 | carried |
| gameplay | 9.7 | carried |

**Why M3 does not close.** Art is below 8.0. The remaining major is the shared body plan:
area, height and width spread about 20 %, and the torso, tail and head outlines are
interchangeable in greyscale. That is M3f.

**Open, carried to FINDINGS:**
- wing hue clashes with the body, and F's body is near-black;
- the segmented rib fans read as skewers;
- the wings are small and flat-lit;
- the hard `wingShape` threshold (G2 advisory for M9b).

**Blockers.** None for M3f. The owner's open item is the real-GPU verification row
(NEXT.md).

---

## 2026-10-13 · run 23 · M5d — the critic round

**Step**: `M5d`, still the first step in reading order that is not `DONE`. Run 22 landed the
four generators and criteria 1–5; **criterion 6, art ≥ 8.0 per generator, is all that is
left**, so this run is the critic round and the close-out, not a build.

**Ownership**: no builder unless a rework cycle needs one. Then `assetgen/flora/`
(asset-builder), sequential.

**Hand-off hazard, recorded because it cost this run time.** Run 22 was on the owner's
second Pro account, so its session is invisible to this one's `list_sessions`. It pushed
`1cd78f5`, `3bf104e`, `60d1796` and `1a617ef` between 03:01:31 and 03:02:07 UTC — after the
dispatcher had checked the remote at 03:01 and after the `NEXT.md` this run was handed. The
stamp in that `NEXT.md` (`3bf104e`, "run 22 is in flight") was therefore already stale on
arrival. Its own §Current step and `STATE.md` both say the generators are on `main` and the
critics are next, so that is what this run took.

**Git, Step 0.** Local `main` was an unrelated root again (4 commits, root `00927cd`, against
`origin/main`'s `cff41b6`) exactly as §Standing hazards predicts. `merge --ff-only` refused
unrelated histories, and `checkout -B` and `checkout -b` were both refused by the permission
layer. `git checkout origin/main` (detached) worked, as the hazard note says. **New detail
worth the next run's time: `git checkout main` onto that stale root had already swapped the
whole working tree to the pre-M1 project, so `NEXT.md`, `ops/` and `public/` simply vanished
from disk.** Check `git log -1` before trusting any file. The Step 0 push succeeded
(`1a617ef..3812835`) on the second attempt; the first was rejected non-fast-forward because
run 22 pushed `1a617ef` in between, which is a race, not a credential fault.

### Acceptance criteria

1. **Artefacts at the scored commit.** `artifacts/` is git-ignored and arrives empty, so the
   round cannot read run 22's renders. Regenerate at this run's HEAD:
   - `artifacts/variants/{bush,fern,reeds,grassclump}.png` and a turntable each;
   - `artifacts/perf.json`, `artifacts/playtest.log`, `artifacts/shots/` from `npm run gates`.
2. **`npm run gates` exits 0** at the commit the critics score, with HEAD not moving after.
3. **The round is recorded** in `FINDINGS.md` in the `critic-round` format, with a
   `SCORE_MACHINE` line for each of the three critics and an art estimate **per generator**.
4. **Decision.** All three critics ≥ 8.0, every generator ≥ 8.0, gates green and no blocking
   defect → M5d `DONE`. Otherwise the deduction is traced to this step's code, fixed,
   re-gated and re-scored, up to 3 cycles; if it still fails, commit what is green, leave
   M5d `IN_PROGRESS` and record the blocker. No score is stretched to close it.
5. **Closed out** per the `run-closeout` skill: `NEXT.md` rewritten first, this entry given
   its result, the archive rotated, the evidence page republished to the same URL, pushed.

### Result — **superseded: M5d is `DONE`.** This section was written mid-run, before §4 was settled; the final result is below

**Scores.** Cycle 1 at `9e1a2b6`: art 8.3 · perf 8.65 · gameplay 9.7. Cycle 2 at `d1dcabe`:
art 8.0 · perf 8.15 · gameplay 9.7. `npm run gates` exits 0 at both. No blocking defect in
either round. Every criterion 1–5 holds; **criterion 6 does not**, and criteria 1–4 of this
run's own list were met (artefacts regenerated, gates green, both rounds recorded with
`SCORE_MACHINE` lines and per-generator estimates).

**What shipped.** `d1dcabe`, the fern rework. Cycle 1 scored fern 7.7 — below the
per-generator bar — on three majors: fronds were single wide serrated blades so it read as an
agave; eight seeds gave three silhouettes; the croziers were invisible. All three were fixed
in the generator, not by reseeding. A frond is now a stipe, a tapering rachis and discrete
pinnae; a discrete `habit` axis stratified on π−3 gives four architectures at two seeds each
(vase, spread, fountain, bracken-on-a-rhizome); croziers scale off the plant's measured apex
with a per-head tilt. LOD0/1/2 strictly decreasing and inside 4000/1200/300 on every seed,
scanned to seed 64 (worst 3412/1002/256); 0 inward, open and non-manifold edges at every LOD
on every seed; `--verify` reproduces all 57 files byte-for-byte; `treekit.py` untouched, so
the other generators stay byte-identical.

**A real bug found on the way.** The `droop` axis was dead. The old generator straightened any
frond that threatened the ground (`turn *= 0.86`, up to 16 times), which zeroed the arch on
five of eight seeds — run 22 had renamed the axis from `curl` to `droop` after a low probe
score without finding this cause. The rachis turn is now solved by bisection so the tip lands
at the commanded fraction *and* clears the ground. The probe reads 0.045–0.376 where five
seeds read 0.0.

**Why the step did not close.** Criterion 6 is per generator, and the two rounds disagree about
assets that did not change. Between `9e1a2b6` and `d1dcabe` only `fern.py` and the three
`flora/fern.lod*.glb` changed, yet:

| generator | cycle 1 | cycle 2 | delta | file changed? |
|---|---|---|---|---|
| bush | 8.6 | 7.8 | −0.8 | **no — byte-identical** |
| reeds | 8.2 | 8.0 | −0.2 | **no — byte-identical** |
| grassclump | 8.1 | 7.8 | −0.3 | **no — byte-identical** |
| fern | 7.7 | 7.4 | −0.3 | yes, rebuilt |

Roughly **±0.8 of scorer variance on an unchanged artefact**, against a bar the step is being
accepted on. Under cycle 1's numbers three of four generators pass; under cycle 2's, one does.
`docs/RUBRIC.md` has no per-generator line — the per-generator estimate is a prompt-level
request, which is why it is not reproducible. **This is a defect in how the step is measured,
not in the assets**, and it is the blocker handed to the owner in `NEXT.md`.

What this run refused to do, recorded so a later reader can audit it: it did not average the
two cycles, did not adopt cycle 1 because it was kinder, and did not spawn a third art-critic
hoping for a friendlier number. All three are score-fishing (`CLAUDE.md` §4, `critic-round`
§4). It also ran **no cycle 3**, because a third cycle would have to "fix" `bush` and
`grassclump` — files that have not changed since cycle 1 scored them 8.6 and 8.1. There is no
defect in that code; editing it to move a scorer's number is the inverse of the rule.

**Perf was re-run rather than inherited, deliberately.** Run 22's perf-critic scored the same
code tree 8.6 before its session died, and the dispatcher offered that number on the ground
that the code had not moved. It had not — `1a617ef..9e1a2b6` touches `STATE.md` only. But
`artifacts/` is git-ignored, so run 22's `perf.json` never reached this container; it was
measured on another machine under another load and cannot be read or reproduced here. P1
scores a *reproducible measurement*, so the measurement is the artefact, and adopting the
number would have attached a score to a file no critic in this run had seen. Cycle 1's
independent 8.65 landed 0.05 from it, which is corroboration, not proof the re-run was waste.

**A factual error in a critic report, recorded without changing its score.** Cycle 2's
perf-critic scored P1's real-hardware half 0, reading the §Real-GPU verification log as having
"one row only" (2026-10-10, `c429d4a`). The log has **two** rows — line 459 adds a 2026-10-12
`3ab6e84` sighting it did not see — and cycle 1's perf-critic read that newer row and scored
the same half 0.5. That single misread is the entire 0.5 between 8.65 and 8.15. Per
`critic-round` §3 the score stands as given and a builder note was added instead.

**Correction, entered after the fact: the second half of that note was wrong, and the error
was this run's.** Run 23 reported that `3ab6e84` "does not resolve in this repo" and raised it
as an owner blocker. `git log -1 3ab6e84` did return "unknown revision" here, so the
observation was accurate — but the inference was not. **This container's clone is shallow**:
`create_session` defaults `clone_depth` to 50, `git rev-parse --is-shallow-repository`
returned `true`, and `git rev-list --count HEAD` was 60 against the repository's 211. After
`git fetch --unshallow`, `3ab6e84` resolves as `docs(next): the owner's real-GPU command, now
that it can pass`, 2026-10-12 08:13, and `git merge-base --is-ancestor 3ab6e84 origin/main`
confirms it is on main's history. **The row is sound and the owner need do nothing.** Both
perf rounds spent P1 deductions on a defect that did not exist, and this run escalated it
instead of checking the clone. The check is `git rev-parse --is-shallow-repository`, now a
standing hazard in `NEXT.md`. Do not deduct P1 for that row again.

**Forward risk for M5e, now agreed by three independent perf rounds** (run 22's, and this
run's two): heap headroom is about 4 355 B of 40 960 at 28 draws — roughly **two draws** at
PERF_BUDGET's ~1.8 kB per draw — and `uncorrectedBytesPerFrame` is already 45 200, passing
only via the idle-baseline subtraction. Placing the four understory types as separate draws,
or one draw per LOD, will trip the heap gate. Placement must use one `InstancedMesh` per plant
type with LOD inside the instance.

**Open blockers,** as they stood when this entry was first written. (1) and (2) have since
been settled — see the two sub-entries above this one: criterion 6 is now ruled in
`CLAUDE.md` §4 as defects-not-sub-scores, and the `3ab6e84` blocker was this run's own error.
(1) How criterion 6 is measured — **ruled**. (2) The `3ab6e84` real-GPU row — **withdrawn,
not a defect**. (3) No verification-grade real-GPU or Potato row — owner, M16. (4) fern seeds
1/8 and 3/5 near-pairs — **the live one**, and under the new §4 the only thing keeping M5d
open. (5) The evidence page's old
URL (`Pgkt22EifnK5hUzmXqssoj`) is not reachable from this account — `artifact not found` —
so run 23 published to https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a instead. The owner
chooses which link stands; a third must not be created.

**Step 0.** The push proof succeeded, on the second attempt: the first was rejected
non-fast-forward because run 22 pushed `1a617ef` in between, which is a race and not a
credential fault. `1a617ef..3812835`, then rebased and pushed.

### Final result — M5d `DONE` at `3364460`, and M3e unblocked

**Cycle 3: art 8.5 · perf 8.3 · gameplay 9.7**, gates exit 0, no blocking defect, and — the
test that actually decides it — **no `blocking` or `major` defect against any of the four
generators' own variant sheet or turntable**. All four pass. M5d is `DONE`; M5 stays
`IN_PROGRESS` on M5e.

**What unblocked it was a rule, and the rule came from this run's own evidence.** The owner
amended `CLAUDE.md` §4 on the cycle 1 / cycle 2 comparison recorded above: per-asset acceptance
is decided by defects carrying pointers, not by improvised per-generator sub-scores, because
those sub-scores moved up to 0.8 on **byte-identical** assets against a bar at 8.0. §4 also now
requires a critic to state its coverage — that came from this run's builder note on a critic
reading 3 of 14 shots. Both cycle 3 critics duly stated coverage, and the gaps are now visible
in `FINDINGS.md` instead of invisible: art decoded no `.webm` and read 6 of 14 shots; perf read
2 of 14 and no sheets.

Worth being explicit, because a rule change that closes a step invites the suspicion: **the
rule did not lower the bar for M5d.** Fern still had to be fixed twice, and both fixes were
real geometry changes in the generator. What the rule removed was the prospect of reworking
`bush` and `grassclump` — files that never changed — to chase a second scorer's number.

**The fern fix that closed it (`3364460`).** Cycle 2's single `major` was seeds 1/8 reading as
one upright vase and 3/5 as one low fan. Root cause was confirmed before any change, and both
halves were real: the pair members were only 33.3% apart on their most different axis, **and**
the `spread` and `fountain` habits genuinely overlapped at their low end, where a high-`form`
spread and a low-`form` fountain both solved to a ~0.3 m pancake at the same ~4.8 width/height
ratio. The fix is a new discrete `stature` axis (`tuft`/`stand`) on √6−2 — the only constant of
~27 searched whose halves split all four habit pairs of seeds 1–8 with margin — plus habit
envelopes pulled onto disjoint rise bands and absolute length bands. Most-alike pair 26.5% →
**37.5%**, and an independent check in the shape of the critic's own complaint (within 15% on
height *and* width, across all 28 pairs) is clean where both named pairs tripped it before.

**Two corrections this run made to its own earlier work**, recorded rather than quietly dropped:
1. The `3ab6e84` "commit does not exist" blocker was **wrong and withdrawn** — this container's
   clone was shallow (`clone_depth` 50; 60 commits of 211). Cycle 3's perf-critic independently
   read the log as 3 rows, all hashes resolving, `is-shallow-repository` false.
2. Cycle 2's perf-critic misread that same log as having one row; its score stood unchanged
   with a builder note, per `critic-round` §3.

**The live risk handed forward is P4, now a `major`:** the frame loop allocates 35 108 B per
frame, 86% of budget, with a 3 995 kB sawtooth over 18 scavenges. M5e's instance matrices will
spend that headroom, so it wants fixing before placement — by removing per-frame allocation,
never by raising the budget. Also flagged for one look: `shots/05-potato.png`'s HUD disagrees
with `perf.json`'s potato figures (17 draws / 30 552 tris against 20 / 142 800) while
`01-wide.png` matches its own, which suggests the potato shot is captured before the scene
finishes drawing. If so, every potato shot ever scored was of an incomplete frame.

**Next step is M3e, not M5e,** on the owner's decision. This run flipped that row from `BLOCKED`
to `TODO`, which `docs/ROADMAP.md` names as the closing run's job. M3e is the genome driving
silhouette rather than hue; its load-bearing criterion is the greyscale test, whose renderer
**does not exist yet and is part of the step**, and §1.5 makes it one sequential owner across
`assetgen/dragon/` and `src/assets/dragon/`, never a fan-out.

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

