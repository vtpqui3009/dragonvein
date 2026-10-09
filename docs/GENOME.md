# GENOME — the specification both generators obey

The genome is the contract between `assetgen/genome.py` (reference) and
`src/core/genome.ts` (runtime). When the two disagree, this document decides which is
wrong. `npm run gate:parity` enforces agreement.

## Diploid, with hidden alleles

Every gene carries **two alleles**. The expressed value comes from the dominant one; if
both are dominant or both recessive, the two blend. The hidden half is the entire reason
to keep breeding: a trait can skip a generation and resurface.

```
express(gene):
  a, b = alleles
  if a.dominant and not b.dominant -> a.value
  if b.dominant and not a.dominant -> b.value
  otherwise                        -> (a.value + b.value) / 2
  clamp to the gene's range; round if the gene is integer or enum
```

## Gene table

| gene | range | kind | drives |
|---|---|---|---|
| bodyMass | 0.70–1.45 | f | spine radii |
| bodyLength | 0.80–1.35 | f | spine spacing |
| chestDepth | 0.80–1.30 | f | torso radii at the chest |
| neckLength | 0.60–1.70 | f | neck bezier reach and rise |
| neckArc | 0.00–1.00 | f | S-curve vs straight neck |
| headSize | 0.78–1.40 | f | skull radii |
| snoutLength | 0.45–1.60 | f | snout node offsets |
| jawWidth | 0.75–1.30 | f | jaw radii |
| tailLength | 0.60–1.80 | f | tail tip X |
| tailTaper | 0.50–1.30 | f | tail radius falloff exponent |
| tailTip | none/fin/spade/club | e | tail ornament mesh |
| legLength | 0.70–1.40 | f | limb node heights |
| legThickness | 0.70–1.50 | f | limb radii |
| toeCount | 3–5 | i | toe chains per foot |
| wingSpan | 0.55–1.65 | f | wing bone extent |
| wingFingers | 2–4 | i | finger chains and membrane faces |
| wingShape | 0.00–1.00 | f | broad soaring ↔ falcate sprint |
| wingDroop | 0.00–1.00 | f | wing rest height |
| hornCount | 0–6 | i | horn chains (pairs, plus a centre horn when odd) |
| hornLength | 0.50–1.80 | f | horn reach |
| hornCurve | 0.00–1.00 | f | horn sweep-back |
| crestType | none/frill/fin/antler | e | skull crest geometry |
| spineCount | 4–14 | i | dorsal spike count |
| spineHeight | 0.40–1.60 | f | dorsal spike height |
| hue | 0.00–1.00 | f | base scale hue |
| hueShift | −0.22–0.22 | f | belly and membrane offset |
| saturation | 0.35–1.00 | f | |
| value | 0.28–0.92 | f | |
| pattern | plain/banded/mottled/gradient/iridescent | e | surface shader |
| glow | 0.00–1.00 | f | emission on horns and spikes |

## Elements

`ember, tide, stone, gale, jade, umbra`. A dragon carries two: the **primary** (expressed,
drives abilities, aura colour and vocal timbre) and the **recessive** (hidden, inheritable).

Each element biases the wild-caught genome so species read apart at a glance — stone is
heavy and short-winged, gale is light and broad-winged, ember is horned and saturated.
Biases are in `ELEMENT_BIAS`; they shift the starting distribution only, they are not caps.

## Breeding

```
for each gene:
    take one random allele from each parent
    mutate each with probability 0.06, by ±14% of the gene's range
    flip dominance with probability 0.03
element:
    one allele from each parent
    if they match      -> homozygous child
    else 8% chance     -> fusion into a third element (see FUSIONS)
    else               -> hybrid, order randomised
```

Fusions are the long-tail chase: `ember+tide → umbra`, `stone+jade → jade`,
`ember+stone → stone`, and so on.

## Rarity

Rarity is the mean distance of continuous genes from their midpoint, plus bonuses for a
hybrid element, 5+ horns, 4 wing fingers, and the iridescent pattern. It drives price,
trade value and the "this one is special" moment. It is **derived, never stored** — a
stored rarity can drift out of sync with the genes.

## Determinism

`Rng` is xorshift128 and must produce an identical stream in Python and TypeScript. Any
change to it invalidates every saved dragon, so it is versioned: a save records the RNG
version and `src/sim/migrate.ts` handles the upgrade. The migration functions are never
deleted, only added.
