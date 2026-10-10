# RUBRIC — how critics score

Three critics score each milestone independently, in fresh context, from artefacts only.
A milestone ships at **≥ 8.0 from all three** with gates green.
Any `blocking` defect caps that critic at **5.9** regardless of other lines.

Artefacts a critic receives: `artifacts/shots/*.png`, `artifacts/variants/*.png`,
`artifacts/turntables/*.webm`, `artifacts/perf.json`, `artifacts/playtest.log`,
`docs/concept/*`, and the milestone's acceptance criteria from `STATE.md`.
A critic may run commands to reproduce. A critic may **not** read the builder's plan or
diff narrative, and may not edit code.

## art-critic

| # | line | max | fails if |
|---|---|---|---|
| A1 | Silhouette reads at 25% zoom | 1.2 | shapes merge |
| A2 | Palette inside `ART_BIBLE.md` within ΔE 12 | 1.0 | off-bible hues |
| A3 | Lighting has direction: key, fill, contact shadow | 1.2 | flat or shadowless |
| A4 | **Variant sheets show real variation** | 1.6 | 8 seeds read as one object — `blocking` |
| A5 | Nothing pops, teleports or interpenetrates | 1.2 | any pop — `blocking` |
| A6 | Density: the frame reads as a lived-in place, not a grey plane with props | 1.4 | empty, sparse |
| A7 | HUD readable over the scene at 1280×720, 4.5:1 contrast | 1.0 | fails contrast |
| A8 | No z-fighting, seams, or untextured magenta | 0.8 | any — `blocking` |
| A9 | Matches the intent of the matching concept image | 0.6 | unrecognisable |

A4 and A6 carry the most weight on purpose. A beautiful single asset repeated 200 times
is still a dead world.

## perf-critic

| # | line | max | fails if |
|---|---|---|---|
| P1 | frame cost within budget, measured reproducibly on whatever renderer is present, **and** a dated real-hardware entry in `STATE.md` §Real-GPU verification log | 2.5 | the measurement is missing or does not reproduce — `blocking` |
| P2 | Draw calls ≤ 180 | 1.8 | over — `blocking` |
| P3 | Bred-dragon mesh build ≤ 120 ms | 1.8 | over — `blocking` |
| P4 | No frame-loop allocation; GC pauses < 2 ms | 1.5 | heap sawtooth |
| P5 | Bundle ≤ 1.4 MB gzip; boot to first frame ≤ 2.5 s | 1.2 | over |
| P6 | Potato tier holds 30 fps @720p | 1.2 | under |

Every perf number is cited from `artifacts/perf.json`. A perf-critic that cites nothing
scores nothing.

### P1, and why it is not simply "16.6 ms"

The budget is still 16.6 ms p95 at 1080p Medium. `docs/PERF_BUDGET.md` owns that number and
`tests/spine.test.ts` fails if it moves. P1 is worded around the *measurement* rather than
the number because of a flaw this project found the hard way.

P1 was first written as "p95 frame ≤ 16.6 ms, blocking". Every machine this project can
reach — the build container and the GitHub runner alike — has no GPU and rasterises through
SwiftShader, where a frame costs well over 16.6 ms no matter how cheap the scene is. A
blocking line nothing can satisfy caps the perf-critic at 5.9 forever, which means the
milestone can never close and the score stops carrying information. That is a defect in the
rubric, not in the renderer.

So P1 has two halves, and the critic scores them separately:

- **Continuously, on whatever renderer is present.** The frame cost must be measured, must
  reproduce across runs, and must sit inside the budget that `docs/PERF_BUDGET.md` records
  for that renderer class. Draw calls and triangles are hardware-independent and are always
  held to 180 and 900 000. This half is blocking: a missing or irreproducible number fails
  P1 outright, because an unmeasured budget is not a budget.
- **Periodically, on real hardware.** A dated entry in `STATE.md` §Real-GPU verification log
  for a commit no older than the current milestone. Entries come in two grades and must say
  which they are: a **verification** (the full `npm run gate:perf` procedure, reporting
  `frameCostMs.p95`) or a **sighting** (a human loaded the deployed build and read the
  overlay, which gives sustained FPS, draw calls and triangles but no percentile). A
  sighting satisfies this half up to M15. M16 requires verifications across Potato through
  Ultra and accepts no sightings.

Correcting an instrument is not raising a budget. Changing the number is.


## gameplay-critic

| # | line | max | fails if |
|---|---|---|---|
| G1 | The milestone's loop completes start to finish | 2.2 | cannot — `blocking` |
| G2 | **A bred dragon is visibly its parents' child** | 1.8 | child looks unrelated, or identical to a parent |
| G3 | Every action gives feedback within 100 ms | 1.4 | silent action |
| G4 | State survives reload | 1.4 | loses a bred dragon — `blocking` |
| G5 | No softlock, unreachable state, or negative currency | 1.6 | any — `blocking` |
| G6 | Mouse and touch both work | 1.6 | one broken |

## Report format — `FINDINGS.md`

```
## art-critic — M5 Flora wave 1 — run 2026-10-11
SCORE: 7.4 / 10
### Defects
- [blocking] A4 — artifacts/variants/tree_broadleaf.png: seeds 2,3,5,7 are the same
  trunk with a rotated canopy. Branch angle is not seeded.
- [major] A6 — shots/03-clearing.png: ground is bare between trees; no understory.
- [minor] A3 — no contact shadow under bushes.
### What is good
- Canopy silhouettes read well at distance.
```

No defect without a pointer. No score without the lines above.
