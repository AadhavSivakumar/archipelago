import * as THREE from 'three'
import { uQuality } from '../scene/quality'

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

/*
  Four travelling waves, on four unrelated bearings.

  The previous set ran on x, on z, on (x+z) and on (x-z) — the two axes and
  their two diagonals. Four directions at 45 degrees to each other, with
  wavenumbers 0.16, 0.21, 0.33 and 0.55, interfere into a *regular* pattern,
  and with the ocean at low roughness the specular printed it across the whole
  surface as a field of hexagonal scales. It read as a texture tiled over the
  sea rather than as the sea.

  Two things fix it, and both are needed. The bearings are now irregular unit
  vectors rather than axis-aligned, so no two crests are parallel or
  perpendicular. And the wavenumbers are in ratios near 1.7 rather than near
  1.5 and 2.0, so the components have no low common multiple to repeat at — the
  same reason fbm uses a lacunarity of 2.03 instead of 2.

  The wavenumbers now stop at 0.27, a 23-unit wavelength. The ocean plane is
  1600 units across 256 segments, so a quad is 6.25 units, and anything shorter
  than about three quads shows up as faceting rather than as swell. There used
  to be a fourth component at 0.46 — a 13.6-unit wavelength — and it is what
  made the plane need 400 segments and 320,000 triangles. It has moved into the
  per-fragment chop below, where the same scale costs no vertices at all.
*/
export const WAVE_GLSL = /* glsl */ `
  float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += 0.36 * sin(dot(p, vec2( 0.94,  0.34)) * 0.09 + t * 0.62);
    h += 0.25 * sin(dot(p, vec2(-0.41,  0.91)) * 0.15 - t * 0.85);
    h += 0.15 * sin(dot(p, vec2( 0.71, -0.70)) * 0.27 + t * 1.24);
    return h;
  }
`

/**
 * CPU twin of the GLSL above. `p.y` there is this `z` — the shader is handed
 * `position.xz`, so its second component is the world Z axis.
 */
