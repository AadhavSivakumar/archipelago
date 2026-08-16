/**
 * The height field, and nothing else.
 *
 * Split out of terrain.ts so it can be imported by a Web Worker. The worker
 * must NOT reach three: workers do not share module instances with the page, so
 * an import here would give the worker its own 725kB copy of a library the main
 * thread has already downloaded. Everything below is plain arithmetic over
 * typed arrays, and the only import is the district table, which is pure data.
 *
 * terrain.ts keeps the parts that genuinely need three — the materials, and
 * assembling these arrays into a BufferGeometry.
 */
import { DISTRICTS, districtCentre, type DistrictId } from './districts'

/*
  The terrain grid is GRADED, not uniform.

  The mainland has to run off the edge of the world rather than end in a far
  shore — anything else reads as a big island, which is what it was. For its
  boundary to be genuinely invisible it has to sit beyond the fog's far plane,
  and at the resolution the islands need that would be millions of vertices of
  empty backdrop.

  So the grid is remapped through a cubic: spacing near the middle is unchanged,
  and stretches to roughly 9x at the edges. The islands keep every vertex they
  had, the world reaches far enough that its rim is fully fog-coloured, and the
  vertex count does not move.
*/

/** Rows and columns. Unchanged by the grading — only their spacing varies. */
export const GRID_X = 452
export const GRID_Z = 576

/** Half-extent of the grid before grading. Sets the dense middle. */
export const GRID_HALF_X = 90
export const GRID_HALF_Z = 115

/**
 * Half-extent of the world after grading.
 *
 * Sized against the fog at its WIDEST, not at desktop aspect. framing.ts pulls
 * the camera back up to 2x on a portrait phone and Scene.tsx scales the fog to
 * match, so the far plane reaches 680 there — and a constant world of 460 left
 * the mainland's horizon only a quarter fogged on exactly the form factor the
 * framing code exists for. The grading absorbs the extra distance for free:
 * edge quads coarsen to ~9 units, the vertex count does not move at all, and
 * that geometry is nothing but fog-coloured backdrop anyway.
 */
export const WORLD_HALF_X = 600
export const WORLD_HALF_Z = 900

/** Land is faded out over this much of the world's outer border. */
const RIM_FADE = 40

/**
 * Cubic grading. Identity at the centre (so the derivative there is exactly 1
 * and the islands keep their original spacing), reaching the world half-extent
 * at the grid's own edge.
 */
export function grade(t: number, gridHalf: number, worldHalf: number) {
  const s = Math.abs(t) / gridHalf
  const stretch = (worldHalf - gridHalf) / gridHalf
  return Math.sign(t) * gridHalf * (s + stretch * s * s * s)
}

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x
}

