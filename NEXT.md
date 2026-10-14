# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-14** · at commit `e53fb3b`. **Run 29 is in flight on M7a** in the
owner's main session. The criteria and the decided approach (a vertex-shader idle from
attributes the mesher bakes, not skinning) are in STATE.md run 29. The integrator is
building, and nothing lands until the gates are green. **Do not start M7a from a second
session while this line stands.** If there is no `feat(dragon)` commit after `e53fb3b`
hours later, run 29 died: take M7a from the STATE.md run 29 criteria.

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

**M7a — procedural idle (breathing, blink, weight shift) driven by genome proportions** ·
`TODO`. It is the first step in reading order that is not `DONE`. M7 continues with M7b and
M7c, then M8 and M9, then the playable checkpoint.

**M5f closed** in run 28 on its first pass: art **8.6**, perf **9.2**, gameplay **9.3**.
- The hero island is dressed from the generated set, 15 kinds, in **one `BatchedMesh`**
  (`src/render/flora.ts`, `FloraBatch`) with a shadow-caster prefix.
- Draws went from 28 to **17**, and Potato from 20 to 14.
- Heap is 37 594 B of 40 960, triangles 216 714 and cpu p95 1.5.
- Wind is a baked per-vertex `windBend`.
- The generated dead tree replaces the snags.

**Every M5 step is `DONE` and the last pass is ≥ 8.0, but M5 the milestone stays
`IN_PROGRESS`** until the owner has seen the dressed island running (CLAUDE.md §7). See
§Open items.

## The single next action

**Take M7a.** Animate the dragon procedurally from its genome:
- breathing that scales with body mass;
- a blink;
- a weight shift.

M3 already built the dragon's mesh in a worker (`src/assets/dragon/`, `src/dragon-view.ts`),
and the body genes now drive the outline.

**Before planning:**
- **Choose the animation path.** It is either skinning (bones from the skin graph, so the
  mesher must emit skin weights, parity-sensitive) or a vertex-shader deformation keyed on
  per-vertex attributes (like `windBend`). The vertex-shader path keeps the CPU frame and
  heap budgets intact and needs no per-frame allocation. Record the choice and why in
  STATE.md before code.
- **Where it is judged.** The dragon is only on `dragon.html` today. Make the idle visible
  and measurable there, for example two frames at fixed animation times differing on the
  dragon, as the M5a wind shots did.
- **Perf constraints:**
  - meshgen must stay ≤ 120 ms; it is at 50.3 ms and trending up, so do not regress it;
  - any new mesh attribute must keep `gate:parity` green. Parity compares skin graphs, not
    vertex attributes, but check it.

**Carried perf and art items (minor):**
- P4 headroom is now about 3.4 kB. Find which per-frame allocation grew in M5f, even though
  draws fell (`FloraBatch` or the shadow-prefix path), and never raise the budget.
- The front of the deck is sparse. The flat uniform ground green reads as "props on a green
  plate". Grass and fern blades are wire-thin. Moss is scaled too big. Rock shadow faces are
  near-black. These are for a later dressing pass or M6 look dev.
- `loadFlora` is all-or-nothing: one missing GLB removes all the flora. Load per kind and
  skip the failures.

## Open items that need the owner, not a run

- **Please look at the dressed island, so M5 can close (CLAUDE.md §7).** Once the Pages
  deploy of `1bb31e8` or later is live, open https://vtpqui3009.github.io/dragonvein/. It
  should look the same at `?tier=potato` too. The hero island now carries 15 generated plant
  and rock kinds: conifers, broadleaves, a wind-twisted tree, dead trees, bushes, ferns,
  flowers, grass, moss, lichen, fallen leaves, boulders, basalt columns and path stones. Say
  what you saw, and the FPS the HUD shows. The scene changed (17 draws, ~217k triangles), so
  this also refreshes the real-GPU sighting.

- **Have a fresh look at the dragons (optional; M3 is already closed).** Run 26 changed every
  dragon's body: mass, legs, neck, head and crown now shape the outline, and there are three
  wing forms. Open https://vtpqui3009.github.io/dragonvein/dragon.html after the Pages
  deploy. Do they read as eight different creatures to you? If not, say what still looks the
  same, and it becomes a dragon step.

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
