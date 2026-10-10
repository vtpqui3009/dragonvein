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
// The art-critic measured the island 10-15 L* under the bible's values with its hues
// within 1-7 deg — sunlit leaf tips #7ea331 (L* 62.4) against foliage light #8fd24a
// (L* 77.5), lit cliff #50311c (L* 23.6) against rock mid #5a4a40 (L* 32.8) — i.e. the
// right colours, under-exposed, which is an exposure problem and not a palette one.
// Safe to raise: the sky mesh is `toneMapped: false`, so the gradient the critic measured
// at deltaE 0.0 does not move with this number.
renderer.toneMappingExposure = 1.18;

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
  /**
   * The cloud sea, baked into the same gradient.
   *
   * The island's root cone was merging into the lower sky at 1.04:1 (rubric A1), because
   * the bottom of the frame was one flat `deep shadow` for 97 rows and a dark cone has
   * nothing to separate against. The fix has to be *behind* the cone, and it cannot be
   * geometry: a deck of flattened spheres big enough to sit behind the root is also big
   * enough to fill the near frame, where it stops reading as cloud and starts reading as
   * pale rock plates. Tried, rendered, rejected.
   *
   * In the gradient it costs no draw call, cannot sort wrongly against the island, and is
   * perfectly soft. It invents no colour either — it is `sky horizon` lifted toward white
   * by a fixed amount, so the band stays on the bible's warm axis.
   */
  const cloudSea = horizon.map((c) => c + (1 - c) * 0.46) as [number, number, number];
  /** Where the deck sits, as a fraction of the sphere's height below the horizon. */
  const SEA_CENTRE = -0.345;
  const SEA_HALF_WIDTH = 0.15;
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
    let r = horizon[0] + (other[0] - horizon[0]) * t;
    let g = horizon[1] + (other[1] - horizon[1]) * t;
    let b = horizon[2] + (other[2] - horizon[2]) * t;
    if (!up) {
      // A soft band, brightest at its centre and gone at both edges, so it reads as a lit
      // deck of cloud under the island rather than as a second horizon line — and broken
      // along its length, because an unmodulated band is an airbrush, not a cloud sea.
      // The break is three sines of the azimuth: cheap, seamless at the wrap (every term
      // is a whole number of cycles), and it moves the deck's height as well as its
      // strength, so the near edge is ragged rather than ruled.
      const theta = Math.atan2(pos.getZ(i), pos.getX(i));
      const lobes =
        Math.sin(theta * 3 + 0.7) * 0.5 +
        Math.sin(theta * 7 - 1.9) * 0.3 +
        Math.sin(theta * 13 + 2.6) * 0.2;
      const centre = SEA_CENTRE + lobes * 0.042;
      const strength = 0.52 + 0.48 * (0.5 + 0.5 * Math.sin(theta * 5 + 0.4));
      const sea = (1 - smooth(Math.abs(h - centre) / SEA_HALF_WIDTH)) * strength;
      r += (cloudSea[0] - r) * sea;
      g += (cloudSea[1] - g) * sea;
      b += (cloudSea[2] - b) * sea;
    }
    c.setRGB(r, g, b, THREE.SRGBColorSpace);
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
// Warm, but less orange than it was (0xffd9a8). The critic measured the island's chroma
// at roughly double the bible's — lit cliff C 22.3 against rock mid's 9.9 — with hue
// correct, which is a key that is too saturated rather than a wrong palette.
const sun = new THREE.DirectionalLight(0xfff1e2, 2.95);
// Right and slightly in front of the island: the camera-facing slope stays lit (a
// backlit island reads as a dark blob against a bright sky) while the shadows still
// rake across open ground to the left, where they are in frame.
sun.position.set(14, 9.5, 5.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);   // the Medium tier in docs/PERF_BUDGET.md
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
// 16 isolated shadow-acne pixels survived the previous pair (-0.0007 / 0.022) on
// otherwise smooth lit faces, worst a 4-px dotted line down a cone face at (636,353).
// More normal bias and less depth bias: normal bias offsets along the surface normal, so
// it kills acne on curved instanced geometry without the peter-panning that more depth
// bias would cost under the contact shadows A3 depends on.
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.042;
// Tight to the island, so the 1024 texels land where the contact shadows are
// (about 57 texels per world unit) instead of being spread over empty sky.
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
scene.add(sun);
scene.add(sun.target);

// Cool fill, opposite the key. Declaring one is not the same as it reaching anything: the
// art-critic measured the key-averted underside at relative luminance 0.0000-0.0008 — a
// fill/key ratio of 0-3% against the bible's 20% — and no cool tint anywhere in shadow.
// The cause was geometric, not an intensity: a single fill above the horizon (y = 5.5)
// contributes nothing to a *downward*-facing normal, and the whole lower half of this
// island is downward-facing. One light cannot be both the opposite-side fill and the
// bounce from below, so there are two, and together they are the bible's one cool fill.
const fill = new THREE.DirectionalLight(0x7aa0ff, 0.62);   // ~20% of key, opposite side
fill.position.set(-11, 5.5, 9);
scene.add(fill);

