import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, SMAAPreset, ToneMappingMode } from 'postprocessing'
import {
  Environment,
  Lightformer,
  OrbitControls,
  PerformanceMonitor,
  Sky,
} from '@react-three/drei'
import * as THREE from 'three'
import { EASE, gsap, prefersReducedMotion, useGSAP } from '../animations/gsap'
import { useIdle } from '../hooks/useIdle'
import { Ambient } from './Ambient'
import { Monument } from './Monument'
import { CameraRig } from './CameraRig'
import { frameScale } from './framing'
import { Districts } from './DistrictLayer'
import { Island, Water } from './Island'
import type { DistrictId } from './districts'
import type { SubFocus } from './landmarks'

/**
 * Shared by the sky shader and the shadow-casting sun so they agree.
 *
 * Same direction as before, moved ~3x further out. A directional light's
 * position only sets its direction for shading, but it IS where the shadow
 * camera sits — and at the old distance that camera could not enclose a world
 * this size no matter how its bounds were set.
 */
const SUN: [number, number, number] = [141, 105, 80]

type Props = {
  focus: DistrictId | null
  onFocus: (id: DistrictId | null) => void
  /**
   * Raised while the camera is down among the world map, so the page chrome can
   * get out of the way.
   *
   * The decision belongs in here rather than in App, because it is a fact about
   * where the camera is — a continuous thing only the render loop sees — and
   * the alternative is App subscribing to the camera to answer a question the
   * scene has already answered for its own level-of-detail switch.
   */
  onImmersive: (immersive: boolean) => void
  /**
   * Put the whole world back regardless of where the camera is.
   *
   * Raised for the two frames between the visitor asking to leave the map and
   * focus actually clearing, so that the retreat flies out through a scene that
   * is already there rather than one that materialises around it. See the note
   * in App.
   */
  forceWorld: boolean
  /** The country chosen on the world map, for the page to describe. */
  onCountry: (name: string | null) => void
}

/**
 * `dpr={[1, 2]}` on the Canvas is a clamp, not an adaptive range — it only
 * becomes adaptive once something calls setDpr, and nothing did. On a retina
 * display that meant rendering ~5.9M fragments every frame regardless of how
 * the frame time was going, and those are expensive fragments: the ocean covers
 * most of the screen with a full standard material lit by the PMREM probe plus
 * four lights, and every lit fragment also takes a soft-shadow lookup.
 *
 * Driving dpr from the measured factor rather than a hard 2/1 flip keeps the
 * change gradual, and leaves fast machines at full resolution.
 */
/** Radians per second-ish; three multiplies this by 2pi/60/60 internally. */
/*
  Raised from 0.28, and the idle delay in useIdle cut alongside it.

  0.28 at 60Hz is about a sixth of a degree per second: over a ten-second pause
  the world turned by less than two degrees, which is under the threshold at
  which anyone notices it moved at all — so the feature was paying for itself in
  code and returning almost nothing. At 0.9 the same pause carries five degrees,
  which reads as a slow deliberate drift rather than as a still image, and each
  idle spell covers enough ground to show the archipelago from a new angle.
*/
const IDLE_SPEED = 0.9

type OrbitApi = { autoRotate: boolean; autoRotateSpeed: number }

/**
 * A slow drift once the page is left alone.
 *
 * The highest impact per line in the whole scene: a dead-still frame reads as a
 * screenshot, and the smallest continuous movement reads as a living world.
 * OrbitControls has had `autoRotate` available all along; what it never had was
 * anything deciding when to switch it on.
 *
 * Three conditions, and each one matters. Idle, or it fights the visitor.
 * Unfocused, or it slides off the district they asked to look at. Not flying —
 * because `controls.enabled = false` does NOT suppress autoRotate: three
 * applies it inside update() with no such check, and CameraRig calls update()
 * on every tween tick, so during a flight it would be a second writer on the
 * camera.
 */
