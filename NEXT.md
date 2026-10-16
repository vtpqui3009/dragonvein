# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-16** · at commit `9179782`, the last code commit of run 32. The
close-out docs commits follow it. **Run 32 closed M8a.** No run is in flight. The daily
routine is disabled (`3724d5e`), so runs start by hand.

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

**M8b — approach and calm: a wild dragon reacts to the player** · `TODO`. It is the first step in
reading order that is not `DONE`. M8c (taming completes and the dragon joins the roster), M8d
(roster UI), M9 and the playable checkpoint follow. M7 and M5 have every step `DONE` and wait
only on the owner's look (§Open items).

**M8a closed** in run 32 on cycle 3. Cycle 3 scored art **8.5**, perf **8.8** and gameplay
**8.9**. Cycles 1 and 2 each found a save-path major that was then fixed. What M8a added:
- **`src/sim/` exists.** `world.ts` holds the world (seed, 20 Hz tick, Rng state, roster,
  eggs, nextId), and `migrate.ts` is the append-only chain. `check:layers` now holds `src/sim`
  and `src/core` to an allow-list.
- **IndexedDB is the save** (`src/core/save.ts`), with a **localStorage write-ahead journal**
  beside it so a save survives an unload behind another tab's transaction.
  - A write lands only over the exact record its session loaded (gen + writer + seq).
  - A refused record is never overwritten. It can be exported, or set aside byte-identical in
    `refused.<n>` with the readable dragons salvaged.
  - A stale second tab pauses.
- **Frozen fixture `tests/fixtures/save-v1.json`.** It has 4 dragons, one of them bred, and
  must load forever.
- **`gate:smoke` drills every save failure mode** in real Chromium IndexedDB: reload under a
  held store, reload storms, two tabs, refused, export, start fresh, deleted DB, newer DB,
  read timeout and journal off.

## The single next action

**Take M8b: approach and calm.** Write the criteria into STATE.md first. This is the first step
that puts a **dragon into the game scene** and gives the sim real work. Decide these before
writing code:
- **Who is "the player"?** There is no avatar yet, so pick the smallest honest subject: a
  pointer or cursor on the island, or a simple avatar. Record the decision.
- **A wild dragon's reaction, as sim state.** It is deterministic, in `src/sim/`, driven by
  the `Rng`. For example: wary → flee or approach → calm, with a calm meter. The reaction should
  read the genome (temperament from body or element genes) so the genetics are visible
  (CLAUDE.md §0).
- **The render reads a snapshot** and plays the M7 idle, walk and flight on it.

**Hazards:**
- **The heap is the binding budget.**
  - The game page reads 37 874 B/frame against 40 960, and the uncorrected figure, 43 938, is
    already over.
  - The post-scavenge floor creeps up about 0.8 MB over 300 s.
  - One skinned dragon costs about 840 B/frame (`dragon-flight.json`).
  - Attribute and cut the three.js skinned-path cost before or while adding the dragon.
    **Never raise the budget.**
- **`cpuFrameMs` now includes the sim step** (`startedAt` moved, run 32). From M8b on, sim cost
  counts against 3.5 ms.
- **Saves serialise in full and issue at once.** Coalesce the IndexedDB write before events
  burst. There is no roster-scaled save probe yet; perf asked for one at 50 and 200 dragons,
  with a budget.
- **Save edge cases still open:**
  - A roster change must bump the save seq before repainting the HUD, or the HUD can say
    "saved" for one 250 ms window (`seedRoster` in `src/main.ts`).
  - Nothing in-game reaches `refused.*`. This becomes a major once a second schema ships.

**Carried minors (FINDINGS):**
- **HUD:** the warning panel covers the hanging island; there is no reload after an
  IndexedDB open timeout; the "backup journal off" line is permanent.
- **Save storage:** the first tab to save after the storage is cleared wins the slot;
  `navigator.storage.persist()` is never called; the journal sweep deletes entries it cannot
  decode.
- **Scene:** black slivers float in the sky.

## Open items that need the owner, not a run

- **Please watch the dragons move, so M7 can close (CLAUDE.md §7).** After the Pages deploy of
  `9242ee2` or later, open these three pages:
  - https://vtpqui3009.github.io/dragonvein/dragon.html?walk=1 (all eight walking);
  - `dragon.html?flap=1` (all eight flapping);
  - `dragon.html?view=flight&i=0` (one dragon, with Flap, Glide and Land buttons; drag to
    turn, wheel or pinch to zoom).

  Do the feet stay planted? Do the wings ever pass through the body? Does it feel like a dragon?
  Tell me what you saw and the FPS. This is also the first real-GPU reading with skinning.

- **Confirm a reading of CLAUDE.md §7 ("saves to IndexedDB").** M8a keeps the save in
  IndexedDB and adds a **localStorage write-ahead journal** beside it. Each save also writes
  there synchronously, so a reload during a slow IndexedDB write loses nothing. The next load
  promotes the journal into IndexedDB and clears it. Nothing leaves the machine. Is a local
  journal beside IndexedDB acceptable? If not, say so, and a run will remove it at the cost of
  that reload case.

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
- **`wip/m7b`, `wip/m7c` and `wip/m8a` can be deleted.** They are snapshots of runs 30–32,
  superseded by `6e1debb`, `9242ee2` and `9179782` on `main`.

- **`wip/m5d` can be deleted.** Confirmed to differ from `main` only in `NEXT.md` and
  `STATE.md` — no code or asset delta. The push that deletes it is refused from the container.

- If run 7's session on the second account is still set to auto-continue, please archive it.

## Carried forward, minor (all in `FINDINGS.md`)

- **P4 headroom.** The game page churns 37 874 B per frame, 92 % of the 40 960 budget
  (`perf.json` at `9179782`). The uncorrected figure is 43 938, and the post-scavenge floor
  creeps. **Never raise the budget.**
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
