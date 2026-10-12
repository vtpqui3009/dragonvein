# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `e699c95`, the last commit of run 18 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M5a — wind vertex shader, proven on one tree at 200+ instances inside budget** · `TODO`

M4d closed in run 18 on its first pass: art **8.3** (arch 8.4, floatshard 8.2), perf **8.7**,
gameplay **9.0**. With M4d, **every M4 step is `DONE`** and all three critics are ≥ 8.0, but
the M4 milestone stays `IN_PROGRESS` until the owner has seen the assets (CLAUDE.md §7; see
Open items). `assetgen/terrain/` now holds nine generators, all byte-reproducible and
probed, and none of them placed in the game yet (M5e):
- the island;
- seven rock kinds;
- arch and floatshard.

## The single next action

Take M5a. It is runtime work in `src/render/` (render-builder). If the wind material also
needs wiring through `src/main.ts`, that is a two-directory change, so give it to **one
sequential owner**, the integrator, not a fan-out.

- **Load the committed tree.** Load `public/assets/flora/broadleaf.lod*.glb` (seed 1).
  Instance it 200+ times with `InstancedMesh`, one draw per LOD.
- **Write the wind shader.** Use an `onBeforeCompile` patch on the existing material: sway
  by height, with a per-instance phase from the instance matrix, trunk stiff and canopy
  loose. Do it all in the vertex shader, with **no per-frame JS allocation**.
- **Respect the heap headroom.** P4 headroom is about 4 draws (perf critic, M4c and M4d):
  `heap.bytesPerFrame` is about 33 kB of 40 960. Measure with `gate:perf` before and after,
  and do not raise the budget.
- **Define a check for "proven".** Write criteria a command can check: for example
  `perf.json` draws and triangles with the 200 instances in frame, p95 cpuFrameMs within
  3.5 ms, and a turntable or webm showing the motion. Read docs/RUBRIC.md A5 (motion).

## Open items that need the owner, not a run

- **Please look at the terrain assets, so M4 can close (CLAUDE.md §7).** The evidence page
  (link under §Tools) shows the nine 8-seed sheets and their turntables: island,
  stratified, columnar, boulders, shard, eroded, arch and floatshard. Say whether they read
  as the sky-world you want. Every critic has passed them, but a human has not seen them.

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

- Landmarks (M4d):
  - floatshard seeds 1 and 3 are near-pairs, 6 fuses into one mound, and a fragment clips at
    t ≈ 1 s;
  - arch seeds 2 and 5 read as rocks with a tunnel;
  - the keels are almost black.
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
