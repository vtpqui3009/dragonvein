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

**Defects carried forward** (found during the proof, not yet fixed)

- Tail ornaments read as detached specks on some genomes — the attachment point does not
  track `tailTaper`.
- Dorsal spikes read as a white mohawk rather than integrated plates; they need to inherit
  the scale material and sit lower.
- Colours wash out under AgX + the current fill light; the lighting rig needs rebalancing
  before it becomes the reference bar.
- `proof_breeding.png` framing still crops the top parent on some layouts.

**Next**: M0 — toolchain and deploy spine. `npm run gates` green, CI green, Pages serving
the placeholder island.

**Scores**: not applicable — no milestone claimed.
