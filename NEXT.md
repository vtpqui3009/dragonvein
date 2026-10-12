# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `ccb560e`, the last commit of run 7b that changed
code. The close-out commit that wrote this file follows it, so `git log -1` being one or two
docs commits ahead of that stamp is expected and not staleness.

---

## Current step

**M1b — `assets:build` and `assets:render` run in CI and publish their artefacts** · `TODO`

M1a closed at `ccb560e` on all eight of its criteria (STATE.md run 7), with art **8.65**,
perf **7.4** and gameplay **9.6**. A4 went live and scored 1.4 / 1.6. Run 7 built the
B1 broadleaf generator and ran out of usage mid-fix. Run 7b took it over in the owner's
own session and closed it. **M1 the milestone stays `IN_PROGRESS`**: M1b is open, and perf
is held below 8.0 by the same two owner items that hold M0.

## The single next action

Take M1b. It is CI wiring, so `integrator` owns it (`.github/`, `tools/`).

- **`.github/workflows/assets.yml` already exists but is stale.** It runs the old
  `assetgen/render_proof.py`. M1b points it at `python3 -I assetgen/build_all.py --verify`
  (the byte-for-byte proof, CLAUDE.md §1.2), `npm run assets:render`, and
  `node tools/variant-probe.mjs flora/broadleaf`, then uploads `artifacts/variants/` and
  `artifacts/turntables/`. Its trigger is `assetgen/**` only. Add `public/assets/**`, so a
  hand-edited binary also triggers the proof.
- Costs measured here: `bpy` installs in ~1 min, the full sheet and 36-frame turntable take
  **3 min 16 s** on 4 CPU cores, and `--verify` takes under a minute.
- **The real risk is the Ubuntu runner.** `--verify` proves two processes on one machine
  agree. CI is a different machine, and the committed hashes were built in this container.
  If the runner's bpy produces different bytes, that is a real §1.2 finding to record, not
  something to paper over. A reasonable answer is to have CI rebuild and compare against
  MANIFEST, and to fail loudly with both hashes.
- `*.github.io` is blocked here, and so is reading Actions logs without the GitHub MCP
  tools. Check whether those tools are connected before relying on seeing a CI run.

## Open items that need the owner, not a run

- **Closing M0 and M1** needs a real-GPU verification row (`docs/PERF_BUDGET.md`
  §Real-GPU verification, four steps, plus `?tier=potato`) and a human sighting of the
  current build. The only row is at `c429d4a`. This is the perf-critic's lead deduction
  every round, at 7.4–7.9.
- **Two sessions, one branch.** Run 7 (second account) was set to auto-continue when its
  usage reset. If it resumes, it holds a stale plan for M1a, which is now DONE. Please
  archive that session, or turn off its auto-continue.

## Carried forward, minor (all in `FINDINGS.md`)

- Broadleaf: there is no per-seed colour or value variation; seeds 6 and 8 are the weakest
  visual pair; a branch stub on seed 5; the root flare reads as a plate on seeds 5 and 7.
- The broadleaf is not yet placed in the island scene, so A6 cannot move until a step
  does that. Per-frame heap is 33–35 kB of 40 kB, so placing it must be instanced.
- G3: input-to-presented-frame latency is unmeasured.

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
