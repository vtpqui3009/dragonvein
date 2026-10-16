# OPERATIONS — how this project runs itself

Everything needed to restart the automation from the repository alone, on any machine,
under any account with push access. Nothing load-bearing lives only inside a routine's
configuration or inside one long conversation.

## The moving parts

```
  a scheduled routine  ──fires──▶  a long-lived "dispatcher" session
  (cron, one prompt)                       │
                                           │ create_session(source_url=…)
                                           ▼
                                   a fresh build session
                                   reads NEXT.md → CLAUDE.md → works → pushes
                                           │
                                           └── send_message summary ──▶ dispatcher ──▶ owner
```

The dispatcher exists only so the conversation does not absorb a whole build every day. It
spawns, relays and stops. All real work happens in the fresh session, which starts from the
repository and ends by writing back to it.

## Current configuration

| | |
|---|---|
| Routine name | `DRAGONVEIN — build run (daily)` (`trig_01PAKbMpsfTMuZRj2eECRQxZ`) |
| Schedule | `CRON_TZ=Asia/Ho_Chi_Minh 7 9 * * *` — 09:07 Vietnam time, once daily |
| **Status** | **DISABLED since 2026-10-14, by the owner.** The routine still exists with its schedule and prompt intact; it simply does not fire. Re-enable with `update_trigger(trigger_id, enabled=true)` — nothing else needs recreating. |
| Mode | fires into a persistent session (`persist_session: true`) |
| Dispatcher prompt | `ops/dispatcher-prompt.md` |
| Build prompt | `ops/build-prompt.md` |
| Repository | `https://github.com/vtpqui3009/dragonvein`, branch `main` |
| Deployed at | `https://vtpqui3009.github.io/dragonvein/` |

The schedule was twice daily until 2026-10-10. Two runs shared one five-hour usage window,
so both died partway and neither closed a milestone. One run with the whole window is
strictly better than two halves. See `docs/DECISIONS.md`.

**Why it is disabled (2026-10-14).** The owner now drives builds from their second Pro
account, by hand. The routine fires into this account's dispatcher session, which cannot see
the other account's sessions at all — so its §Step 1 "check nothing is already running" check
is blind to the very thing most likely to be running, and it can only guess from how recently
`main` moved. On 2026-10-13 that guess was wrong in the other direction: both accounts worked
the repo within the same hour and the owner had to stand one session down. A routine whose
safety check cannot see the hazard is worse than no routine. Builds now start when the owner
starts them.

**This changes nothing about how a run works.** `ops/build-prompt.md` is still the contract,
`NEXT.md` is still the handoff, and any session on any account can pick the project up by
reading them — which is what §Picking the project up by hand below is for. Only the *starting*
is manual now.

## Recreating the automation from zero

Needed when the routine is lost, the conversation it fires into ends, or the project is
picked up on a different machine.

1. Have the repository reachable with push access from wherever the sessions will run. A
   session can only push to repositories declared in its own sources — attaching one
   afterwards is not enough, and the failure looks like a credential problem when it is
   really a scoping one.
2. Create a routine with the cron above whose prompt is the body of
   `ops/dispatcher-prompt.md`.
3. Point it at a session that can push, or let it create fresh sessions if those get the
   repository in their sources.
4. Fire it once by hand and watch Step 0. If the marker commit reaches `main`, the whole
   chain works. If it does not, stop and fix that before anything else — everything
   downstream is wasted otherwise.

Step 4 is the only real test. A routine that looks correctly configured but cannot push
will burn a full run before anyone notices.

## Picking the work up by hand

No automation required. Clone, then:

```sh
cat NEXT.md                 # what to do now — one screen, rewritten every run
sed -n '1,40p' STATE.md     # why, from the newest journal entry
grep -E '^\| M[0-9]' docs/ROADMAP.md   # milestone status
grep -E '^SCORE' FINDINGS.md | tail -6 # latest critic scores
npm ci && npm run gates     # ground truth, beats every document above
```

`NEXT.md` is the contract between runs. A run that does not leave it accurate has broken
the handoff even if its code was perfect, which is why `CLAUDE.md` §3.7 makes rewriting it
the first thing a run does when closing out.

## Running a build from your own machine

Use this to spend the **local** Claude Code login's quota instead of a cloud account's. A
cloud session always bills the account that started it, and there is no way to point one at
a different login — so to use a given account's allowance, the run has to happen where that
account is logged in. On your own machine that is the Claude Code CLI.

It also sidesteps the GitHub-App restriction that blocks cloud sessions in a Teams org: a
local run pushes with **your own git credentials**, not the Claude GitHub App.

### Once, to set the machine up

| Needed for | Install |
|---|---|
| Everything | `git`, Node **≥ 20** (`package.json` §engines), and the Claude Code CLI you already have |
| `gate:perf`, `gate:smoke` | a headless Chromium — `npx playwright install chromium` |
| Steps that add or change a **generator** (`assets:build`, `assets:render`) | Python 3.11 and `pip install bpy`. See the `asset-env` skill for the verified details |

