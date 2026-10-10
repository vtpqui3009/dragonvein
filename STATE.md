# STATE

Run journal. Newest at the top. Every scheduled run appends here, including runs that
ship nothing — a run with no entry is indistinguishable from a run that never happened.

---

## 2026-10-10 — run 2 — M0 rework cycles 2 and 3 (IN_PROGRESS)

**Milestone**: M0, still the lowest-numbered milestone not `DONE`. Nothing else touched.

**Step 0 (prove the push path) passed**: `17ac7a0` pushed to `main` with Bash git before
any other work. One wrinkle worth recording — the checkout arrived in **detached HEAD**
with the local `main` ref ten commits behind `origin/main`, so the first `git push origin
main` was rejected for pushing a stale branch rather than for any credential problem. Fixed
by checking out `main` and fast-forwarding it. If a future run sees a push rejected as
"behind its remote counterpart", check `git branch --show-current` before anything else.

### Scores

| cycle | art | perf | gameplay |
|---|---|---|---|
| 1 (previous run) | 7.6 | 3.8 | 8.8 |
| 2 (this run) | 6.9 | 5.9 | 8.2 |
| 3 (this run) | **7.4** | **5.7** | **8.6** |

Three rework cycles is the limit in CLAUDE.md §3.6, so M0 stays `IN_PROGRESS` and this run
closes with what is green rather than starting a fourth.

The cycle-2 dip in art and gameplay is not noise and not a regression in the build: both
critics were scoring while this session was still running builds and gates, so `artifacts/`
changed underneath them. That was the orchestrator's error, it is named in the cycle-2
FINDINGS entry, and cycle 3 was run against a frozen tree with the perf-critic alone on a
quiet container.

### What shipped

- **`gate:perf` measured nothing on a GPU-less box, and `npm run gates` could pass having
  measured nothing at all.** Both gates printed `SKIP — no build yet` when `dist/` was
  absent, so the one command §2.5 requires before a commit could exit 0 with no frame
  rendered and no screenshot taken. The chain now builds first and both gates fail on a
  missing build. `cpuFrameMs` ≤ 3.5 ms is enforced everywhere — the number read off
  §Per-frame budget's own table (2.0 + 1.5 ms of main thread), not invented.
- **The frame budget's reproducibility.** The sampling window was deadline-limited (166
  samples of a 180 target), so the p95 landed either side of its budget run to run and the
  gate exited 1 at random. Target 360, deadline 70 s; the window now closes on the target.
- **Heap churn was not a per-frame figure.** It tracked 1/frames, because time-driven
  allocation (the HUD's 250 ms repaint, the rAF loop) was divided by frames rendered — a
  slow pass read over a budget it had not breached, which is what went red on CI. The gate
  now measures a baseline with rendering paused, derives it per second *and* per rAF
  callback, and subtracts whichever removes less.
- **Draw calls 28 → 21** (merged island body, stones folded into the scatter mesh, the
  flock into the distant-tree mesh), which is how the churn budget was paid for rather than
  by moving the number. Heap 44 745 → 28 325 B/frame against an unchanged 40 960.
- **The art pass**: all three of the bible's lights now reach the frame (the warm rim is a
  per-fragment Fresnel term, because a `DirectionalLight` cannot make a rim); nine
  companion islands at nine depths, all dressed; a cloud sea painted into the sky gradient
  so the root cone stops merging into the lower sky at 1.04:1; satellite decks back on the
  bible's foliage axis; crystals that read as lit.
- **The honesty fixes**: a browser with no WebGL2 now says so in 58 ms instead of sitting
  on the splash forever; the canvas hides while a context is dead instead of rendering
  white over a dark page; the HUD prints `—` rather than a false `DRAWS 0` for the tick
  between restore and the first restored frame.
- **`gate:smoke` stopped being flaky.** The turntable recording opened a second WebGL
  context beside the live page and failed 4 runs in 9, which made AC1 a coin flip. The main
  page is closed before capture now: 10 of 10 runs exit 0, every one on attempt 1.
- **A motion artefact exists at all.** `artifacts/turntables/m0-island.webm`, 7 s, which
  rubric A5 had been judged without.

### Blockers

1. **P1 cannot pass in this environment, and that is the run's main finding.** The
   perf-critic verified it directly: `ls /dev/dri` is absent, there is no `vulkaninfo`,
   `glxinfo` or `nvidia-smi`, and every run reports the SwiftShader renderer. No
   measurement takeable here, with any flags, can close the 16.6 ms line, so every future
   perf-critic cycle on M0 will return a blocking P1 and cap at 5.9 no matter what else
   improves. The instrument itself is now sound — cost not cadence, ~0.1 ms resolution,
   reproducible — but the hardware is absent. **This needs an owner decision**: either a
   human runs the four steps in `docs/PERF_BUDGET.md` §Real-GPU verification and pastes a
   row into the log above, or M0 ships with P1 recorded as unverified. A critic cannot make
   that call and neither should a run.
