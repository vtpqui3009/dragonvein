/**
 * Dragon viewer — `dragon.html`. Renders runtime-built dragons so a human and the critics
 * can see what src/assets/dragon/ makes (CLAUDE.md §1.4: an asset nobody has seen rendered
 * is not done). `node tools/dragon-sheet.mjs` drives it headlessly.
 *
 *   dragon.html                  the 8-dragon sheet: one wild dragon per element and two
 *                                children of dragons on the sheet (see SHEET)
 *   dragon.html?view=turn&i=K    sheet dragon K alone, for a turntable; the page exposes
 *                                `__dragonView.setYaw(rad)` so a driver can step it
 *
 * The genome code is the one tests/genome.test.ts proves equal to assetgen/genome.py, and
 * the graph the one tests/dragon-graph.test.ts proves equal to the reference's.
 *
 * Lighting follows docs/ART_BIBLE.md §Lighting and matches the game's (src/main.ts): one
 * warm key with soft shadows, a cool fill at about 20 %, a warm rim, ACES. The backdrop is
 * the neutral studio grey the variant sheets use.
 */
import * as THREE from 'three';
import { breed, wild, type Element, type Genome } from './core/genome';
import { buildDragonBody } from './assets/dragon/builder';

/**
 * The sheet: six wild dragons, one per element, on seeds 1-6 taken in order (not picked),
 * then two children whose parents are both on the sheet. `wild(seed, element)` draws the
 * same body for one seed under every element (a forced element draws nothing), so a sheet
 * that reused one seed showed one body in six colours (run 11, critic D1). Each cell has its
 * own seed, and each child is labelled with its parents (critic D5).
 */
type Recipe = { label: string; op: 'wild'; seed: number; element: Element } | { label: string; op: 'breed'; a: number; b: number; seed: number };
const SHEET: Recipe[] = [
  { label: 'A', op: 'wild', seed: 1, element: 'ember' },
  { label: 'B', op: 'wild', seed: 2, element: 'tide' },
  { label: 'C', op: 'wild', seed: 3, element: 'stone' },
  { label: 'D', op: 'wild', seed: 4, element: 'gale' },
  { label: 'E', op: 'wild', seed: 5, element: 'jade' },
  { label: 'F', op: 'wild', seed: 6, element: 'umbra' },
  { label: 'G', op: 'breed', a: 0, b: 1, seed: 7 },
  { label: 'H', op: 'breed', a: 6, b: 2, seed: 8 },
];
const genomes: Genome[] = [];
for (const r of SHEET) genomes.push(r.op === 'wild' ? wild(r.seed, r.element) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));

const params = new URLSearchParams(location.search);
const turn = params.get('view') === 'turn';
const pick = Math.min(Math.max(Number(params.get('i') ?? 0) | 0, 0), SHEET.length - 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// The ground fades into the backdrop instead of ending at a hard horizon line. The
// backdrop is a fogged sphere, not `scene.background`: the background skips tone mapping
// and fog does not, so the two greys met in a visible seam.
scene.fog = new THREE.Fog(0x5d6063, 40, 95);
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(150, 24, 12),
  new THREE.MeshBasicMaterial({ color: 0x5d6063, side: THREE.BackSide }),
));

const sun = new THREE.DirectionalLight(0xfff1e2, 2.55);
sun.position.set(-14, 22, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0x7aa0ff, 0.70);
fill.position.set(16, 8, -10);
const rim = new THREE.DirectionalLight(0xff9044, 1.15);
rim.position.set(6, 10, -22);
scene.add(fill, rim, new THREE.HemisphereLight(0x8fb6ff, 0x53608f, 0.86));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x8a7f7c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });

