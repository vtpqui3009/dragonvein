# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-13** · at commit `8aafd7f`. **Run 25 is stopped, not in flight** — the
owner stood it down at 09:0x UTC so their second Pro account could take over without two
sessions pushing to `main`. It shipped **no code**: `cf4f17e` (marker), `7e1e364` (criteria)
and `8aafd7f` (this file) are all it pushed, so `main` is clean and nothing is half-landed.

**M3f is yours to take from the top.** Its acceptance criteria are already written on `main`
in `STATE.md` run 25 — reuse them, do not re-derive them — in the order written there:
**instrument the sweep first, then strengthen the genes.** Open a new run heading rather than
appending to run 25's.

---

## The running order changed — read this before taking a step

**Owner decision, 2026-10-13.** `docs/ROADMAP.md` now runs **M3 → M5 → M7 → M8 → M9 →
▲ playable checkpoint → M6 → M10…**. **M6 Look dev moved to after M9.** Milestone numbers
are unchanged, so `RUBRIC.md`, `STATE.md` and `FINDINGS.md` still mean what they said — only
reading order moved, which is what §3.1 schedules on. Take the first step in reading order
that is not `DONE`, as always; that rule now lands you on the loop, not on bloom.

**Why.** 23 of 66 steps are `DONE` and every one of them is engine or asset. The loop — tame,
roster, breed, inspect — has not been started. Day/night light, shadows, bloom and quality
tiers are an investment in a loop nobody has played yet.

**The checkpoint is a hard stop.** A run that finishes M9c does not start M6. It writes the
question into this file and waits for the owner to play it.

## Current step

**M3f — neck arc, body mass and horn count push the outline until `dragon-greyscale.png`
reads as eight creatures** · `TODO` (run 25 stopped before writing any code)

**M3e closed** in run 24 after one rework cycle, at `8e5b5ba`. Last-pass scores: art **7.9**,
perf **8.5**, gameplay **9.7**. All six criteria hold:
- three wing forms derived from `wingFingers` and `wingShape`: sail G, spread A/B/E/F,
  segmented C/D/H;
- a lower gull-winged rest pose that reads as a pair in the sheet camera (cycle-1 major D1
  fixed);
- `dragon-greyscale.png`, `dragon-silhouette.json` and three turntables;
- parity exact, meshgen ≤ 38.7 ms, gates green;
- no blocking or major defect on the wings.

**M3 stays `IN_PROGRESS`.** Art is 7.9, and the major that remains is the shared body plan,
which is M3f's whole job.

## The single next action

**Take M3f.** Use the instruments M3e built (`node tools/dragon-sheet.mjs` after
`npm run build`).
- **Target the numbers.** `dragon-silhouette.json` has mean pairwise IoU 0.632, a range of
  0.429–0.785 (A–G the most alike), area 6.50–7.77, height 3.42–4.18 and width 5.21–6.51.
  Body proportions barely move (a spread of about 20 %). Write a target into the STATE.md
  criteria before code, for example a lower mean IoU and a wider area and height spread,
  plus the greyscale sheet read by eye.
- **Find what to push.** neck arc, body mass, leg length, horn count and length, crest and
  tail ornament are all genes in `docs/GENOME.md`. Find why their ranges barely reach the
  outline: how strongly `builder.py` maps each gene to geometry. **Do not rewrite
  GENOME.md** (§7). If a gene's range is wrong, say so in STATE.md and ask.
- **One sequential owner** (the integrator) across `assetgen/dragon/` and
  `src/assets/dragon/`. Regenerate the parity fixture. Keep meshgen ≤ 120 ms.
- **Art-critic minors to take along:**
  - wing hue clashes with the body (A, C, H, G), and F's body is near-black;
  - the segmented near ribs read as skewers over the hind leg;
  - the belly is black under the near wing on C and H;
  - wing panels are flat-lit;
  - the wings are small next to the concept.
- **Gameplay advisory, for M9b:** the hard `wingShape` threshold at 0.5 flips the wing class,
  so G (A×B, both spread) is a sail.

## Open items that need the owner, not a run

- **A verification-grade real-GPU row is still owed before M16.** On 2026-10-13 the owner
  logged two sightings at `6b06392`: ~60 FPS at Medium (28 draws, 174 012 triangles) and
  ~60 FPS at Potato (20 draws, 142 800). They cover the current scene, including the first
  real-hardware Potato reading. A sighting is a ceiling, not a p95. For the
  verification-grade row, follow NEXT.md history: clone, `npm ci`,
  `npx playwright install chromium`, `npm run build`, then `npm run gate:perf -- --real-gpu`,
  and send back `artifacts/perf.json`. Recording the GPU model (`chrome://gpu`,
  GL_RENDERER) would also help.
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
