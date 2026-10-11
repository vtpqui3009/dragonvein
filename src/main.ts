import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/**
 * A browser with no WebGL2 used to sit on the boot splash forever. `WebGLRenderer` throws
 * "Error creating WebGL context", nothing caught it, so the splash stayed at opacity 1,
 * the HUD read `FPS — DRAWS — TRIS —` and the only trace was a console throw the player
 * never sees. CLAUDE.md §0 names a weak Intel iGPU as the target, where a driver
 * blocklist or an enterprise 3D-API policy is an ordinary way to land here.
 *
 * The page already knows how to say a context it *had* has died; this is the same
 * courtesy for one that never existed.
 */
function failToBoot(reason: string): never {
  const boot = document.getElementById('boot');
  if (boot) {
    const line = boot.querySelector('p');
    if (line) line.textContent = reason;
    boot.style.opacity = '1';
  }
  const status = document.getElementById('hud-status');
  if (status) { status.textContent = 'NO WEBGL2 — CANNOT RENDER'; status.hidden = false; }
  throw new Error(reason);
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  failToBoot(
    'This browser could not create a WebGL2 context, so DRAGONVEIN cannot render. ' +
    'Check that hardware acceleration is on. ' +
    `(${e instanceof Error ? e.message : String(e)})`,
  );
}
/**
 * The one quality tier M0 can honestly offer, and why it exists this early.
 *
 * `docs/RUBRIC.md` P6 ("Potato tier holds 30 fps @720p") is live from M0 per
 * `docs/ROADMAP.md` §When each rubric line goes live, because the *measurement* needs
 * only a lower resolution and the shadow pass off — not M6's detection, switching and
 * persistence machinery, which is still M6's job.
 *
 * So: `?tier=potato` selects the Potato row of `docs/PERF_BUDGET.md` §Quality tiers —
 * 720p (pixel ratio pinned to 1 so the drawing buffer is the CSS size), no shadows, no
 * post. Post-processing does not exist yet, so that third clause is free here and will
 * stop being free at M6.
 *
 * Deliberately NOT what M6 builds: nothing is auto-detected from
 * `WEBGL_debug_renderer_info`, nothing is persisted, and there is no in-game switch. A
 * query parameter is enough for a gate to take a reproducible reading, and claiming more
 * would be claiming M6 is done.
 */
const POTATO = new URLSearchParams(location.search).get('tier') === 'potato';
renderer.setPixelRatio(POTATO ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !POTATO;
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
// Far plane 260, up from 190. At 190 an island 150 units out was 72% horizon colour,
// which turned a green deck tan (#ae965a) — the art-critic measured it 18.4 deltaE off the
// nearest bible swatch. Aerial perspective should read as distance, not as a different
// material, so the curve is stretched rather than removed.
scene.fog = new THREE.Fog(PALETTE.skyHorizon, 60, 260);

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
const sun = new THREE.DirectionalLight(0xfff1e2, 2.55);
/*
 * Why this light moved, and why it is the whole of the "no contact shadows" defect.
 *
 * The art-critic read the frame as shadowless and the obvious readings were all wrong:
 * `renderer.shadowMap.enabled` is on, `sun.castShadow` is on, and every scatter mesh sets
 * `castShadow`. A shadow map was being rendered and sampled every frame. It could not be
 * seen because of where the light was: (14, 9.5, 5.5) is azimuth 21.4 deg and the camera
 * sits at azimuth 50.7 deg, so the key was **29 deg off the camera axis**. A shadow is
 * cast directly away from the light, so at 29 deg every shadow in the scene lay behind
 * the object that cast it, hidden by that object. The comment this replaces asserted the
 * opposite — "the shadows still rake across open ground to the left" — and nothing had
 * ever measured it.
 *
 * The fix is geometry, not intensity — but it is not simply "move the key sideways".
 * Azimuth 340 was tried first and differenced against the same frame with
 * `renderer.shadowMap.enabled = false`, which isolates exactly the pixels the shadow pass
 * changes. 48 199 px changed, and the map showed every one of them on a *prop*: trees
 * shadowing each other, boulders shadowing bushes, and the deck itself untouched. The
 * reason is that the camera can only see the near half of the deck, and with the sun on
 * the near side too, everything up-sun of the ground in shot is empty air off the edge of
 * the island. There was nothing standing where it could cast into frame.
 *
 * So the key goes to azimuth 303 deg at 25 deg of elevation — the far side — which is
 * 96.9 deg off the camera axis (`node tools/art-probe.mjs` prints it). Shadows run toward
 * azimuth 123 deg, which is across the deck and *towards* the camera, so the casters that
 * throw them are the trees standing in the middle of the island rather than imaginary
 * ones past its rim. At 25 deg they are 2.1x the caster's height: a 2-unit conifer lays a
 * 4.3-unit shadow, about a third of the way across the deck.
 *
 * This is a side-back key, and it costs the camera-facing *vertical* slope its direct sun
 * (N.L goes to -0.12 on a camera-facing normal). That is the trade, and it is the right
 * one here: the deck is horizontal, so it keeps almost all of its key (N.L 0.44 -> 0.42)
 * and the island cannot read as the dark blob the previous comment feared — a lit deck
 * with dark trees standing on it is a lit island. The slopes that lose the sun are the
 * ones the cool fill at azimuth 141 deg and the warm rim behind the island are for, which
 * is what `docs/ART_BIBLE.md` §Lighting means by three lights doing the work.
 */
sun.position.set(8.18, 12.73, -9.75);
// Potato renders no shadow map at all, so the light must not ask for one either —
// `renderer.shadowMap.enabled = false` alone still leaves the pass set up.
sun.castShadow = !POTATO;
sun.shadow.mapSize.set(1024, 1024);   // the Medium tier in docs/PERF_BUDGET.md
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
// 16 isolated shadow-acne pixels survived the previous pair (-0.0007 / 0.022) on
// otherwise smooth lit faces, worst a 4-px dotted line down a cone face at (636,353).
// More normal bias and less depth bias: normal bias offsets along the surface normal, so
// it kills acne on curved instanced geometry without the peter-panning that more depth
// bias would cost under the contact shadows A3 depends on.
sun.shadow.bias = -0.00035;
// 0.018, down from 0.042. A normal bias is measured in world units and this map is
// 1024 texels over an 18-unit span — 0.0175 units a texel — so 0.042 was pushing the
// shadow 2.4 texels off the surface that casts it. That is peter-panning, and the gap it
// opens is exactly at the base of each object, which is the only place a *contact*
// shadow exists. It was invisible while the shadows themselves were hidden behind their
// casters; with the sun moved it would be the next defect. Acne is re-checked in the
// render rather than assumed: the bigger risk at 26 deg of elevation is the grazing
// angle, and that is what the depth bias above is for.
sun.shadow.normalBias = 0.018;
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
const fill = new THREE.DirectionalLight(0x7aa0ff, 0.70);   // ~20% of key, opposite side
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
// 1.05, up from 0.8. The cool fill reaches the island's *outside*, but the art-critic
// found 2698 px inside the island bbox at RGB sum < 30 and a shadowed canopy underside
// at (0,18,4): a directional fill does not cast into a closed canopy, and the hemisphere
// term is the only light that does. Raising it lifts the interior without flattening the
// key, because it is strongest exactly where the key is absent.
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x53608f, 0.72));

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
  uRimStrength: { value: 1.85 },
  /** Higher = tighter band at the silhouette. 2.6 keeps it an edge, not a glow. */
  uRimPower: { value: 3.5 },
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
           // Widened from (-0.45, 0.55): the critic sampled the island's sun-side edge and
           // correctly found no rim there, because the gate had cut it to zero. A real
           // backlight still wraps a little past the terminator, and a silhouette the
           // viewer can only see on one side is half a rim.
           float backlit = smoothstep( -0.7, 0.5, dot( rimN, normalize( uRimDir ) ) );
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