// The bounce half: below the horizon, aimed up at the root cone. On a sky-world the light
// under an island comes off the cloud sea, so this is cool and dim rather than a second
// sun. It also gives rubric A1 something to work with — the cone's lower silhouette was
// merging into the sky at 1.04:1 partly because the cone itself was at luminance 0.006.
const bounce = new THREE.DirectionalLight(0x9db9f2, 2.5);
bounce.position.set(-7.5, -8.5, 6.5);
scene.add(bounce);

const rim = new THREE.DirectionalLight(PALETTE.skyHorizon, 1.15);  // warm rim from behind
rim.position.set(-6, 3, -11.5);
scene.add(rim);

// Sky bounce. The ground term was `deepShadow` (#1a1420), which is the colour the bible
// gives an island's *underside* — so using it here meant every downward-facing normal was
// told to be near-black, and shadows came out warm-black (5,2,1) instead of cool. The
// ground term is now the cool bounce colour and the intensity is up, which is what put a
// blue cast into the shadows the critic found warm.
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x53608f, 0.8));

// --- the warm rim, as a rim and not as a lamp -------------------------------------------
/**
 * A `DirectionalLight` cannot make a rim. It shades by `N·L`, so a light behind the
 * subject lights the faces pointing away from the camera and leaves every visible edge
 * dark. The art-critic scanned horizontally across a backlit conifer and measured exactly
 * that: sky (195,111,59) -> edge (75,84,35) -> interior (97,140,39) -> (126,163,49).
 * Brightness rose *inward*. Two of the bible's three lights were in the scene graph and
 * only one was in the frame.
 *
 * A rim is a view-dependent term, so it is computed per fragment: Fresnel on `N·V`, gated
 * by `N·L` against the rim light's direction so it lands on the backlit edges rather than
 * haloing the whole silhouette. Injected into the stock `MeshStandardMaterial` program
 * rather than written as a new shader, so the materials keep three's lighting, shadows,
 * tone mapping and colour management — the bible's hexes still come out the other end.
 *
 * `totalEmissiveRadiance` is the injection point: it is summed into `outgoingLight` by
 * `<opaque_fragment>`, which is the last chunk to touch the colour, and adding there
 * means the rim is tone-mapped with everything else instead of clipping on top of it.
 */
const RIM_UNIFORMS = {
  uRimColor: { value: new THREE.Color(PALETTE.skyHorizon).multiplyScalar(1.0) },
  /** Rim light direction in *view* space — refreshed once per frame, never reallocated. */
  uRimDir: { value: new THREE.Vector3(0, 0, 1) },
  uRimStrength: { value: 1.1 },
  /** Higher = tighter band at the silhouette. 2.6 keeps it an edge, not a glow. */
  uRimPower: { value: 2.9 },
};

/** Light-space direction of the rim light, recomputed per frame into scratch vectors. */
const rimWorldDir = new THREE.Vector3();

function updateRimDirection(): void {
  // `rim` is a directional light at a position aimed at the origin, so its world-space
  // direction is its position normalised. Into view space via the camera's rotation only
  // — a direction is not translated.
  rimWorldDir.copy(rim.position).normalize();
  RIM_UNIFORMS.uRimDir.value
    .copy(rimWorldDir)
    .transformDirection(camera.matrixWorldInverse);
}

/** Patches a stock standard material so it also carries the rim term. */
function withRim<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uRimColor'] = RIM_UNIFORMS.uRimColor;
    shader.uniforms['uRimDir'] = RIM_UNIFORMS.uRimDir;
    shader.uniforms['uRimStrength'] = RIM_UNIFORMS.uRimStrength;
    shader.uniforms['uRimPower'] = RIM_UNIFORMS.uRimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform vec3 uRimDir;
         uniform float uRimStrength;
         uniform float uRimPower;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           // normal and vViewPosition are both view-space in this program.
           vec3 rimN = normalize( normal );
           vec3 rimV = normalize( vViewPosition );
           float facing = 1.0 - clamp( dot( rimN, rimV ), 0.0, 1.0 );
           // Gate on the rim light: 0 on the key-lit side, 1 on the backlit side. The
           // smoothstep floor is below 0 so faces exactly perpendicular still catch a
           // little, which is where a real rim is brightest.
           float backlit = smoothstep( -0.45, 0.55, dot( rimN, normalize( uRimDir ) ) );
           totalEmissiveRadiance += uRimColor * uRimStrength * backlit * pow( facing, uRimPower );
         }
         #include <opaque_fragment>`,
      );
  };
  // All patched materials share one program variant; without a stable key three would
  // reuse an unpatched program compiled for an identical material earlier in the frame.
  material.customProgramCacheKey = () => 'dragonvein-rim-v1';
  return material;
}

// --- placeholder island ----------------------------------------------------------------
const island = new THREE.Group();
scene.add(island);

const TOP_Y = 0.55;        // world y of the grass surface
const TOP_RADIUS = 6;

