import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import { islandGeometry, islandOccluderGeometry, ISLAND_MATERIAL } from './terrain'
import { uTime, WAVE_DISPLACE_CHUNK, WAVE_GLSL, WAVE_NORMAL_CHUNK } from '../shaders/water'

type IslandProps = {
  /**
   * Owned by Scene, because the district labels raycast their occlusion against
   * it — a label on the far side of the island has to know the landmass is in
   * the way. See islandOccluderGeometry for why this is a proxy and not the
   * mesh you can actually see.
   */
  occluderRef: RefObject<THREE.Mesh>
  /** Skip the reveal: the visitor arrived pointed at a district already. */
  deepLinked: boolean
}

/**
 * The landmass. GSAP owns the group's `scale.y` for the intro reveal and
 * nothing else writes it, so the island grows out of the sea once and stays put.
 *
 * The reveal drives the GROUP rather than the visible mesh so the invisible
 * raycast proxy rises with it. Scaling only the mesh would leave labels
 * occluding against a full-height mountain for the first two seconds, while the
 * island the visitor can see is still flat.
 */
export function Island({ occluderRef, deepLinked }: IslandProps) {
  const group = useRef<THREE.Group>(null!)

  // Both getters cache at module scope, so these are lookups rather than
  // rebuilds — useMemo is here to say so at the call site.
  const geometry = useMemo(() => islandGeometry(), [])
  const occluder = useMemo(() => islandOccluderGeometry(), [])

  useGSAP(() => {
    const g = group.current
    if (!g) return
    // Already there — either because motion is unwelcome, or because the
    // visitor followed a link to a district and the island growing out of the
    // sea underneath them is not the shot they asked for.
    if (REDUCED_MOTION || deepLinked) {
      gsap.set(g.scale, { y: 1 })
      return
    }
    gsap.set(g.scale, { y: 0.02 })
    gsap.to(g.scale, { y: 1, duration: 2.2, ease: EASE.entrance })
  }, [deepLinked])

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={ISLAND_MATERIAL} receiveShadow castShadow />
      {/*
        Never drawn — a raycast target only. three does not consult `visible`
        when raycasting (Raycaster.intersect checks layers, Mesh.raycast never
        reads it), and Mesh supplies a default material, which is all the
        raycast needs. Being invisible also keeps it out of the shadow pass.
      */}
      <mesh ref={occluderRef} geometry={occluder} visible={false} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

// Wide enough that its edge is always past the fog's far plane — otherwise the
// horizon shows a square rim of ocean.
const WATER_GEOMETRY = new THREE.PlaneGeometry(900, 900, 220, 220)
WATER_GEOMETRY.rotateX(-Math.PI / 2)

const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#1d5f8c',
  roughness: 0.08,
  metalness: 0.35,
  transparent: true,
  opacity: 0.93,
})

// The wave itself now lives in src/shaders/water.ts, because the island's foam
// band and the drifting boat have to agree with it exactly.
WATER_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime
  shader.vertexShader = `uniform float uTime;\n${WAVE_GLSL}\n${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', WAVE_NORMAL_CHUNK)
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', WAVE_DISPLACE_CHUNK)
}

export function Water() {
  useFrame((state) => {
    uTime.value = state.clock.elapsedTime
  })

  // Deliberately not a shadow receiver: the depth pass renders the *undisplaced*
  // plane (onBeforeCompile does not touch the depth material), so the waves
  // self-shadow against their own flat shadow map and the whole ocean goes dark.
  return <mesh geometry={WATER_GEOMETRY} material={WATER_MATERIAL} />
}
