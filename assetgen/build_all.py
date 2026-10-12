#!/usr/bin/env python3
"""Export every registered generator to public/assets/<family>/<name>.lod{0,1,2}.glb.

    python3 -I assetgen/build_all.py              # build + write MANIFEST.json
    python3 -I assetgen/build_all.py --out DIR    # build into DIR instead (no repo write)
    python3 -I assetgen/build_all.py --verify     # build twice, in two separate
                                                  # processes, and compare SHA-256
    python3 -I assetgen/build_all.py --check      # rebuild into a temp dir and compare
                                                  # with the committed binaries + MANIFEST

`--verify` is how `CLAUDE.md` §1.2 ("reproduces them byte-for-byte") is proven rather
than asserted. It really does fork two child processes; a single process writing twice
would not catch per-process nondeterminism such as hash seeding or dict ordering.

No Draco, no textures, no image compression: `.claude/skills/asset-env/SKILL.md`
measured each of those as a way to lose byte-for-byte reproducibility.
"""
import argparse
import hashlib
import importlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# ---------------------------------------------------------------- the registry
# A data structure, not a call: a later run adds a row, nothing else.
# module    : import path under assetgen/
# lods      : which LODs to export, in order
GENERATORS = [
    {"module": "flora.broadleaf", "lods": (0, 1, 2)},
    {"module": "terrain.island", "lods": (0, 1, 2)},
    {"module": "terrain.stratified", "lods": (0, 1, 2)},
    {"module": "terrain.columnar", "lods": (0, 1, 2)},
    {"module": "terrain.boulders", "lods": (0, 1, 2)},
]

LODS_DEFAULT = (0, 1, 2)


class BuildError(RuntimeError):
    pass


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def _clean_scene(bpy):
    """A fresh, empty scene. Nothing leaks between assets or between LODs."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(coll):
            try:
                coll.remove(item)
            except RuntimeError:
                pass


def _export_glb(bpy, path):
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=False,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
        export_draco_mesh_compression_enable=False,
        export_image_format="NONE",
        export_unused_images=False,
    )
    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {k: v for k, v in kwargs.items() if k in supported}
    res = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in res:
        raise BuildError(f"glTF export did not finish for {path}: {res}")
    if not os.path.exists(path):
        raise BuildError(f"glTF export wrote no file at {path}")


def build_asset(bpy, spec, out_root):
    """Build and export one generator's whole LOD chain. Returns its manifest entry."""
    mod = importlib.import_module(spec["module"])
    family = mod.FAMILY
    name = mod.NAME
    asset_id = f"{family}/{name}"
    seed = int(getattr(mod, "SEED_FOR_COMMITTED", 1))
    budget = dict(mod.BUDGET)
    lods = tuple(spec.get("lods", LODS_DEFAULT))

    rel_script = os.path.relpath(mod.__file__, REPO).replace(os.sep, "/")
    out_dir = os.path.join(out_root, family)
    os.makedirs(out_dir, exist_ok=True)

    entry_lods = {}
    counts = []
    for lod in lods:
        key = f"lod{lod}"
        _clean_scene(bpy)
        obj = mod.build(seed, lod)
        tris = _tri_count(obj)
        rel = f"{family}/{name}.{key}.glb"
        path = os.path.join(out_root, rel)
        _export_glb(bpy, path)
        limit = budget.get(key)
        if limit is None:
            raise BuildError(f"{asset_id}: BUDGET has no entry for {key}")
        if tris > limit:
            raise BuildError(f"{asset_id} {key}: {tris} tris exceeds budget {limit}")
        counts.append((key, tris))
        entry_lods[key] = {"file": rel, "tris": tris, "sha256": _sha256(path)}
        print(f"  {rel:34} {tris:5d} tris  (budget {limit})  {entry_lods[key]['sha256'][:16]}",
              flush=True)

    for (ka, ta), (kb, tb) in zip(counts, counts[1:]):
        if not ta > tb:
            raise BuildError(
                f"{asset_id}: LOD chain is not strictly decreasing ({ka}={ta}, {kb}={tb})")

    return asset_id, {
        "script": rel_script,
        "family": family,
        "seedForCommitted": seed,
        "triBudget": {f"lod{l}": budget[f"lod{l}"] for l in lods},
        "palette": dict(mod.PALETTE),
        # How the variant probe judges those colours (rubric A2): surfaces to ΔE 12 of one
        # palette colour, ramps to ΔE 3 of their line through the stops.
        "paletteRoles": dict(getattr(mod, "PALETTE_ROLES", {
            "surfaces": ["bark"], "ramps": [["canopyDark", "canopyMid", "canopyLight"]]})),
        "lods": {k: entry_lods[k] for k in sorted(entry_lods)},
    }


def build_all(out_root, write_manifest):
    import bpy  # imported here so --verify's parent does not pay for it

    print(f"build_all -> {out_root}", flush=True)
    os.makedirs(out_root, exist_ok=True)
    assets = {}
    for spec in sorted(GENERATORS, key=lambda s: s["module"]):
        asset_id, entry = build_asset(bpy, spec, out_root)
        assets[asset_id] = entry

    manifest = {
        "generatedBy": "assetgen/build_all.py",
        "assets": {k: assets[k] for k in sorted(assets)},
    }
    if write_manifest:
        mpath = os.path.join(out_root, "MANIFEST.json")
        with open(mpath, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2, sort_keys=False)
            fh.write("\n")
        print(f"  wrote {os.path.relpath(mpath, REPO)}", flush=True)
    return manifest


