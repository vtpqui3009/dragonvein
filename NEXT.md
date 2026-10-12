# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-12** · at commit `f7e5597`, the last commit of run 8 that changed
code. The close-out commits that wrote this file follow it, so `git log -1` being a few docs
commits ahead of that stamp is expected and not staleness.

---

## Current step

**M2a — `src/core/rng.ts` reproduces `assetgen/genome.py`'s stream exactly, proven on a
fixed vector** · `TODO`

M1b closed at `f7e5597` on its criteria, with art **8.7**, perf **7.4** and gameplay
**8.7**. The Assets workflow now builds, `--verify`s, `--check`s, renders and probes on
GitHub. Run `38216089403` rebuilt every `.glb` on an Ubuntu runner, and the SHA-256s matched
the committed bytes, so CLAUDE.md §1.2 holds across two machines. **Every M1 step is
`DONE`. M1 the milestone stays `IN_PROGRESS`**, held by perf < 8.0 (the owner items below),
exactly as M0 is.

## The single next action

Take M2a, the first genome step and the start of the hook (CLAUDE.md §0).

- `assetgen/genome.py` `class Rng` is **xorshift128** on `float` output. `src/core/rng.ts` must
  match it **stream-for-stream** (CLAUDE.md §2.1). `src/core/` does not exist yet, so M2a
  creates it, owned by `core-builder`, and it imports nothing (`docs/ARCHITECTURE.md`).
- The trap is integer width. Python ints are unbounded; JS bitwise ops are 32-bit signed.
  Mask with `>>> 0` everywhere, and compare the two languages on the raw uint32 state as
  well as the float. The seeding does `(s * 0x85EBCA6B) & 0xFFFFFFFF`. In JS that must be
  `Math.imul(s, 0x85EBCA6B) >>> 0`, because a plain `*` loses the low bits once the product
  passes 2^53.
- Proof shape: Python writes a fixed vector (several seeds, the first ~1000 outputs, plus
  `range`, `int`, `pick` and `chance`) to a committed JSON fixture. A vitest test reads it
  and asserts exact equality. Make the fixture generator a script, so it is reproducible,
  not hand-pasted.
- `check:determinism` must keep passing. `src/core/` may not use `Math.random` or `Date.now`.
- This is pure logic, with nothing visual. The critics will score unchanged frames.

## Open items that need the owner, not a run

- **Closing M0 and M1** needs a real-GPU verification row and a human sighting of the
  current build. On a machine with a GPU, run `npm ci && npx playwright install chromium &&
  npm run build && npm run gate:perf -- --real-gpu`, then copy four fields from
  `artifacts/perf.json` into STATE.md §Real-GPU verification log (`docs/PERF_BUDGET.md`
  §Real-GPU verification). **`--real-gpu` is new**: before it, the documented command
  always measured SwiftShader and could not pass anywhere. The only row is at `c429d4a`. It is the perf-critic's lead deduction every
  round (7.4–7.9), and no run can supply it.
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
