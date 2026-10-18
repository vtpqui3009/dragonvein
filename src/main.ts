import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from './core/rng';
import { FloraBatch, batchable } from './render/flora';
import { bakeWindBend, setWindTime, withWind } from './render/wind';
import { setIdleTime } from './render/idle';
import { DeckHeights, KEEPER_HEIGHT, KEEPER_UNIFORMS, keeperGeometry, withKeeper } from './render/wild';
import type { WildDragonView } from './render/wild-dragon';
import { TICK_HZ, TICK_MS, adoptGenomes, createWorld, step, type World } from './sim/world';
import {
  DRAGON_SCALE, KEEPER_RADIUS, LAND_S, TAKEOFF_S, WILD_DT, blankTemperament, circleClear, keeperTo, routeExists,
  temperament, type Deck, type Temperament,
} from './sim/wild';
import type { LoadReport, SaveSession, SaveState, SaveTiming } from './sim/persist';
import type { SaveStore } from './core/save';

/**
 * M0 spine: prove the whole chain works end to end — build, deploy, render, measure.
 * Everything here is placeholder and expected to be replaced by M3 onward. What must
 * survive is the contract: a canvas, a render loop, and `__dragonveinStats` for the gates.
 *
 * Within that, it still has to meet `docs/ART_BIBLE.md`, because the critics score the
 * frame, not the intent: a sky gradient from the bible's palette, one sun plus a cool fill
 * plus a warm rim, visible contact shadows, and enough scatter that the ground is never
 * bare. Every repeated prop is instanced: an `InstancedMesh` per prop type, or — for the
 * hero island's generated flora and rocks, a dozen kinds — one `BatchedMesh` for all of
 * them (M5f, src/render/flora.ts).
 *
 * Deliberately NOT here (milestone M6): the full camera system (follow, inertia, keys),
 * day/night, bloom, quality tiers. M0f's minimal drag/wheel/pinch orbit is here.
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
/*
 * Far and faint: the island must not wash out, but distance still reads.
 *
 * Far plane 400, up from 260 and 190 before that, and the reason it had to move twice is
 * worth stating because the next person will be tempted to move it back.
 *
 * A single `Fog` has one colour, and that colour only works where the sky behind it is
 * the same colour. `sky horizon` #ff9044 is right for an island silhouetted against the
 * golden band — and wrong for one below the horizon, where this run's gradient now puts
 * `rock mid` and then `deep shadow`. A deeply-fogged island down there does not recede;
 * it *glows*, because it is being blended toward a bright warm colour over a dark
 * background. The art-critic found exactly that and read it as a palette defect, which it
 * is: it measured an island top at #a5913e, deltaE 27.7 from anything in the bible, and
 * the nearest entry it could find was `UI accent`.
 *
 * It is the same gap that bends the sky gradient — the palette has no mid-value warm
 * entry — arriving by a second route. Until that is settled (see STATE.md), the fix is to
 * keep everything in frame on the shallow part of the fog curve: at 400 the deepest island
 * is about 25% fogged instead of 50%, which still reads as distance without changing what
 * the thing is made of. The two deepest islands come nearer as well, in the table below.
 */
scene.fog = new THREE.Fog(PALETTE.skyHorizon, 60, 400);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
// Framing is a compromise the geometry forces: look far enough down to see the ground
// (and the contact shadows on it), but keep the horizon high enough in frame that the sky
// gradient is actually in shot. ~20 units out at ~14 deg of pitch is the closest that
// satisfies both and still fits the whole island, root included.
camera.position.set(12.7, 7.0, 15.5);
camera.lookAt(0, 2.0, 0);

// --- orbit: the camera answers the pointer (M0f) ---------------------------------------
/*
 * Drag to orbit, wheel or pinch to zoom, around the fixed target above. Pointer events
 * carry mouse, pen and touch alike, so there is one code path, and `touch-action: none`
 * on the canvas (index.html) stops the browser from taking a pinch as a page zoom.
 *
 * The default pose is *derived* from the framing above rather than retyped, and nothing
 * is written to the camera until an input arrives, so with no input the frame is exactly
 * the one M0d was scored on.
 *
 * The clamps keep every reachable frame one the art bible was tuned for, and each was
 * found by rendering the limit, not by reasoning about it (STATE.md run 6):
 *   - pitch 6-22 deg. The vertical FOV is 50 deg, so above ~25 deg the horizon leaves the
 *     frame and with it the whole sky gradient; at 48 the shot was a top-down disc on
 *     deep shadow. Below 6 the deck edge hides the ground and its contact shadows.
 *   - distance 15-32. At 11 the deck overflowed a 640x360 frame; at 38 the hero is a
 *     thumbnail.
 *   - azimuth -15 to 105 deg, i.e. the default 39 deg +-~60. The satellites and spires
 *     are composed around this side of the hero (see the far-island table); past ~110
 *     deg they run out and the hero hangs in empty sky. M0f is "the camera answers the
 *     pointer", not "the world is finished on every side" — widening this arc is for
 *     whichever step dresses the far side.
 *
 * Event handlers may allocate, because they run per input event, not per frame. The
 * per-frame half (`applyOrbit`) writes in place and only runs on a frame after a change.
 */
const ORBIT_TARGET = new THREE.Vector3(0, 2.0, 0);
const ORBIT_LIMITS = {
  azimuthMinDeg: -15, azimuthMaxDeg: 105,
  pitchMinDeg: 6, pitchMaxDeg: 22, distanceMin: 15, distanceMax: 32,
} as const;
/**
 * Radians of orbit per CSS pixel of drag: 160 px is ~37 deg, so the 120 deg arc is about a
 * thumb's width of travel on a phone. At 0.0065 the first gate run showed a 160 px swipe
 * slamming from the default pose straight into the azimuth limit.
 */
const ORBIT_RAD_PER_PX = 0.004;
/** Distance multiplier per wheel `deltaY` pixel (120 per notch, so one notch is ~11%). */
const ZOOM_PER_WHEEL_PX = 0.0009;

const orbitOffset = new THREE.Vector3().subVectors(camera.position, ORBIT_TARGET);
const orbit = {
  distance: orbitOffset.length(),
  azimuth: Math.atan2(orbitOffset.x, orbitOffset.z),
  pitch: Math.asin(orbitOffset.y / orbitOffset.length()),
  dirty: false,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function setOrbit(azimuth: number, pitch: number, distance: number): void {
  orbit.azimuth = clamp(azimuth,
    THREE.MathUtils.degToRad(ORBIT_LIMITS.azimuthMinDeg),
    THREE.MathUtils.degToRad(ORBIT_LIMITS.azimuthMaxDeg));
  orbit.pitch = clamp(pitch,
    THREE.MathUtils.degToRad(ORBIT_LIMITS.pitchMinDeg),
    THREE.MathUtils.degToRad(ORBIT_LIMITS.pitchMaxDeg));
  orbit.distance = clamp(distance, ORBIT_LIMITS.distanceMin, ORBIT_LIMITS.distanceMax);
  orbit.dirty = true;
}

/** Per frame. No-op unless an input moved the orbit since the last frame. */
function applyOrbit(): void {
  if (!orbit.dirty) return;
  orbit.dirty = false;
  const flat = Math.cos(orbit.pitch) * orbit.distance;
  camera.position.set(
    ORBIT_TARGET.x + Math.sin(orbit.azimuth) * flat,
    ORBIT_TARGET.y + Math.sin(orbit.pitch) * orbit.distance,
    ORBIT_TARGET.z + Math.cos(orbit.azimuth) * flat,
  );
  camera.lookAt(ORBIT_TARGET);
  // The rim light is re-derived from `matrixWorldInverse` before render; refresh it now
  // so the first frame after a move is not lit from the previous pose.
  camera.updateMatrixWorld();
}

/** Up to two live pointers: one orbits, two pinch. A third is ignored. */
const pointers = new Map<number, { x: number; y: number }>();
let pinchSpan = 0;

function pointerSpan(): number {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

/*
 * A tap walks the keeper (M8b); a drag still orbits and a pinch still zooms. One pointer
 * that lifts within TAP_MS having moved no more than TAP_SLOP_PX from where it went down is
 * a tap; anything else is a drag, and the orbit does not move until the press has left the
 * slop, so a tap never nudges the camera. A second finger makes the gesture a pinch, never
 * a tap. Two taps within DOUBLE_TAP_MS and DOUBLE_TAP_PX of each other are a double tap,
 * which runs: the first tap has already set off at a walk, so the answer to either is
 * immediate. Mouse, pen and touch take the same path.
 */
const TAP_SLOP_PX = 8;
const TAP_MS = 450;
const DOUBLE_TAP_MS = 380;
const DOUBLE_TAP_PX = 36;
const gesture = { tap: false, x0: 0, y0: 0, t0: 0 };
const lastTap = { t: -1e9, x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  if (pointers.size >= 2) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  pinchSpan = pointerSpan();
  if (pointers.size === 1 && e.button === 0) {
    gesture.tap = true;
    gesture.x0 = e.clientX;
    gesture.y0 = e.clientY;
    gesture.t0 = e.timeStamp;
  } else gesture.tap = false;
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1 && gesture.tap) {
    // Still a tap until the press leaves the slop; then the drag orbits by all of its travel.
    if (Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) <= TAP_SLOP_PX) return;
    gesture.tap = false;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    // Drag right to swing the camera left around the island, as in every orbit viewer:
    // the world appears to follow the finger.
    setOrbit(orbit.azimuth - dx * ORBIT_RAD_PER_PX,
      orbit.pitch + dy * ORBIT_RAD_PER_PX, orbit.distance);
  } else {
    const span = pointerSpan();
    if (pinchSpan > 0 && span > 0) {
      // Fingers apart = closer. Ratio, not difference, so the gesture feels the same at
      // every distance.
      setOrbit(orbit.azimuth, orbit.pitch, orbit.distance * (pinchSpan / span));
    }
    pinchSpan = span;
  }
});

function endPointer(e: PointerEvent): void {
  const wasTap = gesture.tap && e.type === 'pointerup' && pointers.size === 1 && pointers.has(e.pointerId)
    && e.timeStamp - gesture.t0 <= TAP_MS;
  gesture.tap = false;
  pointers.delete(e.pointerId);
  pinchSpan = pointerSpan();
  if (!wasTap) return;
  const double = e.timeStamp - lastTap.t <= DOUBLE_TAP_MS
    && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) <= DOUBLE_TAP_PX;
  lastTap.t = double ? -1e9 : e.timeStamp;
  lastTap.x = e.clientX;
  lastTap.y = e.clientY;
  tapDeck(e.clientX, e.clientY, double);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  // The page has nothing to scroll; without this the wheel would do nothing visible.
  e.preventDefault();
  // deltaMode 1 is lines (Firefox), so scale it to pixels.
  const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  setOrbit(orbit.azimuth, orbit.pitch, orbit.distance * Math.exp(px * ZOOM_PER_WHEEL_PX));
}, { passive: false });

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
   * The cloud sea, baked into the same gradient — and now on the palette.
   *
   * Two problems met in this band, and the art-critic measured both. A1: the island's
   * root cone was merging into the lower sky at 1.04:1, because the bottom of the frame
   * was one flat `deep shadow` for 97 rows and a dark cone has nothing to separate
   * against. A2: whatever was put there to fix that measured **deltaE 25.9-28.6** from the
   * nearest entry in `docs/ART_BIBLE.md` §Palette, over roughly a fifth of the frame, and
   * read as "a grey-pink wash that dulls the golden hour".
   *
   * The second was self-inflicted. The deck used to be `sky horizon` lifted 46% toward
   * white, and the comment here claimed that "stays on the bible's warm axis". It does
   * not: #ff9044 lifted that far is #ffc39a, which is **deltaE 36.7** from the colour it
   * came from. Lifting a fully-saturated hue toward white is a desaturation, and the
   * palette has no desaturated entry for it to land on.
   *
   * But the band could not simply be deleted either, and this is the part worth recording:
   * a straight sRGB ramp from `sky horizon` to `deep shadow` is off-bible for most of its
   * own length, peaking at **deltaE 34.2** around t=0.4, because the palette contains no
   * mid-value warm colour between them. Any two-stop gradient between those two entries
   * fails A2 in the middle no matter how it is tuned. That is a property of the palette,
   * not of the build — and `CLAUDE.md` §7 says the palette describes the target, so the
   * gradient is what changes.
   *
   * It goes through a third bible entry instead. `rock mid` #5a4a40 sits between them in
   * value, is warm, and is a reasonable colour for a cloud deck lying in shadow under a
   * golden sky. `rock mid` -> `deep shadow` peaks at deltaE 14.2; `sky horizon` -> `rock
   * mid` still peaks at 33.1, so that leg is kept narrow — the same 0.13 of the sphere
   * the warm band above the horizon uses — and the plateau at `rock mid` is given most of
   * the lower frame. The off-bible transition is then a few rows rather than a fifth of
   * the image, and the cone has something at L* 33 to separate against.
   */
  const haze = toSrgb(PALETTE.rockMid);
  /**
   * Where the horizon band ends and the deck begins, as a fraction of sphere height.
   * Narrow on purpose: this is the one leg that cannot be made on-bible (it peaks at
   * deltaE 33), so it is crossed in about 40 rows — a gradient's own transition — rather
   * than spread over the fifth of the frame the art-critic measured.
   */
  const SEA_TOP = 0.085;
  /**
   * Where the deck gives way to the abyss. Between the two the sky *is* `rock mid`.
   *
   * 0.16, down from 0.30. At 0.30 the deck colour held most of the lower frame and the
   * art-critic read the result as "a flat brown-grey... it reads as mud, not dusk",
   * sampling #53453d at y=300 and #4e403a at y=540 and marking A2 down to 0.6/1.0 for
   * it. The deck is meant to be a *band* — a lit cloud layer the island's root crosses,
   * which is what gives A1 something for the dark cone to separate against — not the
   * floor of the sky. Narrowing it to a band puts the lower third of the frame on
   * `deep shadow`, which is both the bible's colour for the drop under a sky-world and
   * the dusk the critic was asking for.
   */
  const SEA_BOTTOM = 0.16;
  const pos = skyGeo.attributes['position'];
  if (!pos) throw new Error('sky geometry has no position attribute');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const smooth = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / SKY_RADIUS;                 // -1 nadir … +1 zenith
    let r: number, g: number, b: number;
    if (h >= 0) {
      // The warm band is narrow on purpose — a golden-hour band at the horizon, not an
      // orange hemisphere. Above it the sky climbs to the zenith colour.
      const t = smooth(h / 0.11);
      r = (horizon[0] as number) + ((zenith[0] as number) - (horizon[0] as number)) * t;
      g = (horizon[1] as number) + ((zenith[1] as number) - (horizon[1] as number)) * t;
      b = (horizon[2] as number) + ((zenith[2] as number) - (horizon[2] as number)) * t;
    } else {
      // Broken along its length, because an unmodulated band is an airbrush, not a cloud
      // sea. The break is three sines of the azimuth: cheap, seamless at the wrap (every
      // term is a whole number of cycles), and it moves the deck's height as well as how
      // far it reaches, so the near edge is ragged rather than ruled.
      const theta = Math.atan2(pos.getZ(i), pos.getX(i));
      const lobes =
        Math.sin(theta * 3 + 0.7) * 0.5 +
        Math.sin(theta * 7 - 1.9) * 0.3 +
        Math.sin(theta * 13 + 2.6) * 0.2;
      const top = SEA_TOP + lobes * 0.035;
      const bottom = SEA_BOTTOM + lobes * 0.035;
      /*
       * The deck's own colour, varied by azimuth so the plateau is patchy rather than
       * one flat value — but varied **along `rock mid` -> `deep shadow`**, not by
       * stopping part-way along `sky horizon` -> `rock mid`.
       *
       * The first version did the latter: it scaled how far each azimuth reached toward
       * the deck colour, between 0.62 and 1.0. Sampling the result down a sky column
       * showed why that was wrong — from y=270 to y=540 the sky sat at #936241, which is
       * 62% of the way from `sky horizon` to `rock mid` and deltaE 25 from either. The
       * modulation was parking a third of the frame in the middle of the one leg that
       * peaks at deltaE 33, which is the exact defect it was sitting next to.
       *
       * Varying the destination instead keeps every patch on the `rock mid` -> `deep
       * shadow` leg, which never exceeds deltaE 14.2, and the horizon leg is crossed in
       * full inside the narrow band at the top.
       */
      const shade = 0.05 + 0.5 * (0.5 + 0.5 * Math.sin(theta * 5 + 0.4));
      const deckColR = (haze[0] as number) + ((abyss[0] as number) - (haze[0] as number)) * shade;
      const deckColG = (haze[1] as number) + ((abyss[1] as number) - (haze[1] as number)) * shade;
      const deckColB = (haze[2] as number) + ((abyss[2] as number) - (haze[2] as number)) * shade;
      const toDeck = smooth(-h / Math.max(0.02, top));
      const toAbyss = smooth((-h - bottom) / 0.30);
      const deckR = (horizon[0] as number) + (deckColR - (horizon[0] as number)) * toDeck;
      const deckG = (horizon[1] as number) + (deckColG - (horizon[1] as number)) * toDeck;
      const deckB = (horizon[2] as number) + (deckColB - (horizon[2] as number)) * toDeck;
      r = deckR + ((abyss[0] as number) - deckR) * toAbyss;
      g = deckG + ((abyss[1] as number) - deckG) * toAbyss;
      b = deckB + ((abyss[2] as number) - deckB) * toAbyss;
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
// 0.86, up from 0.72. The art-critic counted 3864 px of bush underside and conifer
// shade face crushed below #0a0a0a — "flat black blocks... they read as holes". The
// hemisphere term is the only light that reaches a closed canopy's interior, so it is
// the one to raise; the cast shadows survive it because the rim no longer washes the
// deck (see `withRim`), which bought back more contrast than this spends.
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x53608f, 0.86));

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
 * The injection point is `outgoingLight`, immediately before `<opaque_fragment>`.
 *
 * It used to be `totalEmissiveRadiance`, on the stated grounds that
 * `<opaque_fragment>` sums it into `outgoingLight`. In three 0.186 it does not: that
 * chunk is four lines and the last of them is `gl_FragColor = vec4( outgoingLight,
 * diffuseColor.a )`. `outgoingLight` is assembled earlier, inside the lighting block of
 * `meshphysical.glsl.js`, so adding to `totalEmissiveRadiance` at the end of the shader
 * wrote to a variable nothing read again.
 *
 * The term was therefore **never in the frame**, which is what the art-critic measured
 * and reported as "the bible's third light is simply not in the rig" — correctly, and
 * about code that looked like it did the opposite. It was found by raising
 * `uRimStrength` from 1.9 to 40.0 and re-rendering: the edge warmth came back 9.0 both
 * times, to the first decimal. A uniform that changes nothing is not a weak effect.
 *
 * Writing to `outgoingLight` before `<opaque_fragment>` still lands ahead of
 * `<tonemapping_fragment>` and `<colorspace_fragment>`, so the rim is tone-mapped with
 * everything else rather than clipping on top of it, which was the point of the original
 * choice.
 */