/**
 * Grass cap over a rock root, as **one** mesh with one material.
 *
 * It was four draw calls: a cylinder whose three geometry groups resolved to two
 * materials (so three calls) plus the cone (one), doubled by the shadow pass. Eight in
 * all for two shapes. Heap churn inside `three.WebGLRenderer.render` scales with draw
 * calls — about 2 kB a call, measured — and CI went over the 40 960 B/frame budget at 28
 * calls. docs/PERF_BUDGET.md §Heap churn says the way to pay for a bigger scene is fewer
 * draw calls, not a bigger number, so this is that.
 *
 * The three-value split the materials used to carry is baked into vertex colours
 * instead: grass on the cap's top face, rock on its skirt and on the whole root. The
 * hexes are the bible's, converted through `setHex(..., SRGBColorSpace)` so they land in
 * three's linear working space exactly as a material colour would have.
 */
const islandBody = (() => {
  const grass = new THREE.Color().setHex(PALETTE.foliageMid, THREE.SRGBColorSpace);
  const rock = new THREE.Color().setHex(PALETTE.rockMid, THREE.SRGBColorSpace);

  /** Paints every vertex of `geo` one colour, except the groups named in `grassGroups`. */
  const paint = (geo: THREE.BufferGeometry, grassGroups: number[]): void => {
    const pos = geo.attributes['position'];
    const index = geo.getIndex();
    if (!pos) throw new Error('island geometry has no position attribute');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = rock.r;
      colors[i * 3 + 1] = rock.g;
      colors[i * 3 + 2] = rock.b;
    }
    // By *group*, not by height. A cylinder's side ring shares its top vertices with the
    // cap, so colouring by `y >= TOP_Y` paints the top of the skirt green and three.js
    // interpolates that down the whole rock band — rendered, and the island came out a
    // green coin, which is the exact failure the rock band exists to prevent.
    if (index) {
      for (const g of geo.groups) {
        if (!grassGroups.includes(g.materialIndex ?? 0)) continue;
        for (let k = g.start; k < g.start + g.count; k++) {
          const v = index.getX(k);
          colors[v * 3] = grass.r;
          colors[v * 3 + 1] = grass.g;
          colors[v * 3 + 2] = grass.b;
        }
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };

  // CylinderGeometry groups: 0 side, 1 top cap, 2 bottom cap. Only the top is grass.
  const cap = new THREE.CylinderGeometry(TOP_RADIUS, TOP_RADIUS - 0.4, 1.1, 48);
  paint(cap, [1]);
  // 96 radial segments on the root, up from 48. The art-critic read three flat facets
  // across x 540-760 and scored A9 down for a faceted diamond where the concept has a
  // smooth cone; at 48 the facet width was about 4 px of a 1080p frame, which is the
  // scale that reads as flat. 96 costs 96 triangles against a 900 000 budget.
  const root = new THREE.ConeGeometry(TOP_RADIUS - 0.4, 6.5, 96);
  root.rotateX(Math.PI);
  root.translate(0, -3.25, 0);
  paint(root, []);

  const merged = mergeGeometries([cap, root], false);
  if (!merged) throw new Error('could not merge the island cap and root');
  cap.dispose();
  root.dispose();

  const mesh = new THREE.Mesh(merged, withRim(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97,
  })));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  island.add(mesh);
  return mesh;
})();
void islandBody;

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
const cCloudLit = new THREE.Color(0xffc49a);     // horizon light on a cloud top

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

/*
 * Open ground, which is a feature and not an absence.
 *
 * `docs/concept/03-island-scene.png` is much sparser than this build had become: a few
 * small trees and boulders on a broad green deck, with the cast shadows reading clearly
 * because there is somewhere for them to land. The density added for rubric A6 had
 * overshot into clutter — 44 trees, 76 boulders and 104 bushes on a 6-unit disc — and
 * clutter is what A3 was actually failing on once the light was moved: a contact shadow
 * on a surface already covered in props is just more dark pixels.
 *
 * `docs/ART_BIBLE.md` §Density asks that an island is "never bare *between* features",
 * which is a rule about the gaps, not a licence to leave no gaps. So the counts come down
 * and the clearing goes up, and ground cover — tufts, the high-frequency layer — stays
 * dense: grass is dressing, boulders are furniture.
 *
 * Where the glade goes is set by the sun, not by the camera. Shadows now run toward
 * azimuth 160 deg, so a glade placed up-sun of the forest has nothing standing in a
 * position to cast into it and comes out as evenly lit as the closed canopy did — which
 * is what the first attempt at this did, measurably. It sits at azimuth 78 deg instead,
 * far enough from the deck's +x edge that there is still forest between it and the sun.
 *
 * The trees keep clear of all of it; the boulders and bushes keep clear of its middle
 * (`CLEARING_INNER`) and may stand around its edge, so it reads as a glade rather than as
 * a stamped circle.
 */
const CLEARING: Spot = { x: 0.6, z: 2.9, r: 2.7 };
const CLEARING_INNER: Spot = { ...CLEARING, r: 2.3 };

