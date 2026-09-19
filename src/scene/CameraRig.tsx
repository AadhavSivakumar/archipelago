import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, prefersReducedMotion, useGSAP } from '../animations/gsap'
import { DISTRICTS, districtView, type DistrictId } from './districts'
import type { SubFocus } from './exhibits'
import { fovForAspect, frameScale } from './framing'

/** The subset of OrbitControls this rig touches. */
type Controls = {
  enabled: boolean
  maxDistance: number
  target: THREE.Vector3
  update: () => void
}

/**
 * Framing of the whole archipelago, pulled back on narrow viewports.
 *
 * The target sits behind the archipelago rather than at the origin, because the
 * world is not centred on itself — the content runs from the Alps at z -70 to
 * the outer islets at z +48.
 *
 * The pitch is the part that matters. At the previous framing the camera looked
 * down 29 degrees with a 21-degree half-angle, which put the HORIZON 8 degrees
 * above the top of the frame: no sky, no skyline, nothing for the islands to
 * recede against, and clouds could only appear by sitting below the horizon and
 * painting over the sea. Everything read as a tabletop. At 13 degrees the
 * horizon falls about a fifth of the way down the frame and the scene has a sky
 * over it.
 */
function homeView(scale: number) {
  return {
    position: { x: 0, y: 40 * scale, z: 92 * scale },
    target: { x: 0, y: 8, z: -30 },
  }
}

/**
 * Where the opening sweep begins: just beyond the fog's far plane, so the
 * archipelago resolves out of the haze rather than being there from frame one.
 */
const START = { x: 0, y: 120, z: 400 }

function viewFor(id: DistrictId, scale: number, sub?: SubFocus | null) {
  const d = DISTRICTS.find((x) => x.id === id)!
  const base = districtView(d, scale)
  if (!sub) return base

  if (d.framing !== 'plan') {
    /*
      A thing on an ordinary island: come in along the district's own seaward
      bearing, closer for smaller things. The bearing is kept so that choosing
      an exhibit reads as approaching it, not as circling to a new side of the
      island — and so the labels laid out to face that bearing still do.

      Height follows the exhibit, because the Ideology Isles float: a god's
      family tree hangs several units above the plateau, and framing it at
      plateau height would put the camera looking up at its underside.
    */
    const extent = Math.max(sub.spanX, sub.spanZ)
    const distance = Math.min(Math.max(extent * 3.2, 7), 30) * scale
    const ox = Math.cos(d.seaward)
    const oz = Math.sin(d.seaward)
    // How steeply to look down. A stone on the ground reads best from above
    // it; a family tree hanging in the air is a panel, and wants to be faced.
    const elevation = sub.elevation ?? 0.6
    const reach = distance * Math.sqrt(Math.max(0.2, 1 - elevation * elevation))
    const ty = d.pad + (sub.y ?? 0)
    return {
      position: {
        x: d.x + sub.x + ox * reach,
        y: ty + distance * elevation,
        z: d.z + sub.z + oz * reach,
      },
      target: { x: d.x + sub.x, y: ty, z: d.z + sub.z },
    }
  }

  /*
    Frame one country rather than the whole projection.

    The distance is solved rather than picked: the horizontal half-field is
    0.633 units per unit of distance at the base fov and the vertical is
    tan(21deg), so the distance that just contains a half-extent is that extent
    divided by the relevant one, and the country is framed by whichever of the
    two binds. A fifth of margin keeps its coastline off the frame edge.

    Clamped at both ends, and both ends matter. Below about 1.6 units the near
    plane and the plate's own thickness start to intrude, and Vatican City would
    otherwise ask for a few centimetres. Above the district's own distance there
    is no point going: that view already contains the whole world, so a country
    large enough to need more than it — Russia — simply gets it.
  */
  const spanDistance = Math.max(sub.spanX / 0.633, sub.spanZ / Math.tan((21 * Math.PI) / 180))
  const distance = Math.min(Math.max(spanDistance * 1.2, 1.6), 9.95)

  /*
    The same 6-degree tilt the district view uses, so choosing a country changes
    the framing without also changing the angle it is read at — the map should
    appear to be approached, not tipped.
  */
  const tilt = Math.tan((6 * Math.PI) / 180)
  return {
    position: {
      x: base.target.x + sub.x,
      y: base.target.y + distance,
      z: base.target.z + sub.z + distance * tilt,
    },
    target: { x: base.target.x + sub.x, y: base.target.y, z: base.target.z + sub.z },
  }
}