function IdleOrbit({ active }: { active: boolean }) {
  const controls = useThree((s) => s.controls) as OrbitApi | null
  const speed = useRef({ value: 0 })

  useGSAP(() => {
    if (!controls) return

    if (!active || prefersReducedMotion()) {
      // Off at once rather than ramped down. The ramp matters on the way in, so
      // the drift starts imperceptibly; on the way out the camera simply stops,
      // and anything lingering would be fighting a flight for the camera.
      gsap.killTweensOf(speed.current)
      speed.current.value = 0
      controls.autoRotateSpeed = 0
      controls.autoRotate = false
      return
    }

    controls.autoRotate = true
    // Ramp shortened with it. 2.6s to reach full speed was most of a short
    // pause spent barely moving; 1.3s still starts imperceptibly.
    gsap.to(speed.current, { value: IDLE_SPEED, duration: 1.3, ease: EASE.smooth })
  }, [active, controls])

  /*
    three advances the auto-rotation by (2pi/60/60) * autoRotateSpeed once per
    update() CALL, not per second — so handing it a constant makes the world
    drift at twice the speed on a 120Hz display and half on a struggling one.
    Scaling by delta*60 reproduces the 60Hz behaviour exactly and holds it
    steady everywhere. The delta is clamped because returning to a backgrounded
    tab delivers one enormous frame, which would otherwise snap the camera.
  */
  useFrame((_, delta) => {
    if (controls) controls.autoRotateSpeed = speed.current.value * Math.min(delta, 1 / 30) * 60
  })

  return null
}

/**
 * Keeps exactly one ACES curve applied, whichever path is drawing.
 *
 * The composer's ToneMapping effect and the renderer's own toneMapping are two
 * separate applications of the same curve, and which of them is live depends on
 * whether the composer is mounted. Left to itself that is a visible jump in
 * contrast at the moment the map takes over the screen — either double-graded
 * before or ungraded after. Naming both states explicitly means the transition
 * is only a change in sharpness, which is the change that was intended.
 */
function ToneCurve({ composited }: { composited: boolean }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMapping = composited ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
  }, [gl, composited])
  return null
}

function AdaptiveDpr({ pinned }: { pinned: boolean }) {
  const setDpr = useThree((s) => s.setDpr)
  /** The value last handed to setDpr, and when. */
  const applied = useRef(0)
  const changedAt = useRef(0)

  /*
    Every call to setDpr reallocates the drawing buffer and, because there is an
    EffectComposer in the tree, every render target behind it. The frame that
    lands between the reallocation and the next completed render has nothing in
    it, which is the black flash.

    Two guards, and the second is the one that matters. Sending only changed
    values removes the repeats. But PerformanceMonitor's factor is a continuous
    reading of a continuously varying frame rate — it moves whenever the camera
    does — so a ratio derived from it lands on a genuinely different number
    every few seconds, and every one of those was a reallocation the visitor
    saw. Three coarse steps rather than ten fine ones, and at most one change
    every four seconds, turns a scene that reallocated its buffers all afternoon
    into one that does it once or twice on arrival and then stops.

    Resolution is not worth a flicker. The whole point of adapting it is to keep
    the frame rate smooth, and a black frame is the least smooth thing the
    renderer can do.
  */
  const apply = (next: number, now = performance.now()) => {
    if (next === applied.current) return
    if (now - changedAt.current < 4000) return
    applied.current = next
    changedAt.current = now
    setDpr(next)
  }

  /*
    While the world map is the subject, resolution is pinned and the monitor is
    ignored — and pinned ABOVE native on a 1x display. Everything but the map is
    unrendered down there, so there is nothing to save by rendering coastlines
    at three-quarter scale, which is what made the map look pixelated. Rendering
    at 1.5x and letting the browser downsample is supersampling by another name.

    The pin bypasses the rate limit: it happens once, on a deliberate
    navigation, and the visitor is watching a camera flight while it lands.
  */
  useEffect(() => {
    if (!pinned) return
    const next = Math.min(2, Math.max(window.devicePixelRatio, 1.5))
    if (next === applied.current) return
    applied.current = next
    changedAt.current = performance.now()
    setDpr(next)
  }, [pinned, setDpr])

  return (
    <PerformanceMonitor
      // Seeded at the top of the range. The default of 0.5 would drop
      // resolution unconditionally a couple of seconds in — right through the
      // reveal — and then staircase back up over the following ten.
      factor={1}
      onChange={({ factor }) => {
        if (pinned) return
        /*
          Three steps: full, seven-eighths, three-quarters of the panel's own
          ratio. Scaling the NATIVE ratio rather than handing setDpr an absolute
          number matters — an absolute value derived from factor alone would
          supersample a 1x display up to 2x, quadrupling its fragment count in
          the name of saving fragments.

          The floor is 0.75, not the 0.5 it began at. Half of a 2x display is a
          literal halving of the resolution in each axis, which reads — quite
          correctly — as the whole thing being pixelated.
        */
        const native = Math.min(window.devicePixelRatio, 2)
        const step = factor > 0.66 ? 1 : factor > 0.33 ? 0.875 : 0.75
        apply(Math.max(1, Math.round(native * step * 20) / 20))
      }}
    />
  )
}