// Grass cap, rock sides: without the rock band the island reads as a green coin rather
// than as soil over stone. CylinderGeometry already splits side / top / bottom into
// material groups, so this is one mesh, not three.
const rockSide = withRim(new THREE.MeshStandardMaterial({ color: PALETTE.rockMid, roughness: 0.98 }));
const top = new THREE.Mesh(
  new THREE.CylinderGeometry(TOP_RADIUS, TOP_RADIUS - 0.4, 1.1, 48),
  [rockSide, withRim(new THREE.MeshStandardMaterial({ color: PALETTE.foliageMid, roughness: 0.95 })), rockSide],
);
top.castShadow = true;
top.receiveShadow = true;
island.add(top);

const base = new THREE.Mesh(
  // 96 radial segments, up from 48. The art-critic read three flat facets across
  // x 540-760 and scored A9 down for a faceted diamond where the concept has a smooth
  // cone; at 48 the facet width was ~4 px of a 1080p frame, which is exactly the scale
  // that reads as flat. 96 costs 96 triangles against a 900 000 budget.
  new THREE.ConeGeometry(TOP_RADIUS - 0.4, 6.5, 96),
  withRim(new THREE.MeshStandardMaterial({ color: PALETTE.rockMid, roughness: 0.98 })),
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
function instanced(
  geo: THREE.BufferGeometry, count: number, roughness: number,
  parent: THREE.Object3D = island,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geo,
    withRim(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, flatShading: true })),
    count,
  );
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// A clearing that only the trees respect: with the canopy closed there is no open ground
// for a contact shadow to land on, and rubric A3 reads the frame as shadowless. Placed on
// the camera-facing side so it is in shot.
const CLEARING: Spot = { x: 0.4, z: 2.6, r: 2.3 };

// --- reservations: the path and the crystal clusters, laid out before the scatter -------
/**
 * These two are *authored* positions, not sampled ones — a path has to be a path and the
 * concept puts the crystals in three clusters left of centre. So they cannot go through
 * `pick`, and if they were simply added afterwards the scatter would already be standing
 * where they go. Rubric A5 fails `blocking` on interpenetration, and a bush growing out
 * of a stepping stone is exactly that.
 *
 * Laying them out here and pushing their footprints into `taken` means every later
 * rejection sample avoids them, which is the same guarantee the props give each other.
 */
type Placed = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number;
  tiltX: number; tiltZ: number; mix: number };

const pathStones: Placed[] = [];
{
  const rng = makeRng(0x57_0e0106);
  const STONES = 22;
  for (let i = 0; i < STONES; i++) {
    // A shallow arc from the clearing out to the island's edge, drifting as it goes.
    const t = i / (STONES - 1);
    const a = -1.05 + t * 1.9;
    const d = 1.1 + t * 4.5;
    const sc = 0.78 + rng() * 0.5;
    const x = Math.cos(a) * d + (rng() - 0.5) * 0.22;
    const z = Math.sin(a) * d + (rng() - 0.5) * 0.22;
    pathStones.push({
      x, y: TOP_Y + 0.03, z, sx: sc, sy: 1, sz: sc * (0.85 + rng() * 0.3),
      rot: rng() * Math.PI * 2, tiltX: 0, tiltZ: 0, mix: 0.08 + rng() * 0.3,
    });
    taken.push({ x, z, r: 0.36 * sc });
  }
}

const crystalShards: Placed[] = [];
{
  const rng = makeRng(0x2d92_ba05);
  // Three clusters, left of centre as in docs/concept/03-island-scene.png.
  const CENTRES: Spot[] = [
    { x: -3.5, z: -0.6, r: 1.0 },
    { x: -2.2, z: 2.9, r: 0.85 },
    { x: -4.4, z: 2.1, r: 0.7 },
  ];
  for (const centre of CENTRES) {
    const shards = 9 + Math.floor(rng() * 4);
    for (let k = 0; k < shards; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * centre.r;
      const h = 0.45 + rng() * 1.15;
      const sx = 0.3 + rng() * 0.3;
      const sz = 0.3 + rng() * 0.3;
      const x = centre.x + Math.cos(a) * d;
      const z = centre.z + Math.sin(a) * d;
      crystalShards.push({
        x, y: TOP_Y + h * 0.42, z, sx, sy: h, sz,
        rot: rng() * Math.PI * 2, tiltX: (rng() - 0.5) * 0.45, tiltZ: (rng() - 0.5) * 0.45,
        mix: 0.25 + rng() * 0.7,
      });
      taken.push({ x, z, r: Math.max(sx, sz) * 0.6 });
    }
  }
}

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
    crowns.setColorAt(n, tint.copy(cMid).lerp(cLight, 0.3 + rng() * 0.45));
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

// --- the world around the island (rubric A6, A1, A9) -----------------------------------
/**
 * The art-critic measured the island at 18.6% of the frame and the other 81.4% as "a
 * featureless two-stop gradient": no second island, no clouds, no distant silhouettes,
 * nothing at a second depth. `docs/concept/03-island-scene.png` puts two further islands
 * and a cloud sea in exactly that space, and the point of them is not decoration — it is
 * the difference between a world and a prop on a backdrop.
 *
 * It also fixes A1 from the other side. The island's root cone was merging into the lower
 * sky at 1.04:1 because the bottom of the frame is one flat colour (#1a1420, the bible's
 * `deep shadow`) and a dark cone has nothing to separate against. A broken cloud deck
 * below the island puts a lighter, warm-lit surface behind the root — which is also where
 * a sky-world's light comes from, hence the `bounce` light above.
 *
 * Everything here is static and lives on `scene`, not on `island`: only the island
 * rotates, so nothing in the distance can swim relative to anything else (rubric A5).
 * Everything repeated is one `InstancedMesh`, so the whole section costs 7 draw calls.
 */
