# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `3a2287f`, the last commit of run 17 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M4d — arch and floating-shard landmark generators, each with a passing variant sheet** · `TODO`

M4c closed in run 17 on its first pass: art **8.3** (shard 8.4, eroded 8.3), perf **8.5**,
gameplay **9.0**. Run 17 split the old M4c in two (STATE.md run 17): M4c was the two
remaining §C2 rocks, and M4d is the §C3 landmarks. `assetgen/terrain/` now has five rock
kinds:
- `stratified`, `columnar` and `boulders`;
- `shard` (808/268/128);
- `eroded` (500/182/72).

`rockkit.py` gained `vertex_normals`, `rock_tone` and `fractured_stone`; reuse them.

## The single next action

Take M4d in `assetgen/terrain/`: two landmark generators from `docs/ASSET_PLAN.md` §C3.
- **`arch`**: a natural stone arch. It must be a closed, outward-wound genus-1 solid, so
  count inward faces and open edges on every seed and LOD.
- **`floating shards`**: sky-island fragments that hang in the air. Set
  `SHEET["ground"] = False`, and give them no contact shadow. Read the island generator's
  underside for the style.

Copy the M4c pattern:
- the module declarations and `plan(seed)`;
- LODs strictly decreasing on **every** seed 1–8;
- flat shading;
- the colour based on rockMid.

Landmark budgets may differ from the prop budget. Check docs/PERF_BUDGET.md §Other budgets
before choosing.

**What the art critic keeps flagging** (FINDINGS M4b and M4c):
- dusk dominance reads as orange clay; lean the rock towards rockMid and deep shadow;
- dark vertical smears on tall shafts read as baked dirt;
- near-sibling seeds;
- LOD1 and LOD2 are never rendered, so check them yourself for holes.

## Open items that need the owner, not a run

- **Please look at the dragons, so M3 can close (CLAUDE.md §7).** Open
  https://vtpqui3009.github.io/dragonvein/dragon.html on the deployed site, after the Pages
  deploy of this commit. You should see 8 dragons built from genomes in a worker; you can
  drag to turn them and pinch or wheel to zoom. Say what you saw, and on which machine. That
  is the M3 sighting.
- **The reference dragon's design (art keeps scoring M3 under 8.0 on these).** All of these
  are in `assetgen/dragon/builder.py`, so only a change there can move them, and the TS port
  follows:
  - The wings are upright, flat sails, where the concept's are spread bat wings.
  - The far wing panel and a finger cross the tail and belly.
  - The body is long and low, with the head about 1/8 of body length, where the bible asks
    for chunky and front-heavy with the head about 1/5.

  Should a run re-design these in the reference, or wait for M7 (wing animation)?
- A verification-grade real-GPU row, when convenient (M16 requires it): run
  `npm run gate:perf -- --real-gpu` on a GPU machine at 1920×1080, and once with
  `?tier=potato`.
- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- Rocks (M4b, M4c):
  - none of the five rock kinds is placed in the game (M5e). When they are, use one
    `InstancedMesh` per kind: the perf critic notes P4 heap headroom is about 4 draws;
  - shard reads as copper or wood splinters, and its smooth base blobs do not match the
    faceted spikes;
  - eroded has near-pairs (6/8, 4/7, 2/5) and sliver triangles on the caps;
  - columnar seeds 1, 2, 4 and 5 are flat pavements of similar height;
  - stratified has vertical smears and cloth-like ledge skirts, and reads warm;
  - boulders seeds 2/4 and 6/7 are near-pairs;
  - boulders seed 1 tilts with a slightly lifted edge.
- Island:
  - biome does not read at sheet scale;
  - the sheet's low camera hides terraces and bites;
  - several seeds are dirt-topped, against the concept's green;
  - contour banding on mounds;
  - nothing on the decks yet (M5e dresses them);
  - the game still uses the hand-built island.
- M3: the art deductions sit with the owner's design questions (NEXT.md §Open items). The
  viewer has no pitch and is poor at 360 px.
- Perf:
  - the real-GPU log predates M2;
  - heap is about 34 kB of 40;
  - no dragon or generated island in any measured frame.
- G2 preview: children lean towards one parent (H reads as C). Revisit at M9b.

## Standing hazards — every run hits these

- **Git at Step 0.** Run 5 found local `main` level. Run 7 found it an **unrelated root**:
  `merge --ff-only` could not work, and `checkout -B` / `-b` and `reset --hard` were all
  refused by the permission layer. What worked was `git switch --detach origin/main`,
  then `git push origin HEAD:main`. **`git checkout main` onto that stale root silently
  loads a pre-§4b `CLAUDE.md`.** Check `git log -1` against `origin/main` before
  trusting any file you read.
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
- **Owner's evidence page**: `node tools/evidence-page.mjs`, republished every run to
  https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj (see `run-closeout`). Its "Needs you"
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
