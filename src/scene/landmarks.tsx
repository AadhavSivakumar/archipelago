import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { prefersReducedMotion } from '../animations/gsap'
import { DISTRICTS, districtCentre, type District, type DistrictId } from './districts'
import { sampleHeight } from './terrain'
import { weather, type WeatherOptions } from './surface'
import { water } from '../shaders/water'
import { COUNTRIES } from './worldCountries'
import {
  BORDER_LIFT,
  BORDER_MATERIAL,
  coarseMap,
  countryAt,
  landMaterial,
  loadFineMap,
  MAP_D,
  MAP_SCALE,
  MAP_W,
  uHoverCountry,
  uPickedCountry,
  type WorldMap,
} from './worldMap'
import { setCursor } from './cursor'
import { countryArticle } from '../components/wikipedia'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelAtlas, type LabelPlacement } from './exhibits'
import { ERAS, EVENTS, eraOf, yearLabel, type Era } from '../content/history'
import { PANTHEONS, type Pantheon } from '../content/pantheons'
import { layoutTree } from './familyTree'
import { MEDIA } from '../content/artworks'
import { SUBJECTS } from '../content/sciences'
import { groupOf } from '../content/navigation'
import { publishView, select, useDistrictSelection } from '../state/selection'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
const std = (p: THREE.MeshStandardMaterialParameters, w: WeatherOptions = {}) =>
  weather(new THREE.MeshStandardMaterial(p), w)

/** Cut stone: pitted, matte, and never quite one colour across a face. */
const QUARRIED: WeatherOptions = { grain: 5, mottle: 0.3, bump: 0.55, rough: 0.2 }
/** Dressed or polished stone: the same rock, worked smooth. */
const DRESSED: WeatherOptions = { grain: 7, mottle: 0.14, bump: 0.22, rough: 0.1 }
/** Metal: almost no albedo variation, but roughness variation is what stops a
    metal reading as a mirrored blob, so that one stays up. */
const METAL: WeatherOptions = { grain: 9, mottle: 0.07, bump: 0.14, rough: 0.24 }
/** Foliage: broad, strong colour variation, no micro-bump worth the cost. */
const FOLIAGE: WeatherOptions = { grain: 1.5, mottle: 0.46, bump: 0.3, rough: 0.12 }

const mat = {
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
  wood: std({ color: '#6b4a2e', roughness: 0.88 }, { grain: 9, mottle: 0.3, bump: 0.42, rough: 0.16 }),
  leaf: std({ color: '#3c6d41', roughness: 0.85 }, FOLIAGE),
  leafWarm: std({ color: '#63883c', roughness: 0.85 }, FOLIAGE),
  hedge: std({ color: '#33603a', roughness: 0.94 }, { ...FOLIAGE, grain: 3.2 }),
  // Glass gets nothing: grain on a transparent surface reads as grime, and
  // these are the one thing in the scene that should look manufactured.
  glass: std({ color: '#a8dcff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6 }, { mottle: 0, bump: 0, rough: 0 }),
  snow: std({ color: '#e8eef6', roughness: 0.78 }, { grain: 2.4, mottle: 0.1, bump: 0.5, rough: 0.1 }),
  ember: std({ color: '#b8492f', roughness: 0.62 }, DRESSED),
  canvasCloth: std({ color: '#ded4c4', roughness: 0.92 }, { grain: 14, mottle: 0.16, bump: 0.5, rough: 0.1 }),
}

/** One emissive accent material per district, keyed off the palette in districts.ts. */
const ACCENT = Object.fromEntries(
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
      // Slightly more tooth than plain METAL: these are the largest smooth
      // surfaces in the scene, and they have the least to hide behind.
      { grain: 6, mottle: 0.12, bump: 0.3, rough: 0.2 },
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

/** A place within a district worth flying to, in district-local units. */
import type { SubFocus } from './exhibits'
export type { SubFocus } from './exhibits'

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/** Deterministic LCG — the scene must look identical on every load. */
function rng(seed: number) {
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
function roughen(geo: THREE.BufferGeometry, amount: number) {
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
function lumpen(geo: THREE.BufferGeometry, seed: number, amount: number, lobes = 7) {
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

type Scattered = { position: [number, number, number]; rotation: number; scale: number }

/**
 * Ring of positions around a district, each dropped onto the real terrain.
 * Returned in the district group's local space, hence the `- d.pad`.
 */
function scatter(d: District, count: number, rMin: number, rMax: number, seed: number): Scattered[] {
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

const MIN_PLANTING_HEIGHT = 1.2
/** tan(30 degrees) — steeper than this and a flat-bottomed building floats. */
const MAX_PLANTING_GRADE = 0.577

/** Local y that puts an object on the ground at a district-local XZ. */
function groundAt(d: District, lx: number, lz: number) {
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
function groundRibbon(
  d: District,
  line: readonly { x: number; z: number; color: THREE.Color }[],
  width: number,
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
      positions[o + 1] = groundAt(d, x, z) + 0.05
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
const RIBBON_MAT = std(
  { color: '#ffffff', vertexColors: true, roughness: 0.94, side: THREE.DoubleSide },
  { grain: 9, mottle: 0.14, bump: 0.22, rough: 0.08 },
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
function findShore(d: District, dirX: number, dirZ: number, from: number, radius = 0) {
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

// ===========================================================================
// Ideology Isles — a rotunda, ringed by eight pantheons on floating islets
// ===========================================================================

const STEP = new THREE.CylinderGeometry(1, 1, 0.45, 160)
/**
 * A column, turned rather than extruded.
 *
 * A cylinder plus a box for the capital is two primitives pretending to be
 * architecture, and no amount of radial subdivision changes that — the
 * silhouette is still a tube with a lid. A lathe costs the same to draw and
 * gives the whole profile: a moulded base, a shaft with entasis (the slight
 * convex swell that stops a column looking pinched), a necking ring, and a
 * flared echinus under a square-edged abacus.
 *
 * Base and capital are part of the same turned form now, so this replaces two
 * <Instances> blocks with one.
 */
const COLUMN = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))

  at(0, 0)          // closes the underside
  at(0.46, 0)
  at(0.46, 0.14)    // plinth
  at(0.40, 0.21)
  at(0.385, 0.30)   // shaft springs

  // Entasis: the radius swells about a third of the way up before tapering, so
  // the shaft reads as load-bearing instead of as a pipe.
  for (let i = 1; i <= 12; i++) {
    const t = i / 12
    at(0.385 - 0.085 * t + 0.022 * Math.sin(Math.PI * t), 0.30 + t * 4.0)
  }

  at(0.318, 4.38)   // necking
  at(0.292, 4.46)
  at(0.305, 4.53)
  at(0.47, 4.82)    // echinus
  at(0.505, 4.88)
  at(0.505, 5.10)   // abacus
  at(0, 5.10)       // closes the top

  return new THREE.LatheGeometry(p, 72)
})()
const ENTABLATURE = new THREE.CylinderGeometry(5.6, 5.6, 0.7, 160)
const DOME = new THREE.SphereGeometry(5.2, 192, 96, 0, Math.PI * 2, 0, Math.PI / 2)
const FINIAL = new THREE.SphereGeometry(0.55, 80, 56)
const SPIRE = new THREE.ConeGeometry(0.3, 1.4, 80)

/*
  The orbiting islets: a crag with turf on it, rather than a cone with a lid.

  These were an 80-segment cone, an 80-segment disc and a box — three primitives
  in their most recognisable form, floating at eye level right beside the
  rotunda, which made them the most toy-like thing in the district however good
  the rotunda got. Smoothness was working against them too: at 80 segments the
  cone is perfectly round, so it reads as a machined part and the extra
  triangles are spent making it read that way.

  Sixteen segments instead, then roughened. The facets become hewn faces and the
  displacement breaks the remaining regularity, which is the same treatment the
  Alps menhirs get and for the same reason. Authored with y=0 at the turf line
  and the root running negative, so the pieces stack at their real offsets
  instead of being flipped into place.
*/
const ISLET_ROCK = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, -3.5) // the root tapers to a point rather than a flat cut
  at(0.3, -2.8)
  at(0.58, -2.05)
  at(0.74, -1.55)
  at(0.7, -1.2) // a waist, so the profile is not one straight taper
  at(0.98, -0.8)
  at(1.16, -0.42)
  at(1.44, -0.1) // undercut lip: the overhang is what says "torn loose"
  at(1.5, 0.06)
  at(1.3, 0.16)
  at(0, 0.16)
  return roughen(new THREE.LatheGeometry(p, 16), 0.15)
})()

/** Turf, as a shallow cap that crowns the rock instead of capping it flat. */
const ISLET_TURF = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, -0.06)
  at(1.46, -0.06)
  at(1.42, 0.08)
  at(1.24, 0.22)
  at(0.92, 0.33)
  at(0.5, 0.41)
  at(0, 0.44)
  return roughen(new THREE.LatheGeometry(p, 20), 0.07)
})()

/** A totem on each islet, in its pantheon's colour: the thing to click. */
const TOTEM = roughen(new THREE.CylinderGeometry(0.2, 0.34, 2.3, 5, 3), 0.05)
const TOTEM_MAT = std({ color: '#ffffff', roughness: 0.7, metalness: 0.1 }, DRESSED)
/** A ring round the chosen islet, at turf height. */
const ISLET_RING = new THREE.TorusGeometry(2.05, 0.07, 10, 64)
/** One figure of a family tree. */
const ORB = new THREE.SphereGeometry(0.3, 24, 16)
const ORB_MAT = std({ color: '#ffffff', roughness: 0.32, metalness: 0.25 }, { grain: 8, mottle: 0.05, bump: 0.08, rough: 0.1 })
/** Lines of descent. */
const LINEAGE_MAT = new THREE.LineBasicMaterial({ color: '#f2cf6b', transparent: true, opacity: 0.7 })

const COLONNADE = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  return [Math.cos(a) * 4.9, Math.sin(a) * 4.9] as const
})

/*
  Eight islets, one per pantheon, orbiting the rotunda.

  Each islet carries a totem in its pantheon's colour, and choosing one raises
  that pantheon's family tree in the air above it: a row per generation, the
  primordials at the top, each figure an orb with its name under it and a
  line to each parent. The tree is laid out by familyTree.ts and hangs in the
  plane that faces the district's seaward bearing, which is the bearing the
  camera approaches along, so it is read as a chart rather than seen edge-on.

  The orbit holds still while the district is focused. It has to: the camera
  flies to where an islet was when it was chosen, and an islet that kept
  going would have left by the time the camera arrived.

  The islets ride at radius 11, beyond the plateau's shoulder, because the
  widest tree — the Norse, eleven figures across — is over ten units wide,
  and its neighbours on either side need to be clear of it.
*/
const ORBIT_Y = 7
const ORBIT_R = 11
const ORBIT_SPEED = 0.09
/** How far above an islet's turf its tree's lowest row hangs. */
const TREE_LIFT = 2.2
const TREES = PANTHEONS.map(layoutTree)