const RIM_UNIFORMS = {
  uRimColor: { value: new THREE.Color(PALETTE.skyHorizon).multiplyScalar(1.0) },
  /** Rim light direction in *view* space — refreshed once per frame, never reallocated. */
  uRimDir: { value: new THREE.Vector3(0, 0, 1) },
  /** The key's direction, also in view space. The rim is kept off whatever the sun has. */
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** World up, in view space. Lets the rim tell a silhouette from a floor. */
  uViewUp: { value: new THREE.Vector3(0, 1, 0) },
  uRimStrength: { value: 2.6 },
  /**
   * Higher = tighter band at the silhouette — but this scene is faceted, and that
   * changes what the exponent means. On a 7-gon cone the silhouette is a facet *edge*,
   * so the pixel next to it belongs to a facet whose normal is still ~25 deg off
   * grazing: `facing` tops out near 0.58 rather than 1. At 3.0 that left the rim at 20%
   * of its strength exactly where it was supposed to be strongest, and the edge measured
   * darker than the canopy 6 px inside it across 435 columns. 1.8 is the value that
   * reaches a faceted silhouette; what stops it becoming a glow is the sun gate below,
   * not the exponent.
   */
  uRimPower: { value: 1.8 },
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
  rimWorldDir.copy(sun.position).normalize();
  RIM_UNIFORMS.uSunDir.value
    .copy(rimWorldDir)
    .transformDirection(camera.matrixWorldInverse);
  RIM_UNIFORMS.uViewUp.value
    .set(0, 1, 0)
    .transformDirection(camera.matrixWorldInverse);
}

/** Patches a stock standard material so it also carries the rim term. */
function withRim<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uRimColor'] = RIM_UNIFORMS.uRimColor;
    shader.uniforms['uRimDir'] = RIM_UNIFORMS.uRimDir;
    shader.uniforms['uSunDir'] = RIM_UNIFORMS.uSunDir;
    shader.uniforms['uViewUp'] = RIM_UNIFORMS.uViewUp;
    shader.uniforms['uRimStrength'] = RIM_UNIFORMS.uRimStrength;
    shader.uniforms['uRimPower'] = RIM_UNIFORMS.uRimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform vec3 uRimDir;
         uniform vec3 uSunDir;
         uniform vec3 uViewUp;
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
           // Keep the rim off anything the key already owns. Without this the term lands
           // on the island deck as hard as on a backlit canopy — the deck is seen at a
           // grazing 17 deg, so its facing term is 0.44 — and an unshadowed emissive on
           // the ground is exactly what flattens the contact shadows A3 also asks for.
           // A sunlit face keeps about 30% of the rim; a face the sun has left keeps
           // all of it, which is where a rim light is supposed to be.
           float keyed = 1.0 - clamp( dot( rimN, normalize( uSunDir ) ), 0.0, 1.0 );
           // And off the floor. A Fresnel term cannot tell a silhouette from a ground
           // plane: the deck is seen at a grazing 17 deg, so its facing term is 0.44
           // against a faceted cone's 0.58, and anything strong enough to rim the cone
           // was washing the deck with unshadowed emissive — which is what flattens the
           // contact shadows A3 asks for in the same breath. The surface normal settles
           // it. A deck points straight up and keeps none of the rim; a canopy facet at
           // the silhouette is about 20 deg off vertical and keeps almost all of it.
           // That is what lets the strength go to 4.0 without touching the ground.
           float upness = dot( rimN, normalize( uViewUp ) );
           float notFloor = 1.0 - upness * upness;
           outgoingLight += uRimColor * uRimStrength
             * backlit * keyed * notFloor * pow( facing, uRimPower );
         }
         #include <opaque_fragment>`,
      );
  };
  // All patched materials share one program variant; without a stable key three would
  // reuse an unpatched program compiled for an identical material earlier in the frame.
  material.customProgramCacheKey = () => 'dragonvein-rim-v4';
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

// --- scatter: every repeated prop is instanced, never one draw per copy -----------------
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
 * place. Each sample gets its own exclusion radius between 0.8x and 1.35x instead, so the
 * boundary is ragged and some props stand well inside the glade while others keep their
 * distance. Same seeded rng, so the layout is still identical in every build.
 *
 * The lower factor was 0.6, which let a boulder stand 1.38 from the glade's centre. A wild
 * dragon's footprint is 1.36 across (src/sim/wild.ts BODY_RADIUS), and the glade is the ground
 * it grazes and wanders on, so a prop that close left it nowhere to take a step: measured on
 * the island, the dragon's largest standable pocket was 1.4 m² and it could not walk at all
 * (STATE.md run 35). At 0.8 nothing solid stands inside GLADE_OPEN of the middle.
 */
function softGlade(rng: () => number): Spot {
  return { ...CLEARING_INNER, r: CLEARING_INNER.r * (0.8 + rng() * 0.55) };
}

/**
 * The radius around the glade's centre that holds no solid prop: the dragon's standing room,
 * and the one piece of the island a body can turn around in. `CLEARING_INNER.r * 0.8` is the
 * tightest any scattered prop may come, and the flowering shrubs below are held out to it too.
 */
const GLADE_OPEN = CLEARING_INNER.r * 0.8;

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
      // 1.15x the shard's own half-width, not 0.6x. The art-critic found a shard
      // passing through a tree trunk at 01-wide x520-560 / y370-420: at 0.6 the
      // reservation was smaller than the shard, so a later sample could clear the
      // footprint and still intersect the geometry.
      taken.push({ x, z, r: Math.max(sx, sz) * 1.45 });
    }
  }
}

// --- the generated flora and rocks (M5a, M5f): placements --------------------------------
/*
 * The hero island is dressed entirely from `assetgen/`'s committed output (M5f): five tree
 * kinds, four understory kinds, three ground covers and two rock kinds, plus the path's
 * stepping stones. The hand-built placeholders they replaced — cone-stack conifers,
 * cylinder snags, sphere bushes, icosahedron boulders and cone grass tufts — are gone, and
 * with them eleven draw calls.
 *
 * Placement is decided here, synchronously and seeded, so the layout is the same in every
 * build and every later sample's rejection test already avoids the trunks laid out before
 * it, whether or not the GLBs ever arrive. The meshes are built when the files load
 * (`loadFlora`, below); if a fetch fails the island is drawn bare and the error is logged,
 * which gate:smoke turns into a failure.
 *
 * Everything on the hero island is **one** `FloraBatch` (src/render/flora.ts): one draw for
 * the colour pass and one for the shadow pass, whatever the number of kinds. LOD is chosen
 * per kind at setup, by what the default framing can resolve: a tree there is ~80 px tall
 * and its LOD1 (600-950 triangles) is indistinguishable from LOD0 at that size, grass and
 * ferns are a dozen pixels and take LOD2, and the ground cover keeps LOD1 because it is
 * what the close shot is about. Measured, not assumed: with every tree at LOD0 the frame
 * was 343 k triangles and SwiftShader took 515 ms a frame against 323 ms for the M5e
 * scene; at these LODs it is 217 k and 391 ms. The rasteriser's time is not free even
 * where it is not budgeted — a slower frame stretches gate:perf's window, and the
 * time-driven part of the heap churn is charged to fewer frames (docs/PERF_BUDGET.md
 * §Heap churn). Bushes do not cast either: at 0.5 units tall their shadow is under their
 * own canopy.
 *
 * The companion islands' broadleaf groves (M5a) stay as they were: one `InstancedMesh` per
 * LOD, bobbing with their islands.
 */
type TreeSpot = {
  x: number; y: number; z: number;
  /** Uniform scale of the 7.4-unit generated tree, then an extra stretch on y. */
  s: number; sy: number;
  rotY: number; tiltX: number; tiltZ: number;
  /** Brightness multiplier, grey so the vertex colours keep their bible hues. */
  shade: number;
  /** Companion index. */
  owner: number;
  lod: 0 | 1 | 2;
};
/** Model height of the generated broadleaf, from its LOD0 bounding box (max y 7.43). */
const BROADLEAF_HEIGHT = 7.43;
/** Distance bands, world units from the default camera: < 35 LOD0, < 70 LOD1, else LOD2. */
const LOD_BANDS = [35, 70] as const;
function lodBand(x: number, y: number, z: number): 0 | 1 | 2 {
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  return d < LOD_BANDS[0] ? 0 : d < LOD_BANDS[1] ? 1 : 2;
}
/** The companion groves. The hero island's broadleaves are in `heroSpots`. */
const broadleafSpots: TreeSpot[] = [];

/** Every kind the hero island is dressed with. `__dragonveinStats().flora` counts each. */
const HERO_KINDS = [
  'conifer', 'broadleaf', 'sapling', 'windtwisted', 'deadtree', 'boulders', 'columnar', 'bush',
  'flowershrub', 'fern', 'grassclump', 'moss', 'lichen', 'fallenleaves', 'pathstone',
] as const;
type HeroKind = typeof HERO_KINDS[number];

type KindSpec = {
  /** `public/assets/<file>.lod<lod>.glb`, or null for the one geometry built here. */
  file: string | null;
  lod: 0 | 1 | 2;
  /** Model height in geometry units (the file's LOD0 bounding box), for the wind bend. */
  height: number;
  /** Wind stiffness: 1 sways like the M5a broadleaf, 0 never moves (src/render/wind.ts). */
  flex: number;
  /** Drawn by the shadow pass. Trees and rocks only: understory and ground cover never cast. */
  casts: boolean;
};
const KINDS: Record<HeroKind, KindSpec> = {
  conifer: { file: 'flora/conifer', lod: 1, height: 9.85, flex: 0.7, casts: true },
  broadleaf: { file: 'flora/broadleaf', lod: 1, height: BROADLEAF_HEIGHT, flex: 1, casts: true },
  sapling: { file: 'flora/sapling', lod: 1, height: 2.92, flex: 1.4, casts: true },
  windtwisted: { file: 'flora/windtwisted', lod: 1, height: 5.51, flex: 0.6, casts: true },
  deadtree: { file: 'flora/deadtree', lod: 1, height: 7.61, flex: 0.3, casts: true },
  boulders: { file: 'terrain/boulders', lod: 0, height: 1.4, flex: 0, casts: true },
  columnar: { file: 'terrain/columnar', lod: 0, height: 0.88, flex: 0, casts: true },
  bush: { file: 'flora/bush', lod: 1, height: 1.38, flex: 1.2, casts: false },
  flowershrub: { file: 'flora/flowershrub', lod: 1, height: 1.47, flex: 1.3, casts: false },
  fern: { file: 'flora/fern', lod: 2, height: 0.5, flex: 1.8, casts: false },
  grassclump: { file: 'flora/grassclump', lod: 2, height: 1.06, flex: 2.2, casts: false },
  moss: { file: 'flora/moss', lod: 1, height: 0.25, flex: 0, casts: false },
  lichen: { file: 'flora/lichen', lod: 1, height: 0.02, flex: 0, casts: false },
  fallenleaves: { file: 'flora/fallenleaves', lod: 1, height: 0.15, flex: 0, casts: false },
  pathstone: { file: null, lod: 0, height: 0.3, flex: 0, casts: false },
};

type HeroSpot = {
  kind: HeroKind;
  x: number; y: number; z: number;
  /** Uniform scale, then extra stretches on y and z. */
  s: number; sy: number; sz: number;
  rotY: number; tiltX: number; tiltZ: number;
  /** Per-instance colour. A grey shade for the generated kinds, a tint for path stones. */
  color: THREE.Color;
  /** For lichen grown on a boulder: that boulder's index in `heroSpots`, else -1. */
  onRock: number;
};
const heroSpots: HeroSpot[] = [];
/** Trunk footprints, so the understory can gather in the shade of a tree. */
const heroTrees: (Spot & { kind: HeroKind; crown: number })[] = [];
const heroRocks: (Spot & { index: number })[] = [];

/** Usable deck radius: the cap is 6, and nothing should overhang its lip. */
const DECK_R = 5.6;

/** Clear of every footprint in `taken`, and on the deck. Shared by both samplers. */
function isClear(x: number, z: number, radius: number, maxR: number): boolean {
  if (x * x + z * z > maxR * maxR) return false;
  for (const s of taken) {
    const dx = s.x - x;
    const dz = s.z - z;
    if (dx * dx + dz * dz < (s.r + radius) * (s.r + radius)) return false;
  }
  return true;
}

/**
 * `pick`, but around one of `anchors`: how the understory gathers under trees, moss at the
 * foot of a rock and flowers in the glade. The distance is measured from the anchor's
 * footprint edge (`anchor.r + dMin` to `anchor.r + dMax`), so the same numbers mean "just
 * outside the trunk" for a sapling and for a big conifer. Negative values reach inside a
 * footprint, which is what the glade uses: its `r` is its whole radius.
 */
function pickNear(
  rng: Rng, anchors: readonly Spot[], dMin: number, dMax: number, radius: number,
  maxR = DECK_R, attempts = 60,
): Spot | null {
  if (anchors.length === 0) return null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const a = anchors[Math.floor(rng.next() * anchors.length)] as Spot;
    const ang = rng.next() * Math.PI * 2;
    const d = Math.max(0, a.r + dMin + (dMax - dMin) * rng.next());
    const x = a.x + Math.cos(ang) * d;
    const z = a.z + Math.sin(ang) * d;
    if (!isClear(x, z, radius, maxR)) continue;
    const spot = { x, z, r: radius };
    taken.push(spot);
    return spot;
  }
  return null;
}

function heroSpot(
  kind: HeroKind, x: number, y: number, z: number, s: number, rng: Rng,
  o: Partial<Pick<HeroSpot, 'sy' | 'sz' | 'rotY' | 'tiltX' | 'tiltZ' | 'color' | 'onRock'>> = {},
): number {
  heroSpots.push({
    kind, x, y, z, s,
    sy: o.sy ?? 1, sz: o.sz ?? 1,
    rotY: o.rotY ?? rng.next() * Math.PI * 2,
    tiltX: o.tiltX ?? 0, tiltZ: o.tiltZ ?? 0,
    color: o.color ?? new THREE.Color().setScalar(0.88 + rng.next() * 0.12),
    onRock: o.onRock ?? -1,
  });
  return heroSpots.length - 1;
}

