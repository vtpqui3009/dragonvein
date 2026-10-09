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
  heap churn (see §Heap churn), zero page errors. These are what regress when somebody
  forgets to instance a prop, ships an unculled LOD0, or allocates in the frame loop.
- **Enforced only on real GPUs**: `frameCostMs.p95` ≤ 16.6 ms. On a software rasteriser it
  is recorded in `artifacts/perf.json` as advisory, with `softwareRenderer: true` and
  `frameBudgetEnforced: false`, so the perf-critic can see it was measured but not binding.

The frame budget still has to be verified on real hardware before a release. That is a
human step, and `STATE.md` records when it was last done.

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
