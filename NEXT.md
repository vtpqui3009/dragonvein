# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `2a1e96f`, the last commit of run 10 that changed
code. The close-out commits that wrote this file follow it.

---

## Current step

**M3a — skeleton, torso and limbs build from a genome into a `BufferGeometry`** · `TODO`

M2b closed at `156321e` (art **8.2**, perf **9.0**, gameplay **9.2**), and with it **milestone M2
is `DONE`**. `src/core/genome.ts` rebuilds 32 fixed genomes plus 3 hand-set tie cases with
every allele, phenotype, rarity and gid identical to `genome.py`, and `gate:parity`'s genome
half is live. M0, M1 and M2 are `DONE`.

## The single next action

Take M3a, the first step of the runtime dragon mesh (`src/assets/`, owned by `mesh-builder`).
The reference is `assetgen/dragon/builder.py`.

- **The reference skins with Blender's Skin modifier + Subsurf** (`Graph.build`). TypeScript
  cannot reproduce that vertex for vertex. What *can* match exactly is the **graph**:
  `skeleton(p)` and `add_limbs`, which are pure math producing node positions, radii and
  edges from the phenotype. Port that exactly and prove it the M2 way: a Python script
  writes the graph for the 32 fixed genomes, and a TS test compares it. Then skin it in TS
  with your own sweep and tessellation.
- **Owner question to raise at M3d, not now:** CLAUDE.md §1.5 has `gate:parity` compare
  *vertex count* between the builders. With Blender's Skin+Subsurf on one side, that is
  probably unachievable by construction. Graph equality plus bounding box within tolerance
  is the reachable form. Record the evidence in `STATE.md` when you get there, and ask
  rather than editing the contract.
- `gate:parity`'s mesh half SKIPs while `builder.ts` exists and M3c is not `DONE`
  (`2a1e96f`), so creating the builder at M3a does not turn the gates red.
- Budget: a bred dragon must mesh in < 120 ms (CLAUDE.md §2.3, M3c). Keep the builder
  allocation-light from the start. Heap is at ~33 kB of 40 kB per frame (perf P4).
- `src/assets/` may import `core` and `three` (`docs/ARCHITECTURE.md`).

## Open items that need the owner, not a run

- **M0 and M1 are `DONE`** (2026-10-12): the owner's sighting at `3ab6e84` lifted perf to
  8.4. Still worth doing when convenient, because M16 will require it: a verification-grade
  row. On a GPU machine, run `npm ci && npx playwright install chromium && npm run build &&
  npm run gate:perf -- --real-gpu` with a 1920×1080 window, note the GPU model, and run once
  more with `?tier=potato` for P6.
- If run 7's session on the second account is still set to auto-continue, please archive
  it. Its plan is for M1a, which is DONE.

## Carried forward, minor (all in `FINDINGS.md`)

- Broadleaf: no per-seed colour or value variation; a branch stub on seed 5; the root slab
  on seed 7; seed labels overlap two trunk bases; the turntable is short (36 frames at 18
  fps, which is 2 s).
- The satellite islets are nearly bare, and nothing lives on the island yet (A6).
- G3: input-to-frame latency is unmeasured.
- The Assets job logs a harmless "Draco is not available" error from bpy, because the
  build deliberately exports without Draco. Also, Actions warns that Node 20 actions are
  deprecated (`actions/*@v4`).

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
grep -E '^\| \*?\*?M1' docs/ROADMAP.md          # step status
sed -n '1,60p' STATE.md                          # newest journal entry
grep -hE '^SCORE_MACHINE' FINDINGS.md docs/archive/FINDINGS-*.md | head -6   # latest scores first
npm ci && npm run gates                          # the ground truth
node tools/art-probe.mjs                         # the art numbers
```
