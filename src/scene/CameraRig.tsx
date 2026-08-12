import { useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, useGSAP } from '../animations/gsap'
import { DISTRICTS, districtView, type DistrictId } from './districts'

/** The subset of OrbitControls this rig touches. */
type Controls = {
  enabled: boolean
  maxDistance: number
  target: THREE.Vector3
  update: () => void
}

const HOME = {
  position: { x: 0, y: 31, z: 62 },
  target: { x: 0, y: 6, z: 0 },
}

const START = { x: 0, y: 115, z: 180 }

function viewFor(id: DistrictId) {
  return districtView(DISTRICTS.find((x) => x.id === id)!)
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
 *    clamp. START sits at radius ~210 against a ceiling of 110, so leaving it in
 *    place snaps the camera onto the 110 shell and pins it there for the first
 *    third of the flight.
 */
export function CameraRig({ focus }: { focus: DistrictId | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as Controls | null
  const firstRun = useRef(true)
  // ReturnType rather than `gsap.core.Timeline`: the namespace meaning of the
  // `gsap` identifier does not reliably survive the re-export in animations/gsap.
  const flight = useRef<ReturnType<typeof gsap.timeline> | null>(null)
  /** The ceiling to put back, held across flights that get superseded. */
  const ceiling = useRef<number | null>(null)

  useGSAP(() => {
    // Above the controls guard on purpose. If OrbitControls ever goes away
    // mid-flight, an early return here would leave the timeline airborne, still
    // writing camera.position and still holding an onComplete that re-enables a
    // stale controls object. Killing first makes the one-flight rule
    // unconditional rather than contingent on controls existing.
    flight.current?.kill()

    if (!controls) return

    const view = focus ? viewFor(focus) : HOME
    const intro = firstRun.current
    firstRun.current = false

    if (intro) {
      camera.position.set(START.x, START.y, START.z)
      controls.target.set(HOME.target.x, HOME.target.y, HOME.target.z)

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
        controls.enabled = true
      },
    })
    flight.current = tl

    const duration = intro ? 3.2 : 1.5
    const ease = intro ? EASE.entrance : EASE.smooth

    tl.to(
      camera.position,
      { ...view.position, duration, ease, overwrite: 'auto', onUpdate: () => controls.update() },
      0,
    )
    tl.to(controls.target, { ...view.target, duration, ease, overwrite: 'auto' }, 0)
  }, [focus, controls, camera])

  return null
}
