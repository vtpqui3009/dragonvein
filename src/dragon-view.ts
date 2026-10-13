/**
 * Dragon viewer — `dragon.html`. Renders runtime-built dragons so a human and the critics
 * can see what src/assets/dragon/ makes (CLAUDE.md §1.4: an asset nobody has seen rendered
 * is not done). `node tools/dragon-sheet.mjs` drives it headlessly.
 *
 *   dragon.html                  the 8-dragon sheet: one wild dragon per element and two
 *                                children of dragons on the sheet (see SHEET)
 *   dragon.html?view=turn&i=K    sheet dragon K alone, for a turntable; the page exposes
 *                                `__dragonView.setYaw(rad)` so a driver can step it
 *   dragon.html?grey=1           the sheet with every colour removed: one neutral albedo on
 *                                every part, the same lights, and the canvas desaturated, so
 *                                only shape can tell the eight apart (M3e's greyscale test)
 *   dragon.html?mask=1           the sheet as flat white silhouettes on black, no ground, no
 *                                labels; `__dragonView.showOnly(k)` leaves one dragon in view,
 *                                so tools/dragon-sheet.mjs can measure each outline at the
 *                                sheet camera
 *   dragon.html?sweep=1          one dragon at a time as a flat white mask, built from any
 *                                phenotype a driver hands `__dragonView.sweepShow(p, crop)`:
 *                                the whole dragon at the sheet's direction and scale, or a
 *                                head crop centred on the skull. tools/dragon-sheet.mjs
 *                                drives it for the one-gene sweep (M3f criterion 1);
 *                                `&mask=0` draws the same views lit, for a person to look at
 *
 * Every mode exposes `__dragonView.sheet`: each cell's label, gid, phenotype and wing form,
 * which is what the silhouette numbers are compared against.
 *
 * The genome code is the one tests/genome.test.ts proves equal to assetgen/genome.py, and
 * the graph the one tests/dragon-graph.test.ts proves equal to the reference's.
 *
 * Lighting follows docs/ART_BIBLE.md §Lighting and matches the game's (src/main.ts): one
 * warm key with soft shadows, a cool fill at about 20 %, a warm rim, ACES. The backdrop is
 * the neutral studio grey the variant sheets use.
 */
import * as THREE from 'three';
import { GENES, GENE_NAMES, Genome, breed, wild, type Element, type Phenotype } from './core/genome';
import { DragonMesher } from './assets/dragon/mesher';
import { addWings, bodyGraph, skeleton, wingForm, type WingForm } from './assets/dragon/graph';
import { paths } from './assets/dragon/skin';
import type { DragonBody } from './assets/dragon/builder';

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
/** Sheet layout and camera. assetgen/dragon_sheet.py repeats these numbers for Blender. */
const SHEET_COLS = 4;
const SHEET_COL_GAP = 9.5;
const SHEET_ROW_GAP = 12;
const SHEET_YAW = -0.55;
const SHEET_ELEVATION_DEG = 32;
const SHEET_ORTHO_WIDTH = 44;
const SHEET_TARGET: [number, number, number] = [0, 1.2, 0];
/**
 * The sweep's scales. The whole-dragon sweep draws at the sheet's own scale: 1800 px across
 * SHEET_ORTHO_WIDTH (40.9 px per unit), so its areas compare with dragon-silhouette.json.
 * The head crop draws closer, centred SWEEP_HEAD_LIFT above the skull's middle node, and cut
 * off SWEEP_HEAD_BACK behind the skull's back node.
 */
const SWEEP_PX_PER_UNIT = 1800 / SHEET_ORTHO_WIDTH;
const SWEEP_HEAD_PX_PER_UNIT = 100;
const SWEEP_HEAD_LIFT = 0.8;
const SWEEP_HEAD_BACK = 1.4;

const genomes: Genome[] = [];
for (const r of SHEET) genomes.push(r.op === 'wild' ? wild(r.seed, r.element) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));

