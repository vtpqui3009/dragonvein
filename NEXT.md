# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `e015a48`, the last commit of run 11 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M3b — wings, crown, membrane and tail ornament; the creature reads as the Python one** · `TODO`

M3a closed in run 11 at `e015a48`, after three critic cycles: art **7.6**, perf **8.7**,
gameplay **9.0**. `src/assets/dragon/` builds a genome into a `BufferGeometry`:
- the reference skin graph (`graph.ts`) is identical to `builder.py`'s on the 32 fixed
  genomes, with one named 1-ulp `pow` exception;
- `skin.ts` sweeps it into closed, outward-wound tubes;
- the eyes are where the reference puts them.

`dragon.html` shows it and `tools/dragon-sheet.mjs` renders it. **Milestone M3 is `IN_PROGRESS`.**

## The single next action

Take M3b in `src/assets/dragon/`. The reference is `add_wings`, `membrane`, `add_crown`,
`dorsal_spikes` and `tail_ornament` in `assetgen/dragon/builder.py`.

- **Port the graph stages exactly**, the M3a way. Add `wings` and `crown` stages to
  `assetgen/dragon_vectors.py` (the fixture's `stages` list) and extend
  `tests/dragon-graph.test.ts`. `wing_nodes`, `membrane` and `torso_at` are pure math too.
- **The membrane, spikes and tail ornament are not skin-graph parts.** The reference builds
  them as Blender primitives (`primitive_cone_add`, `ico_sphere`), plus Solidify and Subsurf
  on the membrane. Build them in TS as their own closed parts. `builder.ts`'s `merge()` and
  part `kinds` already carry per-part colour. The membrane colour is `mats()["memb"]`, the
  horn colour `mats()["horn"]`.
- **Run 11's colour decision:** the genes' HSV is decoded from sRGB (`bodyColours`), so the
  screen shows the genes, where Blender reads them as linear. Keep that for the new parts.
- **Triangle budget:** the body is at max 5752. `tests/dragon-body.test.ts` caps the body at
  6 000, and M3b needs its own cap written into STATE.md first. Perf's P4 heap headroom is
  only about 6 kB, and none of this is in the frame loop yet. Keep it that way.
- **Fixes the critics left on M3a** (FINDINGS.md, M3a cycle 3):
  - The far-side legs render near black. They sit in the body's sun shadow, and no fill reaches
    their camera-facing side. This happens under the game's own rig.
  - A jagged seam where a leg tube pierces the body (A8). A blend at the joint would fix it.
  - The sheet's second row sits nearer the camera, so children look bigger than their
    parents. Put a child beside its parents at one scale.
  - Two-finger pinch in `dragon.html` rotates instead of zooming.

## Open items that need the owner, not a run

- **The reference dragon's proportions (decide before M3b's art round).** Both art rounds
  flag a long, low lizard with the head about 1/8 of body length, where
  `docs/ART_BIBLE.md` §Proportions asks for "chunky and front-heavy: head roughly 1/5 of
  body length". The TS port copies `assetgen/dragon/builder.py`'s graph exactly, so only a
  change to the reference can fix it. Should the reference be re-proportioned to the
  bible? Run 11 fixed one reference bug on its own authority (the tail, `8d78efa`), but
  this one is a design call.
- A verification-grade real-GPU row, when convenient (M16 requires it). On a GPU machine run
  `npm ci && npx playwright install chromium && npm run build && npm run gate:perf -- --real-gpu`
  with a 1920×1080 window, note the GPU model, and run once more with `?tier=potato`. Also
  open `dragon.html` on the deployed site and say whether the dragons look right to you.
- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- No dragon or creature in the game scene yet (A6); the satellite islets are bare.
- Broadleaf: no per-seed colour variation, the seed 5 stub, the seed 7 root slab.
- G3: input-to-frame latency is unmeasured. `gate:smoke` does not load `dragon.html`.
- Perf P4: `heap.bytesPerFrame` 34 589 of 40 960. The frame loop still allocates.

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
  turntable, `artifacts/variants/dragon-body.png` and `artifacts/turntables/dragon-body.webm`.
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