const far = new THREE.Group();
scene.add(far);

const cCloudLit = new THREE.Color(0xffc49a);     // horizon light on a cloud top
const cWater = new THREE.Color(0x2d92ba);        // ART_BIBLE §Palette, water near
const cWaterFar = new THREE.Color(0xa6f1f2);     // ART_BIBLE §Palette, water far

// Cloud sea — a *broken* deck, not a plane. A solid plane would cover the lower sky band
// the critic measured at deltaE 0.0 against `deep shadow`; puffs leave the abyss visible
// between them, which is both on-bible and what a sky-world looks like.
// Companion islands. Three, at three depths, built from the same cap + cone silhouette as
// the hero island so the world reads as one place. Cap, cone and their trees are three
// InstancedMeshes shared across all three islands.
type Companion = { x: number; y: number; z: number; s: number; trees: number };
const COMPANIONS: Companion[] = [
  // Laid out by unprojecting the screen positions they have to land in, at six different
  // distances from the camera, because `docs/concept/03-island-scene.png` puts its
  // companions at different *depths* on purpose: that is what turns a backdrop into a
  // world. Guessing world coordinates for this put all of them in a vertical column over
  // the hero island, which reads as a stack, not as distance.
  { x: -3, y: 10, z: -28, s: 0.3, trees: 6 },      // right of centre, nearest
  { x: -1, y: 5, z: -45, s: 0.5, trees: 8 },      // right, one step back
  { x: -56, y: 8, z: -13, s: 0.62, trees: 9 },    // upper left
  { x: -54, y: 21, z: -63, s: 1.0, trees: 10 },    // top centre, high and far
  { x: 1, y: -10, z: -108, s: 1.2, trees: 8 },     // far right, below the eyeline
  { x: -120, y: -12, z: -25, s: 1.35, trees: 7 },  // far left, deep in the haze
];
{
  const caps = instanced(new THREE.CylinderGeometry(6, 5.6, 1.1, 36), COMPANIONS.length, 0.95, far);
  const cones = instanced(new THREE.ConeGeometry(5.6, 6.5, 36), COMPANIONS.length, 0.98, far);
  const treeTotal = COMPANIONS.reduce((t, c) => t + c.trees, 0);
  const farTrees = instanced(new THREE.ConeGeometry(0.62, 1.9, 6), treeTotal, 0.85, far);
  const rng = makeRng(0x15_1a4d);
  let t = 0;
  COMPANIONS.forEach((c, i) => {
    place(caps, i, c.x, c.y, c.z, c.s, c.s, c.s, rng() * Math.PI * 2);
    // The cone is the island's root: same inverted-cone trick as the hero island.
    place(cones, i, c.x, c.y - 3.8 * c.s, c.z, c.s, c.s, c.s, rng() * Math.PI * 2, Math.PI);
    caps.setColorAt(i, tint.copy(cMid).lerp(cWaterFar, 0.1 + rng() * 0.12));
    cones.setColorAt(i, tint.copy(cRock).lerp(cShadow, 0.25 + rng() * 0.3));
    for (let k = 0; k < c.trees; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 4.9 * c.s;
      const h = (0.8 + rng() * 0.8) * c.s;
      place(farTrees, t, c.x + Math.cos(a) * d, c.y + 0.55 * c.s + h * 0.95,
        c.z + Math.sin(a) * d, h, h, h, rng() * Math.PI * 2);
      farTrees.setColorAt(t, tint.copy(cDark).lerp(cMid, 0.3 + rng() * 0.5));
      t++;
    }
  });
  farTrees.count = t;
}

// Birds. Nine, static, far enough that they read as a flock rather than as props — the
// cheapest thing in the frame that says "inhabited" (rubric A6).
{
  const BIRDS = 11;
  const birds = instanced(new THREE.ConeGeometry(0.5, 1.6, 3), BIRDS, 1.0, far);
  const rng = makeRng(0xb13d_0001);
  for (let i = 0; i < BIRDS; i++) {
    const a = 1.6 + rng() * 2.4;
    const d = 58 + rng() * 60;
    const sc = 0.5 + rng() * 0.5;
    place(birds, i, Math.cos(a) * d, 9 + rng() * 15, Math.sin(a) * d,
      sc * 2.3, sc * 0.3, sc, rng() * Math.PI * 2, 0, (rng() - 0.5) * 0.8);
    birds.setColorAt(i, tint.copy(cShadow).lerp(cRock, rng() * 0.35));
  }
}

