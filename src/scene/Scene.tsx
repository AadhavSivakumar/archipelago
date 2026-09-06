import { Suspense, useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, SMAAPreset, ToneMappingMode } from 'postprocessing'
import {
  Environment,
  Lightformer,
  OrbitControls,
  Preload,
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
 * The device pixel ratio, chosen once and never changed again.
 *
 * This replaces a PerformanceMonitor that drove setDpr from the measured frame
 * rate. The idea was sound — render fewer fragments when the machine is
 * struggling — but the cost was hidden in the mechanism: every call to setDpr
 * reallocates the drawing buffer and, with an EffectComposer in the tree, every
 * render target behind it, and the frame between the reallocation and the next
 * completed render has nothing in it. That is a black flash. Adapting
 * resolution to protect smoothness, by way of a black frame, is not a trade
 * worth making; and because the factor tracked a continuously varying frame
 * rate, it kept making it.
 *
 * Capped at 2 because past that the fragment count grows faster than anyone can
 * see the difference, and floored at 1 so a low-density display is never
 * rendered below its own resolution.
 *
 * Set in an effect rather than on the Canvas: a `dpr` prop is re-applied by
 * R3F's configure() on every render of the component holding it, which would
 * make it fight anything else that ever wanted to set it.
 */
/*
  The shadow camera is centred on the light's TARGET, and the default target
  is the world origin — which is now a patch of open water. With the mainland
  weighted to -Z, an origin-centred box spends tens of units on empty ocean on
  one side while clipping the mainland's far corner on the other. Aiming at
  roughly the centroid of the land lets a smaller map cover more of what
  actually casts a shadow.
*/
/** So Backdrop can find the sky mesh without threading a ref through WORLD. */
const SKY_NAME = 'world-sky'

const sunTarget = new THREE.Object3D()

/**
 * Everything in the scene that never changes: sky, fog object, environment
 * probe, and the lights.
 *
 * One element, built once at module scope, and this is a bug fix rather than
 * tidying. Scene re-renders whenever `idle`, `flying`, `mapDetail` or the
 * chosen country changes — and `idle` alone flips a couple of seconds after
 * every pause and back on the next mouse move, so this happens continuously
 * during ordinary use.
 *
 * drei's <Environment> re-renders its cube probe in a layout effect keyed on
 * `children`, and JSX creates a new children array on every render of its
 * parent. So every one of those re-renders was tearing down the scene's
 * environment, re-rendering six cube faces of the virtual scene, and putting it
 * back — several times a minute, at moments that have nothing to do with
 * anything the visitor did. That is the "random" in random flashes.
 *
 * React bails out of reconciling a subtree when the element is referentially
 * identical to the last one, so hoisting it here makes those re-renders
 * invisible to it. Nothing inside closes over anything, which is what makes
 * this safe: the fog's near and far are driven by Haze writing to the object
 * every frame, not by these initial arguments.
 */
const WORLD = (
  <>
  {/* Wrapped so Backdrop can find it by name: drei's Sky does not forward a
      `name` prop to the mesh it creates. */}
  <group name={SKY_NAME}>
    <Sky sunPosition={SUN} turbidity={5} rayleigh={1.6} mieCoefficient={0.008} mieDirectionalG={0.82} />
  </group>
  {/*
    Pulled well back. At [110, 340] against a camera 189 units out, the
    near islands were already 30-60% hazed and the whole frame washed to one
    pale blue — the fog was doing the job of distance on things that are not
    distant. Starting at 200 leaves the archipelago itself clear and saves
    the haze for the mainland and the world's rim, which is what it is for.
  */}
  <fog attach="fog" args={['#bcd2e4', 200, 560]} />

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
    /*
      2048, down from 3072. A shadow map costs its own full render of every
      caster in the scene, and its memory grows with the square — 3072 is 2.25x
      the pixels of 2048 for a map that, over the 200-unit box below, still
      gives about 10 texels per world unit. These shadows are soft, frozen after
      the reveal, and cast by rounded landforms; there is no hard edge in the
      frame for the extra resolution to sharpen.
    */
    shadow-mapSize={[2048, 2048]}
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
  </>
)

/**
 * Hides the sky while the world is stripped, and hands the backdrop back after.
 *
 * The sky is a mesh with its own shader and it does not take fog, so unlike
 * everything else it cannot be dissolved by the haze. It does not need to be:
 * by the time the world stops being drawn, the renderer is clearing to the
 * haze colour and the sky is behind that, so switching it off is not visible.
 *
 * Nothing needs to be undone on the way back. Haze owns scene.background and
 * keeps it equal to the fog colour on every frame, in every view — which at
 * home is the pale blue the sky itself fades to at the horizon, and is in any
 * case behind a sky sphere that covers the whole frame. Clearing it here as
 * well would be a second writer for one value, and the loser of that race is
 * decided by effect ordering rather than by intent.
 */
function Backdrop({ stripped }: { stripped: boolean }) {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const sky = scene.getObjectByName(SKY_NAME)
    if (sky) sky.visible = !stripped
  }, [scene, stripped])

  return null
}

