# ARCHITECTURE

## Ownership — one agent per directory

| directory | owner | may import |
|---|---|---|
| `src/core/` | core-builder | nothing |
| `src/sim/` | sim-builder | `core` |
| `src/assets/` | mesh-builder | `core`, `three` |
| `src/render/` | render-builder | `core`, `assets`, `three` |
| `src/ui/` | ui-builder | `core`, `content` |
| `src/audio/` | audio-builder | `core` |
| `src/content/` | content-builder | `core` |
| `assetgen/` | asset-builder | python only |
| `src/main.ts`, `src/dragon-view.ts` + `dragon.html` (the dragon viewer), `tools/`, config | integrator | anything |

`src/sim/` must never import `three`, `render`, `ui` or `audio`.
`src/ui/` must never import `three` or `render`; it talks through events.
Enforced by `npm run check:layers`.

## Layers

```
   input ──▶ src/ui ──Command──▶ src/sim ──Snapshot+Event──▶ render | audio | ui
                                 (deterministic, fixed 20 Hz, pure TS)
```

Simulation never reads the renderer. The renderer never writes to the simulation.

## Cross-layer vocabulary — `src/core/events.ts`

```ts
type Command =
  | { t:'tame';   dragon: DragonId }
  | { t:'breed';  a: DragonId; b: DragonId }
  | { t:'hatch';  egg: EggId }
  | { t:'mount';  dragon: DragonId }
  | { t:'build';  tile: TileId; buildingId: BuildingId }
  | { t:'feed';   dragon: DragonId; item: ItemId };

type DomainEvent =
  | { t:'tamed';      dragon: DragonId }
  | { t:'eggLaid';    egg: EggId; genome: GenomeJson }
  | { t:'hatched';    dragon: DragonId; genome: GenomeJson; rarity: number }
  | { t:'built';      tile: TileId; buildingId: BuildingId }
  | { t:'levelUp';    level: number }
  | { t:'currency';   gold: number; shards: number };
```

## Asset pipeline

```
assetgen/<family>/<name>.py   authored generator (Python + bpy)
      │ npm run assets:build
      ▼
public/assets/<family>/<name>.lod{0,1,2}.glb   Draco-compressed
      │ npm run assets:render
      ▼
artifacts/variants/<name>.png   8 seeds   ─┐
artifacts/turntables/<name>.webm          ─┴▶ art-critic
```

Dragons skip the `.glb` step: `src/assets/dragon/` builds geometry in a worker at runtime,
because a bred dragon has no mesh until the moment it is bred.

## Render contract

```ts
interface Renderer {
  mount(canvas: HTMLCanvasElement): void;
  applySnapshot(s: WorldSnapshot): void;   // idempotent, once per sim tick
  onEvent(e: DomainEvent): void;           // transient FX only
  setQuality(t: QualityTier): void;
  frame(dtMs: number): void;
  stats(): { drawCalls:number; triangles:number; frameMs:number; cpuFrameMs:number };
}
```

`frameMs` is the presentation interval (rAF to rAF) and is quantised to the vsync tick;
`cpuFrameMs` is what the frame cost the main thread. `gate:perf` budgets the cost, never
the interval — see `docs/PERF_BUDGET.md` §How the gate actually measures this. The full
instrument the gate reads is `__dragonveinPerf` (`reset()` / `read()`), which also carries
GPU time from `EXT_disjoint_timer_query_webgl2`, the viewport, the quality tier and
boot-to-first-frame.

Hard rules for `src/render/`:
- No allocation inside `frame()` from our own code — pre-allocate in `mount()`. Note that
  `three.WebGLRenderer.render` itself allocates roughly 4 kB plus 2 kB per draw call and
  that is not removable from here, so the enforceable rule is the measured total:
  `gate:perf` fails above 40 KiB/frame (docs/PERF_BUDGET.md §Heap churn).
