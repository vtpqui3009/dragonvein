# ROADMAP

One milestone per scheduled run. Take the lowest-numbered milestone that is not `DONE`.
Do not skip ahead. Status lives here; the narrative lives in `STATE.md`.

Roughly half of these milestones are asset milestones. That is deliberate: this is a 3D
game and the world has to feel alive before any system matters.

| # | milestone | done when | status |
|---|---|---|---|
| M0 | Toolchain & deploy spine | `npm run gates` passes; CI green; Pages serves a lit, rotating placeholder | IN_PROGRESS |
| M1 | Asset pipeline live | `assets:build` runs in CI; one generator emits LOD0–2 `.glb` + an 8-seed variant sheet + a turntable | TODO |
| M2 | Genome in TypeScript | `src/core/genome.ts` matches `assetgen/genome.py`; `gate:parity` green on 32 fixed genomes | TODO |
| M3 | Runtime dragon mesh | a genome becomes a `BufferGeometry` in a worker in < 120 ms; renders in the browser | TODO |
| M4 | Terrain assets | island generator + 5 cliff/rock generators, each with a passing variant sheet | TODO |
| M5 | **Flora wave 1** | 5 tree + 8 understory generators, wind vertex shader, 200+ instances at budget | TODO |
| M6 | Look dev | orbit camera, day/night sun, CSM shadows, bloom + ACES, 5 quality tiers | TODO |
| M7 | Dragon animation | procedural idle / walk / flap driven by genome proportions; no pops | TODO |
| M8 | Taming & roster | approach, calm, tame; roster UI; IndexedDB save survives reload | TODO |
| M9 | **Breeding** | pair two dragons, egg, hatch sequence, a visibly new child mesh; gene inspector | TODO |
| M10 | **Ambient life** | 6 fauna generators + VFX wave 1; the island reads alive when the player stands still | TODO |
| M11 | Island building | 6 creature buildings × 3 tiers, placement, snapping, economy | TODO |
| M12 | Flight | mount, take off, fly between islands, land; streaming of neighbouring islands | TODO |
| M13 | Audio | ambient beds, 40 SFX, genome-driven creature vocals, 3-layer music | TODO |
| M14 | Combat & boss | element strengths, breath attacks, one leviathan encounter | TODO |
| M15 | **Flora wave 2 + props** | remaining flora, 8 decoration generators, full dressing pass | TODO |
| M16 | Polish & perf | p95 under budget on Potato through Ultra; onboarding; first-session flow | TODO |

## When each rubric line goes live

`docs/RUBRIC.md` lets a critic score a line `n/a` while its subject does not exist. This
table is what makes that checkable: a line may be `n/a` **before** its milestone and never
at or after it. A run that marks a line `n/a` on or past its live milestone has written a
defect, not a dispensation.

| line | live from | subject |
|---|---|---|
| A1, A2, A3, A5, A6, A7, A8, A9 | M0 | anything rendered |
| A4 variant sheets | M1 | the first generator |
| P1, P2, P5 | M0 | any build |
| P4 | M0 | the frame loop |
| P3 bred-dragon mesh ≤ 120 ms | M3 | the runtime dragon builder |
| P6 Potato tier | M0 | reachable now at 1280×720 with shadows and post off; does not wait for M6's tier system |
| G1, G3, G6 | M0 | the milestone's own loop |
| G4 state survives reload | M8 | the save |
| G2 a bred dragon resembles its parents | M9 | breeding |
| G5 no softlock or unreachable state | M8 | persisted state |

## Definition of done for an asset milestone

An asset milestone is `DONE` only when, for every generator it adds:

1. `artifacts/variants/<id>.png` shows 8 seeds that read as 8 different objects.
2. LOD0, LOD1 and LOD2 all exist and each is within its triangle budget.
3. The generator is listed in `public/assets/MANIFEST.json` with its script path.
4. `art-critic` scored it ≥ 8.0.