const params = new URLSearchParams(location.search);
const turn = params.get('view') === 'turn';
/** All colour removed: the greyscale sheet. */
const grey = params.get('grey') === '1';
/** One dragon at a time from a driver's phenotype, as a mask: the one-gene sweep. */
const sweep = !turn && params.get('sweep') === '1';
/** Flat silhouettes for the outline numbers. Always the sheet camera's direction. */
const mask = !turn && (sweep ? params.get('mask') !== '0' : params.get('mask') === '1');
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
if (mask) {
  scene.background = new THREE.Color(0x000000);
  document.body.style.background = '#000';
} else {
  scene.fog = new THREE.Fog(0x5d6063, turn ? 40 : 95, turn ? 95 : 140);
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0x5d6063, side: THREE.BackSide }),
  ));
}
// Greyscale: the lights keep their warm and cool tints, so the canvas is desaturated as well
// as the albedo flattened. What is left is light and shape.
// A filtered canvas is painted as its own layer, over the labels, unless they are lifted.
if (grey) {
  renderer.domElement.style.filter = 'grayscale(1)';
  for (const id of ['labels', 'note']) document.getElementById(id)!.style.zIndex = '1';
}

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
// The game's cool fill comes in two halves (src/main.ts): one above the horizon and a
// bounce from below. Without the bounce the far legs went near black (run 11, critic A3).
const bounce = new THREE.DirectionalLight(0x9db9f2, 2.5);
bounce.position.set(8, -8.5, -6.5);
// The hemisphere is the game's colours at 1.25 rather than its 0.86. In the studio there is
// no island or sky to bounce light, and at 0.86 the flanks under a folded wing and the far
// legs crushed to near black, below the bible's value floor (run 12, art A3/A2). It is
// 1.45 since M3e cycle 2: the spread near wing shades the flank and belly beneath it, and
// at 1.25 those crushed to black on cells A, C and E. Same colours: a fill change only.
scene.add(fill, rim, bounce, new THREE.HemisphereLight(0x8fb6ff, 0x53608f, 1.45));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x8a7f7c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
if (!mask) scene.add(ground);

// One material per geometry group (src/assets/dragon/builder.ts MATERIAL_OF), with the
// reference's roughness (builder.py `mats`): scale 0.38, membrane 0.50, horn 0.30. Under
// three.js's lights 0.50 still put a glassy streak on the flat membranes, so the membrane
// sits at 0.85 to read matte, as the reference's Cycles render does.
// The greyscale sheet keeps each material's roughness and shading but one neutral albedo
// (sRGB 0.70) for all of them, eyes included. The mask is unlit white.
const GREY_ALBEDO = 0xb3b3b3;
const lit = (roughness: number, flatShading = false) => grey
  ? new THREE.MeshStandardMaterial({ color: GREY_ALBEDO, roughness, metalness: 0, flatShading })
  : new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, flatShading });
const materials: THREE.Material[] = mask
  ? [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }))
  : [lit(0.42), lit(0.85), lit(0.32, true)];

