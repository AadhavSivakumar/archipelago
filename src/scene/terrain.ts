import * as THREE from 'three'
import { uTime, WAVE_GLSL } from '../shaders/water'
import { DISTRICTS, districtCentre } from './districts'

/**
 * The plane is deliberately not square. The mainland runs off the -Z end, so
 * that axis needs enough depth for the land to end in water well before the
 * geometry's own boundary — a cut edge showing above the waterline reads as
 * exactly what it is.
 */
const TERRAIN_WIDTH = 180
const TERRAIN_DEPTH = 230
/** Land is faded out over this much of the plane's border. */
const RIM_FADE = 14
/**
 * ~0.40 units per quad in both axes: 452 x 576 quads, 261k vertices, 520k
 * triangles. That is 5.4x the old island's 96,800 over 6.8x the area.
 *
 * The height field is the load cost — measured in the hundreds of milliseconds,
 * synchronous, and it lands after React's first commit rather than before it,
 * so the boot screen in index.html is already gone by then. The early-out in
 * sampleHeight for open water is what keeps it tolerable; roughly two thirds of
 * these vertices are ocean.
 */
const SEGMENTS_X = 452
const SEGMENTS_Z = 576

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
 * Every island in the archipelago, as centre and nominal radius.
 *
 * The first five carry a district; the rest are uninhabited and exist to make
 * the water read as an archipelago rather than as five things placed on a grid.
 * The mainland is not in here — it is a coastline, not a blob, and is handled
 * separately below.
 *
 * The seeds are arbitrary but fixed: each island wobbles its own way, and two
 * islands of the same radius should not be the same shape.
 */
const ISLES: { x: number; z: number; radius: number; seed: number }[] = [
  ...DISTRICTS.filter((d) => d.id !== 'anthropology').map((d, i) => {
    const [x, z] = districtCentre(d)
    /*
      Radius follows the plateau, with a lot of shoulder. The nominal figure is
      not the shoreline: the wobble below and the mask's own falloff bring the
      waterline in to roughly two thirds of it, and everything the landmark
      scatters — up to 11 units from the centre — has to land inside that. This
      multiplier was raised until the narrowest bearing on every island still
      had beach beyond the plateau skirt.
    */
    return { x, z, radius: d.padRadius * 2.75 + 4, seed: i * 13 + 3 }
  }),
  // Uninhabited. Placed clear of the district islands, and clear of the open
  // water on the +Z side, which is meant to stay open.
  { x: -8, z: 38, radius: 6.5, seed: 207 },
  { x: 18, z: 34, radius: 4.5, seed: 214 },
  { x: -62, z: 4, radius: 6.0, seed: 221 },
  { x: 62, z: -4, radius: 7.0, seed: 228 },
  { x: 8, z: -36, radius: 5.0, seed: 235 },
  { x: -24, z: -38, radius: 5.5, seed: 242 },
  { x: 60, z: 34, radius: 4.0, seed: 249 },
  { x: -58, z: 36, radius: 5.0, seed: 256 },
]

/** Where the mainland's coast runs, before its wobble. Land lies further -Z. */
const MAINLAND_Z = -46
const MAINLAND_WOBBLE = 9
/** How far the coast ramps from open sea to full inland height. */
const MAINLAND_SHELF = 16

/*
  fbm() returns a normalised sum of value noise, and it does NOT span 0..1 —
  measured over this world it runs about 0.33..0.83 with a mean near 0.58. The
  usual `(fbm - 0.5) * 2` therefore produces a lopsided, compressed range: what
  looked like a coast wobbling +/-11 units was really wobbling -3.7..+7.3, and
  the coastline sat ten units from where the constant claimed. Remapping through
  the real centre and span makes the constants mean what they say.
*/
/** How far below the waterline open ocean sits. */
const SEABED = 40

const FBM_MID = 0.58
const FBM_SPAN = 0.25
const signedFbm = (x: number, y: number, octaves: number) =>
  (fbm(x, y, octaves) - FBM_MID) / FBM_SPAN

/**
 * How much land is at this point: 1 well inland, 0 in open water.
 *
 * The old field had a single radial `shore` term, which is what made the world
 * one island by construction — there was no way to express a second landmass.
 * This composes instead: the mainland's coastline, unioned with each island's
 * own wobbling disc. `max` rather than a sum, so two islands that overlap merge
 * into one landmass at full height instead of stacking into a spike.
 */
function coastZ(x: number) {
  // Sampled along a slowly varying 2-D path rather than a constant second
  // argument, so the coastline meanders instead of being a 1-D function of x.
  return MAINLAND_Z + MAINLAND_WOBBLE * signedFbm(x * 0.018 + 91, x * 0.011 - 4, 4)
}

