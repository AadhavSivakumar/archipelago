import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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
const IDLE_SPEED = 0.28

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
    gsap.to(speed.current, { value: IDLE_SPEED, duration: 2.6, ease: EASE.smooth })
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

function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr)
  return (
    <PerformanceMonitor
      // Seeded at the top of the range. The default of 0.5 would drop
      // resolution unconditionally a couple of seconds in — right through the
      // reveal — and then staircase back up over the following ten.
      factor={1}
      onChange={({ factor }) => {
        // Scale the panel's OWN ratio. Handing setDpr an absolute number
        // derived from factor alone would supersample a 1x display up to 2x,
        // quadrupling its fragment count in the name of saving fragments.
        const native = Math.min(window.devicePixelRatio, 2)
        setDpr(Math.max(1, Math.round(native * (0.5 + factor / 2) * 10) / 10))
      }}
    />
  )
}

export function Scene({ focus, onFocus }: Props) {
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
        Widened with the world. The mainland's far shore now sits ~170 units
        from the home camera, and it should read as receding coastline rather
        than as a hard edge — which is also what hides the terrain plane's
        boundary behind it.
      */}
      <fog attach="fog" args={['#bcd2e4', 110 * scale, 340 * scale]} />

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

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#cfe4ff', '#4a5a44', 0.6]} />
      <primitive object={sunTarget} position={[10, 0, -28]} />
      <directionalLight
        castShadow
        target={sunTarget}
        position={SUN}
        intensity={2.8}
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

      <Water />
      <Ambient />

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
        <Island occluderRef={occluder} deepLinked={deepLinked} />
        {/* Inside the boundary with the land it stands on — it reads the height
            field for its own footing, and appearing before the island does
            would leave it floating. */}
        <Monument />
        <Districts focus={focus} onFocus={onFocus} occluders={occluder} deepLinked={deepLinked} />
      </Suspense>

      <AdaptiveDpr />
      <IdleOrbit active={idle && focus === null && !flying} />
      <CameraRig focus={focus} onFlyingChange={setFlying} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        // The home framing alone sits at ~121 units out now, so the old 110
        // ceiling would have clamped the camera before it ever arrived.
        minDistance={18}
        // Home is ~140 units out, and framing.ts pulls back up to 2x on a
        // portrait phone, so the ceiling has to clear both.
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
