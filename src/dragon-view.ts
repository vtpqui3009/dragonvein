/**
 * Dragon viewer — `dragon.html`. Renders runtime-built dragons so a human and the critics
 * can see what src/assets/dragon/ makes (CLAUDE.md §1.4: an asset nobody has seen rendered
 * is not done). `node tools/dragon-sheet.mjs` drives it headlessly.
 *
 *   dragon.html                  the 8-dragon sheet: one wild dragon per element, a fusion
 *                                child and a fourth-generation child
 *   dragon.html?view=turn&i=K    sheet dragon K alone, for a turntable; the page exposes
 *                                `__dragonView.setYaw(rad)` so a driver can step it
 *
 * The genomes are the fixed set in docs/fixtures/genomes.json, rebuilt from the same
 * recipes, so every dragon here is one the parity tests have checked.
 *
 * Lighting follows docs/ART_BIBLE.md §Lighting and matches the game's (src/main.ts): one
 * warm key with soft shadows, a cool fill at about 20 %, a warm rim, ACES. The backdrop is
 * the neutral studio grey the variant sheets use.
 */
import * as THREE from 'three';
import { breed, wild, type Element, type Genome } from './core/genome';
import { buildDragonBody } from './assets/dragon/builder';

type Recipe = { op: 'wild'; seed: number; element: Element | null } | { op: 'breed'; a: number; b: number; seed: number };
/** docs/fixtures/genomes.json's recipes, in order (later ones breed from earlier ones). */
const RECIPES: Recipe[] = [
  ...(['ember', 'tide', 'stone', 'gale', 'jade', 'umbra'] as const).flatMap((element): Recipe[] => [
    { op: 'wild', seed: 11, element }, { op: 'wild', seed: 29, element },
  ]),
  { op: 'wild', seed: 3, element: null }, { op: 'wild', seed: 7, element: null },
  { op: 'breed', a: 0, b: 2, seed: 777 }, { op: 'breed', a: 4, b: 8, seed: 101 },
  { op: 'breed', a: 6, b: 10, seed: 202 }, { op: 'breed', a: 0, b: 1, seed: 303 },
  { op: 'breed', a: 3, b: 7, seed: 404 }, { op: 'breed', a: 11, b: 9, seed: 505 },
  { op: 'breed', a: 14, b: 15, seed: 606 }, { op: 'breed', a: 16, b: 17, seed: 707 },
  { op: 'breed', a: 18, b: 19, seed: 808 }, { op: 'breed', a: 14, b: 19, seed: 909 },
  { op: 'breed', a: 15, b: 18, seed: 1001 }, { op: 'breed', a: 16, b: 5, seed: 1101 },
  { op: 'breed', a: 20, b: 21, seed: 1201 }, { op: 'breed', a: 22, b: 23, seed: 1301 },
  { op: 'breed', a: 24, b: 25, seed: 1401 }, { op: 'breed', a: 21, b: 22, seed: 1501 },
  { op: 'breed', a: 26, b: 29, seed: 1601 }, { op: 'breed', a: 1, b: 3, seed: 1 },
];
/** Which fixed genomes the sheet shows. */
const SHEET = [0, 2, 4, 6, 8, 10, 31, 30];

const genomes: Genome[] = [];
for (const r of RECIPES) {
  genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
}

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
scene.background = new THREE.Color(0x5d6063);
// The ground fades into the backdrop instead of ending at a hard horizon line.
scene.fog = new THREE.Fog(0x5d6063, 40, 95);

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
const shown = turn ? [SHEET[pick]!] : SHEET;
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
  label.innerHTML = `#${gi} ${gm.gid()}<br><small>${el} · gen ${gm.generation}</small>`;
  labels.appendChild(label);
  placed.push({ mesh, label, anchor: holder.position.clone().add(new THREE.Vector3(0, 0, 2.9)) });
});
const buildMs = performance.now() - t0;

const camera = new THREE.PerspectiveCamera(turn ? 30 : 27, innerWidth / innerHeight, 0.1, 200);
const target = new THREE.Vector3(0, turn ? 1.3 : 0, turn ? 0 : 1.2);
const sheetPose = new THREE.Vector3(0, 19, 31);
const turnPose = new THREE.Vector3(-4.5, 4.2, 15.5);
camera.position.copy(turn ? turnPose : sheetPose);
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
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame();
});
frame();
