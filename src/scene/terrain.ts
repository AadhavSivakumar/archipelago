import * as THREE from 'three'
import { uTime, WAVE_GLSL } from '../shaders/water'
import { DISTRICTS, districtCentre } from './districts'

export const ISLAND_RADIUS = 30

const TERRAIN_SIZE = 78
/** 220² quads ≈ 49k vertices. Enough to read as smooth terrain at this scale. */
const TERRAIN_SEGMENTS = 220

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x
}

/** Tolerates edge0 > edge1, which is how most of the falloffs below are written. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Value noise. Deterministic and dependency-free, so the island is identical on
// every load and in every build.
// ---------------------------------------------------------------------------

/**
 * Deterministic [0, 1) from an integer lattice point.
 *
 * An integer bit-mix rather than the usual `fract(sin(dot(p, k)) * 43758.5)`
 * trick, because this is the hottest function in the whole load path: the build
 * calls it about 2.23M times (48,841 vertices x ~7 fbm octaves x 4 lattice
 * corners), and the sin version pays a transcendental plus a floor on every one
 * of them, synchronously, before React mounts. Two xxhash primes scatter the
 * coordinates, then a Murmur-style finalizer avalanches the result. No
 * transcendentals at all.
 *
 * The two details that are load-bearing rather than decorative:
 *
 * - `Math.imul`, because plain `*` on these constants exceeds 2^53 and silently
 *   drops the low bits that carry the entropy.
 * - `+` to combine the two terms, NOT `^`. Both primes are odd, so XOR cancels
 *   the sign-flipped high bits whenever the inputs share a trailing-zero count,
 *   giving hash(x, y) === hash(-x, -y) across a third of point-reflected pairs
 *   (6,688 duplicate values over a 201x201 lattice; addition gives zero). The
 *   finalizer is a bijection, so it propagates that collision rather than
 *   repairing it — avalanche downstream cannot fix a lossy combine upstream.
 */