const ISLETS: Exhibit[] = PANTHEONS.map((p, i) => {
  const a = (i / PANTHEONS.length) * Math.PI * 2
  const tree = TREES[i]
  return {
    name: p.name,
    article: p.article,
    kicker: `Pantheon · ${p.deities.length} figures`,
    x: Math.cos(a) * ORBIT_R,
    y: Math.sin(a * 1.7) * 1.0,
    z: Math.sin(a) * ORBIT_R,
    // Each islet turned to its own bearing, so the eight are not one shape
    // repeated round a circle, which is exactly how it reads when they share
    // a rotation and the orbit spins them past the camera.
    yaw: i * 1.27,
    color: p.color,
    // Frame the whole tree, not the islet.
    extent: Math.max(tree.halfWidth, tree.height / 2) + 0.7,
    elevation: 0.26,
  }
})

/** Name labels for a pantheon's figures, drawn the first time it is chosen. */
const TREE_ATLASES = new Map<string, LabelAtlas>()
function treeAtlas(p: Pantheon): LabelAtlas {
  let atlas = TREE_ATLASES.get(p.id)
  if (!atlas) {
    atlas = makeLabelAtlas(p.deities.map((deity) => deity.name))
    TREE_ATLASES.set(p.id, atlas)
  }
  return atlas
}

const NO_LINES = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))

export function IdeologyIsles({ d, focused }: LandmarkProps) {
  const orbit = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    // Held still while the district is focused; see the note on the islets.
    if (!focused) orbit.current.rotation.y += dt * ORBIT_SPEED
  })

  const selection = useDistrictSelection(d.id)
  const pantheon = selection?.group ?? -1
  const deity = selection?.item ?? -1

  /** An islet's authored position, carried round by the orbit. */
  const islet = useCallback((it: Exhibit): [number, number, number] => {
    const a = orbit.current?.rotation.y ?? 0
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [it.x * c + it.z * s, ORBIT_Y + it.y, -it.x * s + it.z * c]
  }, [])

  /** The camera frames the tree over the islet, not the islet. */
  const treeCentre = useCallback(
    (it: Exhibit, i: number): [number, number, number] => {
      const [x, y, z] = islet(it)
      return [x, y + TREE_LIFT + TREES[i].height / 2, z]
    },
    [islet],
  )

  const pickPantheon = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: i, item: -1 }),
    [d.id],
  )
  const pickDeity = useCallback(
    (i: number) => select({ district: d.id, group: pantheon, item: i }),
    [d.id, pantheon],
  )
  /*
    Where the chosen islet is, in district space. Read from the orbit's
    current rotation, which is safe because the orbit only turns while the
    district is unfocused, and nothing can be chosen then.
  */
  const anchor = useMemo(() => (pantheon >= 0 ? islet(ISLETS[pantheon]) : null), [pantheon, islet])

  const tree = pantheon >= 0 ? TREES[pantheon] : null
  // Left to right as seen from the seaward bearing: the camera's right vector.
  const axis = useMemo(() => ({ x: Math.sin(d.seaward), z: -Math.cos(d.seaward) }), [d])
  const figures = useMemo<Exhibit[]>(() => {
    if (!tree || !anchor) return []
    const p = PANTHEONS[pantheon]
    return tree.nodes.map((node) => ({
      name: node.deity.name,
      article: node.deity.article,
      kicker: node.deity.parents?.length
        ? `${p.name} · child of ${node.deity.parents.join(' and ')}`
        : `${p.name} pantheon`,
      x: anchor[0] + axis.x * node.x,
      y: anchor[1] + TREE_LIFT + node.y,
      z: anchor[2] + axis.z * node.x,
      color: p.color,
      elevation: 0.26,
    }))
  }, [tree, anchor, pantheon, axis])

  const lineage = useMemo(() => {
    if (!tree || figures.length === 0) return NO_LINES
    const pos = new Float32Array(tree.edges.length * 6)
    tree.edges.forEach(([a, b], k) => {
      const A = figures[a]
      const B = figures[b]
      pos.set([A.x, A.y, A.z, B.x, B.y, B.z], k * 6)
    })
    return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [tree, figures])

  const names = useMemo<LabelPlacement[]>(
    () => figures.map((f, i) => ({ cell: i, x: f.x, y: f.y - 0.6, z: f.z, width: 1.5 })),
    [figures],
  )

  /*
    What the page describes: the god if one is chosen, else the pantheon.
    Choosing a god narrows the subject; un-choosing it widens back to the
    pantheon rather than to nothing, because the tree is still up.
  */
  const pantheonView = useRef<SubFocus | null>(null)
  // A god let go of with its pantheon still chosen: back to the pantheon. The
  // islets publish their own view when the pantheon changes; this covers the
  // step down, which changes nothing they watch.
  useLayoutEffect(() => {
    if (pantheon >= 0 && deity < 0 && pantheonView.current) publishView(pantheonView.current)
  }, [pantheon, deity])

  return (
    <ExhibitHall focused={focused} onClear={() => pickPantheon(-1)}>
      <mesh geometry={STEP} scale={[7.4, 1, 7.4]} position={[0, 0.22, 0]} material={mat.stone} />
      <mesh geometry={STEP} scale={[6.7, 1, 6.7]} position={[0, 0.66, 0]} material={mat.stone} />
      <mesh geometry={STEP} scale={[6.1, 1, 6.1]} position={[0, 1.1, 0]} material={mat.marble} />

      {/* Stood on the top step at y 1.32; the turned profile carries its own
          base and capital, so the shaft reaches the entablature unaided. */}
      <Instances geometry={COLUMN} material={mat.marble} limit={COLONNADE.length}>
        {COLONNADE.map(([x, z], i) => (
          <Instance key={i} position={[x, 1.32, z]} rotation={[0, (i * Math.PI) / 7, 0]} />
        ))}
      </Instances>

      <mesh geometry={ENTABLATURE} position={[0, 6.77, 0]} material={mat.marble} />
      <mesh geometry={DOME} position={[0, 7.12, 0]} material={ACCENT.ideology} />
      <mesh geometry={FINIAL} position={[0, 12.6, 0]} material={mat.gold} />
      <mesh geometry={SPIRE} position={[0, 13.5, 0]} material={mat.gold} />

      {/* noShadow: still rotating after the shadow map freezes. */}
      <group ref={orbit} position={[0, ORBIT_Y, 0]} userData={{ noShadow: true }}>
        <Exhibits
          d={d}
          focused={focused}
          items={ISLETS}
          geometry={TOTEM}
          material={TOTEM_MAT}
          lift={1.6}
          parts={[
            { geometry: ISLET_ROCK, material: mat.darkStone },
            { geometry: ISLET_TURF, material: mat.leafWarm, lift: 0.16 },
          ]}
          // Under the islet: the tree takes the air above it.
          labelHeight={-2.6}
          marker={{ geometry: ISLET_RING, material: ACCENT.ideology, lift: -1.3 }}
          keys={pantheon < 0}
          picked={pantheon}
          onPick={pickPantheon}
          onSubFocus={(view) => {
            pantheonView.current = view
            if (deity < 0) publishView(view)
          }}
          place={treeCentre}
        />
      </group>

      {/* Always mounted, so its program is compiled with everything else. */}
      <lineSegments geometry={lineage} material={LINEAGE_MAT} raycast={() => null} userData={{ noShadow: true }} />

      {tree && (
        <group key={PANTHEONS[pantheon].id} userData={{ noShadow: true }}>
          <Exhibits
            d={d}
            focused={focused}
            items={figures}
            geometry={ORB}
            material={ORB_MAT}
            labelHeight={0.72}
            extent={2.2}
            highlight="#ffffff"
            keys={pantheon >= 0}
            picked={deity}
            onPick={pickDeity}
            castShadow={false}
          />
          <InstancedLabels atlas={treeAtlas(PANTHEONS[pantheon])} placements={names} />
        </group>
      )}
    </ExhibitHall>
  )
}

// ===========================================================================
// Historical Habitat — a timeline, spiralling in from the first farms to now
// ===========================================================================

/*
  The district is the timeline. Sixty-odd events, one stele each, stand along
  a processional path that starts at the water's edge and winds two and a half
  turns in to the ziggurat: the oldest at the outside, the present at the
  centre. The path is coloured by era and so are the stones, so the whole
  sweep of it reads from the district view — the long ochre reach of the
  ancient world, the short bright coil of the last two centuries — before a
  single label can be made out.

  It winds INWARD because that is where the eye goes: the ziggurat is the
  district's landmark, the thing a visitor is looking at when they arrive, and
  the path arriving there makes "now" the destination rather than the starting
  point. Every stele is an exhibit: hover to lift it, click to fly to it and
  read what happened, and the arrow keys walk the years.

  Spaced by distance along the path, not by year. Spaced by year, forty of
  the sixty-four events would share the innermost quarter-turn and the
  Neolithic would have three units of empty path per century; ordinal spacing
  is what every timeline that has to be walked past does, and the year is on
  the stone.
*/

/**
 * A stele: a rounded-top tablet, the shape a marker stone has had for five
 * thousand years. Extruded from a profile rather than boxed, so the top is an
 * arc and the edges carry a bevel, then roughened enough to be cut stone.
 */
const STELE = (() => {
  const w = 0.56
  const h = 1.25
  const r = w / 2
  const shape = new THREE.Shape()
  shape.moveTo(-r, 0)
  shape.lineTo(r, 0)
  shape.lineTo(r, h - r)
  shape.absarc(0, h - r, r, 0, Math.PI, false)
  shape.lineTo(-r, 0)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 20,
  })
  geo.translate(0, 0, -0.08)
  return roughen(geo, 0.012)
})()
/** White, so the instance colour — the era's — is the stone's colour. */
const STELE_MAT = std({ color: '#ffffff', roughness: 0.86 }, QUARRIED)
/** A ring on the ground under the chosen stele. */
const HALO = new THREE.TorusGeometry(0.72, 0.065, 10, 48)

const TIMELINE_TURNS = 2.5
/** Path centreline radii. The outer turn rides the plateau's shoulder. */
const TIMELINE_R_OUT = 8.8
const TIMELINE_R_IN = 4.4
const TIMELINE_PATH_W = 0.9
/** How far outside the path's edge each stele stands. */
const STELE_STANDOFF = 0.32

type Timeline = {
  exhibits: Exhibit[]
  path: THREE.BufferGeometry
  atlas: LabelAtlas
  years: LabelPlacement[]
  eras: LabelPlacement[]
  /** Where the path begins: the obelisk stands here as its gate. */
  gate: { x: number; y: number; z: number }
}

/**
 * Lays the timeline out on the ground of one district.
 *
 * The spiral is sampled finely and walked by arc length, so the events are
 * evenly spaced along the path however the radius changes; the path itself is
 * a ribbon whose every vertex is dropped onto the terrain, so it climbs the
 * shoulder of the plateau where the outer turn leaves the flat.
 */
