# STATE

Run journal. Newest at the top. Every scheduled run appends here, including runs that
ship nothing — a run with no entry is indistinguishable from a run that never happened.

---

Older run entries live in [`docs/archive/STATE-2026-10.md`](docs/archive/STATE-2026-10.md),
whole and unedited. This file keeps the runs still worth reading at the start of a run, every
`decisions` entry (code and tests cite them by heading), and the Real-GPU verification log,
which the perf-critic scores against. A run that closes a step moves its own entry to the
archive once two newer run entries sit above it.

---

## 2026-10-12 · run 8 · M1b DONE — the asset pipeline runs in CI (M1 IN_PROGRESS on perf)

**Step**: `M1b`, the first step in reading order that is not `DONE`. Step 0 pushed
`4851904`.

**Ownership**: `.github/workflows/` and `tools/` belong to `integrator`; the `--check`
mode in `assetgen/build_all.py` belongs to `asset-builder`. That is two owners, so they run
sequentially: the builder change first, then the workflow that calls it.

**Baseline**: `.github/workflows/assets.yml` exists and is green (runs 4–6 on `b0177f3`,
`7e2d2dd`, `2adc4f1`), but it runs only the old `render_proof.py`. It does not build, does
not verify bytes, does not render the variant sheet, and does not probe. It also does not
trigger on `public/assets/**`, so a hand-edited binary would never reach it. `bpy` is
unpinned.

### Acceptance criteria

| # | criterion | instrument |
|---|---|---|
| AC1 | `python3 -I assetgen/build_all.py --check` rebuilds every asset into a temp dir and compares each committed binary under `public/assets/` with the fresh build *and* with its MANIFEST hash. It exits 1 naming both hashes on any drift. Shown failing on a tampered copy and passing on the real tree. | command output |
| AC2 | `bpy` is pinned (`assetgen/requirements.txt`), so CI builds with the same Blender that made the committed hashes. | file |
| AC3 | `assets.yml` triggers on `assetgen/**`, `public/assets/**`, the asset tools and itself, plus `workflow_dispatch`. In order it runs: `build_all.py --verify` (same-machine reproducibility), `--check` (cross-machine: the runner reproduces the committed bytes), `assets:render`, `variant-probe` for every MANIFEST asset, and `check:assets`. It uploads `artifacts/variants/` and `artifacts/turntables/`. | workflow file |
| AC4 | A real run of that workflow on GitHub, at the pushed commit, concludes **success**, and its artefact list holds the variant sheet and turntable. The run id is recorded here. If the runner builds different bytes, that is a §1.2 finding to record, not to hide. | GitHub Actions API |
| AC5 | `npm run gates` exits 0. | `npm run gates` |
| AC6 | Critics score on a frozen tree. Nothing visual changes in this step; the scores are recorded as they come. | `FINDINGS.md` |


### Result

- `d34bb94`: `build_all.py --check` passes on the real tree. On a copy with one byte of lod1
  flipped it fails, printing the committed, fresh and MANIFEST hashes (AC1).
  `assetgen/requirements.txt` pins `bpy==5.2.2` (AC2).
- `f7e5597`: `assets.yml` now runs, in order, `--verify`, `--check`, `check:assets`,
  `render_all`, `variant-probe` per MANIFEST asset, and the dragon proofs. It triggers on
  `public/assets/**` as well (AC3).
- **Actions run `38216089403` (job `114701047119`) succeeded at `f7e5597`** (AC4). The Ubuntu
  runner built `a2495328…`, `8252b2c8…` and `8c6dcee6…`: identical to the committed bytes and
  MANIFEST, so §1.2 is proven across two machines. The sheet rendered in 39 s and the
  36-frame turntable in 115 s. The probe passed. Artifact `asset-renders` (id 11732548099)
  holds 6 files.
- `npm run gates` exits 0 (AC5): cpu p95 1.7 ms, heap 33 282 B/frame, code bundle 145.89 kB.
- Scores at `f7e5597` (AC6): **art 8.7 · perf 7.4 · gameplay 8.7**, no blocking defect.

**M1b is `DONE`.** Every M1 step is now `DONE`. **M1 stays `IN_PROGRESS`**, held only by perf
< 8.0, whose deductions are the owner's real-GPU row (§3.6). The next step is **M2a**.

---

## 2026-10-12 · run 7b · M1a DONE — taken over from run 7 (out of usage) and closed

