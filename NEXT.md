# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-13** · at commit `d1dcabe`, the last commit of run 23 that changed
code. The close-out docs commits follow it. Run 23 is **finished**; nothing is in flight.

---

## Current step

**M5d — 4 understory generators: bushes, ferns, reeds, grass clumps** · `IN_PROGRESS` (runs 22–23)

All four generators are built, gated and on `main`. Two full critic rounds are scored and in
`FINDINGS.md`. The step is **not** closed, and the reason is a measurement problem, not a
missing asset — read the next section before doing any work.

- Run 22 landed the generators (`1cd78f5`, `3bf104e`); criteria 1–5 hold.
- Run 23 ran cycle 1 at `9e1a2b6`: art 8.3, perf 8.65, gameplay 9.7. Fern 7.7 failed the
  per-generator bar, so fern was reworked.
- `d1dcabe` rebuilt fern: real pinnae on a rachis instead of one serrated blade, a discrete
  `habit` axis (vase / spread / fountain / bracken), visible croziers, and a solved rachis
  turn that fixed a **dead `droop` axis** — the old code straightened any frond nearing the
  ground, so five of eight seeds measured 0.0. The probe now reads 0.045–0.376.
- Run 23 ran cycle 2 at `d1dcabe`: art 8.0, perf 8.15, gameplay 9.7. Gates exit 0 both times.

## The single next action

**Criterion 6 is ruled (`CLAUDE.md` §4, defects not sub-scores). Fix fern's `major` A4
near-pairs — seeds 1/8 and 3/5 — then close M5d. Do not start M5e until it is closed.**

The blocker is that the per-generator art estimate is not stable enough to accept a step on.
Cycle 2 scored `bush`, `reeds` and `grassclump` **lower than cycle 1 while their files were
byte-identical** — only fern changed between the two commits:

| generator | cycle 1 | cycle 2 | asset changed? |
|---|---|---|---|
| bush | 8.6 | 7.8 | **no** |
| reeds | 8.2 | 8.0 | **no** |
| grassclump | 8.1 | 7.8 | **no** |
| fern | 7.7 | 7.4 | yes, rebuilt |

That is about **±0.8 of scorer variance on an unchanged artefact**, which is wider than the
margin the step is being accepted on. Under cycle 1 three of four generators pass; under
cycle 2 only reeds does. Run 23 refused to average the cycles, to take the kinder one, or to
re-roll a third art-critic for a friendlier number — all three are score-fishing
(`CLAUDE.md` §4), and the favourable reading was available and was not taken.

So the next run should, in this order:

1. **Put the question to the owner** (it is in §Open items below): is criterion 6 "art ≥ 8.0
   per generator" measured by a single critic's per-generator estimate, or by something
   reproducible — e.g. the whole-sheet art score plus the `variant-probe` A4 spread number,
   which is computed from the shipped `.glb` bytes and does not move between runs? The rubric
   has no per-generator line; the per-generator estimate is a prompt-level request, which is
   why it is noisy. **Do not rewrite `docs/RUBRIC.md` to settle this** (`CLAUDE.md` §7) —
   a `— decision —` entry in `STATE.md` is the right place.
2. **Fix the one genuinely actionable art defect left in M5d**, whichever way (1) goes:
   `variants/fern.png` seeds 1 and 8 are the same upright vase, and seeds 3 and 5 are both
   low wide uncurled fans. That is fern's only remaining major. Fix the generator, never the
   seed list.
3. Re-render fern, re-gate, re-score, and close M5d if it earns it.

**Do not rework `bush` or `grassclump` to chase cycle 2's numbers.** Their files have not
changed since cycle 1 scored them 8.6 and 8.1. There is no defect in that code to fix, and
editing it to move a scorer's number is the inverse of the rule.

**Traps this run hit, so the next one does not:**
- `artifacts/` is git-ignored, so **no previous run's renders, `perf.json` or shots survive
  into a fresh container**. A critic round costs a full `assets:render` (~3 min per
  generator) plus `npm run gates` (~9 min) before any critic can be spawned. Budget for it.
