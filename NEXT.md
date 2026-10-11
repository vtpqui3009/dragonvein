# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-11** · at commit `b92c867`, the last commit of run 5 that
changed code. The close-out commit that wrote this file follows it, so `git log -1`
being one or two docs commits ahead of that stamp is expected and not staleness.

---

## Current step

**M0f — the camera answers the pointer: drag to orbit, wheel/pinch to zoom, under both a
mouse and a `hasTouch` context** · `TODO`

M0e closed this run at `b92c867` (art **8.6**, perf **7.9**, gameplay **6.7**, no blocking
defects). All three conditions are asserted by `gate:smoke`: the HUD fits at 360 and 320 px,
the context-loss line is on screen at 360 px with the context held lost, and
`__dragonveinStats()` returns `null` from boot or restore until the first frame is drawn.

**Owner check:** M0e was marked `DONE` on its row's criteria with perf and gameplay below
8.0. `STATE.md` run 5 says why: gameplay is the G6 cap, which is M0f's to lift, and perf's
numbers are level with or better than M0d's 8.7. If you disagree, set M0e back to
`IN_PROGRESS` in `docs/ROADMAP.md`.

## The single next action

Take M0f. G6 is the only thing holding the gameplay-critic under 8, at 6.7 now.

- All the code is in `src/main.ts` (integrator), plus `tools/playtest.mjs`. One owner, no
  fan-out. `src/ui/` does not exist yet, so do not invent the layer for one camera.
- `tools/playtest.mjs` already sends mouse drag/wheel on the 1280 page and touch taps on a
  `hasTouch` context, but asserts only "no error, loop still running". M0f's criterion is
  that the camera **moved**: read the camera pose before and after, and add a pinch
  (two-finger, via CDP `Input.dispatchTouchEvent`). Taps alone cannot pinch.
- The island auto-rotates (`island.rotation.y = now * 0.00012`), so measure the camera,
  not the frame.
- The rim light is re-derived from the camera each frame (`updateRimDirection`), so
  orbiting already keeps it correct. Verify that with a shot after an orbit.
- Keep the orbit allocation-free. Heap is at 31.5 kB of a 40 kB/frame budget.

## Open items that need the owner, not a run

- **M0e's `DONE`**, above.
- **Real-GPU verification is a stale `sighting`** at `c429d4a` (21 draws). The scene is
  now 27 draws and 42 268 tris. That is the perf-critic's main P1/P6 deduction, and the
  four steps are in `docs/PERF_BUDGET.md` §Real-GPU verification, plus `?tier=potato`.
- `docs/ROADMAP.md` under the M0 table still says M0f "is the proposed fix and is waiting
  on the owner", while the table row is worded as approved (commit `7205394`). This run's
  edit to that sentence was refused by the session's permission layer, because it could
  not verify who approved. Please fix the sentence or confirm the approval.

## Standing hazards — every run hits these

- The checkout often arrives in **detached HEAD** with local `main` stale — 34 commits
  behind run 4, 20 the run before; run 5 found it already level. `git reset --hard
  origin/main` is **refused by the session's permission layer**, three times now. Use
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
