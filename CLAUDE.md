# CLAUDE.md — DRAGONVEIN build contract

This file is the contract. Every automated run reads it first and obeys it literally.
Rules are checkable imperatives. Where a rule and a convenience conflict, the rule wins.

## 0. What this is

**DRAGONVEIN (Long Mạch)** is a browser 3D creature-collector action-RPG set on a
shattered sky-world. The hook, and the reason this game is worth building:

> **Breeding generates real 3D creatures.** A dragon's genome *is* the parameter set its
> mesh is built from. Horn count, wing span, neck arc, body mass, spine profile, crest
> type, scale hue — each is an inherited gene that directly drives geometry. Two dragons
> bred together produce a mesh that has never existed before and belongs to one player.

Everything else — exploration, taming, riding, island building, combat — exists to give
the genome system somewhere to live. When a decision is unclear, pick the option that
makes the genetics more visible to the player.

Stack: TypeScript + Three.js + Vite (runtime), Python + Blender `bpy` (asset authoring).
Target: 60 fps at 1080p on an Intel iGPU. The owner's machine is weak; a beautiful build
that stutters there is a failed run.

## 1. Assets are a first-class workstream, not a side effect

This is a 3D game. Asset work is roughly half the project. It is **not** acceptable to
hide behind "procedural" and ship untextured primitives.

1. **Every asset has a script as its source of truth.** Authored assets are built by
   Python under `assetgen/`; runtime-generated creatures are built by TypeScript under
   `src/assets/`. A `.blend` file is never the source of truth.
2. **Generated binaries are committed deliberately.** `.glb`, `.ktx2` and `.ogg` may live
   under `public/assets/` only when `npm run assets:build` reproduces them byte-for-byte
   from the scripts, and only when the generating script is named in
   `public/assets/MANIFEST.json`.
3. **Third-party assets are allowed** when the licence permits commercial redistribution
   (CC0, CC-BY with attribution, or an explicit grant). Every one is recorded in
   `docs/ASSET_LICENSES.md` with source URL, licence, and the date checked. An asset with
   no entry there is deleted, not grandfathered.
4. **No asset ships unreviewed.** `npm run assets:render` produces a turntable for each
   changed asset under `artifacts/turntables/`. The `art-critic` scores those renders.
   An asset no human or critic has seen rendered is not done.
5. **Two generators, one truth.** The Python dragon builder (`assetgen/dragon/`) and the
   TypeScript one (`src/assets/dragon/`) must produce the same creature from the same
   genome. `npm run gate:parity` builds a fixed genome set in both and fails if bounding
   box, vertex count, or limb-anchor positions differ beyond tolerance. The genome spec in
   `docs/GENOME.md` is the arbiter; when the two disagree, the spec decides which is wrong.

## 2. Non-negotiable rules

1. **`src/sim/` is deterministic.** No `Math.random`, no `Date.now`, no
   `performance.now`, no DOM, no Three.js import under `src/sim/`. Randomness comes only
   from the seeded `Rng` in `src/core/rng.ts`, which must match `assetgen/genome.py`
   stream-for-stream. `npm run check:determinism` enforces this.
2. **The frame budget is law.** 16.6 ms p95 at 1080p Medium on the CI runner.
   `npm run gate:perf` fails the run if p95 > 16.6 ms or draw calls > 180. Never raise the
   budget to make a change pass; make the change cheaper.
3. **A bred dragon must mesh in under 120 ms** on the Medium tier, off the main thread
   where possible. `npm run gate:meshgen` enforces it. The hook dies if breeding stutters.
4. **One agent owns one directory.** See `docs/ARCHITECTURE.md` §Ownership. A builder
   never edits a directory it does not own. Cross-directory work goes to a single
   sequential owner, never to a parallel fan-out.
5. **Gates before commit.** `npm run gates` must exit 0: `tsc --noEmit`, `eslint`,
   `vitest run`, `check:determinism`, `check:layers`, `check:assets`, `gate:parity`,
   `gate:meshgen`, `gate:perf`, `gate:smoke`.