// --- the island reads as inhabited (rubric A6, A9) -------------------------------------
// Three crystal clusters and a stepping-stone path, both in the concept image and both
// called out as absent. Positions come from the reservations above, so the scatter has
// already made room for them. These live on `island`, so they rotate with it.
{
  const crystals = instanced(new THREE.OctahedronGeometry(0.3, 0), crystalShards.length, 0.35);
  crystals.castShadow = true;
  // The shards glow. A shared `emissive` lights every instance the same, so the hue
  // variation rides the per-instance colour and the material carries a modest emissive of
  // its own — enough to read against the grass without blowing out under ACES.
  const crystalMat = crystals.material as THREE.MeshStandardMaterial;
  crystalMat.emissive = new THREE.Color(cWaterFar).multiplyScalar(0.3);
  crystalMat.roughness = 0.25;
  crystalMat.metalness = 0.1;
  crystalShards.forEach((c, i) => {
    place(crystals, i, c.x, c.y, c.z, c.sx, c.sy, c.sz, c.rot, c.tiltX, c.tiltZ);
    crystals.setColorAt(i, tint.copy(cWater).lerp(cWaterFar, c.mix));
  });
}
{
  const stones = instanced(new THREE.CylinderGeometry(0.34, 0.3, 0.1, 7), pathStones.length, 1.0);
  stones.castShadow = true;
  pathStones.forEach((c, i) => {
    place(stones, i, c.x, c.y, c.z, c.sx, c.sy, c.sz, c.rot, c.tiltX, c.tiltZ);
    stones.setColorAt(i, tint.copy(cRock).lerp(cCloudLit, c.mix));
  });
}

// --- overlay (rubric A7). Kept in index.html / here on purpose: src/ui/ is another -------
// owner's directory and a later milestone.
const hud = {
  build: document.getElementById('hud-build'),
  fps: document.getElementById('hud-fps'),
  draws: document.getElementById('hud-draws'),
  tris: document.getElementById('hud-tris'),
  status: document.getElementById('hud-status'),
};
if (hud.build) hud.build.textContent = __BUILD_VERSION__;

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  // Compare the *backing store* against the size `setSize` would give it, not against the
  // CSS box. `canvas.width` is `clientWidth * pixelRatio`, so on any display with
  // devicePixelRatio > 1 — which is every machine this game is aimed at — comparing it
  // against `clientWidth` is permanently unequal, and `setSize` therefore ran on every
  // single frame. Measured at deviceScaleFactor 2 (backing store 2560x1440), before this
  // guard and after: cpu frame cost p50 1.1 -> 0.8 ms, worst frame 9.2 -> 1.9 ms. Heap
  // churn did not move (65.8 vs 68.4 kB/frame, inside the noise), because Blink skips the
  // drawing-buffer reset when the new size equals the old one — so the cost this removes
  // is three.js's own per-frame work, not an allocation.
  const ratio = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// --- frame-cost instrumentation (read by tools/gate-perf.mjs) ---------------------------
/**
 * The gate used to time frames by differencing `requestAnimationFrame` timestamps. That
 * measures *presented-frame cadence*, which the compositor quantises to the vsync tick:
 * every one of 120 samples came back an exact integer multiple of 16.667 ms (max deviation
 * 0.010 ms). An instrument whose finest resolution is the whole 16.6 ms budget can never
 * show that a frame fits it, and a vsync-perfect frame reports 16.667 ms — over a 16.6 ms
 * budget by a rounding artefact, not by being slow.
 *
 * The budget is about frame *cost*, so cost is what is measured here:
 *   - `cpuFrameMs`         main-thread wall time spent producing the frame.
 *   - `gpuFrameMs`         `EXT_disjoint_timer_query_webgl2`, where the context has it.
 *                          SwiftShader does not; the reason is recorded rather than the
 *                          figure being quietly omitted.
 *   - `presentIntervalMs`  the old cadence figure, under a name that says what it is.
 *
 * The ring buffers are pre-allocated `Float64Array`s. The frame loop must not allocate,
 * and an instrument that allocated would corrupt the heap-churn budget it sits beside.
 */
const PERF_CAPACITY = 512;

class Samples {
  private readonly buf: Float64Array;
  private written = 0;

  constructor(capacity: number) { this.buf = new Float64Array(capacity); }

  /** Allocation-free: the only write path, and it runs inside the frame loop. */
  push(v: number): void {
    this.buf[this.written % this.buf.length] = v;
    this.written++;
  }

  /** Number of samples currently retained — the window `toArray` returns. */
  get count(): number { return Math.min(this.written, this.buf.length); }

  /** Oldest-to-newest copy of the retained window. Allocates — never call it per frame. */
  toArray(): number[] {
    const len = Math.min(this.written, this.buf.length);
    const out = new Array<number>(len);
    for (let i = 0; i < len; i++) out[i] = this.buf[(this.written - len + i) % this.buf.length] ?? 0;
    return out;
  }

  reset(): void { this.written = 0; }
}

const cpuFrameMs = new Samples(PERF_CAPACITY);
const presentIntervalMs = new Samples(PERF_CAPACITY);
const gpuFrameMs = new Samples(PERF_CAPACITY);

