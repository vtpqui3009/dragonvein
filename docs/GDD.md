# DRAGONVEIN — game design

## One line

A browser 3D creature-collector action-RPG where **breeding generates real 3D dragons**
that have never existed before.

## Why this and not another dragon game

Every creature collector ships a fixed roster. Ours ships a **generator**. A dragon's
genes are literally the parameters its mesh is built from, so a bred dragon is a new
model, not a palette swap. The sentence we want players saying is:

> "Look at this one. Nobody else has this."

## The world

A sky-world that broke apart. Islands drift at different altitudes, each with its own
biome and its own wild dragon population. The player inherits a small home island and a
single dragon, and works outward.

## The loop

```
         explore an island
                │
         find a wild dragon
                │
             tame it          ← reading its behaviour, not throwing a ball
                │
      ┌─────────┴─────────┐
      │                   │
  ride it               breed it
  (reach new islands)   (hunt for genes)
      │                   │
      └─────────┬─────────┘
                │
        grow the home island
      (habitats unlock more breeding)
```

Session shape matters: Gen Z players play in short bursts on mobile. A satisfying session
is 4–6 minutes — one tame, or one hatch, or one island dressed. Nothing important may
require a 40-minute sitting.

## Pillars

1. **The genome is visible.** Every mechanic shows genes. The inspector names which parent
   each trait came from. A hatch is the payoff of a plan, never a slot machine.
2. **The world is alive.** Birds, insects, wind in the trees, dragons wandering and
   sleeping. If the player stands still and the screen is static, we have failed.
3. **It runs anywhere.** 60 fps on an Intel iGPU, 30 fps on a phone, instantly from a URL.
4. **No pay-to-win, no backend.** Offline, local save, no accounts, no ads.

## Progression

- **Island level** rises with population and buildings; unlocks habitats and breeding slots.
- **Dragon bonds** rise with care; unlock riding, then combat roles.
- **Gene library** is the real collection: discovered alleles, fusions found, rarities hit.
  This is what the player screenshots and shares.

## Combat

Real-time, light. Element triangle plus breath attacks shaped by genes — wing span sets
flight speed, body mass sets stagger resistance, horn count sets charge damage. Combat
exists to make genes matter, not to be a separate game.

## What we are not building

No gacha, no energy timers, no login streaks, no multiplayer at launch, no story campaign.
