/**
 * M5f: every placed kind in one draw, and only the casters in the shadow pass.
 *
 * `FloraBatch` shortens three's multi-draw list to a prefix of the instances for the
 * shadow pass, through a field three does not publish (`_multiDrawCount`). These tests pin
 * that behaviour against the pinned three, so an upgrade that changes it fails here
 * rather than silently casting moss shadows — or none at all.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FloraBatch, batchable } from '../src/render/flora';

const internals = (b: FloraBatch): { _multiDrawCount: number; _multiDrawCounts: Int32Array } =>
  b as unknown as { _multiDrawCount: number; _multiDrawCounts: Int32Array };

function makeBatch(): { batch: FloraBatch; tall: number; flat: number } {
  const tall = batchable(new THREE.BoxGeometry(0.5, 2, 0.5));        // 12 triangles
  const flat = batchable(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));   // 2
  const vertices = tall.getAttribute('position').count + flat.getAttribute('position').count;
  const indices = (tall.getIndex()?.count ?? 0) + (flat.getIndex()?.count ?? 0);
  const batch = new FloraBatch(8, vertices, indices, new THREE.MeshStandardMaterial({ vertexColors: true }));
  return { batch, tall: batch.addGeometry(tall), flat: batch.addGeometry(flat) };
}

const m = new THREE.Matrix4();
const grey = new THREE.Color(0.9, 0.9, 0.9);
// The hooks are called with the arguments three passes; only geometry and material are read.
const args = (b: FloraBatch) => [
  undefined as unknown as THREE.WebGLRenderer, undefined as unknown as THREE.Scene,
  new THREE.PerspectiveCamera(), b.geometry, b.material as THREE.Material,
] as const;

describe('FloraBatch', () => {
  it('draws every instance in the colour pass and only the caster prefix in the shadow pass', () => {
    const { batch, tall, flat } = makeBatch();
    for (let i = 0; i < 3; i++) batch.place(tall, m.makeTranslation(i, 0, 0), grey, true);
    for (let i = 0; i < 4; i++) batch.place(flat, m.makeTranslation(i, 0, 2), grey, false);
    expect(batch.casterCount).toBe(3);
    expect(batch.instanceCount).toBe(7);

    const [r, s, c, g, mat] = args(batch);
    const group = undefined as unknown as THREE.Group;
    // A frame: the shadow pass first, then the colour pass — and again, because the second
    // frame is the one where three's own bookkeeping has nothing left to rebuild.
    for (let frame = 0; frame < 2; frame++) {
      batch.onBeforeShadow(r, s, c, c, g, mat, group);
      expect(internals(batch)._multiDrawCount).toBe(3);
      // The prefix is the casters: three box draws of 36 indices each.
      expect(Array.from(internals(batch)._multiDrawCounts.slice(0, 3))).toEqual([36, 36, 36]);
      batch.onBeforeRender(r, s, c, g, mat, group);
      expect(internals(batch)._multiDrawCount).toBe(7);
      expect(Array.from(internals(batch)._multiDrawCounts.slice(3, 7))).toEqual([6, 6, 6, 6]);
    }
  });

  it('refuses a caster added after a non-caster, which would silently not cast', () => {
    const { batch, tall, flat } = makeBatch();
    batch.place(tall, m.identity(), grey, true);
    batch.place(flat, m.identity(), grey, false);
    expect(() => batch.place(tall, m.identity(), grey, true)).toThrow(/after a non-caster/);
  });

  it('turns off the per-instance culling and sorting that walk and allocate every frame', () => {
    const { batch } = makeBatch();
    expect(batch.perObjectFrustumCulled).toBe(false);
    expect(batch.sortObjects).toBe(false);
  });
});

describe('batchable', () => {
  it('gives every geometry the same attribute set, so any two can share a batch', () => {
    const fromBox = batchable(new THREE.BoxGeometry());
    const fromIco = batchable(new THREE.IcosahedronGeometry(0.3, 0));   // non-indexed
    for (const g of [fromBox, fromIco]) {
      expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position']);
      expect(g.getAttribute('color').itemSize).toBe(4);
      expect(g.getAttribute('color').normalized).toBe(true);
      expect(g.getIndex()).not.toBeNull();
    }
    // No colour in, white out: the per-instance colour is then the whole colour.
    expect(fromIco.getAttribute('color').getX(0)).toBeCloseTo(1, 6);
    expect(fromIco.getIndex()?.count).toBe(fromIco.getAttribute('position').count);
  });

  it('keeps a source colour, whatever its storage type', () => {
    const g = new THREE.PlaneGeometry();
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, k) => [0.1, 0.5, 0.9][k % 3] as number), 3));
    const out = batchable(g).getAttribute('color');
    expect(out.getX(0)).toBeCloseTo(0.1, 4);
    expect(out.getY(0)).toBeCloseTo(0.5, 4);
    expect(out.getZ(0)).toBeCloseTo(0.9, 4);
    expect(out.getW(0)).toBeCloseTo(1, 6);
  });
});
