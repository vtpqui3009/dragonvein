# Build-session prompt

The prompt a dispatcher hands to a fresh build session. Copy it verbatim into
`create_session`'s `prompt`, with `source_url` set to
`https://github.com/vtpqui3009/dragonvein` and `run_in_background: true`.

Keeping it here rather than only inside a routine's configuration means the project can be
restarted from the repository alone, on any machine, by anyone with push access.

---

DRAGONVEIN build run. The repository is checked out for you at `/home/user/dragonvein`.

## Step 0 — prove you can push, before doing any work

The checkout often arrives in detached HEAD with local `main` stale, so do this first:

```sh
cd /home/user/dragonvein
git checkout main && git fetch origin main && git reset --hard origin/main
```

Then append `- run started <UTC timestamp>` to `STATE.md`, `git commit -am "chore: run marker"`,
and `git push origin main` **using Bash git, not the GitHub MCP tools** — those travel on a
different credential and would not test the path that matters.

If the push fails, STOP, `send_message` your parent the exact error, and do nothing else.
Do not route around it. If it succeeds, remove the marker again in your next commit.

## Then follow the contract

Read `/home/user/dragonvein/NEXT.md` first — one screen, says what to do now. Then
`CLAUDE.md`, which is the contract and is obeyed literally.

- `npm ci`. For asset work also: `pip install bpy`, the headless GL libraries listed in
  `assetgen/README.md`, then `export LIBGL_ALWAYS_SOFTWARE=1`.
- Take the **first step in reading order** in `docs/ROADMAP.md` that is not `DONE`. Steps
  are lettered inside a phase and one step is one run. Work only on that one. Do not skip
  ahead, and do not take a second because the first went quickly — a run that ends early
  with budget left means the steps are sized right.
- Write its acceptance criteria into `STATE.md` before writing code.
- Spawn builders per `docs/ARCHITECTURE.md` §Ownership: one agent per directory. Anything
  touching two directories goes to a single sequential owner, never a parallel fan-out.
- `npm run gates` must exit 0. Never weaken a test, a type, a lint rule or a budget to get
  green. If a gate measures the wrong thing, fix the gate in its own commit and say so.
- Spawn `art-critic`, `perf-critic` and `gameplay-critic` in fresh context, artefacts only.
  **Freeze the tree while they score.** Score against `docs/RUBRIC.md`.
- Ship at ≥ 8.0 from all three with gates green. Below that, write defects to `FINDINGS.md`,
  fix, re-gate, re-criticise, up to 3 cycles, then commit what is green and leave the
  milestone `IN_PROGRESS`. Never stretch a score to close a milestone.

## Assets are the main workstream

This is a 3D game and the owner has said assets matter most. Read `docs/ASSET_PLAN.md`. Do
not hide behind "procedural" and ship untextured primitives. Every generator ships with an
8-seed variant sheet; if the 8 seeds read as the same object the generator is not finished.
Fix the generator, do not pick luckier seeds.

## Budget

Read `CLAUDE.md` §4b. Push after each coherent change rather than batching to the end —
four consecutive runs have died on the usage limit mid-flight. If the remaining budget
cannot finish the current piece, push what is green, write the exact next step into
`NEXT.md`, and stop early. A clean handover beats a half-landed pass.

On a usage limit: stop, push what is green, append `BLOCKED: usage limit at <UTC time>` to
`STATE.md`, re-arm with `send_later` 15 minutes after the reported reset (60 if none given),
at most three consecutive. Never retry in a tight loop.

## Finish

**Rewrite `NEXT.md`** — this is not optional and comes before anything else at the end of a
run. Then update `STATE.md` with what shipped, the three scores, and open blockers. Commit,
push to `main`, no pull request. Then `send_message` your parent at most 5 lines: milestone,
three scores, next step, whether Step 0's push worked.