function layoutTimeline(d: District): Timeline {
  const n = EVENTS.length
  const theta0 = d.seaward
  const total = TIMELINE_TURNS * Math.PI * 2
  const radiusAt = (t: number) => TIMELINE_R_OUT - (TIMELINE_R_OUT - TIMELINE_R_IN) * t

  const K = 1200
  const samples: { theta: number; r: number; s: number }[] = []
  let s = 0
  let px = 0
  let pz = 0
  for (let k = 0; k <= K; k++) {
    const t = k / K
    const theta = theta0 + t * total
    const r = radiusAt(t)
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    if (k > 0) s += Math.hypot(x - px, z - pz)
    samples.push({ theta, r, s })
    px = x
    pz = z
  }
  const length = s

  /** The spiral at a distance along it. */
  const at = (dist: number) => {
    let lo = 1
    let hi = K
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (samples[mid].s < dist) lo = mid + 1
      else hi = mid
    }
    const b = samples[lo]
    const a = samples[lo - 1]
    const f = b.s === a.s ? 0 : Math.min(1, Math.max(0, (dist - a.s) / (b.s - a.s)))
    return { theta: a.theta + (b.theta - a.theta) * f, r: a.r + (b.r - a.r) * f }
  }

  // Events, evenly spaced along the path, each standing just outside its
  // outer edge and turned to face across it.
  const exhibits: Exhibit[] = EVENTS.map((ev, i) => {
    const { theta, r } = at((i / (n - 1)) * length)
    const rr = r + TIMELINE_PATH_W / 2 + STELE_STANDOFF
    const x = Math.cos(theta) * rr
    const z = Math.sin(theta) * rr
    const era = ERAS[eraOf(ev.year)]
    return {
      name: ev.label,
      article: ev.article,
      kicker: `${yearLabel(ev.year)} · ${era.name}`,
      x,
      y: groundAt(d, x, z),
      z,
      yaw: Math.atan2(-Math.cos(theta), -Math.sin(theta)),
      color: era.color,
    }
  })

  /*
    The path: a ribbon, coloured by the era of the last event passed. The
    colour changes exactly at each era's first stele, so the path is the
    legend for the stones standing on it.
  */
  const eraColourAt = (dist: number) => {
    const i = Math.min(n - 1, Math.floor((dist / length) * (n - 1) + 1e-6))
    return ERAS[eraOf(EVENTS[i].year)].color
  }
  const M = 420
  const line = Array.from({ length: M + 1 }, (_, k) => {
    const dist = (k / M) * length
    const { theta, r } = at(dist)
    // A shade under the stones' own colour, so the stelae stand out on it.
    return {
      x: Math.cos(theta) * r,
      z: Math.sin(theta) * r,
      color: new THREE.Color(eraColourAt(dist)).multiplyScalar(0.62),
    }
  })
  const path = groundRibbon(d, line, TIMELINE_PATH_W)

  /*
    Labels: the year over every stele, and the era's name over the first
    stele of each era. Years alternate between two heights so that neighbours
    a unit and a half apart do not overprint each other from the district
    view.
  */
  const eraIds = Object.keys(ERAS) as Era[]
  const atlas = makeLabelAtlas([...EVENTS.map((ev) => yearLabel(ev.year)), ...eraIds.map((id) => ERAS[id].name)])
  const years: LabelPlacement[] = exhibits.map((e, i) => ({
    cell: i,
    x: e.x,
    y: e.y + 1.55 + (i % 2) * 0.34,
    z: e.z,
    width: 1.4,
  }))
  const eras: LabelPlacement[] = []
  let lastEra: Era | null = null
  EVENTS.forEach((ev, i) => {
    const era = eraOf(ev.year)
    if (era === lastEra) return
    lastEra = era
    const e = exhibits[i]
    eras.push({ cell: n + eraIds.indexOf(era), x: e.x, y: e.y + 2.45, z: e.z, width: 2.4 })
  })

  // The gate: a little before the first stele, on the path's own bearing.
  const gateR = TIMELINE_R_OUT + 1.0
  const gateTheta = theta0 - 0.32
  const gx = Math.cos(gateTheta) * gateR
  const gz = Math.sin(gateTheta) * gateR
  const gate = { x: gx, y: groundAt(d, gx, gz), z: gz }

  return { exhibits, path, atlas, years, eras, gate }
}

const ZIGGURAT_STEPS = [
  { s: 9.0, y: 0.5, h: 1.0 },
  { s: 7.6, y: 1.5, h: 1.0 },
  { s: 6.2, y: 2.5, h: 1.0 },
  { s: 4.8, y: 3.5, h: 1.0 },
  { s: 3.4, y: 4.6, h: 1.2 },
]
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const SHRINE = new THREE.BoxGeometry(2.2, 1.7, 2.2)
/** Scaled down from the version that had the island to itself: the spiral
    needs the ground, and the ziggurat is now the thing the path arrives at. */
const ZIGGURAT_SCALE = 0.58

const OBELISK_SHAFT = new THREE.CylinderGeometry(0.42, 0.62, 7.4, 4)
const OBELISK_CAP = new THREE.ConeGeometry(0.6, 1.3, 4)

export function HistoricalHabitat({ d, focused }: LandmarkProps) {
  const timeline = useMemo(() => layoutTimeline(d), [d])
  const picked = useDistrictSelection(d.id)?.item ?? -1
  const pick = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: groupOf(d.id, i), item: i }),
    [d.id],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick(-1)}>
      <group scale={ZIGGURAT_SCALE}>
        <Instances geometry={UNIT_BOX} material={mat.sandstone} limit={ZIGGURAT_STEPS.length + 1}>
          {ZIGGURAT_STEPS.map((s, i) => (
            <Instance key={i} scale={[s.s, s.h, s.s]} position={[0, s.y, 0]} />
          ))}
          {/* The cap slab shares geometry and material, so it rides along. */}
          <Instance scale={[2.6, 0.25, 2.6]} position={[0, 7.0, 0]} />
        </Instances>
        <mesh geometry={SHRINE} position={[0, 6.05, 0]} material={ACCENT.history} />
      </group>

      {/* The gate at the start of the path: the obelisk, where the timeline begins. */}
      <group position={[timeline.gate.x, timeline.gate.y, timeline.gate.z]} scale={0.7}>
        <mesh geometry={UNIT_BOX} scale={[1.8, 0.6, 1.8]} position={[0, 0.3, 0]} material={mat.stone} />
        <mesh geometry={OBELISK_SHAFT} rotation={[0, Math.PI / 4, 0]} position={[0, 4.3, 0]} material={mat.sandstone} />
        <mesh geometry={OBELISK_CAP} rotation={[0, Math.PI / 4, 0]} position={[0, 8.65, 0]} material={mat.gold} />
      </group>

      <mesh geometry={timeline.path} material={RIBBON_MAT} receiveShadow />

      <Exhibits
        d={d}
        focused={focused}
        items={timeline.exhibits}
        geometry={STELE}
        material={STELE_MAT}
        labelHeight={2.95}
        extent={3.0}
        marker={{ geometry: HALO, material: ACCENT.history }}
        picked={picked}
        onPick={pick}
      />

      {/* Years are for someone standing among the stones; eras read from the
          district view and go before the home view. */}
      <InstancedLabels atlas={timeline.atlas} placements={timeline.years} fade={[18, 34]} />
      <InstancedLabels atlas={timeline.atlas} placements={timeline.eras} fade={[60, 95]} />
    </ExhibitHall>
  )
}

// ===========================================================================
// Geographical Garden — a cartesian world map, laid out as a parterre
// ===========================================================================

/*
  A map, not a globe.

  The globe moved to the centre island (Monument.tsx) — the model of the world
  belongs at the middle of the world, not off in one territory. What the Garden
  gets instead is the other way of drawing the Earth: an equirectangular plate
  with the graticule ruled across it and the continents standing proud, laid out
  flat the way a formal parterre is. Two representations of the same subject,
  each doing what the other cannot.

  The plate's dimensions, the projection scale and the country geometry all live
  in worldMap.ts, which is where the pickable version of the continents had to
  go. What stays here is the garden the map sits in.
*/

const MAP_PLATE = new THREE.BoxGeometry(MAP_W + 1.1, 0.42, MAP_D + 1.1)
const MAP_FACE = new THREE.BoxGeometry(MAP_W, 0.1, MAP_D)

/*
  The graticule: meridians every 30 degrees, parallels every 30.

  Thinner and in stone rather than marble. Ruled in near-white at 0.05 they were
  the highest-contrast thing on the plate, so from overhead the map read as a
  grid with some green shapes on it rather than as a world with a grid over it.
  A graticule is a reference, and a reference should be the quietest mark on a
  drawing.
*/
const MERIDIAN = new THREE.BoxGeometry(0.026, 0.05, MAP_D)
const PARALLEL = new THREE.BoxGeometry(MAP_W, 0.05, 0.026)

/*
  Its own material, darker than any of the shared stones.

  Thinning the bars helped but did not settle it: against a blue sea any pale
  grey is still the highest-contrast thing on the plate, and with real
  coastlines in place the grid was competing with the subject rather than
  supporting it. A graticule wants to be read when looked for and ignored
  otherwise, which means it has to be darker than the water, not lighter.
*/
const GRATICULE_MAT = std({ color: '#2c4a60', roughness: 0.7, fog: false }, { grain: 20, mottle: 0.08, bump: 0.16, rough: 0.06 })

/*
  The Garden gets its own stone, hedge and brass, finer than the shared ones.

  Every other district is looked at from about forty units. This one is now
  looked at from ten, which magnifies every surface four times — and the shared
  weathering was tuned at the far distance. QUARRIED puts a noise feature across
  a fifth of a world unit, which is a comfortable four pixels on a lighthouse
  and twenty-two on a kerb seen from here: the same setting that reads as
  hewn stone at range reads as television static up close. The brass was worse,
  because METAL's roughness jitter is what makes a metal glint at distance and
  what makes it look corroded when each patch of it is twenty pixels wide.

  So: the same materials at three to four times the frequency and a third of the
  amplitude. The features land at five to eight pixels rather than twenty-plus,
  which is the size at which the eye reads a surface rather than a pattern.
*/
/* The kerb is part of the map — it is the frame around the projection — so it
   is exempt from the haze along with the face inside it. */
const GARDEN_STONE = std({ color: '#9d9a92', roughness: 0.88, fog: false }, { grain: 18, mottle: 0.055, bump: 0.11, rough: 0.04 })
const GARDEN_MARBLE = std({ color: '#dcd6cb', roughness: 0.42 }, { grain: 22, mottle: 0.04, bump: 0.07, rough: 0.03 })
/* The hedge keeps most of its grain: it is the one surface here that is
   supposed to look organic, and it sits outside the projection where it cannot
   compete with anything that carries information. */
const GARDEN_HEDGE = std({ color: '#33603a', roughness: 0.94 }, { grain: 14, mottle: 0.15, bump: 0.28, rough: 0.08 })
/* Effectively clean. The equator and prime meridian are 0.1 units wide, about
   eleven pixels from here, so ANY noise on them lands as glitter rather than as
   patina — there is no room across the bar for a second feature. */
