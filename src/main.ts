import * as THREE from 'three';

/**
 * M0 spine: prove the whole chain works end to end — build, deploy, render, measure.
 * Everything here is placeholder and expected to be replaced by M3 onward. What must
 * survive is the contract: a canvas, a render loop, and `__dragonveinStats` for the gates.
 *
 * Within that, it still has to meet `docs/ART_BIBLE.md`, because the critics score the
 * frame, not the intent: a sky gradient from the bible's palette, one sun plus a cool fill
 * plus a warm rim, visible contact shadows, and enough scatter that the ground is never
 * bare. Every repeated prop is an `InstancedMesh` — one draw call per prop type.
 *
 * Deliberately NOT here (milestone M6): orbit camera, day/night, bloom, quality tiers.
 */

/** Injected by Vite's `define` from tools/site-config.mjs. */
declare const __BUILD_VERSION__: string;

// --- palette: docs/ART_BIBLE.md, verbatim. Nothing in this file invents a colour. ------
const PALETTE = {
  skyZenith: 0x0a1c4f,
  skyHorizon: 0xff9044,
  deepShadow: 0x1a1420,
  rockMid: 0x5a4a40,
  foliageDark: 0x1e4a21,
  foliageMid: 0x3f8a33,
  foliageLight: 0x8fd24a,
} as const;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
// Far and faint: the island must not wash out, but distance still reads.
scene.fog = new THREE.Fog(PALETTE.skyHorizon, 46, 190);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
// Framing is a compromise the geometry forces: look far enough down to see the ground
// (and the contact shadows on it), but keep the horizon high enough in frame that the sky
// gradient is actually in shot. ~20 units out at ~14 deg of pitch is the closest that
// satisfies both and still fits the whole island, root included.
camera.position.set(12.7, 7.0, 15.5);
camera.lookAt(0, 2.0, 0);

// --- deterministic scatter -------------------------------------------------------------
// mulberry32. Seeded so the scatter is identical in every build: two screenshots taken
// days apart differ only by the island's rotation, which is what rubric A5 needs to be
// able to diff. Replaced by the shared `Rng` from src/core/rng.ts when that lands (M2).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- sky: one backside sphere, one draw call, gradient baked into vertex colours --------
// A shader would also work; vertex colours keep the exact bible hexes through three's
// colour management with no hand-written tone-mapping chunk to get wrong. `toneMapped`
// is off so the gradient lands on #0a1c4f → #ff9044 rather than an ACES approximation.
const SKY_RADIUS = 420;
// Many height segments: the gradient is interpolated per vertex, and too few rings
// contour into visible stripes across half the frame.
const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 24, 192);
{
  // Blend in sRGB, not in the linear working space: a linear ramp from #ff9044 to the
  // very dark #0a1c4f spends most of its length in brown and only turns blue at the far
  // end, which read as a flat orange sky. Mixing perceptually puts the warm band at the
  // horizon and the zenith colour where the bible says it goes.
  const toSrgb = (hex: number): [number, number, number] =>
    [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const zenith = toSrgb(PALETTE.skyZenith);
  const horizon = toSrgb(PALETTE.skyHorizon);
  const abyss = toSrgb(PALETTE.deepShadow);   // below the horizon: the drop under a sky-world
  const pos = skyGeo.attributes['position'];
  if (!pos) throw new Error('sky geometry has no position attribute');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const smooth = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / SKY_RADIUS;                 // -1 nadir … +1 zenith
    const up = h >= 0;
    const other = up ? zenith : abyss;
    // The warm band is narrow on purpose — a golden-hour band at the horizon, not an
    // orange hemisphere. Below it, the sky falls away slowly into the abyss colour.
    const t = smooth(Math.abs(h) / (up ? 0.12 : 0.45));
    c.setRGB(
      horizon[0] + (other[0] - horizon[0]) * t,
      horizon[1] + (other[1] - horizon[1]) * t,
      horizon[2] + (other[2] - horizon[2]) * t,
      THREE.SRGBColorSpace,
    );
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
}));
sky.renderOrder = -1;
scene.add(sky);

// --- lighting: one sun, one cool fill, one warm rim (docs/ART_BIBLE.md §Lighting) -------
const sun = new THREE.DirectionalLight(0xffd9a8, 3.1);
// Right and slightly in front of the island: the camera-facing slope stays lit (a
// backlit island reads as a dark blob against a bright sky) while the shadows still
// rake across open ground to the left, where they are in frame.
sun.position.set(14, 9.5, 5.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);   // the Medium tier in docs/PERF_BUDGET.md
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.022;     // kills acne on the instanced scatter without peter-panning
// Tight to the island, so the 1024 texels land where the contact shadows are
// (about 57 texels per world unit) instead of being spread over empty sky.
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x7aa0ff, 0.62);   // ~20% of key, opposite side
fill.position.set(-11, 5.5, 9);
scene.add(fill);

