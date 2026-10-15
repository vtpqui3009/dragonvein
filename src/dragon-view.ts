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
 * The sheet and turntable views idle (M7a): each dragon breathes, blinks and shifts its
 * weight with its own genome's rhythm (src/assets/dragon/idle.ts `idleParams`), through a
 * vertex-only patch on its own material clones (src/render/idle.ts `withIdle`), so no draw
 * is added. `__dragonView.idleAt(t)` pins every dragon at idle time `t` seconds and stops
 * the clock, `idleAt(null)` holds the rest pose (the mesh as built: what every older sheet
 * and turntable shows), and `idlePlay()` lets it run again. The masks and the sweep never
 * idle: their outlines are measurements.
 *
 * The sheet and turntable dragons are `SkinnedMesh`es over a skeleton read off their own skin
 * graph (M7b: src/assets/dragon/rig.ts, src/render/walk.ts). At rest every bone is the
 * identity, so they draw exactly as the static mesh; `?static=1` builds plain meshes instead,
 * so a driver can prove it. They walk on demand:
 *   dragon.html?view=walk&i=K    sheet dragon K walking, a three-quarter side camera tracking
 *                                it over a checkered ground (so planted feet can be seen to
 *                                stay put); `&cam=` offsets the camera from the dragon.
 *                                Drag turns the dragon about where it stands and the camera
 *                                follows it wherever it walks; wheel or pinch scale the follow
 *                                distance (0.3–3×); the ground (snapped to whole checker
 *                                periods) and the backdrop travel with it, so it never walks
 *                                off the world
 *   dragon.html?walk=1           the sheet, every dragon walking (each jumps back to its cell
 *                                every WRAP_CYCLES cycles, feet and all)
 * `__dragonView.walkAt(t)` pins every dragon at walk time `t` seconds, `walkAt(null)` stands
 * them at rest, `walkPlay()` lets the walk clock run (from rest it eases in over
 * WALK_RAMP_S), `walkStop()` eases it out and leaves each dragon standing where it stopped;
 * `walkViewState()` reports the follow camera and tracking; `walkDrift(k)` walks dragon k through
 * fixed time steps and measures its planted feet in the world; `frameStats()` reports the
 * main-thread cost of the frames the clock drove.
 *
 * They fly too (M7c: src/assets/dragon/flight.ts, src/render/flight.ts), each wing a bone
 * chain read off the graph, beating with its own genome's rhythm:
 *   dragon.html?flap=1           the sheet, every dragon flapping
 *   dragon.html?view=flight&i=K  sheet dragon K flapping, the follow camera of `?view=walk`
 *                                framing everything its wings reach; drag turns it, wheel or
 *                                pinch zoom; keys F flap, G glide, L land
 * `flapAt(t)` and `glideAt(t)` pin every dragon at flight time `t` seconds, fully flapping or
 * gliding (null: at rest); `flightAt(t, flap, glide)` pins any blend of the two;
 * `flapPhaseAt(ph)` pins each dragon at phase ph of its own beat ('top' and 'bottom' of the
 * downstroke); `flapPlay()`, `glidePlay()` and `land()` run the flight clock, easing the weights
 * over FLIGHT_RAMP_S; `flightProbe(k or phenotype)` measures a flap's clearances
 * (src/render/flight-probe.ts).
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
import { idleParams, type IdleParams } from './assets/dragon/idle';
import { blinkMidTime, idleWaves, setIdleMix, setIdleTime, withIdle, type IdleWaves } from './render/idle';
import { walkParams, type WalkParams } from './assets/dragon/walk';
import { BONE, LEG_NAMES } from './assets/dragon/rig';
import { DragonWalk, bindSkinned } from './render/walk';
import { flightParams, type FlightParams } from './assets/dragon/flight';
import { DragonFlight, strokeTimes } from './render/flight';
import { flightSamples, probeFlight, type FlightProbe } from './render/flight-probe';

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
/** One dragon walking, a side camera tracking it (M7b). Otherwise as the turntable. */
const walkView = params.get('view') === 'walk';
/** One dragon flying, the same follow camera framing its whole reach (M7c). */
const flightView = params.get('view') === 'flight';
/** Either: a follow camera over a checkered ground. */
const followView = walkView || flightView;
const turn = params.get('view') === 'turn' || followView;
/** All colour removed: the greyscale sheet. */
const grey = params.get('grey') === '1';
/** One dragon at a time from a driver's phenotype, as a mask: the one-gene sweep. */
const sweep = !turn && params.get('sweep') === '1';
/** Flat silhouettes for the outline numbers. Always the sheet camera's direction. */
const mask = !turn && (sweep ? params.get('mask') !== '0' : params.get('mask') === '1');
/** The sheet and turntable idle; the masks and the sweep hold still. */
const animate = !mask && !sweep;
/** Plain meshes instead of skinned ones: the pre-M7b path, for the rest-pose comparison. */
const staticMesh = params.get('static') === '1';
/** Skinned, so they can walk. */
const rigged = animate && !staticMesh;
/** On the sheet, each walking dragon jumps back to its cell every this many cycles. */
const WRAP_CYCLES = 3;
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
/** The studio backdrop; the walk view keeps it centred on the walking dragon. */
const backdrop = new THREE.Mesh(
  new THREE.SphereGeometry(150, 24, 12),
  new THREE.MeshBasicMaterial({ color: 0x5d6063, side: THREE.BackSide }),
);
// The ground fades into the backdrop instead of ending at a hard horizon line. The
// backdrop is a fogged sphere, not `scene.background`: the background skips tone mapping
// and fog does not, so the two greys met in a visible seam.
if (mask) {
  scene.background = new THREE.Color(0x000000);
  document.body.style.background = '#000';
} else {
  scene.fog = new THREE.Fog(0x5d6063, turn ? 40 : 95, turn ? 95 : 140);
  scene.add(backdrop);
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

interface Placed {
  mesh: THREE.Mesh; label: HTMLDivElement; anchor: THREE.Vector3; cell: number;
  /** The rigged dragons' walk and flight (on the same skeleton), and the mesh's x at rest (centred on its graph). */
  walk: DragonWalk | null; flight: DragonFlight | null; baseX: number;
  /** What the worker built (the rig, graph and genes a probe needs). */
  body: DragonBody; genome: Genome;
  /** Distance walked while the clock runs: ∫ walk weight · speed dt (wrapped on the sheet). */
  dist: number;
}
const placed: Placed[] = [];
const labels = document.getElementById('labels')!;
let tris = 0;
/** Each shown dragon's idle, in build order. */
const idle: IdleParams[] = [];
/** Each shown dragon's walk params, in build order. */
const gaits: WalkParams[] = [];
/** Each shown dragon's flight params, in build order. */
const flights: FlightParams[] = [];
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
  // Each dragon idles with its own genome's rhythm, so it gets its own material clones
  // (one program between them all) and a depth material that moves its shadow with it.
  const ip = idleParams(gm);
  idle.push(ip);
  const mats = animate ? materials.map((m) => withIdle(m.clone(), ip)) : materials;
  const gait = walkParams(gm);
  gaits.push(gait);
  const fp = flightParams(gm);
  flights.push(fp);
  let walk: DragonWalk | null = null;
  let flight: DragonFlight | null = null;
  let mesh: THREE.Mesh;
  if (rigged) {
    // M7b: skinned over the graph's own skeleton, at rest the identity. M7c: the flight
    // rides the same skeleton; the culling sphere grows by as far as the wings reach.
    walk = new DragonWalk(body.rig, gait);
    flight = new DragonFlight(walk, body.rig, fp);
    const sk = new THREE.SkinnedMesh(body.geometry, mats);
    bindSkinned(sk, walk, Math.max(0.6, flight.maxMove + 0.3));
    mesh = sk;
  } else {
    mesh = new THREE.Mesh(body.geometry, mats);
  }
  if (animate) mesh.customDepthMaterial = withIdle(new THREE.MeshDepthMaterial(), ip);
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
  placed.push({ mesh, label, anchor: holder.position.clone().add(new THREE.Vector3(0, 0, 3.4)), cell: gi, walk, flight, baseX: -cx, dist: 0, body, genome: gm });
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
/**
 * The walk view's camera: on the dragon's right side, turned WALK_CAM_AZIMUTH_DEG toward its
 * front so the far legs show between the near ones, a little above it, far enough back to
 * frame the whole dragon with room ahead and behind, and tracking it as it walks. `?cam=`
 * sets the same six numbers relative to the dragon's travel, for close-ups of a joint.
 */
const WALK_CAM_ELEVATION_DEG = 14;
/** The flight view looks down a little more, onto the spread wings. */
const FLIGHT_CAM_ELEVATION_DEG = 20;
const WALK_CAM_AZIMUTH_DEG = 25;
/** The walk view's ground is a checker of this many world units a square, so a planted foot can be seen to stay put. */
const WALK_TILE = 0.5;
/**
 * The follow camera: `look` is the tracked point in the dragon's own frame (its holder's,
 * before travel), `offset` the camera's place from it in the world, scaled by `zoom`. Drag
 * turns the dragon about where it stands (setYaw) and the camera keeps the same world
 * offset, so it follows the dragon in any direction; zoom scales the offset (D1, D2).
 */
const walkCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), offset: new THREE.Vector3(), zoom: 1 };
/** Follow-camera zoom limits: the offset's scale. */
const WALK_ZOOM: readonly [number, number] = [0.3, 3];
/** The ground snaps to whole checker periods (two tiles), so its texture never swims (D3). */
const GROUND_SNAP = 2 * 0.5;
const focus = new THREE.Vector3();
const pivotA = new THREE.Vector3(), pivotB = new THREE.Vector3();
if (followView && placed[0]) {
  const geo = placed[0].mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const len = box.max.x - box.min.x, tall = box.max.y;
  // 30° vertical field of view: frame about 1.25 × the length across and 1.4 × the height up.
  const half = Math.tan((15 * Math.PI) / 180);
  const az = (WALK_CAM_AZIMUTH_DEG * Math.PI) / 180;
  let dist: number, elev: number;
  if (flightView && placed[0].flight) {
    // The flight view frames everything the dragon reaches in a beat and a glide (wings up and
    // down, hovering): the rest mesh's box and the wing nodes and feet sampled over both,
    // centred on screen and all inside the view.
    const fl = placed[0].flight;
    const ox = placed[0].mesh.position.x;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3((i & 1 ? box.max.x : box.min.x) + ox, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    for (let i = 0; i < fl.reachPoints.length; i += 3) pts.push(new THREE.Vector3(fl.reachPoints[i]! + ox, fl.reachPoints[i + 1]!, fl.reachPoints[i + 2]!));
    elev = (FLIGHT_CAM_ELEVATION_DEG * Math.PI) / 180;
    const d = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    const r = new THREE.Vector3(0, 1, 0).cross(d).normalize(), u = d.clone().cross(r);
    // Centre: the middle of the points' extent across and up the view, and in depth.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const q of pts) [q.dot(r), q.dot(u), q.dot(d)].forEach((v, k) => { lo[k] = Math.min(lo[k]!, v); hi[k] = Math.max(hi[k]!, v); });
    const centre = r.clone().multiplyScalar((lo[0]! + hi[0]!) / 2).addScaledVector(u, (lo[1]! + hi[1]!) / 2).addScaledVector(d, (lo[2]! + hi[2]!) / 2);
    const tanV = half * 0.9, tanH = half * aspect * 0.9;
    dist = 7;
    for (const q of pts) {
      const c = q.clone().sub(centre);
      dist = Math.max(dist, c.dot(d) + Math.abs(c.dot(r)) / tanH, c.dot(d) + Math.abs(c.dot(u)) / tanV);
    }
    // The tracked point is that centre at zero altitude; the altitude is added as it flies.
    walkCam.look.set(centre.x, centre.y - fl.hover, centre.z);
  } else {
    dist = Math.max((0.62 * len) / (half * aspect), (0.7 * tall) / half, 7);
    elev = (WALK_CAM_ELEVATION_DEG * Math.PI) / 180;
    // Looking a little ahead of the middle: turned toward the front, the near head draws larger than the far tail.
    walkCam.look.set(0.04 * len, Math.min(1.4, 0.36 * tall), 0);
  }
  walkCam.pos.set(walkCam.look.x + dist * Math.cos(elev) * Math.sin(az), walkCam.look.y + dist * Math.sin(elev),
    walkCam.look.z + dist * Math.cos(elev) * Math.cos(az));
  if (cam.length === 6 && cam.every(Number.isFinite)) {
    walkCam.pos.set(cam[0]!, cam[1]!, cam[2]!);
    walkCam.look.set(cam[3]!, cam[4]!, cam[5]!);
  }
  walkCam.offset.subVectors(walkCam.pos, walkCam.look);
  camera.position.copy(walkCam.pos);
  target.copy(walkCam.look);
  // The ground becomes a checker (a texture, not another draw), so travel and planted feet read.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g2 = c.getContext('2d')!;
  g2.fillStyle = '#8a7f7c'; g2.fillRect(0, 0, 64, 64);
  g2.fillStyle = '#9d9390'; g2.fillRect(0, 0, 32, 32); g2.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 8;
  tex.repeat.set(400 / (2 * WALK_TILE), 400 / (2 * WALK_TILE));
  const gm = ground.material;
  gm.color.set(0xffffff);
  gm.map = tex;
  gm.needsUpdate = true;
}
camera.lookAt(target);
sun.target.position.copy(target);
/** Where the sun sits from what it lights: the walk view moves both with the dragon. */
const sunOffset = sun.position.clone().sub(target);
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
  `runtime dragons, built in a worker · ${shown.length} in ${buildMs.toFixed(0)} ms after a ${startupMs.toFixed(0)} ms warm-up · ${tris} tris` +
  (flightView ? ' · drag to turn · wheel to zoom · F flap · G glide · L land' : '');

const labelAt = new THREE.Vector3();
/** The walk view's tracked point in the world: `walkCam.look` carried by the dragon's travel and its holder's turn. */
function trackedPoint(p: Placed, out: THREE.Vector3): THREE.Vector3 {
  const holder = p.mesh.parent!;
  holder.updateMatrixWorld();
  // In the air the point rises with the dragon's altitude (not its heave or soar, which the camera leaves on screen).
  const alt = p.flight ? p.flight.altitude : 0;
  return out.copy(walkCam.look).setX(walkCam.look.x + p.mesh.position.x - p.baseX).setY(walkCam.look.y + alt).applyMatrix4(holder.matrixWorld);
}
function frame(): void {
  if (followView && placed[0]) {
    // Track the dragon where it actually is in the world, whatever way it has been turned:
    // the camera, its target, the sun and its shadow box, the ground and the backdrop.
    trackedPoint(placed[0], focus);
    target.copy(focus);
    camera.position.copy(walkCam.offset).multiplyScalar(walkCam.zoom).add(focus);
    camera.lookAt(target);
    sun.target.position.copy(target);
    sun.position.copy(target).add(sunOffset);
    ground.position.set(Math.round(focus.x / GROUND_SNAP) * GROUND_SNAP, 0, Math.round(focus.z / GROUND_SNAP) * GROUND_SNAP);
    backdrop.position.set(focus.x, 0, focus.z);
  }
  renderer.render(scene, camera);
  const v = labelAt;
  for (const p of placed) {
    if (turn) v.set(0, 0, 0); else v.copy(p.anchor);
    v.project(camera);
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
      /** Each shown dragon's idle params, in the order shown (sheet order, or the one turntable dragon). */
      idle: IdleParams[];
      /** Pin every dragon at idle time `t` seconds and stop the clock; null holds the rest pose. Redraws. */
      idleAt(t: number | null): void;
      /** Let the idle clock run again (the page's default). */
      idlePlay(): void;
      /** The middle of shown dragon k's first blink at or after `from` seconds of idle time. */
      blinkMid(k: number, from?: number): number;
      /** Shown dragon k's idle waves at time t (the shader's mirror): breath, shut, shift. */
      idleWaves(k: number, t: number): IdleWaves;
      /** Each shown dragon's walk params (src/assets/dragon/walk.ts), in the order shown. */
      gaits: WalkParams[];
      /** Pin every dragon at walk time `t` seconds; null stands them at rest (every bone the identity). Redraws. */
      walkAt(t: number | null): void;
      /**
       * Let the walk clock run: from rest it eases in over WALK_RAMP_S (walk time and distance
       * from 0); from a pinned time it carries on from there at full weight.
       */
      walkPlay(): void;
      /** Ease the walk out over WALK_RAMP_S; each dragon stands where it stopped. */
      walkStop(): void;
      /** `?view=walk`: where the tracked dragon is, where the camera is, and where the dragon lands on screen (NDC). */
      walkViewState(): { dragon: number[]; camera: number[]; distance: number; zoom: number; ndc: number[]; ground: number[]; backdrop: number[]; weight: number };
      /**
       * Walk shown dragon k alone through `cycles` gait cycles in `steps` fixed steps (no
       * wrap), and measure each foot (LEG_NAMES order) in the world: the ball node's and the
       * skinned contact patch's (the foot's and toes' vertices within CONTACT_Y of the ground)
       * largest move while planted, and the knee angle's range. Leaves the dragon at rest.
       */
      walkDrift(k: number, cycles?: number, steps?: number): WalkDrift;
      /** Main-thread ms of the frames the clocks drove (pose + render): p50, p95, max, count; `reset` starts a new window. */
      frameStats(reset?: boolean): { p50: number; p95: number; max: number; n: number };
      /** Each shown dragon's flight params (src/assets/dragon/flight.ts), in the order shown. */
      flights: FlightParams[];
      /** Seconds the flight clock eases its weights over. */
      flightRampS: number;
      /** Pin every dragon at flight time `t` seconds, flapping at full weight; null: on the ground at rest. Redraws. */
      flapAt(t: number | null): void;
      /** Pin every dragon at flight time `t` seconds, gliding at full weight; null: on the ground at rest. Redraws. */
      glideAt(t: number | null): void;
      /** Pin every dragon at flight time `t` with any flap and glide weights (the ramps' frames); null: at rest. Redraws. */
      flightAt(t: number | null, flap?: number, glide?: number): void;
      /** Pin each dragon at phase `ph` of its own beat, flapping: 'top' and 'bottom' of the downstroke, or 0..1. Redraws. */
      flapPhaseAt(ph: number | 'top' | 'bottom'): void;
      /** Run the flight clock toward flapping, gliding, or back on the ground, easing over FLIGHT_RAMP_S. */
      flapPlay(): void;
      glidePlay(): void;
      land(): void;
      /** The flight clock's time, eased weights, and the tracked dragon's altitude. */
      flightState(): { t: number; flap: number; glide: number; altitude: number };
      /**
       * Measure a flap (src/render/flight-probe.ts): sheet dragon k, or a dragon built from a
       * phenotype, through `cycles` beats at `perCycle` phases, a glide, the ramps and the
       * crossfade. Leaves the shown dragons as they were.
       */
      flightProbe(spec: number | Phenotype, cycles?: number, perCycle?: number): Promise<FlightReport>;
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
    for (const p of placed) {
      const holder = p.mesh.parent!;
      // The walking dragon turns about where it stands, not about where it started (D1).
      if (followView) trackedPoint(p, pivotA);
      holder.rotation.y = rad;
      if (followView) {
        trackedPoint(p, pivotB);
        holder.position.add(pivotA).sub(pivotB);
      }
    }
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
  idle,
  idleAt(t: number | null) {
    playing = false;
    setIdleMix(t === null ? 0 : 1);
    setIdleTime(t ?? 0);
    frame();
    if (!running()) cancelAnimationFrame(rafId);
  },
  idlePlay() {
    setIdleMix(1);
    if (!playing && animate) { playing = true; loop(); }
  },
  blinkMid(k: number, from = 0) {
    return blinkMidTime(idle[k]!, from);
  },
  idleWaves(k: number, t: number) {
    return idleWaves(idle[k]!, t);
  },
  gaits,
  walkAt(t: number | null) {
    walkClock = t;
    poseWalk(t);
    frame();
    if (!running()) cancelAnimationFrame(rafId);
  },
  walkPlay() {
    if (!rigged) return;
    if (walkClock !== 'run') {
      if (typeof walkClock === 'number') {
        gaitT = walkClock;
        walkW = 1;
        for (const p of placed) if (p.walk) p.dist = p.mesh.position.x - p.baseX;
      } else {
        gaitT = 0;
        walkW = 0;
        for (const p of placed) p.dist = 0;
      }
      lastNow = -1;
    }
    walkGoal = 1;
    walkClock = 'run';
    loop();
  },
  walkStop() {
    walkGoal = 0;
  },
  walkViewState() {
    const p = placed[0]!;
    trackedPoint(p, focus);
    const ndc = focus.clone().project(camera);
    return {
      dragon: focus.toArray(), camera: camera.position.toArray(), distance: camera.position.distanceTo(focus), zoom: walkCam.zoom,
      ndc: [ndc.x, ndc.y], ground: ground.position.toArray(), backdrop: backdrop.position.toArray(), weight: walkW,
    };
  },
  walkDrift(k: number, cycles = 2, steps = 480) {
    return walkDrift(k, cycles, steps);
  },
  frameStats(reset = true) {
    const xs = frameMs.slice(0, frameCount).sort((a, b) => a - b);
    const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? NaN;
    const out = { p50: at(0.5), p95: at(0.95), max: xs[xs.length - 1] ?? NaN, n: xs.length };
    if (reset) frameCount = 0;
    return out;
  },
  flights,
  flightRampS: 0,
  flapAt(t: number | null) { pinFlight(t, 1, 0); },
  glideAt(t: number | null) { pinFlight(t, 0, 1); },
  flightAt(t: number | null, flap = 1, glide = 0) { pinFlight(t, flap, glide); },
  flapPhaseAt(ph: number | 'top' | 'bottom') {
    pinFlight(0, 1, 0, ph);
  },
  flapPlay() { playFlight(1, 0); },
  glidePlay() { playFlight(0, 1); },
  land() { flapGoal = 0; glideGoal = 0; },
  flightState() {
    return { t: flightT, flap: flapW, glide: glideW, altitude: placed[0]?.flight?.altitude ?? 0 };
  },
  flightProbe(spec: number | Phenotype, cycles = 2, perCycle = 32) {
    return flightProbe(spec, cycles, perCycle);
  },
};
// The clocks: the page's own time, one uniform write, the walk's pose and one render per
// frame. The idle and the walk are pinned separately (idleAt, walkAt), so a driver's shots
// are reproducible; the frame loop runs while either clock does.
let playing = false;
let rafId = 0;
/** 'run' follows the page's clock; a number pins walk time; null stands every dragon at rest. */
let walkClock: number | null | 'run' = null;
/** Seconds to ease the walk in or out: the weight's ramp, so a start or stop is not a snap. */
const WALK_RAMP_S = 0.4;
/** The running clock: walk time, the weight's linear ramp (eased when used) and its goal, the last frame's time. */
let gaitT = 0, walkW = 0, walkGoal = 0, lastNow = -1;
/**
 * The flight clock (M7c): 'run' follows the page's clock; a number pins flight time; null holds
 * every dragon on the ground. The weights ease linearly toward their goals over FLIGHT_RAMP_S and
 * are smoothstepped where used; a flap → glide switch moves the two in lockstep, so they always
 * sum to at most 1.
 */
let flightClock: number | null | 'run' = null;
const FLIGHT_RAMP_S = 0.8;
window.__dragonView.flightRampS = FLIGHT_RAMP_S;
let flightT = 0, flapL = 0, glideL = 0, flapGoal = 0, glideGoal = 0, flapW = 0, glideW = 0;
/** flapPhaseAt: each dragon at this phase of its own beat instead of at flightT. */
let phasePin: number | 'top' | 'bottom' | null = null;
const running = () => playing || walkClock === 'run' || flightClock === 'run';
const ease = (x: number) => x * x * (3 - 2 * x);
/** Hand each dragon's flight its time and weights. Allocation-free. */
function applyFlight(): void {
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    if (!p.flight) continue;
    let t = flightT;
    if (phasePin !== null) {
      const fp = p.flight.params, st = strokeTimes(fp);
      t = phasePin === 'top' ? st.top : phasePin === 'bottom' ? st.bottom : phasePin * fp.period;
    }
    p.flight.set(t, flapW, glideW);
  }
}
/** Pose every dragon for the walk's and the flight's current state (no time step). */
function poseNow(): void {
  applyFlight();
  if (walkClock === 'run') { for (const p of placed) if (p.walk) { if (walkGoal === 0 && walkW === 0) p.walk.pose(null); else p.walk.pose(gaitT, walkW * walkW * (3 - 2 * walkW)); } } else poseWalk(walkClock);
}
function pinFlight(t: number | null, flap: number, glide: number, ph: number | 'top' | 'bottom' | null = null): void {
  flightClock = t;
  flightT = t ?? 0;
  phasePin = ph;
  flapL = flapW = t === null ? 0 : flap;
  glideL = glideW = t === null ? 0 : glide;
  flapGoal = flapL; glideGoal = glideL;
  poseNow();
  frame();
  if (!running()) cancelAnimationFrame(rafId);
}
function playFlight(flap: number, glide: number): void {
  if (!rigged) return;
  if (flightClock !== 'run') {
    if (flightClock === null) { flightT = 0; flapL = glideL = flapW = glideW = 0; }
    lastNow = -1;
  }
  phasePin = null;
  flapGoal = flap; glideGoal = glide;
  flightClock = 'run';
  // Take off from a stand: a walk eases out as the flight eases in.
  if (walkClock === 'run') walkGoal = 0;
  loop();
}
/** One frame of the running flight clock: ease the weights toward their goals, advance flight time. Allocation-free. */
function stepFlight(dt: number): void {
  const k = dt / FLIGHT_RAMP_S;
  flapL = flapGoal > flapL ? Math.min(flapGoal, flapL + k) : Math.max(flapGoal, flapL - k);
  glideL = glideGoal > glideL ? Math.min(glideGoal, glideL + k) : Math.max(glideGoal, glideL - k);
  flapW = ease(flapL); glideW = ease(glideL);
  flightT += dt;
  if (flapGoal === 0 && glideGoal === 0 && flapL === 0 && glideL === 0) flightClock = null;
  applyFlight();
}
function loop(): void {
  cancelAnimationFrame(rafId);
  if (running()) rafId = requestAnimationFrame(tick);
}
/** Main-thread ms per clock-driven frame: a fixed ring, so measuring allocates nothing. */
const frameMs = new Float64Array(2048);
let frameCount = 0;
function tick(now: number): void {
  if (!running()) return;
  const t0 = performance.now();
  if (playing) setIdleTime(now / 1000);
  const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
  const flying = flightClock === 'run';
  if (flying) stepFlight(dt);
  if (walkClock === 'run') stepWalk(dt);
  else if (flying) poseWalk(walkClock);
  lastNow = now;
  frame();
  frameMs[frameCount % frameMs.length] = performance.now() - t0;
  frameCount = Math.min(frameCount + 1, frameMs.length);
  rafId = requestAnimationFrame(tick);
}
/**
 * One frame of the running walk clock: ease the weight toward its goal, advance walk time,
 * move each dragon by weight · speed, pose it. When the weight reaches 0 on a stop, every
 * dragon stands at rest where it stopped and the clock ends. Allocation-free.
 */
function stepWalk(dt: number): void {
  walkW = walkGoal > walkW ? Math.min(walkGoal, walkW + dt / WALK_RAMP_S) : Math.max(walkGoal, walkW - dt / WALK_RAMP_S);
  const w = walkW * walkW * (3 - 2 * walkW);
  gaitT += dt;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    if (!p.walk) continue;
    p.dist += w * p.walk.params.speed * dt;
    // On the sheet each dragon jumps back to its cell every WRAP_CYCLES strides, all of it at once.
    if (!followView) { const wrap = WRAP_CYCLES * p.walk.params.stride; if (p.dist > wrap) p.dist -= wrap; }
    if (walkGoal === 0 && walkW === 0) p.walk.pose(null); else p.walk.pose(gaitT, w);
    p.mesh.position.x = p.baseX + p.dist;
  }
  if (walkGoal === 0 && walkW === 0) walkClock = null;
}
/** Pose every rigged dragon at walk time t (null: at rest) and move it by its travel. Allocation-free. */
function poseWalk(t: number | null): void {
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    if (!p.walk) continue;
    p.walk.pose(t);
    let x = p.walk.travel;
    // On the sheet each dragon jumps back to its cell every WRAP_CYCLES cycles, all of it at once.
    if (!followView && t !== null) x -= WRAP_CYCLES * p.walk.params.stride * Math.floor(t / (WRAP_CYCLES * p.walk.params.period));
    p.mesh.position.x = p.baseX + x;
  }
}