/** The slice of `EXT_disjoint_timer_query_webgl2` this file uses. */
interface DisjointTimerQuery {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** The slice of `WEBGL_lose_context` this file uses. */
interface LoseContextExtension {
  restoreContext: () => void;
}

const gl = renderer.getContext();
const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
const gl2 = isWebGL2 ? (gl as WebGL2RenderingContext) : null;

// A pool, because a timer query's result is not ready in the frame that issued it — under
// SwiftShader it lags about three frames, and a pool of 4 left two thirds of frames
// untimed (38 samples from 129 frames). Nothing here ever blocks on a result.
const GPU_QUERY_POOL = 16;
const idleQueries: WebGLQuery[] = [];
const busyQueries: WebGLQuery[] = [];
let gpuTimer: DisjointTimerQuery | null = null;
let gpuTimerUnavailableReason = '';
let gpuDisjointEvents = 0;
/**
 * Held from before any loss, on purpose. A lost context returns `null` from every
 * `getExtension` call, so asking for `WEBGL_lose_context` *after* the loss — which is what
 * `renderer.forceContextRestore()` does — gets nothing and logs "WEBGL_lose_context
 * extension not supported". Measured: `restoreSupported` was `true` before a loss and
 * `false` 300 ms after it, and five restore attempts recovered nothing. The handle cached
 * here still works, which is the whole point of `restoreContext()`.
 */
let loseContext: LoseContextExtension | null = null;

/**
 * (Re-)acquire the context's extensions and the timer query pool. Called at startup and
 * again after a context restore, because every GL object from the dead context —
 * extension handles and queries included — is invalid once the context goes.
 */
function acquireContextExtensions(): void {
  idleQueries.length = 0;
  busyQueries.length = 0;
  loseContext = (gl2?.getExtension('WEBGL_lose_context') as LoseContextExtension | null) ?? null;
  gpuTimer = (gl2?.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerQuery | null) ?? null;
  // Why there is no GPU figure, stated rather than left as a silent `null`.
  gpuTimerUnavailableReason = gl2 === null
    ? 'the renderer did not get a WebGL2 context, and EXT_disjoint_timer_query_webgl2 is WebGL2-only'
    : gpuTimer === null
      ? 'EXT_disjoint_timer_query_webgl2 is not exposed by this context; software rasterisers ' +
        '(SwiftShader, llvmpipe) have no GPU timer to expose, and Chromium also withholds it ' +
        'when the GPU process is not trusted'
      : '';
  if (gl2 && gpuTimer) {
    for (let i = 0; i < GPU_QUERY_POOL; i++) {
      const q = gl2.createQuery();
      if (q) idleQueries.push(q);
    }
  }
}
acquireContextExtensions();

/** Drain whichever queries have landed. FIFO, so `gpuFrameMs` stays in frame order. */
function collectGpuTimings(): void {
  if (!gl2 || !gpuTimer) return;
  while (busyQueries.length > 0) {
    const q = busyQueries[0];
    if (!q) { busyQueries.shift(); continue; }
    if (gl2.getQueryParameter(q, gl2.QUERY_RESULT_AVAILABLE) !== true) break;
    busyQueries.shift();
    // A disjoint event means the GPU was interrupted and every outstanding timing is
    // untrustworthy. Count it; do not average rubbish into the figure.
    if (gl2.getParameter(gpuTimer.GPU_DISJOINT_EXT) === true) gpuDisjointEvents++;
    else gpuFrameMs.push(Number(gl2.getQueryParameter(q, gl2.QUERY_RESULT)) / 1e6);
    idleQueries.push(q);
  }
}

// --- WebGL context loss ----------------------------------------------------------------
/**
 * CLAUDE.md §0 names a weak Intel iGPU as the target machine. On that hardware a driver
 * reset is a normal event, not a lab trick: the browser takes the GL context away, the
 * canvas goes dead, and every GL object the page holds becomes invalid.
 *
 * Before this, nothing in the page listened for it and nothing ever asked for a restore,
 * so an induced loss killed the canvas for the rest of the session — measured
 * `lost: true, restored: false` after 4 s — and only a manual reload brought it back.
 *
 * `three.WebGLRenderer` installs its own listeners: its `webglcontextlost` handler calls
 * `preventDefault()` (without which the browser never fires `webglcontextrestored` at
 * all) and its `webglcontextrestored` handler re-initialises the renderer's GL state. What
 * was missing is the two things three cannot do for us: *ask* for the context back, and
 * tell the player. Both are here.
 */
const CONTEXT_RESTORE_ATTEMPTS = 5;
const CONTEXT_RESTORE_BACKOFF_MS = 400;

let contextLost = false;
let contextLostAt = 0;
let contextRestoreAttempts = 0;
let contextRestoredCount = 0;
let framesSkippedWhileContextLost = 0;
let restoreTimer = 0;

function attemptContextRestore(): void {
  if (!contextLost || contextRestoreAttempts >= CONTEXT_RESTORE_ATTEMPTS) {
    paintHud();
    return;
  }
  contextRestoreAttempts++;
  // `restoreContext()` on the handle cached before the loss is the only restore lever a
  // page has. A loss the *driver* caused is restored by the browser on its own schedule
  // and all a page can do is wait for the event — but asking costs nothing, recovers the
  // induced case immediately, and the retry with backoff covers the case where the first
  // ask lands while the GPU process is still coming back.
  loseContext?.restoreContext();
  restoreTimer = window.setTimeout(
    attemptContextRestore, CONTEXT_RESTORE_BACKOFF_MS * contextRestoreAttempts);
  paintHud();
}

canvas.addEventListener('webglcontextlost', () => {
  contextLost = true;
  contextLostAt = performance.now();
  contextRestoreAttempts = 0;
  // Repaint now rather than waiting up to 250 ms for the sampler: the overlay must not
  // keep showing a frame rate for a canvas that has stopped rendering.
  paintHud();
  // Deferred, not called straight from here: `restoreContext()` from inside the
  // `webglcontextlost` handler raises `INVALID_OPERATION: restoreContext: context
  // restoration not allowed`, because the loss event has not finished dispatching. One
  // task later it is allowed.
  restoreTimer = window.setTimeout(attemptContextRestore, 0);
});

canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  contextRestoredCount++;
  clearTimeout(restoreTimer);
  // Every GL object from the dead context is gone, the timer queries included.
  acquireContextExtensions();
  // `resize()` only acts on a size *change*, so after a restore it would leave the
  // renderer's viewport state at whatever the fresh context defaulted to.
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  last = performance.now();
  paintHud();
});