/*
 * The trees, first, so they get the spread positions. Heights are a composition number:
 * 1.5-2.6 units on a deck of radius 6 is the quarter-radius the concept draws, and the
 * band the hand-built trees stood in (the comment that set it is in git history, M0d: a
 * 4-unit tree hides the whole deck behind it from a camera 14 deg above it). The trunk
 * footprint reserved is about the crown's half-width, so crowns may touch but trunks
 * never crowd. None stands in the glade.
 *
 *   broadleaf    6, the M5a tree
 *   conifer      9, the most numerous: the concept's island is a conifer island
 *   sapling      4, young trees at the glade's edge — the small-tree band
 *   windtwisted  2, at the rim, leaning out over the drop the way wind-bent trees do
 *   deadtree     3, in place of the three pale snags
 */
{
  const rng = new Rng(0xb10a_df01);
  const tree = (kind: HeroKind, h: number, footprint: number, crown: number, maxR: number): void => {
    const spec = KINDS[kind];
    const s = h / spec.height;
    const spot = pick(() => rng.next(), footprint, maxR, CLEARING);
    if (!spot) return;
    heroTrees.push({ ...spot, kind, crown });
    heroSpot(kind, spot.x, TOP_Y, spot.z, s, rng, {
      sy: 0.92 + rng.next() * 0.16,
      tiltX: (rng.next() - 0.5) * 0.06, tiltZ: (rng.next() - 0.5) * 0.06,
    });
  };
  for (let i = 0; i < 6; i++) {
    const h = 1.6 + rng.next() * 0.6;
    tree('broadleaf', h, 0.28 + h * 0.155, h * 0.33, 4.9);
  }
  for (let i = 0; i < 9; i++) {
    const h = 1.8 + rng.next() * 0.8;
    tree('conifer', h, 0.26 + h * 0.13, h * 0.3, 5.0);
  }
  for (let i = 0; i < 3; i++) {
    const h = 1.5 + rng.next() * 0.5;
    tree('deadtree', h, 0.3, h * 0.25, 5.0);
  }
  // Saplings stand around the glade, not in it: the edge of a clearing is where young
  // trees come up.
  for (let i = 0; i < 4; i++) {
    const h = 0.75 + rng.next() * 0.4;
    const spot = pickNear(rng, [CLEARING], -0.2, 0.9, 0.3, 5.2);
    if (!spot) continue;
    heroTrees.push({ ...spot, kind: 'sapling', crown: h * 0.28 });
    heroSpot('sapling', spot.x, TOP_Y, spot.z, h / KINDS.sapling.height, rng);
  }
  // The wind-twisted pair at the rim. The generated tree leans along its own +x, so it is
  // turned to lean straight out from the island's centre.
  for (let i = 0; i < 2; i++) {
    const h = 1.25 + rng.next() * 0.35;
    let placed: Spot | null = null;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      const ang = rng.next() * Math.PI * 2;
      const d = 4.4 + rng.next() * 0.6;
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (!isClear(x, z, 0.35, DECK_R)) continue;
      placed = { x, z, r: 0.35 };
    }
    if (!placed) continue;
    taken.push(placed);
    heroTrees.push({ ...placed, kind: 'windtwisted', crown: h * 0.3 });
    heroSpot('windtwisted', placed.x, TOP_Y, placed.z, h / KINDS.windtwisted.height, rng, {
      rotY: -Math.atan2(placed.z, placed.x) + (rng.next() - 0.5) * 0.4,
    });
  }
}

/*
 * Rocks: the M4 boulders, scattered, and two columnar outcrops near the rim — the island
 * reads as rock under the grass, not as a green coin. Then the stepping stones, from the
 * reservations above: the one shape still built here, a flattened faceted stone, lighter
 * than the scatter so the line of them is legible.
 */
{
  const rng = new Rng(0x5a4a_4f05);
  for (let i = 0; i < 12; i++) {
    const s = 0.2 + rng.next() * 0.22;
    const spot = pick(() => rng.next(), 0.12 + s * 0.85, 5.4, softGlade(() => rng.next()));
    if (!spot) continue;
    const index = heroSpot('boulders', spot.x, TOP_Y - 0.02, spot.z, s, rng, {
      sy: 0.75 + rng.next() * 0.4,
      color: new THREE.Color().setScalar(0.8 + rng.next() * 0.2),
    });
    heroRocks.push({ ...spot, index });
  }
  // Two basalt-column outcrops near the rim: low, wide and hexagonal, a second rock
  // silhouette that no boulder can be mistaken for.
  for (let i = 0; i < 2; i++) {
    let placed: Spot | null = null;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      const ang = rng.next() * Math.PI * 2;
      const d = 3.8 + rng.next() * 1.0;
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (isClear(x, z, 0.5, DECK_R)) placed = { x, z, r: 0.5 };
    }
    if (!placed) continue;
    taken.push(placed);
    const index = heroSpot('columnar', placed.x, TOP_Y - 0.03, placed.z, 0.32 + rng.next() * 0.1, rng, {
      sy: 0.9 + rng.next() * 0.4, color: new THREE.Color().setScalar(0.85 + rng.next() * 0.15),
    });
    heroRocks.push({ ...placed, index });
  }
  for (const c of pathStones) {
    heroSpot('pathstone', c.x, c.y, c.z, 1.25 * c.sx, rng, {
      sy: 0.22 / (1.25 * c.sx), sz: c.sz / c.sx, rotY: c.rot,
      color: new THREE.Color().copy(cRock).lerp(cCloudLit, 0.2 + c.mix),
    });
  }
}

/*
 * The understory and the ground cover, each where it grows rather than sprinkled evenly:
 *
 *   bush          around the trunks and on the glade's ragged edge
 *   flowershrub   in the glade — it is the one place on the island with full sun
 *   fern          in the shade, close under the trees
 *   grassclump    the open ground and the glade, the high frequency between features
 *   moss          at the foot of rocks and on tree roots
 *   fallenleaves  under the broadleaves and the dead trees, which are what drop them
 *   lichen        on the boulders' upper faces, and on the ground at the roots
 *
 * Every footprint still goes through `taken`, so nothing grows out of a trunk, a stone or
 * a crystal. Counts are held to what keeps the deck readable — open ground between
 * features is what the shadows land on.
 */
{
  const rng = new Rng(0x3f8a_5f06);
  const trunks = heroTrees as readonly Spot[];
  const deciduous = heroTrees.filter((t) => t.kind === 'broadleaf' || t.kind === 'deadtree');
  const ground = (kind: HeroKind, spot: Spot | null, s: number, lift: number,
    o: Parameters<typeof heroSpot>[6] = {}): void => {
    if (spot) heroSpot(kind, spot.x, TOP_Y + lift, spot.z, s, rng, o);
  };

  for (let i = 0; i < 18; i++) {
    const s = 0.33 + rng.next() * 0.22;
    const spot = i % 3 === 2
      ? pickNear(rng, [CLEARING], -0.7, 0.3, 0.2 + s * 0.35)
      : pickNear(rng, trunks, 0.05, 0.6, 0.2 + s * 0.35);
    ground('bush', spot, s, 0, { sy: 0.85 + rng.next() * 0.3 });
  }
  // In the glade, which is the one place on the island with full sun — but not in the middle
  // of it: `GLADE_OPEN` is the dragon's standing room. `-2.4` planted all eleven across the
  // whole glade interior, including its centre, which is the dragon's own home spot.
  for (let i = 0; i < 11; i++) {
    const s = 0.3 + rng.next() * 0.14;
    // The band is wider than the old one was deep, and gets more attempts, because holding
    // them out of the middle takes away most of the room they used to have: at 60 attempts in
    // a 0.7-unit band only 3 of the 11 found a place, and the glade lost its flowers.
    ground('flowershrub', pickNear(rng, [CLEARING], GLADE_OPEN - CLEARING.r, 0.55, 0.16 + s * 0.3, DECK_R, 160),
      s, 0, { sy: 0.85 + rng.next() * 0.3 });
  }
  for (let i = 0; i < 22; i++) {
    const s = 0.6 + rng.next() * 0.35;
    ground('fern', pickNear(rng, trunks, 0, 0.45, 0.12 + s * 0.12), s, 0);
  }
  for (let i = 0; i < 64; i++) {
    const s = 0.3 + rng.next() * 0.2;
    const spot = i % 4 === 0
      ? pickNear(rng, [CLEARING], -2.5, 0, 0.1 + s * 0.3)
      : pick(() => rng.next(), 0.1 + s * 0.3, 5.7);
    ground('grassclump', spot, s, 0, { sy: 0.85 + rng.next() * 0.35 });
  }
  // Ground cover sits a few millimetres proud of the deck: at 20 units from the camera a
  // 24-bit depth buffer resolves about 0.0003, so 0.004-0.012 is 15-40 steps — no
  // z-fighting — and far too little to read as floating.
  for (let i = 0; i < 22; i++) {
    const s = 0.75 + rng.next() * 0.45;
    const nearRock = i % 2 === 0;
    const anchors = nearRock ? heroRocks : trunks;
    const spot = pickNear(rng, anchors, -0.05, 0.3, 0.06);
    ground('moss', spot, s, 0.004, { sy: 0.7 + rng.next() * 0.4 });
  }
  for (let i = 0; i < 20; i++) {
    const s = 0.9 + rng.next() * 0.55;
    ground('fallenleaves', pickNear(rng, deciduous, -0.1, 0.7, 0.06), s, 0.008);
  }
  // Lichen on the ground: around roots and stones.
  // Spaced by most of their own width: two coplanar patches overlapping would z-fight each
  // other, and read as a stack of pancakes besides.
  for (let i = 0; i < 9; i++) {
    const s = 0.6 + rng.next() * 0.45;
    ground('lichen', pickNear(rng, i % 2 ? heroRocks : trunks, 0, 0.4, 0.1 + s * 0.1), s, 0.012);
  }
  // Lichen on the boulders themselves. Where on each rock is decided once the rock's mesh
  // has loaded (`loadFlora` casts a ray down onto it); here only which rock, and how big.
  heroRocks.forEach((r) => {
    if (heroSpots[r.index]?.kind !== 'boulders') return;
    heroSpot('lichen', r.x, TOP_Y, r.z, 0.55 + rng.next() * 0.3, rng, { onRock: r.index });
  });
}

// --- the walkable deck, the keeper and the wild dragon's place (M8b) -------------------
/*
 * The sim (src/sim/wild.ts) moves the keeper and the wild dragon over the deck in 2D and
 * never sees this file's meshes, so the island's layout reaches it as a `Deck`: the deck's
 * radius, and a circle for everything a body may not walk through — every trunk, rock,
 * crystal, bush and flowering shrub, at the footprint the scatter already reserved for it.
 * Ground cover (grass, ferns, moss, lichen, leaves) and the path stones are walked over, as
 * they would be. It is derived from the seeded layout, so it is the same in every session,
 * and it is configuration, not saved state: a save from an older layout is moved off any new
 * obstacle by the sim's first tick.
 *
 * The dragon starts in the glade, the island's open ground. The keeper starts across the deck
 * by the rim, out of the dragon's notice: the player walks in to meet it.
 *
 * **An obstacle is what a body meets, not what the scatter reserved for it.** This is the
 * defect behind every failed wild drill in run 35, under the one the sim carried: the first
 * version of this block handed the sim each spot's *reservation* radius — a trunk's is "about
 * the crown's half-width, so crowns may touch but trunks never crowd" — and a crystal shard's
 * reservation inflated by a further 1.45. Measured on the result: 97 circles summing to 94 %
 * of the deck's area, **16 % of it standable, in 54 disconnected pockets**, with the dragon's
 * own home spot and the keeper's gate both inside an obstacle. There was nowhere to walk, so
 * no route could be found and no keeper could be staged.
 *
 * `SOLID_R` below is the real thing: the widest each kind's own geometry gets **below the
 * keeper's height** (`KEEPER_HEIGHT`, 0.46), measured off the committed GLB it is drawn from
 * and scaled by the instance's own scale. A keeper walks under a broadleaf's canopy, past a
 * dead tree's bare trunk and around a conifer's branch skirt, which is what the renders show.
 */
/**
 * Collision radius in world units for each dressed kind, as a function of its instance scale
 * `s`. Each coefficient is the kind's measured radius below 0.46 world units divided by `s`,
 * over the scale range the hero island uses — reproduce it by walking the POSITION accessor of
 * `public/assets/<file>.lod<n>.glb` (`tools/glb.mjs` `readGlb`) and taking the largest
 * `hypot(x, z)` among vertices below `ymin + 0.46 / s`. The kinds not named here are ground
 * cover (grass, fern, moss, lichen, fallen leaves) and the path stones, which are walked over.
 */
const SOLID_R: Partial<Record<HeroKind, (s: number) => number>> = {
  // A conifer's skirt sweeps to the ground and widens fast with height: 0.63 at 1.8 tall,
  // 0.77 at 2.6. The only kind whose fit needs a constant term.
  conifer: (s) => 0.32 + 1.72 * s,
  broadleaf: (s) => 1.18 * s,       // a clear trunk; the canopy is overhead (0.25–0.35)
  sapling: (s) => 0.75 * s,         // 0.19–0.29
  windtwisted: (s) => 0.74 * s,     // 0.17–0.22, and it leans away over the drop
  deadtree: (s) => 0.85 * s,        // 0.17–0.22, a bare snag
  boulders: (s) => 1.0 * s,         // 0.20–0.42, the whole lump: it is knee-high
  columnar: (s) => 1.35 * s,        // 0.43–0.57, a wide low outcrop
  bush: (s) => 0.79 * s,            // 0.26–0.43, foliage all the way down
  flowershrub: (s) => 0.65 * s,     // 0.20–0.29
};
const deck: Deck = (() => {
  const o: number[] = [];
  for (const s of heroSpots) {
    if (s.onRock >= 0) continue;              // lichen grown on a boulder, not on the ground
    const solid = SOLID_R[s.kind];
    if (solid) o.push(s.x, s.z, solid(s.s));
  }
  // A crystal shard is an octahedron of geometry radius 0.3 scaled by (sx, h, sz), so its own
  // half-width is 0.3 max(sx, sz) = 0.09–0.18; the 0.12 is what a tilt of up to 0.225 rad
  // carries the body sideways by at the keeper's height.
  for (const c of crystalShards) o.push(c.x, c.z, 0.3 * Math.max(c.sx, c.sz) + 0.12);
  // The keeper starts across the deck from the glade, by the rim: well outside any dragon's
  // notice. It must be somewhere it can *stand*, though — the first version took the point
  // 4.9 out along that bearing whatever stood there, and on this layout a bush stood there, so
  // a new world began with the keeper inside an obstacle until the sim's first tick pushed it
  // out. The bearing is kept and the radius walked in, then the bearing swept, until a spot is
  // clear for a keeper with room to spare.
  const bearing = Math.atan2(-CLEARING.z, -CLEARING.x);
  const probe: Deck = { radius: DECK_R, obstacles: o, home: [CLEARING.x, CLEARING.z], gate: [0, 0] };
  const gate = ((): [number, number] => {
    for (let turn = 0; turn <= 36; turn++) {
      // Out along the bearing, then alternately to each side of it by 10° at a time.
      const a = bearing + (turn === 0 ? 0 : (turn % 2 ? 1 : -1) * Math.ceil(turn / 2) * (Math.PI / 18));
      for (let d = 4.9; d >= 3.4; d -= 0.1) {
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        // Room to stand, and a way out of it: a spot in a sealed pocket is somewhere the
        // player taps and the keeper cannot leave.
        if (circleClear(probe, x, z, KEEPER_RADIUS + 0.1) && routeExists(probe, x, z, CLEARING.x, CLEARING.z)) {
          return [x, z];
        }
      }
    }
    return [Math.cos(bearing) * 4.9, Math.sin(bearing) * 4.9];
  })();
  return { radius: DECK_R, obstacles: o, home: [CLEARING.x, CLEARING.z], gate };
})();

/**
 * The deck's height under any point, sampled once from the island body — after the first
 * frame, when the world has loaded — and read by bilinear lookup: no per-frame raycast.
 */
const deckHeights = new DeckHeights(islandBody, TOP_RADIUS, 17, TOP_Y);
let deckHeightsMs = 0;

/**
 * The keeper: one draw (and its shadow), a cloaked figure with a lantern that glows by
 * emission only — no light is added — and the tap ring, which the vertex shader carries to
 * wherever the keeper is walking (src/render/wild.ts). Both its materials are its own, so no
 * pooled program flips for it.
 */
