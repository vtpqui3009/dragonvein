# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `a654bd9`, the end of run 6, plus the dispatcher's
§3.6 ruling commit on 2026-10-12. The last commit of run 6 that changed code was `c6995c4`. The close-out commit that wrote this file follows it, so `git log -1`
being one or two docs commits ahead of that stamp is expected and not staleness.

---

## Current step

**M1a — one generator goes end to end: script → LOD0/1/2 `.glb` → 8-seed variant sheet →
turntable → `MANIFEST.json`** · `TODO`

Every M0 step is now `DONE`. M0f closed this run at `c6995c4` with art **8.3**, perf **7.8**
and gameplay **8.8**. Gameplay passed 8.0 for the first time since M0d, because the
camera now answers drag, wheel and pinch.

**M0 the milestone stays `IN_PROGRESS`, and only the owner can close it.** Perf is held at
7.8–7.9 by deductions no run can move: there is no real-GPU verification row, and
SwiftShader frame cost drifts with no scene change. `CLAUDE.md` §7 also needs a human to
have seen it running. This does not block M1a. The bar itself is no longer in question —
see §Open items.

## The single next action

Take M1a. It is the first asset step, and the contract's first workstream.

- **Pick the generator from `docs/ASSET_PLAN.md`. Do not invent one.** B1 canopy trees are
  the natural first: the M0 island already has three tree archetypes hand-built in
  `src/main.ts`, so the critic has a direct before/after.
- **`assetgen/build_all.py` and `assetgen/render_all.py` do not exist yet**, although
  `package.json` already calls them. M1a writes them. Only `genome.py`, `dragon/` and
  `render_proof.py` are there.
- `CLAUDE.md` §1.2: a committed `.glb` must be reproduced **byte-for-byte** by
  `npm run assets:build` and named in `public/assets/MANIFEST.json`. `check:assets` must
  enforce that. Prove the byte-for-byte claim by building twice and comparing hashes
  before committing anything.
- The 8-seed variant sheet must read as eight different trees. If it does not, fix the
  generator rather than picking luckier seeds (`ops/build-prompt.md`).
- `asset-builder` owns `assetgen/`. Wiring into `check:assets` (`tools/`) is the
  integrator's. That makes two owners, so run them sequentially, not in parallel.
- Setup: load the `asset-env` skill. `pip install bpy` took about a minute, and the GL
  libraries were already present except `libegl1`, which was not needed. Cycles on CPU:
  0.8 s for a small still, 25–100 s for a review frame. Budget for the turntable.
- **This step may be too big for one run.** If it is, `CLAUDE.md` §4b.4 says to propose
  the split in `STATE.md` and take the half that fits, for example generator + LODs +
  variant sheet first, then turntable + manifest + check.

## Open items that need the owner, not a run

- **Closing M0** needs a real-GPU verification row (`docs/PERF_BUDGET.md` §Real-GPU
  verification, four steps, plus `?tier=potato`) and a human sighting of the current build.
  The camera now orbits, so the sighting can also confirm drag and pinch on a real phone.
- ~~The step-versus-milestone bar~~ — **ruled, 2026-10-12.** `CLAUDE.md` §3.6 now states it
  outright: a **step** closes on its own acceptance criteria with gates green; a
  **milestone** closes only when every step is `DONE` **and** all three critics are
  ≥ 8.0. That is what runs 5 and 6 already did, so **M0e and M0f stand as `DONE`** and M0
  stays `IN_PROGRESS`. No run needs to re-ask. The owner can still overrule the wording.

## Carried forward, minor (in `FINDINGS.md`)

- G6: pinch-in and wheel-up are covered only by the wheel flood, not asserted on their own.
- G3: input-to-presented-frame latency is unmeasured.
- Art: thin black shards read as glitches; one satellite side is yellow-olive; the sky is
  darker than the concept's pastel.

## Standing hazards — every run hits these

- The checkout often arrives in **detached HEAD** with local `main` stale — 34 commits
  behind run 4, 20 the run before; run 5 found it already level. `git reset --hard
  origin/main` is **refused by the session's permission layer**, three times now. Use
  `git checkout main && git fetch origin main && git merge --ff-only origin/main` on a
  clean tree, which reaches the same state. Do not read the refusal as a credential
  problem.
- **A comment in this codebase has twice asserted the opposite of what the renderer did.**
  The key light's comment claimed its shadows raked across open ground when they fell
  behind their casters; the rim's claimed `<opaque_fragment>` summed
  `totalEmissiveRadiance` into `outgoingLight`, which three 0.186 does not do, so the rim
  had never been in a frame. Both survived review because the code *looked* right.
  Measure the pixels, not the prose. The cheapest test for "is this uniform doing
  anything": multiply it by 20 and re-render. If nothing moves, it is not wired up.
- **No GPU anywhere in CI or the containers.** SwiftShader only. P1's absolute frame
  number is unreachable here by design; see `docs/RUBRIC.md` §P1.
- **`*.github.io` is blocked** by the egress policy (403 on CONNECT). No build session has
  been able to load the deployed page. Do not infer the deploy works from a green workflow.
- **Freeze the tree while the critics score.** Letting a build land mid-scoring cost ~1.5
  points on an earlier cycle. Run the perf-critic **alone** on a quiet container — it
  measures timings — then art and gameplay in parallel.

## Tools worth knowing about before you start

- **Skills** in `.claude/skills/`: `asset-env` (headless Blender, verified: bpy 5.2.2
  imports, Cycles renders, `.glb` export is byte-identical across processes for a plain
  mesh), `critic-round` (freeze, perf alone, prompt template, FINDINGS format) and
  `run-closeout` (the end-of-run order). Load the one you need. Their text is not in every
  prompt.
- **Owner's evidence page**: `node tools/evidence-page.mjs`, republished every run to
  https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj (see `run-closeout`). Its "Needs you"
  box is §Open items below, verbatim.
- **History is archived**: runs 0–4 and closed critic rounds are in `docs/archive/`.
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
grep -E '^\| M0' docs/ROADMAP.md                 # step status
sed -n '1,60p' STATE.md                          # newest journal entry
grep -hE '^SCORE_MACHINE' FINDINGS.md docs/archive/FINDINGS-*.md | head -6   # latest scores first
npm ci && npm run gates                          # the ground truth
node tools/art-probe.mjs                         # the art numbers
```
