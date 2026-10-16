# Local continuous-run prompt

The prompt for running DRAGONVEIN from the owner's own machine, through as many steps as the
session can carry rather than one step per run. Kept here, in git, so it never goes stale
inside a `.cmd` file or a terminal history.

Use it with the Claude Code CLI in a clone of this repository. `docs/OPERATIONS.md`
§Running a build from your own machine has the setup, the Windows Task Scheduler wrapper and
the warning about `--bare`.

Authorised by `CLAUDE.md` §3.1 §Continuous mode. Read that first: it is what permits more
than one step, and it is also what forbids merging them.

---

Read `ops/build-prompt.md` at the root of this repository and follow it exactly. It is the
run contract, kept current in git, so follow it rather than anything you remember about this
project.

Begin with its Step 0 and prove you can push before any other work. If that push fails, stop
and say so with the exact error. Do not work around it.

Then read `NEXT.md` and `docs/ROADMAP.md` and take the first step in reading order that is
not `DONE`.

**Run in continuous mode, per `CLAUDE.md` §3.1.** When a step is finished, take the next one,
and keep going until a stop condition. One thing is not negotiable: **a step is completely
closed before the next is read.** For each step, in order — acceptance criteria into
`STATE.md` before any code; build it; `npm run gates` exits 0; `art-critic`, `perf-critic`
and `gameplay-critic` scored in fresh context against `docs/RUBRIC.md` with the tree frozen;
rework up to three cycles if a critic is under the bar; `NEXT.md` rewritten first, then
`STATE.md`; commit and **push**. Only then read the next step.

Never carry two steps in one plan, one critic round or one close-out. Never weaken a gate, a
test, a type or a budget to get green, and never stretch a score to close a step.

**Stop, and write why into `NEXT.md` before you stop, at the first of these:**

1. the **▲ playable checkpoint** in `docs/ROADMAP.md` — no run passes it, and the owner's
   answer to "is this fun?" is what reopens the roadmap;
2. a step that needs the owner — a `CLAUDE.md` §7 sighting, or a question only they can
   answer;
3. three rework cycles on one step without reaching the bar;
4. a usage or rate limit — §5 applies, and on this machine stop rather than re-arm;
5. a tool this machine does not have. Steps that add or change a generator need Python and
   `bpy`; if they are missing, say so and stop rather than skipping the renders;
6. a push that fails after a step you had already closed.

When you stop, say in a few lines which steps closed, the three scores for each, and what the
next run should do.