interface Placed { mesh: THREE.Mesh; label: HTMLDivElement; anchor: THREE.Vector3 }
const placed: Placed[] = [];
const labels = document.getElementById('labels')!;
let tris = 0;
const t0 = performance.now();
const shown = turn ? [pick] : SHEET.map((_, i) => i);
const cols = 4;
shown.forEach((gi, k) => {
  const gm = genomes[gi]!;
  const body = buildDragonBody(gm);
  tris += body.geometry.getIndex()!.count / 3;
  const mesh = new THREE.Mesh(body.geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Centre each dragon on its own bounding box so long tails do not crowd a neighbour.
  const bb = body.geometry.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const holder = new THREE.Group();
  mesh.position.set(-cx, 0, -cz);
  holder.add(mesh);
  if (!turn) {
    const col = k % cols, row = Math.floor(k / cols);
    holder.position.set((col - (cols - 1) / 2) * 8.4, 0, (row - 0.5) * 8.2);
    holder.rotation.y = -0.55;
  }
  scene.add(holder);
  const label = document.createElement('div');
  const el = gm.element[0] === gm.element[1] ? gm.element[0] : `${gm.element[0]} / ${gm.element[1]}`;
  const r = SHEET[gi]!;
  const origin = r.op === 'wild' ? `wild, seed ${r.seed}` : `child of ${SHEET[r.a]!.label} × ${SHEET[r.b]!.label}`;
  label.innerHTML = `${r.label} · ${origin}<br><small>${el} · gen ${gm.generation} · ${gm.gid()}</small>`;
  labels.appendChild(label);
  placed.push({ mesh, label, anchor: holder.position.clone().add(new THREE.Vector3(0, 0, 2.9)) });
});
const buildMs = performance.now() - t0;

const camera = new THREE.PerspectiveCamera(turn ? 30 : 32, innerWidth / innerHeight, 0.1, 200);
const target = new THREE.Vector3(0, turn ? 1.3 : 0, turn ? 0 : 1.2);
const sheetPose = new THREE.Vector3(0, 19, 31);
const turnPose = new THREE.Vector3(-4.5, 4.2, 15.5);
camera.position.copy(turn ? turnPose : sheetPose);
// `?cam=px,py,pz,tx,ty,tz` overrides the pose, for close-ups of a joint.
const cam = (params.get('cam') ?? '').split(',').map(Number);
if (cam.length === 6 && cam.every(Number.isFinite)) {
  camera.position.set(cam[0]!, cam[1]!, cam[2]!);
  target.set(cam[3]!, cam[4]!, cam[5]!);
}
camera.lookAt(target);
sun.target.position.copy(target);
const ext = turn ? 7 : 22;
Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
sun.shadow.camera.updateProjectionMatrix();

document.getElementById('note')!.textContent =
  `runtime dragon bodies (M3a: skeleton, torso, limbs) · ${shown.length} built in ${buildMs.toFixed(0)} ms · ${tris} tris`;

function frame(): void {
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const p of placed) {
    v.copy(turn ? new THREE.Vector3(0, 0, 0) : p.anchor).project(camera);
    p.label.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    p.label.style.top = `${((1 - v.y) / 2) * innerHeight + (turn ? 150 : 0)}px`;
    p.label.style.display = turn ? 'none' : '';
  }
}

declare global {
  interface Window {
    __dragonView?: { ready: boolean; buildMs: number; tris: number; setYaw(rad: number): void };
  }
}
window.__dragonView = {
  ready: true,
  buildMs,
  tris,
  setYaw(rad: number) {
    for (const p of placed) p.mesh.parent!.rotation.y = rad;
    frame();
  },
};
// Drag to turn the dragons (mouse or touch), so a person can inspect them by hand.
let yaw = turn ? 0 : -0.55;
let dragX: number | null = null;
renderer.domElement.style.touchAction = 'none';
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragX = e.clientX;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  yaw += (e.clientX - dragX) * 0.01;
  dragX = e.clientX;
  window.__dragonView!.setYaw(yaw);
});
const endDrag = () => { dragX = null; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame();
});
frame();
