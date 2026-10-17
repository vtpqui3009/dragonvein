# DECISIONS

Decisions that are expensive to reverse, with the reasoning as it stood at the time.
Append; do not rewrite history.

## 2026-10-09 — Blender `bpy` as the authoring pipeline, not AI 3D generation

AI 3D generators (Meshy, Tripo, Hunyuan3D, TRELLIS) were evaluated first because the game
is asset-heavy. They were rejected as the *backbone*:

- Hosted services with clean commercial terms need a paid plan and an API key, so an
  unattended daily run cannot depend on them.
- The strongest self-hostable option (TRELLIS.2, MIT) wants roughly 24 GB of VRAM. The
  build container has no GPU at all.
- Terms shift and some carry territory clauses, which is a poor foundation for a project
  that will run unattended for months.

`pip install bpy` gives Blender 5.2.2 LTS as a Python module with no GUI. It models,
rigs, assigns PBR materials, exports glTF, and path-traces on CPU in tens of seconds.
The generator script is the source of truth, so it is reviewable, diffable, re-tunable by
a later run, and free.

AI generation stays available as an *accelerator* for hero assets if the owner supplies a
key. It is not a dependency.

## 2026-10-09 — Two dragon builders, kept in sync by a gate

A bred dragon has no mesh until the moment it is bred, so the runtime builder must be
TypeScript in a worker. But the review pipeline needs Blender-quality renders. Rather
than pick one, both exist and `gate:parity` fails the build when they disagree on a fixed
genome set. `docs/GENOME.md` is the arbiter.

The cost is real: every genome change touches two implementations. It is accepted because
the alternative — reviewing assets only through a software-rasterised browser screenshot —
would make the art bar unenforceable.

## 2026-10-09 — Runtime dependencies: `three` only

Physics, ECS and state libraries were all considered and all rejected for now. The bundle
budget is 1.4 MB gzipped and `three` alone is most of it. Anything added must record its
measured before/after cost here.

## 2026-10-09 — Source maps are built, but not deployed

`dist/` was shipping 2 842 273 bytes of source map for a 526 772-byte chunk to GitHub
Pages: 2.1× the entire 1.4 MB gzip budget for the whole product, in a file no player ever
fetches. Maps are not counted against that budget, so no gate caught it — `dist` was
3.4 MB of which 0.5 MB was the game.

Three options were on the table. `sourcemap: false` is the smallest change but loses the
ability to read a production stack trace at all. `sourcemap: true` is what was there.
What is now in place is both halves of the middle option:

- `vite.config.ts` builds `sourcemap: 'hidden'` — maps are written, but no
  `//# sourceMappingURL` comment is appended, so nothing on the site points at them.
- `npm run build:pages` (`npm run build` plus `tools/strip-sourcemaps.mjs`) *moves* the
  maps into gitignored `.sourcemaps/` before the Pages artefact is built from `dist/`, and
  `.github/workflows/pages.yml` uses that script. A developer still has the exact maps for
  the exact build, one directory away.

The emitted JavaScript is byte-identical under all three settings, so this changes the
deploy size and nothing else. `tests/spine.test.ts` asserts both halves, because either
one alone silently ships the maps again.

No runtime dependency was added, so there is no bundle cost to record under CLAUDE.md §2.6:
gzip of `dist` excluding maps is unchanged at 136.82 kB, 9.8 % of the 1.4 MB budget.

## 2026-10-10 — Critics on Sonnet, builders on Opus, one run a day

Three consecutive runs hit the usage limit mid-flight and none closed a milestone. Measured
cost: $20, $41 and $23, roughly 191k, 413k and 222k output tokens, all on Opus. The account
then moved from a five-hour limit to a seven-day one, which turns an overspend from an
afternoon's delay into several days'.

Two changes, neither of which lowers a standard:

- **The three critics are pinned to Sonnet** in their agent frontmatter. A critic reads
  artefacts and scores them against a rubric that is already written down; the answer has a
  fixed shape and the evidence is supplied. That is not the work Opus is for. Builders stay
  on Opus because design and implementation are open-ended. If critic quality visibly drops
  — defects without pointers, scores that do not track the artefacts — raise it here with
  the evidence rather than quietly reverting.
- **The routine drops from twice a day to once.** Two runs a day shared one five-hour
  window, so both died partway and neither closed anything. One run with the whole window
  is strictly better than two halves.

Rejected: running a second Claude account so work continues when the first is exhausted.
That is circumventing the usage limit rather than fitting inside it, whoever pays for the
second subscription.

Not evaluated here: Max or API billing. Both are legitimate and both would remove the
ceiling, but they are the owner's spending decision, not a technical one, and this project
should be cheap to run before it is given a larger budget.

### Follow-up, 2026-10-11 — the Sonnet pin holds, with one thing to watch

Seven critic reports across four scoring rounds, the first full run under the pin.

**No evidence for reverting.** Not one defect arrived without a pointer. Every major the
art-critic raised was real and reproducible from the coordinates it gave, including two the
run had introduced and not noticed: a keel cone standing outside the deck it hangs from,
and an island reading ΔE 27.7 off the palette because `scene.fog` is `sky horizon` and that
island sits below the horizon. The gameplay-critic took apart an instrument this run had
added specifically to answer its previous complaint, and was right to — "the assertion
could not have failed for any reason related to input". A critic that catches the thing you
built to satisfy it is doing the job the pin was meant to pay less for.