/** The two ends of the fog: the world's own haze, and the map's. */
const FAR_HAZE = new THREE.Color('#bcd2e4')
const NEAR_HAZE = new THREE.Color('#8fa8a6')

/**
 * Drops the surroundings out of focus while the map is being read.
 *
 * Fog rather than a depth-of-field pass, and the reasoning is not only cost.
 * DoF would have to be added to the effect chain, and adding or removing an
 * effect rebuilds that chain — which is precisely the class of mid-session
 * teardown that was producing black frames in the first place. Leaving it
 * mounted permanently would tax every frame of every view to blur one of them.
 *
 * Fog reaches the same end by a different route: it is a per-fragment blend
 * already compiled into every material, so tightening it costs two uniforms and
 * nothing else. The colour moves with it toward a grey-green, because the
 * default haze is a pale sky blue and fog that pale reads as the surroundings
 * being blown out rather than being far away.
 *
 * The close ramp finishes at eleven units, nearer than the plate's own far
 * corners at 12.2, and that is deliberate. Every surface making up the map opts
 * out of fog (see landMaterial in worldMap.ts), so the haze can be tight enough
 * to swallow the hedge standing right beside the plate without touching the
 * projection inside it. No pair of near/far values separates those two by
 * distance; exempting the map is what makes the separation possible at all.
 *
 * When the ramp lands, everything except the map is a flat field of one colour.
 * That is the moment onSettled reports, and it is what lets Scene stop drawing
 * the world without anything appearing to happen — see `stripped`.
 */
function Haze({
  close,
  scale,
  onSettled,
}: {
  close: boolean
  scale: number
  onSettled: (settled: boolean) => void
}) {
  const scene = useThree((s) => s.scene)
  const ramp = useRef({ near: 200 * scale, far: 560 * scale, mix: 0 })

  useGSAP(() => {
    const target = close
      ? { near: 1, far: 11, mix: 1 }
      : { near: 200 * scale, far: 560 * scale, mix: 0 }

    /*
      Opening up reports immediately; closing down reports only once it lands.
      That asymmetry IS the transition. On the way in, the world has to keep
      being drawn until the haze has fully dissolved it, or it vanishes before
      anything has hidden it. On the way out it has to be drawn again BEFORE the
      haze lifts, or it appears out of a clear sky.
    */
    if (!close) onSettled(false)

    if (prefersReducedMotion()) {
      Object.assign(ramp.current, target)
      onSettled(close)
      return
    }
    gsap.to(ramp.current, {
      ...target,
      duration: 0.9,
      ease: EASE.smooth,
      onComplete: () => onSettled(close),
    })
  }, [close, scale, onSettled])

  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null
    if (!fog) return
    fog.near = ramp.current.near
    fog.far = ramp.current.far
    fog.color.copy(FAR_HAZE).lerp(NEAR_HAZE, ramp.current.mix)

    /*
      The clear colour follows the fog exactly.

      Once the world stops being drawn there is nothing left for the fog to act
      on, so whatever the renderer clears to becomes the backdrop. Holding that
      at the colour the fog has just faded everything to means the hand-over
      from "a world hidden behind haze" to "no world at all" is not a visible
      event. It is also why the sky can be dropped: by then it is behind a
      backdrop of the same colour.
    */
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color()
    ;(scene.background as THREE.Color).copy(fog.color)

  })

  return null
}

