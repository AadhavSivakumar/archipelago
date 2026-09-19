import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { prefersReducedMotion } from '../animations/gsap'
import { sampleHeight } from './terrain'
import { weather } from './surface'
import { globeTextures } from './globeTexture'

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

const GLOBE = new THREE.SphereGeometry(4.6, 160, 120)
/*
  The Earth itself — see globeTexture.ts. Lazily, because the texture is a
  canvas and canvases need a document: module scope runs in the worker too.
  White under the map so the painted colours are the colours.
*/
const globeMaterial = (() => {
  let m: THREE.MeshStandardMaterial | null = null
  return () => {
    if (m) return m
    const { map, bump } = globeTextures()
    m = weather(
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map,
        bumpMap: bump,
        bumpScale: 0.6,
        roughness: 0.55,
        metalness: 0.08,
      }),
      // Fine and shallow: this is meant to read as a painted globe, so it
      // wants the tooth of the paint rather than a rock face.
      { grain: 3.4, mottle: 0.12, bump: 0.1, rough: 0.12 },
    )
    return m
  }
})()

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

export function Monument({ visible }: { visible: boolean }) {
  const globe = useRef<THREE.Group>(null!)

  useFrame((_, dt) => {
    if (prefersReducedMotion()) return
    globe.current.rotation.y += dt * 0.1
  })

  const ground = sampleHeight(MONUMENT_AT.x, MONUMENT_AT.z)

  return (
    <group position={[MONUMENT_AT.x, ground, MONUMENT_AT.z]} visible={visible}>
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
          <mesh geometry={GLOBE} material={globeMaterial()} />
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