/*
  Grading, not effects.

  The scene was rendering straight to the canvas with no tone curve, which is
  why it read flat and plasticky however much geometry went into it: every
  highlight clipped to the same white and every shadow sat at the same lifted
  grey. ACES filmic gives the roll-off that makes bright surfaces feel bright
  rather than blown, bloom lets the beacon and the emissive accents actually
  glow, and a light vignette stops the frame reading as an evenly-lit product
  shot. SMAA because EffectComposer renders to a framebuffer, which disables the
  Canvas's MSAA — without it every roofline and column edge crawls.

  Held as ONE element built once at module scope, and that is the fix for the
  intermittent black flash rather than a tidying-up.

  @react-three/postprocessing rebuilds its pass chain in an effect keyed on
  `children`, and JSX creates a new children array on every render of its
  parent. Scene re-renders whenever `idle`, `flying` or `mapDetail` changes —
  and `idle` alone flips a couple of seconds after every pause and back on the
  next mouse move — so the composer was tearing down and rebuilding its render
  targets several times a minute during ordinary use. Each rebuild is a frame
  with nothing in the buffer.

  React bails out of reconciling a subtree when the element is referentially
  identical to the previous one, so hoisting it here makes those re-renders
  invisible to it. Everything inside is static, so there is nothing to close
  over and no reason for it ever to be rebuilt.
*/
const GRADING = (
  <EffectComposer multisampling={0} enableNormalPass={false}>
    <Bloom intensity={0.42} luminanceThreshold={0.82} luminanceSmoothing={0.28} mipmapBlur />
    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    <Vignette offset={0.32} darkness={0.42} blendFunction={BlendFunction.NORMAL} />
    {/*
      ULTRA rather than the MEDIUM default.

      SMAA is the only antialiasing this scene has: EffectComposer renders into
      a framebuffer, which disables the Canvas's MSAA outright. The preset sets
      how far the edge-detection search runs, and the difference shows exactly
      where it is being asked to work hardest — a coastline is thousands of
      short, near-diagonal segments, which is the case MEDIUM gives up on
      soonest and the case the world map is made of. It is a post-process on a
      full-screen quad, so the cost is a handful of extra texture fetches per
      pixel and nothing at all in the scene.
    */}
    <SMAA preset={SMAAPreset.ULTRA} />
  </EffectComposer>
)

/**
 * Watches how close the camera has come to what it is looking at, and says when
 * the world map has become the subject rather than an object in a garden.
 *
 * A useFrame rather than a reaction to the focus change, because "focused on
 * the Garden" and "reading the map" are different states: the district is
 * ARRIVED at from 22 units with the whole island in frame, and it should look
 * its best there. Only once the visitor has chosen to come closer does trading
 * the scenery for the map become the right bargain.
 *
 * Hysteresis, and it is not optional. A single threshold on a value the visitor
 * drives continuously — and that OrbitControls keeps damping for a second after
 * they stop — sits exactly on the boundary sooner or later and flips the whole
 * scene's level of detail every frame. Fourteen down, seventeen back up: a
 * three-unit band is wider than the damping ever overshoots.
 *
 * setState only on a crossing, so the common case costs one distance
 * calculation per frame and no React work at all.
 */
function MapDetail({ active, onChange }: { active: boolean; onChange: (low: boolean) => void }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3 } | null
  const low = useRef(false)

  const set = (next: boolean) => {
    if (low.current === next) return
    low.current = next
    onChange(next)
  }

  useFrame(() => {
    if (!active || !controls?.target) {
      set(false)
      return
    }
    const d = camera.position.distanceTo(controls.target)
    if (d < 14) set(true)
    else if (d > 17) set(false)
  })

  return null
}

