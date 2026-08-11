import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, useGSAP } from '../animations/gsap'
import { ISLAND_GEOMETRY, ISLAND_MATERIAL } from './terrain'

/**
 * The landmass. GSAP owns `scale.y` for the intro reveal and nothing else
 * writes it, so the island grows out of the sea once and then stays put.
 */
export function Island() {
  const ref = useRef<THREE.Mesh>(null!)

  useGSAP(() => {
    gsap.set(ref.current.scale, { y: 0.02 })
    gsap.to(ref.current.scale, { y: 1, duration: 2.2, ease: EASE.entrance })
  }, [])

  return (
    <mesh
      ref={ref}
      geometry={ISLAND_GEOMETRY}
      material={ISLAND_MATERIAL}
      receiveShadow
      castShadow
    />
  )
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

// Wide enough that its edge is always past the fog's far plane — otherwise the
// horizon shows a square rim of ocean.
const WATER_GEOMETRY = new THREE.PlaneGeometry(900, 900, 220, 220)
WATER_GEOMETRY.rotateX(-Math.PI / 2)

/** Shared with the injected shader below; advanced once per frame. */
const uTime = { value: 0 }

const WAVE_GLSL = /* glsl */ `
  float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += 0.34 * sin(p.x * 0.16 + t * 0.9);
    h += 0.26 * sin(p.y * 0.21 - t * 0.72);
    h += 0.14 * sin((p.x + p.y) * 0.33 + t * 1.5);
    h += 0.07 * sin((p.x - p.y) * 0.55 - t * 1.9);
    return h;
  }
`

const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#1d5f8c',
  roughness: 0.08,
  metalness: 0.35,
  transparent: true,
  opacity: 0.93,
})

/**
 * Displacing 14k vertices on the CPU every frame would cost a buffer upload and
 * a normal recompute per frame. Injecting the wave into the standard material's
 * vertex stage keeps it on the GPU and — because the normal is derived
 * analytically from the same function — keeps the lighting correct.
 */
WATER_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime
  shader.vertexShader = `uniform float uTime;\n${WAVE_GLSL}\n${shader.vertexShader}`

  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    /* glsl */ `
      float e = 0.6;
      float hC = waveHeight(position.xz, uTime);
      float hX = waveHeight(position.xz + vec2(e, 0.0), uTime);
      float hZ = waveHeight(position.xz + vec2(0.0, e), uTime);
      vec3 objectNormal = normalize(vec3(-(hX - hC) / e, 1.0, -(hZ - hC) / e));
    `,
  )

  // `hC` is still in scope here — beginnormal_vertex is emitted earlier in main().
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */ `vec3 transformed = vec3(position.x, position.y + hC, position.z);`,
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
