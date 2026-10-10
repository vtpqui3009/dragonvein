# FINDINGS

Critic reports, newest at the top. Written by the critics, read by the builders.
Cleared only when the defect it names is fixed and the fix is committed.

---

# M0 — run 2026-10-09 — cycle 1

**Scores: art-critic 7.6 · perf-critic 3.8 · gameplay-critic 8.8.** Two of three are below
the 8.0 ship bar, so M0 does not ship on this cycle.

Each critic renormalised over the rubric lines that have a subject at M0 and said so in
its report. Lines with no subject at M0: A4 (no creature generators until M1), P3 (no
runtime mesh builder until M3), G2/G4/G6 (no breeding, persistence or input until M8/M9).

Two corrections the run owes the critics, recorded here rather than silently applied:

- **P6 was scored 0 where it has no subject.** Quality tiers are M6 in `docs/ROADMAP.md`
  and are listed under M0's deliberate out-of-scope in `STATE.md`. The scope note given to
  the perf-critic named P3 and omitted P6; that is the run's error, not the critic's. P6 is
  N/A for M0 and the re-score carries the corrected note.
- **AC4's check command can never pass as written.** `python3 -I -c "import dragon as D"`
  fails with `ModuleNotFoundError`, because isolated mode drops both the cwd and
  `PYTHONPATH` from `sys.path`; with no script argument there is no script directory to
  take their place. The Assets workflow's `python3 -I assetgen/render_proof.py` is correct
  precisely because a script argument puts `assetgen/` on the path. Found by the
  gameplay-critic outside its own table.

---


## art-critic — M0 Toolchain & deploy spine — run 2026-10-09
SCORE: 7.6 / 10

**A4 is N/A at this milestone.** M0 ships a placeholder island; there are no creature
generators and no `artifacts/variants/*.png` (the directory does not exist), so rubric
line A4 has no subject and is scored neither pass nor fail. Renormalisation: I scored the
eight lines that do have a subject (A1, A2, A3, A5, A6, A7, A8, A9), whose maxima sum to
**8.4**, then scaled: `score = earned / 8.4 x 10`. Earned = 6.40 → **7.6**. A4's 1.6 was
removed from the denominator, not awarded and not forfeited.

### Line by line

| # | line | max | earned | basis |
|---|---|---|---|---|
| A1 | Silhouette at 25% | 1.2 | 0.9 | canopy reads; lower cone merges into sky at 1.04:1 |
| A2 | Palette within ΔE 12 | 1.0 | 0.8 | sky/UI ΔE ≤ 1.2; island tiers ΔE 17–21 (value, not hue) |
| A3 | Key, fill, contact shadow | 1.2 | 0.7 | key + contact shadows yes; fill ≈ 0%, no rim |
| A4 | Variant sheets | 1.6 | — | **N/A — no subject at M0** |
| A5 | Nothing pops/teleports | 1.2 | 1.1 | draws/tris identical across t+4.3/8.0/11.6 s |
| A6 | Density / lived-in frame | 1.4 | 0.85 | island well dressed; 81.4% of frame is empty gradient |
| A7 | HUD 4.5:1 @1280×720 | 1.0 | 1.0 | measured 8.81:1 – 14.82:1 |
| A8 | No z-fight/seam/magenta | 0.8 | 0.6 | 0 magenta, 0 seams; 16 shadow-acne speckles |
| A9 | Matches concept intent | 0.6 | 0.45 | island form reads; companion islands + crystals absent |
| | **total (A4 excluded)** | **8.4** | **6.40** | → 7.6 / 10 |

### Defects

- [major] A3 — `artifacts/shots/01-wide.png`, island underside cone, left flank, region
  x 540–660 / y 520–640: the key-averted face is crushed to pure black. Measured
  `px(560,560) = (0,0,1)`, `px(580,590) = (5,2,1)`, relative luminance 0.0000–0.0008,
  against the sun-lit cliff `px(~700,470) = (80,49,28)`, luminance 0.025. Fill/key ratio
  is 0–3%; `ART_BIBLE.md` §Lighting specifies "one cool fill from the opposite side at
  roughly 20% of key intensity", and AC8 asserts a cool fill. There is also no cool tint
  anywhere in shadow — the darkest island pixels are warm-black `(5,2,1)`, not blue.
  6.3% of all island pixels sit below luminance 0.002. Reproduce:
  `python3 -I -c "from PIL import Image; p=Image.open('artifacts/shots/01-wide.png').convert('RGB').load(); print(p[560,560], p[580,590], p[700,470])"`
- [major] A3 — `artifacts/shots/01-wide.png`, left-hand isolated conifer at x 441–456,
  y 300: no warm rim on any sky-facing silhouette edge. A horizontal scan across the tree
  gives sky `(195,111,59)` → edge blend `(75,84,35)` → interior `(97,140,39)` →
  `(126,163,49)`: brightness rises *inward*, never at the edge; the far edge falls
  `(103,136,30)` → blend `(149,124,44)` → sky. Same pattern on every tree edge sampled.
  The bible's third light ("one warm rim") is not in the render. Two of the three
  specified lights are missing, which is why A3 lost over 40% of its line.
- [major] A6 — `artifacts/shots/01-wide.png`, whole frame: the island covers 171,559 of
  921,600 px (**18.6%**); the other **81.4%** is a featureless two-stop gradient. No
  second island, no clouds, no birds, no distant silhouettes, no particles. The matching
  reference `docs/concept/03-island-scene.png` places two further islands (top-centre and
  right-of-centre) at different depths precisely to make the frame a *world* rather than
  a *prop on a backdrop*. Nothing on the island reads as inhabited either — no path, no
  structure, no crystal shards (the concept has three clusters at left-of-centre).
  Reproduce the coverage number: mask any pixel in x 400–890, y 250–650 that differs by
  >8 (sum of channel deltas) from the same-row sky reference at x=50.
- [major] A1 — `artifacts/shots/01-wide.png` and `02-silhouette.png`, bottom tip of the
  rock cone, x 620–700 / y 600–645: the island's lower silhouette merges into the flat
  lower sky. Measured at (640,625): cone `(28,15,7)` luminance 0.0060 vs sky `(26,20,32)`
  luminance 0.0082 → **1.04:1**; at (660,610) it is **1.01:1**; the left edge at (580,590)
  reaches only 1.15:1. The lower sky is a single flat colour `#1a1420` for the bottom 97
  rows (column x=60), so there is nothing for the dark cone to separate against. At 25%
  zoom (`02-silhouette.png`) the island therefore reads as a disc that fades out instead
  of a disc-on-spike. The canopy half of the silhouette is fine; only the lower ~45% of
  the island merges, hence major and not blocking.
- [minor] A2 — `artifacts/shots/01-wide.png`, island surface: hues are on-bible but values
  are not. Sunlit leaf tips top out at `#7ea331` (L\*=62.4, h=119.5) against
  `foliage light #8fd24a` (L\*=77.5, h=126.1) → ΔE 20.9; lit cliff rock `#50311c`
  (L\*=23.6, C=22.3, h=58.6) against `rock mid #5a4a40` (L\*=32.8, C=9.9, h=59.5) →
  ΔE 15.5; scatter rock `#3f2615` → ΔE 17.3. The hue angles are within 1–7° of the bible
  in every case, so these are not off-bible hues — the island is simply rendered ~10–15 L\*
  under-exposed with chroma doubled by the warm key. The rubric's ΔE 12 bound is
  nonetheless exceeded on the island's three-value tiers.
- [minor] A8 — `artifacts/shots/01-wide.png`: 16 isolated dark pixels on otherwise smooth
  lit faces, most visibly a 4-px dotted line down a cone face at (636,353)–(639,342), plus
  singles at (793,266), (515,269), (834,269), (823,295), (698,327), (800,385). This is
  shadow-map acne (self-shadow bias), 0.009% of island pixels, invisible at 100% zoom.
  **I am deliberately not marking it blocking**: it is not coplanar z-fighting (no paired
  surfaces, no flicker demonstrable across the three stills) and A8's blocking clause
  exists for visible breakage. Reproduce: for each pixel in x 420–870 / y 260–500, flag it
  when the median of its 4-neighbours exceeds it by >18 luma while those neighbours span
  <10 luma.
- [minor] A9 — `artifacts/shots/01-wide.png` vs `docs/concept/03-island-scene.png`: the
  rock cone is built from roughly 4–5 radial segments (three flat facets visible in
  x 540–760 / y 520–660), reading as a faceted diamond where the concept's cone is smooth.
  Also absent vs the concept: the companion islands and the glowing crystal shards.
- [minor] A5 — no motion artefact exists for a milestone whose definition of done is a
  *rotating* placeholder. `artifacts/turntables/` is empty and there is no `.webm`. A5 is
  assessed from three stills plus `artifacts/playtest.log`; that is weak evidence, and the
  0.1 withheld on this line is for the missing evidence, not for an observed pop.

### What is good — preserve this

- **The sky is exactly on spec and should not be touched.** `01-wide.png` zenith at
  (900,4) = `#0a1c4f`, **ΔE 0.0** vs `sky zenith`; horizon band at (1100,195) = `#fe8f44`,
  **ΔE 0.5** vs `sky horizon`; lower band `#1a1420`, **ΔE 0.0** vs `deep shadow`. The
  gradient also carries a horizontal term (15–17 distinct values across a single scan row
  at y=100), and survives full autocontrast amplification with **no banding**.
- **Contact shadows are there, and they are the bible's "mandatory" ones.** Visible as
  dark pools under every conifer, bush and scatter rock in x 400–880 / y 380–520. Nothing
  in the frame floats. This is the single hardest part of A3 and it was done.
- **The island surface genuinely satisfies the bible's Density clause.** Crop
  (600,400)–(800,500) of `01-wide.png`: rocks, round bushes, grass tufts and trunks fill
  every gap; there is no bare grass between features. The A6 deduction is about the frame,
  not about this dressing — keep the dressing exactly as it is and extend it outward.
- **Scatter has real variation already.** Conifers vary in tier count (2 vs 3 stacked
  cones), height, rotation and green tier; `#194914` / `#3d761c` / `#7ea331` read as the
  bible's dark/mid/light three-value scheme on one asset.
- **HUD passes contrast with enormous headroom.** Panel `#0b2335`; accent `#ffd479` at
  **11.44:1**, white `#eef7fd` at **14.82:1**, dimmest antialiased glyph `#ddbc70` at
  **8.81:1** — all at native 1280×720, all well past 4.5:1. `UI accent` is pixel-exact to
  the bible.
- **Clean render hygiene.** 0 magenta pixels frame-wide (test: r>180 ∧ b>180 ∧ g<80),
  no seams at the grass/cliff/cone junctions, and real antialiasing (single blended edge
  pixel at (441,300)). `artifacts/playtest.log` reports `page errors: 0`.
- **No asset pop.** `draws 20 / tris 26984` are identical in the HUD of `00-boot.png`
  (t+4.3 s), `01-wide.png` (t+8.0 s) and `03-late.png` (t+11.6 s), and the island is at a
  different rotation in each — it rotates, and nothing streams in or out after boot.

### Blocking defects
None. 0 of the rubric's blocking conditions (A4 eight-seeds-as-one, A5 pop, A8
z-fight/seam/magenta) is met. The score is not capped; 7.6 is the number the table
produces.

SCORE_MACHINE: 7.6

---

## perf-critic — M0 Toolchain & deploy spine — run 2026-10-09
SCORE: 3.8 / 10

Renormalised over the lines that have a subject. P3 (bred-dragon mesh build) has no
subject at M0 — there is no runtime mesh builder until M3 — so its 1.8 is removed from
the denominator rather than scored. Denominator = P1 2.5 + P2 1.8 + P4 1.5 + P5 1.2 +
P6 1.2 = **8.2**. Earned = P1 0 + P2 1.8 + P4 0.3 + P5 1.0 + P6 0 = **3.1**.
3.1 / 8.2 x 10 = **3.78 -> 3.8**. One blocking defect is present, which caps this critic
at 5.9; the cap does not bind because the earned score is already below it.

### Line by line, with the key each number came from

| # | line | awarded | the number I scored |
|---|---|---|---|
| P1 | p95 frame <= 16.6 ms @1080p Medium | 0 / 2.5 | `frames.p95 = 366.6 ms` (22.1x budget), `budget.frameMs = 16.6`, `softwareRenderer = true`, `frameBudgetEnforced = false` |
| P2 | Draw calls <= 180 | 1.8 / 1.8 | `drawCalls = 20` vs `budget.drawCalls = 180` (11.1%); `triangles = 26984` vs `budget.triangles = 900000` (3.0%); `errors = []` |
| P3 | Bred-dragon mesh build <= 120 ms | N/A | no subject at M0; excluded from the denominator |
| P4 | No frame-loop allocation; GC pauses < 2 ms | 0.3 / 1.5 | no `heap`/`gc` key exists in perf.json. My own reproduction: `Runtime.getHeapUsage.usedSize` sawtooths 3092 -> 3876 KB and resets, repeatedly |
| P5 | Bundle <= 1.4 MB gzip; boot to first frame <= 2.5 s | 1.0 / 1.2 | `npm run build`: 1.22 + 2.99 + 131.84 = **136.05 kB gzip** (9.7% of 1.4 MB); boot-to-first-frame **47.2 ms**, FCP 104 ms (my probe; no key in perf.json) |
| P6 | Potato tier holds 30 fps @720p | 0 / 1.2 | no `tier` key in perf.json. Only 720p figure that exists is `playtest.log: stats.frameMs = 50` = 3 vsync ticks = **20 fps presented**, under 30 |

Every perf.json key was read: `budget.frameMs`, `budget.drawCalls`, `budget.triangles`,
`status`, `renderer`, `softwareRenderer`, `frameBudgetEnforced`, `frames.p50`,
`frames.p95`, `frames.max`, `drawCalls`, `triangles`, `errors`. There is no key for
heap, GC, viewport, quality tier, bundle size or boot time. `status = "complete"` and
`errors = []`, so the artefact is a real completed run, not a crash stub; it is fresh
(written 14:17Z, run started 14:13:39Z per STATE.md).

I re-ran `npm run gate:perf` and `npm run gate:smoke` myself, which overwrote these two
artefacts. **I restored the originals** so the other two critics score the same bytes.
Both the original and my re-run numbers are quoted below.

### Defects

- [blocking] **P1 — the frame budget, which CLAUDE.md §2 calls law, is not verified by
  anything in this milestone, and the one number that exists is 22x over it.**
  `artifacts/perf.json: frames.p95 = 366.6 ms` against `budget.frameMs = 16.6 ms`, with
  `softwareRenderer = true` and `frameBudgetEnforced = false`. Both readings of the rubric
  land in the same place: scored on the number, the line is over budget; scored on
  validity, the line has no usable measurement. A missing measurement is a failure, not an
  excuse, so this is 0 and it is blocking. Note that STATE.md AC5 asks only that
  `frameBudgetEnforced` be "stated honestly", and it is — the milestone meets its own
  acceptance criterion while the rubric line stays unmet. Nothing in the artefacts or in
  STATE.md records a real-GPU verification having ever been done, which
  `docs/PERF_BUDGET.md` says is a required human step.
  Repro: `npm run gate:perf`, then read `artifacts/perf.json`.

- [major] **P1 instrument — the gate measures presented-frame interval, not frame cost,
  and its resolution is exactly the size of the whole budget.** I collected 120 raw
  `requestAnimationFrame` deltas from the built page at 1920x1080. Every single one is an
  integer multiple of 16.667 ms: `maxDeviationFromAnIntegerMultiple = 0.010 ms`,
  `smallestDelta = 33.3 ms` (2 ticks), `largestDelta = 849.9 ms` (51 ticks). Every frame
  figure in every artefact is likewise a whole number of ticks — 50 = 3, 199.9 = 12,
  366.6 = 22, 400 = 24, 649.9 = 39, 799.9 = 48, 116.7 = 7, 249.9 = 15. Two consequences.
  (1) The metric cannot resolve anything finer than 16.667 ms, so it can never show that
  a frame fits a 16.6 ms budget; it only counts vsync intervals missed. (2) The real-GPU
  branch at `tools/gate-perf.mjs:113` — `if (!software && report.frames.p95 >
  BUDGET.frameMs)` — is red by construction: a perfect app presenting on every vsync
  reports p95 = 16.667, and 16.667 > 16.6. The moment this gate reaches real hardware it
  fails a passing build. The fix is not to touch 16.6. It is to measure cost instead of
  cadence: wrap `renderer.render` with `performance.now()` for CPU time, add a GPU timer
  (`EXT_disjoint_timer_query_webgl2`) for GPU time, and launch Chromium with
  `--disable-gpu-vsync --disable-frame-rate-limit` so rAF stops quantising.
  Repro: `/tmp/claude-0/-home-user-dragonvein/b20a94b2-5fc1-5296-9b70-6bd7cf63dc29/scratchpad/quantise.mjs`.

- [major] **P1 — the recorded frame figure is not reproducible, so it could not detect a
  regression even as an advisory number.** Same commit, same build, same container,
  gate re-run once: `frames.p50` 199.9 -> 316.7 ms, `frames.p95` 366.6 -> 649.9 ms,
  `frames.max` 400 -> 799.9 ms. That is +77% on p95 with zero code change. A 4-vCPU
  SwiftShader container has more run-to-run noise than any plausible regression signal.
  By contrast `drawCalls = 20` and `triangles = 26984` came back bit-identical.
  Repro: `npm run gate:perf` twice and diff `artifacts/perf.json`.

