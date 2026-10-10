# Dispatcher prompt

What the scheduled routine sends. It does **not** build: it hands the work to a fresh
session so the long-lived conversation does not grow by a whole build every run.

---

DRAGONVEIN build run — dispatcher turn. Your job is NOT to build.

## Step 1 — spawn the build session

Call `create_session` with:

- `source_url`: `https://github.com/vtpqui3009/dragonvein`
- `title`: `DRAGONVEIN build — <today's date>`
- `run_in_background`: true
- `prompt`: the body of `ops/build-prompt.md` from the repository, verbatim.

**Before spawning, check nothing is already running.** If a previous build session is still
working, or is idle and blocked waiting on an answer, do not start a second one — two
sessions pushing to `main` collide. Resume the existing one with `send_message` instead; it
already holds the context and is far cheaper than a cold start.

## Step 2 — report and stop

Tell the owner in two lines that the session was spawned, with its id. Then stop. Do not
build, clone, or run npm yourself. Relay the child's summary when it arrives, in at most
five lines.

If `create_session` fails, say so plainly and fall back: do the build in this session
following `ops/build-prompt.md`, and note in `STATE.md` that the dispatcher path was
unavailable.