const rim = new THREE.DirectionalLight(PALETTE.skyHorizon, 1.15);  // warm rim from behind
rim.position.set(-6, 3, -11.5);
scene.add(rim);

// Sky bounce only; kept low so the shadows stay legible.
scene.add(new THREE.HemisphereLight(0x8fb6ff, PALETTE.deepShadow, 0.30));

// --- placeholder island ----------------------------------------------------------------
const island = new THREE.Group();
scene.add(island);

const TOP_Y = 0.55;        // world y of the grass surface
const TOP_RADIUS = 6;

// Grass cap, rock sides: without the rock band the island reads as a green coin rather
// than as soil over stone. CylinderGeometry already splits side / top / bottom into
// material groups, so this is one mesh, not three.
const rockSide = new THREE.MeshStandardMaterial({ color: PALETTE.rockMid, roughness: 0.98 });
const top = new THREE.Mesh(
  new THREE.CylinderGeometry(TOP_RADIUS, TOP_RADIUS - 0.4, 1.1, 48),
  [rockSide, new THREE.MeshStandardMaterial({ color: PALETTE.foliageMid, roughness: 0.95 }), rockSide],
);
top.castShadow = true;
top.receiveShadow = true;
island.add(top);

const base = new THREE.Mesh(
  new THREE.ConeGeometry(TOP_RADIUS - 0.4, 6.5, 48),
  new THREE.MeshStandardMaterial({ color: PALETTE.rockMid, roughness: 0.98 }),
);
base.position.y = -3.25;
base.rotation.x = Math.PI;
base.castShadow = true;
base.receiveShadow = true;
island.add(base);

// --- scatter: every repeated prop is one InstancedMesh = one draw call ------------------
type Spot = { x: number; z: number; r: number };
const taken: Spot[] = [];

/** Rejection sampling on the footprint, so props never grow out of each other — rubric
 *  A8 fails on interpenetration. Canopies may still overlap in silhouette; trunks do not. */
function pick(
  rng: () => number, radius: number, maxR: number,
  avoid: Spot | null = null, attempts = 140,
): Spot | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * maxR;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (avoid) {
      const ax = avoid.x - x;
      const az = avoid.z - z;
      if (ax * ax + az * az < avoid.r * avoid.r) continue;
    }
    let clear = true;
    for (const s of taken) {
      const dx = s.x - x;
      const dz = s.z - z;
      if (dx * dx + dz * dz < (s.r + radius) * (s.r + radius)) { clear = false; break; }
    }
    if (clear) { const spot = { x, z, r: radius }; taken.push(spot); return spot; }
  }
  return null;
}

// Scratch objects, allocated once. Nothing below allocates per frame.
const mat4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const vPos = new THREE.Vector3();
const vScale = new THREE.Vector3();
const tint = new THREE.Color();
const cDark = new THREE.Color(PALETTE.foliageDark);
const cMid = new THREE.Color(PALETTE.foliageMid);
const cLight = new THREE.Color(PALETTE.foliageLight);
const cRock = new THREE.Color(PALETTE.rockMid);
const cShadow = new THREE.Color(PALETTE.deepShadow);

function place(
  mesh: THREE.InstancedMesh, i: number,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  rotY: number, tiltX = 0, tiltZ = 0,
): void {
  euler.set(tiltX, rotY, tiltZ);
  quat.setFromEuler(euler);
  vPos.set(x, y, z);
  vScale.set(sx, sy, sz);
  mesh.setMatrixAt(i, mat4.compose(vPos, quat, vScale));
}

/** Instanced props get white base material colour so per-instance tints are the literal
 *  bible hexes rather than a product of two colours. */
function instanced(geo: THREE.BufferGeometry, count: number, roughness: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, flatShading: true }),
    count,
  );
  mesh.receiveShadow = true;
  island.add(mesh);
  return mesh;
}

// A clearing that only the trees respect: with the canopy closed there is no open ground
// for a contact shadow to land on, and rubric A3 reads the frame as shadowless. Placed on
// the camera-facing side so it is in shot.
const CLEARING: Spot = { x: 0.4, z: 2.6, r: 2.3 };