- Every repeated prop goes through `InstancedMesh` — one draw call per prop type — or,
  where many kinds share one material, a `BatchedMesh`: one draw call for all of them.
  The hero island's generated flora and rocks are one `FloraBatch` (`src/render/flora.ts`,
  M5f), whose shadow pass draws only its caster prefix. Per-instance culling and sorting
  stay off on a batch: both walk every instance every frame and the sort allocates.
- One `DirectionalLight` for the sun. Glow is emissive + bloom, not real lights.
  Real point lights are capped at 4.
- Shadows: cascaded, 2 cascades, resolution from the quality tier.
- Survive context loss. Listen for `webglcontextlost` (the default must be prevented, or
  the browser never fires a restore), ask for the context back through a
  `WEBGL_lose_context` handle taken *before* the loss, re-acquire every GL object on
  `webglcontextrestored`, and make any readout say the context is dead rather than
  reprinting the last good numbers. A driver reset is routine on the target hardware.

## Save

IndexedDB, one store. The record holds the sim state, the RNG version and a schema
version. Migrations live in `src/sim/migrate.ts` and are only ever added, never deleted —
a player's bred dragons must survive every future release.

Since M8a, concretely:

| piece | file | owns |
|---|---|---|
| world state | `src/sim/world.ts` | `World`: `schema`, `seed`, `tick` (20 Hz), `rng` (the four `Rng.state()` words), `nextId`, `roster` (`{ id, genome: GenomeJson }`), `eggs` (empty until M9). Plain JSON. `createWorld(seed)`, `step(world)` (in place, allocation-free), `drawU32(world)`. |
| payload | `src/sim/migrate.ts` | the text stored: `{"rngVersion": 1, "world": {"schema": 1, …}}`. `world.schema` and `rngVersion` never move. `encodeSave`, `decodeSave`, `MIGRATIONS` (append-only; entry *i* reads schema *i*+1), validation. |
| policy | `src/sim/persist.ts` | `openWorld` / `SaveSession`: load or start fresh, refuse, back up, write generations, coalescing. No clock or DOM: wall-clock stamps are passed in. |
| store | `src/core/save.ts` | database `dragonvein`, object store `save`; keys `main` and `backup.v<N>`; each value `{ gen, savedAt, text }`. `openIdbStore()` never rejects; `memoryStore()` for tests. |
| wiring | `src/main.ts` | load at boot (dynamic import, does not block the first frame), autosave every 10 s and on `visibilitychange`→hidden and `pagehide`, the 20 Hz accumulator, the HUD readout. |

The rules every future schema keeps:

- **Refuse, never repair or overwrite.** A record from a newer schema or RNG version
  (`newer`), with a field missing (`incomplete`), or unparseable, mistyped, carrying an
  unknown field or a genome whose alleles do not hash to its `gid` (`corrupt`) is refused.
  The game starts a fresh world, the HUD says the save was kept and not overwritten, and
  that session never writes.
- **Back up before migrating.** The first write after loading schema N < current copies the
  stored record to `backup.vN` in the same transaction.
- **Atomic writes.** Check, backup and put are one `readwrite` transaction, resolved on
  `complete`; a reload or crash mid-save leaves the previous record whole.
- **Two tabs: a write replaces only the record its tab last saw.** Each record carries `gen`;
  a write passes the gen it expects and the store refuses it, inside the transaction, if the
  stored gen moved. The refused tab stops saving and says so; a tab whose write lands posts
  its gen on `BroadcastChannel('dragonvein-save')` so others stop at once. Chosen over Web
  Locks because it needs no lock lifetime management and is enforced at the store, where a
  bug in the page cannot bypass it.
- **No IndexedDB** (missing, throwing, failing or not opening in 4 s): the game runs
  unsaved and the HUD says "not saved".
- `tests/fixtures/save-v1.json` is a frozen schema-1 save (one bred dragon). Every build
  must keep loading it.
