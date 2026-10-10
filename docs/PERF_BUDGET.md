# PERF BUDGET

Target: **60 fps at 1080p on an Intel iGPU**. The owner's machine is weak; that is the
machine that matters.

## Per-frame budget at 60 fps — 16.6 ms

| stage | budget |
|---|---|
| sim + logic | 2.0 ms |
| scene update + culling | 1.5 ms |
| GPU opaque + shadows | 7.0 ms |
| post-processing | 3.0 ms |
| headroom | 3.1 ms |

## How the gate actually measures this

### Cost, not cadence

`gate:perf` measures what a frame **costs**, not how far apart frames are **presented**.
The distinction is not pedantry: it is the difference between an instrument that works and
one that cannot work.

Presentation cadence is quantised by the compositor to the vsync tick. Measured on this
build, 120 consecutive `requestAnimationFrame` deltas were every one of them an exact
integer multiple of 16.667 ms, worst deviation 0.010 ms. An instrument whose finest
resolution is 16.667 ms cannot show that a frame fits inside 16.6 ms — it can only count
whole vsync intervals missed — and a frame presented on *every* vsync reads as 16.667 ms,
which is over a 16.6 ms budget by a rounding artefact rather than by being slow.

So the page (`src/main.ts`) publishes `__dragonveinPerf`, and the gate records:

| key in `artifacts/perf.json` | what it is |
|---|---|
| `cpuFrameMs` | main-thread wall time around the render call, `performance.now()` |
| `gpuFrameMs` | GPU time per frame from `EXT_disjoint_timer_query_webgl2`, or `null` plus `gpuTimer.unavailableReason` where the context has no timer |
| `frameCostMs.p95` | `max(cpuFrameMs.p95, gpuFrameMs.p95)` — CPU and GPU pipeline, so a frame costs the slower of the two. **This is the figure compared against 16.6 ms.** |
| `presentIntervalMs` | the rAF cadence, kept because it is still useful, under a name that says what it is. Compared against no budget. `maxDeviationFromVsyncTickMs` near 0 means it is tick-quantised and resolves nothing finer. |
| `unpaced` | a second pass with `--disable-gpu-vsync --disable-frame-rate-limit`, where rAF is not quantised. Its only job is to prove that the quantisation in the paced pass is the compositor and not the app. Nothing here is budgeted: unpaced, the page enqueues GL work faster than it drains and per-frame cost becomes queue backpressure. |

The gate runs the paced pass first and takes every budgeted figure from it, because paced
— one render per presentation — is the condition the game ships in.

### What is enforced where

Wall-clock frame cost only means something on real GPU hardware. CI runners and the build
container both fall back to SwiftShader, a CPU rasteriser roughly an order of magnitude
slower, where this scene's GPU timer reports ~170 ms per frame for 20 draw calls.
Enforcing 16.6 ms there would leave the gate permanently red, and a permanently red gate
is one everybody learns to ignore.

So `gate:perf` splits its budgets:

- **Enforced everywhere** (hardware-independent): draw calls ≤ 180, triangles ≤ 900 000,
  heap churn (see §Heap churn), `cpuFrameMs` ≤ 3.5 ms (see below), zero page errors.
  These are what regress when somebody forgets to instance a prop, ships an unculled
  LOD0, or allocates in the frame loop.
- **Enforced only on real GPUs**: `frameCostMs.p95` ≤ 16.6 ms. On a software rasteriser it
  is recorded in `artifacts/perf.json` as advisory, with `softwareRenderer: true` and
  `frameBudgetEnforced: false`, so the perf-critic can see it was measured but not binding.

### The main-thread half, 3.5 ms, enforced everywhere

`frameCostMs` is `max(cpu p95, gpu p95)`, and on a software rasteriser the GPU term
dominates by two orders of magnitude, so gating it on real hardware left a GPU-less
container policing **no part of frame cost at all**. The CPU term does not have that
problem: SwiftShader rasterises off the main thread, measured on the M0 scene as
`cpuFrameMs.p95 = 1.6 ms` beside `gpuFrameMs.p95 = 135 ms`. A main-thread regression — a
per-frame allocation storm, a matrix rebuild, a sync `readPixels` — therefore shows up in
`cpuFrameMs` on SwiftShader exactly as it would on an iGPU.

