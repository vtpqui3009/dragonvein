import * as THREE from 'three';

/**
 * M0 spine: prove the whole chain works end to end — build, deploy, render, measure.
 * Everything here is placeholder and expected to be replaced by M3 onward. What must
 * survive is the contract: a canvas, a render loop, and `__dragonveinStats` for the gates.
 */

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2b3f5c, 24, 90);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
camera.position.set(9, 7, 11);
camera.lookAt(0, 1.2, 0);

// --- lighting: one sun, one cool fill, one warm rim (see docs/ART_BIBLE.md) ---
const sun = new THREE.DirectionalLight(0xfff0d0, 3.0);
sun.position.set(12, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
(['left', 'right', 'top', 'bottom'] as const).forEach((k, i) => {
  sun.shadow.camera[k] = i % 2 === 0 ? -18 : 18;
});
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x2a1f18, 0.85));
const rim = new THREE.DirectionalLight(0xff9a5a, 1.1);
rim.position.set(-10, 5, -9);
scene.add(rim);

// --- placeholder island ---
const island = new THREE.Group();
const topGeo = new THREE.CylinderGeometry(6, 5.6, 1.1, 32);
const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x3f8a33, roughness: 0.9 }));
top.receiveShadow = true;
island.add(top);
const baseGeo = new THREE.ConeGeometry(5.6, 9, 32);
const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.95 }));
base.position.y = -5;
base.rotation.x = Math.PI;
base.castShadow = true;
island.add(base);
scene.add(island);

// --- instanced placeholder flora: one draw call, the pattern every prop must follow ---
const treeGeo = new THREE.ConeGeometry(0.55, 1.8, 6);
const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f6b28, roughness: 0.85, flatShading: true });
const TREES = 48;
const trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES);
trees.castShadow = true;
const m = new THREE.Matrix4();
for (let i = 0; i < TREES; i++) {
  const a = (i / TREES) * Math.PI * 2 + (i % 3) * 0.4;
  const r = 1.8 + ((i * 7919) % 100) / 100 * 3.4;
  const s = 0.7 + ((i * 104729) % 100) / 100 * 0.7;
  m.makeScale(s, s, s);
  m.setPosition(Math.cos(a) * r, 0.55 + 0.9 * s, Math.sin(a) * r);
  trees.setMatrixAt(i, m);
}
scene.add(trees);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

let frameMs = 0;
let last = performance.now();
function frame(now: number) {
  frameMs = now - last;
  last = now;
  resize();
  island.rotation.y = now * 0.00012;
  trees.rotation.y = island.rotation.y;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The gates read this. Keep the shape stable even as the renderer is replaced.
declare global {
  var __dragonveinStats: (() => { drawCalls: number; triangles: number; frameMs: number }) | undefined;
}
globalThis.__dragonveinStats = () => ({
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  frameMs,
});

const boot = document.getElementById('boot');
if (boot) { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 600); }
