# STATE

Run journal. Newest at the top. Every scheduled run appends here, including runs that
ship nothing — a run with no entry is indistinguishable from a run that never happened.

---

## 2026-10-09 — run 0 — project setup (human-directed)

**Did**

- Settled the concept after two corrections from the owner: it is a **3D** game, assets
  are the main workstream, and the hook is **genetics that generate real meshes**.
- Proved the asset pipeline actually runs headlessly, with no GPU:
  - Blender 5.2.2 LTS via `pip install bpy` — scripted modelling, skin-modifier creature
    rigs, PBR materials, glTF export.
  - Cycles path-tracing on CPU: ~25–100 s for a 1700×980 review frame on 4 cores.
  - WebGL2 in headless Chromium via SwiftShader, for in-engine screenshots.
- Built and tested the diploid genome (`assetgen/genome.py`): 30 genes, hidden recessive
  alleles, mutation, element fusion, derived rarity.
- Built the genome → mesh builder (`assetgen/dragon/builder.py`) and rendered the proof:
  six elements from one generator, and a breeding triptych where the child's rarity
  (0.47) exceeds both parents' (0.39, 0.27).
- Wrote the harness: `CLAUDE.md`, 12 agent definitions, the rubric, the roadmap, and
  gates for layers, determinism, assets, parity, mesh-gen time, performance and smoke.

**Defect found and fixed during the proof**

- **Hue inherited linearly instead of circularly.** Hue is a wheel position, so averaging
  an ember parent (0.06, red) with a tide parent (0.57, blue) gave 0.315 — green — and the
  child resembled neither parent. Fixed by blending co-dominant hue along the short arc;
  the same pair now gives 0.815, a violet. Documented in `docs/GENOME.md` §Circular genes.
  Worth noting that the `gameplay-critic` G2 line in `docs/RUBRIC.md` was written to catch
  exactly this, and it did, before any runtime code existed.

**Defects carried forward** (found during the proof, not yet fixed)

- Tail ornaments read as detached specks on some genomes — the attachment point does not
  track `tailTaper`.
- Dorsal spikes read as a white mohawk rather than integrated plates; they need to inherit
  the scale material and sit lower.
- Colours wash out under AgX + the current fill light; the lighting rig needs rebalancing
  before it becomes the reference bar.
- `proof_breeding.png` framing still crops the top parent on some layouts.

**Scheduling — resolved, with a trade-off**

The first routine created fresh sessions per firing. It was test-fired and failed exactly
where it mattered: the fresh session could clone the public repo but got **403 on push**,
because the git proxy only injects credentials for repositories in that session's source
list, and `create_trigger` exposes no parameter to set sources. The environment editor in
the web UI has no repository field either — repositories are chosen per session at
creation, not per environment. The test run correctly refused to spend a full milestone it
could not push.

Resolved by binding the routine to the session that already holds the repository
(`trig_01PAKbMpsfTMuZRj2eECRQxZ`, `persist_session: true`). Runs fire into an ongoing
conversation at 09:07 and 21:07 Asia/Ho_Chi_Minh.

The trade-off is context growth: a persistent session accumulates history and compacts
repeatedly over weeks. The harness tolerates this by design — every run re-reads
`CLAUDE.md`, `ROADMAP.md` and this file rather than relying on conversational memory — but
if runs start degrading, the fix is to move back to fresh sessions with a fine-grained
GitHub token stored in the environment's variables and git configured to use it, which
removes the dependency on proxy-injected credentials.

**Next**: M0 — toolchain and deploy spine. `npm run gates` green, CI green, Pages serving
the placeholder island.

**Scores**: not applicable — no milestone claimed.
- run started 2026-10-09T10:53:32Z