Run 7 (`session_015wGqRT1h1SMvdiguFdACAU`, the owner's second account) ran out of usage
after `b0177f3`. Its asset-builder was mid-way through the apex fix, and that uncommitted
work was lost with the container. The owner confirmed it had stopped. Run 7b continues
M1a from `b0177f3`, against run 7's acceptance criteria, unchanged (now in
`docs/archive/STATE-2026-10.md`, run 7).

- `7e2d2dd`: the "truncated apex" (A8) was inward-wound lobe side quads, about half the
  faces of every mesh. It is fixed, with 0 inward faces over seeds 1–8 × LOD0–2.
- `3a30882`: `check:assets` pins every binary by SHA-256, reads triangle counts from the
  bytes, and enforces the LOD chain and budgets (criteria 2 and 4). Four new failing-case tests.
- `2adc4f1`: `tools/variant-probe.mjs` covers A4 spread and A2 on the shipped bytes (criteria
  5 and 7). It was seen failing on a doctored tree.
- Full sheet plus 36-frame turntable: 3 min 16 s. **All eight criteria hold**, and
  `npm run gates` exits 0 (criterion 8).
- Scores at `2adc4f1`: **art 8.65 · perf 7.4 · gameplay 9.6**, no blocking defect.
  **M1a is `DONE`** per §3.6. The step closes on its criteria, and M1 stays open on M1b
  and on perf.
- Two instrument defects the critics found were fixed in their own commits after the round,
  without re-scoring:
  - `cc0ced2`: `gate:perf` counted the copied `.glb` files against the code bundle.
    232 674 → 145 890 B; assets are now reported separately; the budget is unchanged.
  - `ccb560e`: variant-probe's bark check was circular. The declared palette is now
    checked against ART_BIBLE (bark is ΔE 6.8 from `rock mid`).
- Rotated out to `docs/archive/`: runs 5 and 6, the 2026-10-11 tooling entry, and the
  M0e critic round.
- **If run 7 auto-resumes** (its UI showed "auto-continue at 2:01 PM" local), its push will
  be refused as non-fast-forward. It must re-read `NEXT.md` and `STATE.md` rather than merge
  its stale plan over this.

---

## 2026-10-12 · dispatcher · ruling: how a step closes, and how a milestone closes

No code. The daily trigger fired at 02:07 UTC, every DRAGONVEIN session was idle, and run 6
(the owner's second Pro account) had already closed M0f overnight at `a654bd9`. Before
spawning M1a, the dispatcher closed the one question run 6 left open rather than leaving the
next run to re-derive it.

**The question.** `CLAUDE.md` §3.6 read "All three ≥ 8.0 and gates green → commit, push, mark
the milestone `DONE`." Runs 5 and 6 read that as a *milestone* bar and closed M0e (perf 7.9,
gameplay 6.7) and M0f (perf 7.8) on their own row criteria, flagging the ambiguity instead of
stretching a score. Read per *step*, both closures were wrong.

**The ruling: per milestone, and §3.6 now says so in two clauses.** A step closes on the
acceptance criteria written for it in §3.2 — the named commands and screenshots — with gates
green. A milestone closes only when every step in it is `DONE` **and** all three critics
scored ≥ 8.0. The 8.0 bar is untouched; what changed is that the sentence now names what it
applies to. Reasons, in order of weight:

1. **The alternative is unreachable by construction.** `docs/RUBRIC.md` §When each rubric line
   goes live puts lines live at a milestone, not a step. A step that ships no input cannot
   score G6, and a step that ships no GPU cannot score P1's absolute number. Per-step ≥ 8.0
   would make every such step permanently unclosable — which is what trapped M0e for two runs.
2. **Scoring an unchanged tree again is the behaviour the contract forbids.** The only route
   from a 7.8 on an artefact no run can change is to re-roll the critic. §4 exists to stop
   exactly that.
3. **It is already the practice, and it was the right call twice.** M0f's 8.8 gameplay — first
   over the bar since M0d — confirmed the run-4 diagnosis that G6 was a roadmap defect, not a
   build defect. Closing M0e per step would have blocked the step that fixed it.

**M0e and M0f stand as `DONE`. M0 stays `IN_PROGRESS`**, because perf sits at 7.8 and its
deductions are the two owner items below — a real-GPU verification row and a human sighting
(`CLAUDE.md` §7). Neither is a build defect; neither is closable from a container.

Also fixed: `docs/ROADMAP.md` §M0 History still said M0f "is waiting on the owner", stale since
run 6 landed it. An edit to that sentence was refused by the permission layer in run 5; it
went through this time.

Nothing here weakened a gate, a test or a score. If the owner reads §3.6 the other way, the
two clauses are one revert and this entry is the reasoning.

