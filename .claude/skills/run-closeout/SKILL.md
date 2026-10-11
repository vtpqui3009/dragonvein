---
name: run-closeout
description: Close out a DRAGONVEIN run — rewrite NEXT.md, record the run in STATE.md, rotate old journal and critic entries into docs/archive/, rebuild and republish the owner's evidence page, then commit and push. Use at step 7 of the run loop in CLAUDE.md §3, including for a run cut short or one that shipped no code.
---

# Closing out a run

`CLAUDE.md` §3.7 and §5 are the rules. The order below matters: the handoff goes first,
because a run that dies on the usage limit mid-close-out must still leave `NEXT.md` right.

## 1. Rewrite `NEXT.md` (first, always)

One screen. Keep its fixed header and the §Standing hazards / §Tools / §Verify blocks; rewrite:

- **Last updated** stamp: the last commit of this run *that changed code*, with the line
  explaining that close-out docs commits follow it.
- **Current step**: the first step in `docs/ROADMAP.md` that is not `DONE` after this run,
  in bold with its status. `tools/evidence-page.mjs` reads the first bold paragraph here.
- **The single next action**: what the next run should do first, and the traps it will hit.
- **Open items that need the owner, not a run**: a bullet list. The evidence page shows this
  list verbatim as "Needs you", so write each item as something the owner can act on.

Commit and push this alone if the budget is tight.

## 2. Record the run in `STATE.md`

The newest entry goes at the top, under the archive note. It holds the acceptance criteria
(written before the code), baseline then result, the three scores, what was decided and why,
and the open blockers. A run cut short appends `BLOCKED: usage limit at <UTC time>` (§5).

## 3. Rotate the archive

Keep the per-run read small:

- `STATE.md` keeps the **two newest run entries**, every `— decision —` / `— decisions —`
  entry (code and tests cite them by heading), and `## Real-GPU verification log`. Move any
  older *run* entry whole to the top of `docs/archive/STATE-<yyyy-mm>.md`, below its index,
  and add it to that index.
- `FINDINGS.md` keeps the **two newest scoring rounds**. Move older rounds whole to
  `docs/archive/FINDINGS-<yyyy-mm>.md`.
- Moves are whole and unedited. Before committing, check that no line was lost: every line
  of the old file must appear in the new file plus the archive.
- Before moving an entry, grep for pointers to it (`grep -rn "STATE.md" tools tests docs src`)
  and repoint anything that cited the moved section.

## 4. Rebuild and republish the evidence page

```sh
node tools/evidence-page.mjs        # -> artifacts/evidence/run-evidence.html
```

It reads `NEXT.md`, the newest round in `FINDINGS.md`, `artifacts/perf.json`,
`artifacts/playtest.log` and `artifacts/shots/`. Run it **after** steps 1–3 and after the
gates that produced the scored artefacts, so the page matches the commit it describes.

Publish it to the **same URL** every run, so the owner keeps one link:

- URL: `https://claude.ai/artifact/Pgkt22EifnK5hUzmXqssoj`
- With the Artifact tool: `publish` with `file_path` set to the generated file and `url` set
  to the URL above. From a new session it must first `read` that URL once, because a publish
  to an artifact the session has not read is refused.
- If the session has no Artifact tool, skip the publish and say so in `NEXT.md`. The file is
  under `artifacts/`, which is git-ignored, so it is never committed.

## 5. Commit and push

`chore: close out <step> — art X, perf Y, gameplay Z`, conventional, never force (§6).
Then report in at most five lines: the step, the three scores, the next step, whether the
Step 0 push worked, and the evidence-page link.
