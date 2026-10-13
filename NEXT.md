# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-13** · at commit `3364460`, the last commit of run 23 that changed
code. The close-out docs commits follow it. Run 23 is **finished**; nothing is in flight.

---

## Current step

**M3e — the genome drives the SILHOUETTE, not mainly the hue** · `TODO` · the first step in
reading order that is not `DONE`.

**M5d closed** at `3364460`: art 8.5 · perf 8.3 · gameplay 9.7, gates green, all four
understory generators passing. **M4 closed** on the owner's sighting. M5e is deliberately
*behind* M3e — the owner chose that on 2026-10-13, because M3's art score is 7.4 for one
reason and more flora cannot move it.

## The single next action

**Start M3e. Read `docs/ROADMAP.md` §M3e for the six acceptance criteria before planning.**

The defect, in the owner's own sighting: all eight dragons on `dragon.html` wear the same
upright flat triangular sail where `docs/concept/` shows spread bat wings, and the eight
outlines differ far less than the eight hues. §0 says the genome *is* the parameter set the
mesh is built from — a creature set that reads as one shape in eight colours is that promise
unmet.

**Three things to settle before writing code:**

1. **This is one sequential owner across two directories, never a fan-out.** §1.5 binds
   `assetgen/dragon/` (the Python reference) and `src/assets/dragon/` (the TypeScript runtime)
   to the same creature from the same genome, and `gate:parity` compares their skin graphs
   exactly. Two parallel builders will diverge and fail parity. Use the `integrator`, or one
   builder taking the two in sequence (`CLAUDE.md` §2.4).
2. **The greyscale test is the load-bearing criterion** (`artifacts/variants/dragon-greyscale.png`:
   the eight with all colour removed must still read as eight creatures). It does not exist
   yet — `tools/` has no greyscale renderer, so **building that artefact is part of the step**.
   Write it before the generator work, so the shape change can be measured as it lands rather
   than argued about afterwards.
3. **`docs/GENOME.md` is the arbiter and must not be rewritten to match what gets built**
   (§7). If a wing-form gene needs to exist, check whether the spec already has one before
   inventing it; if the spec is wrong, say so in `STATE.md` and ask.

**Budget note.** The step touches two directories, needs a new render tool, and must keep
`gate:parity` and `gate:meshgen` green. It is plausibly larger than one run. If so, that is a
roadmap defect, not a failed run (`CLAUDE.md` §4b.4): say so in `STATE.md`, propose the split
— the greyscale tool and the wing-form gene are the natural seam — and take the part that fits.

**Traps, measured this run:**
- **`artifacts/` is git-ignored, so no run inherits another's renders, `perf.json` or shots.**
  A critic round costs a full `assets:render` (~3 min per asset) plus `npm run gates` (~9 min)
  before any critic can be spawned. Budget for it. This is why run 22's perf score could not
  simply be adopted.
- A dragon sheet is slower than a flora sheet: `node tools/dragon-sheet.mjs` needs
  `npm run build` first, and the Blender reference sheet takes about a minute on top.

## Open items that need the owner, not a run

- **A verification-grade real-GPU row, and a Potato row** (M16 requires both). Run
  `npm run gate:perf -- --real-gpu` on a GPU machine at 1920×1080, and once with
  `?tier=potato`. Potato's 30 fps is still demonstrated nowhere: `potato.frameCostMs.p95` is
  543 ms on SwiftShader, which is advisory. The three logged rows are all sightings, and the
  newest frame-rate one predates a scene that is now ~5× the triangles it was measured at
  (21 draws / 32 568 tris then, 28 / 174 012 now).

- **The M3 design questions are now M3e's subject, not open questions.** The wings being
  upright flat sails, the far wing panel crossing the tail, and the head at ~1/8 of body
  length where the bible asks ~1/5 — the owner's 2026-10-13 decision answers "re-design in
  the reference, now, rather than wait for M7". Nothing further needed unless you disagree
  with that reading.

- **The evidence page link changed.** The old URL (`Pgkt22EifnK5hUzmXqssoj`) is not reachable
  from the account the scheduled runs use — reading it returns "artifact not found" — so run
  23 published to **https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a**. Either re-share the
  original to that account and say so here, or adopt the new link as standing. **Do not create
  a third.**

- **`wip/m5d` can be deleted.** Confirmed to differ from `main` only in `NEXT.md` and
  `STATE.md` — no code or asset delta. The push that deletes it is refused from the container.

- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- **P4 is the live perf risk, and it is a `major`.** The frame loop allocates 35 108 B per
  frame, 86% of the 40 960 budget, with a 3 995 kB sawtooth over 18 scavenges. Preallocate
  scratch vectors and matrices, drop per-frame arrays and closures, build the stats string only
  when it changes. **Never raise the budget.** M5e's instance matrices will spend this
  headroom, so fix it before placement.
- **M5e must merge the understory into instanced batches** — one `InstancedMesh` per plant
  type with LOD inside the instance. At 28 draws there are about 2 draws of headroom. Four
  independent perf rounds now agree.
- **A harness bug worth one look:** `shots/05-potato.png`'s HUD reads 17 draws / 30 552 tris
  while `perf.json` has `potato.drawCalls` 20 / `potato.triangles` 142 800. `01-wide.png`
  matches its own numbers, so the potato shot is probably captured before the scene finishes
  drawing. If so, every potato shot ever scored was of an incomplete frame.
- No input-latency line in `playtest.log`, so G3's 100 ms bound has been unverifiable for
  three rounds. Log event dispatch to first camera-state change.
- Understory (M5d, all `minor`, none blocking): bush seeds 1/3/6/8 are tall ovoid stacks of one
  lobe type, so the sheet reads nearer 5 silhouettes than 8, and only 2/4/7 carry blooms; fern
  leaflets read as stacked chevrons in a two-tone green with pale stiff stems, and seeds 1/3/5
  may vanish at 25%; grassclump seeds 2/7 are alike and seed 5 is a tiny tuft; reeds seeds 3/8
  are both tall headless fans and seed 5 is thin; sheet ground shadows are faint and detached.
- Trees (M5c): the ancient giant reads as a big broadleaf with no monumental cue; the dead tree
  is dark clay-brown, not the pale snag it replaces; the sapling has three classes in eight
  seeds; the seed labels overlap the giant's roots.
- Trees (M5b): fanpalm seeds 1/4 and windtwisted 2/6 and 1/5 are near-pairs; fanpalm seed 3
  reads as a banana plant; the flora `triBudget` of 6000/2000/500 differs from the PERF_BUDGET
  prop row of 4000/1200/300 — reconcile it or record why.
- Wind and trees (M5a): the sway is very subtle, about 1 px at 720p; the conifers are rigid
  next to the swaying broadleaves; the generated trunks are near-black in game; a thin orange
  rim fringe on the canopy lobes; the trees pop in after the boot splash.
- Landmarks and rocks (M4b–M4d): none of the five rock kinds is placed in the game (M5e);
  floatshard seeds 1/3 are near-pairs and 6 fuses into one mound; arch seeds 2 and 5 read as
  rocks with a tunnel; shard reads as copper splinters; eroded has near-pairs and sliver
  triangles; columnar seeds 1/2/4/5 are flat pavements; stratified reads warm with cloth-like
  ledge skirts; boulders 2/4 and 6/7 are near-pairs. **M4 is closed — these are polish, not
  reopenable work.**
- Island: biome does not read at sheet scale; several seeds are dirt-topped against the
  concept's green; contour banding on mounds; the game still uses the hand-built island.
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
