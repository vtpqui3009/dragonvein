import * as THREE from 'three';

/**
 * Many plant and rock kinds in **one** draw call (M5f).
 *
 * Heap churn inside `three.WebGLRenderer.render` is about 1.8 kB per draw call, and the
 * frame budget is 40 960 B (docs/PERF_BUDGET.md §Heap churn), so placing the generated
 * set kind by kind — a dozen kinds, each with its own `InstancedMesh` and its own shadow
 * draw — would have spent the whole budget several times over. A `BatchedMesh` holds every
 * kind's geometry in one vertex and index buffer and draws all the instances with one
 * `multiDrawElements`, which three counts — and allocates for — as one call.
 *
 * What a batch cannot do on its own is draw a *subset* in the shadow pass: the depth pass
 * runs the same multi-draw list as the colour pass. Ground cover must not cast (a moss
 * carpet's shadow is a dark smear on the deck, and it costs rasteriser time for nothing),
 * so this subclass keeps the casters in a prefix of the instance order and shortens the
 * multi-draw list to that prefix for the shadow pass alone. Per-instance culling and
 * sorting are off — both walk every instance every frame and the sort allocates — so the
 * list three builds once, in instance order, is the list every frame draws, and the two
 * passes differ by one integer. Allocation-free.
 *
 * That integer is three's own `_multiDrawCount`, which is not public API. three is pinned
 * (package.json, 0.186.1), the constructor fails loudly if the field ever goes away, and
 * `tests/flora.test.ts` pins the behaviour, so an upgrade that changes it cannot pass
 * unnoticed.
 */
export class FloraBatch extends THREE.BatchedMesh {
  /** Instances `[0, casterCount)` are drawn by the shadow pass; the rest are not. */
  private casters = 0;
  /** Every instance added, in order. Nothing is ever deleted or hidden. */
  private drawn = 0;

  constructor(maxInstances: number, maxVertices: number, maxIndices: number, material: THREE.Material) {
    super(maxInstances, maxVertices, maxIndices, material);
    if (typeof this.internals()._multiDrawCount !== 'number') {
      throw new Error('FloraBatch: three.BatchedMesh no longer has _multiDrawCount; re-check the shadow prefix');
    }
    // Both walk every instance every frame, and the sort allocates. The batch is static
    // and the island is small enough that one object-level frustum test is the right grain.
    this.perObjectFrustumCulled = false;
    this.sortObjects = false;
  }

  private internals(): { _multiDrawCount: number } {
    return this as unknown as { _multiDrawCount: number };
  }

  /** How many instances the shadow pass draws. */
  get casterCount(): number { return this.casters; }

  /**
   * Adds one instance. Casters must all come before the first non-caster: the shadow pass
   * draws a prefix of the instance order, so a caster added late would silently not cast.
   */
  place(geometryId: number, matrix: THREE.Matrix4, color: THREE.Color, casts: boolean): number {
    if (casts && this.casters !== this.drawn) {
      throw new Error('FloraBatch: a shadow caster was added after a non-caster');
    }
    const id = this.addInstance(geometryId);
    this.setMatrixAt(id, matrix);
    this.setColorAt(id, color);
    this.drawn++;
    if (casts) this.casters++;
    return id;
  }

  override onBeforeRender(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
    geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group,
  ): void {
    super.onBeforeRender(renderer, scene, camera, geometry, material, group);
    this.internals()._multiDrawCount = this.drawn;
  }

  override onBeforeShadow(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
    shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material,
    group: THREE.Group,
  ): void {
    // three's implementation calls `this.onBeforeRender`, i.e. the override above, which
    // sets the full count; the prefix is applied after it.
    super.onBeforeShadow(renderer, scene, camera, shadowCamera, geometry, depthMaterial, group);
    this.internals()._multiDrawCount = this.casters;
  }
}

/**
 * Normalises one loaded mesh into the attribute set every geometry in a batch must share:
 * `position` and `normal` (float32 x3), `color` (uint16 normalised x4, the format the
 * committed GLBs store) and an index. Anything else the file carries is dropped. A mesh
 * with no vertex colour is painted white, so a per-instance colour is its whole colour.
 */
export function batchable(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  if (!position || !normal) throw new Error('batchable: geometry needs position and normal');
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(
    { length: position.count * 3 }, (_, k) => position.getComponent(Math.floor(k / 3), k % 3)), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(
    { length: normal.count * 3 }, (_, k) => normal.getComponent(Math.floor(k / 3), k % 3)), 3));
  const colour = source.getAttribute('color');
  const rgba = new Uint16Array(position.count * 4).fill(65535);
  if (colour) {
    for (let i = 0; i < position.count; i++) {
      for (let c = 0; c < Math.min(colour.itemSize, 4); c++) {
        // getComponent denormalises, so this is a 0-1 value whatever the source type.
        rgba[i * 4 + c] = Math.round(THREE.MathUtils.clamp(colour.getComponent(i, c), 0, 1) * 65535);
      }
    }
  }
  out.setAttribute('color', new THREE.BufferAttribute(rgba, 4, true));
  const index = source.getIndex();
  const indices = index
    ? Array.from({ length: index.count }, (_, k) => index.getX(k))
    : Array.from({ length: position.count }, (_, k) => k);
  out.setIndex(position.count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1)
    : new THREE.Uint16BufferAttribute(indices, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
