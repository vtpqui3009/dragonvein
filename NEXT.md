# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-11** · at commit `953f156`, the last commit of run 4 that
changed code. The close-out commit that wrote this file follows it, so `git log -1`
being one or two docs commits ahead of that stamp is expected and not staleness.

---

## Current step

**M0e — HUD readable at 360 px; the context-loss line visible; `__dragonveinStats()` has
no stale-frame hole** · `TODO`

M0d closed this run at art-critic **8.3**, against its stated bar of ≥ 8.0.
All five of its named conditions hold and each is measurable: contact shadows land (the
shadow pass darkens ~41% of the deck to 0.43× its unshadowed brightness), all three lights
reach the frame (the warm rim had never been in one — see below), prefab variety reads
(three tree archetypes, thirteen islands varying on five axes beyond scale and rotation),
no bare ground, and the off-bible wash is gone (ΔE 25.9–28.6 over a fifth of the frame →
ΔE 1.9–8.8, with `deep shadow` hit exactly below y 660).

**M0 the milestone is still `IN_PROGRESS`**, on two things that are not M0d's:

- M0e, above, which is the next step in reading order.
- The gameplay-critic sits at **6.9** and cannot rise without a step that does not exist.
  See the roadmap defect in `STATE.md`: `docs/ROADMAP.md` makes **G6 (mouse and touch)
  live from M0**, and no M0 step delivers any input. A proposed **M0f** is written up
  there. M0e will not move that score.

## The single next action

Take M0e. It is two measured defects, both already located, neither touched this run:

1. **The HUD clips at phone width.** A 512 px non-wrapping row loses 168 px at 360 px
   wide, and what it hides is the context-loss status line — so a dead canvas reads as an
   unexplained black screen rather than as a driver reset. The HUD markup is in
   `index.html` and the overlay code is at the end of `src/main.ts`.
2. **A one-frame hole in `__dragonveinStats()`** between `webglcontextrestored` and the
   first restored frame, where the readout can reprint the last good numbers over a
   context that has not drawn yet. `docs/ARCHITECTURE.md` §Render contract is explicit
   that a readout must say the context is dead rather than reprint.

`gate:smoke` already shoots at 1280×720 only; M0e needs a 360 px shot added to it, which
is the natural place for its acceptance criterion.

## Open items that need the owner, not a run

- **Real-GPU verification is still a `sighting`, not a `verification`**, and it is now
  stale as well: the only row is at `c429d4a`, and the scene has since gone 21 → 27 draw
  calls and 29 420 → 40 056 triangles. Costs P1 0.4 and is four steps in
  `docs/PERF_BUDGET.md` §Real-GPU verification on any machine with a GPU.
- **The Potato tier's 30 fps has never been verified on a real GPU either.** Same four
  steps, with `?tier=potato` on the URL. Costs P6 0.6. The enforced parts already pass.
- **`docs/ART_BIBLE.md` §Palette has a gap, and a run should not close it alone.** The
  table has no mid-value warm entry between `sky horizon` #ff9044 and `deep shadow`
  #1a1420, which are 34 ΔE apart. Every gradient between them is therefore off-palette in
  its middle, whatever it is tuned to — this is arithmetic, not a build defect. The sky
  now routes through `rock mid` #5a4a40 to keep most of the band on-palette, and what is
  left is two ~30-row transitions. `CLAUDE.md` §7 says the bible describes the target and
  a run must ask rather than edit it, so: **does the palette want a dusk/haze entry?** If
  yes, the sky gradient gets simpler and A2 goes to near-zero ΔE. If no, this is as good
  as it gets and the residual should be written into `docs/RUBRIC.md` A2 as expected.

## Standing hazards — every run hits these

- The checkout often arrives in **detached HEAD** with local `main` stale — 34 commits
  behind this run, 20 the run before. `git reset --hard origin/main` is **refused by the
  session's permission layer**, twice now. Use
  `git checkout main && git fetch origin main && git merge --ff-only origin/main` on a
  clean tree, which reaches the same state. Do not read the refusal as a credential
  problem.
- **A comment in this codebase has twice asserted the opposite of what the renderer did.**
  The key light's comment claimed its shadows raked across open ground when they fell
  behind their casters; the rim's claimed `<opaque_fragment>` summed
  `totalEmissiveRadiance` into `outgoingLight`, which three 0.186 does not do, so the rim
  had never been in a frame. Both survived review because the code *looked* right.
  Measure the pixels, not the prose. The cheapest test for "is this uniform doing
  anything": multiply it by 20 and re-render. If nothing moves, it is not wired up.
- **No GPU anywhere in CI or the containers.** SwiftShader only. P1's absolute frame
  number is unreachable here by design; see `docs/RUBRIC.md` §P1.
- **`*.github.io` is blocked** by the egress policy (403 on CONNECT). No build session has
  been able to load the deployed page. Do not infer the deploy works from a green workflow.
- **Freeze the tree while the critics score.** Letting a build land mid-scoring cost ~1.5
  points on an earlier cycle. Run the perf-critic **alone** on a quiet container — it
  measures timings — then art and gameplay in parallel.

## Tools worth knowing about before you start

- `node tools/art-probe.mjs [shot.png]` prints the numbers this run's acceptance criteria
  are written against: key-to-camera angle, what the shadow pass contributes, rim at the
  canopy edge, off-palette sky rows, and ambient motion. It gates nothing — it is a
  reader, so a build cannot pass by agreeing with it.
- `artifacts/shots/05-potato.png` is the same frame as `01-wide.png` with the shadow pass
  off (`?tier=potato` changes nothing else about the image at this device pixel ratio).
  Subtracting the two isolates the shadow pass exactly. Three single-frame tests for "are
  there contact shadows" were tried before this and all three lied, because on a dressed
  island most dark green pixels are bushes.
- `ffmpeg -i artifacts/turntables/m0-island.webm -vsync 0 artifacts/frames/f%04d.png`
  before running `art-probe`, or its ambient-motion line has nothing to read.

## Verify all of the above in 60 seconds

```sh
git log --oneline -8
grep -E '^\| M0' docs/ROADMAP.md                 # step status
sed -n '1,60p' STATE.md                          # newest journal entry
grep -E '^SCORE_MACHINE' FINDINGS.md | tail -6   # latest critic scores
npm ci && npm run gates                          # the ground truth
node tools/art-probe.mjs                         # the art numbers
```