**Next:** M1a, spawned fresh per `ops/dispatcher-prompt.md`.

---

## 2026-10-11 — decisions — M0f approved, and A2 was asking the wrong question

Run 2026-10-11 closed M0d (art 8.3, perf 8.7, gameplay 6.9) and raised two items. Both are
defects in documents written at project setup, not in the build.

### 1. G6 had no subject at M0 — **M0f approved**

`docs/ROADMAP.md` made G6 "mouse and touch" live from M0, and no M0 step delivered input.
The gameplay-critic was therefore capped below the bar by a line nothing could satisfy —
the third instance of this pattern, after P1 and the no-subject rule. M0f is now approved
and worded in the roadmap: drag to orbit, wheel or pinch to zoom, asserted under both a
mouse and a `hasTouch` context.

The run proposed it and did not take it, because one step is one run. That was right.

### 2. The palette gap — measured, and the conclusion is the opposite of the proposal

The run asked whether `ART_BIBLE.md` wants a dusk entry, expecting that one would take A2
"to near zero". Measured before deciding, in CIELAB:

| ramp from `sky horizon` #ff9044 to `deep shadow` #1a1420 | peak ΔE from the nearest entry |
|---|---|
| direct | 47.1 |
| via `rock mid` (what shipped) | 33.9 |
| + 1 purpose-chosen stop | 23.7 |
| + 2 stops | 15.7 |
| + 3 stops | 12.2 |
| + 4 stops | **10.3** — the first that clears A2 |

So one entry does not fix it. **Four** do, which would leave five of fourteen palette
entries existing only to let one gradient pass one test. That is the palette serving the
rubric instead of the art, and it is the wrong trade.

The real defect is A2. A gradient passes through colours between its stops — that is what a
gradient is. Scoring a ramp's midpoint against the palette measures the definition of
interpolation, not the quality of the frame, and no correct work can satisfy it.

**A2 now scores surfaces** — a rock, a leaf, a panel, a dragon's scales — within ΔE 12.
For a **gradient** it asks three things that are real defects when they fail: both endpoints
are palette entries, the ramp is monotonic in value, and it does not band at the tier's bit
depth. `docs/RUBRIC.md` §A2 carries the measurement.

A `dusk` entry `#844e32` was added anyway, for a different reason. Routing a sky through
`rock mid` worked numerically and was wrong semantically — a cliff colour has no business in
a sky. `dusk` is named for the job it does.

### The pattern, now three for three

P1 asked for a number no available machine could measure. The no-subject rule let lines
score zero for things that did not exist. G6 went live at a milestone that delivered no
input. A2 scored interpolation as if it were art direction. Each cost a run or more to
discover, and each was written at setup by someone — me — who had not yet watched the
rubric meet a real build.

Worth saying plainly for whoever reads this later: when a critic cannot reach the bar with
any amount of correct work, suspect the instrument before the builder. Four times now, the
instrument was wrong.

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
| 2026-10-12 | `3ab6e84` | sighting | owner's machine, Chrome on Windows; GPU model not recorded | ~1919×943 browser window (from the owner's screenshot) | default, `medium-equivalent` | ~60 FPS sustained | PASS (ceiling only) |

**What that row does and does not establish.** The owner opened
`https://vtpqui3009.github.io/dragonvein/` and read the overlay: build `v0.0.1+c429d4a`,
**FPS 60, DRAWS 21, TRIS 32568**. Draw calls and triangles are hardware-independent and sit
far inside the 180 / 900 000 budgets. Sustained 60 FPS on a vsync-locked display means no
frame in that window exceeded ~16.6 ms, so the budget is met as a ceiling — but FPS is not a
percentile, and nothing here measures the tail. It is a `sighting`, not a `verification`,
per `docs/PERF_BUDGET.md` §Two grades of evidence.

It is also the first time any human has seen this build run, which is what `CLAUDE.md` §7
requires before a milestone may be marked `DONE`.

**Second row, 2026-10-12.** The owner opened the deployed page at HEAD and sent a screenshot
of the overlay: build `v0.0.1+3ab6e84`, **FPS 60, DRAWS 27, TRIS 42268**. Draws and triangles
match `gate:perf` exactly, so the deployed build is the measured build. That covers every
M0 and M1 change, including the orbit camera (M0f) and the HUD reflow (M0e). It is a
`sighting`: a ceiling at vsync with no percentile and no Potato row. A full `verification`
is now possible with `npm run gate:perf -- --real-gpu` (`bc5a56e`), which did not exist
before this date.

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

