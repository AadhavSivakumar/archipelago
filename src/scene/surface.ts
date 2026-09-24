import * as THREE from 'three'
import { uQuality } from './quality'

/**
 * Surface grain.
 *
 * Every material in this scene was a single flat colour with a single
 * roughness, and that — far more than polygon count — is what made the whole
 * thing read as moulded plastic. A real wall is never one value: it has grain,
 * it has slightly different roughness where it is worn, and it has micro-relief
 * that catches the light differently across a face. Without those, a surface
 * has nothing for the eye to measure it against, so it reads as toy-sized
 * whatever its geometry is doing.
 *
 * Rather than ship texture maps (which would mean fetching images, and the
 * scene deliberately fetches nothing), this patches the standard material
 * shader with a world-space noise field driving three things at once:
 *
 *   - albedo mottling, so the colour breaks up
 *   - roughness jitter, so the specular response breaks up with it
 *   - a derivative-based bump, so the *normal* breaks up too
 *
 * The bump is the one that matters most. Mottling alone just looks like a
 * dirty flat surface; perturbing the normal is what makes light graze across
 * it, and grazing light is the whole cue for "this has texture".
 *
 * World-space, not UV-space, on purpose: most of this geometry is lathes,
 * extrusions and CSG-ish stacks whose UVs are either meaningless or wildly
 * non-uniform, and every one of them would need unwrapping. World-space noise
 * needs no UVs at all and stays continuous across the seams between parts of
 * the same building.
 */

export type WeatherOptions = {
  /** Noise frequency, in cycles per world unit. Higher = finer grain. */
  grain?: number
  /** Albedo variation, as a fraction. 0.18 means ±9% brightness. */
  mottle?: number
  /**
   * Normal perturbation, as a slope: roughly how far the normal leans, in
   * radians, over the relief's strongest features. Independent of grain.
   * 0 disables the bump entirely.
   */
  bump?: number
  /** Roughness variation, absolute. Added to roughnessFactor, then clamped. */
  rough?: number
  /**
   * Noise octaves, 1-4. Each one is eight hashes per fragment, so this is the
   * single biggest lever on what a weathered surface costs to fill. Four is the
   * default and is right for things seen close; the terrain covers most of the
   * screen at all times and reads identically at three.
   */
  octaves?: number
}

/*
  Gentler than they were. With the fine octaves filtered out by the footprint
  fade, what is left of the grain at reading distance is its coarse variation,
  and coarse variation at the old strengths read as blotches on stone and
  dimples on metal. The strengths now describe how much a surface should
  vary at the scale a visitor can actually see it vary.
*/
const DEFAULTS: Required<WeatherOptions> = {
  grain: 1.6,
  mottle: 0.14,
  bump: 0.3,
  rough: 0.12,
  octaves: 4,
}

/**
 * Value noise on a 3D lattice.
 *
 * The hash is the integer bit-mix used elsewhere in this project rather than
 * the usual `fract(sin(dot(p, k)) * 43758.5453)`: that one relies on sin()
 * overflowing into garbage, which is precision-dependent, and on mobile GPUs
 * with different sin() implementations it visibly bands. This one is exact
 * integer arithmetic and looks the same everywhere.
 */