/**
 * Fades land out before the plane's own boundary.
 *
 * Without it the mainland simply stops where the geometry does, and that cut
 * runs across the frame as a dead-straight line of dry land — measured at 83
 * visible metres of it in the Alps view, at only ~45% fog. Land has to end in
 * water on every side.
 */
function rimFade(x: number, z: number) {
  const over = Math.max(
    Math.abs(x) - (TERRAIN_WIDTH / 2 - RIM_FADE),
    Math.abs(z) - (TERRAIN_DEPTH / 2 - RIM_FADE),
  )
  return 1 - smoothstep(0, RIM_FADE, over)
}

function landMask(x: number, z: number) {
  let mask = smoothstep(coastZ(x), coastZ(x) - MAINLAND_SHELF, z)

  for (const isle of ISLES) {
    // Cheap rejection first: the vast majority of samples are nowhere near any
    // given island, and this runs a quarter of a million times per build.
    if (Math.abs(x - isle.x) > isle.radius * 1.6) continue
    if (Math.abs(z - isle.z) > isle.radius * 1.6) continue

    const dist = Math.hypot(x - isle.x, z - isle.z)
    // Wobble frequency scales with 1/radius, so a 9-unit islet gets the same
    // number of lobes around it as a 26-unit island. A fixed frequency made
    // everything small look like a perfect circle.
    const f = 2.4 / isle.radius
    const wobble =
      isle.radius * (0.85 + 0.225 * signedFbm(x * f + isle.seed, z * f - isle.seed, 3))
    const here = smoothstep(wobble, wobble * 0.52, dist)
    if (here > mask) mask = here
  }

  return mask * rimFade(x, z)
}

/**
 * A wider, gentler twin of landMask, used for nothing but the sea floor.
 *
 * The seabed term drops 40 units, and if it is driven by landMask it spends all
 * of that inside the mask's own narrow falloff — which is what turned every
 * island into a mesa ringed by a wall. Measured waterline slopes were 77-82
 * degrees, steep enough that the Alps ended in a sea cliff 1.4 units outside
 * their henge, four of seven chalets came to rest on 83-degree faces, and the
 * lighthouse plinth overhung open water by thirteen units.
 *
 * Giving the floor its own field, reaching 2.4x each island's radius, spreads
 * the same drop over roughly three times the distance. Shores now measure
 * 17-52 degrees.
 */
function shelfMask(x: number, z: number) {
  let mask = smoothstep(coastZ(x) + 26, coastZ(x) - MAINLAND_SHELF, z)

  for (const isle of ISLES) {
    const reach = isle.radius * 2.4
    if (Math.abs(x - isle.x) > reach) continue
    if (Math.abs(z - isle.z) > reach) continue

    const here = smoothstep(reach, isle.radius * 0.5, Math.hypot(x - isle.x, z - isle.z))
    if (here > mask) mask = here
  }

  // Faded at the rim as well, or the plane's border sits exactly at the
  // waterline instead of safely beneath it.
  return mask * rimFade(x, z)
}

/**
 * Ground height at a world XZ. Exported so landmarks can sit on the terrain
 * instead of hovering — the same function that builds the mesh answers "how
 * high is the ground here?", so the two can never drift apart.
 */
export function sampleHeight(x: number, z: number) {
  const land = landMask(x, z)
  const shelf = shelfMask(x, z)

  // Roughly two thirds of the plane is open water, and none of it needs a
  // district loop or a four-octave fbm to decide it is at seabed depth.
  if (land === 0 && shelf === 0) return -SEABED

  let h = Math.pow(land, 1.4) * (1.6 + 7.5 * fbm(x * 0.03 + 5, z * 0.03 + 5, 4))

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

  // Sea bed, driven by the shelf rather than by the land mask — see shelfMask.
  h -= SEABED * Math.pow(1 - shelf, 1.6)

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
  const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, SEGMENTS_X, SEGMENTS_Z)
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

/**
 * Coarse enough to be cheap, fine enough to keep the silhouette honest.
 *
 * Deliberately NOT scaled with the world: this is raycast six times on every
 * frame the camera moves, and its cost is linear in triangle count. 64 x 82
 * quads over the larger plane is ~2.8 units per quad — coarser than before, but
 * an island is ~30 units across, so a label still occludes against a silhouette
 * ten quads wide.
 */
const OCCLUDER_X = 64
const OCCLUDER_Z = 82

function buildOccluderGeometry() {
  const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, OCCLUDER_X, OCCLUDER_Z)
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
