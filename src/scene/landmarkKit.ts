import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DISTRICTS, districtCentre, type District, type DistrictId } from './districts'
import { sampleHeight } from './terrain'
import { weather, type WeatherOptions } from './surface'

/**
 * What every landmark is built from: the shared materials, the placement
 * helpers, and the props a district's component takes. Split out of
 * landmarks.tsx once there were enough districts to want files of their own,
 * so that a timeline, a family tree and a beach can each be a module without
 * any of them importing the others.
 */

// ---------------------------------------------------------------------------
// Shared materials. One instance each, reused by every landmark — a fresh
// MeshStandardMaterial per mesh would mean a fresh shader program per mesh.
// ---------------------------------------------------------------------------

/*
  Every material here is weathered — see surface.ts. The colours were also
  pulled back from where they started: they had been picked as swatches, at the
  saturation you would choose for an icon, and a scene lit by one warm sun is
  going to push them further still. Weathered stone is a grey with a hint of
  something in it, not a colour; the accents below carry the hue, and they only
  read as accents if the bulk of the scene does not compete.

  The per-material grain is the real tuning knob. Scale it to the *feature* the
  surface should show: quarried stone has a coarse pit at roughly a fifth of a
  world unit (grain 5), planed timber has a fine grain along it (grain 9),
  polished marble and metal have almost none, and foliage wants a large, soft
  variation that reads as different leaves catching light rather than as dirt.
*/
export const std = (p: THREE.MeshStandardMaterialParameters, w: WeatherOptions = {}) =>
  weather(new THREE.MeshStandardMaterial(p), w)

/** Cut stone: pitted, matte, and never quite one colour across a face. */
export const QUARRIED: WeatherOptions = { grain: 5, mottle: 0.18, bump: 0.35, rough: 0.18 }
/** Dressed or polished stone: the same rock, worked smooth. */
export const DRESSED: WeatherOptions = { grain: 7, mottle: 0.1, bump: 0.18, rough: 0.1 }
/** Metal: almost no albedo variation, but roughness variation is what stops a
    metal reading as a mirrored blob, so that one stays up. */
export const METAL: WeatherOptions = { grain: 9, mottle: 0.06, bump: 0.1, rough: 0.22 }
/** Foliage: broad, strong colour variation, no micro-bump worth the cost. */
export const FOLIAGE: WeatherOptions = { grain: 1.5, mottle: 0.46, bump: 0.4, rough: 0.12 }

