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
| `src/main.ts`, `tools/`, config | integrator | anything |

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
  stats(): { drawCalls:number; triangles:number; frameMs:number };
}
```

Hard rules for `src/render/`:
- No allocation inside `frame()`. Pre-allocate in `mount()`.
- Every repeated prop goes through `InstancedMesh` — one draw call per prop type.
- One `DirectionalLight` for the sun. Glow is emissive + bloom, not real lights.
  Real point lights are capped at 4.
- Shadows: cascaded, 2 cascades, resolution from the quality tier.

## Save

IndexedDB, one store. The record holds the sim state, the RNG version and a schema
version. Migrations live in `src/sim/migrate.ts` and are only ever added, never deleted —
a player's bred dragons must survive every future release.
