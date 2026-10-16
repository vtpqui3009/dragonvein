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

IndexedDB, one store (plus a write-ahead journal in `localStorage`, below). The record
holds the sim state, the RNG version and a schema version. Migrations live in
`src/sim/migrate.ts` and are only ever added, never deleted — a player's bred dragons must
survive every future release.

Since M8a, concretely:

| piece | file | owns |
|---|---|---|
| world state | `src/sim/world.ts` | `World`: `schema`, `seed`, `tick` (20 Hz), `rng` (the four `Rng.state()` words), `nextId`, `roster` (`{ id, genome: GenomeJson }`), `eggs` (empty until M9). Plain JSON. `createWorld(seed)`, `step(world)` (in place, allocation-free), `drawU32(world)`. |
| payload | `src/sim/migrate.ts` | the text stored: `{"rngVersion": 1, "world": {"schema": 1, …}}`. `world.schema` and `rngVersion` never move. `encodeSave`, `decodeSave`, `MIGRATIONS` (append-only; entry *i* reads schema *i*+1), validation. |
| policy | `src/sim/persist.ts` | `openWorld` / `SaveSession`: load (or promote a journal entry), refuse, set aside, back up, write. No clock or DOM: wall-clock stamps and a timing clock are passed in. |
| store | `src/core/save.ts` | database `dragonvein`, object store `save`; keys `main`, `backup.v<N>`, `refused.<n>`; each save value `{ gen, savedAt, text, writer, seq }`. The write-ahead journal: `localStorage` key `dragonvein.journal.<writer>`. `openIdbStore()` never rejects and reopens a closed handle; `memoryStore()` / `memoryJournal()` for tests. |
| wiring | `src/main.ts` | load at boot (dynamic import, does not block the first frame), autosave every 10 s and on `visibilitychange`→hidden and `pagehide`, a roster change at once, the 20 Hz accumulator, the HUD readout and its recovery buttons. |

The rules every future schema keeps:

- **Refuse, never repair or overwrite.** A record from a newer schema or RNG version
  (`newer`), with a field missing (`incomplete`), or unparseable, mistyped, carrying an
  unknown field or a genome whose alleles do not hash to its `gid` (`corrupt`) is refused.
  The game starts a fresh world and the HUD says the save was kept and not overwritten
  ("made by a newer version of the game" for `newer`).
- **A refusal is never a dead end, and the way out deletes nothing.** The HUD offers
  *export the old save* (a local file download of the stored value; no network) and *start
  fresh, keep the old save aside*: one transaction moves the record, as stored, to the first
  free `refused.<n>` and empties `main` — only if `main` is still exactly the value this
  session read and refused (compared whole, never by gen alone: gen repeats after a
  set-aside, and matching on it once moved another tab's live save aside). If it changed,
  nothing moves and the HUD says so and offers a reload. The genomes in a refused record of this schema that
  still validate (gid included) join the fresh world under new ids. `refused.*` and
  `backup.*` are never deleted by the game.
- **Back up before migrating.** The write that first replaces a schema-N < current record
  copies it to `backup.vN` in the same transaction.
- **Atomic writes.** Check, backup and put are one `readwrite` transaction, resolved on
  `complete`; a crash mid-save leaves the previous record whole.
- **A write replaces only the record its session loaded, or one it wrote since.** A record
  is identified by `gen` *and* `writer` *and* `seq` (gen alone repeats after a set-aside).
  The store checks this inside the transaction and refuses anything else, so a stale tab
  cannot overwrite a roster it never saw. A tab whose write lands posts its gen on
  `BroadcastChannel('dragonvein-save')`. A refused or told tab is **paused**: its world
  stops ticking and refuses changes, and the HUD offers a reload. Chosen over Web Locks
  because it is enforced at the store, where a bug in the page cannot bypass it.
- **Every save is journalled, then issued at once.** Measured in Chromium (M8a cycle 2): a
  transaction still waiting behind another tab's when its page unloads is aborted, even a
  synchronous `put` with `commit()`. So each save first writes `localStorage`
  `dragonvein.journal.<writer>` (synchronous, survives the unload), then issues its
  IndexedDB write without waiting for the one in flight; transactions on one store run in
  creation order and a write older than one stored is skipped. On load, a journal entry
  written on top of exactly the stored record (or a later one by its own session) and newer
  than it is *promoted*: the world comes from it, and the first landed write puts it in
  IndexedDB and clears the journal. The journal is a write-ahead log; IndexedDB stays the
  save. If `localStorage` is unavailable or full, saves still go to IndexedDB unjournalled.
- **"saved" means durable.** The HUD shows "saved" only when the newest save is in IndexedDB
  or in the journal; otherwise "saving". With the journal off (storage blocked or full) the
  HUD says so.
- **A load read times out.** `main` is read with a 10 s timeout; while it waits the HUD says
  "waiting for another tab's save…", and on timeout the session never writes (it cannot know
  what it would overwrite) and offers a reload.
- **An emptied slot is re-saved.** A session that finds `main` gone after it has saved, or
  gone from under the record it loaded (database deleted or cleared), writes its world to
  the empty slot again and says so — it is not "another tab".
- **A closed handle is reopened.** On `versionchange` (a newer build upgrading) or `close`,
  the next call reopens; if it cannot ("a newer version of the game upgraded the save"),
  the HUD says so and offers a reload — mid-session and at boot alike.
- **No IndexedDB** (missing, throwing, failing or not opening in 4 s): the game runs
  unsaved and the HUD says "not saved".
- `tests/fixtures/save-v1.json` is a frozen schema-1 save (one bred dragon). Every build
  must keep loading it.