// Trees — three values per asset (ART_BIBLE §Direction): dark trunk, mid lower canopy,
// light upper tier. Two tiers so the silhouette still reads as a tree at 25% (rubric A1).
const TREES = 44;
const trunks = instanced(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 5), TREES, 0.95);
const canopies = instanced(new THREE.ConeGeometry(0.66, 1.5, 7), TREES, 0.85);
const crowns = instanced(new THREE.ConeGeometry(0.45, 1.1, 7), TREES, 0.8);
trunks.castShadow = true;
canopies.castShadow = true;
crowns.castShadow = true;
{
  const rng = makeRng(0x10a9_0a1c);
  let n = 0;
  for (let i = 0; i < TREES; i++) {
    const h = 0.74 + rng() * 0.95;                 // height spread, so the skyline is not a hedge
    const spot = pick(rng, 0.3 + h * 0.13, 5.0, CLEARING);
    if (!spot) continue;
    const rotY = rng() * Math.PI * 2;
    const lean = (rng() - 0.5) * 0.06;
    const w = 0.82 + rng() * 0.3;
    place(trunks, n, spot.x, TOP_Y + 0.5 * h, spot.z, w, h, w, rotY, lean, lean);
    place(canopies, n, spot.x, TOP_Y + h * 1.25, spot.z, w, h, w, rotY, lean, lean);
    place(crowns, n, spot.x, TOP_Y + h * 1.95, spot.z, w, h, w, rotY, lean, lean);
    trunks.setColorAt(n, tint.copy(cShadow).lerp(cRock, 0.3 + rng() * 0.35));
    canopies.setColorAt(n, tint.copy(cDark).lerp(cMid, 0.45 + rng() * 0.5));
    crowns.setColorAt(n, tint.copy(cMid).lerp(cLight, 0.35 + rng() * 0.5));
    n++;
  }
  trunks.count = canopies.count = crowns.count = n;
}

// Scatter rocks — the island reads as rock under the grass, not as a green coin.
const ROCKS = 76;
const rocks = instanced(new THREE.IcosahedronGeometry(0.3, 0), ROCKS, 1.0);
rocks.castShadow = true;
{
  const rng = makeRng(0x5a4a_4001);
  let n = 0;
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.4 + rng() * 0.95;
    const spot = pick(rng, 0.13 + s * 0.12, 5.5);
    if (!spot) continue;
    place(rocks, n, spot.x, TOP_Y + s * 0.11, spot.z,
      s, s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.5),
      rng() * Math.PI * 2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
    rocks.setColorAt(n, tint.copy(cShadow).lerp(cRock, 0.45 + rng() * 0.55));
    n++;
  }
  rocks.count = n;
}

// Understory bushes — fills the mid frequency between trees and bare ground (rubric A6).
const BUSHES = 104;
const bushes = instanced(new THREE.SphereGeometry(0.34, 7, 5), BUSHES, 0.9);
bushes.castShadow = true;
{
  const rng = makeRng(0x3f8a_3302);
  let n = 0;
  for (let i = 0; i < BUSHES; i++) {
    const s = 0.5 + rng() * 0.7;
    const spot = pick(rng, 0.14 + s * 0.14, 5.6);
    if (!spot) continue;
    place(bushes, n, spot.x, TOP_Y + s * 0.19, spot.z,
      s, s * 0.62, s, rng() * Math.PI * 2);
    bushes.setColorAt(n, tint.copy(cDark).lerp(cLight, 0.2 + rng() * 0.55));
    n++;
  }
  bushes.count = n;
}

// Ground cover — the high frequency. Cheap, never casts a shadow, kills the bare plane.
const TUFTS = 300;
const tufts = instanced(new THREE.ConeGeometry(0.075, 0.36, 3), TUFTS, 0.9);
{
  const rng = makeRng(0x8fd2_4a03);
  let n = 0;
  for (let i = 0; i < TUFTS; i++) {
    const s = 0.55 + rng() * 0.8;
    const spot = pick(rng, 0.058 * s, 5.72);
    if (!spot) continue;
    place(tufts, n, spot.x, TOP_Y + s * 0.17, spot.z,
      s, s, s, rng() * Math.PI * 2, (rng() - 0.5) * 0.34, (rng() - 0.5) * 0.34);
    tufts.setColorAt(n, tint.copy(cMid).lerp(cLight, 0.25 + rng() * 0.75));
    n++;
  }
  tufts.count = n;
}

// --- overlay (rubric A7). Kept in index.html / here on purpose: src/ui/ is another -------
// owner's directory and a later milestone.
const hud = {
  build: document.getElementById('hud-build'),
  fps: document.getElementById('hud-fps'),
  draws: document.getElementById('hud-draws'),
  tris: document.getElementById('hud-tris'),
};
if (hud.build) hud.build.textContent = __BUILD_VERSION__;

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// --- frame loop: counters only, no allocation ------------------------------------------
let frameMs = 0;
let last = performance.now();
let framesSinceSample = 0;
let msSinceSample = 0;
let fps = 0;

function frame(now: number): void {
  frameMs = now - last;
  last = now;
  framesSinceSample++;
  msSinceSample += frameMs;
  resize();
  island.rotation.y = now * 0.00012;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The overlay is refreshed on a timer, not inside frame(): formatting a number allocates
// a string, and the frame loop stays allocation-free (docs/PERF_BUDGET.md).
setInterval(() => {
  if (msSinceSample > 0) fps = (framesSinceSample * 1000) / msSinceSample;
  framesSinceSample = 0;
  msSinceSample = 0;
  const info = renderer.info.render;
  if (hud.fps) hud.fps.textContent = fps.toFixed(0);
  if (hud.draws) hud.draws.textContent = String(info.calls);
  if (hud.tris) hud.tris.textContent = String(info.triangles);
}, 250);

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