const GARDEN_BRASS = std(
  /*
    Less metal, and rougher, than the brass everywhere else — because the
    patchiness on these bars was never the weathering.

    A metal has almost no diffuse response: what it shows is a reflection of its
    surroundings, and the surroundings here are a 256-pixel environment built
    from four Lightformers. Across a lighthouse rail at forty units that reads
    as highlights. Across an eleven-pixel-wide bar at ten units it reads as
    blotches, because the bar is sampling two or three texels of a very
    low-resolution probe and nothing smooths between them. Halving the metalness
    and raising the roughness brings back enough diffuse response, and widens
    the specular lobe enough, that the bar shows its own colour and a gradient
    rather than the environment's pixels.
  */
  { color: '#a5893f', roughness: 0.52, metalness: 0.45, fog: false },
  { grain: 24, mottle: 0.02, bump: 0.03, rough: 0.02 },
)
const MERIDIANS = Array.from({ length: 11 }, (_, i) => (-180 + (i + 1) * 30) * MAP_SCALE)
const PARALLELS = Array.from({ length: 5 }, (_, i) => (-90 + (i + 1) * 30) * MAP_SCALE)

/** Equator and prime meridian, picked out in brass. */
const EQUATOR = new THREE.BoxGeometry(MAP_W, 0.08, 0.1)
const PRIME = new THREE.BoxGeometry(0.1, 0.08, MAP_D)

/** A clipped hedge frame around the plate, in place of the old concentric rings. */
const HEDGE_LONG = new THREE.BoxGeometry(MAP_W + 2.2, 0.72, 0.62)
const HEDGE_SHORT = new THREE.BoxGeometry(0.62, 0.72, MAP_D + 2.2)

const CYPRESS = new THREE.ConeGeometry(0.72, 3.6, 80)
const CYPRESS_TRUNK = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 48)
const PLINTH_TOP = new THREE.CylinderGeometry(1.2, 1.7, 1.7, 128)
const PLINTH_BASE = new THREE.CylinderGeometry(2.4, 2.8, 0.7, 144)

/*
  The map is made of the two things it depicts, not of two paints.

  The continents were a flat green solid and the ocean a flat blue one, which
  made the plate read as a printed diagram lying on a table. Land is now turfed
  — a very fine, strongly varied grain with a deep bump, so the raised outlines
  carry a lawn rather than a colour — and the sea is the scene's own water
  shader.

  The pool takes only the chop half of that shader, not the swell: the face is a
  box with four vertices to its top, so vertex displacement would have nothing
  to displace, and a puddle inlaid in a stone plate should glint and ripple
  rather than heave. chopScale 2.6 compresses the ripple into a 12.6-unit
  basin — at scale 1 the coarsest component's crest is half the width of the
  Pacific.

  MAP_SEA_MAT is built directly rather than through std() because water() takes
  over onBeforeCompile outright, and std() would have installed the surface
  weathering there first only to have it overwritten.
*/
/*
  Grain 5, not the 26 this was first given.

/*
  chopStrength 2.6 rather than the ocean's 1.

  The open sea is looked at obliquely from a hundred units away, where a
  six-degree ripple is spread across a huge grazing angle and reads as plenty.
  This pool is looked at from almost directly overhead at twenty-seven, where
  the same tilt barely changes what any facet reflects and the water goes back
  to being a blue rectangle. The stronger setting is not a different sea, it is
  the same sea seen from a viewpoint that flatters it far less.
*/
const MAP_SEA_MAT = water(
  /*
    chopScale 6, up from 2.6, and metalness down for the same reason as the
    brass above.

    2.6 was set when this view stood off at 22 units. At 10 the same ripple is
    magnified: its coarsest component has a 2.2-unit wavelength, which is 244
    pixels of slow light-and-dark across the Pacific — smudges rather than
    water. At 6 the coarsest lands near 100 pixels and the finest near 15, which
    is the range that reads as a surface being disturbed.
  */
  // fog: false, with the rest of the plate — see landMaterial in worldMap.ts.
  new THREE.MeshStandardMaterial({
    color: '#1b5b85',
    roughness: 0.38,
    metalness: 0.3,
    fog: false,
  }),
  { chopScale: 6, chopStrength: 2.2 },
)

/*
  One material instance, built lazily and shared. Building it at module scope
  would compile the country geometry on first import, which is during the
  initial bundle evaluation — before the boot screen has even been replaced.
*/
let landMat: THREE.MeshStandardMaterial | null = null