/**
 * The glade's edge, jittered per prop.
 *
 * Keeping every boulder and bush outside one fixed radius drew exactly what it says: a
 * clean circular ring of props around the glade, which reads as a stamp rather than as a
 * place. Each sample gets its own exclusion radius between 0.6x and 1.35x instead, so the
 * boundary is ragged and some props stand well inside the glade while others keep their
 * distance. Same seeded rng, so the layout is still identical in every build.
 */
function softGlade(rng: () => number): Spot {
  return { ...CLEARING_INNER, r: CLEARING_INNER.r * (0.6 + rng() * 0.75) };
}

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
/*
 * Three tree archetypes, because one was the single heaviest mark against rubric A4.
 *
 * The art-critic isolated nine tree apexes, measured a cone half-angle of 14.6-22.8 deg
 * at 25 px below the apex, found three of them identical to the pixel, and wrote: "every
 * tree is the same two-tier cone... No broadleaf, no snag, no dead tree, no shrub-tree."
 * `docs/concept/03-island-scene.png` carries rounded broadleaves beside the conifers, so
 * this is a miss against the concept as well as against the rubric.
 *
 * A4's own note — "a beautiful single asset repeated 200 times is still a dead world" —
 * is the thing to answer, and the answer is not more instances of a better cone. So:
 *
 *   conifer    trunk + two stacked cones, the shape that was already here
 *   broadleaf  a taller bare trunk under two offset foliage blobs, as in the concept
 *   snag       a dead trunk, leaning, no canopy at all
 *
 * The mix is shuffled with the same seeded rng rather than assigned by index, so the
 * three do not come out in bands, and it is still identical in every build — rubric A5
 * needs two screenshots taken days apart to differ only by the island's rotation.
 *
 * Cost is one new draw call. The trunk mesh is shared by all three archetypes (a snag is
 * a trunk, a broadleaf has a trunk), so the only addition is the foliage blob; the
 * conifer's two cones keep their own meshes and their capacity drops to the conifer
 * count. `docs/ARCHITECTURE.md` §Render contract asks for one `InstancedMesh` per prop
 * type, which is what this is.
 */
const TREES = 24;
const CONIFERS = 13;
const BROADLEAVES = 8;
const SNAGS = 3;
const BLOBS_PER_BROADLEAF = 2;

const trunks = instanced(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 5), TREES, 0.95);
const canopies = instanced(new THREE.ConeGeometry(0.66, 1.5, 7), CONIFERS, 0.85);
const crowns = instanced(new THREE.ConeGeometry(0.45, 1.1, 7), CONIFERS, 0.8);
// Detail 1 is 80 faces. Under `flatShading` that reads as a faceted ball rather than a
// smooth one, which is the register the rest of the island is drawn in.
const foliage = instanced(
  new THREE.IcosahedronGeometry(1, 1), BROADLEAVES * BLOBS_PER_BROADLEAF, 0.88);
trunks.castShadow = true;
canopies.castShadow = true;
crowns.castShadow = true;
foliage.castShadow = true;
{
  const rng = makeRng(0x10a9_0a1c);

  /** The mix, shuffled in place so the archetypes scatter instead of banding. */
  const plan: ('conifer' | 'broadleaf' | 'snag')[] = [
    ...Array<'conifer'>(CONIFERS).fill('conifer'),
    ...Array<'broadleaf'>(BROADLEAVES).fill('broadleaf'),
    ...Array<'snag'>(SNAGS).fill('snag'),
  ];
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = plan[i] as typeof plan[number];
    plan[i] = plan[j] as typeof plan[number];
    plan[j] = swap;
  }

  let t = 0;      // trunks, shared by all three
  let c = 0;      // conifer canopies and crowns
  let f = 0;      // broadleaf foliage blobs
  for (const kind of plan) {
    if (kind === 'conifer') {
      /*
       * Tree height, which is a composition number and not a taste one.
       *
       * At `0.74 + rng * 0.95` a tree stood 1.85-4.2 units on a disc of radius 6 — up to
       * 0.70 of the island's own radius. The concept draws them at 0.26. With the camera
       * 17 deg above the deck, a 4-unit tree hides every bit of ground within 16 units
       * behind it, which is the whole island: there was no deck to see, so there was
       * nowhere for a shadow to be seen landing, and the canopy closed into the "one
       * undifferentiated green mass" rubric A1 was marked down for.
       */
      const h = 0.52 + rng() * 0.46;
      const spot = pick(rng, 0.3 + h * 0.13, 5.0, CLEARING);
      if (!spot) continue;
      const rotY = rng() * Math.PI * 2;
      const lean = (rng() - 0.5) * 0.06;
      const w = 0.82 + rng() * 0.3;
      place(trunks, t, spot.x, TOP_Y + 0.5 * h, spot.z, w, h, w, rotY, lean, lean);
      place(canopies, c, spot.x, TOP_Y + h * 1.25, spot.z, w, h, w, rotY, lean, lean);
      place(crowns, c, spot.x, TOP_Y + h * 1.95, spot.z, w, h, w, rotY, lean, lean);
      trunks.setColorAt(t, tint.copy(cShadow).lerp(cRock, 0.3 + rng() * 0.35));
      // Widened from (0.45..0.95) and (0.30..0.75). A1 lost marks for a canopy that
      // merges into one mass; two tones 0.1 apart in the same green do not separate at
      // 25% zoom, and the whole point of the second tier is that it should.
      canopies.setColorAt(c, tint.copy(cDark).lerp(cMid, 0.18 + rng() * 0.82));
      crowns.setColorAt(c, tint.copy(cMid).lerp(cLight, 0.15 + rng() * 0.8));
      t++; c++;
    } else if (kind === 'broadleaf') {
      // A bare trunk you can see under a rounded crown — the concept's tree, and the
      // archetype that does most to stop the skyline reading as a row of triangles.
      const h = 0.78 + rng() * 0.45;
      const blobR = 0.36 + rng() * 0.20;
      const spot = pick(rng, 0.26 + blobR * 0.4, 5.0, CLEARING);
      if (!spot) continue;
      const rotY = rng() * Math.PI * 2;
      const lean = (rng() - 0.5) * 0.09;
      place(trunks, t, spot.x, TOP_Y + 0.5 * h, spot.z,
        1.45, h, 1.45, rotY, lean, lean);
      trunks.setColorAt(t, tint.copy(cShadow).lerp(cRock, 0.45 + rng() * 0.4));
      t++;
      // Two blobs, the upper one smaller and offset, so the crown has a silhouette
      // rather than being a ball on a stick.
      for (let k = 0; k < BLOBS_PER_BROADLEAF; k++) {
        const r = blobR * (k === 0 ? 1 : 0.68 + rng() * 0.2);
        const a = rng() * Math.PI * 2;
        const off = k === 0 ? 0.10 * blobR : 0.42 * blobR;
        place(foliage, f,
          spot.x + Math.cos(a) * off,
          TOP_Y + h + blobR * (k === 0 ? 0.30 : 0.92),
          spot.z + Math.sin(a) * off,
          r, r * (0.78 + rng() * 0.22), r, rng() * Math.PI * 2);
        // Lighter and warmer than the conifers on purpose: two families of green give
        // the canopy an interior, which is what A1 was reading as absent.
        foliage.setColorAt(f, tint.copy(cMid).lerp(cLight, 0.35 + rng() * 0.6));
        f++;
      }
    } else {
      // A dead tree. Thinner, taller, leaning hard, and pale — a standing snag is grey,
      // not green, so it also breaks the colour field the critic measured as unimodal.
      const h = 1.0 + rng() * 0.6;
      const spot = pick(rng, 0.2, 5.0, CLEARING);
      if (!spot) continue;
      const lean = (rng() - 0.5) * 0.3;
      place(trunks, t, spot.x, TOP_Y + 0.5 * h, spot.z,
        0.72, h, 0.72, rng() * Math.PI * 2, lean, lean);
      trunks.setColorAt(t, tint.copy(cRock).lerp(cCloudLit, 0.2 + rng() * 0.35));
      t++;
    }
  }
  trunks.count = t;
  canopies.count = crowns.count = c;
  foliage.count = f;
}