function hash(xi: number, yi: number) {
  let h = (Math.imul(xi, 374761393) + Math.imul(yi, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise2(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x: number, y: number, octaves: number) {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

// ---------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------

const CENTRES = DISTRICTS.map((d) => {
  const [x, z] = districtCentre(d)
  return { d, x, z }
})

/**
 * Ground height at a world XZ. Exported so landmarks can sit on the terrain
 * instead of hovering — the same function that builds the mesh answers "how
 * high is the ground here?", so the two can never drift apart.
 */
export function sampleHeight(x: number, z: number) {
  const r = Math.hypot(x, z)

  // A wobbling coastline reads as far more natural than a circle.
  const coast = ISLAND_RADIUS * (0.92 + 0.24 * (fbm(x * 0.04 + 31, z * 0.04 - 12, 3) - 0.5))
  const shore = smoothstep(coast, coast * 0.5, r)

  let h = Math.pow(shore, 1.4) * (1.6 + 7.5 * fbm(x * 0.03 + 5, z * 0.03 + 5, 4))

  // Per-district relief, then a plateau flattened under the landmark.
  for (const c of CENTRES) {
    const dist = Math.hypot(x - c.x, z - c.z)
    const reach = c.d.padRadius * 3
    if (dist > reach) continue

    const ring = Math.exp(-((dist / reach) ** 2) * 2.2)
    h += c.d.relief * ring * (fbm(x * 0.09 + c.x, z * 0.09 + c.z, 3) - 0.35)

    const flat = smoothstep(c.d.padRadius * 1.45, c.d.padRadius * 0.98, dist)
    h += (c.d.pad - h) * flat * 0.92
  }

  // Peaks are added after flattening so the Alps are not levelled by their own
  // plateau.
  for (const c of CENTRES) {
    if (!c.d.bumps) continue
    for (const b of c.d.bumps) {
      const dist = Math.hypot(x - (c.x + b.dx), z - (c.z + b.dz))
      h += b.h * Math.exp(-((dist / b.r) ** 2))
    }
  }

  // Sea bed. This drops hard rather than gently: the terrain plane is a square,
  // and a shallow shelf leaves its straight edge visible through the translucent
  // water as a dark rectangle. Plunging to ~-22 puts the whole shelf out of
  // sight below the surface.
  h -= 34 * Math.pow(1 - shore, 1.6)

  return h
}

// ---------------------------------------------------------------------------
// Geometry + vertex colours
// ---------------------------------------------------------------------------

// Matched to the water's own colour so the sea floor is indistinguishable from
// open ocean through the (93% opaque) surface. Anything lighter and the terrain
// plane's straight edge shows up as a rectangle on the seabed.
const DEEP = new THREE.Color('#1d5f8c')
const WET = new THREE.Color('#7d7458')
const SAND = new THREE.Color('#d9caa5')
const GRASS = new THREE.Color('#5f8f4e')
const FOREST = new THREE.Color('#3b6a3c')
const ROCK = new THREE.Color('#7f776a')
const SNOW = new THREE.Color('#eef2f8')

const DISTRICT_COLORS = DISTRICTS.map((d) => new THREE.Color(d.color))
const scratch = new THREE.Color()

function buildIslandGeometry() {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  )
  // Lay the plane flat once, on the geometry, so every vertex is (x, height, z).
  geo.rotateX(-Math.PI / 2)

  const position = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    position.setY(i, sampleHeight(position.getX(i), position.getZ(i)))
  }
  position.needsUpdate = true
  geo.computeVertexNormals()

  // Colour is banded by height, then darkened toward rock on steep faces, then
  // tinted per district. Slope comes from the normals computed above, which is
  // cheaper and more accurate than re-sampling neighbouring heights.
  const normal = geo.attributes.normal as THREE.BufferAttribute
  const colors = new Float32Array(position.count * 3)

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)

    scratch.copy(DEEP)
    scratch.lerp(WET, smoothstep(-13, -2.5, y))
    scratch.lerp(SAND, smoothstep(-2.5, 0.2, y))
    scratch.lerp(GRASS, smoothstep(0.6, 2.4, y))
    scratch.lerp(FOREST, smoothstep(3.2, 7.2, y))
    scratch.lerp(ROCK, smoothstep(8.5, 13.5, y))

    // Rock before snow, so the snow line still reads on steep faces — the other
    // order buries the Alps under uniform grey.
    const slopeRock = smoothstep(0.9, 0.56, normal.getY(i)) * 0.62
    scratch.lerp(ROCK, slopeRock)
    scratch.lerp(SNOW, smoothstep(12.5, 17.0, y) * (1 - 0.5 * slopeRock))

    const aboveWater = smoothstep(0.1, 1.6, y)
    if (aboveWater > 0) {
      for (let j = 0; j < CENTRES.length; j++) {
        const c = CENTRES[j]
        const dist = Math.hypot(x - c.x, z - c.z)
        const w = smoothstep(c.d.padRadius * 2.6, c.d.padRadius * 0.6, dist)
        if (w > 0) scratch.lerp(DISTRICT_COLORS[j], w * 0.28 * aboveWater)
      }
    }

    colors[i * 3] = scratch.r
    colors[i * 3 + 1] = scratch.g
    colors[i * 3 + 2] = scratch.b
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** Coarse enough to be cheap, fine enough to keep the silhouette honest. */
const OCCLUDER_SEGMENTS = 64

function buildOccluderGeometry() {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    OCCLUDER_SEGMENTS,
    OCCLUDER_SEGMENTS,
  )
  geo.rotateX(-Math.PI / 2)

  const position = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    position.setY(i, sampleHeight(position.getX(i), position.getZ(i)))
  }
  position.needsUpdate = true

  // Both matter for raycast cost. Mesh.raycast tries a bounding-box reject
  // before touching triangles, but guards it with `boundingBox !== null` — and
  // nothing computes it unless asked, so without this the reject never fires.
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

let occluderBuilt: THREE.PlaneGeometry | null = null

/**
 * A coarse stand-in for the island, used only as a raycast target.
 *
 * drei's `<Html occlude>` re-tests a label whenever its projected position
 * moves more than 0.001 *pixels* — so every frame of every camera flight, every
 * orbit drag, and the ~2s of OrbitControls damping that follows one. Against
 * the display mesh that is 96,800 triangles times six labels, with no BVH:
 * measured at 15-19ms of main-thread JS per frame, which is more than the
 * entire 60fps budget spent answering a yes/no question.
 *
 * At 64x64 this is 8,192 triangles and about 1.7ms for all six. The silhouette
 * is close enough that the verdict matches the display mesh nearly everywhere;
 * where it disagrees, a label winks a frame early or late at a ridge line.
 */
export function islandOccluderGeometry() {
  occluderBuilt ??= buildOccluderGeometry()
  return occluderBuilt
}

let built: THREE.PlaneGeometry | null = null

/**
 * The island mesh, built on first request and cached.
 *
 * Be honest about what moving this off module scope does and does not buy.
 * It does NOT by itself let anything paint sooner — React's initial render is
 * synchronous, so the build still blocks the first frame; the static markup in
 * index.html is what covers that window.
 *
 * What it does buy: importing this module no longer forces the build. That
 * matters because landmarks.tsx imports `sampleHeight` from here, so the old
 * module-scope constant meant merely referencing the height field pulled 49k
 * vertices of noise along with it. It also puts the work behind one call site,
 * which is what a Worker or a Suspense-throwing resource would replace.
 */
export function islandGeometry() {
  built ??= buildIslandGeometry()
  return built
}

export const ISLAND_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0,
})

/**
 * Foam along the waterline.
 *
 * The land/sea seam is the island's entire silhouette, and it was the one place
 * where the two halves of the scene visibly disagreed: the coast is a
 * build-time vertex-colour ramp baked into a static mesh, while the ocean
 * beside it slides up and down every frame. Painting a foam band whose height
 * is driven by the *same* wave function makes the shoreline advance and retreat
 * with the swell instead of sitting still underneath it.
 *
 * Local position, not world. The island lives inside a group whose scale.y runs
 * 0.02 -> 1 during the reveal, so world Y is only the terrain height once that
 * has finished; `position.y` is the real height from the first frame.
 */
ISLAND_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime

  shader.vertexShader = `varying vec3 vLocalPos;\n${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  vLocalPos = position;',
  )

  shader.fragmentShader = `uniform float uTime;\nvarying vec3 vLocalPos;\n${WAVE_GLSL}\n${shader.fragmentShader}`.replace(
    '#include <color_fragment>',
    /* glsl */ `
      #include <color_fragment>
      float surface = waveHeight(vLocalPos.xz, uTime);
      /*
        Half-width of the band. Note there is no clearance margin to the lowest
        plateau, and it would be wrong to infer one from the district's pad
        value: pad is the flatten TARGET, and the seabed term subtracts from the
        result afterwards. Scientific Shores has the largest radius of the six, so that
        subtraction bites hardest there — its centre actually samples about
        -0.33, i.e. fractionally under water. That district sits in the foam by
        construction, which is right for somewhere called Shores, but it means
        widening this number pushes white inland rather than merely thickening
        the coastline.
      */
      float foam = 1.0 - smoothstep(0.0, 1.1, abs(vLocalPos.y - surface));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.98), foam * 0.6);
    `,
  )
}
