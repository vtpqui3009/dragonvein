# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-17** · at code commit `f243058` (run 35). Close-out doc commits follow
it. **No run is in flight.** Run 35 took M8b over from run 34 (dead) and gated it properly in a
Linux container, which no local run can do.

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

**M8b — approach and calm: a wild dragon reacts to the player** · `IN_PROGRESS`, and still the
first step in reading order that is not `DONE`. **It is one owner decision away from closing**
— see §The single next action. Everything mechanical is done and green; the gap is a measured
legibility finding, not a bug.

**What run 35 landed** (all pushed; `npm run gates` exits 0, verified twice independently):
- **The keeper can walk at all.** Before: **2 of 40** seeded taps got it anywhere. Now **46 of
  47 reachable targets of 48 (97.9 %)** in `tests/wild-nav.test.ts`, 48/48 on an open deck, and
  **8 of 8** real mouse clicks in `gate:smoke`, each landing 0.000 from the mark. It walks a
  flow field over a 0.05-unit grid, masked once per deck and swept once per goal. **Nothing is
  saved for it** — it is a pure function of the `Deck` and `keeper.goal`, so schema 2 did not
  move and a world saved mid-walk resumes bit-identically.
- **The deck was the other half of the defect.** It carried each prop's *scatter reservation*,
  not its collision footprint: 97 circles over **94 % of the deck, 16 % standable, 54
  disconnected pockets**, with the dragon's home and the keeper's gate *inside* obstacles.
  Now `SOLID_R` per kind, measured off each committed GLB below the keeper's height — coverage
  37 %, and 97 % of the walkable deck in one piece. `17-wild-wander.png` is the first wander
  ever drawn: the dragon's 1.36-wide footprint previously could not step.
- **Flights land somewhere.** `startFlee` had been discarding all ten drawn spots on this
  island, so the dragon "flew" from (1.40, 2.50) to (1.40, 2.50). 30 flights over 3 seeds now
  hop 1.55–9.53.
- **The heap defect from run 34 is fixed and verified** with the dragon in the scene:
  **33 947 B/frame against the unchanged 40 960**, `perf.json` recording
  `wild:{"dragon":true,"keeper":true}`. cpu p95 1.6 ms of 3.5 (sim step included), 21 draws of
  180, meshgen worker max 47–57 ms of 120, bundle 251 kB of 1400.
- **Three drill assertions added, all tightening**, plus a sim freeze for captures. These
  caught **two false captions in cycle 1's own evidence**: `20-wild-flee.png` had been captured
  after the dragon landed (`settle`, altitude 0.000) and `21-wild-wary.png` as `alert`. A shot
  now fails if its captured state differs from the state the drill waited for.

**Scores.** Cycle 1 art 7.4 · perf 7.5 · gameplay 8.6. Cycle 2 **art 8.1 · perf 7.3 ·
gameplay 8.4**. Full defect lists and builder notes in `FINDINGS.md`.


## The single next action

**Answer the one question below, then finish M8b.** Do not start M8c. Five of run 33's six
criteria plus run 35's seventh are met; criterion 6 ("no blocking or major defect", and "the
reaction must read without the indicator") is not, for one measured reason.

**The finding.** At the camera the player actually has, the dragon is **97 px** wide and the
keeper **21 px** (`__dragonveinWild.screen()`, default view, camera distance 18.3; wheel-zoomed
to the minimum, 103 px and 22 px). The posture tells M8b built — head up on alert, a crouch of
`lower` 0.289 on wary against 0.063 on wander, tail turned away — do not read at that size.
Cycle 2's shots read well only because they are framed from 3.3–4.5 units, which `ORBIT_LIMITS`
(15–32) does not allow. **Two critics measured this independently**: gameplay's D1, and art's
A9 ("valid evidence of the tells, but it is not a framing a player gets").

**Why a run should not just pick a fix.** The three ways out trade against each other, and one
of them is a decision the owner made today:

1. **Amplify the tells** so posture reads at 97 px — a much deeper crouch, wings folding, a real
   rear-up on alert. This is the only option that satisfies criterion 6 as written, because the
   reading stays in the body. It is animation work in `src/render/`, and it carries the same
   hazard that stopped the ground furl this run: a bigger pose risks a wing through the flank,
   which is a **blocking** defect in place of a major.