// Scatter rocks — the island reads as rock under the grass, not as a green coin. The
// stepping stones ride in this mesh too: they are the same material at a different
// scale, and a second InstancedMesh for 22 flattened discs cost two draw calls (one
// opaque, one shadow) and about 4 kB a frame of churn for no visual difference that
// survives at 1080p.
const ROCKS = 44;
const rocks = instanced(new THREE.IcosahedronGeometry(0.3, 0), ROCKS + pathStones.length, 1.0);
rocks.castShadow = true;
{
  const rng = makeRng(0x5a4a_4001);
  let n = 0;
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.4 + rng() * 0.95;
    const spot = pick(rng, 0.13 + s * 0.12, 5.5, softGlade(rng));
    if (!spot) continue;
    place(rocks, n, spot.x, TOP_Y + s * 0.11, spot.z,
      s, s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.5),
      rng() * Math.PI * 2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
    rocks.setColorAt(n, tint.copy(cShadow).lerp(cRock, 0.45 + rng() * 0.55));
    n++;
  }
  // The path, from the reservations above: flattened hard so a faceted rock reads as a
  // trodden stone, and lighter than the scatter so the line of them is legible.
  for (const c of pathStones) {
    place(rocks, n, c.x, c.y, c.z, c.sx * 1.25, 0.22, c.sz * 1.25, c.rot, c.tiltX, c.tiltZ);
    rocks.setColorAt(n, tint.copy(cRock).lerp(cCloudLit, 0.2 + c.mix));
    n++;
  }
  rocks.count = n;
}

// Understory bushes — fills the mid frequency between trees and bare ground (rubric A6).
const BUSHES = 60;
const bushes = instanced(new THREE.SphereGeometry(0.34, 7, 5), BUSHES, 0.9);
bushes.castShadow = true;
{
  const rng = makeRng(0x3f8a_3302);
  let n = 0;
  for (let i = 0; i < BUSHES; i++) {
    const s = 0.5 + rng() * 0.7;
    const spot = pick(rng, 0.14 + s * 0.14, 5.6, softGlade(rng));
    if (!spot) continue;
    place(bushes, n, spot.x, TOP_Y + s * 0.19, spot.z,
      s, s * 0.62, s, rng() * Math.PI * 2);
    bushes.setColorAt(n, tint.copy(cDark).lerp(cLight, 0.2 + rng() * 0.55));
    n++;
  }
  bushes.count = n;
}

// Ground cover — the high frequency. Cheap, never casts a shadow, kills the bare plane.
const TUFTS = 210;
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

const cWater = new THREE.Color(0x2d92ba);        // ART_BIBLE §Palette, water near
const cWaterFar = new THREE.Color(0xa6f1f2);     // ART_BIBLE §Palette, water far

/*
 * Companion islands — nine of them, and the thing that matters is that they are not nine
 * copies of one prefab.
 *
 * The art-critic cropped all nine side by side and wrote: "Perfect circular disc of
 * constant thickness, identical inverted-cone keel half-angle, 4-7 single cones, a
 * handful of pebbles. No cliff, overhang, arch, water, structure, or colour difference
 * between any two. Scale and rotation are the only axes of variation in the whole sky."
 * That is rubric A4's complaint in one sentence, and A4 is the heaviest line in the
 * table.
 *
 * So each island now carries five axes beyond scale and rotation, all authored per
 * island rather than sampled, because the silhouette is the point and a silhouette is
 * worth deciding:
 *
 *   aspect   the deck is an ellipse, not a disc — sx and sz differ by up to 1.5x
 *   thick    deck thickness, which is what makes one read as a slab and one as a wafer
 *   keel     how far the root drops, from a stub to three times the deck's width
 *   keelR    how wide the root is. Low values make a spire: a thin rock needle under a
 *            small cap, which is a different object, not a different size of the same one
 *   tilt     a few degrees off level. Nothing in the sky hangs plumb
 *
 * The keel's offset is rotated by the same tilt as the deck, so a tilted island keeps its
 * root attached; offsetting straight down would open a gap of up to 0.45 units at these
 * drops, which is exactly the kind of seam rubric A8 fails on.
 */