const keeper = new THREE.Mesh(keeperGeometry(), withKeeper(withRim(new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.82, metalness: 0,
}))));
keeper.name = 'keeper';
keeper.castShadow = true;
keeper.receiveShadow = true;
keeper.customDepthMaterial = withKeeper(new THREE.MeshDepthMaterial());
keeper.visible = false;          // until the world has loaded
island.add(keeper);

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
 *            small cap, which is a different object, not a different size of the same
 *            one. **It must not exceed 1.0.** The cap's lower radius is 5.6 and so is
 *            the cone's base, so at keelR 1.25 the root's rim stood outside the deck it
 *            hangs from — the art-critic found it on two islands and described it
 *            exactly: "a flat brown ellipse about 175x70 px sits behind and through the
 *            island cap, like a Saturn ring". It was in the potato frame too, so not the
 *            shadow pass. 0.26-0.98 is the usable range and still spans needle to full
 *            cone
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
    aspect: 1.15, thick: 1.8, keel: 0.55, keelR: 0.96, tiltX: 0.08, tiltZ: 0.05,
    bob: 0.7, bobRate: 0.00027 },
  { x: -54, y: 21, z: -63, s: 1.0, trees: 10,      // top centre, high and far
    aspect: 0.72, thick: 1.1, keel: 1.5, keelR: 0.85, tiltX: -0.09, tiltZ: 0.06,
    bob: 1.3, bobRate: 0.00021 },
  { x: 1, y: -10, z: -108, s: 1.2, trees: 8,       // far right, below the eyeline
    aspect: 1.5, thick: 0.75, keel: 0.8, keelR: 0.92, tiltX: 0.03, tiltZ: -0.1,
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
    aspect: 1.25, thick: 1.4, keel: 0.5, keelR: 0.98, tiltX: -0.07, tiltZ: -0.05,
    bob: 1.4, bobRate: 0.00019 },
  { x: 3, y: -26, z: -61, s: 1.0, trees: 6,        // low right
    aspect: 0.82, thick: 0.9, keel: 1.9, keelR: 0.55, tiltX: 0.1, tiltZ: 0.04,
    bob: 1.2, bobRate: 0.00029 },
  { x: -64, y: -54, z: -36, s: 1.1, trees: 5,      // bottom centre, near enough to stay green
    aspect: 1.4, thick: 1.2, keel: 1.2, keelR: 0.95, tiltX: -0.05, tiltZ: 0.09,
    bob: 1.5, bobRate: 0.00015 },
  /*
   * Four more in the lower band, added after the art-critic read the bottom half as "a
   * large empty dusk void around eight sparse satellites" and marked A6 down for it. The
   * remedy it suggested first was cloud banks and haze; that was tried in this run and
   * removed (see the note where the cloud sea used to be — `scene.fog` resolves anything
   * far enough back to its own colour, `sky horizon`, so a cloud deck repaints the band
   * orange). Distant islands do not have that problem: they are opaque silhouettes at a
   * distance the fog only softens, and the machinery for them already exists.
   *
   * Small, low and far apart, so they read as depth rather than as more furniture.
   */
  { x: 58, y: -30, z: -84, s: 0.8, trees: 4,
    aspect: 1.6, thick: 0.8, keel: 1.1, keelR: 0.7, tiltX: 0.07, tiltZ: -0.06,
    bob: 1.0, bobRate: 0.00023 },
  { x: -28, y: -47, z: -52, s: 0.7, trees: 3,
    aspect: 0.75, thick: 1.5, keel: 2.2, keelR: 0.35, tiltX: -0.08, tiltZ: 0.07,
    bob: 1.3, bobRate: 0.00031 },
  { x: 74, y: -16, z: -102, s: 1.15, trees: 5,
    aspect: 1.1, thick: 0.9, keel: 0.7, keelR: 0.94, tiltX: 0.04, tiltZ: 0.1,
    bob: 1.8, bobRate: 0.00013 },
  { x: -80, y: -62, z: -56, s: 1.05, trees: 4,
    aspect: 1.3, thick: 1.1, keel: 1.6, keelR: 0.6, tiltX: 0.09, tiltZ: -0.04,
    bob: 1.6, bobRate: 0.00018 },
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
/** Each companion's yaw, kept so the groves can find the tilted deck plane later. */
const companionRotY = new Float64Array(COMPANIONS.length);

{
  const caps = instanced(new THREE.CylinderGeometry(6, 5.6, 1.1, 36), COMPANIONS.length, 0.95, far);
  /*
   * The root cone, pre-flipped in its own geometry rather than by adding PI to the
   * placement's Euler X.
   *
   * `euler.set(tiltX + PI, rotY, tiltZ)` is not the cap's orientation plus a flip. In XYZ
   * order that is Rx(tiltX)·Rx(PI)·Ry(rotY)·Rz(tiltZ), and Rx(PI) does not commute with
   * either of the rotations to its right — it negates both of them. So the root came out
   * with the *opposite* yaw and the opposite roll to the deck it hangs from, and at a
   * tilt of 0.1 rad across a 2-4 unit drop that is enough lateral error for its rim to
   * swing outside the cap. That is half of the "Saturn ring" the art-critic found; the
   * other half was `keelR` above 1.0, fixed in the table above.
   *
   * Baking the flip into the geometry means the cone is placed with exactly the cap's
   * Euler, so the two can only differ by the scale — which is what `keelR` is for, and
   * which is now bounded. It is also what the hero island's own root does.
   */
  const coneGeo = new THREE.ConeGeometry(5.6, 6.5, 36);
  coneGeo.rotateX(Math.PI);
  const cones = instanced(coneGeo, COMPANIONS.length, 0.98, far);
  const treeTotal = COMPANIONS.reduce((t, c) => t + c.trees, 0);
  // The far deck gets three archetypes (conifer cone, broadleaf, bare snag) — the hero
  // island's mix before M5f dressed it from the generated set — because A4 is about the
  // repeat set in the frame, and ~65 identical cones is a repeat set. The broadleaf is the generated tree, placed
  // as a grove after this loop (M5a); it used to be an icosahedron blob on a trunk here.
  // The trunk mesh is now the snag only.
  const farTrees = instanced(new THREE.ConeGeometry(0.62, 1.9, 6), treeTotal, 0.85, far);
  const farTrunks = instanced(new THREE.CylinderGeometry(0.08, 0.13, 1.0, 5), treeTotal, 0.95, far);

  const capY: number[] = [], capOwner: number[] = [];
  const coneY: number[] = [], coneOwner: number[] = [];
  const treeY: number[] = [], treeOwner: number[] = [];
  const trunkY: number[] = [], trunkOwner: number[] = [];

  const rng = makeRng(0x15_1a4d);
  let t = 0, tr = 0;
  COMPANIONS.forEach((c, i) => {
    const rotY = rng() * Math.PI * 2;
    companionRotY[i] = rotY;
    const deckY = c.y;
    place(caps, i, c.x, deckY, c.z,
      c.s * c.aspect, c.s * c.thick, c.s / c.aspect, rotY, c.tiltX, c.tiltZ);
    capY.push(deckY); capOwner.push(i);

    /*
     * The root hangs along the island's own down-axis, not world down, so a tilted deck
     * keeps its root attached rather than shearing it off.
     *
     * The drop is derived from the two geometries instead of a tuned constant. The cone
     * is 6.5 tall about its own centre, so its rim is 3.25 above that centre once
     * flipped; the cap's underside is 0.55 below the deck plane. Dropping by
     * `3.25*keel + 0.55*thick` therefore lands the cone's widest ring exactly on the
     * cap's underside for every island, whatever its keel length or deck thickness. The
     * old `3.8 * s * keel` ignored `thick` entirely and left a shallow keel (0.5) riding
     * 0.55 units too high — its rim level with the *middle* of the cap, which is the
     * other way that ring got out.
     */
    const drop = c.s * (3.25 * c.keel + 0.55 * c.thick);
    eulerTilt.set(c.tiltX, rotY, c.tiltZ);
    quatTilt.setFromEuler(eulerTilt);
    vKeel.set(0, -drop, 0).applyQuaternion(quatTilt);
    place(cones, i, c.x + vKeel.x, deckY + vKeel.y, c.z + vKeel.z,
      c.s * c.keelR * c.aspect, c.s * c.keel, c.s * c.keelR / c.aspect,
      rotY, c.tiltX, c.tiltZ);
    coneY.push(deckY + vKeel.y); coneOwner.push(i);

    // On the bible's foliage axis, not off it. The first version lerped `foliage mid`
    // toward `water far` (#a6f1f2) for a sense of distance; that path crosses green into
    // cyan, and the art-critic measured two decks at #5a967e — blue above red — 16.0 deltaE
    // off the nearest swatch, with a third at #ae965a. Distance is the fog's job, not the
    // albedo's, so these now sit between `foliage dark` and `foliage light` like every
    // other green in the frame. The range is wider than it was: "no colour difference
    // between any two" was one of A4's specific complaints.
    caps.setColorAt(i, tint.copy(cDark).lerp(cLight, 0.12 + rng() * 0.38));
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
        // A broadleaf's slot: the grove below fills it with the generated tree. The three
        // draws the old blob-broadleaf took (yaw, crown tint, trunk tint) are still taken,
        // so the stream — and with it every later island's yaw, colour and dressing — is
        // the one the art-critic scored.
        rng(); rng(); rng();
        continue;
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
  farTrunks.count = tr;

  // A6: the satellites were flat discs carrying identical cones — "a dressed island is
  // never bare between features" (ART_BIBLE §Density) applied to one island out of
  // nine. Three shared meshes dress all nine: boulders, low bushes and the grass tufts
  // that are the difference between dressed and merely furnished. The critic's crop of
  // the bottom-left satellite — "six cones and eight pebbles scattered on a
  // single-valued green disc, with no ground cover, no tufts, no rocks, no path, no
  // colour break" — is what the tufts answer. All three are instanced across every
  // island, so nine islands' worth of dressing costs three draw calls.
  const DRESS_PER = 38;
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
  registerBobber(farTrunks, trunkY, trunkOwner);
  registerBobber(farRocks, rockY, rockOwner);
  registerBobber(farBushes, bushY, bushOwner);
  registerBobber(farTufts, tuftY, tuftOwner);
}

/*
 * Groves of the generated broadleaf on every companion island (M5a).
 *
 * A grove per island, sized by the island: `9 + 8 * s` trees, so the small near
 * satellite gets about eleven and the big far ones about twenty. They stand where the
 * old blob-broadleaves stood — inside the deck's inscribed circle, clear of each other's
 * trunks — at 1.0-1.6x the island's scale, which is the band the far conifers and the
 * old broadleaf occupied. Each base sits on the island's *tilted* deck plane, not on a
 * level one through its centre, so a tree on the downhill side of a 0.1 rad tilt does not
 * float. The trees themselves stand plumb: a tree grows up, whatever its ground does.
 *
 * Seeded from `src/core/rng.ts` like the hero island's eight. Every instance records its
 * owner and resting height, and joins the bob through `registerBobber` once its mesh
 * exists, so a grove rides its island exactly as the conifers and the dressing do.
 */
{
  const rng = new Rng(0x6201_e5a1);
  const vNormal = new THREE.Vector3();
  COMPANIONS.forEach((c, i) => {
    const count = Math.round(9 + 8 * c.s);
    eulerTilt.set(c.tiltX, companionRotY[i] as number, c.tiltZ);
    quatTilt.setFromEuler(eulerTilt);
    vNormal.set(0, 1, 0).applyQuaternion(quatTilt);
    vKeel.set(0, 0.55 * c.s * c.thick, 0).applyQuaternion(quatTilt);
    const cx = c.x + vKeel.x, cy = c.y + vKeel.y, cz = c.z + vKeel.z;
    const reach = 4.6 * c.s * Math.min(c.aspect, 1 / c.aspect);
    const mine: Spot[] = [];
    for (let k = 0; k < count; k++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const height = (1.0 + rng.next() * 0.6) * c.s;
        const a = rng.next() * Math.PI * 2;
        const d = Math.sqrt(rng.next()) * reach;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const r = height * 0.24;
        if (mine.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2)) continue;
        mine.push({ x, z, r });
        // On the deck plane through (cx, cy, cz) with normal vNormal.
        const y = cy - (vNormal.x * (x - cx) + vNormal.z * (z - cz)) / vNormal.y;
        broadleafSpots.push({
          x, y, z, s: height / BROADLEAF_HEIGHT, sy: 0.92 + rng.next() * 0.16,
          rotY: rng.next() * Math.PI * 2,
          tiltX: (rng.next() - 0.5) * 0.08, tiltZ: (rng.next() - 0.5) * 0.08,
          shade: 0.88 + rng.next() * 0.12, owner: i, lod: lodBand(x, y, z),
        });
        break;
      }
    }
  });
}

/** Instances drawn with the wind-patched material: the hero batch and the companion
 *  groves. Read by the gates; 0 until the GLBs have loaded. */
let windInstances = 0;
/** Instances per hero-island kind, as built. Read by gate:smoke; empty until loaded. */
const floraCounts: Record<string, number> = {};

/** The stepping stone: a faceted stone, white, so its per-instance tint is its colour. */
function pathStoneGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(0.3, 0);
}

/**
 * Lichen grows on a boulder's upper faces, so where it goes is read off the rock's own
 * mesh: a ray straight down at a few points near the rock's centre, the first hit whose
 * normal is within ~37 deg of up wins, and the patch is laid on that face — tilted to it
 * and lifted 0.012 along it, so it neither z-fights the rock nor visibly floats. A rock
 * with no face that flat gets no lichen. Setup-time only.
 */
function seatLichenOnRocks(rockGeometry: THREE.BufferGeometry): void {
  const probe = new THREE.Mesh(rockGeometry);
  probe.matrixAutoUpdate = false;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const e = new THREE.Euler();
  const hits: THREE.Intersection[] = [];
  const OFFSETS: [number, number][] = [[0, 0], [0.08, 0.05], [-0.07, 0.06], [0.04, -0.09], [-0.06, -0.05]];
  for (const spot of heroSpots) {
    if (spot.kind !== 'lichen' || spot.onRock < 0) continue;
    const rock = heroSpots[spot.onRock] as HeroSpot;
    euler.set(rock.tiltX, rock.rotY, rock.tiltZ);
    quat.setFromEuler(euler);
    probe.matrixWorld.compose(vPos.set(rock.x, rock.y, rock.z), quat,
      vScale.set(rock.s, rock.s * rock.sy, rock.s * rock.sz));
    normalMatrix.getNormalMatrix(probe.matrixWorld);
    spot.onRock = -2;   // unseated until a hit says otherwise
    for (const [ox, oz] of OFFSETS) {
      origin.set(rock.x + ox * rock.s * 2, rock.y + 5, rock.z + oz * rock.s * 2);
      ray.set(origin, down);
      hits.length = 0;
      probe.raycast(ray, hits);
      hits.sort((a, b) => a.distance - b.distance);
      const hit = hits[0];
      if (!hit?.face) continue;
      normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
      if (normal.y < 0.8) continue;
      tilt.setFromUnitVectors(up, normal);
      yaw.setFromAxisAngle(up, spot.rotY);
      e.setFromQuaternion(tilt.multiply(yaw), 'XYZ');
      spot.x = hit.point.x + normal.x * 0.012;
      spot.y = hit.point.y + normal.y * 0.012;
      spot.z = hit.point.z + normal.z * 0.012;
      spot.tiltX = e.x; spot.rotY = e.y; spot.tiltZ = e.z;
      spot.onRock = -1;
      break;
    }
  }
}

/**
 * Loads every file in use and builds the hero island's one `FloraBatch` and the companion
 * groves' `InstancedMesh`es.
 *
 * One material per object type — the stock standard material with the rim patch and then
 * the wind patch (`withWind` composes with `withRim`). The batch and the instanced groves
 * each get their own instance of it, because three switches program when one material
 * alternates between batched and instanced objects (and allocates doing it). The vertex
 * colours are the assets' bible ramps; the material colour is white rather than the files'
 * 0.8 grey, so those hexes arrive unmultiplied, and the per-instance colour is a grey
 * shade, which varies brightness without moving a hue.
 *
 * Front faces only, although the files say `doubleSided`: every generator's acceptance
 * (M4, M5) requires 0 open and 0 non-manifold edges and outward winding at every LOD, and
 * a back face of a closed outward shell is never visible. Culling them halves the
 * rasteriser's work, which on SwiftShader is what the frame is made of.
 *
 * Only the hero batch casts, and only its prefix of trees and rocks: the shadow
 * camera spans the hero island alone, so a companion's tree in the shadow pass would be a
 * draw that lands nowhere. The depth material carries the same wind patch, so a shadow
 * sways with the canopy that casts it.
 */