/**
 * Flies the camera on mount and whenever a district is focused.
 *
 * During a flight GSAP is the sole writer of `camera.position` and
 * `controls.target`; user input is disabled so OrbitControls cannot fight it.
 * `controls.update()` re-derives the camera's orientation from the values GSAP
 * just wrote.
 *
 * Two things make that "sole writer" claim actually true rather than merely
 * intended, and both are easy to lose in a refactor:
 *
 * 1. Only one flight may be live. `useGSAP` with a dependency array defers its
 *    cleanup to unmount, so a `focus` change while a flight is in the air would
 *    otherwise leave two timelines writing the same properties — and the older
 *    one's `onComplete` would hand control back to OrbitControls mid-flight.
 * 2. The orbit radius ceiling has to come off for the intro. `update()` clamps
 *    the radius on every call; `enabled` gates only its input handlers, not the
 *    clamp. START sits far beyond the orbit ceiling, so leaving it in place
 *    snaps the camera onto that shell and pins it there for the first third of
 *    the flight.
 */
type RigProps = {
  focus: DistrictId | null
  /**
   * A place within the focused district to fly down to, or null for the
   * district's own framing. Set when a country on the world map is chosen.
   */
  subFocus?: SubFocus | null
  /**
   * Raised while a flight is airborne. The idle auto-orbit has to be off during
   * one: three's OrbitControls.update() applies autoRotate without checking
   * `enabled`, and this rig calls update() on every tween tick, so a live
   * autoRotate would rotate the camera out from under GSAP.
   */
  onFlyingChange?: (flying: boolean) => void
}