type Companion = {
  x: number; y: number; z: number; s: number; trees: number;
  aspect: number; thick: number; keel: number; keelR: number;
  tiltX: number; tiltZ: number;
  /** Vertical bob, in world units, and how fast. 0 for the ones that should sit still. */
  bob: number; bobRate: number;
};
const COMPANIONS: Companion[] = [
  // Laid out by unprojecting the screen positions they have to land in, at six different
  // distances from the camera, because `docs/concept/03-island-scene.png` puts its
  // companions at different *depths* on purpose: that is what turns a backdrop into a
  // world. Guessing world coordinates for this put all of them in a vertical column over
  // the hero island, which reads as a stack, not as distance.
  { x: -3, y: 10, z: -28, s: 0.3, trees: 6,        // right of centre, nearest
    aspect: 1.35, thick: 1.0, keel: 1.0, keelR: 1.0, tiltX: 0.05, tiltZ: -0.07,
    bob: 0.5, bobRate: 0.00041 },
  { x: -1, y: 5, z: -45, s: 0.5, trees: 8,         // right, one step back: a spire
    aspect: 0.78, thick: 0.7, keel: 2.6, keelR: 0.3, tiltX: -0.04, tiltZ: 0.03,
    bob: 0.8, bobRate: 0.00033 },
  { x: -56, y: 8, z: -13, s: 0.62, trees: 9,       // upper left, a thick slab
    aspect: 1.15, thick: 1.8, keel: 0.55, keelR: 1.25, tiltX: 0.08, tiltZ: 0.05,
    bob: 0.7, bobRate: 0.00027 },
  { x: -54, y: 21, z: -63, s: 1.0, trees: 10,      // top centre, high and far
    aspect: 0.72, thick: 1.1, keel: 1.5, keelR: 0.85, tiltX: -0.09, tiltZ: 0.06,
    bob: 1.3, bobRate: 0.00021 },
  { x: 1, y: -10, z: -108, s: 1.2, trees: 8,       // far right, below the eyeline
    aspect: 1.5, thick: 0.75, keel: 0.8, keelR: 1.1, tiltX: 0.03, tiltZ: -0.1,
    bob: 1.6, bobRate: 0.00017 },
  { x: -120, y: -12, z: -25, s: 1.35, trees: 7,    // far left, deep in the haze: a spire
    aspect: 0.9, thick: 0.85, keel: 3.0, keelR: 0.26, tiltX: 0.06, tiltZ: 0.08,
    bob: 1.1, bobRate: 0.00024 },
  // Three below the eyeline. The art-critic ran a Sobel scan over the bottom bands and
  // got **zero** edge pixels across x0-540, y540-720 and x0-400, y420-540: the lower
  // quarter of the frame was a smooth painted gradient with nothing in it. A sky-world
  // has islands *below* you as well as above, and a silhouette is the cheapest form
  // there is.
  { x: -75, y: -41, z: -17, s: 1.1, trees: 6,      // low left
    aspect: 1.25, thick: 1.4, keel: 0.5, keelR: 1.3, tiltX: -0.07, tiltZ: -0.05,
    bob: 1.4, bobRate: 0.00019 },
  { x: 3, y: -35, z: -61, s: 1.0, trees: 6,        // low right
    aspect: 0.82, thick: 0.9, keel: 1.9, keelR: 0.55, tiltX: 0.1, tiltZ: 0.04,
    bob: 1.2, bobRate: 0.00029 },
  { x: -64, y: -54, z: -36, s: 1.1, trees: 5,      // bottom centre, near enough to stay green
    aspect: 1.4, thick: 1.2, keel: 1.2, keelR: 0.95, tiltX: -0.05, tiltZ: 0.09,
    bob: 1.5, bobRate: 0.00015 },
];

/*
 * Ambient motion, and why it is bought this way.
 *
 * The art-critic tracked the green-mask centroid of one satellite across all 182 frames
 * of the turntable and got (1072.71, 622.51) +/- 0.03 px for the whole 7.28 s, with the
 * two birds pixel-frozen beside it: "Nothing in the frame moves except the hero island's
 * own spin: no drift, no bob, no parallax, no cloud, no particle. A still place is not a
 * lived-in one."
 *
 * An island cannot simply be re-parented to a bobbing `Object3D`, because the deck, its
 * root, its trees, its boulders and its bushes are instances spread across meshes shared
 * by all nine — that sharing is what keeps the whole distance in 7 draw calls. Rebuilding
 * every instance matrix each frame would work and would cost a quaternion, a compose and
 * a 16-float write for about 300 instances, every frame, forever.
 *
 * It does not need to. A bob is a pure translation, and in a column-major 4x4 the
 * translation is elements 12, 13 and 14. So each instance's resting height is recorded
 * once at build time, and the frame loop writes one float per instance straight into
 * `instanceMatrix.array`. The rotation, the scale and the tilt are never recomputed.
 * ~300 float writes a frame, no allocation, which is what `docs/ARCHITECTURE.md` §Render
 * contract asks of anything inside `frame()`.
 */
/** One instanced mesh whose instances bob with the companion island they stand on. */
type Bobber = {
  mesh: THREE.InstancedMesh;
  /** Resting world y of each instance. */
  baseY: Float32Array;
  /** Which companion each instance belongs to. */
  owner: Uint8Array;
};
const bobbers: Bobber[] = [];
/** Phase offsets, so nine islands bob independently instead of in lockstep. */
const BOB_PHASE = COMPANIONS.map((_, i) => i * 1.97);

/** Records, for one filled mesh, where each instance rests and whose bob it follows. */
function registerBobber(
  mesh: THREE.InstancedMesh, baseY: number[], owner: number[],
): void {
  bobbers.push({
    mesh,
    baseY: Float32Array.from(baseY),
    owner: Uint8Array.from(owner),
  });
}

/** Scratch for the keel offset, rotated by the island's own tilt. Allocated once. */
const quatTilt = new THREE.Quaternion();
const eulerTilt = new THREE.Euler();
const vKeel = new THREE.Vector3();