2. **Nobody has seen the deployed page.** `https://vtpqui3009.github.io/dragonvein/` is
   denied by this container's egress policy — `CONNECT tunnel failed, response 403`, and
   the proxy's own status names `connect_rejected` for that host. Both this session and the
   gameplay-critic tried and failed; the parent session's container is blocked the same
   way. The Pages workflow is green and the deployment record reports success, but a green
   workflow is not a loaded page and this run does not count it. Per CLAUDE.md §7 this is
   the one open item standing between M0 and `DONE`, and it needs a human with a browser.
   (If the owner would rather close it automatically, the deploy job can curl its own
   `environment_url` after publish and upload the status line plus the `three-*.js` hit as
   an artefact. Alternatively the host could be added to the environment's allowed domains.)
3. **An unresolved §2.7 question for the owner.** The main-thread budget is enforced on the
   median rather than the p95, because SwiftShader rasterises on worker threads that
   compete for the same cores and the tail therefore measures how busy the box is
   (identical bytes, two machines: p50 0.7 → 0.9, p95 1.8 → 3.7). The perf-critic accepts
   the measurement and still objects to the conclusion: P1 is a p95 line, and after this
   change no p95 is enforced on any machine this project has run on. Its counter-proposal
   is to cap SwiftShader's rasteriser threads and hold the p95 to the same unchanged
   3.5 ms. The budget number has not moved either way. **Owner's call.**

### Next, in order

1. The two owner decisions above (real-GPU row, and p50-vs-p95).
2. `__dragonveinStats()` still reports a healthy frame over a permanently dead context —
   the honesty fix reached the HUD and `read().context` but not the accessor the gates
   sample, so a future gate polling it alone would pass on a dead canvas. Cheap, clearly
   right, first thing next run.
3. The turntable opens on one white `about:blank` frame and the splash title fades over the
   island for ~1.4 s of a 7.2 s clip. Navigate before `recordVideo` starts, or drop the
   lead-in on save.
4. Art, in the critic's own order of leverage: no measurable warm rim on either silhouette
   of the hero island (the Fresnel term is in the frame but reads ≤ 4 luma at the edge); no
   contact shadow on any satellite deck, because they fall outside the sun's shadow camera;
   satellite decks still bare between features; three decks at ΔE2000 12.1–13.5.
5. The HUD overflows narrow viewports, taking the context-loss message off-screen with it.

### Scores for the record

art-critic **7.4**, perf-critic **5.7**, gameplay-critic **8.6**. Gates green
(`npm run gates` exit 0), CI green, and M0 remains `IN_PROGRESS`.

---

## Real-GPU verification log

`gate:perf` enforces every budget it can measure honestly, but the 16.6 ms frame line is
wall-clock GPU time and this project has never once been measured on a GPU: the build
container and the CI runner both fall back to SwiftShader, a CPU rasteriser, where this
scene's GPU timer reports ~135 ms per frame for 20 draw calls.
`docs/PERF_BUDGET.md` §Real-GPU verification says that verification is a human step and
that its record lives here. This is that record.

| UTC date | commit | machine / GPU | viewport | tier | `frameCostMs.p95` | verdict |
|---|---|---|---|---|---|---|
| — | — | **never performed** | — | — | — | — |

The procedure is four steps in `docs/PERF_BUDGET.md` §Real-GPU verification. Until a row
appears here, rubric line `P1` has no passing evidence anywhere in this repository, and no
run should claim otherwise.

---

## 2026-10-09 — run 1 — M0 toolchain & deploy spine (IN_PROGRESS)

**Milestone**: M0 — lowest-numbered milestone not `DONE`. Nothing else is touched this run.

**Starting position.** `npm run gates` already exits 0 on this container, so the gates were
not the blocker. Every workflow run on `main` is red, which is: CI 4/4 failed, Pages 4/4
failed, Assets 2/2 failed. A green local gate run and a red CI run is exactly the state
M0 exists to end, so M0's work this run is the runner and the deploy, not the game.

**Acceptance criteria** (written before code, per CLAUDE.md §3.2; each is checkable)

| # | criterion | check |
|---|---|---|
| AC1 | gates green locally | `npm ci && npm run build && npm run gates` exits 0 |
| AC2 | CI green on the head commit of `main` | the `CI` run concludes `success`; `gate:perf` and `gate:smoke` reach a browser **on the runner**, not only locally |
| AC3 | Pages serves the island | `Deploy to Pages` concludes `success`; the published URL returns 200 and references the built `three` chunk |
| AC4 | the asset proof script imports its generator | `python3 -I -c "import dragon as D; D.place"` from `assetgen/` — no `AttributeError` |
| AC5 | perf numbers recorded | `artifacts/perf.json`: `drawCalls ≤ 180`, `triangles ≤ 900000`, `errors: []`, and `frameBudgetEnforced` stated honestly |
| AC6 | artefacts exist for the critics | `artifacts/shots/` holds `00-boot.png`, `01-wide.png`, `02-silhouette.png` (25% zoom, rubric A1), `03-late.png` (after ≥ 8 s, rubric A5) |
| AC7 | the test step asserts something | `npm run test` runs real assertions about the spine contract, not `--passWithNoTests` vacuity |
| AC8 | the placeholder is lit per the bible | `01-wide.png`: sky gradient from the `ART_BIBLE.md` palette, one sun with a visible contact shadow, cool fill, warm rim, and an overlay readable at 1280×720 (≥ 4.5:1) |
| AC9 | a red gate still uploads its evidence | the CI run exposes an `artifacts/` upload even when a gate fails |

**Out of scope, deliberately.** Orbit camera, day/night, bloom, quality tiers are M6.
Asset generators and variant sheets are M1. Rubric lines A4 (variant sheets) and P3
(bred-dragon mesh time) have no subject at M0 and the gates for them SKIP by design.

---

## 2026-10-09 — run 0 — project setup (human-directed)

**Did**

- Settled the concept after two corrections from the owner: it is a **3D** game, assets
  are the main workstream, and the hook is **genetics that generate real meshes**.
- Proved the asset pipeline actually runs headlessly, with no GPU:
  - Blender 5.2.2 LTS via `pip install bpy` — scripted modelling, skin-modifier creature
    rigs, PBR materials, glTF export.
  - Cycles path-tracing on CPU: ~25–100 s for a 1700×980 review frame on 4 cores.
  - WebGL2 in headless Chromium via SwiftShader, for in-engine screenshots.
- Built and tested the diploid genome (`assetgen/genome.py`): 30 genes, hidden recessive
  alleles, mutation, element fusion, derived rarity.
- Built the genome → mesh builder (`assetgen/dragon/builder.py`) and rendered the proof:
  six elements from one generator, and a breeding triptych where the child's rarity
  (0.47) exceeds both parents' (0.39, 0.27).
- Wrote the harness: `CLAUDE.md`, 12 agent definitions, the rubric, the roadmap, and
  gates for layers, determinism, assets, parity, mesh-gen time, performance and smoke.

**Defect found and fixed during the proof**

- **Hue inherited linearly instead of circularly.** Hue is a wheel position, so averaging
  an ember parent (0.06, red) with a tide parent (0.57, blue) gave 0.315 — green — and the
  child resembled neither parent. Fixed by blending co-dominant hue along the short arc;
  the same pair now gives 0.815, a violet. Documented in `docs/GENOME.md` §Circular genes.
  Worth noting that the `gameplay-critic` G2 line in `docs/RUBRIC.md` was written to catch
  exactly this, and it did, before any runtime code existed.

**Defects carried forward** (found during the proof, not yet fixed)

- Tail ornaments read as detached specks on some genomes — the attachment point does not
  track `tailTaper`.
- Dorsal spikes read as a white mohawk rather than integrated plates; they need to inherit
  the scale material and sit lower.
- Colours wash out under AgX + the current fill light; the lighting rig needs rebalancing
  before it becomes the reference bar.
- `proof_breeding.png` framing still crops the top parent on some layouts.

**Scheduling — resolved, with a trade-off**

The first routine created fresh sessions per firing. It was test-fired and failed exactly
where it mattered: the fresh session could clone the public repo but got **403 on push**,
because the git proxy only injects credentials for repositories in that session's source
list, and `create_trigger` exposes no parameter to set sources. The environment editor in
the web UI has no repository field either — repositories are chosen per session at
creation, not per environment. The test run correctly refused to spend a full milestone it
could not push.

Resolved by binding the routine to the session that already holds the repository
(`trig_01PAKbMpsfTMuZRj2eECRQxZ`, `persist_session: true`). Runs fire into an ongoing
conversation at 09:07 and 21:07 Asia/Ho_Chi_Minh.

The trade-off is context growth: a persistent session accumulates history and compacts
repeatedly over weeks. The harness tolerates this by design — every run re-reads
`CLAUDE.md`, `ROADMAP.md` and this file rather than relying on conversational memory — but
if runs start degrading, the fix is to move back to fresh sessions with a fine-grained
GitHub token stored in the environment's variables and git configured to use it, which
removes the dependency on proxy-injected credentials.

**Next**: M0 — toolchain and deploy spine. `npm run gates` green, CI green, Pages serving
the placeholder island.

**Scores**: not applicable — no milestone claimed.