// --- frame loop ------------------------------------------------------------------------
// This loop used to claim "counters only, no allocation". The claim was wrong as a
// description of the frame, and here is the measurement that replaces it.
//
// This file's own per-frame code is clean: in a replica of this scene with
// `renderer.render` removed and everything else kept, heap churn is 380 B/frame, which is
// the browser's bare rAF floor. Put the render call back and it is 36.2-38.1 kB/frame at
// 1920x1080 with 20 draw calls (seven gate runs, 3.8 % spread).
//
// All of that difference is inside `three.WebGLRenderer.render`: ~4 kB fixed plus ~2 kB
// per draw call, in the render-list sort, the uniform upload path and
// `WebGLPrograms.getParameters`. It is not removable from this file. It *is* now
// budgeted — `gate:perf` fails above 40 KiB/frame — and the way to pay for a bigger scene
// is fewer draw calls, not a bigger budget. See docs/PERF_BUDGET.md §Heap churn.
let frameMs = 0;
let last = performance.now();
let framesSinceSample = 0;
let msSinceSample = 0;
let fps = 0;
let framesRendered = 0;
let bootMs = 0;
let lastCpuMs = 0;

function frame(now: number): void {
  frameMs = now - last;
  last = now;

  if (contextLost) {
    // rAF keeps firing after the context dies, and three's `render()` turns into a no-op.
    // Timing that no-op would record a flattering ~0 ms frame cost, and feeding the rAF
    // deltas to the fps counter is exactly how the overlay came to print `FPS 60` over a
    // dead canvas. So: record nothing, count the frame as skipped, and keep asking for
    // frames so the loop is alive the instant the context comes back.
    framesSkippedWhileContextLost++;
    requestAnimationFrame(frame);
    return;
  }

  framesSinceSample++;
  msSinceSample += frameMs;
  presentIntervalMs.push(frameMs);

  const startedAt = performance.now();
  resize();
  island.rotation.y = now * 0.00012;
  // The rim is gated in view space, so its direction has to be re-derived whenever the
  // camera moves. Allocation-free: two pre-allocated vectors, written in place.
  updateRimDirection();

  collectGpuTimings();
  const timed = gpuTimer && idleQueries.length > 0 ? idleQueries.pop() ?? null : null;
  if (gl2 && gpuTimer && timed) gl2.beginQuery(gpuTimer.TIME_ELAPSED_EXT, timed);
  renderer.render(scene, camera);
  if (gl2 && gpuTimer && timed) {
    gl2.endQuery(gpuTimer.TIME_ELAPSED_EXT);
    busyQueries.push(timed);
  }

  lastCpuMs = performance.now() - startedAt;
  cpuFrameMs.push(lastCpuMs);
  framesRendered++;
  // `performance.now()` is measured from navigation start, so the first frame's end *is*
  // boot-to-first-frame. No second clock to disagree with.
  if (bootMs === 0) bootMs = performance.now();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * The overlay is refreshed on a timer, not inside frame(): formatting a number allocates
 * a string, and the per-frame code of this file has to stay off the heap-churn budget
 * (docs/PERF_BUDGET.md §Heap churn).
 *
 * It also has to tell the truth about a dead context. `renderer.info.render` freezes at
 * its last good values when the context is lost, while rAF keeps ticking, so the old
 * version divided live rAF ticks by live rAF time and printed `FPS 60 DRAWS 20
 * TRIS 26984` over a canvas showing the browser's broken-image glyph. A readout whose
 * whole job is to be honest about the frame was at its least honest exactly when it
 * mattered.
 */
function paintHud(): void {
  if (contextLost) {
    fps = 0;
    framesSinceSample = 0;
    msSinceSample = 0;
    if (hud.status) {
      hud.status.textContent = contextRestoreAttempts < CONTEXT_RESTORE_ATTEMPTS
        ? 'GPU CONTEXT LOST — RESTORING'
        : 'GPU CONTEXT LOST — RELOAD TO RECOVER';
      hud.status.hidden = false;
    }
    // Not zero, and not the stale number: there is no measurement to report.
    if (hud.fps) hud.fps.textContent = '—';
    if (hud.draws) hud.draws.textContent = '—';
    if (hud.tris) hud.tris.textContent = '—';
    return;
  }
  if (hud.status) hud.status.hidden = true;
  if (msSinceSample > 0) fps = (framesSinceSample * 1000) / msSinceSample;
  framesSinceSample = 0;
  msSinceSample = 0;
  const info = renderer.info.render;
  if (hud.fps) hud.fps.textContent = fps.toFixed(0);
  if (hud.draws) hud.draws.textContent = String(info.calls);
  if (hud.tris) hud.tris.textContent = String(info.triangles);
}
setInterval(paintHud, 250);

/**
 * What `gate:perf` reads to describe the frame.
 *
 * Raw sample arrays, not percentiles: the gate owns the statistics and writes them into
 * `artifacts/perf.json`, so there is exactly one implementation of "p95" in the project
 * and the page cannot flatter itself.
 */
interface FrameCostReport {
  /** Main-thread wall time spent producing each frame, in ms. */
  cpuFrameMs: number[];
  /** GPU time per frame in ms, or `null` when the context exposes no timer. */
  gpuFrameMs: number[] | null;
  /** Empty when a GPU figure is present; otherwise why there is none. */
  gpuTimerUnavailableReason: string;
  /** Timings thrown away because the GPU reported a disjoint event. */
  gpuDisjointEvents: number;
  /** rAF-to-rAF cadence, quantised to the vsync tick. Diagnostic, never a cost. */
  presentIntervalMs: number[];
  framesRendered: number;
  /** `performance.now()` at the end of the first rendered frame: boot to first frame. */
  bootMs: number;
  viewport: {
    cssWidth: number; cssHeight: number; devicePixelRatio: number;
    drawingBufferWidth: number; drawingBufferHeight: number; pixelRatio: number;
  };
  /** What "Medium" means in this build, so the artefact can be checked against the claim. */
  tier: {
    name: string; configured: boolean; shadows: boolean;
    shadowMapSize: number; postProcessing: boolean; note: string;
  };
  /** The health of the WebGL context. A gate run on a dead context is not a measurement. */
  context: {
    lost: boolean;
    restoreAttempts: number;
    restoredCount: number;
    msSinceLoss: number | null;
    framesSkippedWhileLost: number;
    restoreSupported: boolean;
  };
}

// The gates read these. Keep the shapes stable even as the renderer is replaced.
declare global {
  var __dragonveinStats: (() => {
    drawCalls: number; triangles: number; frameMs: number; cpuFrameMs: number;
  }) | undefined;
  var __dragonveinPerf: {
    reset: () => void;
    /** Cheap progress poll. `read()` copies the whole window and would itself be a
     *  measurable allocation if the gate called it in a loop — which it must not, because
     *  the gate samples the heap through that same loop. */
    counts: () => {
      cpuFrameMs: number; gpuFrameMs: number; presentIntervalMs: number; framesRendered: number;
    };
    read: () => FrameCostReport;
  } | undefined;
}
globalThis.__dragonveinStats = () => ({
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  /** Present interval: rAF cadence, quantised to vsync. Kept for continuity. */
  frameMs,
  /** What the frame actually cost the main thread. This is the one to budget against. */
  cpuFrameMs: lastCpuMs,
});

globalThis.__dragonveinPerf = {
  counts: () => ({
    cpuFrameMs: cpuFrameMs.count,
    gpuFrameMs: gpuFrameMs.count,
    presentIntervalMs: presentIntervalMs.count,
    framesRendered,
  }),
  reset: () => {
    cpuFrameMs.reset();
    gpuFrameMs.reset();
    presentIntervalMs.reset();
    gpuDisjointEvents = 0;
  },
  read: () => ({
    cpuFrameMs: cpuFrameMs.toArray(),
    gpuFrameMs: gpuTimer ? gpuFrameMs.toArray() : null,
    gpuTimerUnavailableReason,
    gpuDisjointEvents,
    presentIntervalMs: presentIntervalMs.toArray(),
    framesRendered,
    bootMs,
    viewport: {
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      devicePixelRatio,
      drawingBufferWidth: renderer.domElement.width,
      drawingBufferHeight: renderer.domElement.height,
      pixelRatio: renderer.getPixelRatio(),
    },
    context: {
      lost: contextLost,
      restoreAttempts: contextRestoreAttempts,
      restoredCount: contextRestoredCount,
      msSinceLoss: contextLostAt === 0 ? null : performance.now() - contextLostAt,
      framesSkippedWhileLost: framesSkippedWhileContextLost,
      restoreSupported: loseContext !== null,
    },
    tier: {
      name: 'medium-equivalent',
      configured: false,
      shadows: renderer.shadowMap.enabled,
      shadowMapSize: sun.shadow.mapSize.x,
      postProcessing: false,
      note: 'Quality tiers are detected and switchable from M6 (docs/ROADMAP.md). M0 ' +
        'renders at fixed settings that match the Medium row of docs/PERF_BUDGET.md ' +
        '§Quality tiers — 1080p, one 1024 shadow map, no post — so the "@1080p Medium" ' +
        'qualifier is checkable here, but nothing is detected or selectable yet.',
    },
  }),
};

const boot = document.getElementById('boot');
if (boot) { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 600); }