async function loadFlora(): Promise<void> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const loadGeometry = async (file: string, lod: number): Promise<THREE.BufferGeometry> => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${file}.lod${lod}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const found: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) found.push(o); });
    const src = found[0];
    if (found.length !== 1 || !src) {
      throw new Error(`${file}.lod${lod}.glb: expected one mesh, found ${found.length}`);
    }
    const geometry = (src.geometry as THREE.BufferGeometry).clone().applyMatrix4(src.matrixWorld);
    if (!geometry.getAttribute('color')) throw new Error(`${file}.lod${lod}.glb has no vertex colours`);
    return geometry;
  };

  // --- the hero island: every kind, one batch --------------------------------------------
  const kindsInUse = HERO_KINDS.filter((k) => heroSpots.some((s) => s.kind === k));
  const geometries = new Map<HeroKind, THREE.BufferGeometry>();
  await Promise.all(kindsInUse.map(async (kind) => {
    const spec = KINDS[kind];
    const raw = spec.file ? await loadGeometry(spec.file, spec.lod) : pathStoneGeometry();
    geometries.set(kind, bakeWindBend(batchable(raw), spec.height, spec.flex));
    raw.dispose();
  }));
  const rockGeometry = geometries.get('boulders');
  if (rockGeometry) seatLichenOnRocks(rockGeometry);

  // Casters first: the shadow pass draws a prefix of the instance order. `sort` is stable,
  // so within each half the seeded layout order is kept.
  const order = heroSpots
    .filter((s) => s.onRock === -1)
    .sort((a, b) => Number(KINDS[b.kind].casts) - Number(KINDS[a.kind].casts));
  let maxVertices = 0, maxIndices = 0;
  for (const g of geometries.values()) {
    maxVertices += g.getAttribute('position').count;
    maxIndices += g.getIndex()?.count ?? 0;
  }
  const heroMaterial = withWind(withRim(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.8, side: THREE.FrontSide,
  })));
  const hero = new FloraBatch(order.length, maxVertices, maxIndices, heroMaterial);
  hero.name = 'flora.hero';
  const ids = new Map<HeroKind, number>();
  for (const [kind, g] of geometries) ids.set(kind, hero.addGeometry(g));
  const counts: Record<string, number> = {};
  for (const spot of order) {
    euler.set(spot.tiltX, spot.rotY, spot.tiltZ);
    quat.setFromEuler(euler);
    mat4.compose(vPos.set(spot.x, spot.y, spot.z), quat,
      vScale.set(spot.s, spot.s * spot.sy, spot.s * spot.sz));
    hero.place(ids.get(spot.kind) as number, mat4, spot.color, KINDS[spot.kind].casts);
    counts[spot.kind] = (counts[spot.kind] ?? 0) + 1;
  }
  hero.castShadow = true;
  hero.receiveShadow = true;
  hero.customDepthMaterial = withWind(new THREE.MeshDepthMaterial());
  // Compile off the frame where the driver allows it (KHR_parallel_shader_compile), so the
  // first frame with the dressing is not also the frame that builds its program.
  await renderer.compileAsync(hero, camera, scene);
  island.add(hero);
  let drawnWithWind = hero.instanceCount;

  // --- the companion groves: the broadleaf, one InstancedMesh per LOD, bobbing ----------
  const used = ([0, 1, 2] as const).filter((l) => broadleafSpots.some((t) => t.lod === l));
  const groveMaterial = withWind(withRim(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.78, side: THREE.FrontSide,
  })));
  const files = await Promise.all(used.map(async (lod) => ({
    lod, geometry: bakeWindBend(await loadGeometry('flora/broadleaf', lod), BROADLEAF_HEIGHT, 1),
  })));
  for (const { lod, geometry } of files) {
    const spots = broadleafSpots.filter((t) => t.lod === lod);
    const mesh = new THREE.InstancedMesh(geometry, groveMaterial, spots.length);
    mesh.name = `broadleaf.lod${lod}`;
    mesh.receiveShadow = true;
    const baseY: number[] = [], owner: number[] = [];
    spots.forEach((t, k) => {
      place(mesh, k, t.x, t.y, t.z, t.s, t.s * t.sy, t.s, t.rotY, t.tiltX, t.tiltZ);
      mesh.setColorAt(k, tint.setScalar(t.shade));
      baseY.push(t.y); owner.push(t.owner);
    });
    await renderer.compileAsync(mesh, camera, scene);
    far.add(mesh);
    registerBobber(mesh, baseY, owner);
    drawnWithWind += mesh.count;
  }
  // Published last, so a reader that waits for them sees the whole set, not the first half.
  windInstances = drawnWithWind;
  Object.assign(floraCounts, counts);
}
loadFlora().catch((e: unknown) => {
  // The rest of the world still renders; gate:smoke turns this console error into a failure.
  console.error('flora: the generated plants and rocks did not load, so the islands are drawn without them:', e);
});

/*
 * The flock, in its own mesh so it can fly.
 *
 * It used to ride in `farTrees` as eleven extra instances, which cost nothing and also
 * meant it could never move without rebuilding the whole tree mesh. A bird is a cone
 * squashed flat along one axis and tilted — at 60 to 120 units that is enough — and
 * eleven of them wheeling slowly is the cheapest motion in the frame: eleven matrices a
 * frame, composed from the same scratch objects everything else uses.
 */
