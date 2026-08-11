import { useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, useGSAP } from '../animations/gsap'
import { DISTRICTS, districtView, type DistrictId } from './districts'

/** The subset of OrbitControls this rig touches. */
type Controls = {
  enabled: boolean
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
 * just wrote — it reads the current position rather than replacing it, so the
 * two coexist.
 */
export function CameraRig({ focus }: { focus: DistrictId | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as Controls | null
  const firstRun = useRef(true)

  useGSAP(() => {
    if (!controls) return

    const view = focus ? viewFor(focus) : HOME
    const intro = firstRun.current
    firstRun.current = false

    if (intro) {
      camera.position.set(START.x, START.y, START.z)
      controls.target.set(HOME.target.x, HOME.target.y, HOME.target.z)
    }

    controls.enabled = false
    const tl = gsap.timeline({
      onComplete: () => {
        controls.enabled = true
      },
    })

    const duration = intro ? 3.2 : 1.5
    const ease = intro ? EASE.entrance : EASE.smooth

    tl.to(camera.position, { ...view.position, duration, ease, onUpdate: () => controls.update() }, 0)
    tl.to(controls.target, { ...view.target, duration, ease }, 0)
  }, [focus, controls, camera])

  return null
}
