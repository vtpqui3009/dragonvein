# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `4679aa6`, the last commit of run 12 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M3c — built in a worker inside 120 ms on Medium; `gate:meshgen` green** · `TODO`

M3b closed in run 12 at `4679aa6`. Its second cycle scored art **8.1**, perf **8.2** and gameplay
**9.0**, the first pass on M3 with all three at 8.0 or above. `buildDragon(genome)` builds the
whole creature:
- the full skin graph, exact to `builder.py` on 32 genomes;
- membranes, spikes and tail ornament held to Blender's own vertices;
- eyes;
- material groups for skin, membrane and horn.

`artifacts/variants/dragon-full.png` and `dragon-reference.png` match cell for cell.
**Milestone M3 is `IN_PROGRESS`** until M3c and M3d are done.

## The single next action

Take M3c: move `buildDragon` into a Web Worker, and measure it in the browser on the Medium tier.

- **The builder's output is already plain typed arrays** (`skin.ts` `SkinMesh`, `merge()` in
  `builder.ts`). Transfer `position`, `normal`, `color` and `index` buffers plus `groups`,
  `parts` and `kinds` from the worker, and assemble the `BufferGeometry` on the main thread.
  `vite.config.ts` already has `worker: { format: 'es' }`. `src/assets/` may import `three`,
  but the worker should not need it: split the typed-array build from the `BufferGeometry`
  wrapper.
- **`gate:meshgen`** times Node's main thread today (max 18.97 ms, cold 39.88). M3c's
  criterion is the worker in the browser on Medium. Build that measurement (a page or
  `dragon.html` mode, driven by Playwright) and make the gate enforce it, including the cold
  first build, which is 31.2 ms in the browser today. Never raise the 120 ms budget.
- **Perf asks (FINDINGS.md, M3b cycle 2):** a dragon's draw calls (3 groups each), frame
  cost and heap are unmeasured in any frame. The frame loop's heap is about 33 kB of 40 kB.
  Keep the worker hand-off allocation-light.
- `gate:parity`'s mesh half becomes required the moment ROADMAP marks M3c `DONE`. M3d
  builds it, and the vertex-count question below is for the owner then.

## Open items that need the owner, not a run

- **Proportions (raised in run 11, still open).** Art no longer blocks on it now that wings
  and horns read, but critics keep noting a long, low body against
  `docs/ART_BIBLE.md`'s "chunky, front-heavy, head about 1/5". Only a change to
  `assetgen/dragon/builder.py` can move it. Should the reference be re-proportioned?
- **For M3d, coming soon:** CLAUDE.md §1.5 has `gate:parity` compare *vertex count* between
  the builders. Blender's Skin + Subsurf (about 20 000 vertices) and the TS sweep (about
  5 000) cannot agree by construction. Graph equality (proven) plus bounding box and anchors
  within tolerance is the reachable form. M3d will bring the numbers and ask.
- A verification-grade real-GPU row, when convenient (M16 requires it). Run
  `npm run gate:perf -- --real-gpu` on a GPU machine at 1920×1080, and once with
  `?tier=potato`. Also open `dragon.html` on the deployed site and say whether the dragons look
  right to you.
- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- Art:
  - Umbra dragons render at V about 0.2, under the bible's 0.28 value floor (the genes are 0.30).
  - The shadow sides still go dark.
  - The membranes are flat fills, and a lower wing panel crosses the tail. This is the
    reference's geometry.
  - The tail ornament is the same blade on every tailTip-2 dragon.
- No dragon or creature in the game scene yet (A6). `gate:smoke` does not load `dragon.html`.
- G2 advisory: the children lean towards one parent. Revisit at M9b.
- Broadleaf minors, G3 input latency unmeasured, perf P4 heap headroom.

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
