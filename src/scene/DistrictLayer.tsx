import { useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { EASE, gsap, useGSAP } from '../animations/gsap'
import { DISTRICTS, districtPosition, type DistrictId } from './districts'
import { LANDMARKS } from './landmarks'

type Props = {
  focus: DistrictId | null
  onFocus: (id: DistrictId) => void
}

/** How high above each plateau the floating label sits. */
const LABEL_HEIGHT: Record<DistrictId, number> = {
  ideology: 17,
  history: 12,
  geography: 12,
  science: 13,
  art: 11,
  anthropology: 14,
}

export function Districts({ focus, onFocus }: Props) {
  const root = useRef<THREE.Group>(null!)
  const animated = useRef<THREE.Group[]>([])

  // Shadow flags are not inherited in three.js, and setting them by hand on ~150
  // meshes would bury the geometry. One traversal after mount does the same job.
  useEffect(() => {
    root.current.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }, [])

  // GSAP owns these inner groups' position.y and scale for the reveal. The outer
  // group carries the fixed district position, so React and GSAP never write the
  // same property.
  useGSAP(() => {
    const tl = gsap.timeline({ delay: 0.9 })
    animated.current.filter(Boolean).forEach((g, i) => {
      const at = i * 0.14
      gsap.set(g.position, { y: -22 })
      gsap.set(g.scale, { x: 0.001, y: 0.001, z: 0.001 })
      tl.to(g.position, { y: 0, duration: 1.5, ease: EASE.entrance }, at)
      tl.to(g.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: EASE.pop }, at)
    })
  }, [])

  return (
    <group ref={root}>
      {DISTRICTS.map((d, i) => {
        const Landmark = LANDMARKS[d.id]
        return (
          <group key={d.id} position={districtPosition(d)}>
            <group
              ref={(el) => {
                if (el) animated.current[i] = el
              }}
            >
              <Landmark d={d} />
            </group>

            <Html
              position={[0, LABEL_HEIGHT[d.id], 0]}
              center
              distanceFactor={34}
              zIndexRange={[20, 0]}
            >
              <button
                type="button"
                className={`marker${focus === d.id ? ' is-active' : ''}`}
                style={{ '--accent': d.accent } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation()
                  onFocus(d.id)
                }}
              >
                {d.name}
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