A step that only *places* existing `.glb` files needs no Python and no Blender. Check what
the step touches before installing anything.

```sh
git clone https://github.com/vtpqui3009/dragonvein
cd dragonvein
npm ci
npm run gates          # ground truth before you change anything
```

### To run a step, interactively

```sh
cd dragonvein
claude
```

Then one line, which is the same thing the cloud dispatcher sends:

> Read `ops/build-prompt.md` at the root of this repository and follow it exactly. Then read
> `NEXT.md` and continue from whatever step it and `docs/ROADMAP.md` say is first in reading
> order and not `DONE`.

`ops/build-prompt.md` is kept current in git precisely so this line never goes stale.

### To run a step unattended, on a schedule

```bat
cd /d C:\path\to\dragonvein
git pull --ff-only origin main
claude -p "Read ops/build-prompt.md at the root of this repository and follow it exactly. Then read NEXT.md and continue from whatever step it and docs/ROADMAP.md say is first in reading order and not DONE." --permission-mode acceptEdits --permission-prompts none
```

Save as `run-build.cmd` and point Windows Task Scheduler at it.

- `--permission-prompts none` denies anything that would otherwise wait for a person, and
  tells Claude not to retry it, so the run cannot hang on a prompt at 3am. Requires CLI
  v2.1.259 or later.
- **Never pass `--bare` for this project.** Bare mode skips `CLAUDE.md`, `.claude/skills/`
  and `.claude/agents/` — which here means it skips the build contract, the three critics and
  the `asset-env`, `critic-round` and `run-closeout` procedures. The run would look like it
  worked and would have followed none of the rules.

### What it costs your machine

`npm run gates` ends with `gate:perf` and `gate:smoke`, which drive a headless Chromium on
the SwiftShader software rasteriser. That is CPU-bound and takes minutes, on every gate run,
and a run gates several times. `assets:render` is heavier still: Cycles on CPU is 25–100
seconds **per frame**, and a turntable is many frames.

So the honest split, for a weak machine:

- **Gameplay steps are fine locally.** M7 (animation), M8 (taming, roster), M9 (breeding, the
  gene inspector) are TypeScript. No Blender, no new assets — `tsc`, `eslint`, `vitest`, then
  the Chromium gates.
- **Steps that add generators are not.** Any M15-style asset wave means Blender renders for
  minutes per frame. Leave those to a cloud session.

### Do not run both at once

Two sessions pushing to `main` collide, and a local run is invisible to the cloud
`list_sessions` check exactly as a second account's is. Start one, let it finish, then start
the next. The marker commit that `ops/build-prompt.md` §Step 0 pushes is how you can tell
from `git log` that a run is live.

## Environment hazards, all of them met in practice

- **Detached HEAD on checkout.** Local `main` arrives stale; the first push is rejected as
  "behind its remote counterpart". Always `git checkout main && git fetch origin main &&
  git reset --hard origin/main` first.
- **No GPU anywhere.** CI runners and build containers both fall back to SwiftShader. The
  absolute frame-time budget cannot be measured here at all; `docs/RUBRIC.md` §P1 explains
  how P1 is satisfied instead.
- **`*.github.io` is blocked** by the egress policy, 403 on CONNECT. No build session has
  loaded the deployed page. Only a human outside these containers can confirm the deploy.
- **Draco and MeshOptimizer are missing** from the `pip install bpy` build, so glTF
  compression has to go through `gltf-transform` instead.
- **Blender needs GL libraries** that are not in the base image. `assetgen/README.md` lists
  them; `export LIBGL_ALWAYS_SOFTWARE=1` afterwards.

## Recovery

| symptom | what it is | what to do |
|---|---|---|
| Push rejected, "behind its remote counterpart" | stale local `main`, not credentials | reset to `origin/main` as above |
| Push 403 from the git proxy | the repository is not in this session's sources | recreate the session with `source_url`; attaching afterwards does not fix it |
| Container gone, no clone | normal, containers are reclaimed | clone again; nothing is kept outside the repository |
| Session died mid-run | usage limit, most likely | read `NEXT.md`; the previous run should have left it accurate. If it is stale, `git log` and the newest `STATE.md` entry are the fallback |
| Workflows red on a commit nobody touched | Pages was disabled, or a gate measuring the wrong thing | check the Actions log before changing code |

## What is deliberately not automated

Switching to a second account when the first is exhausted. Two subscriptions can both be
legitimate; using them in rotation to keep working past a limit is working around the limit
rather than inside it, so no part of this repository does it or explains how. The response
to running out is `CLAUDE.md` §4b: spend less per run, hand over cleanly, and split
milestones that do not fit one window.