- [major] **P4 — the frame loop does allocate, measured, contradicting the claim in the
  source.** `src/main.ts:355` is commented `frame loop: counters only, no allocation` and
  `src/main.ts:375` explains the HUD was moved to a `setInterval` to keep the loop
  allocation-free. Sampling the JS heap from outside the page over CDP (`Runtime.getHeapUsage`,
  60 samples at 400 ms, so no in-page instrumentation of my own is in the measurement)
  gives a clean periodic sawtooth: 3092 -> 3876 KB, drop, 3126 -> 3833 KB, drop,
  3093 -> 3847 KB, drop, and so on, `min = 3029 KB`, `max = 4383 KB`. Amplitude ~780 KB
  per cycle, cycle ~8 samples = ~3.2 s, and at the measured `frameMs = 116.7` that is
  ~27 frames, i.e. **~29 KB allocated per frame**. At a real 60 fps that is ~1.7 MB/s and
  a young-generation scavenge roughly every half-second. Repeated at 1920x1080 with the
  same shape (3215 -> 4092 KB). This is the rubric's stated failure condition for P4
  ("heap sawtooth"). The 0.3 I did award is for the one thing the data supports: there is
  no leak — net heap over 24 s is 4383 -> 3254 KB, flat to declining. GC pause duration
  is not measured anywhere, so the second half of the line earns nothing.
  Repro: `/tmp/claude-0/-home-user-dragonvein/b20a94b2-5fc1-5296-9b70-6bd7cf63dc29/scratchpad/measure-heap-cdp.mjs`.

- [major] **P4 — perf.json records no heap or GC data at all.** `tools/gate-perf.mjs`
  captures only `frames`, `drawCalls`, `triangles`, `errors`. A perf-critic reading only
  the artefacts, as the rubric says it must, has literally nothing to score P4 from and
  would have to score it zero. The gate should sample `Runtime.getHeapUsage` across its
  existing 240-frame window and write `heap: { minKB, maxKB, sawtoothAmplitudeKB,
  netGrowthKB, bytesPerFrame }`. Those numbers are CPU-side and hardware-independent, so
  unlike the frame time they are fully trustworthy in this container — this is a budget
  the container *can* police and currently does not.

- [major] **P6 — there is no potato tier to measure, and the only 720p number available is
  under 30 fps.** perf.json has no `tier` key; `docs/PERF_BUDGET.md` §Quality tiers
  describes detection at boot, and STATE.md puts quality tiers in M6. The one 720p
  figure in the artefacts, `playtest.log: stats:{"drawCalls":20,"triangles":26984,
  "frameMs":50}`, is 3 vsync ticks = 20 fps presented; my own 720p sampling gives
  p50 = 116.6 ms, p95 = 249.9 ms. Software rasteriser again, so the number is advisory,
  but there is no configuration in the build that disables shadows or post for a potato
  path, so the line has a subject only in the sense that a 720p viewport can be opened.

- [minor] **P5 — both halves of P5 are absent from perf.json.** No `bundleBytes`, no
  `bootMs`. I had to run `npm run build` and write my own navigation-timing probe to score
  this line, which the rubric says a critic should not have to do. Both pass comfortably:
  gzip 136.05 kB of a 1.4 MB budget (independently `gzip -9` over `dist` excluding maps =
  134,952 bytes), and first frame at 47.2 ms after navigation start, FCP 104 ms,
  `loadEventEnd` 152.6 ms, against a 2.5 s budget. Caveat on the boot figure: it is
  loopback `vite preview` with no network latency and an empty `public/assets` directory,
  so it is a floor, not a prediction of Pages. Docked 0.2 for being unrecorded.

- [minor] **P5 — `dist/` ships 2,842,273 bytes of source map** for a 526,772-byte chunk
  (`dist/assets/three-DWYlhZQ1.js.map`), 2.1x the entire gzip bundle budget. Maps are not
  part of the gzip budget and are fetched only by devtools, so this is not a violation, but
  it is 3.4 MB of `dist` where 0.5 MB is the product. Worth a `build.sourcemap: 'hidden'`
  decision before Pages becomes the shipping path.

- [minor] **P1 — nothing in the artefact proves the "@1080p Medium" qualifier.** perf.json
  has no viewport key and no tier key. The 1920x1080 viewport is only discoverable by
  reading `tools/gate-perf.mjs:63`, and "Medium" does not exist as a configuration yet.
  `frames` also records no sample count, so a reader cannot tell the p95 came from 180
  retained samples (240 collected, first 60 dropped as warm-up, `gate-perf.mjs:84`).

### What is good

- **The hardware-independent half of the gate is genuinely sound and genuinely passing.**
  `drawCalls = 20` against a 180 budget and `triangles = 26984` against 900 000 are the
  two numbers that actually regress when somebody forgets to instance a prop, they are
  reproducible to the digit across runs, and they are enforced unconditionally at
  `tools/gate-perf.mjs:106-111`. `errors = []` and `playtest.log: page errors: 0`.
- **The artefact is honest about its own limits.** `softwareRenderer: true` and
  `frameBudgetEnforced: false` are recorded rather than quietly omitted, and
  `renderer` names SwiftShader in full. A gate that logged "gate:perf OK" without those
  two keys would have been far worse than this one. The evidence-first ordering
  (`gate-perf.mjs:33-43`: `mkdir` and a `status: "incomplete"` stub before anything that
  can throw) means a crash still leaves critics something to read.
- **P5 is not close to its budget.** 9.7% of the gzip allowance with Three.js already in
  the bundle leaves real room for the genome and asset code to come.
- **No leak.** Net heap over 24 s of continuous rendering is flat to declining
  (4383 -> 3254 KB), so the P4 problem is churn, not retention — a much cheaper fix.

### What it would take to make P1 scoreable

In priority order, none of which involves changing 16.6: (1) measure frame *cost* — CPU
ms around `renderer.render` plus a WebGL2 timer query — instead of rAF cadence, and record
both; (2) launch the gate's Chromium with `--disable-gpu-vsync --disable-frame-rate-limit`
so the instrument stops quantising to 16.667 ms; (3) fix `gate-perf.mjs:113` so a
vsync-locked 16.667 ms does not fail a 16.6 ms budget once real hardware appears;
(4) add `viewport`, `tier`, `sampleCount`, `heap` and `bootMs` keys to perf.json;
(5) add a row to STATE.md recording the date, machine and p95 of the last human real-GPU
verification, since `docs/PERF_BUDGET.md` already requires that step and nothing records
it. Until (1) and (5) exist, DRAGONVEIN's most important budget is an aspiration.

SCORE_MACHINE: 3.8

---

## gameplay-critic — M0 Toolchain & deploy spine — run 2026-10-09
SCORE: 8.8 / 10

### Scope and renormalisation

M0's loop is the boot-and-render loop only: the page loads, a lit island renders, it
rotates, the overlay reports live stats. There is no breeding, no save and no input
handling at M0, so three rubric lines have **no subject** and are reported N/A rather
than failed:

| line | max | verdict |
|---|---|---|
| G1 the milestone's loop completes start to finish | 2.2 | **2.1** |
| G2 a bred dragon is visibly its parents' child | 1.8 | **N/A — no subject** |
| G3 every action gives feedback within 100 ms | 1.4 | **1.2** |
| G4 state survives reload | 1.4 | **N/A — no subject** |
| G5 no softlock, unreachable state, negative currency | 1.6 | **1.3** |
| G6 mouse and touch both work | 1.6 | **N/A — no subject** |

