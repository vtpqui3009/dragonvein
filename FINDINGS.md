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