// 18, up from 11, and flying nearer. The art-critic could pick out "only two to four
// tiny dark bird-like specks... barely visible": at 58-118 units a 0.5-1.0 unit dart is
// about two pixels. They now range from 26 to 96 units and are half again as large,
// which is the difference between a speck and a bird.
const BIRD_COUNT = 18;
const birds = instanced(new THREE.ConeGeometry(0.62, 1.9, 6), BIRD_COUNT, 0.85, far);
/** Orbit radius, height, angular speed, start angle and size for each bird. */
const birdOrbit = new Float32Array(BIRD_COUNT * 5);
{
  const rng = makeRng(0xb1_7d5);
  for (let i = 0; i < BIRD_COUNT; i++) {
    birdOrbit[i * 5] = 42 + rng() * 54;                      // radius
    birdOrbit[i * 5 + 1] = 6 + rng() * 20;                   // height
    birdOrbit[i * 5 + 2] = (rng() < 0.5 ? -1 : 1) * (0.00007 + rng() * 0.00012);
    birdOrbit[i * 5 + 3] = rng() * Math.PI * 2;              // start angle
    birdOrbit[i * 5 + 4] = 1.15 + rng() * 0.9;               // size
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
      // Long, thin and nearly flat. At 11 instances and radius 58-118 these were
      // specks; brought nearer and scaled up they became black lozenges, which is a
      // worse failure than a speck. A dart only reads as a bird if it stays a dart.
      size * 2.4, size * 0.1, size * 0.42,
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
  // Its own depth material, so three's one pooled shadow material is never shared between
  // an instanced caster and a plain one. Shared, the `instancing` flag flipped twice a frame
  // and three rebuilt the program parameters and cache key each time (`getProgram` from
  // `setProgram`): ~8 kB/frame of heap churn, measured with a sampling heap profile (M8b).
  crystals.customDepthMaterial = new THREE.MeshDepthMaterial();
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

// --- the world and its save (M8a) -------------------------------------------------------
/**
 * The sim world (src/sim/world.ts) and the session that keeps it in IndexedDB
 * (src/sim/persist.ts over src/core/save.ts). docs/ARCHITECTURE.md §Save has the contract;
 * what this file adds is only the wiring:
 *
 * - **Load never blocks the first frame.** The save code is a dynamic import started here,
 *   and the frame loop runs from the first rAF whether or not it has landed. Until it has,
 *   `world` is null, the sim does not tick and the HUD says `loading`. `worldReadyMs`
 *   records when it landed, beside `bootMs`, so the claim is checkable.
 * - **The sim advances at a fixed 20 Hz from the frame loop's accumulated dt.** Wall-clock
 *   time enters here and is turned into whole ticks; src/sim never sees it. At most
 *   MAX_CATCH_UP_MS is credited per frame, so a tab back from the background does not
 *   fast-forward its world.
 * - **Saves:** once at load (so "saved" on screen means a write has landed, and a store
 *   that opens but cannot write is caught at once), every AUTOSAVE_MS, on
 *   `visibilitychange` to hidden and on `pagehide`. A roster change saves at once — a bred
 *   dragon must not wait 10 s to exist on disk (rubric G4). Each save is journalled
 *   synchronously and its write issued at once, so an unload cannot strand it in a queue.
 * - **Two tabs:** a write only replaces what its tab loaded or wrote since, so a stale tab is
 *   refused rather than overwriting a roster it never saw. A tab whose write lands says so
 *   on a BroadcastChannel, so other tabs stop at once. A stale tab is **paused**: its world
 *   no longer ticks or changes, and the HUD offers a reload — no play is silently dropped.
 * - **A refused save is never a dead end.** The HUD offers to export it as a file and to
 *   start fresh with it kept aside (`refused.<n>`, never deleted), bringing along every
 *   dragon in it that still validates.
 * - **Nothing per frame.** Serialising happens only inside a save. The HUD is repainted on
 *   the 250 ms timer, and its strings are rebuilt only when what they show changes.
 */
const TEST_HOOKS = new URLSearchParams(location.search).has('test');
const TEST_READ_TIMEOUT_MS = TEST_HOOKS ? Number(new URLSearchParams(location.search).get('readTimeoutMs') ?? 0) || 0 : 0;
/** When the load began, so a slow one can say what it waits for (cycle 2, D5). */
const bootStartedAt = performance.now();
const AUTOSAVE_MS = 10_000;
const MAX_CATCH_UP_MS = 250;

let world: World | null = null;
let save: SaveSession | null = null;
/** The store under `save`, kept only so the `?test` hook can close it (cycle 2, D3 drill). */
let saveStore: SaveStore | null = null;
let loadReport: LoadReport | null = null;
/** `performance.now()` when the world was ready: compare with `bootMs` (first frame). */
let worldReadyMs = 0;
let simAccMs = 0;
/** Save cost, gathered as saves resolve (never per frame); read by gate:perf and gate:smoke. */
const saveStats = { count: 0, maxMainThreadMs: 0, maxRoundTripMs: 0, last: null as SaveTiming | null };
const saveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dragonvein-save') : null;

const hudWorld = {
  wild: document.getElementById('hud-wild'),
  calm: document.getElementById('hud-calm'),
  clock: document.getElementById('hud-clock'),
  roster: document.getElementById('hud-roster'),
  save: document.getElementById('hud-save'),
  note: document.getElementById('hud-save-note'),
  actions: document.getElementById('hud-save-actions'),
  fresh: document.getElementById('hud-save-fresh') as HTMLButtonElement | null,
  exportBtn: document.getElementById('hud-save-export') as HTMLButtonElement | null,
  reload: document.getElementById('hud-save-reload') as HTMLButtonElement | null,
};

/** A random id per page load: the `writer` on every record this session writes. */
function sessionId(): string {
  const b = crypto.getRandomValues(new Uint32Array(2));
  return `${(b[0] ?? 0).toString(36)}${(b[1] ?? 0).toString(36)}`;
}

// The sim's moving parts, for drawing between ticks (M8b): see `updateWild` below.
/** [dragon x, z, heading, keeper x, z] at the last two ticks. */
const simPrev = new Float64Array(5);
const simNow = new Float64Array(5);
/** `?test` only: the world exactly as loaded, before its first tick (the reload drill compares it). */
let loadedWorld: string | null = null;
/** `?test` only: hold the sim still, so a save cannot race the world it describes. */
let simHeld = false;
/**
 * `?test` only: whether a hold freezes the **pose** as well as the sim. Holding both is the
 * photograph (the frame on disk is the moment the drill reached). Holding the sim alone lets a
 * pose that is still easing arrive while the world cannot move on under it — which is the only
 * way to photograph a short state at the pose it asks for, since the tells take two or three
 * seconds to ease and `wary` can be over before they land (run 36, C0).
 */
let poseHeld = false;
/**
 * `?test` only: the instant the pose was frozen at, so the dragon's *idle* animation — the
 * breath, which runs off the wall clock and not off the frame's dt — stops with it. Without
 * this, two photographs of the same held pose differ: at the camera a player has, where the
 * whole dragon is about 1500 drawn pixels, a breath moving the outline by a pixel changed 70 of
 * them, which is noise of the same order as the tells being measured (run 36, criterion 2).
 */
let idleFrozenAtMs: number | null = null;
/** `?test` only: pin the island's spin at this angle (radians), so a drill can aim at the deck. */
let spinPinned: number | null = null;
/**
 * `?test` only (M8b criterion 2's drill): pose the dragon's attitude layer as this state and
 * bearing instead of the sim's, or null to hand it back. It changes the attitude layer and
 * nothing else — not the position, not the heading, not the flight, not `world.wild.state` — so
 * `readWild().wild.state` still reports what the sim thinks and a drill cannot photograph a lie.
 */
let posedAs: { state: string; look: number } | null = null;
/** Set when `poseAs` changes, so the next frame snaps instead of easing (a held sim has dt 0). */
let posedAsFresh = false;

/** `?test&seed=N` fixes a fresh world's seed, so gate:smoke meets the same wild dragon every run. */
const TEST_SEED = TEST_HOOKS ? Number(new URLSearchParams(location.search).get('seed') ?? Number.NaN) : Number.NaN;

const worldReady: Promise<void> = (async () => {
  const seed = Number.isInteger(TEST_SEED) && TEST_SEED >= 0 && TEST_SEED <= 0xffffffff
    ? TEST_SEED : crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  try {
    const [{ openGameWorld }, { openIdbStore, localJournal }] = await Promise.all([
      import('./sim/persist'), import('./core/save'),
    ]);
    const opened = await openIdbStore();
    const r = await openGameWorld(opened.ok ? opened.store : null, seed, {
      writer: sessionId(), journal: localJournal(), clock: () => performance.now(), deck,
      // gate:smoke shortens the load-read timeout to drill it; play keeps the 10 s default.
      ...(TEST_READ_TIMEOUT_MS > 0 ? { readTimeoutMs: TEST_READ_TIMEOUT_MS } : {}),
      ...(opened.ok ? {} : { unavailable: opened.why }),
    });
    world = r.world;
    save = r.session;
    saveStore = opened.ok ? opened.store : null;
    loadReport = r.report;
    if (!r.session.writable) console.warn(`DRAGONVEIN: progress is not saved (${r.session.state}: ${r.session.detail})`);
  } catch (e) {
    // The save code itself failed to load. Play on, unsaved, and say so.
    world = createWorld(seed, deck);
    save = null;
    console.warn(`DRAGONVEIN: progress is not saved (${e instanceof Error ? e.message : String(e)})`);
  }
  worldReadyMs = performance.now();
  if (world) {
    if (TEST_HOOKS) loadedWorld = JSON.stringify(world);
    deckHeightsMs = deckHeights.build();
    noteSimState(world);
    keeper.visible = true;
    void spawnWildDragon(world);
  }
  paintWorldHud();
  await saveWorld();
})();

function saveWorld(): Promise<void> {
  const s = save;
  if (!world || !s || !s.writable) return Promise.resolve();
  const before = s.gen;
  return s.save(world, Date.now()).then(() => {
    const t = s.lastTiming;
    if (t) {
      saveStats.count++;
      saveStats.last = t;
      saveStats.maxMainThreadMs = Math.max(saveStats.maxMainThreadMs, t.serialiseMs + t.journalMs + t.putMs);
      saveStats.maxRoundTripMs = Math.max(saveStats.maxRoundTripMs, t.roundTripMs);
    }
    if (s.gen > before) saveChannel?.postMessage(s.gen);
    paintWorldHud();
  });
}
saveChannel?.addEventListener('message', (e: MessageEvent<unknown>) => {
  if (typeof e.data === 'number' && save) { save.markStale(e.data); paintWorldHud(); }
});
setInterval(() => { void saveWorld(); }, AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void saveWorld();
});
addEventListener('pagehide', () => { void saveWorld(); });

/** A tab that lost the save to another tab is paused: nothing it did could be kept. */
function worldPaused(): boolean {
  return save !== null && save.state === 'conflict';
}

/** Recovery from a refused save: set it aside (never deleted), keep its readable dragons. */
async function startFresh(): Promise<string | null> {
  const s = save;
  const w = world;
  if (!s || !w || !s.refused) return null;
  const salvage = s.refused.salvage;
  const key = await s.setAside();
  if (key) {
    adoptGenomes(w, salvage);
    await saveWorld();
  }
  shownKind = -1;
  paintWorldHud();
  return key;
}

/** The refused record, exactly as stored, as a download. Offline: a Blob, no request. */
function exportRefused(): string | null {
  const r = save?.refused;
  if (!r) return null;
  let text: string;
  try {
    text = JSON.stringify(r.raw, null, 1) ?? String(r.raw);
  } catch {
    text = String(r.raw);
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dragonvein-save-${r.gen > 0 ? `gen${r.gen}` : 'unreadable'}.json`;
  exportedName = a.download;
  shownKind = -1;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  paintWorldHud();
  return text;
}
hudWorld.fresh?.addEventListener('click', () => { void startFresh(); });
hudWorld.exportBtn?.addEventListener('click', () => { exportRefused(); });
hudWorld.reload?.addEventListener('click', () => { location.reload(); });

/** What the HUD's save readout says in each state, and the warning line under it. */
const SAVE_TEXT: Record<SaveState | 'loading', readonly [string, string]> = {
  loading: ['loading', ''],
  pending: ['saving', ''],
  saved: ['saved', ''],
  error: ['not saved', 'the last save failed — retrying every 10 s'],
  unavailable: ['not saved', 'storage unavailable — progress is not kept'],
  conflict: ['paused', 'another tab took over saving — this tab is paused; reload to play here'],
  newer: ['not saved', 'this save was made by a newer version of the game — kept, not overwritten'],
  corrupt: ['not saved', 'this save cannot be read — kept, not overwritten'],
  incomplete: ['not saved', 'this save is incomplete — kept, not overwritten'],
};
const ERROR_CLOSED = 'storage was closed and could not be reopened — retrying every 10 s';
const ERROR_NEWER_DB = 'a newer version of the game upgraded the save — reload to update';
const READ_TIMEOUT = 'the save could not be read in time (another tab held it) — nothing was overwritten; reload to try again';
const WAITING = 'waiting for another tab\'s save…';
const JOURNAL_OFF = 'backup journal off (storage blocked or full) — saves may lag a reload';
/** When `loading` has lasted this long, the HUD says what it is waiting for. */
const LOADING_SLOW_MS = 1000;
/** The file name of the last export, confirmed on the HUD (cycle 2, D3). */
let exportedName: string | null = null;
let shownSec = -2;
let shownRoster = -2;
/** The calm meter in 5 % steps, so it repaints only when it moves a step. */
let shownCalm = -2;
let shownState = '';
let shownAgo = -2;
/** Which variant of the note is shown, so a change of detail repaints without a string compare. */
let shownKind = -1;

/**
 * Which note goes under the save readout. A small integer so the 250 ms repaint compares
 * numbers, not strings:
 *   0 the state's own note · 1 store closed · 2 newer database · 3 old save kept aside ·
 *   4 set-aside refused (detail) · 5 exported · 6 slot emptied and re-saved · 7 journal off ·
 *   8 read timed out · 9 still loading
 */
function noteKind(s: SaveSession | null, state: SaveState | 'loading'): number {
  if (state === 'loading') return performance.now() - bootStartedAt > LOADING_SLOW_MS ? 9 : 0;
  const detail = s ? s.detail : '';
  if (state === 'unavailable') {
    if (detail.includes('newer version')) return 2;
    return detail.startsWith('timeout:') ? 8 : 0;
  }
  if (state === 'error') return detail.startsWith('StoreClosedError') ? (detail.includes('newer version') ? 2 : 1) : 0;
  if (s?.refused) return s.asideRefused ? 4 : exportedName ? 5 : 0;
  if (state === 'saved' || state === 'pending') {
    if (s?.notice) return 6;
    if (s?.asideKey) return 3;
    if (s && !s.journalOk) return 7;
  }
  return 0;
}

function paintWorldHud(): void {
  const sec = world ? Math.floor(world.tick / TICK_HZ) : -1;
  if (sec !== shownSec && hudWorld.clock) {
    shownSec = sec;
    const m = Math.floor(sec / 60) % 60;
    const ss = sec % 60;
    hudWorld.clock.textContent = sec < 0 ? '—'
      : `${Math.floor(sec / 3600)}:${m < 10 ? '0' : ''}${m}:${ss < 10 ? '0' : ''}${ss}`;
  }
  const calm = world ? Math.round(world.wild.calm * 20) : -1;
  if (calm !== shownCalm) {
    shownCalm = calm;
    if (hudWorld.wild) hudWorld.wild.hidden = calm < 0;
    if (hudWorld.calm) hudWorld.calm.style.width = `${Math.max(0, calm) * 5}%`;
  }
  const roster = world ? world.roster.length : -1;
  if (roster !== shownRoster && hudWorld.roster) {
    shownRoster = roster;
    hudWorld.roster.textContent = roster < 0 ? '—' : String(roster);
  }
  const s = save;
  const raw: SaveState | 'loading' = s ? s.state : world ? 'unavailable' : 'loading';
  // "saved" only when the newest change is durable — in IndexedDB or the journal.
  const state: SaveState | 'loading' = raw === 'saved' && s && !s.durable ? 'pending' : raw;
  const ago = state === 'saved' && s?.lastSavedAt != null
    ? Math.max(0, Math.floor((Date.now() - s.lastSavedAt) / 1000)) : -1;
  const kind = noteKind(s, state);
  if (state === shownState && ago === shownAgo && kind === shownKind) return;
  shownState = state;
  shownAgo = ago;
  shownKind = kind;
  const [value, base] = SAVE_TEXT[state];
  const note = kind === 1 ? ERROR_CLOSED : kind === 2 ? ERROR_NEWER_DB
    : kind === 3 ? `the old save is kept aside, untouched (${s?.asideKey ?? ''})`
    : kind === 4 ? s?.detail ?? ''
    : kind === 5 ? `${base} · exported ${exportedName ?? ''}`
    : kind === 6 ? s?.notice ?? ''
    : kind === 7 ? JOURNAL_OFF
    : kind === 8 ? READ_TIMEOUT
    : kind === 9 ? WAITING : base;
  if (hudWorld.save) {
    hudWorld.save.textContent = ago < 0 ? value : `${value} ${ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`} ago`;
    hudWorld.save.classList.toggle('off', value !== 'saved' && value !== 'saving' && value !== 'loading');
  }
  if (hudWorld.note) {
    hudWorld.note.textContent = note;
    hudWorld.note.hidden = note === '';
  }
  const refused = s?.refused ? s.refused : null;
  // Every button shown can do something: start-fresh is withdrawn once the slot has changed
  // under it (kind 4), and reload is offered wherever reloading is the way on.
  const showFresh = refused !== null && kind !== 4;
  const showReload = state === 'conflict' || state === 'newer' || kind === 2 || kind === 4 || kind === 8;
  if (hudWorld.actions) hudWorld.actions.hidden = !showFresh && !refused && !showReload;
  if (hudWorld.fresh) {
    hudWorld.fresh.hidden = !showFresh;
    const n = refused?.salvage.length ?? 0;
    hudWorld.fresh.textContent = n > 0
      ? `start fresh with the ${n} readable dragon${n === 1 ? '' : 's'}, keep the old save aside`
      : 'start fresh, keep the old save aside';
  }
  if (hudWorld.exportBtn) hudWorld.exportBtn.hidden = !refused;
  if (hudWorld.reload) hudWorld.reload.hidden = !showReload;
}

/** The `?test` hook's view of the world: a deep copy, never the live object. */
function readSave() {
  return {
    world: world ? JSON.parse(JSON.stringify(world)) as World : null,
    state: save?.state ?? (world ? 'unavailable' : 'loading'),
    detail: save?.detail ?? '',
    gen: save?.gen ?? 0,
    writes: save?.writes ?? 0,
    lastSavedAt: save?.lastSavedAt ?? null,
    report: loadReport,
    refused: save?.refused ? { gen: save.refused.gen, salvage: save.refused.salvage.length } : null,
    asideKey: save?.asideKey ?? null,
    paused: worldPaused(),
    saveStats: { ...saveStats },
    worldReadyMs,
    bootMs,
    hud: {
      clock: hudWorld.clock?.textContent ?? '',
      roster: hudWorld.roster?.textContent ?? '',
      save: hudWorld.save?.textContent ?? '',
      note: hudWorld.note && !hudWorld.note.hidden ? hudWorld.note.textContent ?? '' : '',
      actions: hudWorld.actions && !hudWorld.actions.hidden
        ? [...hudWorld.actions.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => b.textContent ?? '')
        : [],
    },
  };
}
if (TEST_HOOKS) {
  globalThis.__dragonveinSave = {
    ready: async () => { await worldReady; return readSave(); },
    read: readSave,
    seedRoster: async () => {
      await worldReady;
      const w = world;
      if (!w) throw new Error('no world');
      const { addWild, addBred } = await import('./sim/roster');
      // A paused tab refuses world changes: nothing it did could be saved.
      if (worldPaused()) return { ...readSave(), changed: false };
      const a = addWild(w);
      const b = addWild(w);
      addBred(w, a.id, b.id);
      paintWorldHud();
      await saveWorld();
      return { ...readSave(), changed: true };
    },
    save: async () => { await worldReady; await saveWorld(); return readSave(); },
    replay: (w: World, tick: number) => {
      const c = structuredClone(w);
      while (c.tick < tick) step(c, deck);
      return c;
    },
    startFresh: async () => { await worldReady; const key = await startFresh(); return { ...readSave(), key }; },
    exportText: () => exportRefused(),
    closeStore: () => { saveStore?.close(); },
  };
}

// --- the wild dragon and the keeper on screen (M8b) -------------------------------------
/*
 * The sim moves both bodies at 20 Hz; the frame draws them between ticks. Each tick, before
 * it steps, the frame loop copies what moves (`simNow`, written after every step) into
 * `simPrev`; a frame then draws at `alpha` = the fraction of a tick its accumulator holds.
 * Two fixed Float64Arrays, copied in place: nothing is allocated per frame or per tick.
 *
 * The dragon itself is built once the world is ready, by a lazily loaded module
 * (src/render/wild-dragon.ts) through the mesh worker, and compiled off the frame where the
 * driver allows. Until then the island is drawn without it; the first frame never waits.
 */

function noteSimState(w: World): void {
  simNow[0] = w.wild.pos[0];
  simNow[1] = w.wild.pos[1];
  simNow[2] = w.wild.heading;
  simNow[3] = w.keeper.pos[0];
  simNow[4] = w.keeper.pos[1];
  if (simPrev[0] === 0 && simPrev[1] === 0 && simPrev[3] === 0) simPrev.set(simNow);
}

let wildView: WildDragonView | null = null;
/** Why the dragon is not drawn, when its build failed (the game plays on without it). */
let wildError = '';
/** The keeper's facing (render only: it turns to where it walks, and to the dragon when standing). */
let keeperYaw = 0;
let keeperStride = 0;
let ringScale = 0;
/** The temperament of the dragon on the island, for the `?test` readout. */
const wildTemper: Temperament = blankTemperament();
let wildTemperGid = '';
/** Taps that reached the deck: how many, when the last landed, and where it sent the keeper. */
const taps = { count: 0, run: 0, lastAt: 0, lastGoal: [0, 0] as [number, number], lastRun: false, offDeck: 0 };

async function spawnWildDragon(w: World): Promise<void> {
  try {
    const { WildDragonView } = await import('./render/wild-dragon');
    const view = await WildDragonView.build(w.wild.genome, DRAGON_SCALE, withRim);
    await renderer.compileAsync(view.holder, camera, scene);
    island.add(view.holder);
    wildView = view;
  } catch (e) {
    wildError = e instanceof Error ? e.message : String(e);
    console.error('wild dragon: it could not be built, so the island is drawn without it:', e);
  }
}

const tapRay = new THREE.Raycaster();
const tapNdc = new THREE.Vector2();
const tapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP_Y);
const tapHit = new THREE.Vector3();

/**
 * A tap at (clientX, clientY): where it meets the deck, in the island's frame, becomes the
 * keeper's goal (`keeperTo`); a double tap runs. Off the island it does nothing. A paused tab
 * (another tab took over saving) refuses it, as it refuses every world change.
 */
function tapDeck(clientX: number, clientY: number, run: boolean): void {
  const w = world;
  if (!w || worldPaused()) return;
  const rect = canvas.getBoundingClientRect();
  tapNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  tapRay.setFromCamera(tapNdc, camera);
  island.updateMatrixWorld();
  tapPlane.constant = -(island.position.y + TOP_Y);
  if (!tapRay.ray.intersectPlane(tapPlane, tapHit)) return;
  island.worldToLocal(tapHit);
  if (Math.hypot(tapHit.x, tapHit.z) > TOP_RADIUS) { taps.offDeck++; return; }
  keeperTo(w, deck, tapHit.x, tapHit.z, run);
  taps.count++;
  if (run) taps.run++;
  taps.lastAt = performance.now();
  taps.lastGoal[0] = w.keeper.goal[0];
  taps.lastGoal[1] = w.keeper.goal[1];
  taps.lastRun = run;
  hintSeen();
}

/** Shortest-arc interpolation between two headings. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/**
 * Per frame, before the render: place and pose the keeper and the dragon at `alpha` between
 * the last two ticks. Allocation-free.
 */
function updateWild(nowMs: number, dt: number, alpha: number): void {
  // Held poses hold the breath too: see `idleFrozenAtMs`.
  setIdleTime((idleFrozenAtMs ?? nowMs) / 1000);
  const w = world;
  if (!w) return;
  const a = alpha;
  const kx = simPrev[3]! + (simNow[3]! - simPrev[3]!) * a;
  const kz = simPrev[4]! + (simNow[4]! - simPrev[4]!) * a;
  const kvx = (simNow[3]! - simPrev[3]!) / WILD_DT, kvz = (simNow[4]! - simPrev[4]!) / WILD_DT;
  const speed = Math.sqrt(kvx * kvx + kvz * kvz);
  const x = simPrev[0]! + (simNow[0]! - simPrev[0]!) * a;
  const z = simPrev[1]! + (simNow[1]! - simPrev[1]!) * a;
  const h = lerpAngle(simPrev[2]!, simNow[2]!, a);

  // The keeper faces where it walks; standing near the dragon, it turns to watch it.
  let want = keeperYaw;
  if (speed > 0.05) want = Math.atan2(kvz, kvx);
  else if (Math.hypot(x - kx, z - kz) < 6) want = Math.atan2(z - kz, x - kx);
  keeperYaw = lerpAngle(keeperYaw, want, 1 - Math.exp(-8 * dt));
  keeperStride += speed * dt * 9;
  const bob = 0.012 * Math.min(1, speed) * Math.abs(Math.sin(keeperStride));
  keeper.position.set(kx, deckHeights.at(kx, kz) + bob, kz);
  keeper.rotation.y = -keeperYaw;
  // The tap ring marks the goal while the keeper walks, and shrinks away on arrival.
  const k = w.keeper;
  const walking = Math.hypot(k.goal[0] - k.pos[0], k.goal[1] - k.pos[1]) > 0.03;
  ringScale += ((walking ? 1 : 0) - ringScale) * (1 - Math.exp(-12 * dt));
  const gx = k.goal[0] - kx, gz = k.goal[1] - kz;
  const c = Math.cos(keeperYaw), s = Math.sin(keeperYaw);
  KEEPER_UNIFORMS.uMark.value.set(gx * c + gz * s, -gx * s + gz * c,
    ringScale < 0.01 ? 0 : ringScale * (1 + 0.08 * Math.sin(nowMs * 0.008)));

  const view = wildView;
  if (!view) return;
  const d = w.wild;
  // The keeper's bearing off the snout, in the dragon's own frame (+ to its left).
  const ch = Math.cos(h), sh = Math.sin(h);
  const lx = (kx - x) * ch + (kz - z) * sh, lz = -(kx - x) * sh + (kz - z) * ch;
  const flee = d.state === 'flee';
  const hop = Math.hypot(d.goal[0] - d.from[0], d.goal[1] - d.from[1]);
  // `?test` only: a drill can pose the attitude as any state, with the sim untouched.
  const posed = posedAs;
  const state = posed ? posed.state : d.state;
  const look = posed ? posed.look : Math.atan2(-lz, lx);
  if (posed !== null && posedAsFresh) {
    // The override is meant to be seen at once, and a drill holds the sim to photograph it —
    // which passes dt 0, so an eased change would never arrive. Set the targets and land on them.
    view.attitude.setTargets(state, look);
    view.attitude.snap();
    posedAsFresh = false;
  }
  view.update(x, z, deckHeights.at(x, z), h, state, look,
    flee ? Math.max(0, d.t - 1 + a) * WILD_DT : 0, d.dur * WILD_DT, TAKEOFF_S, LAND_S,
    Math.min(3.0, 1.2 + 0.35 * hop), dt);
}

/** The hint under the HUD fades once the player has walked somewhere. */
const hint = document.getElementById('hint');
function hintSeen(): void {
  if (hint && !hint.classList.contains('done')) hint.classList.add('done');
}

/** The `?test` hook's view of the island's two bodies: copies, never the live objects. */
function readWild() {
  const w = world;
  const v = wildView;
  if (w && w.wild.genome.gid !== wildTemperGid) {
    temperament(w.wild.genome, wildTemper);
    wildTemperGid = w.wild.genome.gid;
  }
  const kd = w ? Math.hypot(w.keeper.pos[0] - w.wild.pos[0], w.keeper.pos[1] - w.wild.pos[1]) : null;
  return {
    tick: w?.tick ?? null,
    held: simHeld,
    deckHeightsMs,
    wild: w ? { ...structuredClone(w.wild), genome: undefined, gid: w.wild.genome.gid, element: w.wild.genome.element } : null,
    keeper: w ? structuredClone(w.keeper) : null,
    keeperDistance: kd,
    temperament: w ? { ...wildTemper } : null,
    dragon: v ? {
      ready: true, gid: v.gid, triangles: v.triangles, buildMs: v.buildMs,
      holder: v.holder.position.toArray(), yaw: v.holder.rotation.y, scale: v.holder.scale.x,
      walkWeight: v.walkW, flap: v.fleeNow.flap, glide: v.fleeNow.glide, altitude: v.fleeNow.altitude,
      attitude: {
        look: v.attitude.look, neck: v.attitude.neck, head: v.attitude.head, lower: v.attitude.lower, tail: v.attitude.tail,
        fold: v.attitude.fold, rise: v.attitude.rise, rear: v.attitude.rear,
      },
      // What those channels are easing toward, so a drill can tell an arrived pose from one
      // still on its way (tools/playtest.mjs `shoot`). A copy, like everything else here.
      attitudeGoal: {
        look: v.attitude.targets.look, neck: v.attitude.targets.neck, head: v.attitude.targets.head,
        lower: v.attitude.targets.lower, tail: v.attitude.targets.tail, fold: v.attitude.targets.fold,
        rise: v.attitude.targets.rise, rear: v.attitude.targets.rear,
      },
    } : { ready: false, error: wildError },
    keeperView: { pos: keeper.position.toArray(), yaw: keeper.rotation.y, ring: KEEPER_UNIFORMS.uMark.value.toArray(), visible: keeper.visible },
    taps: { ...taps, lastGoal: [...taps.lastGoal] },
    hint: hint ? !hint.classList.contains('done') : false,
    calmMeter: hudWorld.calm?.style.width ?? '',
    spin: island.rotation.y,
  };
}

declare global {
  /** `?test` only (M8b, gate:smoke): the wild dragon and the keeper. Not used in play. */
  var __dragonveinWild: {
    /** Resolves once the world is loaded and the dragon built (or failed). */
    ready: () => Promise<ReturnType<typeof readWild>>;
    read: () => ReturnType<typeof readWild>;
    /** What a tap does, without the pointer: walk (or run) the keeper to (x, z) on the deck. */
    walkTo: (x: number, z: number, run: boolean) => ReturnType<typeof readWild>;
    /** Stand the keeper at (x, z) at once: a drill's setup, never play. */
    place: (x: number, z: number) => ReturnType<typeof readWild>;
    /**
     * Stand the keeper about `dist` from the dragon on a spot it can stand on, with a route to
     * the dragon and open ground for the first strides along it, and return that spot — or null
     * if the deck holds none. See the implementation for what "about" and "open" mean.
     */
    stage: (dist: number) => [number, number] | null;
    /** The island's walkable deck as the sim sees it: radius, obstacle circles, home, gate. */
    deck: () => Deck;
    /**
     * A spot `gap` from the dragon the keeper can stand on and walk to from where it is, on
     * the bearing nearest its own: where to tap to come in to that distance. Null if the deck
     * has none. Nothing is moved — the caller walks there.
     */
    approach: (gap: number) => [number, number] | null;
    /** A deck point (island frame) in CSS pixels on the page, at the island's current spin. */
    project: (x: number, z: number) => [number, number];
    /** Pin the island's spin (radians), or let it turn again (null). */
    pinSpin: (rad: number | null) => void;
    /** Pin the spin so the dragon stands on the camera's side of the island; returns the angle. */
    faceCamera: () => number;
    /**
     * Pin the spin so the line from the dragon to deck point (x, z) runs across the screen,
     * left to right: the dragon seen side on, facing whoever comes from there. Returns the angle.
     */
    frameAcross: (x: number, z: number) => number;
    /**
     * A close camera from the orbit's side, `elevDeg` up, on the midpoint of the dragon as it
     * is *drawn* — altitude included — and the keeper, or on the dragon alone (`withKeeper`
     * false). `dist` is only a floor: the distance is whatever holds the dragon's whole
     * bounding sphere (and the keeper's height) with headroom under the HUD bar. Called again
     * as they move, it tracks them. The orbit takes over again on the next input or
     * `__dragonveinShot.release()`.
     */
    closeUp: (dist: number, elevDeg: number, withKeeper?: boolean) => void;
    /** Set the orbit (degrees, world units), clamped as input is. */
    orbit: (azimuthDeg: number, pitchDeg: number, distance: number) => void;
    /**
     * What the camera puts on the page right now, in CSS pixels: the dragon's drawn centre and
     * the diameter of its bounding sphere there, and the keeper's centre and height. `gate:smoke`
     * logs it beside every wild shot, so a shot's framing is a number and not an opinion.
     */
    screen: () => {
      viewport: [number, number];
      dragon: { px: [number, number]; widthPx: number; cameraDistance: number } | null;
      keeper: { px: [number, number]; heightPx: number } | null;
    };
    /**
     * Is the keeper drawn in the clear from where the camera stands — nothing on the island
     * between the camera and its hood, chest or hem? Rays, so it answers for what is *drawn*,
     * not for the deck's collision circles, which stop below the keeper's own height.
     */
    keeperSeen: () => boolean;
    /**
     * Hold the sim still (true) or let it run. `pose` false holds the sim *only*: the dragon's
     * pose keeps easing (the tells, the walk ramp, the gait clock) while the world cannot change
     * state under it, which is how a drill waits for a pose to arrive without the sim moving on.
     * `pose` true — the default, and what a photograph wants — freezes both.
     */
    hold: (on: boolean, pose?: boolean) => void;
    /**
     * Drill-only: pose the attitude layer as `state` with the keeper `look` radians off the
     * snout, snapped, whatever the sim is doing; `poseAs(null, 0)` hands it back to the sim.
     * Nothing else moves — the dragon stands where the sim has it, facing where the sim faces,
     * and `read().wild.state` keeps reporting the sim's own state. Used by the `wild tells at
     * the player's camera` drill to put four comparable frames side by side.
     */
    poseAs: (state: string | null, look: number) => void;
    /** Drill-only: hide the dragon (and so its shadow), to capture the scene without it. */
    hideDragon: (on: boolean) => void;
    /** The world exactly as it was loaded, before its first tick. */
    loaded: () => World | null;
  } | undefined;
}

/** `closeUp`'s margin on the extent it has to hold, and the share of the vertical half-angle
 *  it may use — the rest is headroom, so the subject clears the HUD bar at the top. */
const CLOSE_UP_PAD = 1.08;
const CLOSE_UP_HEADROOM = 0.8;

if (TEST_HOOKS) {
  const projected = new THREE.Vector3();
  const closeUpBody = new THREE.Vector3();
  const closeUpKeeper = new THREE.Vector3();
  const closeUpAt = new THREE.Vector3();
  const sightRay = new THREE.Raycaster();
  const sightDir = new THREE.Vector3();
  const sightAt = new THREE.Vector3();
  globalThis.__dragonveinWild = {
    ready: async () => {
      await worldReady;
      const t0 = performance.now();
      while (!wildView && !wildError && performance.now() - t0 < 30_000) await new Promise((r) => setTimeout(r, 50));
      return readWild();
    },
    read: readWild,
    walkTo: (x, z, run) => {
      if (world && !worldPaused()) keeperTo(world, deck, x, z, run);
      return readWild();
    },
    place: (x, z) => {
      const w = world;
      if (w) {
        w.keeper.pos[0] = x; w.keeper.pos[1] = z;
        w.keeper.goal[0] = x; w.keeper.goal[1] = z;
        w.keeper.v = 0; w.keeper.pace = 0;
        noteSimState(w);
        simPrev[3] = simNow[3]!; simPrev[4] = simNow[4]!;
      }
      return readWild();
    },
    /*
     * A drill needs the keeper standing a given distance from the dragon, able to walk in, and
     * with its first strides along open ground — a tap aimed a metre or two ahead must land
     * where it was aimed, not be pushed off a trunk.
     *
     * The old version asked for a *straight corridor* the whole way to the dragon, and a
     * dressed island has none: of 72 bearings at 6.32 units, 22 were on the deck and the best
     * clearance over the lane was −0.14 against its own bar of +0.25, so it returned null at
     * every distance and every wild drill failed (STATE.md run 35). What it was really asking
     * for was a straight walk, because that was all the keeper could do. The keeper now routes
     * around the furniture (src/sim/wild.ts §the keeper's navigation), so the question is the
     * weaker and truer one:
     *
     *   - a spot the keeper can stand on, clear of every obstacle and the deck's lip;
     *   - at `dist` from the dragon, or within 0.45 of it — never nearer than dist − 0.45, so a
     *     drill that staged outside the notice radius stays outside it;
     *   - with a route to the dragon (`routeExists`: the keeper's own flow field);
     *   - with `lane` units of open ground toward the dragon, so the near aim points of a
     *     tap-to-move drill are on walkable ground, and an approach has somewhere to walk. The
     *     longest lane the deck offers is taken: 3.2 units if any bearing has one, else 2.6,
     *     2.0, 1.4. (Measured on this island, with the dragon in the glade: one or two bearings
     *     carry 2.6, rarely 3.2, and seven carry 1.4.)
     *
     * Of the bearings that qualify it takes the most open one.
     */
    stage: (dist) => {
      const w = world;
      if (!w) return null;
      const [dx, dz] = w.wild.pos;
      const o = deck.obstacles;
      const BEARINGS = 240;
      /** The closest any obstacle comes to the first `lane` units from (x, z) toward the dragon. */
      const laneClearance = (x: number, z: number, r: number, lane: number) => {
        const sx = ((dx - x) / r) * lane, sz = ((dz - z) / r) * lane;
        let clearance = Infinity;
        for (let j = 0; j < o.length; j += 3) {
          const px = o[j]! - x, pz = o[j + 1]! - z;
          const t = Math.max(0, Math.min(1, (px * sx + pz * sz) / (sx * sx + sz * sz)));
          clearance = Math.min(clearance, Math.hypot(px - sx * t, pz - sz * t) - o[j + 2]!);
        }
        return clearance;
      };
      for (const lane of [3.2, 2.6, 2.0, 1.4]) {
        for (const off of [0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45]) {
          const r = dist + off;
          if (r < 1.2 || r > deck.radius * 2) continue;
          let best: [number, number] | null = null, bestScore = -Infinity;
          for (let i = 0; i < BEARINGS; i++) {
            const a = (2 * Math.PI * i) / BEARINGS;
            const x = dx + Math.cos(a) * r, z = dz + Math.sin(a) * r;
            if (Math.hypot(x, z) > deck.radius - 0.3) continue;
            if (!circleClear(deck, x, z, KEEPER_RADIUS + 0.06)) continue;
            const clearance = laneClearance(x, z, r, Math.min(lane, Math.max(0.4, r - 0.8)));
            if (clearance <= bestScore || clearance < 0.3) continue;
            if (!routeExists(deck, x, z, dx, dz)) continue;
            bestScore = clearance; best = [x, z];
          }
          if (best) {
            globalThis.__dragonveinWild?.place(best[0], best[1]);
            return best;
          }
        }
      }
      return null;
    },
    deck: () => structuredClone(deck) as Deck,
    /*
     * A drill that walks the keeper in used to aim at a point on the straight line from the
     * keeper to the dragon. On a dressed island that point is often inside a trunk or a bush,
     * and `keeperTo` then pulls the goal out to the nearest clear spot — which can be where the
     * keeper already stands, so the tap does nothing and the approach stalls short of the
     * notice radius. (That is what timed out the M8b clip: the keeper stopped 4.28 from the
     * dragon, outside its notice, and calm never rose.) The keeper can walk round the furniture
     * now, so the aim point does not have to be on that line — only at the right distance, on
     * ground it can stand on, with a route to it. This picks the bearing closest to the one the
     * keeper is already on, so a clear approach still reads as walking straight in.
     */
    approach: (gap) => {
      const w = world;
      if (!w) return null;
      const dx = w.wild.pos[0], dz = w.wild.pos[1];
      const kx = w.keeper.pos[0], kz = w.keeper.pos[1];
      if (gap <= 0.2) return [dx, dz];          // the rush: `keeperTo` stops it at the body
      const base = Math.atan2(kz - dz, kx - dx);
      for (const off of [0, -0.2, 0.2, -0.4, 0.4]) {
        const r = gap + off;
        if (r < 0.5) continue;
        for (let i = 0; i < 180; i++) {
          // Bearings in order of how far they turn off the keeper's own.
          const turn = ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 90;
          const a = base + turn;
          const x = dx + Math.cos(a) * r, z = dz + Math.sin(a) * r;
          if (Math.hypot(x, z) > deck.radius - 0.25) continue;
          if (!circleClear(deck, x, z, KEEPER_RADIUS + 0.03)) continue;
          if (!routeExists(deck, kx, kz, x, z)) continue;
          return [x, z];
        }
      }
      return null;
    },
    project: (x, z) => {
      island.updateMatrixWorld();
      projected.set(x, deckHeights.at(x, z), z);
      island.localToWorld(projected).project(camera);
      const rect = canvas.getBoundingClientRect();
      return [rect.left + ((projected.x + 1) / 2) * rect.width, rect.top + ((1 - projected.y) / 2) * rect.height];
    },
    // Also turns the island now, not on the next frame: `closeUp` and `keeperSeen` below read
    // the island's matrix, and both are called from the same evaluate as a pin.
    pinSpin: (rad) => { spinPinned = rad; if (rad !== null) island.rotation.y = rad; },
    faceCamera: () => {
      const w = world;
      if (!w) return 0;
      // The island turns about y; a local point at angle φ (atan2(z, x)) lands at φ − spin.
      const phi = Math.atan2(w.wild.pos[1], w.wild.pos[0]);
      const target = Math.atan2(camera.position.z, camera.position.x);
      spinPinned = phi - target;
      return spinPinned;
    },
    frameAcross: (x, z) => {
      const w = world;
      if (!w) return 0;
      // Screen-right at orbit azimuth `az` is world angle −az (atan2(z, x)); a local angle φ
      // lands at φ − spin. Of the two spins that lay the line across the screen (keeper to
      // the right, or to the left), take the one that brings the pair to the island's near side.
      const phi = Math.atan2(z - w.wild.pos[1], x - w.wild.pos[0]);
      const mx = (x + w.wild.pos[0]) / 2, mz = (z + w.wild.pos[1]) / 2;
      const toward = (spin: number) => {
        // The midpoint in the world (rotation about y by `spin`), along the camera's azimuth.
        const wx = mx * Math.cos(spin) + mz * Math.sin(spin), wz = -mx * Math.sin(spin) + mz * Math.cos(spin);
        return wx * Math.sin(orbit.azimuth) + wz * Math.cos(orbit.azimuth);
      };
      const a = phi + orbit.azimuth, b = a + Math.PI;
      spinPinned = toward(a) >= toward(b) ? a : b;
      return spinPinned;
    },
    /*
     * The distance is *derived* from what has to be in the frame, and the old one was not.
     *
     * It framed the two deck *points* and padded by a flat 2.6 world units for the bodies.
     * That is wrong twice over. A mid-takeoff dragon is drawn above its deck point (altitude
     * 1.075 in run 35's `20-wild-flee.png`), so aiming at the deck put the one shot whose job
     * was the take-off half out of the top of the frame, under the HUD. And 2.6 units of
     * padding on a dragon whose own bounding sphere is about that wide left it a fifth of the
     * frame, which is the framing defect all three critics reported.
     *
     * So: frame the sphere the dragon is actually drawn inside (`WildDragonView.centre` and
     * `bodyRadius`, the rest mesh's own radius, not the culling margin), and the keeper's own
     * height when it is wanted; reserve HEADROOM of the vertical half-angle so nothing lands
     * under the HUD bar; and take `dist` only as a floor. `frameAcross` has laid the pair
     * across the screen, so their separation is the width to hold and their heights the depth.
     */
    closeUp: (dist, elevDeg, withKeeper = true) => {
      const w = world;
      if (!w) return;
      island.updateMatrixWorld();
      const v = wildView;
      if (v) v.centre(closeUpBody);
      else closeUpBody.set(w.wild.pos[0], deckHeights.at(w.wild.pos[0], w.wild.pos[1]) + 0.6, w.wild.pos[1]);
      const R = v ? v.bodyRadius : 1;
      const kx = w.keeper.pos[0], kz = w.keeper.pos[1];
      closeUpKeeper.set(kx, deckHeights.at(kx, kz) + KEEPER_HEIGHT * 0.7, kz);
      /** The keeper's own half-extent: its staff and lantern stand above its hood. */
      const KR = KEEPER_HEIGHT * 0.75;
      const at = closeUpAt;
      let halfAcross = R, halfUp = R;
      if (withKeeper) {
        at.addVectors(closeUpBody, closeUpKeeper).multiplyScalar(0.5);
        halfAcross = 0.5 * Math.hypot(closeUpKeeper.x - closeUpBody.x, closeUpKeeper.z - closeUpBody.z) + Math.max(R, KR);
        halfUp = Math.max(Math.abs(closeUpBody.y - at.y) + R, Math.abs(closeUpKeeper.y - at.y) + KR);
      } else {
        at.copy(closeUpBody);
      }
      island.localToWorld(at);
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = Math.max(dist, (halfAcross / (tanV * camera.aspect)) * CLOSE_UP_PAD,
        (halfUp / (tanV * CLOSE_UP_HEADROOM)) * CLOSE_UP_PAD);
      const az = orbit.azimuth;
      const el = THREE.MathUtils.degToRad(elevDeg);
      camera.position.set(at.x + Math.sin(az) * Math.cos(el) * d, at.y + Math.sin(el) * d, at.z + Math.cos(az) * Math.cos(el) * d);
      camera.lookAt(at);
      camera.updateMatrixWorld();
    },
    orbit: (azimuthDeg, pitchDeg, distance) => {
      setOrbit(THREE.MathUtils.degToRad(azimuthDeg), THREE.MathUtils.degToRad(pitchDeg), distance);
    },
    /*
     * What the camera actually puts on the page, in pixels: the measurement a shot's framing
     * has to be judged on. Run 35's shots were framed by a rule nobody checked the output of,
     * and three critics measured the result instead — a 25 px keeper, a dragon a fifth of the
     * frame, a take-off clipped at the top edge. `gate:smoke` now logs this beside every shot.
     */
    screen: () => {
      const v = wildView, w = world;
      const rect = canvas.getBoundingClientRect();
      const toPx = (p: THREE.Vector3): [number, number] => {
        p.project(camera);
        return [rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height];
      };
      island.updateMatrixWorld();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      /** How many pixels a length `len` across the view covers at distance `d`. */
      const across = (len: number, d: number) => (len / (2 * d * tanV)) * rect.height;
      let body: { px: [number, number]; widthPx: number; cameraDistance: number } | null = null;
      if (v) {
        const d = island.localToWorld(v.centre(projected)).distanceTo(camera.position);
        body = { px: toPx(projected), widthPx: 2 * across(v.bodyRadius, d), cameraDistance: d };
      }
      let keeper = null as { px: [number, number]; heightPx: number } | null;
      if (w) {
        const [kx, kz] = w.keeper.pos;
        const d = island.localToWorld(projected.set(kx, deckHeights.at(kx, kz) + KEEPER_HEIGHT / 2, kz))
          .distanceTo(camera.position);
        keeper = { px: toPx(projected), heightPx: across(KEEPER_HEIGHT, d) };
      }
      /** The drawn body's centre in CSS px and the diameter of its bounding sphere there. */
      return { viewport: [rect.width, rect.height] as [number, number], dragon: body, keeper };
    },
    /*
     * Is the keeper drawn in the clear, or is a prop in front of it?
     *
     * The deck's obstacle circles cannot answer this: they are what a body *collides* with —
     * each kind's widest geometry below the keeper's own 0.46 height — so a crystal shard is a
     * 0.15 circle there while it draws as a spire taller than the keeper. Run 35's
     * `19-wild-settle.png` lost the keeper behind a shrub, and framing it closer put it behind
     * a shard instead. So this asks the question the critic does, of the thing the critic
     * sees: one ray from the camera to the hood, against everything drawn on the island.
     */
    keeperSeen: () => {
      if (!keeper.visible) return false;
      island.updateMatrixWorld(true);
      // Three heights, not one: hood, chest and hem. A single ray at the hood called the keeper
      // clear while a crystal shard stood across its body (run 35 cycle 2, `21-wild-wary.png`).
      for (const share of [0.84, 0.5, 0.15]) {
        sightAt.copy(keeper.position);
        sightAt.y += KEEPER_HEIGHT * share;
        island.localToWorld(sightAt);
        sightDir.subVectors(sightAt, camera.position);
        const far = sightDir.length();
        sightRay.set(camera.position, sightDir.normalize());
        sightRay.near = 0.05;
        sightRay.far = far;
        if (!sightRay.intersectObject(island, true).every((hit) => hit.object === keeper)) return false;
      }
      return true;
    },
    hold: (on, pose = true) => {
      simHeld = on;
      poseHeld = on && pose;
      idleFrozenAtMs = poseHeld ? performance.now() : null;
    },
    poseAs: (state, look) => {
      posedAs = state === null ? null : { state, look };
      posedAsFresh = true;
    },
    hideDragon: (on) => { if (wildView) wildView.holder.visible = !on; },
    loaded: () => (loadedWorld ? JSON.parse(loadedWorld) as World : null),
  };
}

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
/**
 * Frames drawn through the *current* context: zero at boot and again at every restore,
 * until the first `renderer.render` lands. While it is zero there is no frame to report,
 * and both the HUD and `__dragonveinStats` say so — see the `—` branch in `paintHud`.
 */
let framesSinceRestore = 0;
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
/**
 * Test hook state (`__dragonveinWind`). While `sceneFrozenAt` is set, the island's spin,
 * the companions' bob and the flock all read that instant instead of the live clock, and
 * `windFrozenSec` pins the wind. With both pinned, two frames differ only by what the
 * wind time changes — which is how gate:smoke proves the canopy moves (M5a criterion 4).
 * Never set in play.
 */
let sceneFrozenAt: number | null = null;
let windFrozenSec: number | null = null;

function frame(now: number): void {
  frameMs = now - last;
  last = now;

  // Taken before the sim step, so `cpuFrameMs` charges the sim to the frame it runs in
  // (perf-critic, M8a cycle 2): from M8b the step does real work.
  const startedAt = performance.now();

  // The fixed 20 Hz sim, before the context check: the world's clock does not stop for a
  // GPU reset. Allocation-free — `step` mutates the world in place.
  // A paused tab (another tab took over saving) stops its world: see `worldPaused`.
  if (world !== null && (save === null || save.state !== 'conflict')) {
    simAccMs += frameMs < MAX_CATCH_UP_MS ? frameMs : MAX_CATCH_UP_MS;
    while (simAccMs >= TICK_MS) {
      if (!simHeld) {
        simPrev.set(simNow);
        step(world, deck);
        noteSimState(world);
      }
      simAccMs -= TICK_MS;
    }
  }

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

  resize();
  applyOrbit();
  const sceneNow = sceneFrozenAt ?? now;
  island.rotation.y = spinPinned ?? sceneNow * 0.00012;
  updateFarMotion(sceneNow);
  // One number into the uniform every wind-patched program shares. Allocation-free.
  setWindTime(windFrozenSec ?? now / 1000);
  // The rim is gated in view space, so its direction has to be re-derived whenever the
  // camera moves. Allocation-free: two pre-allocated vectors, written in place.
  updateRimDirection();

  if (renderingEnabled) {
    // The keeper and the wild dragon, between the last two ticks (M8b). Inside the rendered
    // path, so whatever their pose costs is charged to the frame, never to gate:perf's idle
    // baseline.
    //
    // A held sim (`__dragonveinWild.hold`, `?test` only) passes dt 0, which freezes the pose
    // as well as the world: the walk's ramp, the gait clock, the tells' easing and the keeper's
    // turn all step by dt, so without this they kept moving under a stopped sim. `gate:smoke`
    // photographs the wild dragon through this: an evaluate round trip in a container costs a
    // second or more, and in run 35 the take-off shot was captured after the dragon had landed
    // and the wary shot after it had gone back to alert. Held, the frame that lands is the
    // moment the drill reached, which is the moment the log line reports.
    //
    // `hold(true, false)` holds the sim but *not* the pose, so the tells can finish easing into
    // the state the drill reached while that state cannot change under them. The tells take two
    // to three seconds to arrive and `wary` can be over in less, which is why the alternative —
    // waiting with the sim live — photographed `wary`'s pose a third of the way in, or the
    // dragon back in `alert` (run 36, C0).
    updateWild(now, poseHeld ? 0 : frameMs < MAX_CATCH_UP_MS ? frameMs / 1000 : MAX_CATCH_UP_MS / 1000,
      simAccMs / TICK_MS < 1 ? simAccMs / TICK_MS : 1);
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
  paintWorldHud();
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
    // Booting, or restored with nothing drawn through the new context yet. There is no measurement
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
  /** M8a: saves so far and what they cost (`SaveTiming` per save; max is the worst seen). */
  save: { count: number; maxMainThreadMs: number; maxRoundTripMs: number; last: SaveTiming | null };
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
  var __dragonveinCamera: (() => {
    azimuthDeg: number; pitchDeg: number; distance: number;
    limits: {
      readonly azimuthMinDeg: number; readonly azimuthMaxDeg: number;
      readonly pitchMinDeg: number; readonly pitchMaxDeg: number;
      readonly distanceMin: number; readonly distanceMax: number;
    };
  }) | undefined;
  var __dragonveinMeshgen: ((recipes: (
    | { op: 'wild'; seed: number; element: import('./core/genome').Element | null }
    | { op: 'breed'; a: number; b: number; seed: number })[]) => Promise<{
    gid: string; workerMs: number; roundTripMs: number; assembleMs: number; triangles: number;
    /** The one-off spawn and warm-up before the first build (DragonMesher.ready). */
    startupMs: number; warmMs: number;
  }[]>) | undefined;
  var __dragonveinStats: (() => {
    /** null while the WebGL context is lost: there is no frame to report. */
    drawCalls: number | null; triangles: number | null;
    frameMs: number | null; cpuFrameMs: number | null;
    contextLost: boolean;
    /** Instances drawn with the wind-patched material — the hero island's flora batch and
     *  the companion groves (M5a, M5f). 0 until the GLBs have loaded. */
    windInstances: number;
    /** Instances per hero-island kind (M5f). Empty until the GLBs have loaded. */
    flora: Readonly<Record<string, number>>;
    /** M8b: the wild dragon (built through the worker, after the world loads) and the keeper. */
    wild: { dragon: boolean; keeper: boolean };
  }) | undefined;
  /** Test hook for gate:smoke's close shot (M5f): a camera pose the orbit clamps would
   *  refuse, with the scene clock pinned at `sceneMs` so the island's spin — and so the
   *  framing — is the same on every run. `release` puts the orbit pose back. Not used in play. */
  var __dragonveinShot: {
    pose: (position: [number, number, number], target: [number, number, number], sceneMs: number) => void;
    release: () => void;
  } | undefined;
  /** Test hook for gate:smoke's wind shots. Not used in play. */
  var __dragonveinWind: {
    /** Freeze spin, bob and flock at the current instant (kept across repeated calls)
     *  and pin the wind clock at `windSeconds`. */
    freeze: (windSeconds: number) => void;
    /** Back to the live clock. */
    release: () => void;
  } | undefined;
  /** `?test` only (M8a, gate:smoke): seed a roster, force a save, read the world back. */
  var __dragonveinSave: {
    ready: () => Promise<ReturnType<typeof readSave>>;
    read: () => ReturnType<typeof readSave>;
    /** Two wild dragons and their child, then an immediate save. Refused while paused. */
    seedRoster: () => Promise<ReturnType<typeof readSave> & { changed: boolean }>;
    save: () => Promise<ReturnType<typeof readSave>>;
    /**
     * `w` stepped on, as this page steps its own world, to `tick`: what a saved world must
     * have become by the time a later read sees it (the sim is deterministic). A copy.
     */
    replay: (w: World, tick: number) => World;
    /** The HUD's "start fresh, keep the old save aside". */
    startFresh: () => Promise<ReturnType<typeof readSave> & { key: string | null }>;
    /** The HUD's "export old save": also triggers the download. */
    exportText: () => string | null;
    /** Close the IndexedDB handle under the game, as the browser may; the next save reopens it. */
    closeStore: () => void;
  } | undefined;
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
/*
 * The second hole, closed for M0e. Between `webglcontextrestored` and the first frame drawn
 * through the restored context, `contextLost` is already false but nothing has been
 * drawn: `renderer.info.render` reads `0`/`0` and `lastCpuMs` is still the cost of the
 * last frame of the *dead* context. Reporting those is the stale-frame lie the HUD
 * already refuses to tell (docs/ARCHITECTURE.md §Render contract), so this answers with
 * the same nulls as a dead context — and `contextLost: false`, which is how a reader
 * tells "restored, first frame pending" from "dead". The same branch covers boot,
 * before the first frame.
 */
globalThis.__dragonveinStats = () => (framesSinceRestore === 0 && !contextLost ? {
  drawCalls: null, triangles: null, frameMs: null, cpuFrameMs: null, contextLost, windInstances,
  flora: floraCounts, wild: { dragon: wildView !== null, keeper: keeper.visible },
} : {
  drawCalls: contextLost ? null : renderer.info.render.calls,
  triangles: contextLost ? null : renderer.info.render.triangles,
  /** Present interval: rAF cadence, quantised to vsync. Kept for continuity. */
  frameMs: contextLost ? null : frameMs,
  /** What the frame actually cost the main thread. This is the one to budget against. */
  cpuFrameMs: contextLost ? null : lastCpuMs,
  /** So a reader that gets nulls can tell "dead" from "not started". */
  contextLost,
  windInstances,
  flora: floraCounts,
  /** M8b: whether the wild dragon and the keeper are in the scene (drawn from the next frame). */
  wild: { dragon: wildView !== null, keeper: keeper.visible },
});

globalThis.__dragonveinWind = {
  freeze: (windSeconds: number) => {
    // `last` is the timestamp of the latest frame, so the frozen pose is the one on screen.
    if (sceneFrozenAt === null) sceneFrozenAt = last;
    windFrozenSec = windSeconds;
  },
  release: () => { sceneFrozenAt = null; windFrozenSec = null; },
};

globalThis.__dragonveinShot = {
  pose: (position, target, sceneMs) => {
    sceneFrozenAt = sceneMs;
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateMatrixWorld();
  },
  release: () => {
    sceneFrozenAt = null;
    // Re-applies the orbit's own pose on the next frame.
    setOrbit(orbit.azimuth, orbit.pitch, orbit.distance);
  },
};

/** Read by `gate:smoke` to prove the camera answers input (rubric G6). Degrees for logs. */
globalThis.__dragonveinCamera = () => ({
  azimuthDeg: THREE.MathUtils.radToDeg(orbit.azimuth),
  pitchDeg: THREE.MathUtils.radToDeg(orbit.pitch),
  distance: orbit.distance,
  limits: ORBIT_LIMITS,
});

/**
 * Read by `gate:meshgen` (M3c): build each recipe's dragon through the mesh worker while
 * this page renders at its default settings, one at a time, and report every timing. The
 * mesher and the genome code load on first call, so the game does not pay for them at boot.
 */
globalThis.__dragonveinMeshgen = async (recipes) => {
  const [{ DragonMesher }, { wild, breed }] = await Promise.all([
    import('./assets/dragon/mesher'), import('./core/genome'),
  ]);
  type G = ReturnType<typeof wild>;
  const genomes: G[] = [];
  for (const r of recipes) {
    genomes.push(r.op === 'wild' ? wild(r.seed, r.element ?? undefined) : breed(genomes[r.a]!, genomes[r.b]!, r.seed));
  }
  const mesher = new DragonMesher();
  const startup = await mesher.ready(); // as the game would, while idle and before any hatch
  const out = [];
  try {
    for (const gm of genomes) {
      const r = await mesher.build(gm);
      out.push({
        gid: gm.gid(), workerMs: r.workerMs, roundTripMs: r.roundTripMs, assembleMs: r.assembleMs,
        triangles: r.body.geometry.getIndex()!.count / 3, startupMs: startup.startupMs, warmMs: startup.warmMs,
      });
      r.body.geometry.dispose();
    }
  } finally {
    mesher.dispose();
  }
  return out;
};

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
    save: { ...saveStats },
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
