import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, useGSAP } from '../animations/gsap'

// Module scope: one geometry and one material shared by every island. Allocating
// these inside the component would rebuild them on every render.
const ROCK_GEOMETRY = new THREE.ConeGeometry(1, 1.9, 6)
const GRASS_GEOMETRY = new THREE.CylinderGeometry(1.02, 1.02, 0.28, 6)

const ROCK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#5a463a',
  flatShading: true,
  roughness: 0.95,
})
const GRASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#3f9d5a',
  flatShading: true,
  roughness: 0.7,
})

type IslandConfig = {
  position: [number, number, number]
  scale: number
  bobSpeed: number
  phase: number
}

const ISLANDS: IslandConfig[] = [
  { position: [0, 0, 0], scale: 1.6, bobSpeed: 0.7, phase: 0 },
  { position: [-4.4, 1.2, -2.6], scale: 1, bobSpeed: 0.9, phase: 1.7 },
  { position: [4.6, -0.6, -1.4], scale: 1.25, bobSpeed: 0.6, phase: 3.1 },
  { position: [-2.6, -1.8, 3.4], scale: 0.8, bobSpeed: 1.1, phase: 4.4 },
  { position: [3.2, 2.1, 3.8], scale: 0.7, bobSpeed: 1.0, phase: 5.6 },
]

const DROP_FROM = 8

export function Islands() {
  const introRefs = useRef<THREE.Group[]>([])

  // GSAP owns these groups' position and scale — nothing else writes them.
  //
  // Deliberately `set()` + `to()` with absolute values rather than `from()`.
  // `from()` records whatever the target happens to hold when the tween is
  // built, so under StrictMode's mount → revert → mount cycle it can capture the
  // already-zeroed value as its destination and animate 0 → 0 forever. Explicit
  // start and end values make the timeline idempotent however often it reruns.
  useGSAP(() => {
    const tl = gsap.timeline()

    introRefs.current.filter(Boolean).forEach((group, i) => {
      const { position, scale } = ISLANDS[i]
      const at = i * 0.12

      gsap.set(group.position, { y: position[1] - DROP_FROM })
      gsap.set(group.scale, { x: 0, y: 0, z: 0 })

      tl.to(group.position, { y: position[1], duration: 1.5, ease: EASE.entrance }, at)
      tl.to(
        group.scale,
        { x: scale, y: scale, z: scale, duration: 1.1, ease: EASE.pop },
        at,
      )
    })
  }, [])

  return (
    <group>
      {ISLANDS.map((island, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) introRefs.current[i] = el
          }}
          position={island.position}
          scale={island.scale}
        >
          <FloatingIsland bobSpeed={island.bobSpeed} phase={island.phase} />
        </group>
      ))}
    </group>
  )
}

/**
 * The continuous drift lives on an inner group so `useFrame` and the GSAP intro
 * never write the same property. Collapsing these two groups into one would put
 * both animators on `position.y` and produce jitter.
 */
function FloatingIsland({ bobSpeed, phase }: { bobSpeed: number; phase: number }) {
  const ref = useRef<THREE.Group>(null!)

  useFrame((state, delta) => {
    ref.current.position.y = Math.sin(state.clock.elapsedTime * bobSpeed + phase) * 0.18
    ref.current.rotation.y += delta * 0.08
  })

  return (
    <group ref={ref}>
      <mesh geometry={ROCK_GEOMETRY} material={ROCK_MATERIAL} position={[0, -1.09, 0]} rotation={[Math.PI, 0, 0]} />
      <mesh geometry={GRASS_GEOMETRY} material={GRASS_MATERIAL} />
    </group>
  )
}
