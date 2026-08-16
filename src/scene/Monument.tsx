import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { prefersReducedMotion } from '../animations/gsap'
import { sampleHeight } from './terrain'
import { weather } from './surface'

/**
 * The armillary globe, at the centre of the archipelago.
 *
 * It used to be one exhibit inside the Geographical Garden, which put the
 * world's own model off to one side of the world. Standing alone on the centre
 * island it becomes what the six territories are arranged around — and the
 * Garden is free to be a map instead, which is a different idea rather than a
 * smaller version of the same one.
 *
 * Placed against the height field rather than a guessed y, like everything else
 * that stands on ground.
 */
export const MONUMENT_AT = { x: 0, z: -14 }

const GLOBE = new THREE.SphereGeometry(4.6, 128, 96)
const GLOBE_MAT = weather(
  new THREE.MeshStandardMaterial({ color: '#2b6288', roughness: 0.46, metalness: 0.18 }),
  // Fine and shallow: this is meant to read as an ocean painted onto a globe,
  // so it wants the tooth of the paint rather than a rock face.
  { grain: 3.4, mottle: 0.2, bump: 0.16, rough: 0.14 },
)

const LANDMASS = new THREE.SphereGeometry(1, 64, 44)
const LANDMASS_MAT = weather(
  new THREE.MeshStandardMaterial({ color: '#4a8d57', roughness: 0.84 }),
  { grain: 6, mottle: 0.3, bump: 0.3, rough: 0.14 },
)

const BRASS = weather(
  new THREE.MeshStandardMaterial({ color: '#9c7f3f', roughness: 0.36, metalness: 0.85 }),
  { grain: 9, mottle: 0.07, bump: 0.14, rough: 0.24 },
)
const STONE = weather(
  new THREE.MeshStandardMaterial({ color: '#9d9a92', roughness: 0.88 }),
  { grain: 5, mottle: 0.3, bump: 0.55, rough: 0.2 },
)
const MARBLE = weather(
  new THREE.MeshStandardMaterial({ color: '#dcd6cb', roughness: 0.42 }),
  { grain: 7, mottle: 0.14, bump: 0.22, rough: 0.1 },
)

/** The armillary rings: a meridian, an equator, and a tilted ecliptic. */
const RING = new THREE.TorusGeometry(5.7, 0.13, 24, 200)
const RING_FINE = new THREE.TorusGeometry(5.9, 0.07, 16, 200)

/**
 * The pedestal, turned in one profile.
 *
 * A stack of two cylinders reads as a stack of two cylinders. The lathe gives
 * the whole thing at once: a stepped base, a hollowed scotia, a tapering die and
 * a flared cap — the mouldings are the only reason a plinth looks like it is
 * carrying something.
 */
const PLINTH = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(4.4, 0)
  at(4.4, 0.55)
  at(4.0, 0.75)
  at(3.7, 0.9)
  at(3.5, 1.25)   // scotia, hollowed
  at(3.62, 1.6)
  at(3.3, 1.85)
  // Tapering die.
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    at(3.3 - 0.95 * t, 1.85 + t * 3.1)
  }
  at(2.45, 5.1)   // cap
  at(2.75, 5.35)
  at(2.62, 5.6)
  at(0, 5.6)
  return new THREE.LatheGeometry(p, 96)
})()

/** Steps up to it, so the monument is approached rather than dropped. */
const STEP = new THREE.CylinderGeometry(1, 1, 0.42, 96)
const STEPS = [
  { r: 7.4, y: 0.21 },
  { r: 6.5, y: 0.63 },
  { r: 5.7, y: 1.05 },
]

/** Meridian graduation marks around the equator ring. */
const TICKS = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2)
const TICK = new THREE.BoxGeometry(0.07, 0.34, 0.07)

const UP = new THREE.Vector3(0, 1, 0)
const CONTINENTS = (
  [
    [0.4, 0.55, 0.7, 1.9, 1.35],
    [-0.7, 0.2, 0.6, 1.55, 1.1],
    [0.1, -0.75, 0.6, 1.45, 1.2],
    [-0.5, -0.4, -0.75, 1.65, 1.0],
    [0.75, -0.1, -0.6, 1.25, 0.9],
    [-0.15, 0.85, -0.5, 1.1, 1.0],
  ] as const
).map(([x, y, z, sx, sz]) => {
  const n = new THREE.Vector3(x, y, z).normalize()
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, n))
  return {
    position: n.clone().multiplyScalar(4.56).toArray() as [number, number, number],
    rotation: [e.x, e.y, e.z] as [number, number, number],
    scale: [sx, 0.16, sz] as [number, number, number],
  }
})

export function Monument() {
  const globe = useRef<THREE.Group>(null!)

  useFrame((_, dt) => {
    if (prefersReducedMotion()) return
    globe.current.rotation.y += dt * 0.1
  })

  const ground = sampleHeight(MONUMENT_AT.x, MONUMENT_AT.z)

  return (
    <group position={[MONUMENT_AT.x, ground, MONUMENT_AT.z]}>
      {STEPS.map((s, i) => (
        <mesh key={i} geometry={STEP} scale={[s.r, 1, s.r]} position={[0, s.y, 0]} material={STONE} />
      ))}

      <mesh geometry={PLINTH} position={[0, 1.26, 0]} material={MARBLE} />

      <group position={[0, 12.4, 0]}>
        {/*
          Untagged for shadows on purpose: a sphere turning about an axis
          through its own centre has a time-invariant cast silhouette, so
          freezing its shadow is exact rather than approximate.
        */}
        <group ref={globe}>
          <mesh geometry={GLOBE} material={GLOBE_MAT} />
          {/*
            The continents DO change silhouette — they stand proud of the sphere
            — so they are excluded from the frozen map. Via a wrapping group,
            never a userData prop on <Instances>: drei spreads caller props over
            its own `userData: { instances, limit, frames }`, and R3F assigns
            plain objects wholesale, so that would delete `instances` and make
            PositionMesh.raycast throw on every pointer move.
          */}
          <group userData={{ noShadow: true }}>
            <Instances geometry={LANDMASS} material={LANDMASS_MAT} limit={CONTINENTS.length}>
              {CONTINENTS.map((c, i) => (
                <Instance key={i} position={c.position} rotation={c.rotation} scale={c.scale} />
              ))}
            </Instances>
          </group>
        </group>

        {/* Armillary: the rings stay fixed while the globe turns inside them. */}
        <mesh geometry={RING} rotation={[Math.PI / 2, 0, 0]} material={BRASS} />
        <mesh geometry={RING} rotation={[Math.PI / 2, 0, Math.PI / 2]} scale={[0.99, 0.99, 1]} material={BRASS} />
        <mesh geometry={RING_FINE} rotation={[0, 0, 0.41]} material={BRASS} />

        <Instances geometry={TICK} material={BRASS} limit={TICKS.length}>
          {TICKS.map((a, i) => (
            <Instance
              key={i}
              position={[Math.cos(a) * 5.7, 0, Math.sin(a) * 5.7]}
              rotation={[0, -a, 0]}
            />
          ))}
        </Instances>
      </group>
    </group>
  )
}
