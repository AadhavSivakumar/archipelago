import { use, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import { islandGeometry, islandOccluderGeometry, ISLAND_MATERIAL } from './terrain'
import {
  uTime,
  WAVE_CHOP_CHUNK,
  WAVE_CHOP_GLSL,
  WAVE_DISPLACE_CHUNK,
  WAVE_GLSL,
  WAVE_NORMAL_CHUNK,
} from '../shaders/water'

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

  /*
    The display mesh is built on a worker, so this suspends until it arrives —
    the nearest <Suspense> is in Scene, which lets the sky, the ocean and the
    ambient layer paint immediately instead of the page holding a blank canvas
    for the ~390ms the build takes.

    islandGeometry() caches its promise, so re-rendering (StrictMode renders
    this twice on purpose) resolves against the same one rather than suspending
    forever on a fresh promise each pass.
  */
  const geometry = use(islandGeometry())

  // The occluder stays synchronous: it is cheap, and the labels raycast against
  // it from the frame they mount.
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
// horizon shows a square rim of ocean. Grown with the world: the terrain now
// reaches ±460, and on a narrow viewport framing.ts scales the fog out too.
const WATER_GEOMETRY = new THREE.PlaneGeometry(1600, 1600, 400, 400)
WATER_GEOMETRY.rotateX(-Math.PI / 2)

/*
  Roughness raised from 0.08, which sounds like the wrong direction for water
  and is not. At 0.08 the surface is a near-mirror, and what it was mirroring
  was a 256px procedural environment with almost no structure in it — so every
  wave face returned the same blue and the whole ocean collapsed to one flat
  value. A rougher surface spreads each reflection over a lobe instead, which
  lets neighbouring wave faces return visibly different amounts of sky and
  gives the swell its shading back. The deeper base colour then reads as water
  with depth under it rather than as painted board.
*/
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#12496f',
  roughness: 0.22,
  metalness: 0.5,
  transparent: true,
  opacity: 0.94,
})

// The wave itself now lives in src/shaders/water.ts, because the island's foam
// band and the drifting boat have to agree with it exactly.
WATER_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime

  shader.vertexShader = `uniform float uTime;\nvarying vec2 vWaterPos;\n${WAVE_GLSL}\n${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', WAVE_NORMAL_CHUNK)
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', WAVE_DISPLACE_CHUNK)

  // The chop rides on the normal the swell already computed, so it has to be
  // injected after the normal is final rather than replacing any part of it.
  shader.fragmentShader = `uniform float uTime;\nvarying vec2 vWaterPos;\n${WAVE_CHOP_GLSL}\n${shader.fragmentShader}`.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>\n${WAVE_CHOP_CHUNK}`,
  )
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