G2 has no subject: `src/` contains exactly one file (`src/main.ts`); there is no runtime
genome or dragon builder, `gate:parity` and `gate:meshgen` both print SKIP ("the
TypeScript genome/builder does not exist yet"), and `artifacts/` contains no variant
sheet or breeding triptych. `docs/concept/02-breeding.png` is a concept reference, not a
build output, so there is nothing rendered to compare a child against. G4 has no subject:
nothing is persisted — no IndexedDB, no save path. G6 has no subject: `src/main.ts`
registers no pointer, mouse, touch or key listener; the camera is fixed at
`camera.position.set(12.7, 7.0, 15.5)`.

**Renormalisation.** Awarded 4.6 out of the 5.2 points that have a subject
(G1 2.2 + G3 1.4 + G5 1.6 = 5.2). 4.6 / 5.2 × 10 = **8.8**. The 4.8 points of N/A lines
(G2 1.8 + G4 1.4 + G6 1.6) are excluded from both numerator and denominator rather than
scored zero or scored full.

### Did I verify the island actually rotates? Yes — three independent ways

1. **Pinned-clock angle test** (strongest). The rotation is driven by the rAF timestamp:
   `src/main.ts:368` → `island.rotation.y = now * 0.00012`, so one revolution is
   `2π / 0.00012 = 52359.9 ms`. I overrode `requestAnimationFrame` from an init script to
   feed the page a pinned timestamp and screenshotted at chosen angles. Diff is % of
   pixels in the island region (x 400–880, y 230–660 of the 1280×720 frame) differing by
   > 24 summed-RGB:

   | clock delta | expected rotation | island pixels changed |
   |---|---|---|
   | 0 ms (same clock, later wall time) | 0° | **0.00 %** |
   | +13090 ms | 90° | **34.69 %** |
   | +26180 ms | 180° | **34.32 %** |
   | +52359.9 ms | 360° | **0.00 %** |

   A full predicted period returns the frame to a pixel-exact match, and quarter and half
   periods do not. That is rotation about Y at the rate the source declares, not drift,
   not dithering noise, and not a still image. Repro: the script printed above was run as
   `node <script>` from the repo root against `tools/preview-server.mjs` on port 4196.

2. **Free-running pixel diff.** With the clock untouched, screenshots 2.5 s apart differ
   on 9.10 % / 9.02 % / 8.53 % of non-HUD pixels, while a frame diffed against itself
   gives 0.000 % — so the renderer is deterministic for a fixed scene state and every
   nonzero diff is genuine motion.

3. **The shipped artefacts agree.** `artifacts/shots/00-boot.png` (t+4.4 s),
   `01-wide.png` (t+8.1 s) and `03-late.png` (t+11.3 s) show the same 44-tree scatter at
   three visibly different yaw angles — the tall twin pines sit right-of-centre in
   `00-boot.png` and left-of-centre in `03-late.png`.

### Defects

- [major] G5 — **WebGL context loss is unrecoverable and unsignalled.** `src/main.ts`
  registers no `webglcontextlost` / `webglcontextrestored` handler and nothing calls
  `restoreContext()`. After an induced loss the canvas is dead for the rest of the
  session; only a manual reload recovers. Measured: `lost: true`, `restored: false` after
  4 s of waiting. This matters because `CLAUDE.md` §0 names a weak Intel iGPU as the
  target, where driver resets are a normal event, not a lab trick.
  Repro:
  ```
  cd /home/user/dragonvein && npm run build
  node -e "<playwright script>"   # or: see the exact script below
  ```
  Minimal reproduction, run from `/home/user/dragonvein` with a page open on
  `tools/preview-server.mjs`:
  ```js
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await page.waitForTimeout(4000);          // canvas never comes back
  ```

- [minor] G3 — **The overlay reports a false 60 FPS over a dead canvas.** Same trigger as
  above. After the context is lost the canvas renders as Chromium's broken-image glyph,
  yet the HUD still prints `FPS 60  DRAWS 20  TRIS 26984`. The cause is that
  `src/main.ts:362-371` keeps `frameMs = now - last` ticking from rAF (which still fires)
  while `renderer.info.render` is frozen at its last good values, so the 250 ms sampler at
  `src/main.ts:376-384` divides live rAF ticks by live rAF time and lands on 60. A readout
  whose entire job is to tell the truth about the frame is telling the opposite of the
  truth at exactly the moment it matters. Pointer: screenshot at
  `/tmp/claude-0/-home-user-dragonvein/b20a94b2-5fc1-5296-9b70-6bd7cf63dc29/scratchpad/after-context-loss.png`.

- [minor] G1 — **Reload is 5.3× slower to first frame than a cold load, and one sample
  broke the 2.5 s boot budget.** Time from navigation to the first frame with
  `drawCalls > 0`, measured in-page with `performance.now()`:
  cold `293.6 ms`; three consecutive reloads `1577.5 ms`, `1564.7 ms`, `1678.4 ms`; an
  earlier run under load measured `2532.1 ms`, which is over the `P5` budget of 2.5 s.
  A warm cache should make reload faster, not slower, so this is a context/renderer
  re-initialisation cost rather than a download cost. Repro: drive
  `tools/preview-server.mjs`, poll `globalThis.__dragonveinStats()` every 8 ms from an
  init script, record `performance.now()` at the first frame with `drawCalls > 0`, then
  `page.reload()` three times.

- [minor] G1 — **The live Pages URL could not be confirmed end to end from this sandbox.**
  `curl -sS https://vtpqui3009.github.io/dragonvein/` returns
  `curl: (56) CONNECT tunnel failed, response 403` — the agent proxy blocks `github.io`,
  so this is an environment limit, not necessarily a build fault. The deploy leg is green
  by every proxy available to me: `gh run list` shows `Deploy to Pages` run `37942614388`
  concluded `success` and `CI` run `37942614529` concluded `success` on the head commit,
  and `gh api .../deployments` shows environment `github-pages` at sha
  `bf79d55eddb7333a2c8c9f7638324cfc7990327e`. But M0's definition of done says "Pages
  serves a lit, rotating placeholder", and nobody in this run has seen that URL return
  200. Per `CLAUDE.md` §7, a milestone no human has seen running is not `DONE`.

### Not scored — outside the gameplay table, recorded because I checked it

- `STATE.md` AC4 does not reproduce in this container. `cd /home/user/dragonvein/assetgen
  && python3 -I -c "import dragon as D; D.place"` →
  `ModuleNotFoundError: No module named 'dragon'`, because `-I` (isolated mode) strips
  both the cwd and `PYTHONPATH` from `sys.path`, so the criterion as written can never
  pass. Dropping `-I` gets further and then fails at `assetgen/dragon/builder.py:6`,
  `import bpy, math, colorsys` → `ModuleNotFoundError: No module named 'bpy'`. The
  package layout itself looks right (`assetgen/dragon/__init__.py` exists). No
  gameplay-rubric line covers asset authoring, so this changes no score; it belongs to
  whoever owns AC4.
- Frame times here are software-rasterised and far over budget (`gate:perf`:
  `p50=183.3 ms p95=333.4 ms`, renderer `SwiftShader`, `perf.json`
  `"frameBudgetEnforced": false`). That is `P1`/`P6`, the perf-critic's table, and I do
  not score it. It did not prevent any part of the M0 loop from completing.

### What is good

- **The loop completes, repeatedly and silently.** `npm run build && npm run gates` exits
  0 end to end (26 tests, 2 files). `npm run gate:smoke` reproduces cleanly: `boot: OK`,
  four shots written, `page errors: 0`, `gate:smoke OK`. Across every session I drove —
  three reloads, a resize to 320×180 and back to 1280×720, a continuous 65 s run — the
  page logged **zero** `pageerror`, zero console errors and zero failed requests.
- **The overlay reports genuinely live stats, and honest ones.** `BUILD v0.0.1` is
  injected from `tools/site-config.mjs`, `DRAWS 20` and `TRIS 26984` match
  `__dragonveinStats()` exactly, and `FPS` moved 3 → 5 → 8 → 9 across samples rather than
  sitting on a hardcoded number. Under SwiftShader it reports the ugly truth, which is the
  right behaviour for a diagnostic readout.
- **Boot has a visible, sequenced hand-off.** The `#boot` title card is in static HTML so
  it paints before any JS, and I measured the sequence: `draws > 0` at t+313 ms, opacity
  fading 1 → 0.78 → 0.27 from t+388 ms, element removed at t+789 ms. The player never
  looks at an undecorated blank page.
- **Resize is handled and does not corrupt the loop.** At 320×180 the canvas backing store
  tracked the client box exactly (`w:320 h:180`) and `drawCalls`/`triangles` were
  unchanged at 20 / 26984, so the aspect update at `src/main.ts:345-353` is doing its job
  and nothing leaks a stale projection matrix.
- **The spine tests assert the contract rather than passing vacuously.** `tests/spine.test.ts`
  checks that the Vite `base` and the URL the gates poll are the same string, that
  `index.html` declares every element id `src/main.ts` looks up, that `__dragonveinStats`
  publishes the three fields `gate:perf` reads, and that `gate:perf` still enforces
  16.6 ms / 180 draws / 900 000 triangles — i.e. a test that would catch someone quietly
  widening the budget.

SCORE_MACHINE: 8.8

---

## art-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 2)
SCORE: 6.9 / 10

**Scope renormalisation.** M0 ships a lit, rotating placeholder island. There are no
creature generators and no `artifacts/variants/*.png`, so **A4 (1.6) has no subject and is
excluded from the denominator** rather than scored 0. Every other A-line has a subject.
Denominator = 10.0 − 1.6 = **8.4**. Score = 5.78 / 8.4 × 10 = 6.88 → **6.9**.

**Artefact-set caveat.** A build was rewriting `artifacts/` during this review. Every
number below was re-measured against the files on disk at review end:
`01-wide.png` md5 `9f18c2ad413fbb7ff50225f935cf4a87`,
`04-context-restored.png` md5 `06e431f1f7791b8607c6a0432197c9c4`,
`m0-island.webm` md5 `3b96df657d996fe4cda3b78bc20b4c9a`. All pointers reproduce on those.

| # | line | awarded / max | basis |
|---|---|---|---|
| A1 | Silhouette reads at 25% zoom | **1.00** / 1.2 | Island reads as disc + inverted spire + spiked crown in `02-silhouette.png`; canopy interior merges into one mass |
| A2 | Palette inside `ART_BIBLE.md` within ΔE 12 | **0.60** / 1.0 | Sky and hero island ΔE 0.0–7.6; 5 of 6 satellite decks ΔE 14.5–20.8; haze band ΔE 18.6 |
| A3 | Lighting: key, fill, contact shadow | **0.70** / 1.2 | Key direction + hero-deck cast shadows present; fill absent inside shadow (2698 px at RGB sum < 30, min `[0,0,2]`); no warm rim; satellites receive no shadows |
| A4 | Variant sheets show real variation | **excluded** | No subject at M0 — removed from denominator |
| A5 | Nothing pops, teleports or interpenetrates | **0.70** / 1.2 | No pop found — `DRAWS 28` / `TRIS 28474` pixel-identical across all 5 shots; but the turntable is 2.88 s not 7 s, holds ~14 unique renders, and is stale relative to the shots |
| A6 | Density: reads as a lived-in place | **0.80** / 1.4 | Hero deck genuinely dressed (16.0% edge density); 6 of 7 islands bare; 0 edge pixels in the bottom-left quarter of the frame |
| A7 | HUD readable at 1280×720, 4.5:1 | **0.90** / 1.0 | Measured 11.44:1 (gold) and 14.82:1 (white); worst-case background never tested |
| A8 | No z-fighting, seams, untextured magenta | **0.60** / 0.8 | 0 magenta px in all 5 shots; 23 isolated dark-stitch px (shadow acne) in `01-wide.png` |
| A9 | Matches intent of the concept image | **0.48** / 0.6 | All concept elements present and exceeded in lighting; crystals non-emissive, island is a lathe-perfect bowl |
| | **total** | **5.78 / 8.4** | **6.9** |

### Defects

- [major] **A2 — satellite-island decks are off-bible.** `artifacts/shots/01-wide.png`,
  measured as the modal colour of each deck strip, ΔE2000 against the nearest
  `ART_BIBLE.md` swatch:
  `sat SE (x1100-1210, y288-298) #a29666 → ΔE 20.8`;
  `sat W (x85-185, y288-298) #ae965a → ΔE 18.4`;
  `sat NE (x890-960, y104-112) #5a967e → ΔE 16.0`;
  `sat E (x995-1080, y196-205) #5a967e → ΔE 16.0`;
  `sat N (x605-670, y38-46) #7e9672 → ΔE 14.5`.
  Only `sat NW #5a9666 (ΔE 9.7)` is inside the ΔE 12 line. Two decks are frankly
  **turquoise** (`#5a967e`, blue > red) — see the 4× crop of `x870-1100, y85-235`. This is
  not aerial perspective: fog toward a `#ff9044` horizon cannot push green toward teal,
  and the tan `#ae965a` island sits at the same depth as the teal ones. The hero island by
  contrast is clean (foliage mid ΔE 1.5–1.7, foliage light ΔE 7.2, rock ΔE 6.9).
  Reproduce: the deck-sampling snippet above over `01-wide.png`.

- [major] **A3 — no fill light reaches shadowed geometry; shadows crush to black.**
  `artifacts/shots/01-wide.png`, island bbox `x410-875, y250-500`: **2698 px (2.32% of the
  bbox) have RGB sum < 30**, darkest pixel `[0, 0, 2]`. 10226 px (8.80%) are darker than
  1.5× the bible's `deep shadow #1a1420`. Densest black cells in
  `04-context-restored.png` are at `(x660-680, y380-420)` — 460 px of near-pure black
  inside the canopy. `ART_BIBLE.md §Lighting` specifies a cool fill at ~20% of key; a 20%
  fill cannot produce a shadowed *green* canopy at `(0,18,4)`. Reproduce:
  `python3 -I` summing `np.asarray(img)[250:500,410:875].sum(axis=2) < 30`.

- [major] **A3 — no warm rim on the island's backlit edge.** `01-wide.png`, sampling the
  brightest pixel in `y400-500` at each of `x = 840, 850, 858, 864, 868`: the only
  non-sky maximum is `[167,203,100]` at x850, which is a sunlit conifer face, not a rim.
  At `x858-868` the brightest value is `[203,153,122]`, i.e. the sky itself. The island
  silhouette steps straight from `#3e363d` rock to sky with no terminator highlight.
  `ART_BIBLE.md §Lighting` lists the warm rim as one of three required lights.

- [major] **A6 — all six satellite islands are undressed.** `01-wide.png`:
  `sat W (x78-192, y280-305)`, `sat SE (x1090-1220, y280-305)`, `sat NW (x160-262,
  y140-165)`, `sat N (x600-675, y25-50)`, `sat NE (x885-965, y100-118)`,
  `sat E (x985-1085, y175-200)`. Each is a flat untextured disc carrying 5–8 identical
  cones, with **zero** ground cover, zero scatter rocks and **zero cast shadows** on the
  deck. `ART_BIBLE.md §Density`: "A dressed island is never bare between features."
  Six of the seven islands in frame violate that line verbatim.

- [major] **A6 — the bottom quarter of the frame is literally featureless.** `01-wide.png`,
  Sobel-style edge density at threshold 12:
  `x0-540, y540-720` → **0 edge pixels (0.000%)`;
  `x745-1279, y540-720` → 16 px (0.017%);
  `x0-400, y420-540` → **0 edge pixels**.
  Compare the hero deck `x405-875, y250-540` → 16.03%. There is no cloud sea with form,
  no distant geometry, no mid-ground — just a blurred brown gradient. Reproduce: the
  `edge.py` band scan above.

- [minor] **A6 — the island's largest surface carries no detail.** `01-wide.png`, the bowl
  skirt `x410-875, y480-535` and the spire cone `x540-745, y540-645` (edge density
  **1.6%**). Together roughly a third of the island's screen area is a smooth
  `#3e363d → #2f2b35` gradient: no strata, no roots, no hanging growth, no scatter. It is
  also visibly a *different, cooler* material from the warm bowl above it
  (`#2f2b35` spire vs `#49362d` bowl at y505), which reads as two unrelated objects.

- [minor] **A6 — the dressing is four archetypes.** `03-late.png` crop
  `x410-870, y370-510` at 3×: every boulder is the same faceted hexagonal rock at a
  different scale, every bush the same low-poly blob, every tree the same two-stacked
  cone. Nothing is inhabited — no structures, no water, no creatures, no path furniture —
  so the frame reads as a well-dressed terrarium rather than a lived-in place.

- [minor] **A5 — the turntable does not meet its own spec and cannot resolve a short pop.**
  `artifacts/turntables/m0-island.webm` is billed as 7 s. Measured:
  `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames artifacts/turntables/m0-island.webm`
  → **72 frames**, last packet PTS **2.840 s**, container duration **2.880 s**. Of those 72
  frames only ~14 are distinct renders: frames 1–13 are byte-identical (frame-to-frame
  mean |Δ| = 0.00) and thereafter one new image arrives every ~5 video frames
  (mean |Δ| spikes of 3.9–13.3 at f018, f024, f030, f036, f041, f046, f051, f056, f061,
  f066, f071, with ≈0.2 between). Rotation therefore advances in one ~25 px step per
  unique frame — see the stacked crop of f017 vs f018 at `crop=500:220:390:340` — and the
  artefact cannot evidence the absence of any pop shorter than ~200 ms. Not scored
  `blocking`: this is the renderer's ~6 fps on SwiftShader recorded faithfully, which is
  P1's problem, not a content pop.

- [minor] **A5 — the turntable is stale relative to the shots it is meant to corroborate.**
  `ls -la --time-style=full-iso artifacts/` → `turntables/m0-island.webm` mtime
  **02:44:42**, while `shots/00-boot.png`…`04-context-restored.png` are **02:48:32–02:48:49**.
  The current `artifacts/playtest.log` ends with
  `turntable: Page did not produce any video frames` and `page errors: 1`, and the current
  `artifacts/perf.json` is a 342-byte stub reading
  `"status": "incomplete" … "if this is the final content, the gate crashed."` A5's
  dedicated artefact therefore belongs to a different run than the frames beside it.

- [minor] **A8 — shadow-map self-shadow acne stitches the conifer cones.** Isolated pixels
  that are ≥10 L darker than all four neighbours while those neighbours are flat (spread
  < 6), inside the island bbox: **23 px in `01-wide.png`** (bbox `x483-817, y260-493`),
  14 px in `03-late.png`, 11 px in `04-context-restored.png`. The clearest run is in
  `03-late.png` at `(660,335) (659,338) (658,342) (657,345)` — a dotted diagonal down a
  single cone face, visible as a stipple line at `crop=120:130:580:250` scaled 6×.
  Deliberately **not** tagged `blocking`: this is one-pixel shading acne on a curved
  surface, not a UV/texture seam and not z-fighting of coplanar geometry (`DRAWS`/`TRIS`
  are invariant and no flicker survives the codec noise floor).

- [minor] **A8 — hard-edged rectangular shadow blocks on the deck.**
  `04-context-restored.png` at `(x490-510, y425-440)` and `(x535-555, y458-472)`:
  shadow boundaries are axis-aligned staircases with no penumbra, characteristic of the
  1024 shadow map at this screen scale.

- [minor] **A1 — the canopy merges at 25%.** `02-silhouette.png`, `x120-200, y75-100`
  (= `01-wide.png` `x480-800, y300-400`): individual conifers are not separable, the
  forest reads as one green mass with a serrated top edge. The island as a whole reads
  fine, so this does not trip the line's fail condition, but no single tree is
  "identifiable as a black shape at 25% zoom" per `ART_BIBLE.md §Direction`.

- [minor] **A7 — the HUD's worst case is untested.** The panel occupies
  `x14-528, y14-52` in all five shots, entirely inside the dark zenith band (median scene
  luminance behind it **0.0146**). `ART_BIBLE.md` specifies the UI surface as translucent
  `rgba(11,36,48,0.82)`; over the horizon band at `y180-300` (`#fc8f44`, luminance ≈ 0.40)
  the measured 11.44:1 would not hold. Nothing in the artefact set shows the HUD over a
  bright background.

- [minor] **A9 — the crystals do not glow.** `docs/concept/03-island-scene.png` shows
  emissive cyan shards with light spill onto the grass at `(x390-430, y535-585)` and
  `(x525-580, y590-650)`. In `01-wide.png` the crystal cluster at `x432-566, y366-453`
  (781 px, brightest `[219,235,234]`) is matte, neutral-white and casts no spill. The
  concept's organic lumpy island edge has also become a perfect lathe-turned bowl.

### What is good

- **The hero island deck is genuinely dressed, and this is the single best thing here.**
  Edge density over `01-wide.png` `x405-875, y250-540` is **16.03%** against 1.01% for the
  upper sky. Five distinct prop classes are present and interleaved — conifers, faceted
  scatter boulders, low blob bushes, grass tufts and a crystal cluster — plus a dirt path
  curving from the rim at `(x760-820, y420-470)`. `ART_BIBLE.md §Density`'s "never bare
  between features" is satisfied *on the hero island*. Preserve this scatter.

- **The sky is dead-on the bible.** Sampled down the left edge of `01-wide.png`:
  `y8 #0a1c4f` → **ΔE 0.0** from `sky zenith`; `y180 #fc8f44` → **ΔE 0.5** from
  `sky horizon`; `y712 #1b1521` → **ΔE 0.3** from `deep shadow`. Three of the bible's ten
  swatches reproduced to within a ΔE of half a unit is excellent discipline.

- **A4's absence is handled honestly and A5's evidence is otherwise strong.** `DRAWS 28`
  and `TRIS 28474` are **pixel-identical** across `00-boot`, `01-wide`, `03-late` and
  `04-context-restored` (max |Δ| = 0 over the HUD region `x335-525, y20-46`), so nothing
  streams in, no LOD switches and the scatter is not reseeded. The crystal cluster tracks
  monotonically through the turntable (centroid cx 454 → 499 across f018 → f072) rather
  than jumping, and `04-context-restored.png` is compositionally intact after an induced
  WebGL context loss. No pop was found.

- **`02-silhouette.png` is an honest artefact, not a re-render.** It is a true **box**
  downscale of `01-wide.png`: mean |Δ| = **0.52**, max Δ = **2**, and **0** pixels differ
  by more than 24 (lanczos/bicubic/bilinear/nearest all score worse). The A1 artefact
  cannot be gamed by shooting a cleaner frame.

- **HUD contrast clears the bar with room.** Measured WCAG ratios at the shots' native
  1280×720: gold `#ffd479` labels **11.44:1**, white numerals **14.82:1** against the
  panel — both well over 4.5:1 — and the glyphs are crisp with no sub-pixel mush.

- **Zero untextured magenta anywhere.** 0 px with `r>180 & b>180 & g<90` across all five
  shots. Every surface in the frame has a material.

- **The build already exceeds its concept on lighting.**
  `docs/concept/03-island-scene.png` is a flat grey-mauve blockout with no cast shadows;
  `01-wide.png` delivers a golden-hour key with real tree-on-ground shadows, a graded
  sky and aerial depth. The concept's inventory — green disc island, inverted cone
  underside, conifers, pale crystal shards, scatter rocks, satellite cone islands above
  and to the right — is all present. A9 is close to full marks.

### Blocking defects

**None.** No defect here meets a `blocking` condition in `docs/RUBRIC.md`:
- **A4** (`8 seeds read as one object`) has no subject at M0 and is excluded, so it cannot
  block.
- **A5** (`any pop`) — none found. `DRAWS`/`TRIS` are invariant across every shot and the
  tracked feature moves monotonically. The turntable's ~14 unique frames are a low
  temporal sampling rate from a ~6 fps renderer, not a content pop.
- **A8** (`any z-fighting, seam, or untextured magenta`) — 0 magenta px; no coplanar
  z-fight (no flicker above the VP8 noise floor, and geometry counts never change). The
  23 isolated dark pixels in `01-wide.png` are one-pixel shadow acne on a curved cone,
  which I am scoring as a shading artefact rather than a seam. Stated explicitly so the
  call can be overruled: if the owner reads cone-face acne as a seam, A8 is `blocking` and
  this score caps at 5.9.

The score is below 8.0 on the strength of A6 (0.80 / 1.4) and A2/A3, not on a block.
The single highest-leverage fix is A6: dress the six satellite islands and put form into
the bottom quarter of the frame.

SCORE_MACHINE: 6.9

## perf-critic — M0 Toolchain & deploy spine — rework cycle 2 — run 2026-10-10
SCORE: 5.9 / 10

**Renormalisation.** Full table = P1 2.5 + P2 1.8 + P3 1.8 + P4 1.5 + P5 1.2 + P6 1.2 = 10.0.
Excluded as having no subject at M0: **P3** 1.8 (runtime mesh builder is `docs/ROADMAP.md`
row M3, "a genome becomes a `BufferGeometry` in a worker in < 120 ms") and **P6** 1.2
(quality tiers are `docs/ROADMAP.md` row M6, and `STATE.md` line 50 lists them as
deliberately out of scope). Denominator = 10.0 − 1.8 − 1.2 = **7.0**.
Earned 0.7 + 1.8 + 0.6 + 1.2 = **4.3 / 7.0** → 4.3 ÷ 7.0 × 10 = **6.14 → 6.1**.
Two `blocking` defects cap this critic at 5.9 (`docs/RUBRIC.md` line 5). **Final: 5.9.**

**Artefact provenance.** Scored bytes: `artifacts/perf.json` md5 `38ecac642f0112624057ed73b6fe717d`,
kept at `/tmp/claude-0/-home-user-dragonvein/045b340c-9d85-5a8a-bc82-35e4b7e5dc7b/scratchpad/perf.original.json`.
Those bytes are no longer in the tree: a concurrent `gate:perf` rewrote `artifacts/perf.json`
at 02:56 UTC (md5 `4260c326666b5656f1f6878dd1d5fb7a`, scene changed to 19 draws / 28,188 tris).
I restored the original after my own re-runs and did **not** clobber that newer measurement;
every line below cites the scored bytes and cross-checks against the newer one.

| # | line | max | earned | number, and the key it came from |
|---|---|---|---|---|
| P1 | p95 frame ≤ 16.6 ms @1080p Medium | 2.5 | **0.7** | `frameCostMs.p95 = 157.353 ms` vs `frameCostMs.budgetMs = 16.6`, `frameCostMs.withinBudget = false` — 9.5× over. Non-representative by the artefact's own keys: `softwareRenderer = true`, `frameBudgetEnforced = false`, `renderer = "ANGLE (… SwiftShader driver)"`. Surrogate main-thread half `cpuFrameMs.p95 = 1.8 ms` vs `cpuFrameMs.budgetMs = 3.5` passes in the scored bytes but reads 4.5 / 4.5 / 2.2 in my re-runs and 4.4 in the tree's 02:56 run (`cpuFrameMs.p95WithinBudget = false`). `viewport.cssWidth/cssHeight = 1920/1080`, `devicePixelRatio = 1`. Credit is for the instrument only (see What is good). |
| P2 | Draw calls ≤ 180 | 1.8 | **1.8** | `drawCalls = 28` vs `budget.drawCalls = 180` (15.6 %); `triangles = 28474` vs `budget.triangles = 900000` (3.2 %); `errors = []`. Enforced unconditionally (`tools/gate-perf.mjs` lines 468–474). Reproduced three times at `drawCalls = 19`, `triangles = 28188`. |
| P3 | Bred-dragon mesh build ≤ 120 ms | — | **excluded** | No subject at M0; `docs/ROADMAP.md` row M3. Not scored, not zeroed. |
| P4 | No frame-loop allocation; GC pauses < 2 ms | 1.5 | **0.6** | `heap.bytesPerFrame = 35871` vs `heap.budgetBytesPerFrame = 40960` (87.6 %), `heap.withinBudget = true`, `heap.netGrowthKB = -839` (no leak), `heap.sawtoothAmplitudeKB = 1607`, `gc.inferredScavenges = 7`. But the same key reads `41912` and `43237` (over budget) in re-runs, and the GC half is unestablished: `gc.pauseMsMeasured = false` with `gc.worstCpuFrameMs = 7` ms as its only bound, 3.5× the rubric's 2 ms. |
| P5 | Bundle ≤ 1.4 MB gzip; boot ≤ 2.5 s | 1.2 | **1.2** | `bundle.gzipBytes = 139289` vs `bundle.budgetGzipBytes = 1400000` (9.9 %), `bundle.withinBudget = true`; `bootMs = 256.8` vs `bootBudgetMs = 2500` (10.3 %). Both enforced (`tools/gate-perf.mjs` lines 498–503). Reproduced: 140454 B / boot 249.9–499.9 ms. |
| P6 | Potato tier holds 30 fps @720p | — | **excluded** | No subject at M0; `docs/ROADMAP.md` row M6, `STATE.md` line 50. Cycle 1's zero here was an error and is withdrawn. |

**Real-GPU verification log (`STATE.md` lines 8–23).** It contains one row and that row is
`| — | — | **never performed** | — | — | — | — |`, under text stating that "this project has
never once been measured on a GPU". For P1 that means: there is no in-budget frame number
anywhere in this repository, on any machine, at any commit. The only `frameCostMs.p95` that
exists is a CPU-rasteriser figure 9.5× over budget. P1 is therefore unverified **and**
un-passed — the log is the honest record of that, not a substitute for it.

### Defects
- [blocking] **P1 — no in-budget frame measurement exists.** `frameCostMs.p95 = 157.353 ms`
  against `frameCostMs.budgetMs = 16.6`, `frameCostMs.withinBudget = false`; the tree's
  02:56 artefact says `167.946 ms`, same verdict. The figure is explicitly not
  representative (`softwareRenderer = true`, `frameBudgetEnforced = false`), and
  `STATE.md` §Real-GPU verification log row 1 is `never performed`, so no representative
  figure exists either. Reproduce:
  `node -e 'const p=require("./artifacts/perf.json");console.log(p.frameCostMs, p.softwareRenderer)'`.
  Fixes, none of them a budget change: (1) one human pass of `docs/PERF_BUDGET.md`
  §Real-GPU verification steps 1–4 so the log gets a row with `frameBudgetEnforced: true`;
  (2) meanwhile drive the cost down rather than wait — 19–28 draw calls of static island
  should not cost 167.9 ms even on SwiftShader, so batch the repeated island props into one
  `InstancedMesh` per type, and stop the pooled depth material flipping its `instancing`
  flag, which the artefact's own `heap.note` / `docs/PERF_BUDGET.md` §Heap churn blames for
  `WebGLPrograms.getParameters` running twice per frame.
- [blocking] **P1/P4 — the scored artefact does not reproduce; the gate exits 1.** Three
  `npm run gate:perf` re-runs on this container: exit 1, exit 1 (`exits.txt`: `run2 exit=1`,
  `run3 exit=1`). Numbers against the scored `cpuFrameMs.p95 = 1.8` and
  `heap.bytesPerFrame = 35871`: run 1 `cpu p95 4.5` / `heap 41912`; run 2 `cpu p95 4.5` /
  `heap 33817`; run 3 `cpu p95 2.2` / `heap 43237`; the tree's own 02:56 run `cpu p95 4.4` /
  `heap 33992`. The gate's own failure lines were
  `main-thread frame cost p95 4.5 ms > 3.5 ms` and
  `heap churn 43237 B/frame > 40960 B/frame`. Reproduce: `npm run gate:perf; echo $?`.
  A measurement that lands either side of its budget run to run is not evidence that the
  budget is met; it is evidence the sampling window is too short
  (`sampleCount.cpuFrameMs = 166` vs `sampleCount.target = 180`, `collectionWindowMs = 25023`
  pinned to the 25,000 ms `SAMPLE_DEADLINE_MS`).
- [major] **P1 — the enforced statistic was changed from p95 to p50 mid-cycle.**
  `tools/gate-perf.mjs` (mtime 2026-10-10T02:51:20Z, after the artefact under score) now
  fails on `if (cpu !== null && cpu.p50 > BUDGET.cpuFrameMs) {` (line 528) and guards the
  p95 comparison behind `report.frameBudgetEnforced` (line 537); `tests/spine.test.ts`
  (mtime 02:51:38Z) was edited to assert that shape at line 163 while its own comment at
  line 159 still reads "Unconditional: no `frameBudgetEnforced` or `software` guard on this
  comparison". Effect, straight from the tree's current artefact:
  `cpuFrameMs.p95WithinBudget = false` (4.4 ms vs 3.5 ms) while `cpuFrameMs.withinBudget =
  true` (p50 = 0.6 ms) and the gate passes. `docs/PERF_BUDGET.md` offers a two-machine
  contention argument for the swap and the 3.5 ms number did not move — but P1 is a **p95**
  line, and after this change no p95 is enforced on any machine this project has ever run
  on. If the tail is contention-noisy, fix the instrument (longer window, raise
  `TARGET_SAMPLES` attainment, drop `SAMPLE_DEADLINE_MS` pressure, pin fewer concurrent
  jobs), not the statistic. Needs owner sign-off under CLAUDE.md §2.7.
- [major] **P4 — `heap.bytesPerFrame` is not a per-frame figure.** Scored `35871` at
  `heap.framesInWindow = 165`; re-runs give `33817` @166, `33992` @169, `41912` @100,
  `43237` @85. The value tracks 1/frames almost exactly, which means allocation that is
  time-driven (the HUD repaint timer, the 250 ms CDP poll) is being divided by frames
  rendered. So a slow pass reads over a budget it did not breach — and two passes did read
  over `40960`. Fix the attribution (count rising edges against the frames they occur in,
  or subtract a measured idle-page baseline); do not move 40960.
- [major] **P4 — the GC half of the line is neither measured nor bounded under 2 ms.**
  `gc.pauseMsMeasured = false`; the offered bound `gc.worstCpuFrameMs = 7` ms (tree's
  current: `6.8`) is 3.5× the rubric's 2 ms. Refusing to invent a number is right; the line
  still cannot be scored as passing. A `PerformanceObserver` on `longtask` plus
  `gc.worstCpuFrameMs` on an idle-camera pass would at least bound it.
- [minor] **P1 — the "@1080p Medium" qualifier is not exactly met.** `viewport` is correct
  (1920×1080, `devicePixelRatio = 1`), but `tier.postProcessing = false` and
  `tier.configured = false`, while `docs/PERF_BUDGET.md` §Quality tiers defines Medium as
  "1080p, 1024 CSM, bloom". `tier.note` claims the settings "match the Medium row"; they
  match it minus bloom, so any figure here is a **floor** for Medium. Tiers are M6, so the
  fix today is the wording in `tier.note`, not adding bloom.
- [minor] **P2 — `drawCalls` / `triangles` are a single-frame snapshot, not a window
  worst-case.** `drawCalls = 28`, `triangles = 28474` in the scored bytes versus `19` /
  `28188` in three later runs (`__dragonveinStats()` reads `renderer.info` once at the end).
  Nothing is at risk at 15.6 % and 3.2 % of budget, but the budgeted figure should be the
  worst frame in the window.
- [minor] **P1 — the sample target is never reached.** `sampleCount.cpuFrameMs = 166`,
  `sampleCount.gpuFrameMs = 156`, `sampleCount.target = 180`, `collectionWindowMs = 25023`
  on a 25,000 ms deadline, with `framesRendered = 199`: 22 % of frames carry no GPU timing
  and the p95 rests on ~8 tail samples.

### What is good
- **The frame instrument is genuinely fixed, and it is checkable from the artefact.**
  `frameCostMs.p95 = 157.353 ms` is 9.441 vsync ticks — not an integer — while
  `presentIntervalMs.p50 = 150` and `.p95 = 300` are exactly 9.000 and 18.000 ticks with
  `presentIntervalMs.maxDeviationFromVsyncTickMs = 0.167`. The cadence figure is still
  tick-quantised, it is now named as a cadence, and it is compared to no budget. Last
  cycle's "every figure an exact multiple of 16.667 ms" no longer applies to anything
  budgeted; resolution is ~0.1 ms on `cpuFrameMs` (`p50 = 0.7`) and sub-ms on `gpuFrameMs`.
- **The quantisation claim is proved rather than asserted:**
  `unpaced.maxDeviationFromVsyncTickMs = 8.167` against the paced `0.167`, from a second
  pass with vsync disabled, and nothing in `unpaced` is budgeted.
- **The enforcement split is honestly disclosed, which is the thing a critic needs.**
  `softwareRenderer: true`, `frameBudgetEnforced: false`, `frameCostMs.withinBudget: false`,
  `gpuTimer.available: true` with `disjointEventsDiscarded: 0`, `gc.pauseMsMeasured: false`.
  The artefact nowhere claims a pass it cannot support, and `STATE.md`'s verification log
  records the measurement that has **not** been taken.
- **P2 and P5 are cheap with real margin and they reproduce**: 19–28 draws vs 180,
  28,188–28,474 tris vs 900,000, 139,289–140,454 B gzip vs 1,400,000, boot 249.9–499.9 ms
  vs 2,500 ms, `errors: []` with page errors enforced unconditionally.
- **Leak versus churn is separated and evidenced**: `heap.netGrowthKB = -839` beside
  `heap.sawtoothAmplitudeKB = 1607`, with the raw 99-point series in `heap.samplesKB` and
  sampling done over CDP from outside the page, so a critic can recompute it.
- `artifacts/playtest.log` corroborates rather than contradicts: `stats: {"drawCalls":28,
  "triangles":28474,...}` and an explicit note that `stats.frameMs` is a tick-quantised
  present interval.

SCORE_MACHINE: 5.9

---

## gameplay-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 2)
SCORE: 8.2 / 10

**Renormalisation.** The gameplay table sums to 10.0 across G1 2.2, G2 1.8, G3 1.4, G4 1.4,
G5 1.6, G6 1.6. At M0 three lines have no subject, verified rather than assumed:
`grep -n "genome\|breed" src/main.ts` returns nothing (G2 — breeding is M9),
`grep -rn "indexedDB\|localStorage" src/main.ts` returns nothing (G4 — persistence is M8),
`grep -rn "pointerdown\|touchstart\|click" src/main.ts` returns nothing (G6 — input is
M8/M9). Those three are scored N/A and removed from both numerator and denominator.

    in-scope max  = G1 2.2 + G3 1.4 + G5 1.6     = 5.2
    earned        = G1 1.80 + G3 1.25 + G5 1.20  = 4.25
    score         = 4.25 / 5.2 x 10              = 8.173 -> 8.2

| # | line | max | awarded | basis |
|---|---|---|---|---|
| G1 | The milestone's loop completes start to finish | 2.2 | **1.80** | Boot -> lit island -> rotation -> live HUD -> survives being left running, on every one of ~15 driven sessions. Cold load 215–345 ms to first frame; a 90 s unattended run rendered 522 frames with 0 page errors. Docked for: the deployed leg is unverifiable from here; `gate:smoke` exited 1 on 4 of 9 invocations; the turntable backing "it rotates" is 59% loading splash. |
| G2 | A bred dragon is visibly its parents' child | 1.8 | **N/A** | No breeding, genome or dragon mesh at M0 (M9). |
| G3 | Every action gives feedback within 100 ms | 1.4 | **1.25** | Boot splash fades at t+392 ms, removed at t+402 ms; the HUD repaints on a 250 ms timer and tracks reality (FPS 5–14 against a measured 150 ms present interval — not a flattering 60); context loss repaints the overlay synchronously inside the `webglcontextlost` handler; resize lands in 424 ms, which is 2.8 SwiftShader frames and one-frame-bound, so not counted against the line. |
| G4 | State survives reload | 1.4 | **N/A** | No state is persisted at M0 (M8). |
| G5 | No softlock, unreachable state, negative currency | 1.6 | **1.20** | Six adversarial probes found one reachable dead end (no-WebGL, below). Two successive context losses both recovered (`restoredCount` 1 then 2); a loss the page cannot undo degrades correctly and still recovers when the driver returns; 8 s backgrounded + refocus keeps rendering; 480x900 and 320x200 viewports keep running; no currency exists to go negative. |
| G6 | Mouse and touch both work | 1.6 | **N/A** | No input handlers exist at M0 (M8/M9). |

### Verification of the two items the brief asked for

**1. WebGL context loss — fixed, and a real fix.** On this renderer the restore is so fast
the warning banner could not be photographed: back inside 190 ms
(`{"lost":false,"restoreAttempts":1,"restoredCount":1,"msSinceLoss":188.2,
"framesSkippedWhileLost":2}`). Forcing the hard case by monkey-patching `ext.restoreContext`
to a no-op gives the correct path: `GPU CONTEXT LOST — RESTORING` at t+500/1500/3000 ms with
`restoreAttempts` 2/3/4, `GPU CONTEXT LOST — RELOAD TO RECOVER` at t+6000 ms, and recovery
once the patch is lifted. No stale `FPS 60 DRAWS 20 TRIS 26984` anywhere. Cycle 1's G5 major
and G3 minor are closed.

**2. Reload cost — the over-budget sample is gone, the ratio is not.** Nine reloads across
three passes: worst 1164 ms against a 2500 ms budget (47%). Cold 214.7–344.6 ms. The 2532 ms
sample from cycle 1 did not reproduce once. The structural 4.1x reload-over-cold gap remains,
so a machine ~2.5x slower would put reload back on the line — an observation, not a defect.

**3. GitHub Pages — could not load it. Plainly: no.**
`curl -sS -L --max-time 60 https://vtpqui3009.github.io/dragonvein/` →
`curl: (56) CONNECT tunnel failed, response 403`; Playwright →
`net::ERR_TUNNEL_CONNECTION_FAILED`; the agent proxy's own status reports
`connect_rejected … gateway answered 403 to CONNECT`. `*.github.io` is denied by this
container's egress policy. Unchanged from the previous container, not a property of the
build, and no green workflow was substituted for a load. AC3 has no evidence from me or from
any automated check in this repository, and per CLAUDE.md §7 it needs a human with a browser
before M0 closes.

### Defects

- **[major] G5 — a machine without WebGL2 sits on the loading splash forever, silently.**
  Repro: launch Chromium with `--disable-webgl --disable-webgl2 --disable-3d-apis` and load
  the preview. After 6 s `#boot` is still in the DOM at `opacity: 1`,
  `globalThis.__dragonveinStats` is `undefined`, the HUD reads `FPS — DRAWS — TRIS —`, and the
  only trace is a console throw the player never sees:
  `Error: THREE.WebGLRenderer: Error creating WebGL context.` The page already knows how to
  say "GPU CONTEXT LOST — RELOAD TO RECOVER" when a context it had dies; it says nothing when
  the context never existed. CLAUDE.md §0 names a weak Intel iGPU as the target, where a
  driver blocklist or an enterprise 3D-API policy is a routine way to land here.
  **Not tagged `blocking`**, and the call is stated so it can be overruled: no state inside
  the supported, reachable game is unreachable, and a browser with no WebGL2 cannot run this
  game at all — the defect is the missing message, not a lost game state.

- **[major] G1 — `npm run gate:smoke` is flaky: 4 failures in 9 consecutive invocations, and
  a failure leaves a stale turntable on disk that still looks current.** Exit codes across
  nine runs: `1,1,1,1` then `0,0,0,0`. Every failure is the same line in
  `artifacts/playtest.log`: `turntable: Page did not produce any video frames`, which
  `tools/playtest.mjs` pushes into `errors[]`, giving `page errors: 1` and exit 1. That makes
  AC1 (`npm run gates` exits 0) non-deterministic, so M0's own done-condition is a coin flip.
  Worse: when the recording fails the *previous* `m0-island.webm` is left untouched with no
  marker, so a critic reading the artefact directory scores a video from an older build while
  the log beside it says the gate failed. The capture page is a third concurrent SwiftShader
  context opened while the main page is still rendering, which is the likely cause.

- **[minor] G1 — the turntable claims 7000 ms of rotating island and delivers ~3.1 s of it.**
  `ffprobe … -show_entries format=duration` → `7.640000`, 191 frames at 25 fps, but the island
  does not appear until frame ~113 (t ≈ 4.5 s): `n=110` is a 65 KB PNG (flat dark splash),
  `n=115` is 414 KB (the island). So 59% of the motion artefact for rubric A5 is the loading
  screen, while the log still reads `(7000ms of the island rotating)`. The cycle-1 webm was
  worse (2.88 s, 72 frames), so the length is not stable between runs either. Secondary
  reading: that page needed ~4.5 s to first frame against the main page's 215–345 ms, i.e. a
  second concurrent WebGL context blows the 2500 ms boot budget by 1.8x.

- **[minor] G5/G3 — an unrecovered context loss paints the whole viewport white, and the
  recovery instruction is text with nothing to click.** The dead canvas covers the `#070d14`
  body and renders white with the browser's broken-image glyph, on a game whose entire palette
  is dark. The overlay correctly reads `GPU CONTEXT LOST — RELOAD TO RECOVER` in #ff9044 and
  is legible, but "reload" is an instruction, not a control.

- **[minor] G3 — for one HUD tick after a restore the overlay reports `DRAWS 0 TRIS 0`.**
  Sampled at t+120 ms after `loseContext()`, with `context.lost` already `false`, the HUD read
  `FPS 0 DRAWS 0 TRIS 0`; the next 250 ms repaint returned `FPS 5 DRAWS 19 TRIS 28188`. This
  is the non-lost branch of `paintHud()` reading `renderer.info.render` after the restore has
  zeroed it but before the first restored frame lands. Far better than cycle 1's stale
  confident numbers and it lasts under 250 ms, but `—` would be the honest value.

### What is good

- **The loop is solid under abuse.** ~15 driven sessions: 0 page errors and 0 console errors
  in every one; a 90 s unattended run advanced 522 frames; three reloads, a portrait resize to
  480x900, a shrink to 320x200, 8 s backgrounded then refocused, and two separate context
  losses all left the page rendering.
- **The HUD tells the truth, which is the thing that was broken.** FPS 5–14 on a rasteriser
  whose measured present interval is ~150 ms — the unflattering number — instead of 60. Em
  dashes the instant the context dies, for as long as it is actually dead.
- **The context-loss handler is well built, not patched.** Five retries with 400 ms linear
  backoff, the restore deferred one task past the loss event, `renderer.setSize` re-applied,
  GL extensions re-acquired, two distinct messages for "still trying" and "gave up".
- **The scene is deterministic, so the screenshots are comparable run to run.** Seeded
  mulberry32 with seven fixed seeds; `drawCalls/triangles` sampled 40 times over 60 s gave the
  same pair 40 times, and a fresh load in a new browser context gave the identical pair.
- **Boot is fast and the splash does its job.** 215–345 ms to first frame at 1080p against
  2500 ms; the splash fades at 392 ms and is removed at 402 ms.
- **The island visibly rotates.** 239 of 243 sampled pixel bytes differ between two
  screenshots 2 s apart, and the extracted turntable frames advance monotonically.

SCORE_MACHINE: 8.2

## perf-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 3)
SCORE: 5.7 / 10

**Renormalisation.** P3 (bred-dragon mesh, M3) and P6 (quality tiers, M6; both named
under "Out of scope, deliberately" in `STATE.md` run 1) have no subject at M0, so their
1.8 and 1.2 leave the denominator rather than scoring 0.

    denominator = 10.0 - 1.8 (P3) - 1.2 (P6) = 7.0
    awarded     = P1 0.0 + P2 1.8 + P4 1.0 + P5 1.2 = 4.0
    score       = 4.0 / 7.0 x 10 = 5.714 -> 5.7

One `blocking` defect is present (P1), which caps this critic at 5.9 under CLAUDE.md §4.
The cap does not bind: the renormalised raw score, 5.7, is already below it.

| # | line | max | awarded | number, and the key it came from |
|---|---|---|---|---|
| P1 | p95 frame <= 16.6 ms @1080p Medium | 2.5 | **0.0** | `frameCostMs.p95 = 172.145 ms` vs `frameCostMs.budgetMs = 16.6`, `frameCostMs.withinBudget = false`. `gpuFrameMs.p95 = 172.145 ms`, `gpuFrameMs.p50 = 147.575 ms`, `gpuFrameMs.max = 188.73 ms`. Measured on `renderer = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"` with `softwareRenderer = true`, `frameBudgetEnforced = false`. `STATE.md` Real-GPU verification log: one row, `never performed`. No admissible measurement of this line exists. Not creditable as a pass; not scored as a measured failure either. 0 for absence of evidence. |
| P2 | Draw calls <= 180 | 1.8 | **1.8** | `drawCalls = 21` vs `budget.drawCalls = 180` (11.7%); `triangles = 32568` vs `budget.triangles = 900000` (3.6%). Reproduced to the digit in 3 re-runs (21/21/21, 32568 each) and twice in `artifacts/playtest.log` lines 9 and 15 (`"drawCalls":21,"triangles":32568`). `errors: []`. |
| P3 | Bred-dragon mesh <= 120 ms | — | **excluded** | no subject at M0; no mesh-build key in `artifacts/perf.json`. |
| P4 | No frame-loop allocation; GC pauses < 2 ms | 1.5 | **1.0** | Allocation half passes: `heap.bytesPerFrame = 22084` vs `heap.budgetBytesPerFrame = 40960` (54%), and the conservative `heap.uncorrectedBytesPerFrame = 28938` also passes (71%). No leak: `heap.netGrowthKB = -2250` with `heap.sawtoothAmplitudeKB = 3285` (`minKB 3384` / `maxKB 6669`), and re-runs gave -1485 / -1108 / -377 kB. Deductions: the correction over-subtracts (defect 4), and the pause half is unmeasured — `gc.pauseMsMeasured = false`, `gc.worstCpuFrameMs = 7.2 ms` is the only bound offered and it is 3.6x the 2 ms threshold (defect 3). `gc.inferredScavenges = 14`, `gc.meanScavengeIntervalMs = 4056.286`. |
| P5 | Bundle <= 1.4 MB gzip; boot <= 2.5 s | 1.2 | **1.2** | `bundle.gzipBytes = 141093` vs `bundle.budgetGzipBytes = 1400000` (10.1%; `bundle.rawBytes = 550146`, of which `assets/three-Dykg1cr5.js` is 131429 gzip = 93%). `bootMs = 231.4` vs `bootBudgetMs = 2500` (9.3%); re-runs 469.1 / 247.8 / 272.0 ms. |
| P6 | Potato tier holds 30 fps @720p | — | **excluded** | `tier.configured = false`, `tier.note`: tiers land at M6; out of scope per `STATE.md`. |

### The four changes, verified against the artefacts

1. **Reproducibility — fixed.** `sampleCount.target = 360` and `sampleCount.cpuFrameMs = 360`
   in the artefact; three re-runs gave 361 / 360 / 360. `sampleCount.collectionWindowMs =
   56788` ms, re-runs 56484 / 55712 / 55114 ms, all short of the 70 000 ms deadline in
   `tools/gate-perf.mjs` (`SAMPLE_DEADLINE_MS`), so the window now closes on the sample
   target and not on the clock. Three consecutive `npm run gate:perf` runs exited **0, 0,
   0**. The cycle-2 blocker (166 samples of 180, window pinned to the deadline, verdict
   flipping run to run) is gone. Residue: see defects 5 and 6.
2. **Heap attribution — arithmetic correct, but the correction over-subtracts, so the
   headline figure under-reports.** The published numbers reconcile exactly:
   `heap.risingSumKB = 9580` x 1024 = 9 809 920 B; minus `heap.idleBytesSubtracted =
   2323359`; divided by `heap.framesInWindow = 339` = 22 084 = `heap.bytesPerFrame`. And
   `heap.idleBytesPerSecond = 40913` x (`heap.windowMs = 56788` / 1000) = 2 323 357, which
   is the subtracted figure. So the subtraction is auditable and 23.7% of rising bytes. It
   is nonetheless measured at the wrong rate — defect 4. Verdict survives because the
   uncorrected number is inside budget too.
3. **Draw calls — confirmed at 21.** `drawCalls = 21`, stable across four gate runs and
   both `playtest.log` stat lines. Churn moved with it: `heap.uncorrectedBytesPerFrame =
   28938` B/frame against the 37 171–38 098 B/frame series recorded in
   `docs/PERF_BUDGET.md` §Heap churn for the 20-draw-call scene, i.e. ~8 kB/frame less at
   1920x1080 than that 1280x720 series, directionally consistent with the ~2 kB-per-draw
   model in §Where the current 37 kB/frame comes from.
4. **p50 vs p95 — still wrong, and the re-runs sharpen the objection.** `cpuFrameMs.p50 =
   0.7` ms reproduces to the digit (0.7 / 0.7 / 0.7 / 0.7 across four runs) and carries the
   enforcement. `cpuFrameMs.p95 = 3.7` ms with `cpuFrameMs.p95WithinBudget = false`; re-runs
   3.6 / 2.8 / 2.6 ms, so **2 of 4 runs are over the 3.5 ms number and none of them fails
   the gate**, because `cpuFrameMs.enforcedStatistic = "p50 everywhere; p95 additionally
   where frameBudgetEnforced"` and `frameBudgetEnforced` has never once been true in this
   repository (`STATE.md` Real-GPU log: `never performed`). The practical state is that no
   p95 of anything is enforced on any machine this project has run on. I still think that
   is wrong and I still do not think a critic can clear it: it is a §2.7 question for the
   owner, correctly recorded in `STATE.md` as unresolved. What I would do instead of
   dropping to the median: cap SwiftShader's rasteriser threads so the main thread's tail
   stops measuring core contention, then hold `cpuFrameMs.p95` to the same unchanged 3.5 ms
   everywhere. That removes the noise rather than the budget.

### Real-GPU verification log, and what it means for P1

`STATE.md` §Real-GPU verification log holds exactly one row: `| — | — | **never performed**
| — | — | — | — |`, and the text under it states that "until a row appears here, rubric
line `P1` has no passing evidence anywhere in this repository". That is the correct and
honest statement, and I score it as written: P1 gets 0 of 2.5.

**This rubric line is not reachable in this environment.** `ls /dev/dri` returns "No such
file or directory"; there is no `vulkaninfo`, `glxinfo` or `nvidia-smi` on the box; every
gate run reports the SwiftShader renderer string and `softwareRenderer = true`. No
measurement I can take here, with any flags, can close P1, and no amount of further rework
inside this container will change the score on that line. Lifting it requires a human to
run the four steps in `docs/PERF_BUDGET.md` §Real-GPU verification on real hardware and
paste the row. Until then every perf-critic cycle on M0 will return a blocking P1, and
whether M0 ships regardless is an owner decision under CLAUDE.md §3.6, not a critic's.

### Defects

- [blocking] P1 — `artifacts/perf.json`: `frameCostMs.p95 = 172.145 ms` against
  `frameCostMs.budgetMs = 16.6`, `withinBudget: false`, 10.4x over. The figure is a
  SwiftShader rasteriser benchmark (`softwareRenderer: true`, `frameBudgetEnforced:
  false`), so it is not evidence that the frame is slow — but nothing else is evidence that
  it is fast, and `STATE.md` Real-GPU verification log reads `never performed`. The 16.6 ms
  line is unverified. Repro: `npm run gate:perf` -> `frame cost p95=171.81ms vs budget
  16.6ms  (software rasteriser — frame budget advisory, not enforced)`. Not fixable in this
  container (`ls /dev/dri` -> absent).
- [major] P1 evidence quality — `tier.postProcessing = false` and `tier.configured = false`
  in `artifacts/perf.json`, while `docs/PERF_BUDGET.md` §Quality tiers defines Medium as
  "1080p, 1024 CSM, **bloom**". `tier.name = "medium-equivalent"` is therefore Medium minus
  the post stage that the §Per-frame budget table allots 3.0 ms of the 16.6 ms. A real-GPU
  row taken at these settings would under-measure Medium by up to that 3.0 ms, so the row
  must either enable bloom or be labelled as medium-minus-post.
- [major] P4 pause half unmeasured — `gc.pauseMsMeasured = false`; the only bound given is
  `gc.worstCpuFrameMs = 7.2 ms` (re-runs: `cpuFrameMs.max` 6.7 / 7.8 / 9.3 ms), which is
  3.6x the rubric's 2 ms. The platform limitation is real and honestly stated, but the
  bound offered does not exclude a 2 ms-plus pause, so "GC pauses < 2 ms" is not evidenced.
  `gc.inferredScavenges = 14` at `gc.meanScavengeIntervalMs = 4056.286` says they are at
  least infrequent.
- [major] P4 correction measured at the wrong rate, so `heap.bytesPerFrame` under-reports.
  `heap.idleBytesPerSecond = 40913` B/s is measured with `setRendering(false)`, when rAF
  still fires at the vsync tick (~60 Hz; `presentIntervalMs.maxDeviationFromVsyncTickMs =
  0.167` shows the paced loop is tick-quantised). It is then subtracted across a window
  running `heap.framesInWindow = 339` / `heap.windowMs = 56788` = **5.97 fps**, ten times
  slower. Part of that baseline is per-callback, not per-second:
  `docs/PERF_BUDGET.md` §Where the current 37 kB/frame comes from measures the rAF loop with
  render removed at 380 B/frame = ~22 800 B/s at 60 Hz but only ~2 270 B/s at 5.97 fps.
  Over-subtraction ~= (22 800 - 2 270) x 56.788 s ~= 1.17 MB, i.e. ~3 400 B/frame of the
  339 frames; a rate-correct figure is ~25 500 B/frame, not 22 084. **Direction: the gate
  now under-reports by roughly 15%.** It does not change the verdict — the uncorrected
  `heap.uncorrectedBytesPerFrame = 28938` is also inside `budgetBytesPerFrame = 40960`, in
  all four runs (28938 / 29684 / 28708 / 29022) — which is the only reason P4 is scoreable.
  Fix: hold the rAF cadence of the baseline equal to the measured window's, or scale the
  baseline by callbacks rather than by seconds.
- [major] The main-thread budget is enforced on a statistic that passes while the budget is
  breached. `cpuFrameMs.p95` = 3.7 (artefact) / 3.6 / 2.8 / 2.6 ms vs `cpuFrameMs.budgetMs
  = 3.5`; `cpuFrameMs.p95WithinBudget = false` in 2 of 4 runs and the gate exits 0 every
  time. See change 4 above; unresolved and escalated in `STATE.md`.
- [minor] `sampleCount.gpuFrameMs = 346` against `sampleCount.target = 360` (re-runs 346 /
  346 / 343). The collection loop in `tools/gate-perf.mjs` breaks on `counts().cpuFrameMs >=
  TARGET_SAMPLES`, so the GPU series — the one that actually carries `frameCostMs.p95` — is
  systematically ~4% short of the target the cycle-2 fix raised. Harmless at 10x over
  budget; it will matter the first time the figure is near 16.6 ms.
- [minor] `sampleCount.presentIntervalMs = 512` in all four runs, i.e. the ring buffer is
  saturated, while `framesRendered = 393` and `heap.framesInWindow = 339`. The extra samples
  are from the rendering-paused idle baseline, where rAF keeps firing at 16.7 ms:
  `presentIntervalMs.mean = 116.727` ms sits *below* `presentIntervalMs.p50 = 149.9` ms, a
  left skew only ~110-130 tick-length samples explain ((112 x 16.7 + 400 x 150) / 512 = 121
  ms, vs 116.2 measured in re-run 1). Nothing here is budgeted, so this is cosmetic, but
  `presentIntervalMs.mean` is not a cadence of this scene and should not be quoted as one.

### What is good

- **The cycle-2 reproducibility blocker is genuinely closed.** Three consecutive
  `npm run gate:perf` runs exited 0; `sampleCount.cpuFrameMs` hit `target = 360` every time
  (361 / 360 / 360) and `collectionWindowMs` (56484 / 55712 / 55114 ms) stayed clear of the
  70 000 ms deadline, so no figure rests on a truncated window any more.
- **P2 is the cleanest line in the report.** `drawCalls = 21`, `triangles = 32568`,
  bit-identical across four gate runs and both `playtest.log` stat lines, at 11.7% and 3.6%
  of budget. `errors: []` in all four runs, matching `playtest.log` line 16 `page errors: 0`.
- **The heap figure is auditable rather than asserted.** Publishing
  `uncorrectedBytesPerFrame`, `idleBytesPerSecond` and `idleBytesSubtracted` let me check
  the subtraction to the byte and then find what is wrong with it. That is what an artefact
  is for. Keeping the uncorrected number is also what keeps P4 scoreable.
- **No leak, four windows deep.** `heap.netGrowthKB = -2250` (re-runs -1485 / -1108 / -377)
  with `sawtoothAmplitudeKB = 3285` over ~56 s each: churn inside three.js's render path,
  not retention.
- **The quantisation claim is now proved with a number rather than argued.**
  `presentIntervalMs.maxDeviationFromVsyncTickMs = 0.167` ms paced against
  `unpaced.maxDeviationFromVsyncTickMs = 7.8` ms, same scene.
- **P5 needs no critic-side probe any more.** `bundle.gzipBytes = 141093` and
  `bootMs = 231.4` are keys in the artefact, both an order of magnitude inside budget.
- **The Real-GPU log is the right kind of honest.** `STATE.md` says in its own words that
  P1 has no passing evidence. The 0 on that line is not a dispute with the build; it is the
  build's own statement, scored.

### Recommendations — all cheaper work, no budget moved

1. P1: a human runs `docs/PERF_BUDGET.md` §Real-GPU verification steps 1-4 on real
   hardware and pastes the row, with bloom on so the row really is Medium. Nothing in this
   container substitutes for it.
2. P4 baseline: keep the rAF cadence of the idle pass identical to the measured window, or
   charge the baseline per callback instead of per second. Until then, enforce the
   uncorrected figure — it is the conservative one and it already passes.
3. p95: cap the SwiftShader rasteriser's worker threads so the main-thread tail stops
   measuring core contention, then hold `cpuFrameMs.p95` to the unchanged 3.5 ms
   everywhere. Correcting the instrument, not the budget.
4. If a real-GPU row comes back red, the levers in order are the 1024 shadow map, the
   pooled depth material whose `instancing` flag flips and costs two
   `WebGLPrograms.getParameters` calls per frame (`docs/PERF_BUDGET.md` §Where the current
   37 kB/frame comes from), and moving the island rotation onto a transform the renderer
   does not rebuild. Draw calls at 21 are not the problem.

SCORE_MACHINE: 5.7

---

## art-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 3)
SCORE: 7.4 / 10

**Renormalisation.** A4 (variant sheets, max 1.6) has no subject at M0 — there are no
creature generators and no `artifacts/variants/` directory (`ls artifacts/variants` →
No such file or directory). It is excluded from the denominator, not scored 0.
Denominator = 10.0 − 1.6 = **8.4**.
Earned = 1.0 + 0.75 + 0.75 + 0.70 + 0.85 + 0.95 + 0.80 + 0.40 = **6.20**.
6.20 / 8.4 × 10 = 7.3809… → **7.4**.

| # | line | max | scored | note |
|---|---|---|---|---|
| A1 | Silhouette reads at 25% zoom | 1.2 | **1.00** | reads; canopy has no silhouette hierarchy |
| A2 | Palette inside ART_BIBLE within ΔE 12 | 1.0 | **0.75** | turquoise/tan gone; 3 decks at ΔE2000 12.1–13.5 |
| A3 | Lighting: key, fill, contact shadow | 1.2 | **0.75** | key + cool fill correct; no rim, satellites shadowless, shadows crush |
| A4 | Variant sheets show real variation | 1.6 | *excluded* | no subject at M0 |
| A5 | Nothing pops, teleports, interpenetrates | 1.2 | **0.70** | scene is clean; clip opens on 1 white frame + 12 splash frames |
| A6 | Density: reads as a lived-in place | 1.4 | **0.85** | hero island dressed; 9 satellites are bare decks of one archetype |
| A7 | HUD readable, 4.5:1 at 1280×720 | 1.0 | **0.95** | 10.55:1 amber, 14.53:1 white, on-bible panel |
| A8 | No z-fighting, seams, untextured magenta | 0.8 | **0.80** | 0 magenta px, 0 flickering px, clean deck/hull junction |
| A9 | Matches intent of the concept image | 0.6 | **0.40** | crystals now read as lit; form language diverges from concept |

All ΔE figures below are **CIEDE2000**, calibrated against cycle 2: the two colours cycle 2
cited measure #5a967e → ΔE2000 16.0 and #ae965a → ΔE2000 18.4, which reproduces cycle 2's
"14.5–20.8 ΔE out". So the numbers are comparable cycle to cycle.

### Cycle-2 findings — verification

1. **A6 satellites undressed — FIXED.** All nine satellites carry scatter, verified one by
   one on `artifacts/shots/01-wide.png`: top-centre (x560-700,y10-110) trees + 1 boulder;
   upper-left (x140-290,y120-220) trees + bushes; left (x50-210,y255-360) 6 trees +
   5 boulders + 3 bushes; upper-right small (x860-990,y85-150); right (x970-1090,y160-250)
   7 trees + 6 boulders; far-right (x1080-1230,y250-365); bottom-left (x160-310,y555-625)
   5 trees + 7 boulders + 3 bushes; bottom-mid (x375-495,y610-675); bottom-right
   (x995-1155,y580-665). They are also not clones of one another — the closest pair,
   left vs far-right, differs by mean-abs 14.1 on 64×44 thumbs (12.1 mirrored) and has a
   visibly different tree count and placement.
2. **A6 bottom quarter featureless — PARTIALLY FIXED.** Sobel re-run
   (`python3 -I sobel.py artifacts/shots/01-wide.png`): x0-540 y540-720 is now **5078 px**
   at threshold 24 (was 0), x740-1280 y540-720 is 3185 px. But the second region you asked
   me to re-scan, **x0-400 y420-540, is still exactly 0 px at thresholds 24, 48 and 96**.
   The left flank at eye level is still pure gradient.
3. **A2 satellite decks off-bible — MOSTLY FIXED.** No turquoise and no tan anywhere; every
   deck is now a green. Worst deck has dropped from ΔE2000 20.8 to **13.5**. Three decks
   still sit at or just over the ΔE 12 line (detail in Defects).
4. **A3 shadows crush to black — PARTIALLY FIXED.** RGB-sum < 30 inside the island bbox
   (x405-875, y240-660) is now **1338 px**, down from 2698 — halved, not cured. The
   shadowed canopy you cited at rgb(0,18,4) now reads rgb(0,25,7): lifted by 10 of 765, red
   channel still fully clipped to 0. 1654 px of canopy remain below RGB-sum 40.
5. **A3 no warm rim on the sun-side silhouette — NOT FIXED.** Re-ran the edge scan on both
   silhouettes; numbers in Defects. There is no measurable rim band on either side.
6. **A9 crystals do not glow — PARTIALLY FIXED.** Hue moved onto the bible's water ramp and
   they are now the brightest object in the scene, but they spill no light (detail in
   Defects).

### Defects

- [major] A3 — no warm rim on either silhouette of the main island in
  `artifacts/shots/01-wide.png`. Scanning the canopy band y250-440 and sampling the
  silhouette pixel against the same surface 2 px and 5 px inside:
  left edge is **124.4 lum at the rim vs 139.2 at +5 px** (the rim is 15 units *darker*)
  and R−B +18.8 vs +54.4 (36 units *less* warm); right edge is **152.2 at the rim vs 155.1
  at +2 px** (no lift). The only place a rim appears at all is the left hull edge at
  y500-660, where it is +3.8 lum and +4.4 R−B over 8 px inside — below the threshold at
  which anyone will see it. The bible's third light ("one warm rim") is still absent.
- [major] A3 — no contact shadow on any of the nine satellite decks.
  `artifacts/shots/01-wide.png` bottom-left satellite (x160-310, y555-625): five trees and
  seven boulders sit on the deck and not one casts a shadow; **3216 of the 5973 deck
  pixels are the single quantised value #7ba042**, so the deck is a flat unmodulated
  field. Same on bottom-mid (x375-495,y610-675) and bottom-right (x995-1155,y580-665).
  `ART_BIBLE.md` §Lighting: "Contact shadows are mandatory. An object without one floats."
  The hero island does have them (every trunk in x620-870 y400-500 has a dark cast region
  to its left), so this is the satellites falling outside the shadow camera, not a missing
  feature.
- [major] A6 — nine of the ten islands are bare between features, against
  `ART_BIBLE.md` §Density ("A dressed island is never bare between features. Ground cover,
  scatter rocks, fallen leaves and small flora fill the gaps"). Single-colour deck
  fractions in `artifacts/shots/01-wide.png`: bottom-left 54% (3216/5973 green px at one
  quantised value), bottom-mid 55% (2640/4773), bottom-right 37% (3030/8226). The hero
  island's grass tufts, bush blobs and path exist nowhere else in the frame.
- [major] A5 — `artifacts/turntables/m0-island.webm` does not start at the first drawn
  frame. Reproduce: `ffmpeg -i artifacts/turntables/m0-island.webm -vsync 0 f%03d.png` →
  **f001 is pure white (mean RGB 255,255,255 over the whole frame)**, f002–f013 are the
  loading splash (mean RGB 6.4, 15.8, 21.3 — "DRAGONVEIN / đang khởi tạo thế giới…"), and
  the scene first appears at **f014** as a hard cut (mean RGB 115.4, 84.7, 64.5). That is
  13 of 180 frames, 0.52 s of a 7.20 s clip. `artifacts/playtest.log` states
  "7052ms recorded after the first drawn frame"; the artefact contradicts the log.
  The splash title is still burned over the scene until **f041** (t≈1.64 s, 23% of the
  clip) — white pixel count in x430-860 y335-375 falls 4945 → 25 across f014→f041.
  Not tagged blocking: nothing in the *scene* pops, teleports or interpenetrates, and A5's
  listed fail condition is about scene content, not the recording's lead-in. See
  "Blocking defects" for the reasoning in full.
- [minor] A2 — three satellite decks sit at or past the ΔE 12 line in
  `artifacts/shots/01-wide.png`. Bottom-mid (x375-495,y610-675) deck **#86a244, ΔE2000
  13.1 from foliage light #8fd24a and 13.7 from foliage mid #3f8a33** over 2640 px, with
  two neighbouring shades at 12.9 (850 px) and 13.5 (201 px). Bottom-left deck #7ba042 at
  11.6 (3216 px) and #7ea043 at 12.1 (801 px). Far-right deck #809540 at 12.1 (256 px).
  They land between the two bible greens rather than on either, so nearest-swatch distance
  is ~13. Everything else is on the nose: main island deck #448634 ΔE 1.6, sky zenith
  #0a1c4f ΔE 0.0, sky horizon #fe9044 ΔE 0.1, deep shadow #1a1420 ΔE 0.1.
- [minor] A3 — shadows still crush below the bible's darkest swatch in
  `artifacts/shots/01-wide.png`. Shadow-side tree trunks read **rgb(2,3,7) at (497,415)**
  and **rgb(3,4,9) at (566,425)**; the bible's deep shadow #1a1420 is rgb(26,20,32), four
  times brighter. Darkest shaded canopy is rgb(0,25,7) with the red channel fully clipped;
  1654 px of canopy are below RGB-sum 40 and 1338 px of the island bbox below RGB-sum 30.
  `00-boot.png` is worse at 2054 px below 30.
- [minor] A9 — the crystals read as bright but do not light anything.
  `artifacts/shots/01-wide.png` cluster at x430-600 y390-465: body colours #bbdee5
  (ΔE2000 9.3 from the bible's water-light #a6f1f2), #a4d1dd (9.9), #c1e1e6 (9.5), mean
  luminance 211 against 122 for the island's greens — so they are now unambiguously the
  brightest object and the hue is on the bible's water ramp. But the deck immediately
  under the cluster (x520-560, y460-470) measures luminance **101, below the island's own
  mean of 122** — there is no pooled glow and no halo, where `docs/concept/03-island-scene.png`
  shows the crystals spilling cyan-green light onto the grass around them. The brightest
  facet #edf6fc is ΔE2000 17.2 out, desaturated to near-white. With
  `perf.json: postProcessing:false` there is no bloom to carry it, so the glow has to come
  from albedo and light spill, and only the albedo half is done.
- [minor] A9 — the form language diverges from `docs/concept/03-island-scene.png`. The
  concept island is organic: a lumpy wavy-edged disc on a soft mushroom underside, rounded
  blob trees, low-contrast pastel dusk. The build is a perfectly extruded cylinder with a
  machined rim on a sharp geometric cone, stacked-cone trees, high contrast.
  `ART_BIBLE.md` §Direction asks for "stylised realism … not flat-shaded low-poly"; every
  surface in the frame is flat-shaded untextured low-poly. Recognisably the same world,
  visibly a different hand.
- [minor] A6 — one island archetype repeated ten times (ellipse deck + inverted cone +
  cone trees). Across `artifacts/shots/01-wide.png` there is no second biome, no
  structure, no water, no fauna and no airborne particle; the only two non-repeating
  features in the frame, the stone path and the crystal cluster, are both on the hero
  island.
- [minor] A6 — eleven of forty-eight 160×120 tiles in `artifacts/shots/01-wide.png` have
  0.0% Sobel>24 edge density, including the entire eye-level band y360-480 at x0-320 and
  x960-1280. The composition has a dressed centre ringed by dead gradient at exactly the
  height the eye rests.
- [minor] A8 — two unexplained near-black shards float in the upper-left sky of
  `artifacts/shots/01-wide.png` at **(244,100)** and **(138,134)**, roughly 4×8 px,
  rgb(24,27,44). They are unlit, there are only two of them, and both are on the same side
  of the frame; at 1:1 they read as dirt on the lens rather than sky debris.
- [minor] A5 — the turntable judders. **26 of the 167 scene frames are byte-identical to
  their predecessor** (interframe mean-abs diff 0.000), because the software rasteriser
  delivers ~7–13 fps (HUD reads FPS 7/9/11/13 across the four shots) into a 25 fps
  container. Frame f129 additionally shifts the whole frame by mean 4.24 while f128 and
  f130 are identical to each other — that is a VP8 quantiser step, not a scene event, but
  it is visible on playback.
- [minor] A1 — the canopy has no silhouette hierarchy. In
  `artifacts/shots/02-silhouette.png` (320×180) the ~45 conifers are all within a narrow
  height band and read as one undifferentiated spiky mass; nothing — no hero tree, no rock
  outcrop, no spire — breaks the line. The island as a whole reads fine, so this does not
  trip A1's fail condition, but it costs the asset-level read.

### What is good

- **The hero island is genuinely dressed, and that is the biggest thing this cycle fixed.**
  `artifacts/shots/01-wide.png` x620-870 y400-500 at 5× shows conifers, bush blobs, grass
  tufts, scatter boulders, a laid stone path and a crystal cluster, with nothing bare
  between them. That region alone is the difference between a prop on a plane and a place.
- **The palette is now disciplined.** The sky gradient hits `#0a1c4f` at ΔE2000 0.0 and
  `#ff9044` at 0.1; the deepest shadow in the frame lands on `#1a1420` at ΔE 0.1 across
  large areas; the main deck is ΔE 1.6 from `#3f8a33`. The cycle-2 turquoise and tan decks
  are completely gone. Keep whatever drives these — they are exact.
- **Key and fill are correct and measurable.** Reading across the hull at y=520 in
  `01-wide.png`: the left edge is rgb(59,54,66) — blue-dominant, B−R +7 — and the right
  edge is rgb(75,56,47) — R−B +28. That is precisely `ART_BIBLE.md` §Lighting's "one sun
  … one cool fill from the opposite side". The cone faces agree (right faces 149.7 and
  176.7 lum vs left faces 143.9 and 167.0).
- **Contact shadows on the hero island are real and directional.** Every trunk in the
  forest has a dark cast region to its left, consistent with the key from camera-right.
- **The HUD is excellent.** Panel #0b2335 is `rgba(11,36,48,0.82)` from the bible, amber
  labels #f4cc76 are `#ffd479`, contrast measured over x14-530 y16-52 of `01-wide.png` is
  **10.55:1** for the amber and **14.53:1** for the white values, both far past 4.5:1, and
  the panel is opaque so the ratio does not depend on what is behind it.
- **The frame is clean.** 0 magenta pixels across all five shots; 0 pixels flickering
  (>30 delta in more than 40 of 79 consecutive turntable steps) — no z-fighting anywhere;
  the deck/hull junction at x405-500 y440-520 is a single hard line with no gap and no
  double edge.
- **The scene motion is honest.** Across the 167 scene frames the green-pixel count varies
  95529–99576 with a maximum step of 1570 (1.6%) and the green centroid moves 627.6 → 623.0
  px with a maximum per-frame step of 1.2 px. Nothing pops, nothing teleports, no LOD
  swap, no geometry appears or vanishes. `03-late.png` (t+15.3 s) and
  `04-context-restored.png` both render complete at 21 draws / 32568 tris.
- **`02-silhouette.png` is an honest artefact.** It reproduces as a true BOX downscale of
  `01-wide.png` to 320×180 — mean absolute difference 0.52, maximum 2, i.e. rounding only.
  A critic can trust it.
- **The satellites genuinely differ from one another.** Tree counts, placements and deck
  sizes all vary (green-pixel areas 688 to 8274); the nearest pair still differs by
  mean-abs 14.1 on matched thumbnails. Nothing in the frame is a copy-paste.

### Blocking defects

**None.**

Considered and rejected: the white opening frame of
`artifacts/turntables/m0-island.webm`. A5's fail condition is "any pop", and f001 →
f014 is literally a hard cut. I am not tagging it blocking because A5 scores whether the
*world* holds together — whether objects pop in, teleport or intersect — and on that test
the clip is clean for all 167 of its scene frames by every measure I could run. A boot
splash preceding the recording is a capture-window defect in the artefact, not a defect in
the rendered world, and capping the whole line at 5.9 for it would hide the three real
problems (no rim light, shadowless satellites, bare satellite decks) that are actually
holding this score down. It is logged above as `major` and the builder should fix the
capture trigger.

A4 was not tagged blocking either: with no creature generator at M0 there is no variant
sheet to read as one object, so the line has no subject and is excluded from the
denominator rather than failed.

SCORE_MACHINE: 7.4

---

## gameplay-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 3)
SCORE: 8.6 / 10

### Renormalisation

G2 (breeding, M9), G4 (persistence, M8) and G6 (input, M8/M9) have no subject in the
running build. Verified, not assumed: `src/` contains exactly one file; a grep for
`indexeddb|localstorage|sessionstorage|genome|breed|roster|pointerdown|touch` returns one
unrelated shader-chunk comment and nothing else; `addEventListener` returns exactly two
hits, both `webglcontextlost` / `webglcontextrestored`. The only genome code in the repo is
Python, which is M1–M2 authoring, not a runtime bred mesh, and is explicitly not credited
as runtime evidence.

    in-scope denominator = G1 2.2 + G3 1.4 + G5 1.6 = 5.2
    earned               = 1.90 + 1.20 + 1.35       = 4.45
    score                = 4.45 / 5.2 x 10          = 8.5577 -> 8.6

No `blocking` defect found, so the 5.9 cap does not apply.

| # | line | max | earned | evidence |
|---|---|---|---|---|
| G1 | milestone loop completes start to finish | 2.2 | **1.90** | `npm run gate:smoke` x10 -> exit 0 x10, turntable saved on attempt 1 every time, zero retries consumed. `npm run gates` -> exit 0. Boot cold 344 ms, reloads 1638 / 1499 / 1633 ms, all under 2500 ms. The island demonstrably rotates (webm f014 -> f090 -> f179). Docked 0.3: the published Pages URL could not be loaded, so the served half has no first-hand evidence. |
| G2 | a bred dragon is visibly its parents' child | 1.8 | **n/a** | renormalised out |
| G3 | every action gives feedback within 100 ms | 1.4 | **1.20** | Splash painted at t=39 ms; first drawn frame t=283 ms; WebGL2 failure message at t=58 ms; HUD switches to em dashes + `GPU CONTEXT LOST — RESTORING` 1.5 ms after the loss event; restore repaints inside one 8 ms sample. Docked 0.2 for the splash title sitting over a drawn island for ~1.4 s. |
| G4 | state survives reload | 1.4 | **n/a** | renormalised out |
| G5 | no softlock, unreachable state, negative currency | 1.6 | **1.35** | Induced loss recovers in 102 ms; canvas hidden while dead; hard case escalates honestly; resize to 320x240 / 1920x1080 / 200x2000 and back -> 0 page errors. Docked 0.25 for the three minors below. |
| G6 | mouse and touch both work | 1.6 | **n/a** | renormalised out |

### Verification of the four cycle-2 fixes

**1. `gate:smoke` flakiness — FIXED.** Ten consecutive runs, each preceded by a fresh
build: exit 0 ten times out of ten, every run logging `attempt 1`, so the retry was never
consumed and the race is actually gone rather than papered over. Webm sizes
898 930–970 174 bytes, recorded length 7050–7077 ms. Cycle 2's 4-in-9 failure rate would
have produced ~4 failures across these 10 runs at p < 0.001. `tools/playtest.mjs` closes
the main page and `rm`s the stale webm before the first attempt, so a failure can no longer
leave an older build's video beside a failing log — the sharpest edge of the original
defect, closed.

**2. Turntable splash share — LARGELY FIXED.** 1280x720, 25 fps, 180 frames, 7.20 s.
f000 is white (Playwright's `about:blank`), f001–f012 are the dark boot splash, f013
(0.52 s) is the first island frame, and the title fades out across f031–f047. So **7.2% is
pre-island splash** (was 59%), 92.8% shows the island and 73.3% shows it unobstructed.

**3. No WebGL2 -> silent forever — FIXED, and fast.** With `--disable-webgl
--disable-webgl2 --disable-3d-apis`, at t=57.8 ms the splash subtitle is replaced by
"This browser could not create a WebGL2 context, so DRAGONVEIN cannot render. Check that
hardware acceleration is on." plus an orange `NO WEBGL2 — CANNOT RENDER` badge and em
dashes in every numeric slot. Stable at 1 s, 3 s and 8 s; never reverts.

**4a/4b. Canvas hidden, and em dashes for the tick after restore — FIXED.** An 8 ms trace:
visibility flips to `hidden` in the same sample as the loss (msSinceLoss 6 ms); at
t+2332.9 ms `lost:false, restoredCount:1` with the status pill already hidden yet
FPS/DRAWS/TRIS all still `—` for ~46 ms until the first restored frame. No `DRAWS 0 TRIS 0`
anywhere in the trace.

**4c. Hard case, `restoreContext` neutered — FIXED and honest.** Five attempts over 4.0 s
of backoff, then `GPU CONTEXT LOST — RELOAD TO RECOVER`, canvas still hidden, 0 page errors
through 12 s and 738 skipped frames.

### Pages deploy

Could **not** load `https://vtpqui3009.github.io/dragonvein/`. `curl -sSL` ->
`curl: (56) CONNECT tunnel failed, response 403`; Playwright -> `net::ERR_TUNNEL_CONNECTION_FAILED`;
the agent proxy's own status reports `connect_rejected` for `vtpqui3009.github.io:443`.
This environment's egress policy, not a site failure. The deployment record
(`{"state":"success","environment_url":"https://vtpqui3009.github.io/dragonvein/"}`) is a
green workflow, not a loaded page, and is explicitly not counted.

### Defects

- **[major] G1 / AC3 — nobody, human or critic, has seen the published site.** Repro as
  above. AC3's second clause ("the published URL returns 200 and references the built
  `three` chunk") has no artefact anywhere under `artifacts/`. CLAUDE.md §7 forbids marking
  a milestone `DONE` that no human has seen running, and M0's ROADMAP done-condition is
  "Pages serves a lit, rotating placeholder". Fix: a human opens the URL once and records
  it, or the deploy job curls its own `environment_url` after publish and writes the status
  line plus a `grep -o 'three-[A-Za-z0-9]*\.js'` hit into an uploaded artefact.
- **[minor] G3 — the splash title still covers the island for ~1.4 s of the turntable.**
  `f013` (t=0.52 s) is the first island frame; `f020` (t=0.80 s) still shows the title at
  full opacity over the trees; the title band's >200-luma fraction only falls to 0.015 at
  `f044`. 19% of the 7.2 s clip is island-behind-splash. The DOM trace shows the splash text
  still present at t=672 ms with `drawCalls=21`, i.e. ~490 ms of overlap before the fade
  starts.
- **[minor] G5 — `__dragonveinStats()` reports a healthy frame over a permanently dead
  context.** With `restoreContext` neutered and 12 s elapsed, `read().context` is correctly
  `{"lost":true,"restoreAttempts":5,"restoredCount":0,"framesSkippedWhileLost":738}` and the
  HUD correctly reads `FPS — DRAWS — TRIS — GPU CONTEXT LOST — RELOAD TO RECOVER`, but
  `__dragonveinStats()` still returns `{"drawCalls":21,"triangles":32568,"frameMs":16.6,
  "cpuFrameMs":0.8}`. The honesty fix reached the HUD and `read().context` but not the
  accessor the gates sample. A future gate polling `__dragonveinStats()` alone would pass on
  a dead canvas.
- **[minor] G5 — an unrecoverable loss leaves no in-page way out.** A bare `#070d14` field
  with a text instruction and nothing clickable. The message is honest, but "RELOAD TO
  RECOVER" with no button and no key hint is still a dead end for a non-technical player.
- **[minor] G3/G5 — the HUD overflows narrow viewports, taking the loss message with it.**
  At 320x240 the HUD pill runs past the right edge and `DRAWS` / `TRIS` are off-screen; the
  status slot sits further right still, so at phone widths `GPU CONTEXT LOST — RELOAD TO
  RECOVER` would never be seen. At 200x2000 the pill is clipped after `BUILD`. No crash and
  no error in either case.
- **[minor] G1 — the turntable opens on a white frame.** `f000` has mean luma 255.0 while
  `f001` has 13.4. `index.html` sets a `#070d14` body background inline, so this is the
  recorder context's `about:blank`, not the build — but the clip a critic watches still
  begins with 40 ms of white. Dropping the first frame on save, or navigating before
  `recordVideo` starts capturing, would close it.
- **[informational, not scored] G5 — the browser took ~2.2 s to dispatch
  `webglcontextlost` after `loseContext()` under SwiftShader.** During that window the HUD
  keeps printing live numbers over a frozen canvas. The page cannot know before the event
  fires, so this is not a defect in the build; noted so nobody later misreads the gap as a
  regression in the honesty work.

### What is good

- **The flakiness fix is real and could not be broken.** 10/10 exit 0, every turntable saved
  on attempt 1, so the retry is headroom rather than a crutch. M0's own done-condition is no
  longer a coin flip.
- **The context-loss work is unusually honest for this stage.** Three separate truths at the
  right moments: the canvas disappears instead of rendering white over a dark page, the
  numeric slots print `—` rather than a confident `0` for the one tick before the first
  restored frame, and when restoration genuinely cannot happen the message escalates after a
  bounded five attempts instead of spinning forever. The hard case behaves exactly as the
  easy case claims it would, which is the test most recovery code fails.
- **The no-WebGL2 path answers in 58 ms with a cause and a remedy**, in the player's own
  language, with a matching HUD badge.
- **Boot is comfortably inside budget on a CPU rasteriser**: 344 ms cold, 1.50–1.64 s across
  three reloads against 2500 ms, 141 kB gzipped shipped.
- **Nothing produced an error.** Ten smoke runs, a full `npm run gates`, two loss drills and
  four viewport changes including 200x2000 — `page errors: 0` every time, `perf.json`
  `errors: []`.
- The island genuinely rotates and the rotation is visible in the artefact rather than only
  in a stat.

SCORE_MACHINE: 8.6

---

## perf-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 4 — rasteriser cap)
SCORE: 6.1 / 10

Scored from `artifacts/perf.json` (written 2026-10-10 12:00:27Z, head `2d1ff42`),
`artifacts/playtest.log`, `STATE.md` §Real-GPU verification log, and one independent
reproduction of `npm run gate:perf` on this container (exit 0). Every figure below is
cited by its key. No scoreable line is over budget; **there is no blocking defect**, so no
5.9 cap applies.

**Reproduction.** `npm run gate:perf` run fresh here, artefact-to-artefact against the
committed one:

| key | committed artefact | my re-run | delta |
|---|---|---|---|
| `cpuFrameMs.p50` | 0.7 ms | 0.7 ms | 0 |
| `cpuFrameMs.p95` | 1.1 ms | 1.1 ms | 0 |
| `gpuFrameMs.p95` | 445.084 ms | 440.694 ms | −1.0 % |
| `heap.bytesPerFrame` | 34 080 B | 33 991 B | −0.26 % |
| `bootMs` | 295.5 ms | 301.9 ms | +2.2 % |
| `drawCalls` / `triangles` | 21 / 32 568 | 21 / 32 568 | 0 |
| `bundle.gzipBytes` | 141 264 | 141 264 | 0 |
| `sampleCount.cpuFrameMs` | 367 / 360 target | 366 / 360 target | both closed on target |
| `rasteriserCap.verified` | true (55 threads, 0 wrong) | true (54 threads, 0 wrong) | — |

The budgeted statistic reproduces exactly. `cpuFrameMs.max` is the one figure that does
not (4.0 ms committed vs 1.9 ms re-run); it is not a budgeted key.

**The rasteriser-cap claim checks out, and not only on its own word.**
`rasteriserCap.cpus.page = [0,1]`, `rasteriserCap.cpus.rasteriser = [2,3]` — intersection
empty. `rasteriserCap.processes` lists the page's `renderer` pinned to `[0,1]` and
`browser` / 2×`zygote` / `gpu-process` / `utility` pinned to `[2,3]`, with
`failed: 0` and `observedThreads == threads` on all six; `threadsVerified = 55`,
`threadsWrong = 0`; `marlWorkers = 4`. `verifyRasteriserCap` earns `verified` only by
re-reading `Cpus_allowed_list` from `/proc/<pid>/task/<tid>/status` after the warm-up and
comparing per thread — a kernel fact, not a restated intention or a `taskset` exit code.
I confirmed it through a different code path (my own `grep Cpus_allowed_list
/proc/<pid>/task/*/status` against a live capped browser): 13/13 gpu-process threads
including all 4 `Thread<NN>` marl workers on `2-3`, every renderer thread on `0-1`.
`mainThreadTailEnforced = true` is therefore substantiated, and
`sampleCount.collectionWindowMs = 153 709 ms` against a 420 000 ms deadline with 367 ≥ 360
samples confirms the window closed on its target, not its clock.

### Line by line

- **P1 — 2.1 / 2.5.** *Continuous half (blocking): passes.* `cpuFrameMs.p95 = 1.1 ms` and
  `cpuFrameMs.p50 = 0.7 ms` against `budget.cpuFrameMs = 3.5 ms`
  (`cpuFrameMs.p95WithinBudget = true`), enforced with `mainThreadTailEnforced = true` and
  reproducing at 1.1 ms across two runs; p95/p50 = 1.57, inside the 1.6–1.7 the capped
  measurement predicts. `frameCostMs.p95 = 445.084 ms` is correctly recorded as advisory
  (`softwareRenderer: true`, `frameBudgetEnforced: false`), which is what
  `docs/PERF_BUDGET.md` §What is enforced where prescribes for this renderer class. The
  hardware-independent half is green: `drawCalls = 21`, `triangles = 32 568`,
  `errors: []`. No budget key was moved: `budget` reads 16.6 / 180 / 900 000 / 40 960 /
  3.5 / 1 400 000 / 2 500. *Real-hardware half: satisfied at the weakest admissible
  grade.* `STATE.md` §Real-GPU verification log holds one dated row — 2026-10-10, commit
  `c429d4a` (inside M0), grade `sighting`, `~60 FPS sustained`, DRAWS 21, TRIS 32568. A
  sighting is admissible up to M15, so this half is met; −0.4 for what it does not cover
  (see defects).
- **P2 — 1.8 / 1.8.** `drawCalls = 21` ≤ `budget.drawCalls = 180` (12 % of budget);
  `triangles = 32 568` ≤ 900 000 (3.6 %). Identical in the re-run.
- **P3 — 0 / 1.8.** No mesh-build number exists in `artifacts/perf.json` — no key for it
  at all. `npm run gate:meshgen` prints `SKIP` because `src/assets/dragon/builder.ts` does
  not exist. A line with no citable number scores zero; see defects for why this is scope
  rather than regression.
- **P4 — 1.0 / 1.5.** `heap.bytesPerFrame = 34 080` ≤ `heap.budgetBytesPerFrame = 40 960`
  (83 % of budget), reproducing at 33 991 B (0.26 % apart), with
  `heap.uncorrectedBytesPerFrame = 35 075` kept visible beside it. Deductions:
  `gc.pauseMsMeasured = false` and the only bound offered, `gc.worstCpuFrameMs = 4` ms, is
  **above** the rubric's 2 ms, so "GC pauses < 2 ms" is not established by this artefact
  (−0.3); `heap.netGrowthKB = 1062` against `sawtoothAmplitudeKB = 1752` is 61 % of the
  sawtooth, not "near zero", over a 153 709 ms window (−0.2).
- **P5 — 1.2 / 1.2.** `bundle.gzipBytes = 141 264` ≤ 1 400 000 (10.1 % of budget);
  `bootMs = 295.5` ≤ `bootBudgetMs = 2500` (11.8 %), re-run 301.9 ms.
- **P6 — 0 / 1.2.** No Potato measurement exists: `tier.name = "medium-equivalent"`,
  `tier.configured = false`, `tier.shadows = true`, `viewport.cssWidth/Height = 1920/1080`.
  Nothing in `perf.json` is a 720p no-shadow no-post pass, so there is no number to cite.

Sum of awarded points: 2.1 + 1.8 + 0 + 1.0 + 1.2 + 0 = **6.1 / 10**. Of the 3.9 missing,
3.0 are lines with no subject or no pass at M0 and 0.9 are the genuine gaps above. A
previous cycle took P3 and P6 out of the denominator instead, which on these same numbers
would read 6.1 / 7.0 = 8.7. `docs/RUBRIC.md` authorises neither renormalisation nor an
"n/a" grade, and inventing one is the critic's thumb on the scale, so the headline score is
the rubric as written. Whether an M0-stage perf-critic is scored out of 10 or out of 7 is a
rubric decision for the owner — the same class of defect as the one P1's own section
already records and fixes — and belongs in its own commit, not in a critic's arithmetic.

### Defects

- **[major] P6 — no Potato-tier measurement exists, and one could be taken today.**
  `perf.json` has exactly one pass: `viewport 1920×1080`, `tier.shadows = true`,
  `tier.configured = false`. Unlike P3 this line has a subject already — the gate's own
  `VIEWPORT` constant and the existing shadow toggle are all a 1280×720 / no-shadow /
  no-post pass needs. Reproduce: `node -e "const d=require('./artifacts/perf.json');
  console.log(d.viewport, d.tier)"` — nothing at 720p, nothing with shadows off. A 30 fps
  budget nobody measures is not a budget.
- **[minor] P1 — the one real-hardware row does not cover the condition the budget names.**
  `STATE.md` §Real-GPU verification log, row 1: viewport `~1365×610` (≈ 0.83 Mpx, 40 % of
  the 2.07 Mpx at 1080p that `viewport.drawingBufferWidth/Height = 1920/1080` measures
  here), `tier` "auto-detected, not recorded", GPU model not recorded, and `~60 FPS` is a
  vsync ceiling rather than a percentile. It is correctly graded `sighting` and correctly
  caveated, so it satisfies P1's second half up to M15 — but it is evidence about a
  smaller frame at unknown settings, and no row yet reports `frameCostMs.p95` with
  `softwareRenderer: false`.
- **[minor] P1/tier — every frame figure here is a floor, not a Medium measurement.**
  `tier.postProcessing = false` with `tier.note` conceding "Medium MINUS POST, not Medium".
  `docs/PERF_BUDGET.md` §Per-frame budget allots post-processing 3.0 ms of the 16.6 ms, so
  18 % of the frame budget has no subject in any number in this artefact.
- **[minor] P4 — the "< 2 ms GC pause" line is unresolved in the scored artefact.**
  `gc.pauseMsMeasured = false`, `gc.inferredScavenges = 14`,
  `gc.meanScavengeIntervalMs = 10 979`, and the stated bound `gc.worstCpuFrameMs = 4` ms
  exceeds 2 ms. My re-run gave 1.9 ms, i.e. the bound straddles the rubric line and is
  noise-sensitive. The honesty of refusing to invent a pause number is right; the
  consequence is that the line is not demonstrated either way.
- **[minor] P4 — `heap.netGrowthKB = 1062` (re-run 1120) is not shown to be flat.**
  `heap.minKB = 3368`, `maxKB = 5120`, `risingSumKB = 12 571` over
  `heap.windowMs = 153 709` — about 7 kB/s net. A 2.5-minute window cannot separate
  one-time settling from a slow leak; a second, longer window, or the same window split in
  halves with `netGrowthKB` reported per half, would.
- **[minor] P2/P4 forward risk — heap churn, not draw calls, is what binds scene growth.**
  `heap.budgetBytesPerFrame = 40 960` with `drawCalls = 21` already consuming
  `heap.bytesPerFrame = 34 080`. `docs/PERF_BUDGET.md` §Where the current 37 kB/frame comes
  from measures ~4 kB fixed plus ~1.8 kB per draw inside `WebGLRenderer.render`, so the 180
  draw calls P2 permits would cost roughly 4 + 180 × 1.8 ≈ 328 kB/frame — 8× the heap
  budget. The practical ceiling is therefore ~20 draw calls, not 180. The fix when the
  scene grows is instancing and merging (one `InstancedMesh` per prop type, batched static
  geometry), not a larger heap number; recording that now so a later milestone does not
  discover it as a surprise.
- **[minor] P1 — cap verification covers only the processes that existed when the cap was
  applied.** `rasteriserCap.processes` is a fixed list of six, and the re-read iterates
  that list; a browser process created after pinning would be neither pinned nor counted.
  In practice new processes fork from an already-pinned zygote (`[2,3]`) so the page keeps
  its half, and both runs re-read 55 and 54 threads with 0 wrong — but the artefact cannot
  show that nothing appeared mid-window. Reproduce: compare
  `rasteriserCap.threadsVerified` (55) with a live
  `ls /proc/<pid>/task | wc -l` sum across the tree during a run.

### What is good

- **The rasteriser cap is the rare case of a measurement claim that survives being
  attacked.** `verified` comes from re-reading `Cpus_allowed_list` per thread after warm-up,
  not from `taskset`'s exit status, and the artefact publishes everything needed to check
  it: the partition, all six processes with intended sets, `threadsVerified = 55`,
  `threadsWrong = 0`, `marlWorkers = 4`. I reproduced it through an independent `/proc`
  read and found the two cpu sets genuinely disjoint, with all four marl workers on the
  rasteriser half. The two failed thread-count attempts are kept in
  `rasteriserCap.threadCountCapTried` so the working mechanism does not read as the first
  thing that was tried.
- **The tail is now enforced without the budget moving.** `budget.cpuFrameMs = 3.5` is
  still the 2.0 + 1.5 ms main-thread share from §Per-frame budget, and
  `cpuFrameMs.enforcedStatistic = "p50 and p95, both against the same 3.5 ms"` — the
  instrument changed, the number did not. `cpuFrameMs.p95` landed at 1.1 ms twice, 31 % of
  budget, with p95/p50 = 1.57, which is the "tail is the app, not the box" property the
  cap was built for.
- **The window closes on its sample target, not its deadline.** 367 and 366 samples
  against `sampleCount.target = 360` in 153.7 s and 150.3 s against a 420 s deadline —
  precisely the failure mode the cap's doubled GPU cost threatened, pre-empted, and the
  reason the p95 above is worth enforcing.
- **The artefact is self-describing where it is weak.** `frameBudgetEnforced: false`,
  `gc.pauseMsMeasured: false`, `tier.note` admitting "Medium MINUS POST", `presentIntervalMs`
  named for what it is with `maxDeviationFromVsyncTickMs = 0.133` beside the unpaced
  `8.133` to prove the quantisation is the compositor. A critic reading only `perf.json`
  can tell which numbers bind and why.
- **Everything with large headroom has it honestly**: `bundle.gzipBytes = 141 264` at 10 %
  of budget with source maps excluded and per-file sizes listed, `bootMs = 295.5` at 12 %,
  `drawCalls = 21` at 12 %, `triangles = 32 568` at 3.6 %, `errors: []` on both runs,
  `context.lost = false` with a restore proven in `playtest.log`.
- `gate:perf` exits 0 on a clean re-run, and `heap.bytesPerFrame` reproducing to 0.26 %
  means the one frame budget this container can police honestly actually is policed.

SCORE_MACHINE: 6.1

## gameplay-critic — M0 Toolchain & deploy spine — run 2026-10-10 (rework cycle 4 — frozen-tree scoring)
SCORE: 8.2 / 10

Scored against the *frozen* artefacts (`artifacts/playtest.log` of 2026-10-10T12:00:28Z,
`artifacts/shots/*.png`) plus my own driving of the already-built `dist/` through
`tools/preview-server.mjs` on ports 4199/4201/4203/4205/4207/4209/4211. I ran no gate and
no build; nothing under `artifacts/` was written by me. All my screenshots are in
`/tmp/claude-0/-home-user-dragonvein/9b28d13f-8544-59ef-b806-2437c683a7b1/scratchpad/gameplay/`.

**Two of the six rubric lines have no subject at M0 and I have neither awarded nor
silently zeroed them.** G2 (a bred dragon resembling its parents) and G4 (state survives
reload) are reported `n/a` with the evidence for why below. The headline 8.2 is the score
over the 6.8 rubric points that *have* a subject (5.6 awarded / 6.8 available = 82.4 %).
Read literally — G2 and G4 counted as 0 — the same build scores **5.6 / 10**. I state both
because the difference is the rubric's, not the build's, and the decision about which to
act on is not a critic's to make quietly.

### Per-line breakdown

**G1 — the milestone's loop completes start to finish — 2.2 / 2.2 (blocking line, not tripped)**
M0's loop is: boot → first frame → a lit island that keeps rendering and rotating → an
honest overlay → survive a WebGL context loss. All five verified first-hand:
- Boot to first frame **303.3 ms** (`__dragonveinPerf.read().bootMs`), 352 ms wall from
  `page.goto`; first-contentful-paint (the splash) at **104 ms**; splash removed by +1.2 s.
- Frames keep coming: `framesRendered` 31 → 43 → 54 → 63 → 77 → 88 → 97 → 110 over eight
  samples 1.5 s apart, with `drawCalls` 21 / `triangles` 32 568 on every one (SwiftShader,
  so ~7 fps — slowness of the rasteriser, not of the scene).
- It really rotates: two screenshots 6 s apart (`rotA.png`, `rotB.png`) differ on
  **8.28 %** of pixels (76 282 / 921 600 above an 18/765 channel-sum threshold), and the
  frozen `shots/00-boot.png`, `01-wide.png`, `03-late.png`, `04-context-restored.png` show
  four distinct island orientations with the static backdrop unmoved.
- Overlay tracks reality: HUD read `FPS 7 DRAWS 21 TRIS 32568` while I measured 12 frames
  in 1.5 s (8 fps) and `__dragonveinStats()` returned the same 21 / 32 568.
- Context loss recovered: `playtest.log:11` and my own run agree — `restoredCount: 1`,
  `restoreAttempts: 1`, back to 21 draws within ~3.6 s, zero page errors.

**G2 — a bred dragon is visibly its parents' child — n/a (1.8 points have no subject)**
There is no dragon anywhere in the running build and no way to breed one. `src/` contains
exactly one file (`src/main.ts`); `dist/` renders an island and nine companion islands;
there is no `src/assets/dragon/`, no runtime genome, no breeding entry point, and
`artifacts/variants/` and `artifacts/turntables/*dragon*` do not exist
(`ls artifacts/turntables/` → `m0-island.webm` only). The reference builder
`assetgen/dragon/builder.py` exists but cannot be rendered in this container
(`python3 -I -c "import bpy"` → `ModuleNotFoundError`). So the comparison the line asks
for — child mesh against both parent meshes — has no inputs, and I will not invent a
score for it in either direction. **I did not treat this as a failure**: G2 carries no
`blocking` tag, and its fail conditions ("looks unrelated" / "identical to a parent")
cannot be met by a creature that does not exist, so it forces no cap.
For the record, the data layer it will one day drive does behave: from a scratch copy of
`assetgen/genome.py`, `breed(wild(1), wild(2), seed)` for seeds 10/11/12 gives children
that sit between the parents on most genes and vary between themselves —
`bodyMass` parents 0.981 / 1.200 → children 1.074, 1.167, 1.132; `crestType` 2 / 1 →
2, 2, 1; elements `[umbra,umbra]` × `[stone,stone]` → three hybrids. That is numbers in a
file, not a rendered mesh, and it is **not** what G2 asks for.

**G3 — every action gives feedback within 100 ms — 1.0 / 1.4**
The only events at M0 are page load and context loss.
- Load: splash painted at 104 ms, well inside 100 ms of the HTML arriving (navigation
  `domContentLoaded` 148 ms, `transferSize` 1 754 B); first rendered frame at 303 ms.
- Context loss: the HUD goes to `FPS — DRAWS — TRIS —` plus a status line **inside the
  `webglcontextlost` dispatch itself** — a listener I registered after the app's reads
  `{"drawCalls":null,...,"contextLost":true}` and HUD text already
  `… FPS | — | DRAWS | — | TRIS | — | GPU CONTEXT LOST — RESTORING`. Sub-5 ms, no 250 ms
  sampler lag. That is the behaviour the brief asked me to verify, and it holds.
- Deduction: at phone widths that feedback is *invisible* — see defect 2. Feedback the
  player cannot see is a silent event, which is exactly what this line penalises.

**G4 — state survives reload — n/a (1.4 points have no subject) (blocking line, not tripped)**
Nothing is persisted at M0: no IndexedDB, no `localStorage`, no save, no roster, no bred
dragon. The line's fail condition is "loses a bred dragon"; there is no bred dragon, so
the condition cannot be met and **no blocking defect is forced**. I did not award the
points either — "there is nothing to lose" is not evidence that saving works. What I could
test, I did: three consecutive reloads each come back to an identical live state
(`drawCalls 21`, `triangles 32568`, splash gone, HUD repopulated), and a reload also
recovers a canvas killed by an unrecoverable context loss. That is reload *sanity*, not
state persistence.

**G5 — no softlock, unreachable state, or negative currency — 1.2 / 1.6 (blocking line, not tripped)**
No currency exists, so the negative-currency clause is moot. Two dead-end candidates:
- *No WebGL2*: handled well, and at both widths. With `getContext('webgl*')` stubbed to
  `null`, the splash stays up and reads "This browser could not create a WebGL2 context,
  so DRAGONVEIN cannot render. Check that hardware acceleration is on." — it wraps and
  fits a 360 px viewport (`t6-nowebgl2-360.png`, boot `<p>` rect 0→360 px). No infinite
  splash. This is the one the brief asked about and it passes.
- *Unrecoverable context loss*: with `restoreContext()` neutered, the page sits on a hidden
  canvas and a black viewport indefinitely, escalating to `GPU CONTEXT LOST — RELOAD TO
  RECOVER` after 5 attempts over ~7 s. It is not a true softlock — `webglcontextrestored`
  is still listened for, and a manual reload fully recovers (verified) — but the page
  offers no reload affordance of its own, and at phone width the instruction is off-screen
  (defect 2). 0.4 off for a state whose only exit is one the player may never be told about.

**G6 — mouse and touch both work — 1.2 / 1.6**
M0 ships no input handlers at all (fixed camera; `#hud` is `pointer-events:none`), so there
is no interaction to break. What *is* testable I tested in a touch-enabled mobile context
(`hasTouch: true, isMobile: true, deviceScaleFactor: 2`) at 360×640, 320×480 and 1280×720:
`touchscreen.tap`, a synthetic pointerdown/move/up with `pointerType:'touch'`, a mouse
drag and a wheel scroll all left the page healthy — `framesRendered` 75 → 95 (360×640),
85 → 110 (320×480), 65 → 77 (1280×720), `scrollX/Y` still `[0,0]`, zero page errors, the
canvas correctly sized to the viewport in every case. 0.4 off because the one surface a
touch device has to show — the overlay — does not fit either phone viewport (defect 1).

### Defects

- [major] G6 / G3 — **the HUD pushes its own readouts off-screen on any viewport narrower
  than ~530 CSS px.** `#hud` is a non-wrapping flex row 512 px wide pinned at `left:14px`;
  measured `getBoundingClientRect().right = 527.6` against `innerWidth 360` (167.6 px
  clipped) and against `innerWidth 320` (207.6 px clipped). `DRAWS` and `TRIS` are
  unreadable; see `scratchpad/gameplay/vp-360x640.png` (text ends at "FPS 5 DRA") and
  `vp-320x480-lost.png`. Reproduce:
  `node scratchpad/gameplay/drive3.mjs` (contexts 360×640 and 320×480), or in any browser
  open the preview and set the window to 360 px wide.
  Note M0's AC8 only claims readability at 1280×720, where it is clean — this is a defect
  against rubric G6, not against the milestone's own promise.
- [major] G3 / G5 — **the context-loss message is entirely off-screen at phone width, so a
  dead canvas is an unexplained black screen.** At 360×640 with a sustained loss,
  `#hud-status` ("GPU CONTEXT LOST — RESTORING" → later "RELOAD TO RECOVER") measures
  `left 505.6, right 599.1` against `innerWidth 360`: 145 px past the edge, never visible.
  Screenshot `scratchpad/gameplay/vp360-lost-persistent.png` — the whole frame is
  `#070d14` with a clipped HUD reading "… FPS — DRA". Compare the boot-failure path, which
  wraps and fits (`t6-nowebgl2-360.png`): the recovery text lives in the splash there and
  in a flex child here, and only one of the two survives a narrow viewport. Reproduce:
  360×640 context, init-script patch replacing `WEBGL_lose_context.restoreContext` with a
  no-op, then `canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`
  — script at `scratchpad/gameplay/drive2.mjs` (T4) parameterised to 360 px.
- [minor] G1 — **`__dragonveinStats()` reports a stale, healthy-looking frame in the window
  between a context restore and the first frame drawn through the new context.** Measured
  25 ms after `loseContext()` on SwiftShader (where restore completes in <25 ms):
  `{"drawCalls":21,"triangles":32568,"frameMs":66.7,"cpuFrameMs":37,"contextLost":false}`
  while the HUD honestly printed `FPS — DRAWS — TRIS —`. Caught again inside the
  `webglcontextrestored` handler itself: `{"drawCalls":0,"triangles":0,"contextLost":false}`.
  The HUD has a `framesSinceRestore === 0` guard; the accessor the gates poll does not, so
  the two disagree about the same moment. During the *lost* state the accessor is correct
  (`null`s + `contextLost: true`, confirmed at +0 ms, +5 ms, +200 ms, +1 s, +3 s, +7 s), so
  this is a one-frame-wide hole, not the old "FPS 60 over a dead canvas". Reproduce: the
  one-liner in my transcript, or add a `webglcontextrestored` listener that logs
  `__dragonveinStats()`.
- [minor] G1 — **`artifacts/playtest.log` does not actually evidence the context-loss
  behaviour it claims to check.** Line 11 induces a loss, waits 4 000 ms, and records only
  the *post-restore* state (`"lost":false`, `framesSkippedWhileLost":0`); line 12's
  "overlay afterwards" is likewise post-restore (`FPS | 8`). Nothing in the log observes
  the page *while* the context is dead, so the log alone cannot distinguish the current
  honest behaviour from the old stale-FPS bug. I verified the honest behaviour myself
  rather than from the artefact. (`framesSkippedWhileLost` was 1 in my run and 0 in the
  frozen log — the induced loss is simply shorter than one frame on this rasteriser, which
  is another reason the log is thin evidence here.)
- [minor] G5 — no in-page recovery affordance after an unrecoverable loss: the page tells
  the player to reload (at desktop width) but offers no button, and 421 skipped rAF
  callbacks later it is still asking. `scratchpad/gameplay/t4-unrecoverable.png`.

### What is good

- The overlay is honest where it counts, and it is honest *immediately*. Read from inside
  the `webglcontextlost` dispatch, `__dragonveinStats()` already returns
  `{drawCalls:null, triangles:null, frameMs:null, cpuFrameMs:null, contextLost:true}` and
  the HUD already shows em dashes plus a status line. Through a 7 s sustained loss it never
  once printed a frame rate for a canvas that was not drawing (`T4 +200/+1000/+3000/+7000 ms`).
  `null` rather than `0` is the right call: zero draw calls is a claim about a frame.
- The boot-failure path is genuinely good. A browser with no WebGL2 gets a plain-language
  explanation on the splash — wrapped, centred and readable at 360 px — instead of an
  eternal "đang khởi tạo thế giới…". Verified with `getContext` stubbed to `null`.
- Boot is fast and reproducible: FCP 104 ms, first frame 303 ms, 1 754 B of navigation
  transfer, and three reloads in a row landing on the identical steady state.
- The frame loop is resilient: induced loss → automatic restore → 86 frames rendered in the
  next 2.5 s with the HUD back to real numbers, zero page errors and zero console errors
  across every context I drove (seven browser contexts, three viewports, two fault
  injections).
- The backdrop stays put while the island turns. Across `00-boot/01-wide/03-late/
  04-context-restored` only the island's rotation changes; the nine companion islands and
  the birds are pixel-identical, so there is no swim or pop to find at this milestone.

SCORE_MACHINE: 8.2
