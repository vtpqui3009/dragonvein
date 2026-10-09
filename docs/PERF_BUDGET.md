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

Wall-clock frame time only means something on real GPU hardware. CI runners and the build
container both fall back to SwiftShader, a CPU rasteriser roughly an order of magnitude
slower, where this scene reports ~200 ms per frame while doing 5 draw calls. Enforcing
16.6 ms there would leave the gate permanently red, and a permanently red gate is one
everybody learns to ignore.

So `gate:perf` splits its budgets:

- **Enforced everywhere** (hardware-independent): draw calls ≤ 180, triangles ≤ 900 000,
  zero page errors. These are what regress when somebody forgets to instance a prop or
  ships an unculled LOD0.
- **Enforced only on real GPUs**: the 16.6 ms p95. On a software rasteriser it is recorded
  in `artifacts/perf.json` as advisory, with `softwareRenderer: true` and
  `frameBudgetEnforced: false`, so the perf-critic can see it was measured but not binding.

The frame budget still has to be verified on real hardware before a release. That is a
human step, and `STATE.md` records when it was last done.

The budget is never raised to make a change pass.

## Other budgets

| thing | budget |
|---|---|
| Bred-dragon mesh generation | 120 ms, off the main thread |
| Bundle, gzipped, assets excluded | 1.4 MB |
| Boot to first frame | 2.5 s |
| LOD0 / LOD1 / LOD2 triangles per prop | 4 000 / 1 200 / 300 |

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