6. **No new runtime dependency** without an entry in `docs/DECISIONS.md` recording the
   bundle cost measured before and after. Budget: 1.4 MB gzipped total, assets excluded.
7. **Never weaken a test, gate, lint rule, or type to get green.** Fix the code. If a gate
   is genuinely wrong, change it in its own commit, with the reason in the message.
8. **Never commit secrets or `.env` contents.**
9. **`docs/concept/` is the reference bar.** Critics score builds against it. Do not
   delete or regenerate those images unless asked.

## 3. The run loop

Each scheduled run executes exactly this:

1. **Read state.** `docs/ROADMAP.md` and `STATE.md`. Take the single lowest-numbered
   milestone that is not `DONE`. Work only on that one. Do not skip ahead.
2. **Plan.** Write that milestone's acceptance criteria into `STATE.md` under a new run
   heading *before* writing code. Each criterion must be checkable by a command or a
   named screenshot.
3. **Build.** Spawn builders per `docs/ARCHITECTURE.md` §Ownership. Directories that
   share no type and no event may run in parallel; anything touching two directories is
   one sequential owner. (Measured on the reference project: parallel fan-out moved
   frame-ruining defects 60 → 47 → 66; a single sequential owner moved them 66 → 26.)
4. **Gate.** `npm run gates`. Fix every failure before continuing.
5. **Criticise.** Spawn `art-critic`, `perf-critic`, `gameplay-critic` in **fresh
   context**. A critic sees only artefacts — screenshots, turntables, `perf.json`,
   `playtest.log` — never the builder's reasoning. Each returns a score per
   `docs/RUBRIC.md` plus a defect list.
6. **Decide.**
   - All three ≥ 8.0 and gates green → commit, push, mark the milestone `DONE`.
   - Any critic < 8.0 → write defects to `FINDINGS.md`, fix, re-gate, re-criticise.
     Up to 3 rework cycles per run. Still failing → commit what is green, leave the
     milestone `IN_PROGRESS`, record the blocker.
7. **Close out.** Update `STATE.md`: what shipped, the three scores, what is next, open
   blockers. Commit and push. A run that ships no code still pushes an updated `STATE.md`
   explaining why.

## 4. Critics must stay honest

- A critic scores the **artefact**, never the plan or the diff narrative.
- No defect without a pointer: a screenshot region, a number, or a reproduction command.
- A critic never edits code.
- Any single `blocking` defect caps that critic's score at 5.9, whatever else scored well.

## 5. Usage limits

If a run hits a usage or rate limit:

1. Stop starting new work immediately.
2. Commit and push whatever is already green. Never leave the branch broken.
3. Append to `STATE.md`: `BLOCKED: usage limit at <UTC time>`, the milestone, the exact
   next step.
4. Re-arm with `send_later` for **15 minutes after the reported reset time**; if no reset
   time is given, 60 minutes. One re-arm per run, at most three consecutive; after that
   wait for the next scheduled run.
5. Never retry in a tight loop. Never start a fresh subagent fan-out just to test whether
   the limit lifted.

## 6. Commits

- Conventional commits: `feat(render):`, `fix(sim):`, `asset(dragon):`, `perf(ui):`, `chore:`.
- One milestone per commit where possible. Never mix a refactor with a feature.
- Push after every green milestone. Never force-push. No pull request unless asked.

## 7. Never

- Never rewrite `docs/GDD.md`, `docs/GENOME.md`, `docs/ART_BIBLE.md` or `docs/RUBRIC.md`
  to match what was built. They describe the target. If the target is wrong, say so in
  `STATE.md` and ask.
- Never add telemetry, ads, a backend, a login, or anything collecting personal data.
  The game is offline and saves to IndexedDB.
- Never mark a milestone `DONE` that no human has seen running.