/** Tolerates edge0 > edge1, which is how most of the falloffs below are written. */
export function smoothstep(edge0: number, edge1: number, x: number) {
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
 * Districts that sit on the mainland rather than on an island of their own, and
 * so contribute no entry to ISLES.
 *
 * The Alps rise out of it as a range; Scientific Shores is a beach on its
 * coast. Both would be given a redundant — and, at Scientific Shores' position,
 * actively wrong — circular island if they were left in the table.
 */
const MAINLAND_DISTRICTS = new Set<DistrictId>(['anthropology', 'science'])

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
  ...DISTRICTS.filter((d) => !MAINLAND_DISTRICTS.has(d.id)).map((d, i) => {
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
  /*
    The centre island. Carries no district — it exists to hold the armillary
    globe, which now stands at the middle of the archipelago with the six
    territories set around it rather than being one exhibit inside one of them.
    Sized so the monument has a shoulder of land and nothing else fits.
  */
  { x: 0, z: -14, radius: 13, seed: 101 },

  // Uninhabited. Clear of the district islands, clear of the centre, and clear
  // of the open water on the +Z side, which is meant to stay open.
  { x: -14, z: 40, radius: 6.5, seed: 207 },
  { x: 16, z: 44, radius: 4.5, seed: 214 },
  { x: -74, z: 8, radius: 6.0, seed: 221 },
  { x: 74, z: 2, radius: 7.0, seed: 228 },
  { x: 10, z: -40, radius: 5.0, seed: 235 },
  { x: -26, z: -42, radius: 5.5, seed: 242 },
  { x: 76, z: 48, radius: 4.0, seed: 249 },
  { x: -78, z: 48, radius: 5.0, seed: 256 },
]

/** Where the mainland's coast runs, before its wobble. Land lies further -Z. */
const MAINLAND_Z = -46
const MAINLAND_WOBBLE = 9
/**
 * How far the coast ramps from open sea to full inland height.
 *
 * Widened from 16. At 16 the mainland met the sea over about two units of
 * gradient — a bank, not a shore — which is no use to a district called
 * Scientific Shores. Stretching the ramp gives the whole continental coast a
 * beach rather than an edge, and the sand band in the terrain's colour ramp
 * (roughly 0 to 0.6 in height) something to sit on.
 */
const MAINLAND_SHELF = 26

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
 * Fades land out at the world's outer boundary.
 *
 * Still necessary — geometry has to stop somewhere, and a cut edge of dry land
 * is unmistakable. But the boundary now sits 400+ units from the home camera,
 * far outside a fog that saturates at 340, so the fade happens entirely inside
 * fog-coloured haze. The mainland reads as running to the horizon because
 * everything that would betray otherwise is invisible.
 */
function rimFade(x: number, z: number) {
  const over = Math.max(
    Math.abs(x) - (WORLD_HALF_X - RIM_FADE),
    Math.abs(z) - (WORLD_HALF_Z - RIM_FADE),
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
// Array construction
//
// Hand-rolled rather than displacing a THREE.PlaneGeometry, for the same reason
// this file exists at all. The vertex order and index winding replicate
// PlaneGeometry exactly — rows of (segX + 1) vertices, z increasing with the
// row, two triangles per cell wound counter-clockwise as seen from +Y — so the
// geometry is identical to what the previous synchronous path produced.
// ---------------------------------------------------------------------------

export type GridArrays = {
  positions: Float32Array
  index: Uint32Array
}

/** Positions (graded, height-sampled) and the triangle index. */
export function buildGridArrays(segX: number, segZ: number): GridArrays {
  const nx = segX + 1
  const nz = segZ + 1
  const positions = new Float32Array(nx * nz * 3)

  // Grade each axis once rather than per vertex.
  const xs = new Float64Array(nx)
  const zs = new Float64Array(nz)
  for (let ix = 0; ix < nx; ix++) {
    xs[ix] = grade(-GRID_HALF_X + (ix * (GRID_HALF_X * 2)) / segX, GRID_HALF_X, WORLD_HALF_X)
  }
  for (let iz = 0; iz < nz; iz++) {
    zs[iz] = grade(-GRID_HALF_Z + (iz * (GRID_HALF_Z * 2)) / segZ, GRID_HALF_Z, WORLD_HALF_Z)
  }

  let p = 0
  for (let iz = 0; iz < nz; iz++) {
    const z = zs[iz]
    for (let ix = 0; ix < nx; ix++) {
      const x = xs[ix]
      positions[p++] = x
      positions[p++] = sampleHeight(x, z)
      positions[p++] = z
    }
  }

  // Uint32, not Uint16: 261k vertices is far past the 65,535 that a 16-bit
  // index can address, and the overflow would be silent.
  const index = new Uint32Array(segX * segZ * 6)
  let t = 0
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = ix + nx * iz
      const b = ix + nx * (iz + 1)
      const c = ix + 1 + nx * (iz + 1)
      const d = ix + 1 + nx * iz
      index[t++] = a
      index[t++] = b
      index[t++] = d
      index[t++] = b
      index[t++] = c
      index[t++] = d
    }
  }

  return { positions, index }
}

/**
 * The colour ramp, as linear RGB triples.
 *
 * Passed in from terrain.ts rather than defined here, because converting a hex
 * literal to the renderer's working space is three's job — THREE.Color applies
 * the sRGB to linear-sRGB transform on construction, and reimplementing that
 * transform here to save an import would be a good way to shift every colour in
 * the scene by a few percent and not notice.
 */
export type Palette = {
  deep: number[]
  wet: number[]
  sand: number[]
  grass: number[]
  forest: number[]
  rock: number[]
  snow: number[]
  districts: number[][]
}

/** Vertex normals and vertex colours for a grid built above. */
export function shadeTerrain(
  positions: Float32Array,
  index: Uint32Array,
  palette: Palette,
) {
  const count = positions.length / 3
  const normals = new Float32Array(positions.length)

  // Matches THREE.BufferGeometry.computeVertexNormals: the raw cross product is
  // accumulated un-normalised, so each face contributes in proportion to its
  // area, and only the final per-vertex sum is normalised.
  for (let i = 0; i < index.length; i += 3) {
    const ia = index[i] * 3
    const ib = index[i + 1] * 3
    const ic = index[i + 2] * 3

    const cbx = positions[ic] - positions[ib]
    const cby = positions[ic + 1] - positions[ib + 1]
    const cbz = positions[ic + 2] - positions[ib + 2]
    const abx = positions[ia] - positions[ib]
    const aby = positions[ia + 1] - positions[ib + 1]
    const abz = positions[ia + 2] - positions[ib + 2]

    const nx = cby * abz - cbz * aby
    const ny = cbz * abx - cbx * abz
    const nz = cbx * aby - cby * abx

    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= len
    normals[i + 1] /= len
    normals[i + 2] /= len
  }

  const colors = new Float32Array(positions.length)
  let r = 0, g = 0, b = 0
  const lerp = (t: number[], k: number) => {
    r += (t[0] - r) * k
    g += (t[1] - g) * k
    b += (t[2] - b) * k
  }

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]

    r = palette.deep[0]; g = palette.deep[1]; b = palette.deep[2]
    lerp(palette.wet, smoothstep(-13, -2.5, y))
    lerp(palette.sand, smoothstep(-2.5, 0.2, y))
    lerp(palette.grass, smoothstep(0.6, 2.4, y))
    lerp(palette.forest, smoothstep(3.2, 7.2, y))
    lerp(palette.rock, smoothstep(8.5, 13.5, y))

    // Rock before snow, so the snow line still reads on steep faces — the other
    // order buries the Alps under uniform grey.
    const slopeRock = smoothstep(0.9, 0.56, normals[i * 3 + 1]) * 0.62
    lerp(palette.rock, slopeRock)
    lerp(palette.snow, smoothstep(12.5, 17.0, y) * (1 - 0.5 * slopeRock))

    const aboveWater = smoothstep(0.1, 1.6, y)
    if (aboveWater > 0) {
      for (let j = 0; j < CENTRES.length; j++) {
        const c = CENTRES[j]
        const dist = Math.hypot(x - c.x, z - c.z)
        const w = smoothstep(c.d.padRadius * 2.6, c.d.padRadius * 0.6, dist)
        if (w > 0) lerp(palette.districts[j], w * 0.28 * aboveWater)
      }
    }

    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }

  return { normals, colors }
}
