---
name: critic-round
description: Run one scoring round of the three DRAGONVEIN critics (perf, art, gameplay) on a frozen tree, record the scores in FINDINGS.md, and decide ship / rework. Use at step 5–6 of the run loop in CLAUDE.md §3, after npm run gates exits 0.
---

# A critic round

`CLAUDE.md` §3.5–3.6 and §4 are the rules. This is the procedure that has worked, so a run
does not have to rediscover it.

## 1. Freeze

- `npm run gates` has just exited 0 **at the commit being scored**, so `artifacts/perf.json`,
  `artifacts/playtest.log`, `artifacts/shots/` and `artifacts/turntables/` match HEAD.
  If HEAD moved after the gates ran, re-run them. A critic that finds `perf.json` older than
  HEAD will distrust it.
- Commit and push first (`CLAUDE.md` §4b.2), then touch nothing until the round is over.
  A build landing mid-scoring once cost about 1.5 points.

## 2. Spawn: perf alone, then art and gameplay together

- **perf-critic alone, in the foreground.** It reads timings, and nothing else may load the
  container while it does.
- Then **art-critic and gameplay-critic in parallel, in the background.**
- Critics are pinned to Sonnet in their frontmatter. Never raise them (`CLAUDE.md` §4b.1).

Prompt template. Fill in the angle brackets and keep everything else:

```
Score the current DRAGONVEIN build (commit <sha>, repo /home/user/dragonvein) for <perf|art|gameplay>,
per docs/RUBRIC.md<art: , against docs/ART_BIBLE.md and docs/concept/>. The step under review
is <step> in docs/ROADMAP.md: "<the step's done-when text>". Score from artefacts only, all
produced at this commit: <list the artefacts, naming any new shots and what each shows>.
<gameplay: You may drive the built dist/ headlessly (see how tools/playtest.mjs starts
tools/preview-server.mjs); scratch scripts outside the repo.> Do not edit tracked files and
do not run builds or gates — the tree is frozen. Return a score per RUBRIC line, the total,
and a defect list where each defect has a pointer (screenshot region, number, log line or
repro command) and a severity (blocking/major/minor). End with one line:
`SCORE_MACHINE <critic> <score> <sha>`.
```

Never put the builder's reasoning, the diff narrative or the expected score in the prompt
(`CLAUDE.md` §4). Naming the artefacts and what each one is counts as information. Saying
what the critic should conclude does not.

## 3. Record

Prepend one section to `FINDINGS.md` (newest at the top):

```
# <step> — run <n>, <date> — cycle <k>, at `<sha>`

**Scores: art-critic X · perf-critic Y · gameplay-critic Z.** <blocking or not>

## perf-critic — Y (<points> of <denominator>; <n/a lines>)
<per-line table or one line of line scores>
- [severity] <defect with its pointer>
SCORE_MACHINE: Y
... same for art and gameplay ...
```

When a critic's defect rests on a comparison you can check, such as a baseline it cites,
add a `*Builder note:*` with the artefact numbers that confirm or refute it. Never change
its score.

## 4. Decide

- All three ≥ 8.0, gates green, no blocking defect: the step ships.
- Any critic below 8.0: is the deduction in **this step's code**? If yes, fix it, re-gate and
  run another round, up to 3 cycles.
- If the deduction is a standing one this step cannot move, write that down with the
  numbers in the run's `STATE.md` entry and say so in `NEXT.md` for the owner. M0's
  standing ones are the missing real-GPU verification row and SwiftShader frame-cost drift.
  Re-scoring an unchanged tree to get a better number is score-fishing. Don't.
- Never stretch a score, and never edit the rubric to fit the build (`CLAUDE.md` §7).
