/**
 * The sea surface, as one definition.
 *
 * Three things need to agree about where the water is at a given moment: the
 * ocean's own vertex displacement, the foam band painted along the island's
 * shoreline, and anything floating on the surface. When the wave lived inline
 * in Island.tsx there was one consumer and no risk; with three, a divergence
 * would show up as foam that lags the swell or a boat that sinks through it.
 *
 * So the function is written twice — once in GLSL for the GPU, once in TS for
 * the CPU — and the two are kept literally side by side. Change one, change
 * the other.
 */

/** Advanced once per frame by <Water>; shared by every material below. */
export const uTime = { value: 0 }

export const WAVE_GLSL = /* glsl */ `
  float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += 0.34 * sin(p.x * 0.16 + t * 0.9);
    h += 0.26 * sin(p.y * 0.21 - t * 0.72);
    h += 0.14 * sin((p.x + p.y) * 0.33 + t * 1.5);
    h += 0.07 * sin((p.x - p.y) * 0.55 - t * 1.9);
    return h;
  }
`

/**
 * CPU twin of the GLSL above. `p.y` there is this `z` — the shader is handed
 * `position.xz`, so its second component is the world Z axis.
 */
export function waveHeight(x: number, z: number, t: number) {
  return (
    0.34 * Math.sin(x * 0.16 + t * 0.9) +
    0.26 * Math.sin(z * 0.21 - t * 0.72) +
    0.14 * Math.sin((x + z) * 0.33 + t * 1.5) +
    0.07 * Math.sin((x - z) * 0.55 - t * 1.9)
  )
}

/**
 * Displacing 14k vertices on the CPU every frame would cost a buffer upload and
 * a normal recompute per frame. Injecting the wave into the standard material's
 * vertex stage keeps it on the GPU and — because the normal is derived
 * analytically from the same function — keeps the lighting correct.
 */
export const WAVE_NORMAL_CHUNK = /* glsl */ `
  float e = 0.6;
  float hC = waveHeight(position.xz, uTime);
  float hX = waveHeight(position.xz + vec2(e, 0.0), uTime);
  float hZ = waveHeight(position.xz + vec2(0.0, e), uTime);
  vec3 objectNormal = normalize(vec3(-(hX - hC) / e, 1.0, -(hZ - hC) / e));
`

/** `hC` is still in scope — beginnormal_vertex is emitted earlier in main(). */
export const WAVE_DISPLACE_CHUNK = /* glsl */ `vec3 transformed = vec3(position.x, position.y + hC, position.z);`