interface Placed { mesh: THREE.Mesh; label: HTMLDivElement; anchor: THREE.Vector3; cell: number }
const placed: Placed[] = [];
const labels = document.getElementById('labels')!;
let tris = 0;
/** Each dragon's round trip through the mesh worker, in ms, in build order. */
const buildTimes: number[] = [];
// The dragons are built off the main thread, as the game builds them (M3c). The worker is
// spawned and warmed first, as the game does while idle; that one-off is `startupMs`.
const mesher = new DragonMesher();
let startupMs = NaN;
try {
  ({ startupMs } = await mesher.ready());
} catch (err) {
  // A worker that cannot load used to leave a blank grey page (gameplay critic, run 13).
  // Say so on the page, and let the first build rethrow the same error.
  document.getElementById('note')!.textContent = `the dragon worker failed: ${String((err as Error).message)}`;
}
const t0 = performance.now();
const shown = turn ? [pick] : sweep ? [] : SHEET.map((_, i) => i);
for (const [k, gi] of shown.entries()) {
  const gm = genomes[gi]!;
  const built = await mesher.build(gm);
  const body = built.body;
  buildTimes.push(built.roundTripMs);
  tris += body.geometry.getIndex()!.count / 3;
  const mesh = new THREE.Mesh(body.geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Centre each dragon on its graph's x extent (Blender x is three.js x), the same rule
  // assetgen/dragon_sheet.py uses, so the two sheets put every dragon in the same place.
  const xs = body.graph.v.map((v) => v[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const holder = new THREE.Group();
  mesh.position.set(-cx, 0, 0);
  holder.add(mesh);
  if (!turn) {
    const col = k % SHEET_COLS, row = Math.floor(k / SHEET_COLS);
    holder.position.set((col - (SHEET_COLS - 1) / 2) * SHEET_COL_GAP, 0, (row - 0.5) * SHEET_ROW_GAP);
    holder.rotation.y = SHEET_YAW;
  }
  scene.add(holder);
  const label = document.createElement('div');
  const el = gm.element[0] === gm.element[1] ? gm.element[0] : `${gm.element[0]} / ${gm.element[1]}`;
  const r = SHEET[gi]!;
  const origin = r.op === 'wild' ? `wild, seed ${r.seed}` : `child of ${SHEET[r.a]!.label} × ${SHEET[r.b]!.label}`;
  label.innerHTML = `${r.label} · ${origin}<br><small>${el} · gen ${gm.generation} · ${wingForm(gm.phenotype)} wings · ${gm.gid()}</small>`;
  labels.appendChild(label);
  if (mask) label.style.display = 'none';
  placed.push({ mesh, label, anchor: holder.position.clone().add(new THREE.Vector3(0, 0, 3.4)), cell: gi });
}
const buildMs = performance.now() - t0;
if (!sweep) mesher.dispose();

// The sheet is orthographic, so every cell is drawn at one scale: in perspective the near
// row looked about 30 % bigger, and children looked larger than their parents (critic,
// run 11). Its pose is assetgen/dragon_sheet.py's Blender camera, so the TS sheet and the
// reference sheet line up cell for cell. A window narrower than 2.37:1 widens the view so
// all eight cells stay in it.
const aspect = innerWidth / innerHeight;
const sheetHalfW = (SHEET_ORTHO_WIDTH / 2) * Math.max(1, 2.37 / aspect);
const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = turn
  ? new THREE.PerspectiveCamera(30, aspect, 0.1, 200)
  : new THREE.OrthographicCamera(-sheetHalfW, sheetHalfW, sheetHalfW / aspect, -sheetHalfW / aspect, 0.1, 200);
const target = turn ? new THREE.Vector3(0, 1.3, 0) : new THREE.Vector3(...SHEET_TARGET);
const el = (SHEET_ELEVATION_DEG * Math.PI) / 180;
const sheetPose = target.clone().add(new THREE.Vector3(0, Math.sin(el), Math.cos(el)).multiplyScalar(60));
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
/**
 * The head crop's geometry: the spine tube, the eyes and the crown, nothing else. In the
 * sheet's direction the far wing sits right behind the skull, so with the wings drawn a horn
 * or crest is lost against the membrane and the crop would measure the wing. Graph nodes come
 * in build order (skeleton, limbs, wings, crown), so a tube is the head's when its first node
 * is a skeleton node (the spine, split where a crown chain ties with the snout) or a crown node.
 */
function headOnly(body: DragonBody, p: Phenotype): THREE.BufferGeometry {
  const nSkeleton = skeleton(p).g.v.length;
  const withWings = bodyGraph(p);
  addWings(withWings.g, withWings.idx, p);
  const crownFrom = withWings.g.v.length;
  const tubes = paths(body.graph, body.idx.tailTip);
  if (body.kinds.filter((k) => k === 'spine' || k === 'limb').length !== tubes.length) throw new Error('headOnly: tubes and parts disagree');
  const src = body.geometry.getIndex()!.array;
  const keep: number[] = [];
  body.parts.forEach((part, i) => {
    const kind = body.kinds[i];
    const first = i < tubes.length ? tubes[i]!.nodes[0]! : -1;
    const mine = kind === 'eye' || kind === 'glint' || (i < tubes.length && (first < nSkeleton || first >= crownFrom));
    if (mine) for (let t = part.start; t < part.start + part.count; t++) keep.push(src[t]!);
  });
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) g.setAttribute(name, body.geometry.getAttribute(name));
  g.setIndex(keep);
  g.addGroup(0, keep.length, 0);
  return g;
}

/** The sweep's dragon, alone at the origin. */
const sweepHolder = new THREE.Group();
if (sweep) scene.add(sweepHolder);
Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
sun.shadow.camera.updateProjectionMatrix();

document.getElementById('note')!.textContent = mask ? '' :
  `runtime dragons, built in a worker · ${shown.length} in ${buildMs.toFixed(0)} ms after a ${startupMs.toFixed(0)} ms warm-up · ${tris} tris`;

function frame(): void {
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const p of placed) {
    v.copy(turn ? new THREE.Vector3(0, 0, 0) : p.anchor).project(camera);
    p.label.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    p.label.style.top = `${((1 - v.y) / 2) * innerHeight + (turn ? 150 : 0)}px`;
    p.label.style.display = turn || mask ? 'none' : '';
  }
}

declare global {
  interface Window {
    __dragonView?: {
      ready: boolean; buildMs: number; buildTimes: number[]; startupMs: number; tris: number; setYaw(rad: number): void;
      /** Every sheet cell, whichever are shown: label, gid, expressed genes. */
      sheet: { label: string; gid: string; phenotype: Phenotype; wingForm: WingForm }[];
      /** The gene table, name -> [lo, hi, kind], for telling which genes differ. */
      genes: typeof GENES;
      /** Leave only sheet cell k visible (all of them for null), and redraw. */
      showOnly(k: number | null): void;
      /**
       * `?sweep=1` only: build the dragon this phenotype describes, show it alone as a mask
       * at the sheet's yaw and elevation, and redraw. 'body' frames the whole dragon at the
       * sheet's scale (SWEEP_PX_PER_UNIT); 'head' centres a closer camera on the skull.
       */
      sweepShow(p: Phenotype, crop: 'body' | 'head'): Promise<{ gid: string; tris: number; roundTripMs: number }>;
    };
  }
}
window.__dragonView = {
  ready: true,
  buildMs,
  buildTimes,
  startupMs,
  tris,
  setYaw(rad: number) {
    for (const p of placed) p.mesh.parent!.rotation.y = rad;
    frame();
  },
  genes: GENES,
  sheet: SHEET.map((r, i) => ({ label: r.label, gid: genomes[i]!.gid(), phenotype: { ...genomes[i]!.phenotype }, wingForm: wingForm(genomes[i]!.phenotype) })),
  showOnly(k: number | null) {
    for (const p of placed) p.mesh.visible = k === null || p.cell === k;
    frame();
  },
  async sweepShow(p: Phenotype, crop: 'body' | 'head') {
    if (!sweep) throw new Error('sweepShow needs dragon.html?sweep=1');
    // A genome that expresses exactly `p`: both alleles dominant and equal, so each gene's
    // expressed value is (v + v) / 2 = v (docs/GENOME.md §Diploid).
    const gm = new Genome();
    for (const k of GENE_NAMES) gm.g[k] = [{ value: p[k], dominant: true }, { value: p[k], dominant: true }];
    gm.element = ['ember', 'ember'];
    gm.lineage = 'sweep';
    const built = await mesher.build(gm);
    sweepHolder.clear();
    const mesh = new THREE.Mesh(crop === 'head' ? headOnly(built.body, gm.phenotype) : built.body.geometry, materials);
    const xs = built.body.graph.v.map((v) => v[0]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    mesh.position.set(-cx, 0, 0);
    sweepHolder.add(mesh);
    sweepHolder.rotation.y = SHEET_YAW;
    const ortho = camera as THREE.OrthographicCamera;
    const ppu = crop === 'head' ? SWEEP_HEAD_PX_PER_UNIT : SWEEP_PX_PER_UNIT;
    const hw = innerWidth / (2 * ppu), hh = innerHeight / (2 * ppu);
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh, zoom: 1 });
    ortho.updateProjectionMatrix();
    // The head crop looks at the skull's middle node, lifted to take in horns and crest.
    // Graph coordinates are z-up (x, y, z); the scene's are y-up (x, z, -y).
    // Behind the skull the crop is cut by a plane across the body, SWEEP_HEAD_BACK behind
    // the skull's back node, so the torso does not fill the frame: the crop is the head and
    // the front of the neck, with whatever grows from the head.
    const look = new THREE.Vector3(...SHEET_TARGET);
    renderer.clippingPlanes = [];
    if (crop === 'head') {
      const [hx, hy, hz] = built.body.idx.headMidPos;
      sweepHolder.updateMatrixWorld(true);
      look.set(hx - cx, hz + SWEEP_HEAD_LIFT, -hy).applyMatrix4(sweepHolder.matrixWorld);
      const fwd = new THREE.Vector3(1, 0, 0).transformDirection(sweepHolder.matrixWorld);
      const cut = new THREE.Vector3(built.body.idx.headBackPos[0] - cx - SWEEP_HEAD_BACK, 0, 0).applyMatrix4(sweepHolder.matrixWorld);
      renderer.clippingPlanes = [new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, cut)];
    }
    camera.position.copy(look).add(new THREE.Vector3(0, Math.sin(el), Math.cos(el)).multiplyScalar(60));
    camera.lookAt(look);
    frame();
    return { gid: gm.gid(), tris: built.body.geometry.getIndex()!.count / 3, roundTripMs: built.roundTripMs };
  },
};
// Drag to turn the dragons (mouse or touch), so a person can inspect them by hand.
let yaw = turn ? 0 : -0.55;
let dragX: number | null = null;
// Two pointers down is a pinch: it zooms, and the yaw drag waits until one lifts.
const pointers = new Map<number, number>(); // pointerId -> clientX
let pinchSpan: number | null = null;
const span = () => { const xs = [...pointers.values()]; return Math.abs(xs[0]! - xs[1]!); };
renderer.domElement.style.touchAction = 'none';
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, e.clientX);
  renderer.domElement.setPointerCapture(e.pointerId);
  if (pointers.size === 2) { pinchSpan = span(); dragX = null; } else dragX = e.clientX;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, e.clientX);
  if (pointers.size === 2 && pinchSpan !== null) {
    const now = span();
    if (now > 1 && pinchSpan > 1) zoomBy(pinchSpan / now);
    pinchSpan = now;
    return;
  }
  if (dragX === null) return;
  yaw += (e.clientX - dragX) * 0.01;
  dragX = e.clientX;
  window.__dragonView!.setYaw(yaw);
});
const endDrag = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  pinchSpan = null;
  dragX = pointers.size === 1 ? [...pointers.values()][0]! : null;
};
// Wheel (and trackpad pinch, which browsers send as a ctrl+wheel) dollies the camera.
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(Math.min(Math.max(1 + e.deltaY * 0.001, 0.8), 1.25));
}, { passive: false });
/** k > 1 moves out, k < 1 moves in. */
function zoomBy(k: number): void {
  if (camera instanceof THREE.OrthographicCamera) {
    camera.zoom = Math.min(Math.max(camera.zoom / k, 0.5), 8);
    camera.updateProjectionMatrix();
  } else {
    const off = camera.position.clone().sub(target).multiplyScalar(k);
    const d = off.length();
    if (d > 2 && d < 90) camera.position.copy(target).add(off);
  }
  frame();
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  const a = innerWidth / innerHeight;
  if (camera instanceof THREE.PerspectiveCamera) camera.aspect = a;
  else {
    const hw = (SHEET_ORTHO_WIDTH / 2) * Math.max(1, 2.37 / a);
    Object.assign(camera, { left: -hw, right: hw, top: hw / a, bottom: -hw / a });
  }
  camera.updateProjectionMatrix();
  frame();
});
frame();