2. **Add diorama-scale cues** — a ground ring under the dragon, a mark above its head, a
   through-geometry silhouette for the keeper (gameplay's own suggestion, and its D2 occlusion
   defect asks for the keeper one regardless). Cheap and safe, but criterion 6 says the reaction
   must read *without* the indicator, so this arguably answers the wrong question. Run 33 allows
   a calm indicator to *supplement* the tells, never to replace them.
3. **Revisit the camera** — ruled out today. `docs/DECISIONS.md` §"The camera stays a diorama"
   records the owner choosing to keep `ORBIT_LIMITS` over a ground-level follow camera or a
   wider zoom clamp, with the reasons. **Only the owner reopens it.**

**ANSWERED, 2026-10-18: options 1 and 2 together.** `docs/DECISIONS.md` §"M8b criterion 6"
has the reasoning. In short: the reading stays in the **body** (§GDD's "reading its behaviour,
not throwing a ball"), so amplify the tells; and the keeper marker ships too, because D2 is a
major on its own — a 21 px avatar lost behind a bush is a visibility defect, not an answer to
the dragon's legibility. Any dragon-state cue stays supplementary; criterion 6 is still judged
on the body alone.

**The wing hazard is already gated, which run 35 did not connect.** `src/assets/dragon/
clearance.ts` `TubeField` measures a posed body, `tools/dragon-flight.mjs` fails on any wing
vertex clearance ≤ 0, and `tests/dragon-flight.test.ts` covers it — all built by M7c. Raise the
amplitudes until that gate or the art-critic stops you; interpenetration cannot ship silently.

~~So: owner, which of 1, 2 or 3?~~ A run that guesses here spends a cycle on the wrong one. If
the answer is 1, or 1 and 2 together, M8b closes in one run: the sim, the input, the save, the
budgets and the drills are all done and green, and only the pose amplitudes and the keeper
marker remain. **Option 2's keeper marker is worth doing whichever way you answer** — D2 is a
major in its own right, and a player currently cannot see either actor while approaching
through the trees and crystals.

**Hazards the next run will meet:**
- **Heap headroom is real but noisy.** Three `gate:perf` runs on *identical* per-frame code read
  39 899, 37 233 and **33 947** B/frame — a ~15 % spread, because the window averages over
  whatever the dragon happened to be doing. Do not read a single run as a margin. The bytes are
  V8 boxing doubles inside `three`'s math (`Quaternion.get x` shows self-size), **not** object
  literals in this project's code: every per-frame path was profiled and is already
  allocation-free, so "reuse more vectors" has nothing left to reuse. `docs/PERF_BUDGET.md`
  names draw calls as the lever. **Never raise the budget.**
- **`gate:perf`'s heap window is state-dependent.** If that spread blocks a score, the fix is in
  the gate — hold the dragon in one state for the heap window, or lengthen it — and it is
  threshold-adjacent, so it needs its own commit and a stated reason (§2.7).
- **A shader link can blow the meshgen round trip under SwiftShader.** `meshgen.json` at
  `f243058` has `maxMs` 684.5 for gid `b3511cbd37`, of which `glStallMs` is 641.9 from
  `getProgramInfoLog`. The gate partitions it honestly (`roundTripHeldMaxMs` 42.6 of 120) and it
  is not stable — two other runs on the same code read 2 stalls then 0. **But the forward risk is
  real for M9:** a bred dragon linking an unseen material variant mid-play would hitch on real
  drivers too. Warming the variants at load (`renderer.compileAsync`) is the cheap preventative.
- **`tests/fixtures/hero-deck.json` is a snapshot** of the live deck. Re-dump it with
  `__dragonveinWild.deck()` if the island is re-dressed; `gate:smoke`'s tap drill catches a stale
  one.
- **The rasteriser cap failed to verify on 2 of 3 `gate:perf` runs** in one sitting ("1 of 56
  threads are not inside their intended cpu set"), which silently demotes p95 enforcement to p50.
  The reading did not move (p95 1.6 ms either way), but a run that needs the p95 line enforced
  should check `rasteriserCap.verified` rather than assume it.
- **An evaluate round trip in this container costs ~1 s.** Any drill that captures a moving state
  must freeze the sim first (`hold(true)` now zeroes the pose dt as well), or it will capture a
  later state than the one it waited for. That is how cycle 1 shipped two false captions.
- **`tools/playtest.mjs` shot captions are fixed strings**, not readings of the frame. Shot 21's
  says "tail to the keeper" where the head is still turned toward it. Make the caption per-shot.


## Open items that need the owner, not a run

- **M8b's blocking question: option 1, 2 or 3 in §The single next action.** This is the one that
  unblocks the current step. Everything else below is older.

- **The dragon's resting wings: is the spread pose still the target?** Two critics report the
  wings reading as upright sails or flat spread sheets on a grounded dragon. Measured on the
  seeded dragon: each wing reaches 4.094 mesh units to the side and only 0.687 up (5.9 : 1,
  ~9.5° above horizontal), and `DragonFlight.pose(0,0,0)` moves **0 of 36 bones** — so the
  renderer is not posing it and this is the mesh as built. `tests/dragon-wings.test.ts` asserts
  exactly that spread for all 40 genomes as **M3e criterion 2**, and `gate:parity` holds the
  Blender reference to the same graph. So the build matches the target; the question is whether
  the target is right. CLAUDE.md §7 forbids a run rewriting it either way. Three options:
  leave it; a **ground-furl layer** in `src/render/flight.ts` carried on its own weight, so the
  sheet dragon and the game dragon would differ at rest; or a **graph change in both builders**
  plus the reference and the `gate:parity` fixed set, which is a dragon step. A run will not
  hand-tune a furl blind — the clearance cases (flank, tail, and the known frill-through-wing
  genomes) make a wing-through-body blocking defect the likely result.

- **A verification-grade real-GPU row is owed, and it now costs perf 1.8 points a cycle.**
  P1 and P6 together lock that much behind evidence no container can produce: there is no GPU
  in CI or any build container, SwiftShader only. The newest row is a *sighting* at `6b06392`,
  2026-10-13, which predates M8 and the first skinned animated dragon. **perf cannot reach 8.0
  until this exists**, whatever the code does — it scored 7.5 then 7.3 across a cycle that
  strictly improved the build. To produce one: clone, `npm ci`,
  `npx playwright install chromium`, `npm run build`, then `npm run gate:perf -- --real-gpu`,
  and send back `artifacts/perf.json`. Recording the GPU model (`chrome://gpu`, GL_RENDERER)
  would also help.

- **Please watch the dragons move, so M7 can close (CLAUDE.md §7).** After the Pages deploy of
  `9242ee2` or later: https://vtpqui3009.github.io/dragonvein/dragon.html?walk=1 (all eight
  walking); `dragon.html?flap=1` (all eight flapping); `dragon.html?view=flight&i=0` (one
  dragon, with Flap, Glide and Land buttons; drag to turn, wheel or pinch to zoom). Do the feet
  stay planted? Do the wings ever pass through the body? Does it feel like a dragon? Tell me
  what you saw and the FPS.

- **Please look at the dressed island, so M5 can close (CLAUDE.md §7).** Once the Pages deploy
  of `1bb31e8` or later is live: https://vtpqui3009.github.io/dragonvein/. It should look the
  same at `?tier=potato` too. 15 generated plant and rock kinds. Say what you saw and the FPS
  the HUD shows.

- **Confirm a reading of CLAUDE.md §7 ("saves to IndexedDB").** M8a keeps the save in IndexedDB
  and adds a **localStorage write-ahead journal** beside it, so a reload during a slow write
  loses nothing; the next load promotes the journal and clears it. Nothing leaves the machine.
  Is a local journal beside IndexedDB acceptable? If not, a run will remove it at the cost of
  that reload case.

- **Evidence page links.** The owner's main session republishes to
  https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj. That URL is **not reachable from the
  account the scheduled runs use** — reading it returns "artifact not found" — so run 23
  published to **https://claude.ai/artifact/HXPyJnjvcwr5tayAwbpD9a**, which is the standing
  link. Note that `.claude/skills/run-closeout/SKILL.md` still names the old URL and is stale on
  this point. Either re-share the original to that account and say so here, or adopt the new
  link in the skill. **Do not create a third.**

- **`wip/m7b`, `wip/m7c`, `wip/m8a`, `wip/m8b`, `wip/m8b-r34` and `wip/m8b-r35` can be
  deleted.** All are superseded by `main`. Run 35's work is folded into `main`; `wip/m8b-r35`
  is kept only as its snapshot.

- **`wip/m5d` can be deleted.** Confirmed to differ from `main` only in `NEXT.md` and
  `STATE.md`. The push that deletes it is refused from the container.

- If run 7's session on the second account is still set to auto-continue, please archive it.


## Carried forward, minor (all in `FINDINGS.md`)

- **The keeper is a brown cone-and-ball figure** at 55–89 px even in the close shots. art calls
  it out at A1/A6. That is the model (`keeperGeometry`, a 0.11-radius cone), not the framing.
- **E and F on the dragon sheet share a body plan** (`dragon-silhouette.json` names them
  "mostAlike"); variation is real overall (mean IoU 0.523, min 0.292) but area spans only
  7.06–8.06 and height 3.2–4.55, so mass and neck arc vary least. An M3 matter.
- **Sky haze off-palette**: art-probe on `01-wide.png` reports 128 of 720 rows (17.8 %) over
  dE 12 against a target under 8 %; worst y=145 (#af6a48, dE 34.6). The deck is flat saturated
  green between props.
- **After settling, calm saturates at 1.0 with no feedback and nothing to do.** That is M8c's
  subject, not a defect here.
- **M5e must merge the understory into instanced batches** — one `InstancedMesh` per plant type
  with LOD inside the instance. Four independent perf rounds agree.
- **A harness bug worth one look:** `shots/05-potato.png`'s HUD disagreed with
  `perf.json`'s potato counts, suggesting the potato shot is captured before the scene finishes
  drawing. If so, every potato shot ever scored was of an incomplete frame.
- No input-latency line in `playtest.log` for G3's 100 ms bound beyond the tap answer (2.7 ms).
- **Save edge cases still open:** a roster change must bump the save seq before repainting the
  HUD, or the HUD can say "saved" for one 250 ms window (`seedRoster` in `src/main.ts`);
  nothing in-game reaches `refused.*`, which becomes a major once a second schema ships.
- **HUD:** the warning panel covers the hanging island; no reload after an IndexedDB open
  timeout; the "backup journal off" line is permanent.
- **Save storage:** the first tab to save after the storage is cleared wins the slot;
  `navigator.storage.persist()` is never called; the journal sweep deletes entries it cannot
  decode.
- **Scene:** black slivers float in the sky.
- Understory (M5d, all `minor`): bush seeds 1/3/6/8 are tall ovoid stacks of one lobe type, so
  the sheet reads nearer 5 silhouettes than 8, and only 2/4/7 carry blooms; fern leaflets read
  as stacked chevrons; grassclump seeds 2/7 are alike and seed 5 is a tiny tuft; reeds 3/8 are
  both tall headless fans.
- Trees (M5c): the ancient giant reads as a big broadleaf with no monumental cue; the dead tree
  is dark clay-brown, not a pale snag; the sapling has three classes in eight seeds.
- Trees (M5b): fanpalm seeds 1/4 and windtwisted 2/6 and 1/5 are near-pairs; the flora
  `triBudget` of 6000/2000/500 differs from the PERF_BUDGET prop row of 4000/1200/300 —
  reconcile it or record why.
- Wind and trees (M5a): the sway is about 1 px at 720p; the conifers are rigid next to the
  swaying broadleaves; the generated trunks are near-black in game; a thin orange rim fringe on
  the canopy lobes; the trees pop in after the boot splash.
- Landmarks and rocks (M4b–M4d): **M4 is closed — these are polish, not reopenable work.**
  None of the five rock kinds is placed in the game (M5e); floatshard 1/3 are near-pairs;
  arch 2 and 5 read as rocks with a tunnel; shard reads as copper splinters; columnar 1/2/4/5
  are flat pavements; boulders 2/4 and 6/7 are near-pairs.
- Island: biome does not read at sheet scale; contour banding on mounds; the game still uses
  the hand-built island.
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
grep -nE '^\| \*?\*?M8b' docs/ROADMAP.md       # step status
sed -n '1,80p' STATE.md                          # newest journal entry
grep -hE '^SCORE_MACHINE' FINDINGS.md | head -6  # latest scores first
npm ci && npm run gates                          # the ground truth, ~20 min
node -e "const p=require('./artifacts/perf.json');console.log(p.heap.bytesPerFrame,p.cpuFrameMs.p95,p.drawCalls,JSON.stringify(p.wild))"
```