- Run 22's perf score could not simply be adopted for that reason: its `perf.json` did not
  exist here. See the cycle 1 note in `FINDINGS.md`.

## Open items that need the owner, not a run

- ~~Rule on criterion 6~~ — **ruled, 2026-10-13, now `CLAUDE.md` §4.** Per-asset acceptance is
  decided by **defects, not sub-scores**: a generator fails when a critic lists a `blocking`
  or `major` defect against that generator's own sheet or turntable. A per-generator number is
  commentary and never decides a step. Applied to cycle 2, **fern still fails** on its `major`
  A4 near-pairs, so M5d stays open — the rule changed the measurement, not the verdict. Bush,
  reeds and grassclump carry only minors and pass. §4 also now requires a critic to state its
  coverage, because cycle 2's read three of fourteen shots and opened no turntables.

- ~~The newest real-GPU row cites a commit that does not exist~~ — **withdrawn, 2026-10-13. It
  exists.** `3ab6e84` is `docs(next): the owner's real-GPU command, now that it can pass`,
  2026-10-12 08:13, and `git merge-base --is-ancestor 3ab6e84 main` confirms it is on main's
  history (210 commits, full clone). Run 23 read "unknown revision" because a build container's
  checkout is **shallow** — `clone_depth` defaults to 50 and that commit is further back. The
  row is sound and the owner need do nothing. **Hazard for every run: `git cat-file` and
  `git log` failing on an older hash means your clone is shallow, not that history is wrong.
  `git rev-parse --is-shallow-repository` says which.** Both perf rounds deducted P1 over this
  and disagreed about the table's row count, which cost 0.5 between cycle 1 and cycle 2.

- **A verification-grade real-GPU row, and a Potato row** (M16 requires both). Run
  `npm run gate:perf -- --real-gpu` on a GPU machine at 1920×1080, and once with
  `?tier=potato`. Potato's 30 fps is currently unverified anywhere.

- **Please look at the terrain assets, so M4 can close (CLAUDE.md §7).** The evidence page
  shows the nine 8-seed sheets and their turntables: island, stratified, columnar, boulders,
  shard, eroded, arch and floatshard. Every critic has passed them; no human has seen them.

- **Please look at the dragons, so M3 can close (CLAUDE.md §7).** Open
  https://vtpqui3009.github.io/dragonvein/dragon.html after the Pages deploy. You should see
  8 dragons built from genomes in a worker, draggable and zoomable. Say what you saw and on
  which machine.

- **The reference dragon's design (art keeps scoring M3 under 8.0 on these).** All in
  `assetgen/dragon/builder.py`, so only a change there moves them, and the TS port follows:
  the wings are upright flat sails where the concept's are spread bat wings; the far wing
  panel and a finger cross the tail and belly; the body is long and low with the head about
  1/8 of body length where the bible asks for chunky and front-heavy at about 1/5.
  Should a run re-design these in the reference, or wait for M7 (wing animation)?

- **The evidence page moved, because the old link is unreachable from the scheduled runs'
  account.** Reading `https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj` returns "artifact
  not found" here, so it most likely belongs to the second Pro account. Run 23's evidence is
  published instead at **https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a** — M5d's four
  sheets, five turntables, 14 smoke shots, both critic rounds and the 9 asks. Please either
  re-share the original artifact to the account the scheduled runs use, and tell the next run
  to go back to it, or adopt the new link as the standing one. **Until that is decided, a run
  publishing to the new URL keeps one link; do not create a third.**

- **`wip/m5d` can be deleted.** Run 23 confirmed it differs from `main` only in `NEXT.md` and
  `STATE.md` — no code or asset delta — so its content is fully on `main`. The push that
  deletes it is refused from the container; please delete it from GitHub.

- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- **Placement (M5e) must merge the understory into instanced batches.** Heap headroom is
  ~4 355 B of 40 960 at 28 draws, about **2 more draws**. Three independent perf rounds now
  agree. Use one `InstancedMesh` per plant type with LOD inside the instance, merge existing
  draws, and consider splitting the pooled depth material.