export function GeographicalGarden({ d, focused }: LandmarkProps) {
  const cypresses = useMemo(() => scatter(d, 10, 8.5, 11.0, 0x5eed), [d])
  const material = useMemo(() => (landMat ??= landMaterial()), [])

  /*
    Two levels of map, and the swap is one-way per session.

    The coarse one is in the bundle and is what the plate wears from the
    archipelago view, where it is forty pixels wide. The detailed one is a
    dynamic import started the moment this district is focused — the camera
    flight takes long enough that it is normally in place before the map is
    legible, and if it is not, the coarse one is what shows until it is. Nothing
    pops except detail appearing.
  */
  const [fine, setFine] = useState<WorldMap | null>(null)
  const map = fine ?? coarseMap()
  const { geometry: countryGeometry, centres, spans, borders } = map

  /*
    Build the fine map during idle time at home, so that by the time the Garden
    is opened it already exists.

    This fetches 79kB gzipped for every visitor, including those who never open
    the Garden, which the lazy design was written to avoid. The trade is made
    deliberately: the alternative is doing 80-105ms of geometry work at the
    moment of arrival, and no amount of deferring moves that off the one
    interaction it makes worse. requestIdleCallback lets the browser choose a
    moment when nothing else needs the thread; the timeout fallback is for
    Safari, which does not have it.
  */
  useEffect(() => {
    // Cast through unknown rather than intersected with Window: lib.dom types
    // requestIdleCallback as always present, which makes the Safari branch
    // below unreachable to the compiler and a type error to write.
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    /*
      The timeout is not optional, and it was found the hard way: on a machine
      whose main thread never goes idle — which is exactly the struggling
      machine this prefetch exists for — requestIdleCallback without one is
      never called at all. Measured: 45 seconds at home, no request. With a
      4-second ceiling the browser still prefers a genuinely idle moment and
      falls back to forcing one, so the map is built either way, and always
      long before a visitor could have flown to it.
    */
    /*
      A failed prefetch is silent on purpose. The import is a network request,
      and on a flaky connection it can fail; nothing is cached on failure (see
      loadFineMap), so the focused path below simply tries again when the
      Garden is opened, and the coarse map shows until it succeeds. An
      unhandled rejection here would be an error in the console for a state the
      app handles fine.
    */
    const prefetch = () => void loadFineMap().catch(() => {})
    const handle = w.requestIdleCallback
      ? w.requestIdleCallback(prefetch, { timeout: 4000 })
      : window.setTimeout(prefetch, 3000)
    return () => {
      if (w.requestIdleCallback && w.cancelIdleCallback) w.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  useEffect(() => {
    if (!focused || fine) return
    let live = true

    /*
      Deliberately started AFTER the camera has landed, not when the district is
      focused.

      Fetching is asynchronous and harmless, but building is not: 24,050 points
      extruded and merged is 80-105ms of solid main thread, measured. Kicked off
      on focus, that lands in the middle of the 1.5-second flight, which is the
      one second in the whole interaction when something is moving and a stall
      is guaranteed to be seen — it reads as the camera stuttering on its way
      in, which is exactly how it was reported.

      1.7s clears the flight with a margin. The coarse map is what shows until
      then, and at the moment of arrival it is barely distinguishable: the
      difference between the two sets is a fraction of a pixel at this range,
      and it sharpens a beat later while the camera is still.
    */
    const start = setTimeout(() => {
      loadFineMap()
        .then((built) => {
          if (live) setFine(built)
        })
        // Same reasoning as the prefetch: the coarse map is a complete
        // fallback, so a failed fetch is not an error the visitor needs to see.
        .catch(() => {})
    }, 1700)

    return () => {
      live = false
      clearTimeout(start)
    }
  }, [focused, fine])

  /*
    The chosen country is the one piece of this that React needs to know about,
    because it is the only one that changes the DOM — the label below. The
    HIGHLIGHT does not go through state: it is written straight into the two
    uniforms in worldMap.ts, so following the pointer across the map costs two
    float writes rather than a React render per mouse move.
  */
  const picked = useDistrictSelection(d.id)?.item ?? -1

  // Leaving the district must not leave a country lit up behind it. The
  // selection itself is cleared by the page when focus changes.
  useEffect(() => {
    if (!focused) uHoverCountry.value = -1
  }, [focused])

  /*
    The chosen country: lit in the shader, and published as somewhere to fly
    and something to describe. From the state rather than from the click, so
    that every route to it — a click on the map, a name in the strip — does
    the same thing; a layout effect, so the flight starts in the same commit
    as the highlight.
  */
  useLayoutEffect(() => {
    uPickedCountry.value = picked
    if (picked < 0) return
    publishView({
      x: centres[picked][0],
      z: centres[picked][1],
      spanX: spans[picked][0],
      spanZ: spans[picked][1],
      name: COUNTRIES[picked].name,
      article: countryArticle(COUNTRIES[picked].name),
    })
    // Not on the map's centres: the fine map arriving mid-selection moves a
    // centroid by a hair, which is not a reason to fly again.
  }, [picked]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Choosing a country, in one place. -1 is how everything says "none". */
  const choose = (id: number) => select(id < 0 ? null : { district: d.id, group: 0, item: id })

  return (
    /*
      While the district is focused, the plate absorbs every click that is not a
      country.

      Without this the map is a trap. The group that wraps every landmark
      toggles district focus, so a click that missed a country — the sea, the
      kerb, the hedge — bubbled up to it and threw the visitor straight back out
      to the whole archipelago. Clicking around a map is mostly clicking the sea,
      so the one district whose whole purpose is to be clicked was the one you
      could not click.

      Clearing the selection is the right thing to do with those clicks anyway:
      it is how every map application in the world says "never mind", and it
      gives the visitor a way back to nothing selected that is not "select
      something else". The country mesh below stops propagation before this ever
      sees a hit on land.
    */
    <group
      onClick={(e) => {
        if (!focused) return
        e.stopPropagation()
        choose(-1)
      }}
    >
      {/* The plate: a stone kerb, the sea face inset into it. */}
      <mesh geometry={MAP_PLATE} position={[0, 0.21, 0]} material={GARDEN_STONE} />
      <mesh geometry={MAP_FACE} position={[0, 0.46, 0]} material={MAP_SEA_MAT} />

      {/* Graticule, ruled across the sea face. */}
      <Instances geometry={MERIDIAN} material={GRATICULE_MAT} limit={MERIDIANS.length}>
        {MERIDIANS.map((x, i) => (
          <Instance key={i} position={[x, 0.5, 0]} />
        ))}
      </Instances>
      <Instances geometry={PARALLEL} material={GRATICULE_MAT} limit={PARALLELS.length}>
        {PARALLELS.map((z, i) => (
          <Instance key={i} position={[0, 0.5, z]} />
        ))}
      </Instances>
      <mesh geometry={EQUATOR} position={[0, 0.52, 0]} material={GARDEN_BRASS} />
      <mesh geometry={PRIME} position={[0, 0.52, 0]} material={GARDEN_BRASS} />

      {/*
        The countries.

        One mesh for all 177 — see worldMap.ts. The handlers are live only while
        the district is focused; unfocused, they return without stopping
        propagation so the click carries on up to the group that focuses the
        district, which is what a click on a forty-pixel plate means.
      */}
      <mesh
        geometry={countryGeometry}
        position={[0, 0.51, 0]}
        material={material}
        castShadow
        onPointerMove={(e) => {
          if (!focused) return
          e.stopPropagation()
          uHoverCountry.value = countryAt(map, e.faceIndex)
          setCursor('pointer')
        }}
        onPointerOut={() => {
          uHoverCountry.value = -1
        }}
        onClick={(e) => {
          if (!focused) return
          const id = countryAt(map, e.faceIndex)
          if (id < 0) return
          e.stopPropagation()
          // Clicking the chosen country again clears it, so there is a way back
          // to no selection that is not "pick something else".
          choose(id === picked ? -1 : id)
        }}
      />

      {/*
        Borders, over the land they divide.

        Drawn after the land so the depth test has something to sit on, and
        lifted a thousandth of a unit clear of it so the two are not coplanar —
        see BORDER_LIFT. They are what turns 242 flat green fields into a
        political map: without them the per-country tint alone is only a hint
        that the fields are separate, and picking one is a guess about where it
        ends.
      */}
      <lineSegments
        geometry={borders}
        material={BORDER_MATERIAL}
        position={[0, 0.51 + BORDER_LIFT, 0]}
        /*
          Invisible to the raycaster, and this is load-bearing rather than an
          optimisation.

          A line has no area, so three cannot test a ray against it exactly and
          instead uses Raycaster.params.Line.threshold — a radius, in WORLD
          units, defaulting to 1. This map is 12.6 units across. Every border on
          it is therefore "hit" by any ray passing within a unit of it, which
          over a political map means very nearly every ray; and because these
          lines sit a thousandth of a unit above the land, they were hit FIRST.
          Their nearest handler-carrying ancestor is the group that treats a
          click as "not a country", so every click on every country cleared the
          selection instead of making one, and country picking stopped working
          entirely.

          Lowering the global threshold would fix the symptom and leave a
          scene-wide constant tuned for one mesh. Borders are notation; nothing
          should ever be able to click one.
        */
        raycast={() => null}
      />

      {/*
        The chosen country's name, over the country itself.

        In the scene rather than in the side panel because the answer to "what
        did I just click" belongs next to the thing clicked. occlude is left
        off: the label sits half a unit above a flat plate with nothing between
        it and any camera that can see the map, so raycasting the terrain every
        frame to confirm that would be work with a known answer.
      */}
      {focused && picked >= 0 && (
        <Html
          position={[centres[picked][0], 1.15, centres[picked][1]]}
          center
          zIndexRange={[8, 0]}
        >
          <div className="country" aria-hidden="true">
            {COUNTRIES[picked].name}
          </div>
        </Html>
      )}

      {/*
        And the same fact, spoken. The visual label is aria-hidden because it is
        rendered into a portal outside the document order that describes this
        scene; this live region is inside it and is what a screen reader
        actually announces.
      */}
      <Html position={[0, 0, 0]} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        <p className="sr-only" aria-live="polite">
          {focused && picked >= 0 ? `${COUNTRIES[picked].name} selected.` : ''}
        </p>
      </Html>

      {/* Hedge frame, squared off to match the projection. */}
      <mesh geometry={HEDGE_LONG} position={[0, 0.36, -(MAP_D / 2 + 0.8)]} material={GARDEN_HEDGE} />
      <mesh geometry={HEDGE_LONG} position={[0, 0.36, MAP_D / 2 + 0.8]} material={GARDEN_HEDGE} />
      <mesh geometry={HEDGE_SHORT} position={[-(MAP_W / 2 + 0.8), 0.36, 0]} material={GARDEN_HEDGE} />
      <mesh geometry={HEDGE_SHORT} position={[MAP_W / 2 + 0.8, 0.36, 0]} material={GARDEN_HEDGE} />

      {/* A reading plinth at the map's near edge, where a globe used to stand.
          Kept inside radius 8 so it stands on flat ground like the plate. */}
      <group position={[0, 0, MAP_D / 2 + 2.3]}>
        <mesh geometry={PLINTH_BASE} scale={[0.62, 0.8, 0.62]} position={[0, 0.28, 0]} material={GARDEN_STONE} />
        <mesh geometry={PLINTH_TOP} scale={[0.62, 0.7, 0.62]} position={[0, 1.15, 0]} material={GARDEN_MARBLE} />
        <mesh geometry={MAP_FACE} scale={[0.19, 1, 0.19]} rotation={[-0.5, 0, 0]} position={[0, 1.7, 0]} material={ACCENT.geography} />
      </group>

      {cypresses.map((c, i) => (
        <group key={i} position={c.position} scale={c.scale}>
          <mesh geometry={CYPRESS_TRUNK} position={[0, 0.35, 0]} material={mat.wood} />
          <mesh geometry={CYPRESS} position={[0, 2.5, 0]} material={mat.leaf} />
        </group>
      ))}
    </group>
  )
}

// ===========================================================================
// Scientific Shores — observatory, atom, lighthouse, and the subjects along the beach
// ===========================================================================

const OBS_BASE = new THREE.CylinderGeometry(3.6, 4.0, 1.0, 160)
const OBS_TOWER = new THREE.CylinderGeometry(3.0, 3.2, 5.0, 160)
const OBS_BAND = new THREE.TorusGeometry(3.06, 0.24, 48, 208)
const OBS_DOME = new THREE.SphereGeometry(3.1, 176, 88, 0, Math.PI * 2, 0, Math.PI / 2)
const OBS_SLOT = new THREE.BoxGeometry(0.9, 3.3, 3.3)

/*
  Openings. A drum with a dome on it is a silo; the windows and the door are
  what say "building" and, more usefully, what give it a readable size — with
  nothing on the wall there is no cue for how tall five units is.
*/
const OBS_WINDOW = new THREE.BoxGeometry(0.44, 1.05, 0.3)
const OBS_DOOR = new THREE.BoxGeometry(1.0, 1.9, 0.3)
const OBS_WINDOWS = Array.from({ length: 9 }, (_, i) => {
  // Left open at the front, where the door goes.
  const a = 0.55 + (i / 9) * (Math.PI * 2 - 1.1)
  return { x: Math.cos(a) * 3.02, z: Math.sin(a) * 3.02, a }
})
const TELESCOPE = new THREE.CylinderGeometry(0.34, 0.46, 4.2, 72)

const NUCLEUS = new THREE.SphereGeometry(0.85, 112, 80)
// Also drawn three times (378-380), same reasoning as RING above.
const ORBITAL = new THREE.TorusGeometry(2.5, 0.1, 32, 256)
const ELECTRON = new THREE.SphereGeometry(0.24, 64, 44)

/**
 * The tower, turned as one profile.
 *
 * A truncated cone is the wrong shape for a lighthouse: real ones batter — the
 * wall curves in, steeply near the base and barely at all near the top — and
 * they finish in a corbelled cornice that carries the gallery out past the
 * shaft. Both come free from a lathe, and both are silhouette, which is all you
 * can see of a tower against the sky.
 */
const LH_TOWER = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))

  at(0, 0)
  at(1.85, 0)
  at(1.82, 0.45)
  // Battered wall: cosine easing gives the concave sweep, fast low, slow high.
  for (let i = 1; i <= 14; i++) {
    const t = i / 14
    at(1.82 - 0.86 * (1 - Math.cos((t * Math.PI) / 2)), 0.45 + t * 6.15)
  }
  at(0.97, 6.75)
  at(1.06, 6.85)   // corbel
  at(1.44, 7.15)
  at(1.44, 7.34)   // gallery deck, carried by the cornice
  at(1.30, 7.40)
  at(0, 7.40)

  return new THREE.LatheGeometry(p, 96)
})()

/** Balusters around the gallery, and the rail they carry. */
const LH_RAIL_POST = new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10)
const LH_RAIL = new THREE.TorusGeometry(1.3, 0.045, 12, 72)
const LH_RAIL_POSTS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2
  return [Math.cos(a) * 1.3, Math.sin(a) * 1.3] as const
})

/** A door at the foot, and slit windows up the shaft. */
const LH_DOOR = new THREE.BoxGeometry(0.62, 1.15, 0.14)
const LH_WINDOW = new THREE.BoxGeometry(0.26, 0.5, 0.14)
const LH_LANTERN = new THREE.CylinderGeometry(1.0, 1.0, 1.4, 112)
const LH_ROOF = new THREE.ConeGeometry(1.35, 1.5, 112)
const LH_LAMP = new THREE.SphereGeometry(0.5, 80, 56)
const LAMP_MAT = std({ color: '#fff2c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 2.4, roughness: 0.4 })

const JETTY_POSTS = Array.from({ length: 7 }, (_, i) => i)
const JETTY_SPAN = 6 * 1.8 + 2

function Atom() {
  const shell = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    shell.current.rotation.y += dt * 0.55
    shell.current.rotation.x += dt * 0.22
  })
  return (
    <group>
      <mesh geometry={PLINTH_BASE} scale={[0.5, 0.8, 0.5]} position={[0, 0.28, 0]} material={mat.marble} />
      <mesh geometry={UNIT_BOX} scale={[0.5, 2.4, 0.5]} position={[0, 1.7, 0]} material={mat.steel} />
      <group position={[0, 5.4, 0]}>
        <mesh geometry={NUCLEUS} material={ACCENT.science} />
        <group ref={shell} userData={{ noShadow: true }}>
          <mesh geometry={ORBITAL} material={mat.steel} />
          <mesh geometry={ORBITAL} rotation={[Math.PI / 3, 0, 0]} material={mat.steel} />
          <mesh geometry={ORBITAL} rotation={[-Math.PI / 3, 0, 0]} material={mat.steel} />
          <mesh geometry={ELECTRON} position={[2.5, 0, 0]} material={ACCENT.science} />
          <mesh geometry={ELECTRON} position={[-1.25, 2.16, 0]} material={ACCENT.science} />
          <mesh geometry={ELECTRON} position={[-1.25, -2.16, 0]} material={ACCENT.science} />
        </group>
      </group>
    </group>
  )
}