def _glb_hashes(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            if fn.endswith(".glb"):
                p = os.path.join(dirpath, fn)
                out[os.path.relpath(p, root).replace(os.sep, "/")] = _sha256(p)
    return out


def verify():
    """Build the whole set twice, in two separate processes, and compare hashes."""
    dirs = []
    for i in (1, 2):
        d = tempfile.mkdtemp(prefix=f"dragonvein-assets-{i}-")
        dirs.append(d)
        cmd = [sys.executable, "-I", os.path.abspath(__file__), "--out", d, "--no-manifest"]
        print(f"pass {i}: {' '.join(cmd)}", flush=True)
        proc = subprocess.run(cmd, cwd=REPO)
        if proc.returncode != 0:
            print(f"VERIFY FAILED: pass {i} exited {proc.returncode}", file=sys.stderr)
            return 1

    a, b = _glb_hashes(dirs[0]), _glb_hashes(dirs[1])
    if not a:
        print("VERIFY FAILED: pass 1 produced no .glb files", file=sys.stderr)
        return 1
    if set(a) != set(b):
        print(f"VERIFY FAILED: file sets differ\n  pass1: {sorted(a)}\n  pass2: {sorted(b)}",
              file=sys.stderr)
        return 1

    bad = 0
    print("\nSHA-256 across two separate processes:")
    for rel in sorted(a):
        same = a[rel] == b[rel]
        print(f"  {'MATCH' if same else 'DRIFT'}  {rel:34} {a[rel]}")
        if not same:
            print(f"         pass2 {b[rel]}", file=sys.stderr)
            bad += 1
    if bad:
        print(f"\nVERIFY FAILED: {bad} file(s) are not byte-for-byte reproducible "
              f"(CLAUDE.md §1.2)", file=sys.stderr)
        return 1
    print(f"\nverify OK — {len(a)} file(s) reproduced byte-for-byte in two processes")
    return 0


def check(committed_root):
    """Rebuild into a temp dir and compare against what is committed (CLAUDE.md §1.2).

    `--verify` proves two processes on *this* machine agree. This proves the committed
    bytes are what this machine builds, which is the claim §1.2 makes about the repository.
    In CI it is the cross-machine half: the runner reproduces the hashes another container
    committed. Every committed binary is compared twice — with the fresh build, and with
    its MANIFEST pin — and a drift names both hashes, so a failure says what moved.
    """
    fresh = tempfile.mkdtemp(prefix="dragonvein-assets-check-")
    cmd = [sys.executable, "-I", os.path.abspath(__file__), "--out", fresh, "--no-manifest"]
    print(f"rebuild: {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=REPO)
    if proc.returncode != 0:
        print(f"CHECK FAILED: the rebuild exited {proc.returncode}", file=sys.stderr)
        return 1
    built = _glb_hashes(fresh)
    committed = _glb_hashes(committed_root)
    mpath = os.path.join(committed_root, "MANIFEST.json")
    pins = {}
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as fh:
            for entry in json.load(fh).get("assets", {}).values():
                for lod in entry.get("lods", {}).values():
                    pins[lod["file"]] = lod.get("sha256")
    bad = 0
    print(f"\nSHA-256, committed ({committed_root}) against a fresh build:")
    for rel in sorted(set(built) | set(committed)):
        b, c, m = built.get(rel), committed.get(rel), pins.get(rel)
        ok = b is not None and b == c == m
        print(f"  {'MATCH' if ok else 'DRIFT'}  {rel:34} {c or '(not committed)'}")
        if not ok:
            bad += 1
            print(f"         fresh build {b or '(not built)'}\n"
                  f"         MANIFEST    {m or '(not pinned)'}", file=sys.stderr)
    if not built:
        print("CHECK FAILED: the rebuild produced no .glb files", file=sys.stderr)
        return 1
    if bad:
        print(f"\nCHECK FAILED: {bad} committed file(s) are not what the generators build "
              "here. Rebuild with `npm run assets:build` and commit, or, if this is a "
              "different machine, record a CLAUDE.md §1.2 finding.", file=sys.stderr)
        return 1
    print(f"\ncheck OK — {len(built)} committed file(s) match a fresh build and MANIFEST.json")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=os.path.join(REPO, "public", "assets"),
                    help="output root (default public/assets)")
    ap.add_argument("--no-manifest", action="store_true",
                    help="skip MANIFEST.json (used by --verify's child processes)")
    ap.add_argument("--verify", action="store_true",
                    help="build twice in two processes and compare SHA-256")
    ap.add_argument("--check", action="store_true",
                    help="rebuild into a temp dir and compare with the committed binaries "
                         "and MANIFEST.json")
    ap.add_argument("--committed", default=os.path.join(REPO, "public", "assets"),
                    help="committed asset root for --check (default public/assets)")
    args = ap.parse_args(argv)

    if args.verify:
        return verify()
    if args.check:
        return check(os.path.abspath(args.committed))
    try:
        build_all(os.path.abspath(args.out), write_manifest=not args.no_manifest)
    except BuildError as exc:
        print(f"BUILD FAILED: {exc}", file=sys.stderr)
        return 1
    print("assets:build OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