function FixedDpr() {
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(Math.min(Math.max(window.devicePixelRatio, 1), 2))
  }, [setDpr])
  return null
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
    {/*
      MEDIUM, down from ULTRA.

      The preset controls how far the edge search runs per pixel, and it is a
      full-screen cost on every frame. ULTRA was chosen for the world map's
      coastlines, which are thousands of short near-diagonal segments — the
      hardest case there is. But the map is now read from ten units with the
      whole world stripped behind it, which is the cheapest frame this scene
      ever draws and the one place that could afford it least badly. Everywhere
      else it was buying a difference nobody asked about, on the frames that
      were already the most expensive.
    */}
    <SMAA preset={SMAAPreset.MEDIUM} />
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
    True once the haze has finished dissolving the world, and therefore once the
    world can stop being drawn without anything appearing to change.

    Two states rather than one, because "the map is the subject" and "there is
    nothing else left to draw" happen nearly a second apart and must not be
    confused. Hiding on the first is what produced a pop; hiding on the second
    is invisible, because by then every pixel outside the plate is already the
    single colour the backdrop is being held at.
  */
  const [stripped, setStripped] = useState(false)

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


  return (
    <>
      {WORLD}
      <Backdrop stripped={stripped} />

      {/*
        The ocean goes with everything else. It is the single most expensive
        surface in the scene — 160,000 vertices displaced in the vertex stage,
        covering most of the frame with a lit standard material and a
        per-fragment ripple — and from directly above a plate that fills the
        window, none of it is visible.
      */}
      {/* Drawn until the haze has swallowed it, then not. It is what the
          coarse island sits in while both are still visible. */}
      <Water visible={!stripped} />
      {/*
        The sky's ornaments go when the map does. Clouds are large transparent
        meshes that cost fill wherever they cover the frame, and neither they
        nor the birds nor the boat is on screen with the camera five units above
        a plate — they are all above or beyond it.
      */}
      <Ambient visible={!stripped} />

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
          lowDetail={mapDetail}
          hidden={stripped}
        />
        {/* Inside the boundary with the land it stands on — it reads the height
            field for its own footing, and appearing before the island does
            would leave it floating. */}
        {/* Off with the rest of the archipelago while the map is the subject —
          it stands on the centre island, well outside the map's frame. */}
        <Monument visible={!stripped} />
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
          soloDistrict={stripped ? focus : null}
          onSubFocus={(view) => {
            setSubFocus(view)
            onCountry(view?.name ?? null)
          }}
        />
        {/*
          Compiles every material in the scene — including those on objects
          currently invisible — in one pass, and uploads their geometry, before
          the first real frame.

          Without this, three compiles a shader the first time a material is
          drawn, and a compile is a synchronous stall of anything from tens to
          hundreds of milliseconds depending on the driver. Several materials
          here are first drawn only on navigation: the coarse island on the way
          into the Garden, the country highlight on the first hover, the boat
          and clouds as the camera turns to them. Each was a hitch at the moment
          of a camera move. Paid here instead, behind the boot screen, where it
          was already being paid for everything that IS visible on frame one.

          Inside the Suspense boundary so it runs after the island's worker has
          delivered and the districts have mounted — earlier, and there would be
          nothing to compile.
        */}
        <Preload all />
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
      {/*
        Always mounted, in every view, and that is the fix for the black flash
        and the stutter rather than a preference.

        This used to be dropped while the map was the subject, which meant that
        the frame the camera crossed the level-of-detail threshold — mid-flight,
        on the way in — did three expensive things at once. The composer
        unmounted, disposing every render target it owned. `gl.toneMapping`
        changed, which marks EVERY material in the scene for recompilation.
        And the pixel ratio was pinned, reallocating the drawing buffer. A
        teardown and two reallocations, all on one frame, in the middle of a
        camera move: that is a black flash followed by a stall, arriving exactly
        when the visitor clicks into the Garden.

        None of the three is worth what it cost. The composer's own passes are
        the same in both views; the tone curve should never move at all; and
        adapting resolution mid-session buys smoothness by way of a black frame,
        which is a poor trade. So nothing is switched now, and the only price is
        that the map antialiases through SMAA rather than the Canvas's MSAA.
      */}
      {GRADING}

      <MapDetail
        active={focus === 'geography'}
        onChange={(low) => {
          setMapDetail(low)
          onImmersive(low)
        }}
      />

      <Haze close={mapDetail} scale={scale} onSettled={setStripped} />
      <FixedDpr />
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
        /*
          And no orbiting either, on this district alone.

          Everywhere else the camera is looking AT something and turning around
          it is how you see it. Here it is looking DOWN at a projection, and
          rotating an equirectangular map is not a way of examining it — it is
          a way of making it unreadable, because the whole claim the drawing
          makes is that north is up and the graticule is square. Orbiting also
          walks straight out of the one framing everything else here is built
          for: the haze, the exempt materials and the country flights all assume
          the camera is roughly overhead.

          With zoom already gone this leaves the controls inert on the map,
          which is the right answer — every way of moving here is a click on a
          country or the way out.
        */
        enableRotate={focus !== 'geography'}
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