function Lighthouse() {
  const lamp = useRef<THREE.PointLight>(null!)
  useFrame((state) => {
    // Held steady for reduced motion. This one is not a rotation like the other
    // ornaments — it swings a point light from 14 to 26 and back every ~2.9s,
    // which is a luminance flash, and that is the part of "motion" that is an
    // accessibility hazard rather than a flourish.
    if (prefersReducedMotion()) return
    // Sweeping beacon, faked with intensity rather than a rotating spotlight.
    lamp.current.intensity = 14 + 12 * Math.pow(Math.sin(state.clock.elapsedTime * 1.1), 8)
  })
  return (
    <group>
      <mesh geometry={PLINTH_BASE} scale={[0.8, 0.6, 0.8]} position={[0, 0.2, 0]} material={mat.stone} />

      {/* The lathe carries its own base, cornice and gallery deck, so the tower
          is one mesh from the ground to the lantern floor. */}
      <mesh geometry={LH_TOWER} position={[0, 0.4, 0]} material={mat.marble} />

      {/* Openings. A tower with no way in and nothing to see out of is a
          bollard; these are what give the shaft its height. */}
      <mesh geometry={LH_DOOR} position={[0, 1.0, 1.72]} material={mat.dark} />
      <mesh geometry={LH_WINDOW} position={[0, 3.1, 1.42]} material={mat.glass} />
      <mesh geometry={LH_WINDOW} position={[0, 5.0, 1.2]} material={mat.glass} />
      <mesh geometry={LH_WINDOW} position={[1.15, 4.1, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.glass} />

      <Instances geometry={LH_RAIL_POST} material={mat.dark} limit={LH_RAIL_POSTS.length}>
        {LH_RAIL_POSTS.map(([x, z], i) => (
          <Instance key={i} position={[x, 8.06, z]} />
        ))}
      </Instances>
      <mesh geometry={LH_RAIL} rotation={[Math.PI / 2, 0, 0]} position={[0, 8.36, 0]} material={mat.dark} />

      <mesh geometry={LH_LANTERN} position={[0, 8.5, 0]} material={mat.glass} />
      <mesh geometry={LH_LAMP} position={[0, 8.5, 0]} material={LAMP_MAT} />
      <mesh geometry={LH_ROOF} position={[0, 9.95, 0]} material={mat.ember} />
      <pointLight ref={lamp} position={[0, 8.5, 0]} distance={38} decay={2} color="#ffdc9a" intensity={18} />
    </group>
  )
}

/**
 * A station: an interpretive panel on a post, the kind a shore walk has at
 * every stop. The post and the panel are merged into one geometry so that a
 * station is one instance, tinted by its subject.
 */
const STATION_LEAN = -0.42
const STATION = (() => {
  const post = new THREE.BoxGeometry(0.14, 1.0, 0.14).translate(0, 0.5, 0)
  const panel = new THREE.BoxGeometry(1.0, 0.64, 0.06).rotateX(STATION_LEAN).translate(0, 1.22, 0.12)
  return mergeGeometries([post, panel])!
})()
const STATION_MAT = std({ color: '#ffffff', roughness: 0.62, metalness: 0.08 }, DRESSED)
const STATION_HALO = new THREE.TorusGeometry(0.62, 0.055, 10, 44)
/** Where the stations stand: on the beach, between the plateau and the walk. */
const SHORE_R = 8.2
/** Half the arc of beach they occupy, either side of the seaward bearing. */
const SHORE_HALF = 0.9

type ShoreWalk = {
  stations: Exhibit[]
  walk: THREE.BufferGeometry
  atlas: LabelAtlas
  labels: LabelPlacement[]
}

/**
 * The subjects, as stations along the beach.
 *
 * Eleven panels on an arc of the shore, evenly spaced, each facing the water
 * — which is the side the camera comes from — with a boardwalk running along
 * the sand in front of them. The arc is centred on the seaward bearing
 * because that is where the beach is: the ground survey puts the low, flat
 * sand between about forty and a hundred and forty degrees, and either side
 * of that the island rises.
 */
function layoutShoreWalk(d: District): ShoreWalk {
  const n = SUBJECTS.length
  const a0 = d.seaward - SHORE_HALF
  const a1 = d.seaward + SHORE_HALF
  const stations: Exhibit[] = SUBJECTS.map((subject, i) => {
    const a = a0 + (i / (n - 1)) * (a1 - a0)
    const x = Math.cos(a) * SHORE_R
    const z = Math.sin(a) * SHORE_R
    return {
      name: subject.name,
      article: subject.article,
      kicker: subject.blurb,
      x,
      y: groundAt(d, x, z),
      z,
      // Panel toward the water.
      yaw: Math.atan2(Math.cos(a), Math.sin(a)),
      color: subject.color,
    }
  })

  const M = 80
  const plank = new THREE.Color('#6b4a2e')
  const line = Array.from({ length: M + 1 }, (_, k) => {
    const a = a0 - 0.1 + (k / M) * (a1 - a0 + 0.2)
    const r = SHORE_R + 1.0
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, color: plank }
  })
  const walk = groundRibbon(d, line, 1.1)

  // The name on the panel itself — a flat label in the panel's own plane,
  // leaning as it leans, just proud of its face — so a station reads as a
  // sign rather than as a blank board with a caption floating over it.
  const atlas = makeLabelAtlas(SUBJECTS.map((subject) => subject.name))
  const labels: LabelPlacement[] = stations.map((st, i) => {
    const a = a0 + (i / (n - 1)) * (a1 - a0)
    // The panel's centre, then a little along its normal.
    const out = 0.12 + Math.cos(STATION_LEAN) * 0.07
    return {
      cell: i,
      x: st.x + Math.cos(a) * out,
      y: st.y + 1.22 - Math.sin(STATION_LEAN) * 0.07,
      z: st.z + Math.sin(a) * out,
      width: 0.92,
      yaw: st.yaw,
      pitch: STATION_LEAN,
    }
  })
  return { stations, walk, atlas, labels }
}

export function ScientificShores({ d, focused }: LandmarkProps) {
  /*
    Which way the open water lies. Both the jetty and the lighthouse run along
    it, so it has to be right or the jetty walks inland.

    This used to be derived as "away from the world origin", which worked only
    while every district sat on one shared island. On an archipelago each
    district IS its own island, so that direction means nothing — it would now
    point at whatever happens to be on the far side of the world. The bearing is
    authored per district instead.
  */
  const outward = useMemo(() => ({ x: Math.cos(d.seaward), z: Math.sin(d.seaward) }), [d])

  const jetty = useMemo(() => {
    /*
      The jetty starts at the waterline, not at a fixed radius. The island's
      shore sits 13-17 units out depending on bearing, and the hardcoded 10 this
      used to begin at put the deck's landward third and its first post inside
      the hill — with a wedge of terrain standing two units proud of the planks.
      Backing up 1.5 units from the shore lands it on the beach.
    */
    const shore = findShore(d, outward.x, outward.z, 26)
    // Outward from the waterline, not inward from it. Stepping back toward the
    // island walks UP the beach, which is how the deck ended up buried in the
    // first place — the ground at 1.5 units inland stands nearly four units
    // above the planks.
    // +2 measured: at +1 the deck's landward end still breached the beach by
    // three units, at +2 the highest ground beneath any part of it is -0.51.
    const start = Math.hypot(shore.lx, shore.lz) + 2
    return JETTY_POSTS.map((i) => {
      const t = start + i * 1.8
      return { lx: outward.x * t, lz: outward.z * t }
    })
  }, [d, outward])

  // On the headland beside the jetty — found by walking in from the water rather
  // than guessed, or it ends up submerged wherever the coastline happens to dip.
  const lighthouse = useMemo(() => {
    const bearing = 0.9
    const dx = outward.x * Math.cos(bearing) - outward.z * Math.sin(bearing)
    const dz = outward.z * Math.cos(bearing) + outward.x * Math.sin(bearing)
    return findShore(d, dx, dz, 16, 2.4)
  }, [d, outward])

  // The deck runs along the jetty, so it shares the jetty's bearing.
  const deckAngle = useMemo(() => -d.seaward, [d])

  const deckMid = jetty[Math.floor(jetty.length / 2)]

  const shore = useMemo(() => layoutShoreWalk(d), [d])
  const picked = useDistrictSelection(d.id)?.item ?? -1
  const pick = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: 0, item: i }),
    [d.id],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick(-1)}>
      <group position={[-3.4, 0, -2.2]}>
        <mesh geometry={OBS_BASE} position={[0, 0.5, 0]} material={mat.stone} />
        <mesh geometry={OBS_TOWER} position={[0, 3.5, 0]} material={mat.marble} />
        <mesh geometry={OBS_BAND} rotation={[Math.PI / 2, 0, 0]} position={[0, 6.0, 0]} material={mat.steel} />
        <mesh geometry={OBS_DOME} position={[0, 6.15, 0]} material={ACCENT.science} />
        <mesh geometry={OBS_SLOT} position={[0, 7.6, 1.5]} material={mat.dark} />

        <Instances geometry={OBS_WINDOW} material={mat.glass} limit={OBS_WINDOWS.length}>
          {OBS_WINDOWS.map((w, i) => (
            <Instance key={i} position={[w.x, 4.1, w.z]} rotation={[0, -w.a + Math.PI / 2, 0]} />
          ))}
        </Instances>
        <mesh geometry={OBS_DOOR} position={[3.05, 1.95, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.dark} />
        <mesh geometry={TELESCOPE} position={[0, 8.4, 2.1]} rotation={[Math.PI / 3.1, 0, 0]} material={mat.steel} />
      </group>

      <group position={[4.4, 0, 2.8]}>
        <Atom />
      </group>

      <group position={[lighthouse.lx, lighthouse.y, lighthouse.lz]}>
        <Lighthouse />
      </group>

      {/* The subjects, along the beach. */}
      <mesh geometry={shore.walk} material={RIBBON_MAT} receiveShadow />
      <Exhibits
        d={d}
        focused={focused}
        items={shore.stations}
        geometry={STATION}
        material={STATION_MAT}
        labelHeight={2.05}
        extent={2.2}
        marker={{ geometry: STATION_HALO, material: ACCENT.science }}
        picked={picked}
        onPick={pick}
      />
      <InstancedLabels atlas={shore.atlas} placements={shore.labels} fade={[22, 40]} billboard={false} />

      {/* Jetty: a deck spanning the posts, each post sunk to the sea floor. */}
      <mesh
        geometry={UNIT_BOX}
        // Spans the posts and no more: 6 gaps of 1.8, plus a little overhang
        // at each end. A fixed length overshot onto the beach.
        scale={[JETTY_SPAN, 0.3, 1.8]}
        position={[deckMid.lx, -d.pad + 1.1, deckMid.lz]}
        rotation={[0, deckAngle, 0]}
        material={mat.wood}
      />
      {/* Posts hang a fixed distance below the deck — the sea floor here is ~20
          units down and following it would give each post a comic stilt. */}
      <Instances geometry={UNIT_BOX} material={mat.wood} limit={jetty.length}>
        {jetty.map((p, i) => (
          <Instance key={i} scale={[0.34, 4.5, 0.34]} position={[p.lx, -d.pad + 1.1 - 2.25, p.lz]} />
        ))}
      </Instances>
    </ExhibitHall>
  )
}

// ===========================================================================
// Artistic Arboretum — an amphitheatre, and eight galleries in the grove
// ===========================================================================

/**
 * Stepped seating built as tread + riser per tier. Solid stacked half-cylinders
 * would work only if the largest were at the bottom — with the seating rising
 * outward, the widest tier is on top and hides every tier beneath it, leaving a
 * featureless disc.
 */
