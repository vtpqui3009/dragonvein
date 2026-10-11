# STATE

Run journal. Newest at the top. Every scheduled run appends here, including runs that
ship nothing — a run with no entry is indistinguishable from a run that never happened.

---

## 2026-10-10 — run 3 — M0, decision 2 implemented; rubric blocks the close (IN_PROGRESS)

**Milestone**: M0, still the lowest-numbered milestone not `DONE`. Nothing else touched.
M1 not started.

**Step 0 (prove the push path) passed**: `8ec0985` pushed to `main` with Bash git before
any other work. The stale-checkout trap the last run warned about is real and recurred:
the checkout arrived in detached HEAD with local `main` **20 commits** behind
`origin/main`. `git reset --hard origin/main` was refused by this session's permission
layer, so it was fixed with `git merge --ff-only origin/main` on a clean tree, which is
the same end state here. A future run that cannot reset should reach for `--ff-only`
rather than concluding its credentials are broken.

### Scores

| cycle | art | perf | gameplay |
|---|---|---|---|
| 1 (run 1) | 7.6 | 3.8 | 8.8 |
| 2 (run 2) | 6.9 | 5.9 | 8.2 |
| 3 (run 2) | 7.4 | 5.7 | 8.6 |
| **4 (this run, cycle 1 of a fresh run)** | **6.1** | **6.1** | **8.2** / 5.6 literal |

Scored against `2d1ff42` on a genuinely frozen tree: the perf-critic ran alone on a quiet
container, then art and gameplay scored in parallel from a byte-identical `artifacts/`
(md5 of `perf.json` checked before and after; the perf-critic's own reproduction run
restored it). **No critic raised a blocking defect this cycle** — a first for this
milestone. The three scores are not on one scale, which is itself a finding: see below.

### What shipped

**Decision 2, preferred branch, implemented and verified** — `tools/rasteriser-cap.mjs`.

The main-thread p95 is enforceable again, at the same unchanged 3.5 ms, on this
GPU-less container. The thread-*count* cap the decision asked for first does not exist in
Chromium's SwiftShader, and both attempts were accepted without complaint while changing
nothing — which is exactly the failure mode the decision warned about:

| attempt | what it did |
|---|---|
| `SwiftShader.ini` `[Processor] ThreadCount=1`, in the GPU process's **own** cwd (confirmed via `/proc/<gpu-pid>/cwd`) | nothing. All 4 `Thread<NN>` marl workers remained. The strings `SwiftShader.ini`, `Processor` and `ThreadCount` are all in the shipped `libvk_swiftshader.so`, so the `Configurator` is compiled in — but nothing wires it to the marl pool. |
| `--num-raster-threads=1` | nothing to the pool (still 4). It is Chromium's tile-raster pool, not SwiftShader's. Main-thread p95 came out **3.9 ms** — worse. |

Thread *placement* is reachable. `sched_setaffinity` on every thread of every browser
process partitions the cores: the page's renderer takes cpus 0–1, the GPU process with its
marl pool and every helper are confined to 2–3, so no rasteriser thread can share a core
with the main thread. Four runs at 1920×1080:

| | cpu p50 | cpu p95 | cpu max | p95/p50 | gpu p50 |
|---|---|---|---|---|---|
| uncapped | 0.7 ms | 1.6–1.8 ms | 4.7–9.0 ms | 2.3–2.6 | ~200 ms |
| **capped** | 0.7–0.8 ms | **1.1–1.3 ms** | 2.5–3.8 ms | **1.6–1.7** | ~375 ms |

