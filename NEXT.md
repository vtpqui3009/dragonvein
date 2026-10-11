# NEXT

**The handoff file. Read this first; it is one screen on purpose.**

Every run rewrites this before it stops, including a run that is cut off mid-flight.
`STATE.md` is the journal and explains *why*; this file says *what now*. If the two
disagree, `STATE.md` is the record of fact and this file is stale — fix it.

If the commit stamp below is older than `git log -1`, commits have landed that this file
has not seen. Read the newest `STATE.md` entry and the commits since that stamp before
trusting anything here.

Last updated: **2026-10-11** · at commit `c1b4cce`

---

## Current milestone

**M0 — Toolchain & deploy spine** · `IN_PROGRESS`

Gates pass (`npm run gates` exits 0). CI, Pages and Assets are all green. The deployed
page has been seen running by a human: 60 FPS, 21 draws, 32568 tris on the owner's machine.

**M0 is held open by one thing: the art-critic at 6.1.** The instrument problems that used
to block it are fixed — they were defects in `docs/RUBRIC.md`, not in the build.

## The single next action

Work the art defects in `FINDINGS.md`, in the art-critic's own order of leverage, then
re-criticise **on a frozen tree** (do not let builds land while critics score — that alone
cost ~1.5 points on an earlier cycle). Close M0 only at ≥ 8.0 from all three.

Partially addressed by run 3's art pass — verify against the current build before redoing:

1. Contact shadows. Measured absent: 3369 grass pixels under fourteen objects, zero
   darkening. This falsifies AC8's own claim.
2. The warm rim not reaching the canopy.
3. Prefab variety — nine islands from one prefab, ~60 trees from one archetype, varying by
   scale and rotation only.
4. Bare satellites, no ambient motion outside the hero island's spin.
5. Off-bible haze band over ~20% of the frame, ΔE 25.9–28.6.

Then, cheap and already scoped:

6. HUD at phone width — a 512 px non-wrapping row clips 168 px at 360 px wide, which hides
   the context-loss status line, so a dead canvas reads as an unexplained black screen.
7. One-frame hole in `__dragonveinStats()` between `webglcontextrestored` and the first
   restored frame.

## Open items that need the owner, not a run

- **Real-GPU verification is a `sighting`, not a `verification`.** Costs P1 0.4. Closing it
  is four steps in `docs/PERF_BUDGET.md` §Real-GPU verification on any machine with a GPU.

Nothing else is waiting on a human. The rubric rulings of 2026-10-10 are applied.

## Standing hazards — every run hits these

- The checkout often arrives in **detached HEAD** with local `main` stale. Start with
  `git checkout main && git fetch origin main && git reset --hard origin/main`, or the
  first push is rejected as "behind its remote counterpart" and looks like a credential
  failure when it is not.
- **No GPU anywhere in CI or the containers.** SwiftShader only. P1's absolute frame number
  is unreachable here by design; see `docs/RUBRIC.md` §P1.
- **`*.github.io` is blocked** by the egress policy (403 on CONNECT). No build session has
  been able to load the deployed page. Do not infer the deploy works from a green workflow.
- **Runs keep dying on the usage limit** — four in a row, $137 total, none closing a
  milestone. `CLAUDE.md` §4b is the response. Push after each coherent change.

## Verify all of the above in 60 seconds

```sh
git log --oneline -8
grep -E '^\| M[0-9]' docs/ROADMAP.md | head -3   # milestone status
sed -n '1,40p' STATE.md                          # newest journal entry
grep -E '^SCORE' FINDINGS.md | tail -6           # latest critic scores
npm ci && npm run gates                          # the ground truth
```