**One thing to watch, not to act on.** The gameplay-critic scored 8.2 → 7.1 → 6.9 across
three rounds on a gameplay surface that did not change. That looks like drift, but reading
the reports it is not: cycle 1 admitted it "did not view the other shots, the webm or the
extracted frames", and the later reports are better evidenced than the earlier ones. The
movement is the early scores being generous. No action.

If a fourth scoring of an unchanged surface lands outside 6.5–7.5, that is the evidence
this entry asked for and the pin should be reconsidered then.

## 2026-10-12 — `GLTFLoader` from `three/examples`, loaded on demand (run 19, M5a)

The game now loads its first `assetgen/` asset at runtime, the committed
`flora/broadleaf` GLBs. `GLTFLoader` ships inside the existing `three` package, so it is
not a new dependency in `package.json`. It is still new runtime code, so its cost is
recorded here, as §2.6 asks for any addition to the bundle.

- **Bundle**, from `artifacts/perf.json`: `bundle.gzipBytes` went from 165 036 before to
  about 193 790 after, which is +28.8 kB gzipped. That is 13.5 kB for the loader's own
  chunk, about 13 kB of `three` classes it pulls into the shared chunk, and a small `rng`
  chunk. The total is about 13.8 % of the 1.4 MB budget.
- **How it loads.** A dynamic `import()` after the first frame, so `bootMs` is unchanged
  (about 360 ms against 2 500).

Every later generated asset (rocks, landmarks, more flora) loads through the same loader at
no further bundle cost.

## 2026-10-13 · Look dev moves after the playable loop

**Decision.** `docs/ROADMAP.md` reading order becomes M3 → M5 → M7 → M8 → M9 → playable
checkpoint → M6 → M10… . M6 Look dev (day/night, cascaded shadows, bloom and ACES, the five
quality tiers) runs *after* taming, roster, breeding and the gene inspector, not before.
Milestone numbers are untouched; only the sections moved.

**Why.** At the time of the decision 23 of 66 steps were `DONE` and all 23 were engine or
asset work. The game had a world and eight dragons in it and nothing a player could do with
them. The asset steps are also the comfortable ones — a pattern is established, each one
closes in a run — while every remaining gameplay milestone is a new system. A project in
that position drifts toward polishing foundations indefinitely.

**What it costs.** The owner's first playthrough happens under a flat sun, with no bloom and
no tier detection. That is accepted: the checkpoint asks whether the loop is fun, and a loop
that is not fun will not be rescued by lighting.

**Also recorded, not scheduled:** `docs/ROADMAP.md` §After M16 holds the owner's intent to
build the game out to full depth once every milestone is `DONE` and the direction has proven
out, together with the distinction between depth (consistent with the GDD) and live-service
apparatus (which the GDD and `CLAUDE.md` §7 rule out, and which only the owner may unlock, in
their own commit).

## 2026-10-17 · The camera stays a diorama

**Decision.** The orbit camera keeps its current arc. `ORBIT_LIMITS` in `src/main.ts` —
distance 15–32, pitch 6–22°, azimuth −15 to 105° — is a **tuned constraint, not a defect**.
Point-and-click movement with an orbiting camera is the game's intended shape, matching the
Đảo Rồng reference the project started from. A future run that finds the limits restrictive
treats them as deliberate. **Only the owner reopens this.**

**Provenance.** The owner asked why they cannot zoom in far enough for a view like walking
around on the island, and whether that was coming later or staying. Shown three options —
keep it, add a ground-level follow camera, or merely widen the zoom clamp — they chose keep
it. The decision reached this run relayed through another Claude session on 2026-10-17, not
observed directly by the run that recorded it; it is written down here because an unrecorded
decision gets re-litigated. Run 35 verified the two code claims it rests on before recording
it: `ORBIT_LIMITS` holds those six values, and run 33's M8b criteria do say "the camera keeps
orbiting the island as it does today".

**Why it is not just a clamp value.**

1. Each limit was found by rendering it, and the reasons are in the comment above
   `ORBIT_LIMITS`: the deck overflows a 640×360 frame at distance 11, the sky gradient leaves
   the shot above ~25° of pitch, and past ~110° of azimuth the satellites and spires run out
   and the hero island hangs in empty sky. The comment already anticipates the question:
   "widening this arc is for whichever step dresses the far side."
2. A ground-level camera is not a clamp change. It would require dressing the far side of the
   hero island, re-tuning LOD for close range, and re-scoring every art line in
   `docs/RUBRIC.md` at a viewing distance none of them was tuned for.
3. It suits `docs/GDD.md` §Session shape — 4–6 minutes on a phone — better than a walking
   camera would.

**What it costs.** The player never sees the island from a creature's eye level, which is the
view that would show a bred dragon's geometry at its most legible. M8b's keeper avatar is
therefore read at diorama distance, and the gene inspector (M9) carries the burden of making
the genome visible up close instead.