export const mat = {
  marble: std({ color: '#dcd6cb', roughness: 0.42 }, DRESSED),
  stone: std({ color: '#9d9a92', roughness: 0.88 }, QUARRIED),
  /** For open-ended and ring geometry, which is visible from both faces. */
  stoneBoth: std({ color: '#9d9a92', roughness: 0.88, side: THREE.DoubleSide }, QUARRIED),
  darkStone: std({ color: '#615d56', roughness: 0.92 }, QUARRIED),
  sandstone: std({ color: '#ab8a63', roughness: 0.9 }, QUARRIED),
  gold: std({ color: '#c2a052', roughness: 0.3, metalness: 0.92 }, METAL),
  brass: std({ color: '#9c7f3f', roughness: 0.38, metalness: 0.82 }, METAL),
  steel: std({ color: '#a7b0ba', roughness: 0.32, metalness: 0.88 }, METAL),
  dark: std({ color: '#33373e', roughness: 0.6, metalness: 0.25 }, DRESSED),
  wood: std({ color: '#6b4a2e', roughness: 0.88 }, { grain: 9, mottle: 0.3, bump: 0.3, rough: 0.16 }),
  leaf: std({ color: '#3c6d41', roughness: 0.85 }, FOLIAGE),
  leafWarm: std({ color: '#63883c', roughness: 0.85 }, FOLIAGE),
  /** For fronds and other leaves seen from both faces. */
  leafBoth: std({ color: '#3c6d41', roughness: 0.85, side: THREE.DoubleSide }, FOLIAGE),
  hedge: std({ color: '#33603a', roughness: 0.94 }, { ...FOLIAGE, grain: 3.2 }),
  // Glass gets nothing: grain on a transparent surface reads as grime, and
  // these are the one thing in the scene that should look manufactured.
  glass: std({ color: '#a8dcff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6 }, { mottle: 0, bump: 0, rough: 0 }),
  snow: std({ color: '#e8eef6', roughness: 0.78 }, { grain: 2.4, mottle: 0.1, bump: 0.4, rough: 0.1 }),
  ember: std({ color: '#b8492f', roughness: 0.62 }, DRESSED),
  canvasCloth: std({ color: '#ded4c4', roughness: 0.92 }, { grain: 14, mottle: 0.16, bump: 0.3, rough: 0.1 }),
}

/** One emissive accent material per district, keyed off the palette in districts.ts. */
export const ACCENT = Object.fromEntries(
  DISTRICTS.map((d) => [
    d.id,
    std(
      {
        color: d.accent,
        roughness: 0.36,
        metalness: 0.45,
        /*
          0.2, not the 0.4 this was raised to when bloom went in. Bloom made the
          small accents — the torus knot, the monoliths, the canvas — read as
          lit, which was the intent; but the same material also covers the
          rotunda's five-metre dome, and at 0.4 a surface that size emits enough
          of its own light to cancel its shading. It went flat and plastic. The
          small pieces still catch the bloom threshold at 0.2 because they are
          also the ones angled to take a specular highlight.
        */
        emissive: new THREE.Color(d.accent),
        emissiveIntensity: 0.2,
      },
      // Broad and shallow: these are the largest smooth surfaces in the
      // scene, and at any more than this the dome reads as hammered.
      { grain: 4, mottle: 0.07, bump: 0.1, rough: 0.16 },
    ),
  ]),
) as Record<DistrictId, THREE.MeshStandardMaterial>

export type LandmarkProps = {
  d: District
  /**
   * Whether this district is the one currently being looked at.
   *
   * Only the Geographical Garden uses it, and it needs it: its countries are
   * pickable, and a pick has to mean "select this country" only once the
   * visitor is actually reading the map. From the whole-archipelago view the
   * plate is forty pixels across, and a click there means "take me to the
   * Garden" — which is what the group above this handles, and what a country
   * handler would swallow.
   */
  focused: boolean
}


// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/** Deterministic LCG — the scene must look identical on every load. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Deterministically perturbs a geometry's vertices, so a turned or extruded
 * form stops looking machined.
 *
 * The offset is keyed off the vertex POSITION rather than its index. Most of
 * three's primitives duplicate vertices — at a cylinder's seam, or per-face on
 * a polyhedron — and jittering those independently tears the surface open.
 * Hashing the position means coincident vertices always move together, so the
 * mesh stays closed without a merge pass.
 */
export function roughen(geo: THREE.BufferGeometry, amount: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const key = (v: number) => Math.round(v * 1000)
  const offsets = new Map<string, [number, number, number]>()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const k = `${key(x)},${key(y)},${key(z)}`

    let off = offsets.get(k)
    if (!off) {
      const r = rng((Math.imul(key(x), 73856093) ^ Math.imul(key(y), 19349663) ^ Math.imul(key(z), 83492791)) >>> 0)
      off = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]
      offsets.set(k, off)
    }
    pos.setXYZ(i, x + off[0], y + off[1], z + off[2])
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/**
 * Push a closed shape off being a sphere.
 *
 * roughen() above adds white noise per vertex, which is right for hewn stone —
 * the displacement should be uncorrelated because chisel marks are. It is
 * exactly wrong for a tree crown: at 48x36 the noise is finer than a pixel, so
 * a canopy roughened that way is a sphere with fuzz on it, and still reads as a
 * green ball on a stick.
 *
 * What a crown actually has is a handful of *masses* — the boughs — each
 * pushing the outline out in its own direction, with hollows between them. So
 * this displaces along the radius by a sum of a few wide cosine lobes pointed
 * in random directions: coherent at exactly the scale that changes a
 * silhouette, and untouched at the scale that would only add noise.
 *
 * The lobes are raised to a power to narrow them; without that they overlap
 * into a uniform swelling and the result is a slightly larger sphere.
 */
export function lumpen(geo: THREE.BufferGeometry, seed: number, amount: number, lobes = 7) {
  const rand = rng(seed)
  const dirs = Array.from({ length: lobes }, () => {
    // Uniform on the sphere. Picking two angles instead clusters at the poles,
    // which would put every bough on the top and bottom of the crown.
    const u = rand() * 2 - 1
    const t = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    return { x: s * Math.cos(t), y: u, z: s * Math.sin(t), w: 0.45 + rand() }
  })
  const total = dirs.reduce((a, d) => a + d.w, 0)

  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const len = Math.hypot(x, y, z) || 1

    let d = 0
    for (const g of dirs) {
      const c = (x * g.x + y * g.y + z * g.z) / len
      if (c > 0) d += g.w * c * c * c
    }

    // Centred on zero so the crown keeps its nominal volume: the lobes push out
    // where they point and the radius pulls in everywhere else, rather than the
    // whole thing inflating.
    const k = 1 + amount * ((d / total) * 2.6 - 0.5)
    pos.setXYZ(i, (x / len) * len * k, (y / len) * len * k, (z / len) * len * k)
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export type Scattered = { position: [number, number, number]; rotation: number; scale: number }

/**
 * Ring of positions around a district, each dropped onto the real terrain.
 * Returned in the district group's local space, hence the `- d.pad`.
 */
export function scatter(d: District, count: number, rMin: number, rMax: number, seed: number): Scattered[] {
  const [cx, cz] = districtCentre(d)
  const rand = rng(seed)
  const out: Scattered[] = []

  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    let r = rMin + rand() * (rMax - rMin)

    /*
      The coastline wobbles, so a radius that is inland on one bearing is open
      water on another. Walk back toward the district centre until the ground is
      both above the waterline AND flat enough to stand a building on.

      The slope test is not optional. Height alone stops the walk the moment it
      finds dry ground — which, on a shore, is partway down the face of it.
      Measured on an earlier version of this terrain, that put four of the Alps'
      seven chalets on slopes of 69 to 84 degrees, with up to eighteen units of
      height across a single 2-unit footprint: buried at one corner, in mid-air
      at the other.
    */
    let h = sampleHeight(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
    for (let tries = 0; tries < 12; tries++) {
      const px = cx + Math.cos(a) * r
      const pz = cz + Math.sin(a) * r
      h = sampleHeight(px, pz)
      const gx = sampleHeight(px + 1, pz) - sampleHeight(px - 1, pz)
      const gz = sampleHeight(px, pz + 1) - sampleHeight(px, pz - 1)
      const grade = Math.hypot(gx, gz) / 2
      if (h >= MIN_PLANTING_HEIGHT && grade <= MAX_PLANTING_GRADE) break
      r -= 1.2
    }

    out.push({
      position: [Math.cos(a) * r, h - d.pad, Math.sin(a) * r],
      rotation: rand() * Math.PI * 2,
      scale: 0.72 + rand() * 0.66,
    })
  }
  return out
}

export const MIN_PLANTING_HEIGHT = 1.2
/** tan(30 degrees) — steeper than this and a flat-bottomed building floats. */
export const MAX_PLANTING_GRADE = 0.577

/** Local y that puts an object on the ground at a district-local XZ. */
export function groundAt(d: District, lx: number, lz: number) {
  const [cx, cz] = districtCentre(d)
  return sampleHeight(cx + lx, cz + lz) - d.pad
}

/**
 * A paved strip laid over the terrain along a centreline.
 *
 * Every vertex is dropped onto the ground, so the strip climbs and dips with
 * it — the timeline's outer turn rides the plateau's shoulder, the shore walk
 * follows the beach — and each sample carries its own colour, which is how
 * the timeline is a legend for its own eras.
 */
export function groundRibbon(
  d: District,
  line: readonly { x: number; z: number; color: THREE.Color }[],
  width: number,
  /** A height (district-local) the strip never drops below: a boardwalk
      stays level over the channel it crosses. */
  floor = Number.NEGATIVE_INFINITY,
) {
  const count = line.length
  const positions = new Float32Array(count * 2 * 3)
  const colors = new Float32Array(count * 2 * 3)
  const index: number[] = []
  for (let k = 0; k < count; k++) {
    const p = line[k]
    // Sideways: perpendicular to the run between neighbours.
    const a = line[Math.max(0, k - 1)]
    const b = line[Math.min(count - 1, k + 1)]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const nx = -(b.z - a.z) / len
    const nz = (b.x - a.x) / len
    for (let side = 0; side < 2; side++) {
      const w = (side === 0 ? -0.5 : 0.5) * width
      const x = p.x + nx * w
      const z = p.z + nz * w
      const o = (k * 2 + side) * 3
      positions[o] = x
      positions[o + 1] = Math.max(groundAt(d, x, z) + 0.05, floor)
      positions[o + 2] = z
      colors[o] = p.color.r
      colors[o + 1] = p.color.g
      colors[o + 2] = p.color.b
    }
    if (k < count - 1) {
      const v = k * 2
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  // Wound for whichever way the line runs: if the normals came out facing the
  // ground, flip every triangle.
  if ((geo.attributes.normal as THREE.BufferAttribute).getY(2) < 0) {
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1]
      index[i + 1] = index[i + 2]
      index[i + 2] = t
    }
    geo.setIndex(index)
    geo.computeVertexNormals()
  }
  return geo
}

/** The material every ribbon shares: its colour comes from its vertices. */
export const RIBBON_MAT = std(
  { color: '#ffffff', vertexColors: true, roughness: 0.94, side: THREE.DoubleSide },
  { grain: 9, mottle: 0.14, bump: 0.25, rough: 0.08 },
)

/**
 * Furthest point along a bearing that is still dry land AND has ground under
 * the whole footprint of what is being placed there.
 *
 * The footprint radius matters. Testing a single point returns the literal lip
 * of the shore, and anything with a base then overhangs the water: measured,
 * the lighthouse's plinth had a thirteen-unit void beneath its seaward half and
 * no ground at all under the light past one unit out. Stepping in until the
 * whole disc is supported costs four extra samples per step and puts the
 * building on the headland instead of off it.
 */
export function findShore(d: District, dirX: number, dirZ: number, from: number, radius = 0) {
  const [cx, cz] = districtCentre(d)
  for (let t = from; t > 2; t -= 0.6) {
    const px = cx + dirX * t
    const pz = cz + dirZ * t
    const h = sampleHeight(px, pz)
    if (h <= 1.0) continue

    if (radius > 0) {
      const under = Math.min(
        sampleHeight(px + radius, pz),
        sampleHeight(px - radius, pz),
        sampleHeight(px, pz + radius),
        sampleHeight(px, pz - radius),
      )
      if (under < 0.5) continue
    }

    return { lx: dirX * t, lz: dirZ * t, y: h - d.pad }
  }
  return { lx: dirX * 2, lz: dirZ * 2, y: groundAt(d, dirX * 2, dirZ * 2) }
}


/** A boulder: a coarse polyhedron, roughened, for shores and rims. */
export const BOULDER = roughen(new THREE.IcosahedronGeometry(0.55, 2), 0.2)

/**
 * A palm: the trunk, and the crown of fronds as one geometry each.
 *
 * The trunk is a lathe bent into a lean — a palm that stands plumb reads as
 * a post — and every palm is set with its own rotation and scale, so the
 * eye reads the variety from those. The fronds are ribbons: each a strip
 * bent along a parabola that lifts from the crown and droops to its tip,
 * tapering as it goes and folded a little along its midrib, which is the
 * whole silhouette of a palm. Nine of them, at uneven angles.
 */
const PALM_LEAN = 0.045
const PALM_HEIGHT = 4.3
export const PALM_TOP: [number, number, number] = [PALM_LEAN * PALM_HEIGHT * PALM_HEIGHT, PALM_HEIGHT, 0]
export const PALM_TRUNK = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(0.26, 0)
  at(0.23, 0.9)
  at(0.21, 1.8)
  at(0.19, 2.7)
  at(0.16, 3.5)
  at(0.15, PALM_HEIGHT)
  at(0, PALM_HEIGHT)
  const geo = new THREE.LatheGeometry(p, 14)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    pos.setX(i, pos.getX(i) + PALM_LEAN * y * y)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
})()
export const PALM_FRONDS = (() => {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.PlaneGeometry(0.46, 1, 2, 12)
    const pos = frond.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < pos.count; k++) {
      // The plane runs -0.5..0.5 along y; t is the distance out along the frond.
      const t = pos.getY(k) + 0.5
      const across = pos.getX(k)
      const halfWidth = 0.23 * (1 - t * 0.7)
      const x = (across / 0.23) * halfWidth
      pos.setX(k, x)
      pos.setY(k, 0.55 * t - 1.75 * t * t - 0.1 * Math.abs(x) / 0.23)
      pos.setZ(k, 2.7 * t)
    }
    frond.rotateY((i / 9) * Math.PI * 2 + (i % 3) * 0.13)
    frond.translate(PALM_TOP[0], PALM_TOP[1] - 0.05, PALM_TOP[2])
    frond.computeVertexNormals()
    parts.push(frond)
  }
  return mergeGeometries(parts)!
})()
