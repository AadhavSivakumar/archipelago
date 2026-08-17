import * as THREE from 'three'

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
  /** Normal perturbation strength. 0 disables the bump entirely. */
  bump?: number
  /** Roughness variation, absolute. Added to roughnessFactor, then clamped. */
  rough?: number
}

const DEFAULTS: Required<WeatherOptions> = {
  grain: 1.6,
  mottle: 0.18,
  bump: 0.5,
  rough: 0.14,
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

// Four octaves, normalised to [0,1]. The 2.03 lacunarity rather than a clean
// 2.0 keeps successive octaves from aligning their lattices, which otherwise
// leaves a faint grid visible along the axes.
float sfFbm(vec3 p) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * sfNoise(p);
    n += a;
    p *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

uniform float uGrain;
uniform float uMottle;
uniform float uBump;
uniform float uRough;
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
  float dhdx = dFdx(sfGrain);
  float dhdy = dFdy(sfGrain);

  /*
    Fade the bump out once the noise stops being resolvable.

    dpdx/dpdy are the world-space footprint of one pixel, so their length is
    world units per pixel at this fragment. The finest of the four octaves has a
    period of 1 / (grain * 2.03^3), and once that period falls below a couple of
    pixels the perturbation is no longer texture — it is per-pixel noise, and on
    a slowly turning camera it crawls. Distant terrain is where this bites: at
    the home view the far mainland covers a few hundred metres of noise in a
    hundred pixels.

    Deriving the fade from the actual footprint rather than from a distance
    threshold means it stays correct at every zoom level and on every screen
    density, with no constant to retune when the camera changes.
  */
  float sfPx = max(length(dpdx), length(dpdy));

  float sfFade = clamp(1.0 - sfPx * uGrain * 3.0, 0.0, 1.0);
  diffuseColor.rgb = mix(sfBase, diffuseColor.rgb, sfFade);

  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);

  // A degenerate det means the fragment has no measurable footprint on the
  // surface — a silhouette edge, or a face seen exactly edge-on. Dividing
  // through it produces an enormous gradient and a black rim, so skip it.
  if (abs(det) > 1e-7) {
    vec3 grad = (r1 * dhdx + r2 * dhdy) / det;
    normal = normalize(normal - uBump * sfFade * grad);
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
        float sfGrain = sfFbm(vSurfPos * uGrain);
        vec3 sfBase = diffuseColor.rgb;
        diffuseColor.rgb *= 1.0 + (sfGrain - 0.5) * uMottle;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sfGrain - 0.5) * uRough, 0.03, 1.0);
        `,
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_GLSL}`)
  }

  // Without this every weathered material would collide with an unweathered one
  // of the same feature set in the program cache, and whichever compiled first
  // would win for both.
  material.customProgramCacheKey = () => 'weathered'
  material.needsUpdate = true
  return material
}