So `cpuFrameMs` ≤ **3.5 ms** is enforced unconditionally. The number is read off the
§Per-frame budget table above, not chosen: sim + logic 2.0 ms plus scene update + culling
1.5 ms is the main thread's share of a frame; GPU opaque + shadows, post-processing and
headroom are the other 13.1 ms and are not main-thread work. It moves only if that table
moves. `tests/spine.test.ts` fails if the comparison is made conditional again.

Which statistic carries it matters, and the first version of this budget got it wrong by
comparing the p95. SwiftShader does not rasterise *on* the main thread, but it does
rasterise on worker threads that compete for the same cores, so on a small runner the
tail of `cpuFrameMs` measured contention rather than app work. Identical bytes, two
machines:

| | cpu p50 | cpu p95 | gpu p50 |
|---|---|---|---|
| build container | 0.7 ms | 1.8 ms | 117 ms |
| GitHub runner | 0.9 ms | 3.7 ms | 237 ms |

The rasteriser is twice as slow on the runner and the p95 doubled with it (+106%) while
the median moved +29%. A budget that goes red because the box is busy is one everybody
learns to ignore — the same argument that keeps `frameCostMs` advisory here. So for one
run of this project the **median** carried the enforcement and the p95 was held only where
`frameBudgetEnforced` was true.

That was the right read of the measurement and the wrong place to stop, because no machine
this project has ever run on has a real GPU, so in practice **no p95 was enforced
anywhere**. A tail nobody looks at is a tail nobody fixes. The owner ruled
(`STATE.md` §2026-10-10 decisions, decision 2) that the contention should be removed rather
than the statistic, and that is now done — see §Capping the rasteriser below. The p95 is
held to the same unchanged 3.5 ms wherever the cap is *verified*; the median is enforced
everywhere regardless. The number has never moved. Only what it is compared against.

This does **not** stand in for the 16.6 ms line, and nothing here should be read as having
verified it. Being inside 3.5 ms of CPU says a frame is not CPU-bound; it says nothing
about whether the GPU can draw it in time.

## Capping the rasteriser

The budget needs one property: **no rasteriser thread may share a core with the page's
main thread.** Real hardware has it for free. This section is how a software rasteriser is
made to have it, and — because the ruling asked for the record either way — exactly what
was tried and what each attempt did.

### What did not work: capping the thread count

Chromium's bundled `libvk_swiftshader.so` runs one `marl` worker per core. On this 4-core
container, `/proc/<gpu-pid>/task/*/comm` shows `Thread<00>` … `Thread<03>`, which is a
direct observation of the pool rather than an inference, and is what makes a claimed cap
checkable.

| attempt | what it did |
|---|---|
| `SwiftShader.ini` with `[Processor] ThreadCount=1`, written into the GPU process's own cwd (confirmed via `/proc/<gpu-pid>/cwd`) | **No effect.** Still 4 `Thread<NN>` workers. The strings `SwiftShader.ini`, `Processor` and `ThreadCount` are all present in the shipped library, so the `Configurator` is compiled in, but nothing in Chromium's build wires it to the marl pool. |
| `--num-raster-threads=1` | **No effect** on the pool (still 4 workers). It is Chromium's own tile-raster pool, not SwiftShader's. Main-thread p95 came out 3.9 ms, i.e. worse than uncapped. |

Chromium accepted both without complaint. Neither capped anything. This is why
`tools/rasteriser-cap.mjs` reports `verified` only after re-reading the kernel's own
masks, and never from an exit code.

### What worked: capping the thread *placement*

`sched_setaffinity` (via `taskset`) on every thread of every browser process partitions
the cores. The page's renderer process gets the lower half to itself; the GPU process with
its marl pool, and every other helper process, is confined to the upper half. The
rasteriser then cannot be scheduled onto a core the main thread runs on.

Measured on the M0 scene at 1920×1080, this container, four runs:

| | cpu p50 | cpu p95 | cpu max | p95/p50 | gpu p50 |
|---|---|---|---|---|---|
| uncapped | 0.7 ms | 1.6–1.8 ms | 4.7–9.0 ms | 2.3–2.6 | ~200 ms |
| **capped** | 0.7–0.8 ms | **1.1–1.3 ms** | 2.5–3.8 ms | **1.6–1.7** | ~375 ms |

The p95/p50 ratio falling towards 1 is the evidence the ruling asked for: what remains in
the tail is the app, not the box. The spread across runs narrows with it, which is the
same statement in a different form.