const NOISE_GLSL = /* glsl */ `
varying vec3 vSurfPos;

float sfHash(vec3 c) {
  uvec3 u = uvec3(ivec3(floor(c)) + 1024);
  uint h = u.x * 374761393u + u.y * 668265263u + u.z * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.0;
}

float sfNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sfHash(i), sfHash(i + vec3(1, 0, 0)), f.x),
        mix(sfHash(i + vec3(0, 1, 0)), sfHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(sfHash(i + vec3(0, 0, 1)), sfHash(i + vec3(1, 0, 1)), f.x),
        mix(sfHash(i + vec3(0, 1, 1)), sfHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

uniform float uGrain;
uniform float uMottle;
uniform float uBump;
uniform float uRough;
uniform float uQuality;

/*
  Value-noise fbm, filtered per octave against the pixel footprint.

  px is the world width of one pixel at this fragment, and f the octave's
  frequency, so f * px is how much of one period a pixel covers. An octave
  whose period is under about four pixels cannot be drawn as texture — it comes
  out as speckle, and speckle crawls when the camera moves — so each octave
  fades out as its period approaches that, and the loop stops at the first
  that is gone. For most of the frame at the home view that is the second.
  This is the mipmap of a procedural texture: far surfaces get the coarse
  octaves only, and cheaply; near ones get all of them, and smoothly, because
  the finest one drawn is always at least four pixels across.

  Two sums come out. The grain weights the octaves at the usual half per step
  and drives the colour and the roughness. The relief rolls them off harder
  and drives the bump, because the bump is a derivative, and a
  derivative weights each octave by its frequency — at half per step every
  octave moved the normal about as much as the one before, so the finest few
  made a surface sparkle rather than read as relief.

  The fade is the coarsest octave's own weight: the strength the whole effect
  is applied at, so that as the last octave goes, the effect goes with it
  rather than snapping off. The 2.03 lacunarity rather than a clean 2.0 keeps
  successive octaves from aligning their lattices, which otherwise leaves a
  faint grid visible along the axes.
*/
void sfFbm(vec3 p, float px, out float grain, out float relief, out float fade) {
  float a = 0.5, s = 0.0, n = 0.0;
  float b = 0.5, sr = 0.0, nr = 0.0;
  float f = uGrain;
  fade = 1.0 - smoothstep(0.125, 0.25, f * px);
  for (int i = 0; i < SF_OCTAVES; i++) {
    float w = 1.0 - smoothstep(0.125, 0.25, f * px);
    if (w <= 0.0) break;
    float v = sfNoise(p);
    s += a * w * v;
    n += a * w;
    sr += b * w * v;
    nr += b * w;
    p *= 2.03;
    f *= 2.03;
    a *= 0.5;
    b *= 0.42;
  }
  grain = n > 0.0 ? s / n : 0.5;
  relief = nr > 0.0 ? sr / nr : 0.5;
}
`

/**
 * Derivative bump mapping (Mikkelsen's method).
 *
 * The naive approach — sample the noise six more times to build a gradient —
 * costs seven fbm evaluations per fragment, which at four octaves each is 224
 * hashes. This reconstructs the same gradient from the screen-space
 * derivatives of a single sample, so it stays at one fbm. The cross products
 * project the screen-space slope back onto the surface tangent plane, which is
 * what makes it independent of viewing angle.
 *
 * The footprint fade that used to live here has moved into sfFbm, where it is
 * applied per octave rather than to the whole effect at once.
 */
const BUMP_GLSL = /* glsl */ `
{
  /*
    The surface derivatives are taken in VIEW space, not world space.

    The normal variable here is vNormal, which three computes as
    normalMatrix * objectNormal
    — a view-space vector. Mikkelsen's construction crosses the surface
    derivatives against that normal, so all three have to live in the same
    basis; feeding it world-space derivatives builds the tangent frame in one
    space and projects it in another. It still produces texture, which is why it
    survived a first look, but the perturbation points the wrong way by an
    amount that depends on where the camera happens to be standing — so a
    surface would visibly change its relief as you orbited it.

    -vViewPosition is the view-space position of this fragment, declared
    unconditionally by meshphysical. Only the derivatives move; the noise is
    still SAMPLED in world space, which is what keeps the grain anchored to the
    object rather than swimming with the camera. Lengths are unaffected either
    way, since the world-to-view transform is rigid, so the footprint fade below
    stays in world units.
  */
  vec3 sfViewPos = -vViewPosition;
  vec3 dpdx = dFdx(sfViewPos);
  vec3 dpdy = dFdy(sfViewPos);
  // The derivatives of the relief — the low-persistence sum, not the grain —
  // see sfFbm. The footprint fade is already folded into both.
  float dhdx = dFdx(sfRelief);
  float dhdy = dFdy(sfRelief);

  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);

  // A degenerate det means the fragment has no measurable footprint on the
  // surface — a silhouette edge, or a face seen exactly edge-on. Dividing
  // through it produces an enormous gradient and a black rim, so skip it.
  if (abs(det) > 1e-7) {
    /*
      Divided by the grain frequency, so that uBump is a slope: how far the
      normal leans, in radians or near enough, at the strongest of the
      relief — the same for a material grained at five cycles a unit as for
      one at half a cycle. Without this the gradient of a finer noise was
      simply larger, and a stone grained at five leaned its normals over a
      radian, which is not relief but a crater field; it read as sparkle
      only because the finest octaves scrambled it, and once those were
      filtered it read as what it was.
    */
    vec3 grad = (r1 * dhdx + r2 * dhdy) / (det * uGrain);
    normal = normalize(normal - uBump * uQuality * sfFade * grad);
  }
}
`