The p95/p50 ratio falling towards 1 is the evidence the decision named. **The cap held**,
and it is reported `verified` only after re-reading all 55 threads' `Cpus_allowed_list`
out of `/proc` and checking the two sets are non-empty and disjoint — never from a
`taskset` exit code. The perf-critic then reproduced it through a different code path of
its own and confirmed all four marl workers confined to cpus 2–3. Two variants were
measured and **rejected**: pinning only the GPU process gave p95 3.0 ms (*worse* than
uncapped — a page free to roam gets scheduled onto the rasteriser's cores), and the page
on a single core gave 1.9–2.3 ms (its own compositor becomes the competitor). Hence
`CAP_MIN_CPUS = 4`: below that the cap declines rather than guessing.

Cost, stated because it nearly reintroduced an old defect: halving the rasteriser's cores
roughly doubles its frame time, so the sample rate halves. The deadline rose 70 s → 420 s
against the unchanged 360-sample target, and `gate:perf` now **refuses to enforce the tail
on a window that closed on the deadline instead of the target** — an irreproducible p95 is
precisely what moved that target to 360 in the first place. Measured: 369 samples in 153 s.

Budget numbers untouched: 16.6 / 180 / 900 000 / 3.5 / 40 960. Only what the 3.5 is
compared against changed. `tests/spine.test.ts` now asserts the stronger guard and fails
if it is reverted to the real-GPU-only condition.

Also fixed, from the last run's "next" list: `__dragonveinStats()` reported the last live
frame forever over a dead context, so a gate polling it alone would have passed on a canvas
that had stopped drawing. It now returns null per-frame figures plus `contextLost`.
The gameplay-critic verified the lost state at +0/+5/+200/+1000/+3000/+7000 ms and found
one remaining hole — see next steps.

`npm run gates` exits 0, twice, with the tail enforced both times.

### Blocker: M0 cannot close under `docs/RUBRIC.md` as written. This needs the owner.

This is the run's main finding and it is not a build problem. Rubric lines that have **no
possible subject at M0** take enough points off the maximum that two of the three critics
cannot reach 8.0 with any amount of work:

| critic | lines with no subject at M0 | points removed | **literal ceiling** |
|---|---|---|---|
| gameplay | G2 bred dragon (M9), G4 state survives reload (M8) | 3.2 | **6.8** |
| perf | P3 bred-dragon mesh ≤ 120 ms (M3) | 1.8 | 8.2 |
| perf | …and P4's "GC pauses < 2 ms", which the web platform exposes no API for at all | 0.3 | **7.9** |
| art | A4 variant sheets (M1) — but scorable against the frame's own repeated set | 0 | 10.0 |

So M0 is unreachable by construction, exactly as P1 was before the owner fixed it this
week — and for the same reason. All three critics found this independently, none of them
touched the rubric (CLAUDE.md §7), and they then resolved it in **opposite directions**:
the gameplay-critic headlined the renormalised figure (8.2, with 5.6 literal as the
aside), the perf-critic headlined the literal one (6.1, with 8.7 as the aside), and the
art-critic set out all three readings and chose to score A4 against the frame. That
inconsistency means the three numbers in the table above are not comparable, which is a
second-order consequence of the same gap.

**The decision is the owner's, and there is no honest way for a run to make it.** The
options, with the one this run would pick:

1. **Preferred — word the affected lines like P1 now is.** P1 was not deleted or lowered;
   it was re-worded so the thing it measures exists on the machine doing the measuring.
   The same treatment: a line whose subject does not exist at the milestone under test is
   scored out of the denominator and reported `n/a`, not as 0 and not as a blocking
   defect. A4 additionally gets P1's shape — blocking only when a variant sheet exists and
   fails, otherwise scored against the largest repeated set in the frame, which is what
   A4's own note exists to catch. On this cycle's numbers that reads art 6.1 (unchanged,
   A4 already scored that way), perf 8.7, gameplay 8.2.
2. Keep the rubric literal and accept that milestones close on a lower bar early on.
3. Keep the rubric literal and accept that M0 never closes.

Under option 1, **art at 6.1 is the only genuine blocker left**, and it is real build work
rather than an instrument problem — which is the useful outcome of this cycle.

A second, smaller owner question, carried from the last run and now sharper: the sole
real-hardware row is a `sighting` at ~1365×610, which costs P1 0.4 even under option 1.
`docs/PERF_BUDGET.md` §Real-GPU verification is four steps on any machine with a GPU.

### Next, in order

1. **The owner decision above.** Nothing a run can do substitutes for it.
2. **Art, which is the one genuine build blocker** (art-critic's own order of leverage,
   all measured, all with pointers in `FINDINGS.md`):
   - no contact shadow *anywhere* — 3369 grass pixels under six cones and eight pebbles,
     69% within ±1 of `#7ba042`, zero darkening. This falsifies AC8's own claim.
   - no warm rim — canopy top edge averages `#729a47` against `#72a44e` 6 px inside, i.e.
     darker rather than warmer. The Fresnel term is in the frame but does not reach it.
   - nine islands from one prefab; ~60 trees from one archetype, three bit-identical at
     14.6° half-angle. Varies by scale and rotation only.
   - satellites bare between features; no ambient motion anywhere outside the hero
     island's spin (a satellite centroid holds ±0.03 px for 7.28 s).
   - off-bible haze band, ~20% of frame at ΔE 25.9–28.6.
3. **HUD at phone width** — a 512 px non-wrapping flex row at `left:14px`, clipping 168 px
   at 360 px wide. Worse than cosmetic: the context-loss status line sits ~145 px past the
   right edge, so a dead canvas at phone width is an unexplained black screen. The
   boot-failure path already wraps and reads correctly at 360 px, so the fix is routine.
4. **One-frame hole in `__dragonveinStats()`** — between `webglcontextrestored` and the
   first restored frame it reports a stale healthy frame. The HUD has a
   `framesSinceRestore === 0` guard; the accessor the gates poll does not. Cheap.
5. **P6 is reachable today without M6's tier system** — the perf-critic notes a
   1280×720 / no-shadow / no-post pass needs only `gate:perf`'s existing `VIEWPORT`
   constant and the shadow toggle. Worth 1.2 and it removes one no-subject line from the
   argument above.
6. `artifacts/playtest.log` never observes the page *while* the context is dead (line 11
   is post-restore), so the log alone cannot distinguish today's honest behaviour from the
   old bug. Sample during the loss.

### Recorded forward risk

Heap churn, not draw calls, is what actually binds scene growth. 21 draws already cost
34 080 of the 40 960 B/frame budget; at the measured ~4 kB fixed + ~1.8 kB per draw, the
180 draws P2 permits would cost ~328 kB/frame — 8× the heap budget. The practical ceiling
is ~20 draw calls. When the scene grows, the answer is instancing and batching, never a
larger heap number (CLAUDE.md §2.7).

### Scores for the record

art-critic **6.1**, perf-critic **6.1**, gameplay-critic **8.2** (5.6 read literally).
Gates green (`npm run gates` exit 0), the rasteriser cap verified, and M0 remains
`IN_PROGRESS` — not stretched to close. Rework cycles 2 and 3 of this run were deliberately
not spent: with the gameplay ceiling at 6.8 and the perf ceiling at 7.9, no amount of
building closes M0 before the owner rules, and CLAUDE.md §7 is explicit that a wrong target
is raised in `STATE.md` and asked about rather than edited.

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

| UTC date | commit | grade | machine / GPU | viewport | tier | `frameCostMs.p95` | verdict |
|---|---|---|---|---|---|---|---|
| 2026-10-10 | `c429d4a` | sighting | owner's machine, Chrome on Windows; GPU model not recorded | ~1365×610 browser window | auto-detected, not recorded | ~60 FPS sustained | PASS (ceiling only) |

**What that row does and does not establish.** The owner opened
`https://vtpqui3009.github.io/dragonvein/` and read the overlay: build `v0.0.1+c429d4a`,
**FPS 60, DRAWS 21, TRIS 32568**. Draw calls and triangles are hardware-independent and sit
far inside the 180 / 900 000 budgets. Sustained 60 FPS on a vsync-locked display means no
frame in that window exceeded ~16.6 ms, so the budget is met as a ceiling — but FPS is not a
percentile, and nothing here measures the tail. It is a `sighting`, not a `verification`,
per `docs/PERF_BUDGET.md` §Two grades of evidence.

It is also the first time any human has seen this build run, which is what `CLAUDE.md` §7
requires before a milestone may be marked `DONE`.

The procedure for a full verification is four steps in `docs/PERF_BUDGET.md`
§Real-GPU verification. `docs/ROADMAP.md` M16 accepts verifications only.

---

## 2026-10-10 — decision — rubric lines with no subject

Run 3 found that M0 could not close under `docs/RUBRIC.md` as written: lines whose subject
does not exist until a later milestone took the gameplay-critic's ceiling to 6.8 and the
perf-critic's to 7.9, below the 8.0 bar. The three critics each worked around it in a
different direction, so their scores stopped being comparable. The run did not edit the
rubric — `CLAUDE.md` §7 — and raised it here instead. Correct on both counts.

**Ruled: option 1, the run's own recommendation.** A line whose subject is absent from the
build under test is scored `n/a` — out of the denominator, never 0, never blocking. This is
the same remedy P1 got, for the same defect: the rubric was measuring things that were not
there yet. Nothing being measured has changed. Budgets, thresholds and the 8.0 bar are
untouched.

Two guards, because `n/a` is otherwise a loophole:

- `n/a` means the subject is **absent**, not unfinished. A variant sheet that exists and
  reads badly scores and can block; no generator at all is `n/a`.
- `docs/ROADMAP.md` now carries a table naming the milestone each line goes live. A line may
  be `n/a` before that milestone and never at or after it.

**Also fixed: P4 asked for something no browser can report.** "GC pauses < 2 ms" has no web
API behind it. P4 now reads "no frame-loop allocation; heap churn within the per-frame byte
budget", which is the figure the gate already measures. Another line I wrote that could not
be satisfied by any amount of correct work.

**P6 is live from M0, not M6.** The perf-critic is right that a 1280×720 pass with shadows
and post off needs only the constants `gate:perf` already has. The roadmap table records it.

### What this leaves on M0

Under this ruling the instrument problems are gone and **art at 6.1 is the single genuine
blocker** — real build work, all of it measured with pointers in `FINDINGS.md`: no contact
shadow anywhere (3369 grass pixels under fourteen objects, zero darkening, which falsifies
AC8's own claim), no warm rim reaching the canopy, nine islands and ~60 trees from one
prefab each varying only by scale and rotation, bare satellites with no ambient motion, and
an off-bible haze band over ~20% of the frame.

That list is the right outcome: the scores now point at the frame instead of at the ruler.

---

## 2026-10-10 — decisions — the three M0 blockers, resolved

The owner opened the deployed build (recorded above) and delegated the two judgement calls:
"về câu hỏi 2 với 3, hãy làm theo cách bạn nghĩ nó tốt nhất."

### 1. Human has seen it run — CLOSED

See the sighting row above. `CLAUDE.md` §7 is satisfied for M0.

### 2. Main-thread budget: p50 or p95 — RULED, in that order of preference

The perf-critic's objection is upheld in principle: after the change to p50, no p95 was
enforced on any machine this project has run on, and a tail you never look at is a tail you
never fix. The measurement behind the change is not in dispute and the budget number never
moved.

But the builder's evidence is real too. Across two machines on identical bytes, the
main-thread p50 moved +29% (0.7 → 0.9 ms) while its p95 moved +106% (1.8 → 3.7 ms), and the
GPU timer doubled (117 → 237 ms). A p95 that tracks how busy the *rasteriser* threads are is
measuring contention, not main-thread work, and SwiftShader does not rasterise on the main
thread.

So: take the perf-critic's fix if it can be built, and fall back if it cannot.

1. **Preferred.** Cap SwiftShader's rasteriser threads so the main thread stops competing
   with them, then hold the p95 to the same unchanged 3.5 ms on every machine. Verify the
   cap actually took effect — do not assume a flag worked because Chromium accepted it.
   Evidence that it worked: the main-thread p95/p50 ratio should fall towards the real-GPU
   case, and the gap between the two machines above should narrow.
2. **Fallback, only if no such cap is reachable.** Keep p50 on software renderers, hold p95
   on real GPUs, and write into `docs/PERF_BUDGET.md` exactly which flags were tried, what
   each one did, and why the cap could not be made to stick. A fallback with no record of
   the attempt reads as a shortcut later, even when it was not one.

Either way `tests/spine.test.ts` keeps failing if 16.6 / 180 / 900 000 move.

### 3. P1 was unreachable by construction — FIXED in the rubric

`docs/RUBRIC.md` P1 was written as "p95 frame ≤ 16.6 ms, blocking" while every machine this
project can reach rasterises through SwiftShader, where no scene meets that number. The
perf-critic was therefore capped at 5.9 in perpetuity and M0 could never close. That was a
defect in the rubric, authored in this repository's first commit, not a defect in the
renderer or in any build session's work.

P1 now has two halves: a continuous, blocking measurement on whatever renderer is present
(must exist, must reproduce, must sit inside that renderer class's recorded budget, with
draw calls and triangles always held to 180 / 900 000), and a periodic real-hardware entry
in the verification log above. `docs/PERF_BUDGET.md` defines the two grades of evidence.
M16 still accepts verifications only.

`CLAUDE.md` §7 forbids rewriting `RUBRIC.md` to match what was built, so this was put to the
owner rather than done quietly. The change is to make a budget *measurable*, not to lower
it. The three numbers are untouched.

### What this leaves

M0 is one re-criticise away from `DONE`: implement decision 2, re-run the three critics on a
frozen tree, and score P1 against its corrected definition. Rework cycles 2 and 3 are spent,
so under `CLAUDE.md` §3.6 this is a new run's cycle 1.

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
- run started 2026-10-11T02:16:21Z