const SEAT_TIERS = [0, 1, 2, 3].map((i) => {
  const rInner = 2.4 + i * 0.85
  return {
    tread: new THREE.RingGeometry(rInner, rInner + 0.85, 208, 2, 0, Math.PI),
    riser: new THREE.CylinderGeometry(rInner, rInner, 0.72, 208, 1, true, 0, Math.PI),
    y: (i + 1) * 0.72,
  }
})
const STAGE = new THREE.CylinderGeometry(2.2, 2.2, 0.32, 160)

/*
  The outer facade, and the aisles that break the seating up.

  Four concentric tiers alone read as a contour map. Two things turn them into a
  theatre: a wall around the back of the bowl, which is what the structure looks
  like from outside and from every camera that is not directly overhead, and
  radial stairs cutting through the tiers, which is how anyone would actually
  reach a seat.

  Both are built over the same 0..PI sweep the tiers use, so they stay aligned
  with the seating whichever way the group is turned.
*/
const AMPHI_WALL = new THREE.CylinderGeometry(6.0, 6.15, 3.1, 96, 1, true, 0, Math.PI)
const AMPHI_CORNICE = new THREE.CylinderGeometry(6.25, 6.25, 0.22, 96, 1, true, 0, Math.PI)
const AMPHI_STEP = new THREE.BoxGeometry(0.62, 0.72, 0.9)
const AMPHI_AISLES = [Math.PI * 0.28, Math.PI * 0.5, Math.PI * 0.72]
// The single most tessellated object in the scene: 256x40x2 = 20,480 triangles
// for a sculpture about three units across. 128x12 gives 3,072.
const KNOT = new THREE.TorusKnotGeometry(1.55, 0.42, 512, 64, 2, 3)

/**
 * A pedestal with the work upon it, turned as one profile: base, shaft,
 * capital, and the piece.
 *
 * The piece is an orb. Sixty-eight works in eight media cannot each be
 * modelled, and a stand-in that is honest about being one — the same form
 * on every pedestal, in its medium's colour — reads better than sixty-eight
 * bad likenesses would. The name is what identifies a work, and it follows
 * the pointer.
 */
const PEDESTAL = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(0.3, 0)
  at(0.3, 0.06)
  at(0.17, 0.1)
  at(0.12, 0.15)
  at(0.105, 0.92) // a slight taper up the shaft
  at(0.15, 0.98)
  at(0.17, 1.03) // capital
  // The orb, from just under its equator round to its pole.
  for (let i = 0; i <= 9; i++) {
    const ang = -1.35 + (i / 9) * (1.35 + Math.PI / 2)
    at(Math.max(0, 0.21 * Math.cos(ang)), 1.27 + 0.21 * Math.sin(ang))
  }
  return new THREE.LatheGeometry(p, 28)
})()
const PEDESTAL_MAT = std({ color: '#ffffff', roughness: 0.4, metalness: 0.2 }, DRESSED)
const GALLERY_HALO = new THREE.TorusGeometry(0.5, 0.05, 10, 40)

/** The galleries' ring: its centre radius, and the grid within each. */
const GALLERY_R = 7.65
const GALLERY_DR = 0.75
const GALLERY_DT = 0.85

type Galleries = {
  works: Exhibit[]
  media: LabelPlacement[]
  mediaAtlas: LabelAtlas
}

/**
 * Eight galleries round the amphitheatre, one per medium.
 *
 * Each is a small grid of pedestals — three deep, as wide as the medium
 * needs — set on the ring where the grove used to begin, with the medium's
 * name over it. The grove now stands outside the ring, so the galleries are
 * clearings in it, which is what a sculpture garden is.
 */
function layoutGalleries(d: District): Galleries {
  const works: Exhibit[] = []
  const media: LabelPlacement[] = []
  MEDIA.forEach((medium, k) => {
    const a = d.seaward + (k / MEDIA.length) * Math.PI * 2
    const rx = Math.cos(a)
    const rz = Math.sin(a)
    const tx = -Math.sin(a)
    const tz = Math.cos(a)
    const rows = Math.min(3, medium.works.length)
    const cols = Math.ceil(medium.works.length / rows)
    medium.works.forEach((work, i) => {
      const col = Math.floor(i / rows)
      const row = i % rows
      const r = GALLERY_R + (row - (rows - 1) / 2) * GALLERY_DR
      const t = (col - (cols - 1) / 2) * GALLERY_DT
      const x = rx * r + tx * t
      const z = rz * r + tz * t
      works.push({
        name: work.title,
        article: work.article,
        kicker: `${work.artist} · ${work.year}`,
        x,
        y: groundAt(d, x, z),
        z,
        color: medium.color,
      })
    })
    const cx = rx * GALLERY_R
    const cz = rz * GALLERY_R
    media.push({ cell: k, x: cx, y: groundAt(d, cx, cz) + 2.7, z: cz, width: 2.4 })
  })
  return { works, media, mediaAtlas: makeLabelAtlas(MEDIA.map((medium) => medium.name)) }
}

/*
  A tree, rather than a lollipop.

  Trunk plus one sphere is the shape a child draws, and subdividing the sphere
  only makes a rounder ball. Two things fix it cheaply: a trunk that flares into
  a root buttress at the base (a lathe, so the flare is a curve rather than a
  cone), and a crown built from three overlapping lobes at different heights and
  offsets, which gives an irregular silhouette and lets light break it up.

  Both stay instanced, so 22 trees are two draw calls rather than 88.
*/
const TRUNK = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(0.46, 0)      // root flare
  at(0.34, 0.28)
  at(0.27, 0.7)
  at(0.23, 1.5)
  at(0.19, 2.6)    // where the crown takes over
  at(0, 2.6)
  return new THREE.LatheGeometry(p, 20)
})()

/** Offsets of the three crown lobes, in trunk-relative units. */
const CROWN_LOBES = [
  { offset: [0, 0.95, 0] as const, scale: 1.0 },
  { offset: [0.62, 0.35, -0.3] as const, scale: 0.72 },
  { offset: [-0.5, 0.5, 0.45] as const, scale: 0.66 },
]
/*
  Three crowns, not one.

  This was a single SphereGeometry, and three of them stacked per tree — so the
  grove was sixty-six identical green balls, which is the single most toy-like
  thing in any of the districts. Rotating the instances did nothing, because a
  sphere looks the same from every angle.

  Three lumpen variants, each from its own seed, is what breaks that: the three
  lobes of a crown are now three different shapes, and neighbouring trees pair
  them differently as the per-instance rotation turns them. Sixty-six balls
  become sixty-six silhouettes with no extra draw call — one <Instances> per
  variant instead of one for all three, which is two extra calls total.
*/
const CANOPIES = [0x71c, 0x9e3, 0x2ab].map((seed) =>
  /*
    20x14 rather than 48x36. Sixty-six of these are drawn in the Arboretum, at
    3,384 triangles each, so the grove alone was 222,000 — more than a tenth of
    the whole scene, spent on smoothness in a shape whose entire point is that
    it is lumpy. At 560 triangles the same displacement reads identically at the
    distance a district view parks at, and the grove costs 37,000.
  */
  lumpen(new THREE.SphereGeometry(1.45, 20, 14), seed, 0.62),
)

export function ArtisticArboretum({ d, focused }: LandmarkProps) {
  const knot = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    knot.current.rotation.y += dt * 0.35
    knot.current.rotation.z += dt * 0.12
  })

  // Outside the galleries' ring, so they stand among trees rather than in a
  // field of them.
  const grove = useMemo(() => scatter(d, 20, 9.4, 12.2, 0xa27), [d])
  const galleries = useMemo(() => layoutGalleries(d), [d])
  const picked = useDistrictSelection(d.id)?.item ?? -1
  const pick = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: groupOf(d.id, i), item: i }),
    [d.id],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick(-1)}>
      {/* The amphitheatre, at the centre and a little smaller than it was,
          with the sculpture on its stage. */}
      <group position={[0, 0, 0.4]} rotation={[0, -0.5, 0]} scale={0.72}>
        {SEAT_TIERS.map((t, i) => (
          <group key={i}>
            <mesh geometry={t.tread} rotation={[-Math.PI / 2, 0, 0]} position={[0, t.y, 0]} material={mat.stoneBoth} />
            <mesh geometry={t.riser} position={[0, t.y - 0.36, 0]} material={mat.stoneBoth} />
          </group>
        ))}
        <mesh geometry={STAGE} position={[0, 0.16, 0]} material={mat.marble} />

        {/* Facade. Open-ended cylinders, so both faces are drawn. */}
        <mesh geometry={AMPHI_WALL} position={[0, 1.55, 0]} material={mat.stoneBoth} />
        <mesh geometry={AMPHI_CORNICE} position={[0, 3.2, 0]} material={mat.stoneBoth} />

        {/* Stairs through the tiers. The ring maps theta 0..PI onto the -Z half
            once the treads are laid flat, so the aisles follow the same sign. */}
        <Instances geometry={AMPHI_STEP} material={mat.stone} limit={AMPHI_AISLES.length * SEAT_TIERS.length}>
          {AMPHI_AISLES.flatMap((a, ai) =>
            SEAT_TIERS.map((t, i) => {
              const r = 2.4 + i * 0.85 + 0.42
              return (
                <Instance
                  key={`${ai}-${i}`}
                  position={[Math.cos(a) * r, t.y - 0.36, -Math.sin(a) * r]}
                  rotation={[0, a, 0]}
                />
              )
            }),
          )}
        </Instances>

        <group position={[0, 0.32, 0]} scale={0.8}>
          <mesh geometry={PLINTH_BASE} scale={[0.62, 1, 0.62]} position={[0, 0.35, 0]} material={mat.marble} />
          <mesh geometry={UNIT_BOX} scale={[1.1, 2.2, 1.1]} position={[0, 1.8, 0]} material={mat.marble} />
          <mesh ref={knot} geometry={KNOT} position={[0, 4.9, 0]} material={ACCENT.art} userData={{ noShadow: true }} />
        </group>
      </group>

      {/* The galleries. */}
      <Exhibits
        d={d}
        focused={focused}
        items={galleries.works}
        geometry={PEDESTAL}
        material={PEDESTAL_MAT}
        labelHeight={1.85}
        extent={2.2}
        marker={{ geometry: GALLERY_HALO, material: ACCENT.art }}
        picked={picked}
        onPick={pick}
      />
      <InstancedLabels atlas={galleries.mediaAtlas} placements={galleries.media} fade={[60, 95]} />

      {/* The lathe stands on the ground rather than being centred on it, so the
          root flare meets the terrain instead of floating half-buried. */}
      <Instances geometry={TRUNK} material={mat.wood} limit={32}>
        {grove.map((t, i) => (
          <Instance key={i} position={t.position} rotation={[0, t.rotation, 0]} scale={t.scale} />
        ))}
      </Instances>
      {CANOPIES.map((canopy, variant) => (
      <Instances key={variant} geometry={canopy} material={mat.leaf} limit={32}>
        {grove.flatMap((t, i) =>
          CROWN_LOBES.filter((_, k) => k === variant).map((lobe) => {
            const k = variant
            // The lobe offsets are authored on an un-rotated tree, so the tree's
            // own rotation has to carry them round — otherwise every crown in
            // the grove leans the same way.
            const cos = Math.cos(t.rotation)
            const sin = Math.sin(t.rotation)
            const [ox, oy, oz] = lobe.offset
            return (
              <Instance
                key={`${i}-${k}`}
                position={[
                  t.position[0] + (ox * cos + oz * sin) * t.scale,
                  t.position[1] + (2.6 + oy) * t.scale,
                  t.position[2] + (-ox * sin + oz * cos) * t.scale,
                ]}
                rotation={[0, t.rotation + k * 1.1, 0]}
                scale={t.scale * lobe.scale * (0.85 + (i % 3) * 0.12)}
              />
            )
          }),
        )}
      </Instances>
      ))}
    </ExhibitHall>
  )
}