/**
 * Patch a standard material in place, and return it.
 *
 * Chains onto any existing onBeforeCompile rather than replacing it — the
 * island material already installs its own foam band, and that has to keep
 * running.
 *
 * All four controls are uniforms rather than baked constants so that every
 * weathered material compiles to byte-identical shader source and three's
 * program cache hands them all the same compiled program. Baking the numbers in
 * would mean one program per material, which is 20-odd extra compiles on a
 * scene whose whole point is to appear quickly.
 */
export function weather<M extends THREE.MeshStandardMaterial>(
  material: M,
  options: WeatherOptions = {},
): M {
  const o = { ...DEFAULTS, ...options }
  const previous = material.onBeforeCompile.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)

    // A define, not a uniform: the loop bound has to be a constant for the
    // compiler to unroll it, and unrolled is the whole point of a small count.
    shader.defines = { ...shader.defines, SF_OCTAVES: String(Math.max(1, Math.min(4, o.octaves))) }
    // The shared dial, by reference — see quality.ts.
    shader.uniforms.uQuality = uQuality
    shader.uniforms.uGrain = { value: o.grain }
    shader.uniforms.uMottle = { value: o.mottle }
    shader.uniforms.uBump = { value: o.bump }
    shader.uniforms.uRough = { value: o.rough }

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSurfPos;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        // instanceMatrix has not been applied to the local position yet —
        // that happens in project_vertex — so without this every instance of a
        // tree or a column would carry an identical patch of noise, and a
        // grove would look stamped rather than grown.
        #ifdef USE_INSTANCING
          vSurfPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vSurfPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${NOISE_GLSL}\nvoid main() {`)
      // color_fragment runs before roughness and normals in meshphysical, so
      // the sample taken here is in scope for both of the injections below.
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        /*
          The whole of the grain hangs off this one branch. At quality 0 the
          noise is never sampled: sfGrain stays at its midpoint, so the mottle
          below is a multiply by one, the roughness jitter is zero, and the
          bump's derivatives of a constant are zero. The branch is on a
          uniform, so every fragment of the draw takes the same side and the
          GPU pays a compare — not the sixteen to thirty-two hashes it skips.

          Inside it, the pixel footprint is measured first: the world width of
          one pixel here, which is what decides how many octaves this fragment
          can show. It is taken in world space, from the same position the
          noise is sampled at, and only its length is used.
        */
        float sfGrain = 0.5;
        float sfRelief = 0.5;
        float sfFade = 0.0;
        if (uQuality > 0.0) {
          float sfPx = max(length(dFdx(vSurfPos)), length(dFdy(vSurfPos)));
          sfFbm(vSurfPos * uGrain, sfPx, sfGrain, sfRelief, sfFade);
        }
        diffuseColor.rgb *= 1.0 + (sfGrain - 0.5) * uMottle * uQuality * sfFade;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sfGrain - 0.5) * uRough * uQuality * sfFade, 0.03, 1.0);
        `,
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_GLSL}`)
  }

  // Without this every weathered material would collide with an unweathered one
  // of the same feature set in the program cache, and whichever compiled first
  // would win for both.
  // The octave count is baked into the source, so materials that differ in it
  // must not share a compiled program.
  material.customProgramCacheKey = () => `weathered-${o.octaves}`
  material.needsUpdate = true
  return material
}