export function CameraRig({ focus, subFocus, onFlyingChange }: RigProps) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as Controls | null
  const size = useThree((s) => s.size)
  const firstRun = useRef(true)
  // ReturnType rather than `gsap.core.Timeline`: the namespace meaning of the
  // `gsap` identifier does not reliably survive the re-export in animations/gsap.
  const flight = useRef<ReturnType<typeof gsap.timeline> | null>(null)
  /** The ceiling to put back, held across flights that get superseded. */
  const ceiling = useRef<number | null>(null)
  /** True only while the opening flight is airborne. */
  const skippable = useRef(false)
  /** The district of the previous flight, so a hop within one can be told apart. */
  const lastFocus = useRef<DistrictId | null>(null)

  /*
    Any deliberate input ends the opening flight early. Without this the first
    thing the page does to a visitor is take the controls away for 3.2 seconds
    with no way out — and someone arriving to look around will try to drag
    immediately. `progress(1)` jumps to the end and, since suppressEvents
    defaults to false, runs onComplete, so controls and the distance ceiling are
    restored through exactly the same path as a flight that ran its course.

    Only the intro is skippable: a district flight is 1.5s and is itself the
    response to a click, so cutting it short on the same gesture would feel like
    a misfire.
  */
  useEffect(() => {
    const skip = () => {
      if (skippable.current) flight.current?.progress(1)
    }
    // Capture phase, and this matters. OrbitControls binds pointerdown on the
    // canvas itself, so at target phase it runs BEFORE a window bubble listener
    // — and it returns early while disabled, before it starts tracking the
    // pointer. Skipping on the bubble would therefore end the flight but eat
    // the very drag that ended it. Running first means progress(1) has already
    // fired onComplete and re-enabled controls by the time OrbitControls looks,
    // so the same press begins the orbit. keydown needs no such ordering.
    window.addEventListener('pointerdown', skip, true)
    window.addEventListener('keydown', skip)
    return () => {
      window.removeEventListener('pointerdown', skip, true)
      window.removeEventListener('keydown', skip)
    }
  }, [])

  // FOV tracks the viewport live: it re-frames without moving the camera, so it
  // costs nothing to apply mid-session.
  const aspect = size.width / size.height
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    camera.fov = fovForAspect(aspect)
    camera.updateProjectionMatrix()
  }, [camera, aspect])

  /*
    Distance has to follow too — widening the lens alone cannot recover
    everything a narrow viewport loses (framing.ts caps it), so the pull-back
    multiplier is the other half of the same framing decision. Re-running the
    whole flight on a resize would yank the camera out from under someone who
    just rotated their phone, so instead: hold their orbit angle exactly, scale
    only their distance from the target, and take 0.4s over it so it reads as
    the frame settling rather than a jump.
  */
  const lastScale = useRef<number | null>(null)
  useEffect(() => {
    const next = frameScale(aspect)
    const previous = lastScale.current
    lastScale.current = next

    // The first pass only establishes a baseline — the intro flight frames it.
    if (previous === null || previous === next || !controls) return
    // A live flight is already heading somewhere framed with the new scale.
    if (flight.current?.isActive()) return

    const to = camera.position.clone().sub(controls.target).multiplyScalar(next / previous).add(controls.target)

    // Every other camera move honours the preference; this one was missed.
    if (prefersReducedMotion()) {
      camera.position.copy(to)
      controls.update()
      return
    }

    gsap.to(camera.position, {
      x: to.x,
      y: to.y,
      z: to.z,
      duration: 0.4,
      ease: EASE.smooth,
      overwrite: 'auto',
      onUpdate: () => controls.update(),
    })
  }, [aspect, controls, camera])

  useGSAP(() => {
    // Above the controls guard on purpose. If OrbitControls ever goes away
    // mid-flight, an early return here would leave the timeline airborne, still
    // writing camera.position and still holding an onComplete that re-enables a
    // stale controls object. Killing first makes the one-flight rule
    // unconditional rather than contingent on controls existing.
    flight.current?.kill()
    // The re-frame tween above writes camera.position directly and belongs to no
    // timeline, so killing the timeline alone would leave it running alongside
    // whatever we build next. Below, the arc writes position from an onUpdate
    // rather than tweening it, so `overwrite: 'auto'` cannot catch this either.
    gsap.killTweensOf(camera.position)
    skippable.current = false

    if (!controls) return

    const scale = frameScale(aspect)
    const view = focus ? viewFor(focus, scale, subFocus) : homeView(scale)
    const intro = firstRun.current
    firstRun.current = false

    /*
      Arrive without flying. Used by both cases below; note the distance ceiling
      is never lifted on this path, because every destination sits inside it —
      only the 210-unit opening sweep ever needed that.
    */
    const land = () => {
      camera.position.set(view.position.x, view.position.y, view.position.z)
      controls.target.set(view.target.x, view.target.y, view.target.z)
      controls.update()
      controls.enabled = true
    }

    // Reduced motion: there is no animation to protect, so disabling input
    // would only take the scene away for no reason.
    if (prefersReducedMotion()) {
      land()
      onFlyingChange?.(false)
      return
    }

    /*
      Opening on a shared link. The sweep is an introduction to the island, and
      someone arriving at #science has been introduced already — replaying 3.2
      seconds from 210 units out on every reload of a bookmarked URL turns the
      best part of the scene into a toll. Straight to the district; the opening
      is still there for anyone who arrives at the root.
    */
    if (intro && focus) {
      land()
      onFlyingChange?.(false)
      return
    }

    if (intro) {
      camera.position.set(START.x, START.y, START.z)
      // `view` is the home framing here — the intro only ever runs unfocused.
      controls.target.set(view.target.x, view.target.y, view.target.z)

      // Captured once. A flight killed mid-air never restores it, so the
      // replacement must not overwrite the saved value with Infinity.
      ceiling.current = controls.maxDistance
      controls.maxDistance = Infinity
    }

    controls.enabled = false
    const tl = gsap.timeline({
      onComplete: () => {
        if (ceiling.current !== null) {
          controls.maxDistance = ceiling.current
          ceiling.current = null
        }
        skippable.current = false
        controls.enabled = true
        onFlyingChange?.(false)
      },
    })
    flight.current = tl
    skippable.current = intro
    onFlyingChange?.(true)

    const duration = intro ? 3.2 : 1.5
    const ease = intro ? EASE.entrance : EASE.smooth

    /*
      Overhead views do not arc, and this is not a preference.

      The arc below works in polar coordinates about a pivot on the ground, and
      that parameterisation falls apart when the camera is almost directly above
      its target: the horizontal radius goes to nothing, so the azimuth is
      computed from a lever arm of a few centimetres and is wildly sensitive to
      where the target lands. Measured on a descent onto the Congo — a 7.5-unit
      drop straight down — the maths asked for a 72-degree swing about a pivot
      one unit away, with an 8-unit outward bulge on top. The camera hurled
      itself sideways round the plate and back.

      The arc exists to stop a hop between two districts cutting through the
      island in the middle. There is nothing between a top-down camera and the
      plate underneath it, so the reason does not apply and the straight line is
      both correct and calm.
    */
    const overhead = focus !== null && DISTRICTS.find((x) => x.id === focus)?.framing === 'plan'
    /*
      A hop within the district the camera is already in — choosing an exhibit,
      stepping to the next one — is also straight. The arc exists to carry the
      camera around the island between two districts; within one, the island is
      what is being looked at, and there is nothing between the camera and a
      marker a few units away to sweep around. An arc there is a detour.
    */
    const sameDistrict = focus !== null && focus === lastFocus.current
    lastFocus.current = focus

    if (intro || overhead || sameDistrict) {
      // Straight pull-in: no island between the camera and its destination to
      // sweep around.
      tl.to(
        camera.position,
        { ...view.position, duration, ease, overwrite: 'auto', onUpdate: () => controls.update() },
        0,
      )
    } else {
      /*
        Every other hop arcs. Lerping position componentwise draws a chord, and
        districtView parks all six views at roughly one radius on their own
        bearing — so Ideology at 330 degrees and Geography at 150 are exactly
        antipodal, and the straight path between them runs through the middle of
        the island. It clears the terrain, so this is a matter of taste rather
        than a clipping bug, but the framing at each end was carefully reasoned
        about and the path between them was not.

        Tweening a single eased scalar and deriving position from it keeps GSAP
        the sole writer, and keeps the easing identical to the linear version.
      */
      /*
        Pivot on the midpoint of the two look-at targets, NOT on the world
        origin. The origin was the island's centre when there was one island;
        now it is a patch of open water that half the districts are nowhere
        near, and arcing about it turned short hops into detours of up to 2.2x
        the direct distance. Measuring the angle about the subject is what makes
        "the short way round" mean the short way round the thing being looked at.
      */
      const pivotX = (controls.target.x + view.target.x) / 2
      const pivotZ = (controls.target.z + view.target.z) / 2

      const from = camera.position
      const a0 = Math.atan2(from.z - pivotZ, from.x - pivotX)
      const r0 = Math.hypot(from.x - pivotX, from.z - pivotZ)
      const y0 = from.y
      const r1 = Math.hypot(view.position.x - pivotX, view.position.z - pivotZ)
      const y1 = view.position.y

      // Unwrapped so the camera always takes the short way round.
      let da = Math.atan2(view.position.z - pivotZ, view.position.x - pivotX) - a0
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2

      /*
        Bulge outward at the midpoint, scaled by how far round we are going, so
        a neighbouring district barely curves and an antipodal one sweeps wide.
        Divided by the framing scale because a narrow viewport has already
        pushed the camera most of the way to the orbit ceiling — update() clamps
        the radius on every call, so an unscaled bulge would simply be flattened
        against it there.
      */
      const bulge = Math.min(16, (Math.abs(da) / Math.PI) * 20) / scale

      const path = { t: 0 }
      tl.to(
        path,
        {
          t: 1,
          duration,
          ease,
          onUpdate: () => {
            const t = path.t
            const a = a0 + da * t
            const r = r0 + (r1 - r0) * t + bulge * Math.sin(Math.PI * t)
            camera.position.set(
              pivotX + Math.cos(a) * r,
              y0 + (y1 - y0) * t,
              pivotZ + Math.sin(a) * r,
            )
            controls.update()
          },
        },
        0,
      )
    }

    tl.to(controls.target, { ...view.target, duration, ease, overwrite: 'auto' }, 0)
    // `aspect` is deliberately absent from these dependencies: see the FOV
    // effect above. Including it would re-fly the camera on every resize and on
    // every phone rotation. If a hooks linter ever lands, this is a considered
    // exception, not an oversight.
  }, [focus, subFocus, controls, camera, onFlyingChange])

  return null
}
