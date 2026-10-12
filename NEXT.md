# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `a0dbec0`, the last commit of run 13 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M3d — `gate:parity` green between the two builders on the fixed genome set** · `TODO`

M3c closed in run 13 on its first critic pass: art **8.0**, perf **8.5**, gameplay **8.5**.
Dragons build in a Web Worker (`src/assets/dragon/worker.ts`, `mesher.ts`, the three-free
`arrays.ts`). `gate:meshgen` measures them on the built game page at its default settings
(Medium minus post) while the game renders: worker max 23.9 ms, round trip max 26.7 ms,
main-thread assembly max 3.9 ms, against 120 ms. The worker's one-off spawn and warm-up is
about 70 ms and runs before any hatch (`DragonMesher.ready()`). **Milestone M3 is
`IN_PROGRESS`** until M3d.

## The single next action

M3d needs an owner answer first (see below). Then write `gate:parity`'s mesh half.
`tools/gate-parity.mjs` SKIPs it now, and FAILS if ROADMAP marks M3d `DONE` without it (`a0dbec0`).

- **What can be compared.** The graphs are already equal, exactly
  (`tests/dragon-graph.test.ts`), and so are the primitive parameters. Blender's vertices
  match within 1e-5 (`tests/dragon-full.test.ts`). The bounding box and limb anchors are
  reachable: the reference's evaluated mesh against `buildDragonArrays`. The fixture
  writer is `assetgen/dragon_vectors.py`, which already runs Blender per genome.
- **What cannot be compared.** A vertex count. The reference skins with Skin + Subsurf
  (about 20 000 vertices); the TS sweep has about 5 000. They cannot agree by construction.
  Do not edit CLAUDE.md §1.5. Bring the numbers and ask, unless the owner has answered.
- The reference's Skin modifier also leaves about 30 loose vertices per body (`STATE.md`
  run 12). Count bounding boxes on faces, not on all vertices.

## Open items that need the owner, not a run

- **Proportions (raised in run 11, still open).** Art no longer blocks on it now that wings
  and horns read, but critics keep noting a long, low body against
  `docs/ART_BIBLE.md`'s "chunky, front-heavy, head about 1/5". Only a change to
  `assetgen/dragon/builder.py` can move it. Should the reference be re-proportioned?
- **M3d is blocked on this:** CLAUDE.md §1.5 has `gate:parity` compare *vertex count* between
  the builders. Blender's Skin + Subsurf (about 20 000 vertices) and the TS sweep (about
  5 000) cannot agree by construction. The reachable form is graph equality (proven) plus
  bounding box and limb anchors within tolerance. May §1.5's vertex-count clause be read as
  that, or replaced by it?
- A verification-grade real-GPU row, when convenient (M16 requires it). Run
  `npm run gate:perf -- --real-gpu` on a GPU machine at 1920×1080, and once with
  `?tier=potato`. Also open `dragon.html` on the deployed site and say whether the dragons look
  right to you.
- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- Nothing in the game calls `DragonMesher` yet. M9's hatch must `await mesher.ready()` while
  idle, or its first build is cold (144.8 ms measured).
- Perf:
  - no dragon in any measured frame;
  - the real-GPU log predates M2;
  - heap is about 34.9 of 40 kB per frame.
- Art:
  - the C and H cells read alike;
  - the wings are flat sails, where the concept's are spread;
  - shadow sides go black;
  - black slivers in the game sky, which are unexplained;
  - no creature in the game scene.
- Viewer: unreadable at 360 px, and the wheel zooms to the centre rather than the cursor.
- G2 advisory: children lean towards one parent. Revisit at M9b.

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