{
  const caps = instanced(new THREE.CylinderGeometry(6, 5.6, 1.1, 36), COMPANIONS.length, 0.95, far);
  const cones = instanced(new THREE.ConeGeometry(5.6, 6.5, 36), COMPANIONS.length, 0.98, far);
  const treeTotal = COMPANIONS.reduce((t, c) => t + c.trees, 0);
  // The far deck gets the same three archetypes as the hero island (conifer cone,
  // rounded broadleaf, bare snag), for the same reason: A4 is about the repeat set in
  // the frame, and ~65 identical cones is a repeat set. The trunk mesh doubles as the
  // snag, exactly as it does on the hero island.
  const farTrees = instanced(new THREE.ConeGeometry(0.62, 1.9, 6), treeTotal, 0.85, far);
  const farFoliage = instanced(new THREE.IcosahedronGeometry(1, 1), treeTotal, 0.88, far);
  const farTrunks = instanced(new THREE.CylinderGeometry(0.08, 0.13, 1.0, 5), treeTotal, 0.95, far);

  const capY: number[] = [], capOwner: number[] = [];
  const coneY: number[] = [], coneOwner: number[] = [];
  const treeY: number[] = [], treeOwner: number[] = [];
  const folY: number[] = [], folOwner: number[] = [];
  const trunkY: number[] = [], trunkOwner: number[] = [];

  const rng = makeRng(0x15_1a4d);
  let t = 0, fo = 0, tr = 0;
  COMPANIONS.forEach((c, i) => {
    const rotY = rng() * Math.PI * 2;
    const deckY = c.y;
    place(caps, i, c.x, deckY, c.z,
      c.s * c.aspect, c.s * c.thick, c.s / c.aspect, rotY, c.tiltX, c.tiltZ);
    capY.push(deckY); capOwner.push(i);

    // The root, dropped along the island's own down-axis rather than along world down,
    // so the tilt does not shear it off the deck.
    const drop = 3.8 * c.s * c.keel;
    eulerTilt.set(c.tiltX, rotY, c.tiltZ);
    quatTilt.setFromEuler(eulerTilt);
    vKeel.set(0, -drop, 0).applyQuaternion(quatTilt);
    place(cones, i, c.x + vKeel.x, deckY + vKeel.y, c.z + vKeel.z,
      c.s * c.keelR * c.aspect, c.s * c.keel, c.s * c.keelR / c.aspect,
      rotY, c.tiltX + Math.PI, c.tiltZ);
    coneY.push(deckY + vKeel.y); coneOwner.push(i);

    // On the bible's foliage axis, not off it. The first version lerped `foliage mid`
    // toward `water far` (#a6f1f2) for a sense of distance; that path crosses green into
    // cyan, and the art-critic measured two decks at #5a967e — blue above red — 16.0 deltaE
    // off the nearest swatch, with a third at #ae965a. Distance is the fog's job, not the
    // albedo's, so these now sit between `foliage dark` and `foliage light` like every
    // other green in the frame. The range is wider than it was: "no colour difference
    // between any two" was one of A4's specific complaints.
    caps.setColorAt(i, tint.copy(cDark).lerp(cLight, 0.15 + rng() * 0.7));
    cones.setColorAt(i, tint.copy(cRock).lerp(cShadow, 0.1 + rng() * 0.7));

    for (let k = 0; k < c.trees; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 4.9 * c.s * Math.min(c.aspect, 1 / c.aspect);
      const h = (0.8 + rng() * 0.8) * c.s;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      const deck = deckY + 0.55 * c.s * c.thick;
      const kind = rng();
      if (kind < 0.55) {
        const y = deck + h * 0.95;
        place(farTrees, t, x, y, z, h, h, h, rng() * Math.PI * 2);
        farTrees.setColorAt(t, tint.copy(cDark).lerp(cMid, 0.2 + rng() * 0.7));
        treeY.push(y); treeOwner.push(i); t++;
      } else if (kind < 0.88) {
        const r = h * 0.5;
        const y = deck + h * 0.55 + r * 0.5;
        place(farFoliage, fo, x, y, z, r, r * 0.85, r, rng() * Math.PI * 2);
        farFoliage.setColorAt(fo, tint.copy(cMid).lerp(cLight, 0.25 + rng() * 0.6));
        folY.push(y); folOwner.push(i); fo++;
        const ty = deck + h * 0.28;
        place(farTrunks, tr, x, ty, z, h * 0.9, h * 0.55, h * 0.9, 0);
        farTrunks.setColorAt(tr, tint.copy(cShadow).lerp(cRock, 0.4 + rng() * 0.4));
        trunkY.push(ty); trunkOwner.push(i); tr++;
      } else {
        const ty = deck + h * 0.6;
        place(farTrunks, tr, x, ty, z, h * 0.55, h * 1.2, h * 0.55,
          rng() * Math.PI * 2, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
        farTrunks.setColorAt(tr, tint.copy(cRock).lerp(cCloudLit, 0.2 + rng() * 0.4));
        trunkY.push(ty); trunkOwner.push(i); tr++;
      }
    }
  });
  farTrees.count = t;
  farFoliage.count = fo;
  farTrunks.count = tr;

  // A6: the satellites were flat discs carrying identical cones — "a dressed island is
  // never bare between features" (ART_BIBLE §Density) applied to one island out of
  // nine. Three shared meshes dress all nine: boulders, low bushes and the grass tufts
  // that are the difference between dressed and merely furnished. The critic's crop of
  // the bottom-left satellite — "six cones and eight pebbles scattered on a
  // single-valued green disc, with no ground cover, no tufts, no rocks, no path, no
  // colour break" — is what the tufts answer. All three are instanced across every
  // island, so nine islands' worth of dressing costs three draw calls.
  const DRESS_PER = 30;
  const farRocks = instanced(
    new THREE.IcosahedronGeometry(0.3, 0), COMPANIONS.length * DRESS_PER, 1.0, far);
  const farBushes = instanced(
    new THREE.SphereGeometry(0.34, 6, 4), COMPANIONS.length * DRESS_PER, 0.9, far);
  const farTufts = instanced(
    new THREE.ConeGeometry(0.075, 0.36, 3), COMPANIONS.length * DRESS_PER, 0.9, far);
  const rockY: number[] = [], rockOwner: number[] = [];
  const bushY: number[] = [], bushOwner: number[] = [];
  const tuftY: number[] = [], tuftOwner: number[] = [];
  let r = 0, b = 0, g = 0;
  COMPANIONS.forEach((c, i) => {
    const deck = c.y + 0.55 * c.s * c.thick;
    for (let k = 0; k < DRESS_PER; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 5.2 * c.s;
      const x = c.x + Math.cos(a) * d * c.aspect;
      const z = c.z + Math.sin(a) * d / c.aspect;
      if (k % 5 === 0) {
        const sc = (0.5 + rng() * 0.9) * c.s;
        const y = deck + sc * 0.1;
        place(farRocks, r, x, y, z,
          sc, sc * (0.5 + rng() * 0.4), sc * (0.8 + rng() * 0.5),
          rng() * Math.PI * 2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
        farRocks.setColorAt(r, tint.copy(cShadow).lerp(cRock, 0.45 + rng() * 0.55));
        rockY.push(y); rockOwner.push(i); r++;
      } else if (k % 5 === 1 || k % 5 === 2) {
        const sc = (0.55 + rng() * 0.8) * c.s;
        const y = deck + sc * 0.18;
        place(farBushes, b, x, y, z, sc, sc * 0.62, sc, rng() * Math.PI * 2);
        farBushes.setColorAt(b, tint.copy(cDark).lerp(cLight, 0.2 + rng() * 0.6));
        bushY.push(y); bushOwner.push(i); b++;
      } else {
        const sc = (0.8 + rng() * 1.1) * c.s;
        const y = deck + sc * 0.17;
        place(farTufts, g, x, y, z, sc, sc, sc,
          rng() * Math.PI * 2, (rng() - 0.5) * 0.34, (rng() - 0.5) * 0.34);
        farTufts.setColorAt(g, tint.copy(cMid).lerp(cLight, 0.25 + rng() * 0.75));
        tuftY.push(y); tuftOwner.push(i); g++;
      }
    }
  });
  farRocks.count = r;
  farBushes.count = b;
  farTufts.count = g;

  registerBobber(caps, capY, capOwner);
  registerBobber(cones, coneY, coneOwner);
  registerBobber(farTrees, treeY, treeOwner);
  registerBobber(farFoliage, folY, folOwner);
  registerBobber(farTrunks, trunkY, trunkOwner);
  registerBobber(farRocks, rockY, rockOwner);
  registerBobber(farBushes, bushY, bushOwner);
  registerBobber(farTufts, tuftY, tuftOwner);
}

/*
 * The flock, in its own mesh so it can fly.
 *
 * It used to ride in `farTrees` as eleven extra instances, which cost nothing and also
 * meant it could never move without rebuilding the whole tree mesh. A bird is a cone
 * squashed flat along one axis and tilted — at 60 to 120 units that is enough — and
 * eleven of them wheeling slowly is the cheapest motion in the frame: eleven matrices a
 * frame, composed from the same scratch objects everything else uses.
 */
const BIRD_COUNT = 11;
const birds = instanced(new THREE.ConeGeometry(0.62, 1.9, 6), BIRD_COUNT, 0.85, far);
/** Orbit radius, height, angular speed, start angle and size for each bird. */
const birdOrbit = new Float32Array(BIRD_COUNT * 5);
{
  const rng = makeRng(0xb1_7d5);
  for (let i = 0; i < BIRD_COUNT; i++) {
    birdOrbit[i * 5] = 58 + rng() * 60;                      // radius
    birdOrbit[i * 5 + 1] = 9 + rng() * 15;                   // height
    birdOrbit[i * 5 + 2] = (rng() < 0.5 ? -1 : 1) * (0.000055 + rng() * 0.00009);
    birdOrbit[i * 5 + 3] = 1.6 + rng() * 2.4;                // start angle
    birdOrbit[i * 5 + 4] = 0.5 + rng() * 0.5;                // size
    birds.setColorAt(i, tint.copy(cShadow).lerp(cRock, rng() * 0.35));
  }
  birds.count = BIRD_COUNT;
}

/*
 * A drifting cloud sea was built here and taken out again, which is worth a note so the
 * next run does not rebuild it.
 *
 * The idea answered two defects at once: A6's "the lower 40% of the frame is empty" and
 * A2's off-bible haze band over a fifth of the frame. Fourteen flattened puffs went in,
 * and both attempts failed in the same way. Near the camera they rendered as pale
 * boulders filling a third of the frame; pushed out past 200 units, `scene.fog` resolved
 * them to almost exactly its own colour, `sky horizon` #ff9044, so they became flat
 * orange slabs — a *more* saturated version of the band they were meant to fix.
 *
 * The art-critic measured the sky at deltaE 0.0 on both the zenith and the horizon peak
 * and wrote that it "should not be touched". Anything large, distant and unlit in this
 * frame converges on the fog colour, so a cloud deck cannot be added without repainting
 * that band. The empty-lower-frame defect is a *minor* one and three satellites already
 * sit in that band; the ambient motion A6 actually blocks on is bought by the island bob
 * and the flock, neither of which touches the sky.
 */

/**
 * Moves everything that is not the hero island. Called once per frame; allocates nothing.
 *
 * The bob and the drift are written straight into the translation elements of each
 * instance matrix (12 = x, 13 = y, in column-major order), so no rotation or scale is
 * recomputed. The birds get a full `place()` because they actually travel.
 */
function updateFarMotion(nowMs: number): void {
  for (const bobber of bobbers) {
    const array = bobber.mesh.instanceMatrix.array;
    const count = bobber.mesh.count;
    for (let i = 0; i < count; i++) {
      const c = COMPANIONS[bobber.owner[i] as number] as Companion;
      array[i * 16 + 13] = (bobber.baseY[i] as number)
        + c.bob * Math.sin(nowMs * c.bobRate + (BOB_PHASE[bobber.owner[i] as number] as number));
    }
    bobber.mesh.instanceMatrix.needsUpdate = true;
  }

  for (let i = 0; i < BIRD_COUNT; i++) {
    const radius = birdOrbit[i * 5] as number;
    const height = birdOrbit[i * 5 + 1] as number;
    const speed = birdOrbit[i * 5 + 2] as number;
    const angle = (birdOrbit[i * 5 + 3] as number) + nowMs * speed;
    const size = birdOrbit[i * 5 + 4] as number;
    place(birds, i,
      Math.cos(angle) * radius,
      height + Math.sin(nowMs * 0.0006 + i) * 1.4,
      Math.sin(angle) * radius,
      size * 1.9, size * 0.16, size * 0.5,
      // Nose into the turn, so the dart points where it is going.
      -angle, Math.PI / 2, Math.sin(nowMs * 0.0011 + i) * 0.35);
  }
  birds.instanceMatrix.needsUpdate = true;
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
  // 0.85, up from 0.3. At 0.3 the cluster measured matte neutral-white (brightest
  // [219,235,234]) where docs/concept/03-island-scene.png shows emissive cyan shards.
  // There is no GI here so it cannot spill onto the grass, but it can at least be the
  // brightest, bluest thing on the island instead of looking like quartz.
  crystalMat.emissive = new THREE.Color(cWater).lerp(cWaterFar, 0.45).multiplyScalar(0.85);
  crystalMat.roughness = 0.25;
  crystalMat.metalness = 0.1;
  crystalShards.forEach((c, i) => {
    place(crystals, i, c.x, c.y, c.z, c.sx, c.sy, c.sz, c.rot, c.tiltX, c.tiltZ);
    crystals.setColorAt(i, tint.copy(cWater).lerp(cWaterFar, c.mix));
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

/**
 * When false the frame loop keeps running — rAF, the HUD timer, the rotation — but does
 * not call `renderer.render`. `gate:perf` uses it to measure the part of the heap churn
 * that is driven by *time* rather than by frames (the HUD's 250 ms repaint, the loop
 * itself) so it can subtract that before charging the rest per frame. Without the
 * separation a slow pass divides a fixed per-second cost by fewer frames and reads over
 * a budget it did not breach, which is exactly what happened on the CI runner.
 */
let renderingEnabled = true;

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
/** Frames drawn since the last context restore; see the HUD's `—` branch below. */
let framesSinceRestore = 1;
/**
 * rAF callbacks, drawn or not. `framesRendered` counts only frames that reached
 * `renderer.render`, so it cannot tell gate:perf how many times the loop body ran during
 * a rendering-paused baseline — and the loop body allocates whether or not it draws.
 */
let loopTicks = 0;
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
  // A dead canvas renders as the browser's broken-image glyph on white, which covers
  // the body behind it — a white viewport on a game whose palette is #070d14, with the
  // recovery message sitting on top of it. Hiding it puts the page's own background
  // back, so the overlay reads against the dark it was designed for.
  canvas.style.visibility = 'hidden';
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
  canvas.style.visibility = '';
  // `renderer.info.render` is zeroed by the restore and stays zero until the first
  // restored frame lands. The HUD repaints on a 250 ms timer, so without this it prints
  // a confident `DRAWS 0 TRIS 0` for one tick — a smaller lie than the stale `DRAWS 20`
  // it used to tell, but still a number the frame about to be drawn will not match.
  framesSinceRestore = 0;
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

  loopTicks++;
  framesSinceSample++;
  msSinceSample += frameMs;
  presentIntervalMs.push(frameMs);

  const startedAt = performance.now();
  resize();
  island.rotation.y = now * 0.00012;
  updateFarMotion(now);
  // The rim is gated in view space, so its direction has to be re-derived whenever the
  // camera moves. Allocation-free: two pre-allocated vectors, written in place.
  updateRimDirection();

  if (renderingEnabled) {
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
    framesSinceRestore++;
  }
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
  if (framesSinceRestore === 0) {
    // Restored, but nothing drawn through the new context yet. There is no measurement
    // to report, and `0` is not one.
    if (hud.fps) hud.fps.textContent = '—';
    if (hud.draws) hud.draws.textContent = '—';
    if (hud.tris) hud.tris.textContent = '—';
    framesSinceSample = 0;
    msSinceSample = 0;
    return;
  }
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
    /** null while the WebGL context is lost: there is no frame to report. */
    drawCalls: number | null; triangles: number | null;
    frameMs: number | null; cpuFrameMs: number | null;
    contextLost: boolean;
  }) | undefined;
  var __dragonveinPerf: {
    reset: () => void;
    /** Pause or resume `renderer.render` without stopping the loop. See `renderingEnabled`. */
    setRendering: (on: boolean) => void;
    /** Cheap progress poll. `read()` copies the whole window and would itself be a
     *  measurable allocation if the gate called it in a loop — which it must not, because
     *  the gate samples the heap through that same loop. */
    counts: () => {
      cpuFrameMs: number; gpuFrameMs: number; presentIntervalMs: number;
      framesRendered: number; loopTicks: number;
    };
    read: () => FrameCostReport;
  } | undefined;
}
/**
 * A dead context must not read as a healthy frame.
 *
 * The honesty fix for context loss reached the HUD and `__dragonveinPerf.read().context`
 * but not this accessor, which kept returning the last live frame's draw calls and frame
 * time forever — so a gate polling only `__dragonveinStats` would pass on a canvas that
 * had stopped drawing. `null` rather than `0`, for the same reason the HUD prints `—`:
 * zero draw calls is a claim about a frame that was rendered, and no frame was.
 * `tools/playtest.mjs` reads `drawCalls ?? 0 > 0` as its "is it drawing" probe, so this
 * makes that probe correct rather than merely cautious.
 */
globalThis.__dragonveinStats = () => ({
  drawCalls: contextLost ? null : renderer.info.render.calls,
  triangles: contextLost ? null : renderer.info.render.triangles,
  /** Present interval: rAF cadence, quantised to vsync. Kept for continuity. */
  frameMs: contextLost ? null : frameMs,
  /** What the frame actually cost the main thread. This is the one to budget against. */
  cpuFrameMs: contextLost ? null : lastCpuMs,
  /** So a reader that gets nulls can tell "dead" from "not started". */
  contextLost,
});

globalThis.__dragonveinPerf = {
  counts: () => ({
    cpuFrameMs: cpuFrameMs.count,
    gpuFrameMs: gpuFrameMs.count,
    presentIntervalMs: presentIntervalMs.count,
    framesRendered,
    loopTicks,
  }),
  setRendering: (on: boolean) => { renderingEnabled = on; },
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
      name: POTATO ? 'potato' : 'medium-equivalent',
      /** True only for Potato, which is explicitly selected rather than assumed. */
      configured: POTATO,
      selectedBy: POTATO ? 'query parameter ?tier=potato' : 'none — M0 default settings',
      shadows: renderer.shadowMap.enabled,
      shadowMapSize: renderer.shadowMap.enabled ? sun.shadow.mapSize.x : 0,
      postProcessing: false,
      targetFps: POTATO ? 30 : 60,
      note: POTATO
        ? 'Potato, and it matches the Potato row of docs/PERF_BUDGET.md §Quality tiers ' +
          'in full: 720p (pixel ratio pinned to 1, so check `viewport` — the drawing ' +
          'buffer must equal the CSS size), no shadows (the sun does not cast and the ' +
          'shadow pass is off, not merely hidden), no post. Post-processing does not ' +
          'exist at M0, so that clause costs nothing here and will cost something at ' +
          'M6. The target is 30 fps, i.e. a 33.3 ms frame, not 16.6. What this is NOT: ' +
          'M6\'s tier system. Nothing was detected from WEBGL_debug_renderer_info, ' +
          'nothing is persisted, and there is no in-game switch — this tier exists so ' +
          'RUBRIC.md P6 has a reproducible measurement at M0, which ROADMAP.md says it ' +
          'must.'
        : 'Medium MINUS POST, not Medium. Quality tiers are detected and switchable ' +
          'from M6 (docs/ROADMAP.md); M0 renders at fixed settings — 1080p, one 1024 ' +
          'shadow map — that match the Medium row of docs/PERF_BUDGET.md §Quality tiers ' +
          'except for bloom, which does not exist yet. §Per-frame budget allots ' +
          'post-processing 3.0 ms of the 16.6 ms, so any frame figure taken here is a ' +
          'FLOOR for Medium and a real-GPU verification row recorded at these settings ' +
          'must say so. The "@1080p" half of the qualifier is checkable from `viewport`; ' +
          'the "Medium" half is not yet true.',
    },
  }),
};

const boot = document.getElementById('boot');
if (boot) { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 600); }