export function waveHeight(x: number, z: number, t: number) {
  return (
    0.36 * Math.sin((x * 0.94 + z * 0.34) * 0.09 + t * 0.62) +
    0.25 * Math.sin((x * -0.41 + z * 0.91) * 0.15 - t * 0.85) +
    0.15 * Math.sin((x * 0.71 + z * -0.7) * 0.27 + t * 1.24)
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
export const WAVE_DISPLACE_CHUNK = /* glsl */ `
  vec3 transformed = vec3(position.x, position.y + hC, position.z);
  vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xz;
`

/**
 * Chop, added per fragment rather than per vertex.
 *
 * The swell above is limited to wavelengths the 4-unit vertex grid can carry.
 * Everything shorter — the ripple that actually catches the sun and stops the
 * sea reading as a sheet of coloured glass — has to perturb the normal
 * directly, which needs no vertices at all.
 *
 * The gradient is analytic rather than sampled: d/dp of a sin() is a cos(),
 * so the slope costs the same as the height and is exact. Because the surface
 * is near-horizontal, folding the 2D gradient straight into the normal's xz is
 * accurate to well within the error the swell itself introduces.
 *
 * Faded out with the pixel footprint, for the same reason the surface grain in
 * surface.ts is: past a certain distance one pixel spans several ripples, and
 * what had been chop becomes crawling noise along the horizon.
 */
export const WAVE_CHOP_GLSL = /* glsl */ `
  /*
    One chop wave, faded at its own frequency.

    A single shared distance fade was wrong, and visibly so: it was tuned for
    the coarse terms, so the 5.1 and 7.7 wavenumbers were still at most of
    their amplitude out where one pixel already spanned several of their
    crests. The result was not texture but moire — a dotted grid crawling
    across the middle distance, which looked far worse than the flat sea it
    replaced.

    px is the world-space width of a pixel here, so px * k is roughly how much
    of a wave's phase one pixel covers. Requiring about ten pixels per
    wavelength before a term reaches full strength keeps every component above
    its own Nyquist limit, and means the fine ripple simply is not drawn where
    it could not be resolved — which is also where nobody would see it.
  */
  vec2 chopTerm(vec2 p, vec2 d, float k, float a, float w, float t, float px) {
    return a * k * d * cos(dot(p, d) * k + w * t) * clamp(1.0 - px * k * 1.6, 0.0, 1.0);
  }
`

/**
 * Chop, added per fragment rather than per vertex.
 *
 * The swell in WAVE_GLSL is limited to wavelengths the 4-unit vertex grid can
 * carry. Everything shorter — the ripple that actually catches the sun and
 * stops the sea reading as a sheet of coloured glass — has to perturb the
 * normal directly, which needs no vertices at all.
 *
 * The gradient is analytic rather than sampled: d/dp of a sin() is a cos(), so
 * the slope costs the same as the height and is exact. Because the surface is
 * near-horizontal, folding the 2D gradient straight into the normal's xz is
 * accurate to well within the error the swell itself introduces.
 */
export const WAVE_CHOP_CHUNK = /* glsl */ `
// Skipped outright at quality 0 — see quality.ts. Five cosines, a modulating
// sixth and two derivative lengths per fragment, across the largest surface in
// the frame, is the single most expensive thing the water does.
if (uChopStrength * uQuality > 0.0) {
  /*
    uChopScale compresses the whole ripple field into a smaller patch of world,
    so the same wave set can dress both the open ocean and the pool inlaid in
    the Geographical Garden's map — which is twelve units across, where a swell
    authored for a 1600-unit plane would not complete a single crest.

    The gradient is deliberately NOT rescaled with it. Multiplying space by s
    shortens every wavelength by s while leaving the amplitudes alone, which
    would make the small water proportionally s times steeper and read as
    corrugated iron. Leaving the gradient in sample space instead keeps the
    apparent slope of the ripple the same at every scale, which is what makes it
    read as water rather than as a scale model of water.

    px is scaled, because that one genuinely is about the sampling rate: a pixel
    covers s times as much of the wave when the wave is s times finer.
  */
  vec2 p = vWaterPos * uChopScale;
  float px = max(length(dFdx(vWaterPos)), length(dFdy(vWaterPos))) * uChopScale;

  vec2 g = vec2(0.0);
  // 0.27 in world terms, picking up the swell component the vertex stage no
  // longer carries — see the note above WAVE_GLSL.
  g += chopTerm(p, vec2(-0.87, -0.49), 0.46, 0.075, -1.7, uTime, px);
  g += chopTerm(p, vec2( 0.62,  0.78), 1.10, 0.045,  2.7, uTime, px);
  g += chopTerm(p, vec2(-0.79,  0.61), 1.90, 0.030, -3.4, uTime, px);
  g += chopTerm(p, vec2( 0.31, -0.95), 3.30, 0.018,  4.6, uTime, px);
  g += chopTerm(p, vec2(-0.98, -0.20), 5.10, 0.013, -5.9, uTime, px);
  g += chopTerm(p, vec2( 0.55,  0.84), 7.70, 0.009,  7.3, uTime, px);

  // Five pure sines still lay down visible corduroy: their crests are
  // infinitely long, so wherever two happen to align the stripe runs
  // uninterrupted to the horizon. Modulating the whole gradient by a sixth,
  // very slow wave travelling crossways gives the chop patches of calm and
  // patches of texture — the "cat\'s paw" a real breeze leaves — and no stripe
  // survives the whole way across one.
  g *= 0.55 + 0.45 * sin(dot(p, vec2(0.36, -0.93)) * 0.052 + uTime * 0.31);

  /*
    Rotated into view space before it is applied.

    The water is horizontal in WORLD space, so the perturbed world normal is
    normalize(vec3(-g.x, 1, -g.y)) — the gradient tilts it away from world up.
    But the shader's normal at this point is vNormal, which is in VIEW
    space, so adding a world-space offset to it is a category error.

    It was not an invisible one. Seen obliquely from across the ocean, world Y
    lands close to view Y and the mistake merely bent the ripples; seen from
    almost directly overhead, as the Geographical Garden's map is, world X and Z
    land in the SCREEN plane and world Y goes into depth, so the tilt that
    should have caught the sun went into the one axis that barely changes what a
    facet reflects — and the pool rendered as a flat blue rectangle no matter
    how far the chop was pushed.

    mat3(viewMatrix) columns 0 and 2 are the world X and Z axes expressed in
    view space, which is exactly the change of basis needed, and it costs one
    matrix the fragment shader is already given.
  */
  mat3 wv = mat3(viewMatrix);
  normal = normalize(normal - (wv[0] * g.x + wv[2] * g.y) * uChopStrength * uQuality);
}
`

/**
 * Patch a standard material so its surface behaves like water.
 *
 * Two independent halves. `swell` displaces vertices by waveHeight and derives
 * the matching normal — the real sea, and it needs a plane with enough segments
 * to carry the displacement. Without it only the fragment-level chop is
 * applied, which needs no subdivision at all because it perturbs the normal
 * rather than the surface. A flat inlaid pool wants exactly that: it should
 * glint and ripple, not heave.
 *
 * Both halves share one uTime, so every body of water in the scene is on the
 * same clock and the boat, the foam band and the map's pool cannot drift out of
 * phase with the sea they belong to.
 */
export function water(
  material: THREE.MeshStandardMaterial,
  { swell = false, chopScale = 1, chopStrength = 1 } = {},
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.uniforms.uQuality = uQuality
    shader.uniforms.uChopScale = { value: chopScale }
    shader.uniforms.uChopStrength = { value: chopStrength }

    let vert = `uniform float uTime;\nvarying vec2 vWaterPos;\n${WAVE_GLSL}\n${shader.vertexShader}`

    if (swell) {
      vert = vert
        .replace('#include <beginnormal_vertex>', WAVE_NORMAL_CHUNK)
        .replace('#include <begin_vertex>', WAVE_DISPLACE_CHUNK)
    } else {
      // No displacement, but the chop still needs to know where on the surface
      // it is, so the varying is written from the undisturbed position.
      vert = vert.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xz;',
      )
    }
    shader.vertexShader = vert

    shader.fragmentShader = [
      'uniform float uTime;',
      'uniform float uChopScale;',
      'uniform float uChopStrength;',
      'uniform float uQuality;',
      'varying vec2 vWaterPos;',
      WAVE_CHOP_GLSL,
      shader.fragmentShader,
    ]
      .join('\n')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WAVE_CHOP_CHUNK}`)
  }

  // The two variants compile to different vertex source, so they must not share
  // a cache entry — otherwise whichever compiled first would be handed to both
  // and one of them would be silently wrong.
  material.customProgramCacheKey = () => `water-${swell}`
  material.needsUpdate = true
  return material
}