- Understory (M5d): fern's pinnae are hard-edged and uniformly bright green, and the bracken
  seeds 6 and 7 stand on bases that read as logs; bush seeds 3, 6 and 8 are all tall stacked
  blobs and only 2, 4 and 7 carry blooms; grassclump seeds 3 and 8 read alike and seed 5 is a
  tiny tuft; reeds seeds 3 and 8 are both tall headless fans; reeds seed 5 and grassclump
  seeds 2 and 5 will vanish at 25%.
- Trees (M5c): the ancient giant reads as a big broadleaf with no monumental cue; the dead
  tree is dark clay-brown, not the pale snag it replaces; the sapling has three classes in
  eight seeds; the seed labels overlap the giant's roots.
- Trees (M5b): fanpalm seeds 1/4 and windtwisted 2/6 and 1/5 are near-pairs; fanpalm seed 3
  reads as a banana plant; windtwisted seeds 2, 5 and 7 are small; the flora `triBudget` of
  6000/2000/500 differs from the PERF_BUDGET prop row of 4000/1200/300 — reconcile it or
  record why.
- Wind and trees (M5a): the sway is very subtle, about 1 px at 720p; the conifers are rigid
  next to the swaying broadleaves; the generated trunks are near-black in game; a thin orange
  rim fringe on the canopy lobes; the trees pop in after the boot splash; the companions show
  some floating props and bare decks (these predate M5a).
- Landmarks (M4d): floatshard seeds 1 and 3 are near-pairs, 6 fuses into one mound, and a
  fragment clips at t ≈ 1 s; arch seeds 2 and 5 read as rocks with a tunnel; the keels are
  almost black.
- Rocks (M4b, M4c): none of the five rock kinds is placed in the game (M5e); shard reads as
  copper or wood splinters and its smooth base blobs do not match the faceted spikes; eroded
  has near-pairs (6/8, 4/7, 2/5) and sliver triangles on the caps; columnar seeds 1, 2, 4 and
  5 are flat pavements of similar height; stratified has vertical smears and cloth-like ledge
  skirts and reads warm; boulders seeds 2/4 and 6/7 are near-pairs; boulders seed 1 tilts
  with a slightly lifted edge.
- Island: biome does not read at sheet scale; the sheet's low camera hides terraces and
  bites; several seeds are dirt-topped against the concept's green; contour banding on
  mounds; nothing on the decks yet (M5e dresses them); the game still uses the hand-built
  island.
- M3: the art deductions sit with the owner's design questions above. The viewer has no pitch
  and is poor at 360 px.
- Perf: no input-latency line in `playtest.log`, so G3's 100 ms bound is unverified; the
  1080p tier is "Medium minus post", so any frame figure is a floor; PERF_BUDGET's
  SwiftShader figures ("~135 ms", "~170 ms for 20 draws") are stale against `gpuFrameMs.p50`
  593 for 28 draws.
- G2 preview: children lean towards one parent (H reads as C). Revisit at M9b.

## Standing hazards — every run hits these