/** What `flightProbe` returns: the probe's numbers, and which dragon they are for. */
interface FlightReport extends FlightProbe {
  label: string; gid: string; wingForm: WingForm; wingSpan: number; wingFingers: number; wingShape: number;
  params: FlightParams; hover: number; bones: number;
}
/** Measure one dragon's flap (see the hook). A phenotype is built in a worker of its own, off the scene. */
async function flightProbe(spec: number | Phenotype, cycles: number, perCycle: number): Promise<FlightReport> {
  let body: DragonBody, gm: Genome, flight: DragonFlight, label: string, own = false;
  if (typeof spec === 'number') {
    const p = placed[spec];
    if (!p?.flight) throw new Error('flightProbe: that dragon is not rigged (?static=1, a mask or the sweep)');
    ({ body, genome: gm, flight } = p);
    label = SHEET[p.cell]!.label;
  } else {
    gm = new Genome();
    for (const k of GENE_NAMES) gm.g[k] = [{ value: spec[k], dominant: true }, { value: spec[k], dominant: true }];
    gm.element = ['ember', 'ember'];
    gm.lineage = 'probe';
    const m = new DragonMesher();
    try { body = (await m.build(gm)).body; } finally { m.dispose(); }
    flight = new DragonFlight(new DragonWalk(body.rig, walkParams(gm)), body.rig, flightParams(gm));
    label = `wingSpan ${spec.wingSpan}`;
    own = true;
  }
  const g = body.geometry;
  const probe = probeFlight({
    position: g.getAttribute('position').array, skinIndex: g.getAttribute('skinIndex').array, skinWeight: g.getAttribute('skinWeight').array,
    rig: body.rig, graph: body.graph, idx: body.idx, phenotype: gm.phenotype,
  }, flight, flightSamples(flight.params, cycles, perCycle));
  if (own) g.dispose();
  else { poseNow(); frame(); }
  const ph = gm.phenotype;
  return { ...probe, label, gid: gm.gid(), wingForm: wingForm(ph), wingSpan: ph.wingSpan, wingFingers: ph.wingFingers, wingShape: ph.wingShape,
    params: flight.params, hover: flight.hover, bones: body.rig.parent.length };
}