// ===========================================================================
// Anthropologic Alps — stone circle, summit cairn, a span between two peaks
// ===========================================================================

/*
  Menhirs, not blocks.

  Eight identical boxes read as eight identical boxes however finely they are
  subdivided. These start as coarse tapered pillars — six sides, so the facets
  are the hewn faces — and are then roughened, which breaks the remaining
  regularity. Because roughen() is deterministic and applied at module scope,
  every stone still comes out the same on every load; the variation between them
  comes from per-instance scale and tilt.
*/
const STANDING_STONE = roughen(new THREE.CylinderGeometry(0.62, 0.84, 3.0, 6, 3), 0.17)
const LINTEL = roughen(new THREE.BoxGeometry(2.2, 0.55, 1.0, 3, 2, 2), 0.09)
/*
  A boulder, not a ball. Detail 5 made these perfectly spherical — the extra
  subdivision was working directly against what a stacked cairn should look
  like. Detail 2 keeps facets big enough to read as broken rock, and roughen()
  gives each face a different plane.
*/
const CAIRN_ROCK = roughen(new THREE.IcosahedronGeometry(1, 2), 0.22)
const FLAGPOLE = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 40)
const BANNER = new THREE.BoxGeometry(1.9, 1.1, 0.06)

const HENGE = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, a }
})
const CAIRN_STACK = [1.0, 0.82, 0.64, 0.48, 0.34]

/*
  A chalet, rather than a box with a pyramid on it.

  The old form was three primitives and read as exactly that at any distance.
  What makes a building legible is not smoothness but the parts everyone
  expects: something it stands on, a pitched roof that overhangs rather than
  capping flush, a balcony, and openings to give the walls scale. Each part is
  its own <Instances> block, so seven chalets with nine parts each still cost
  nine draw calls rather than sixty-three.
*/
const HOUSE_BASE = new THREE.BoxGeometry(2.15, 0.35, 2.55)
const HOUSE_BODY = new THREE.BoxGeometry(1.9, 1.5, 2.3)

/**
 * A gable, extruded — an alpine roof runs to two pitched faces along a ridge,
 * not to a point. A 4-sided cone gave every house a pyramid, which is the one
 * roof shape these buildings never have.
 */
const HOUSE_ROOF = (() => {
  const gable = new THREE.Shape()
  gable.moveTo(-1.42, 0)
  gable.lineTo(0, 1.05)
  gable.lineTo(1.42, 0)
  gable.closePath()
  const geo = new THREE.ExtrudeGeometry(gable, { depth: 2.9, bevelEnabled: false, curveSegments: 1 })
  // Extrusion runs along +Z from the origin; centre it on the body.
  geo.translate(0, 0, -1.45)
  return geo
})()

const HOUSE_BALCONY = new THREE.BoxGeometry(2.1, 0.09, 0.6)
const HOUSE_RAIL = new THREE.BoxGeometry(2.1, 0.07, 0.07)
const HOUSE_POST = new THREE.BoxGeometry(0.08, 0.42, 0.08)
const HOUSE_DOOR = new THREE.BoxGeometry(0.5, 0.82, 0.06)
const HOUSE_WINDOW = new THREE.BoxGeometry(0.38, 0.34, 0.05)
const CHIMNEY = new THREE.BoxGeometry(0.34, 1.0, 0.34)

/** A handful of chalets on the lower slopes. */
function Village({ d }: { d: District }) {
  const houses = useMemo(() => scatter(d, 7, 6.5, 10.5, 0x71ce), [d])

  /*
    Instancing flattens the per-house group away, so every part has to carry the
    transform that group used to apply. Parts on the building's own Y axis only
    need the scale folded in; anything offset in X or Z is genuinely moved by
    the house's rotation, so that rotation is reapplied here. three's Y rotation
    maps (x, z) to (x cos + z sin, -x sin + z cos).
  */
  const chalets = useMemo(
    () =>
      houses.map((h, i) => {
        const scale = 0.8 + (i % 3) * 0.12
        const [hx, hy, hz] = h.position
        const cos = Math.cos(h.rotation)
        const sin = Math.sin(h.rotation)

        /** Local (x, y, z) on the un-rotated house -> world. */
        const at = (lx: number, ly: number, lz: number): [number, number, number] => [
          hx + (lx * cos + lz * sin) * scale,
          hy + ly * scale,
          hz + (-lx * sin + lz * cos) * scale,
        ]

        // The front wall faces +Z before rotation; 1.15 is its outer face.
        const FRONT = 1.16
        return {
          rotation: h.rotation,
          scale,
          base: at(0, 0.175, 0),
          body: at(0, 1.1, 0),
          roof: at(0, 1.85, 0),
          balcony: at(0, 1.12, FRONT + 0.28),
          rail: at(0, 1.52, FRONT + 0.55),
          posts: [at(-1.0, 1.32, FRONT + 0.55), at(1.0, 1.32, FRONT + 0.55)],
          door: at(0, 0.76, FRONT),
          windows: [at(-0.58, 1.44, FRONT), at(0.58, 1.44, FRONT)],
          chimney: at(0.62, 2.35, -0.55),
        }
      }),
    [houses],
  )

  const rot = (c: (typeof chalets)[number]) => [0, c.rotation, 0] as [number, number, number]

  return (
    <group>
      <Instances geometry={HOUSE_BASE} material={mat.stone} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.base} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_BODY} material={mat.wood} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.body} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_ROOF} material={mat.snow} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.roof} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_BALCONY} material={mat.wood} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.balcony} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_RAIL} material={mat.wood} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.rail} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_POST} material={mat.wood} limit={chalets.length * 2}>
        {chalets.flatMap((c, i) =>
          c.posts.map((p, k) => (
            <Instance key={`${i}-${k}`} position={p} rotation={rot(c)} scale={c.scale} />
          )),
        )}
      </Instances>
      <Instances geometry={HOUSE_DOOR} material={mat.darkStone} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.door} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_WINDOW} material={mat.glass} limit={chalets.length * 2}>
        {chalets.flatMap((c, i) =>
          c.windows.map((w, k) => (
            <Instance key={`${i}-${k}`} position={w} rotation={rot(c)} scale={c.scale} />
          )),
        )}
      </Instances>
      <Instances geometry={CHIMNEY} material={mat.darkStone} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.chimney} rotation={rot(c)} scale={c.scale} />
        ))}
      </Instances>
    </group>
  )
}

export function AnthropologicAlps({ d }: LandmarkProps) {
  const banner = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    banner.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.6) * 0.22
  })

  // The henge sits on a mountainside, so every stone is dropped onto the real
  // terrain rather than sharing one plateau height.
  const henge = useMemo(
    () =>
      HENGE.map((s) => ({ ...s, y: groundAt(d, s.x, s.z) })),
    [d],
  )

  // The cairn belongs on the highest peak. Deriving that from the bump list
  // rather than indexing position 2 of it means retuning the relief carries the
  // cairn along, and a district with no bumps falls back to its plateau instead
  // of tripping a non-null assertion and taking the whole canvas down.
  const summit = useMemo(() => {
    const peaks = d.bumps ?? []
    return peaks.length ? peaks.reduce((hi, b) => (b.h > hi.h ? b : hi)) : { dx: 0, dz: 0 }
  }, [d])
  const summitY = groundAt(d, summit.dx, summit.dz)

  return (
    <group>
      <group>
        {/* Both offsets sat on the group's Y axis, so flattening the group only
            costs adding its rotation to the lintel's own quarter turn. */}
        <Instances geometry={STANDING_STONE} material={mat.stone} limit={henge.length}>
          {henge.map((s, i) => (
            <Instance
              key={i}
              position={[s.x, s.y + 1.35, s.z]}
              // A slight lean, different per stone. Nothing that has stood on a
              // mountainside for four thousand years is still plumb, and eight
              // perfectly upright pillars are the tell.
              rotation={[Math.sin(i * 2.3) * 0.05, -s.a, Math.cos(i * 1.7) * 0.06]}
              scale={[0.92 + (i % 4) * 0.09, 0.8 + (i % 3) * 0.18, 0.92 + (i % 3) * 0.11]}
            />
          ))}
        </Instances>
        <Instances geometry={LINTEL} material={mat.stone} limit={henge.length}>
          {henge
            .filter((_, i) => i % 2 === 0)
            .map((s, i) => (
              <Instance key={i} position={[s.x, s.y + 2.95, s.z]} rotation={[0, -s.a + Math.PI / 2, 0]} />
            ))}
        </Instances>
        <mesh geometry={STAGE} scale={[1.6, 1, 1.6]} position={[0, groundAt(d, 0, 0) + 0.16, 0]} material={mat.stone} />
      </group>

      <group position={[summit.dx, summitY, summit.dz]}>
        {CAIRN_STACK.map((s, i) => (
          <mesh
            key={i}
            geometry={CAIRN_ROCK}
            scale={s}
            position={[0, i * 1.1 + 0.6, 0]}
            rotation={[i * 0.7, i * 1.1, i * 0.4]}
            material={i === CAIRN_STACK.length - 1 ? ACCENT.anthropology : mat.darkStone}
          />
        ))}
        <mesh geometry={FLAGPOLE} position={[1.6, 2.2, 0]} material={mat.steel} />
        <mesh ref={banner} geometry={BANNER} position={[2.6, 3.6, 0]} material={ACCENT.anthropology} userData={{ noShadow: true }} />
      </group>

      <Village d={d} />
    </group>
  )
}

// ===========================================================================

/*
  Memoised, and this is a matter of responsiveness rather than tidiness.

  A selection lives in the page's state, so every choice — from the strip or
  from a stone — re-renders the page, which re-renders the canvas, which
  re-renders every district. Six districts are several hundred components,
  the trees and columns among them, and React works through them in slices
  between frames; on a slow machine that is a visible pause between the click
  and the island answering it. With the components memoised, a choice
  re-renders the one district whose selection changed and the other five
  bail out on their unchanged props, all of which are stable by construction:
  the district record, the focus flag, the page's callbacks.
*/
export const LANDMARKS: Record<DistrictId, React.ComponentType<LandmarkProps>> = {
  ideology: memo(IdeologyIsles),
  history: memo(HistoricalHabitat),
  geography: memo(GeographicalGarden),
  science: memo(ScientificShores),
  art: memo(ArtisticArboretum),
  anthropology: memo(AnthropologicAlps),
}
