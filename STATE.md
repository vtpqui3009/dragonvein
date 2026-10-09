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

**Scheduling blocker**

- The 2×/day routine (`trig_012oAnWHVszEghmZMUhShCXo`) was created and test-fired. Its
  fresh sessions can clone the public repo but **cannot push**: the git proxy returns 403
  because `vtpqui3009/dragonvein` is not in the routine's source list, and `create_trigger`
  exposes no parameter to set sources. The test run correctly refused to do a milestone it
  could not push. Until the repo is attached to the routine, every scheduled run will stop
  at bootstrap.

**Next**: M0 — toolchain and deploy spine. `npm run gates` green, CI green, Pages serving
the placeholder island.

**Scores**: not applicable — no milestone claimed.