export function Scene({ focus, onFocus, onImmersive, forceWorld, onCountry }: Props) {
  /*
    True while the camera is down among the Geographical Garden's map. Drives
    every level-of-detail decision in this file: the coarse island, the dropped
    ambient layer, and the other five districts going unrendered.
  */
  const [mapDetailRaw, setMapDetail] = useState(false)
  const mapDetail = mapDetailRaw && !forceWorld

  /*
    Where inside the focused district the camera should be looking, if anywhere
    more specific than the district itself. Only the world map raises it, when a
    country is chosen.

    Held here rather than inside the Garden because the camera is not the
    Garden's to move: CameraRig is the single writer of camera.position, and the
    whole point of that rule is that no component gets to make an exception for
    itself.
  */
  const [subFocus, setSubFocus] = useState<SubFocus | null>(null)
  // Held here so the labels can occlude against the landmass they sit on. This
  // is the coarse proxy, not the display mesh — see islandOccluderGeometry.
  const occluder = useRef<THREE.Mesh>(null!)

  // The fog ramp is in world units, so it has to move with the camera. A phone
  // pulls back to 1.5x (framing.ts) and would otherwise sit the whole island
  // inside a ramp tuned for a desktop distance, greying it out.
  const size = useThree((s) => s.size)
  const scale = frameScale(size.width / size.height)

  // Two renders per flight, not per frame — this is app state, not transform
  // state, so React is the right place for it.
  const [flying, setFlying] = useState(false)
  const idle = useIdle()

  /*
    Captured at mount. Arriving on a shared #district link means CameraRig parks
    at that district on frame one — so the reveals, which are keyed to mount
    rather than to focus, would play out underneath a camera already pointed at
    where their subject is going to be. Decided here so the landmass and the
    landmarks cannot disagree about it.
  */
  const deepLinked = useRef(focus !== null).current

  /*
    The shadow camera is centred on the light's TARGET, and the default target
    is the world origin — which is now a patch of open water. With the mainland
    weighted to -Z, an origin-centred box spends tens of units on empty ocean on
    one side while clipping the mainland's far corner on the other. Aiming at
    roughly the centroid of the land lets a smaller map cover more of what
    actually casts a shadow.
  */
  const sunTarget = useMemo(() => new THREE.Object3D(), [])

  return (
    <>
      <Sky sunPosition={SUN} turbidity={5} rayleigh={1.6} mieCoefficient={0.008} mieDirectionalG={0.82} />
      {/*
        Pulled well back. At [110, 340] against a camera 189 units out, the
        near islands were already 30-60% hazed and the whole frame washed to one
        pale blue — the fog was doing the job of distance on things that are not
        distant. Starting at 200 leaves the archipelago itself clear and saves
        the haze for the mainland and the world's rim, which is what it is for.
      */}
      <fog attach="fog" args={['#bcd2e4', 200 * scale, 560 * scale]} />

      {/*
        A procedural environment rather than an HDRI preset: drei's presets are
        fetched from a CDN at runtime, which would add a network dependency to a
        statically hosted page. Lightformers give the metals something to
        reflect without leaving the bundle.
      */}
      <Environment resolution={256}>
        <Lightformer form="ring" intensity={3.2} color="#ffe6bd" scale={16} position={[24, 18, -12]} />
        <Lightformer form="rect" intensity={0.9} color="#9fc4ff" scale={[80, 40]} position={[-40, 20, -20]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#7fb0d8" scale={[90, 90]} position={[0, -30, 0]} rotation-x={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.7} color="#dceaff" scale={[90, 40]} position={[0, 40, 0]} rotation-x={Math.PI / 2} />
      </Environment>

      {/*
        Fill was the other half of the toy problem, alongside flat materials.

        Ambient 0.35 plus hemisphere 0.6 put nearly a full unit of directionless
        light on every surface, which meant no face on any object was ever
        properly dark. Shadowed sides sat at almost the same value as lit ones,
        every cast shadow washed out to a grey smudge, and with no tonal range
        across a form the eye reads it as small and moulded — the same reason
        product photography of miniatures uses a light tent.

        Cut to roughly a third. The key below carries the scene now, the
        hemisphere supplies the sky/ground colour split that keeps shadows blue
        rather than black, and the Environment above still handles the metals.
      */}
      <ambientLight intensity={0.12} />
      <hemisphereLight args={['#cfe4ff', '#41513c', 0.32]} />
      <primitive object={sunTarget} position={[10, 0, -28]} />
      <directionalLight
        castShadow
        target={sunTarget}
        position={SUN}
        intensity={3.4}
        color="#fff2dc"
        // 3072 rather than 4096: a 4096 map is ~128MB resident, two thirds of
        // it a colour attachment nothing samples, and it is re-rendered every
        // frame for the ~3s before the freeze. At 3072 over the 200-unit box
        // below that is still ~15 texels per world unit — close to the 24 the
        // old single island had at 2048 over 84 units.
        shadow-mapSize={[3072, 3072]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        // Near/far are measured from the light, which now sits ~190 units out.
        shadow-camera-near={60}
        shadow-camera-far={340}
        // ±100 about the aimed target above, which encloses the land: islands
        // reach x ±69 and the mainland runs to z -101 before the rim fade.
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />

      {/*
        The ocean goes with everything else. It is the single most expensive
        surface in the scene — 160,000 vertices displaced in the vertex stage,
        covering most of the frame with a lit standard material and a
        per-fragment ripple — and from directly above a plate that fills the
        window, none of it is visible.
      */}
      <Water visible={!mapDetail} />
      {/*
        The sky's ornaments go when the map does. Clouds are large transparent
        meshes that cost fill wherever they cover the frame, and neither they
        nor the birds nor the boat is on screen with the camera five units above
        a plate — they are all above or beyond it.
      */}
      <Ambient visible={!mapDetail} />

      {/*
        The island's geometry is built on a worker, so Island suspends. Sky,
        ocean, lighting and the ambient layer sit OUTSIDE this boundary and
        paint on the first frame; the land arrives when it is ready and plays
        its reveal then.

        Districts is inside the same boundary on purpose. Its labels raycast
        their occlusion against a ref that Island owns, and three's raycaster
        dereferences whatever it is handed — an undefined entry in that array
        throws on every frame. Mounting the two together means the ref is never
        empty while something is reading it.
      */}
      <Suspense fallback={null}>
        {/*
          `hidden` rather than `lowDetail` now: down on the map the island is not
          worth drawing at any resolution, so the coarse stand-in is gone too.
          The invisible raycast proxy stays mounted either way — it is what the
          district labels occlude against, and three does not consult `visible`
          when raycasting.
        */}
        <Island
          occluderRef={occluder}
          deepLinked={deepLinked}
          onPick={onFocus}
          hidden={mapDetail}
        />
        {/* Inside the boundary with the land it stands on — it reads the height
            field for its own footing, and appearing before the island does
            would leave it floating. */}
        {/* Off with the rest of the archipelago while the map is the subject —
          it stands on the centre island, well outside the map's frame. */}
        <Monument visible={!mapDetail} />
        <Districts
          focus={focus}
          onFocus={onFocus}
          occluders={occluder}
          deepLinked={deepLinked}
          /*
            Down among the map, the other five districts are 50 to 100 units
            away laterally and none of them is in frame. They are still drawn,
            though — a lighthouse is not one mesh but a lathe, a rail, a door
            and nine windows, and frustum culling happens per object, so five
            districts' worth of small draw calls are issued to render nothing.
          */
          soloDistrict={mapDetail ? focus : null}
          onSubFocus={(view) => {
            setSubFocus(view)
            onCountry(view?.name ?? null)
          }}
        />
      </Suspense>

      {/*
        No post-processing while the world map is the subject, and this is the
        fix for the black frames rather than a performance tweak.

        Measured: the composer renders the archipelago at a 2100x1275 buffer
        without complaint, and produces an 82%-black frame — persistently, not
        as a flicker — at the 2800x1700 buffer the map pins itself to. Its own
        allocations are the reason. Two full-size HDR targets to ping-pong
        between, bloom's mipmap chain on top of those, and SMAA's edge and
        weight targets besides, all scaling with the square of the resolution;
        somewhere past four and a half million pixels the whole chain stops
        producing output. That threshold is a property of the machine, which is
        exactly why it shows up as an occasional black flash on one and never on
        another.

        Dropping it here costs nothing the map wants. There is no bloom to catch
        — the emissive accents are all in the districts that are no longer being
        drawn — and a vignette on a document is just a stain. What it BUYS is
        the thing that was actually being asked for: EffectComposer renders into
        a framebuffer, which turns the Canvas's MSAA off, and SMAA is a
        post-process guess at the edges MSAA would have resolved exactly. A
        coastline is tens of thousands of short near-diagonal segments, which is
        the worst case for the guess and the best case for the real thing. Side
        by side at 2x the unprocessed map is visibly sharper.
      */}
      {!mapDetail && GRADING}
      <ToneCurve composited={!mapDetail} />

      <MapDetail
        active={focus === 'geography'}
        onChange={(low) => {
          setMapDetail(low)
          onImmersive(low)
        }}
      />

      <AdaptiveDpr pinned={mapDetail} />
      <IdleOrbit active={idle && focus === null && !flying} />
      <CameraRig focus={focus} subFocus={subFocus} onFlyingChange={setFlying} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        /*
          18 everywhere except the Geographical Garden, which is 5.

          18 is right for a district whose subject is a building: closer than
          that and the camera is inside the colonnade. The Garden's subject is a
          12.6-unit map with 177 countries on it, several of which survive
          simplification as a quadrilateral, and at 18 units they are a pixel
          across and unclickable. Letting the camera come in to 5 is what makes
          "each country selectable" true of Luxembourg as well as of Russia.

          Applied through OrbitControls rather than by moving the parked view,
          because it is a floor on zoom, not a framing — the district still
          ARRIVES at 22 units with the whole world in frame, and coming closer
          is then something the visitor chooses.
        */
        /*
          1.2 on the world map, and the number is set by the country flight
          rather than by taste.

          minDistance is not only a limit on the visitor's wheel — OrbitControls
          enforces it inside update(), and CameraRig calls update() on every
          tick of every flight. So any flight that ends closer than minDistance
          does not end there: it runs until it reaches the limit and then stops
          dead, mid-ease, with the tween still writing positions that update()
          overwrites. Recorded on a descent onto the Congo at the old value of
          5, the camera travelled from 10 units to 8.6 and then snapped to
          exactly 5.000 and sat there — which is what "not smooth" looked like.

          Country framings clamp to a floor of 1.6 units, so this sits below
          that with headroom. It costs nothing: the wheel is disabled on this
          district, so nothing but a flight can reach the limit at all.

          `|| flying` covers the way out, which has the same problem in reverse.
          Focus clears while the camera is still one to ten units above a
          country, and if the limit snapped back to 18 on that frame, update()
          would shove the camera out to 18 units before the retreat had drawn
          anything — a jump of up to sixteen units in one frame, at the exact
          moment the visitor is watching for the world to come back. Holding the
          low limit until the flight lands means the tween owns the whole path
          in both directions.
        */
        minDistance={focus === 'geography' || flying ? 1.2 : 18}
        /*
          The wheel is dead on the world map.

          Not to protect the framing, but because there is somewhere better for
          the gesture to go: on this district coming closer means choosing a
          country, and clicking one flies the camera down to frame it. A free
          zoom alongside that is a second way to do the same thing which lands
          wherever the pointer happened to be — including under the plate or out
          past the hedge, neither of which is a view of anything. Orbit is
          untouched.
        */
        enableZoom={focus !== 'geography'}
        // Home is ~126 units out and framing.ts pulls back up to 2x on a portrait
        // phone, so the ceiling has to clear 252.
        maxDistance={320}
        /*
          Was PI/2.15 (83.7 degrees). At that tilt the camera dips BELOW the
          ground on a district whose plateau sits lower than the land around it
          — measured on Scientific Shores, whose pad of 2.0 sits in mainland
          standing 6-7 units high: 34 of 72 azimuths put the camera up to a unit
          underground, looking out through a front-sided material at sky. This
          is a general guard, not a per-district patch.
        */
        maxPolarAngle={Math.PI / 2.3}
      />
    </>
  )
}
