# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-15** · at commit `9242ee2`, the last code commit of run 31. The
close-out docs commits follow it. **Run 31 closed M7c**, so every M7 step is `DONE`. No run is in
flight. The daily routine is disabled (`3724d5e`), so runs start by hand.

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

**M8a — IndexedDB save and load; a world survives reload; migrations in place** · `TODO`. It is
the first step in reading order that is not `DONE`. M8b–d (approach, taming, roster), M9 and the
playable checkpoint follow.

**M7 the milestone is `IN_PROGRESS`, awaiting the owner's look.** All three steps are `DONE` and
the last pass is ≥ 8.0, but no human has seen the animation running (CLAUDE.md §7). See
§Open items. M5 waits the same way.

**M7c closed** in run 31 at cycle 2. Cycle 2 scored art **8.1**, perf **8.9** and gameplay
**9.3**; cycle 1 scored 8.0 / 9.0 / 8.1, with two majors fixed in rework. What it added:
- Each wing gets a bone chain, read off the graph's own wing nodes: arm, then one bone per
  finger. `graph.ts` is unchanged and parity is exact.
- `flightParams(genome)` sets the beat period from wingSpan and bodyMass. Stroke, `upShare` and
  `fanOpen` come from wingShape and mass.
- The flap lifts the dragon, the legs tuck, and the glide holds altitude.
- `dragon.html?view=flight&i=K` has Flap, Glide and Land buttons (touch and mouse) and the F, G
  and L keys, guarded against modifiers.
- `tools/dragon-flight.mjs` measures clearance on the 8 sheet dragons plus wingSpan 0.55 and
  1.65. Body clearance is ≥ 0.003 (the root seam), wing to wing ≥ 0.314, with 0 finger
  crossings, tip travel of 74–86 %, and feet ≥ 0.83 off the ground in flight.

## The single next action

**Take M8a: save and load.** Write the criteria into STATE.md first. This is `src/core/` work
(the save and load spine, owned by core-builder), plus the wiring in `src/main.ts`, which needs
a sequential owner if it crosses directories.
- **IndexedDB only.** The game is offline: no backend, no login, no telemetry (CLAUDE.md §7).
- Write a versioned schema with a migration chain from version 1, tested with a fixture saved at
  an older version.
- **Define "a world survives reload" as a checkable round trip.** For example: seed, the island
  state, and a roster stub holding a few genomes. Save it, reload the page, and assert deep
  equality in a headless test and in `gate:smoke`.
- Keep `src/sim/` deterministic. Saving must not perturb the `Rng` stream. Snapshot and restore
  the stream state.
- G4 ("state survives reload") goes live at M8a in the rubric, so the gameplay critic will score
  it from now on.

**Hazards:**
- **The game-page heap is the tightest budget.** `perf.json` reads 38 687 B/frame against
  40 960, and 43 514 uncorrected. The figure rose from 31 873 at M7b with no game-page change,
  so it is noisy. Each skinned dragon costs about 840 B/frame (`dragon-flight.json`
  `flapAddsBytesPerFrame` 7 133 for 8). Save and load must allocate nothing per frame. Before
  dragons enter the game scene (M8b), attribute that skinned-path cost. **Never raise the
  budget.**
- **meshgen is rising:** round-trip max 39.5 → 50.5 → 56.7 ms over three rounds, against 120.
- `new DragonFlight` main-thread setup is untimed by any gate.

**Carried minors from M7c (FINDINGS):**
- The glide wings read weakly from the default camera (swept rake, edge-on). The wings are
  smaller and more swept than concept 01.
- The folded membrane shows dark self-shadow patches in `dragon-flap-a.png` (A, C, E, H).
- Facets on C and G's sail.
- Flap kinematics vary shallowly.
- The sheet's row-2 wings cross the row-1 captions, and the hint text has low contrast.
- The flight buttons show no active state.
- The phone framing is small.
- Fixtures #13 and #24 have a frill through a wing at rest. That is graph geometry and needs an
  owner decision (§Open items).

## Open items that need the owner, not a run

- **Please watch the dragons move, so M7 can close (CLAUDE.md §7).** After the Pages deploy of
  `9242ee2` or later, open these three pages:
  - https://vtpqui3009.github.io/dragonvein/dragon.html?walk=1 (all eight walking);
  - `dragon.html?flap=1` (all eight flapping);
  - `dragon.html?view=flight&i=0` (one dragon, with Flap, Glide and Land buttons; drag to
    turn, wheel or pinch to zoom).

  Do the feet stay planted? Do the wings ever pass through the body? Does it feel like a dragon?
  Tell me what you saw and the FPS. This is also the first real-GPU reading with skinning.

- **Decision: the frill-through-wing at rest on 2 of 32 fixture genomes.** Fixtures #13 and #24
  have a crest frill that pierces a wing before anything moves (−0.034 and −0.048). A stress
  sweep found it in 30–51 of 288 synthetic genomes, at long necks. Fixing it means changing the
  skin graph's frill or wing-root geometry in both builders. That moves `gate:parity`'s fixed
  set and the Blender reference. Should a run take that on as a dragon step, or leave it?

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

- **Evidence page links.** The owner's main session (runs 28–30) republishes to
  https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj. The old URL (`Pgkt22EifnK5hUzmXqssoj`) is not reachable
  from the account the scheduled runs use — reading it returns "artifact not found" — so run
  23 published to **https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a**. Either re-share the
  original to that account and say so here, or adopt the new link as standing. **Do not create
  a third.**
- **`wip/m7b` and `wip/m7c` can be deleted.** They are run 30 and run 31 snapshots, superseded by
  `6e1debb` and `9242ee2` on `main`.

- **`wip/m5d` can be deleted.** Confirmed to differ from `main` only in `NEXT.md` and
  `STATE.md` — no code or asset delta. The push that deletes it is refused from the container.

- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- **P4 headroom.** The game page churns 38 687 B per frame, 94 % of the 40 960 budget
  (perf.json at `9242ee2`; the uncorrected figure is 43 514). The game-page code has not changed
  since M7b, where it read 31 873, so the measurement is noisy. There is about 2 kB of headroom.
  **Never raise the budget.**
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
