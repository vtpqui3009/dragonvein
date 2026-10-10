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
| Routine name | `DRAGONVEIN — build run (daily)` |
| Schedule | `CRON_TZ=Asia/Ho_Chi_Minh 7 9 * * *` — 09:07 Vietnam time, once daily |
| Mode | fires into a persistent session (`persist_session: true`) |
| Dispatcher prompt | `ops/dispatcher-prompt.md` |
| Build prompt | `ops/build-prompt.md` |
| Repository | `https://github.com/vtpqui3009/dragonvein`, branch `main` |
| Deployed at | `https://vtpqui3009.github.io/dragonvein/` |

The schedule was twice daily until 2026-10-10. Two runs shared one five-hour usage window,
so both died partway and neither closed a milestone. One run with the whole window is
strictly better than two halves. See `docs/DECISIONS.md`.

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