Two variants were measured and rejected, because the obvious cap is not the best one:

- **GPU process pinned to cpus 1–3, page left free.** p95 **3.0 ms** — *worse than
  uncapped*. Confining 4 workers to 3 cores raises their density, and a page free to roam
  gets scheduled right onto them. Pinning the rasteriser is not enough; the page has to be
  pinned away from it.
- **Page pinned to one core (cpu 0), GPU to 1–3.** p95 1.9–2.3 ms. Better than uncapped,
  worse than the split: on a single core the page's own compositor thread becomes the
  competitor. This is why `CAP_MIN_CPUS` is 4 — below that the cap declines instead of
  guessing, and the median carries the budget alone.

### What it costs, and the window

Halving the rasteriser's cores roughly doubles its per-frame time (gpu p50 ~200 → ~375 ms).
GPU time is advisory on a software rasteriser, so no budget moves — but the **sample rate**
halves with it, and a p95 from a window that hit its deadline instead of its sample target
is the irreproducible number a previous run already fixed once. So:

- The sampling deadline is 420 s, against a 360-sample target. Measured: 369 samples in
  153 s here, and the loop exits the moment the target is met, so the deadline only costs
  time on a page that has stopped producing frames.
- `gate:perf` enforces the tail only when the window **closed on its target**. A slow box
  loses the tail check and says so in `perf.json.mainThreadTailNote`; it does not fail at
  random.

### What the artefact records

`artifacts/perf.json` carries `rasteriserCap` — mechanism, the cpu partition, every
process pinned, the observed marl worker count, how many thread masks were re-read, and
the failed thread-count attempts above — plus `mainThreadTailEnforced` and a note saying
why if it is false. A critic reading only the artefacts can tell whether the p95 it is
looking at was enforced, and why.

Linux-only: it reads `/proc` and shells out to `taskset`. Anywhere else the cap declines
and the median carries the budget, which is the documented fallback rather than a failure.

### Real-GPU verification — a human step, and its record

Nothing a GPU-less container measures can close `P1`. The frame budget is verified on real
hardware by a human, and the record of that lives in `STATE.md` under
**Real-GPU verification log**, one row per verification: UTC date, commit, machine and
GPU, viewport, tier, and the `frameCostMs.p95` observed.

The procedure, so the row means the same thing every time:

1. Check out the commit under test on a machine with a real GPU.
2. `npm ci && npm run build && npm run gate:perf`
3. Confirm `artifacts/perf.json` reports `softwareRenderer: false` and
   `frameBudgetEnforced: true` — otherwise the run measured SwiftShader again and the row
   is worthless.
4. Copy `renderer`, `viewport`, `tier.name` and `frameCostMs.p95` into the row.

An empty log is the honest state until someone runs step 2 on a GPU. It is not a
formality: `docs/ROADMAP.md` M16 is the milestone that has to pass this on Potato through
Ultra, and every row before then is evidence that the budget is still reachable.

#### Two grades of evidence, and never confuse them

The four steps above produce a **verification**. There is a weaker grade that is still
worth recording, because the alternative in practice is an empty log:

- **verification** — the full procedure. Reports `frameCostMs.p95` from `artifacts/perf.json`
  with `softwareRenderer: false`. This is the only grade M16 accepts.
- **sighting** — a human loaded the deployed build on real hardware and read the on-screen
  overlay. That gives sustained FPS, draw calls and triangles. It does **not** give a
  percentile, and a vsync-capped 60 FPS is a ceiling rather than a distribution: it proves
  no frame in the observed window cost more than ~16.6 ms, and says nothing about the tail
  beyond that window. Record it as `sighting`, put the FPS in the p95 column prefixed with
  `~`, and never let a sighting stand in for a verification after M15.

A row whose grade is not stated is treated as a sighting.

The budget is never raised to make a change pass. Correcting the *instrument* is not
raising the budget: 16.6 ms, 180 draw calls and 900 000 triangles have never moved, and
`tests/spine.test.ts` fails if they do.

## Heap churn

| thing | budget |
|---|---|
| Heap allocated per rendered frame | **40 960 B/frame**, enforced everywhere |