/** A foot's contact patch: its leg's lower vertices (shin, foot, toes) this close to the ground at rest. */
const CONTACT_Y = 0.10;
interface WalkDrift {
  label: string; stride: number; period: number; duty: number; cycles: number; steps: number;
  legs: { leg: string; ballDrift: number; contactDrift: number; contactVerts: number; stances: number;
    kneeMinDeg: number; kneeMaxDeg: number; stretched: number }[];
}
function walkDrift(k: number, cycles: number, steps: number): WalkDrift {
  const p = placed[k];
  if (!p?.walk || !(p.mesh instanceof THREE.SkinnedMesh)) throw new Error('walkDrift: that dragon is not rigged (?static=1, a mask or the sweep)');
  const walk = p.walk, mesh = p.mesh, g = walk.params;
  const pos = mesh.geometry.getAttribute('position'), si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
  const legs = LEG_NAMES.map((leg, i) => {
    // Every vertex of this leg's shin, foot and toes that is this near the ground at rest.
    const shin = BONE.leg0 + 3 * i + 1, foot = shin + 1;
    const verts: number[] = [];
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > CONTACT_Y) continue;
      for (let j = 0; j < 4; j++) {
        const b = si.getComponent(v, j);
        if ((b === foot || b === shin) && sw.getComponent(v, j) > 0) { verts.push(v); break; }
      }
    }
    return { leg, verts, start: new Float64Array(verts.length * 3), ballStart: new THREE.Vector3(), was: false, stances: 0,
      ballDrift: 0, contactDrift: 0, kneeMin: Infinity, kneeMax: -Infinity, stretched: 0 };
  });
  const v3 = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    const t = (cycles * g.period * s) / steps;
    walk.pose(t);
    mesh.position.x = p.baseX + walk.travel;
    mesh.parent!.updateMatrixWorld(true);
    legs.forEach((L, i) => {
      const st = walk.legState(i);
      L.kneeMin = Math.min(L.kneeMin, st.kneeAngle);
      L.kneeMax = Math.max(L.kneeMax, st.kneeAngle);
      if (st.stretched) L.stretched++;
      if (!st.planted) { L.was = false; return; }
      const fresh = !L.was;
      if (fresh) L.stances++;
      L.was = true;
      walk.ball(i, v3).applyMatrix4(mesh.matrixWorld);
      if (fresh) L.ballStart.copy(v3);
      L.ballDrift = Math.max(L.ballDrift, v3.distanceTo(L.ballStart));
      L.verts.forEach((v, j) => {
        mesh.getVertexPosition(v, v3).applyMatrix4(mesh.matrixWorld);
        if (fresh) { L.start[3 * j] = v3.x; L.start[3 * j + 1] = v3.y; L.start[3 * j + 2] = v3.z; }
        L.contactDrift = Math.max(L.contactDrift, Math.hypot(v3.x - L.start[3 * j]!, v3.y - L.start[3 * j + 1]!, v3.z - L.start[3 * j + 2]!));
      });
    });
  }
  poseWalk(typeof walkClock === 'number' ? walkClock : null);
  frame();
  const deg = (r: number) => (r * 180) / Math.PI;
  return {
    label: SHEET[p.cell]!.label, stride: g.stride, period: g.period, duty: g.duty, cycles, steps,
    legs: legs.map((L) => ({ leg: L.leg, ballDrift: L.ballDrift, contactDrift: L.contactDrift, contactVerts: L.verts.length,
      stances: L.stances, kneeMinDeg: deg(L.kneeMin), kneeMaxDeg: deg(L.kneeMax), stretched: L.stretched })),
  };
}
window.__dragonView.idlePlay();
if (walkView || params.get('walk') === '1') window.__dragonView.walkPlay();
if (flightView || params.get('flap') === '1') window.__dragonView.flapPlay();
if (flightView) {
  // F flap, G glide, L land.
  addEventListener('keydown', (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'f') window.__dragonView!.flapPlay();
    else if (k === 'g') window.__dragonView!.glidePlay();
    else if (k === 'l') window.__dragonView!.land();
  });
}
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
  if (followView) {
    // The follow camera: scale its offset from the dragon, clamped (D2).
    walkCam.zoom = Math.min(Math.max(walkCam.zoom * k, WALK_ZOOM[0]), WALK_ZOOM[1]);
  } else if (camera instanceof THREE.OrthographicCamera) {
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