- **Git at Step 0.** Run 5 found local `main` level. Runs 7 and 23 found it an **unrelated
  root** (4 commits, root `00927cd`, against `origin/main`'s `cff41b6`): `merge --ff-only`
  refuses unrelated histories, and `checkout -B` / `-b` and `reset --hard` were all refused
  by the permission layer. What worked was `git checkout origin/main` (detached), then
  `git push origin HEAD:main`. **`git checkout main` onto that stale root does not just load
  a pre-§4b `CLAUDE.md` — run 23 found it swaps the entire working tree to the pre-M1
  project, so `NEXT.md`, `ops/` and `public/` vanish from disk.** Check `git log -1` against
  `origin/main` before trusting any file you read.
- **The handoff can be stale on arrival.** Run 23 was dispatched with a `NEXT.md` and two
  branch hashes that the other Pro account's run superseded within 90 seconds, while run 23
  was still reading. `git fetch origin main` and compare before trusting either. A Step 0
  push rejected as non-fast-forward is usually that race, not a credential fault: rebase and
  retry once before reporting a failure.
- **Mesh winding.** Run 7's "truncated crown" was half of every lobe wound inward. Blender's
  `from_pydata` does not fix winding, and three.js culls back faces. Count inward faces with
  bmesh `recalc_face_normals` (STATE.md run 7b) before trusting a render.
- **A comment has twice asserted the opposite of what the renderer did.** Measure the
  pixels, not the prose.
- **No GPU anywhere in CI or the containers.** SwiftShader only.
- **`*.github.io` is blocked** by the egress policy.
- **Freeze the tree while the critics score.** Run the perf-critic alone, then art and
  gameplay in parallel. Critics may write to `FINDINGS.md` despite the brief, so check
  `git status` after a round.

## Tools worth knowing about before you start

- **Skills** in `.claude/skills/`: `asset-env` (headless Blender, verified: bpy 5.2.2
  imports, Cycles renders, `.glb` export is byte-identical across processes for a plain
  mesh), `critic-round` (freeze, perf alone, prompt template, FINDINGS format) and
  `run-closeout` (the end-of-run order). Load the one you need. Their text is not in every
  prompt.
- **Owner's evidence page**: `node tools/evidence-page.mjs`, republished every run. The URL
  changed at run 23 to https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a because the old one
  (`Pgkt22EifnK5hUzmXqssoj`) is not reachable from this account — see §Open items. Its "Needs you"
  box is §Open items below, verbatim.
- `node tools/dragon-sheet.mjs` (after `npm run build`): the runtime dragon sheet and
  turntable, `artifacts/variants/dragon-full.png` (+ `.json`, per-dragon build times) and
  `artifacts/turntables/dragon-full.webm`. `LIBGL_ALWAYS_SOFTWARE=1 python3 -I
  assetgen/dragon_sheet.py` renders the same 8 through Blender to `dragon-reference.png` (≈1 min).
  `dragon.html?view=turn&i=K&cam=px,py,pz,tx,ty,tz` gives a close-up of any joint.
- `node tools/variant-probe.mjs <family/name>`: A4 spread and A2 palette numbers for an
  asset, after `npm run assets:render`. It reads the shipped `.glb` bytes.
- `node tools/check-assets.mjs` pins every binary by hash and counts its triangles from the
  bytes. It needs no Blender.
- **History is archived**: runs 0–6 and closed critic rounds are in `docs/archive/`.
  `STATE.md` and `FINDINGS.md` hold only what a run needs now.

- `node tools/art-probe.mjs [shot.png]` prints the numbers this run's acceptance criteria
  are written against: key-to-camera angle, what the shadow pass contributes, rim at the
  canopy edge, off-palette sky rows, and ambient motion. It gates nothing — it is a
  reader, so a build cannot pass by agreeing with it.
- `artifacts/shots/05-potato.png` is the same frame as `01-wide.png` with the shadow pass
  off (`?tier=potato` changes nothing else about the image at this device pixel ratio).
  Subtracting the two isolates the shadow pass exactly. Three single-frame tests for "are
  there contact shadows" were tried before this and all three lied, because on a dressed
  island most dark green pixels are bushes.
- `ffmpeg -i artifacts/turntables/m0-island.webm -vsync 0 artifacts/frames/f%04d.png`
  before running `art-probe`, or its ambient-motion line has nothing to read.

## Verify all of the above in 60 seconds

```sh
git log --oneline -8
grep -E '^\| \*?\*?M3' docs/ROADMAP.md          # step status
sed -n '1,60p' STATE.md                          # newest journal entry
grep -hE '^SCORE_MACHINE' FINDINGS.md docs/archive/FINDINGS-*.md | head -6   # latest scores first
npm ci && npm run gates                          # the ground truth
node tools/art-probe.mjs                         # the art numbers
```