This is the one frame budget the build container can police honestly: JS-side allocation
does not care that the rasteriser is software, and it reproduces. Seven consecutive
`npm run gate:perf` runs on the M0 scene (1920×1080, 20 draw calls) measured
**37 171 / 37 620 / 36 710 / 37 426 / 37 429 / 37 643 / 38 098 B/frame** — a 3.8 % spread.
The budget is 40 KiB (40 960 B), the worst of those plus 7.5 %: tight enough that one new
per-frame allocation inside a 44-instance loop trips it, loose enough to survive the
sampling noise.

If this ever goes red from noise rather than from a change, the fix is a longer sampling
window or a shorter sampling interval in `tools/gate-perf.mjs`, not a bigger number here.

`artifacts/perf.json` records `heap.minKB`, `maxKB`, `sawtoothAmplitudeKB`, `netGrowthKB`,
`risingSumKB`, `bytesPerFrame`, `framesInWindow`, `scavenges` and the raw series, sampled
with `Runtime.getHeapUsage` over CDP from outside the page. `netGrowthKB` near zero with a
large `sawtoothAmplitudeKB` is churn, not a leak, and the two are scored differently.

### Where the current 37 kB/frame comes from

Not from `src/main.ts`. Measured in a replica of the M0 scene where one factor at a time
could be removed (1280×720):

| what runs each frame | B/frame |
|---|---|
| rAF loop, resize check and island rotation, `renderer.render` removed | **380** |
| `renderer.render` on a scene with 0 draw calls | 4 149 |
| `renderer.render`, 1 draw call | 8 537 |
| `renderer.render`, 20 draw calls (the M0 scene) | 42 212 |

380 B/frame is the browser's rAF floor, so the per-frame code of `src/main.ts` is off the
budget entirely. The rest is inside `three.WebGLRenderer.render` and scales with draw
calls: roughly 4 kB fixed plus ~2 kB per draw, spread across the render-list sort, the
uniform upload path and `WebGLPrograms.getParameters` (called twice per frame, because one
pooled depth material is shared by instanced and non-instanced shadow casters and the
`instancing` flag flips between them). None of it is removable from `src/main.ts`.

So **the way to pay for a bigger scene is fewer draw calls, not a bigger heap budget.**
Raising this number because the scene grew is the thing CLAUDE.md §2.7 forbids. The
draw-call budget and the heap budget now push in the same direction, which is the point.

### GC pauses

The rubric asks for GC pauses under 2 ms. The web platform exposes no GC pause timing —
no `PerformanceEntry` for a scavenge, no duration from CDP — so `perf.json` says so
(`gc.pauseMsMeasured: false`) instead of inventing a number, and records what can be
known: scavenges inferred from falls in the heap series, their mean interval, and
`gc.worstCpuFrameMs`, which bounds any pause, since a pause has to land inside a frame.

## Other budgets

| thing | budget |
|---|---|
| Bred-dragon mesh generation | 120 ms, off the main thread |
| Bundle, gzipped, assets excluded | 1.4 MB — `gate:perf` enforces it as `bundle.gzipBytes` |
| Boot to first frame | 2.5 s — `gate:perf` enforces it as `bootMs` |
| LOD0 / LOD1 / LOD2 triangles per prop | 4 000 / 1 200 / 300 |

`bundle` and `bootMs` used to be budgets nobody measured; the perf-critic had to run
`npm run build` and write its own navigation-timing probe to score them. Both are now keys
in `artifacts/perf.json`, both enforced, so a critic reading only the artefacts has the
numbers in front of it.

## Quality tiers

Detected once at boot from `WEBGL_debug_renderer_info` plus a 30-frame warm-up
measurement, then overridable by the player and persisted.

| tier | hardware | settings | target |
|---|---|---|---|
| Potato | old iGPU, weak phone | 720p, no shadows, no post | 30 fps |
| Low | Intel UHD | 900p, 512 shadows, no bloom | 60 fps |
| Medium | ordinary laptop | 1080p, 1024 CSM, bloom | 60 fps |
| High | mid discrete GPU | 1080p, 2048 CSM, SSAO | 60 fps |
| Ultra | high-end discrete | 1440p+, SSAO + water SSR | 60 fps |

## Techniques that are not optional

- `InstancedMesh` for every repeated prop. One draw call per prop type, never per instance.
- No allocation inside the frame loop. Pre-allocate at mount.
- Glow is emissive material plus bloom, never a real light. Real point lights capped at 4.
- Vegetation animates in the vertex shader. No skinned animation for flora, ever.
