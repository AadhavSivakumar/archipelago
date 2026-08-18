import * as THREE from 'three'
import { COUNTRIES } from './worldCountries'
import { weather } from './surface'

/*
  Map space is degrees. MAP_SCALE converts to world units, so the plate is
  360 x 180 degrees = 12.6 x 6.3 units, and everything on it is authored in
  longitude and latitude.

  Sized to the ground it sits on, not chosen for convenience. The plate is a
  rigid slab, so any part of it past the flattened plateau either floats or
  buries itself — and the plateau there is measurably flat only to a radius of
  8 (spread 0.20 units at r=8; 1.52 at r=9). A 2:1 plate inscribed in that
  circle can be at most 14.3 x 7.2 including its kerb, which puts the scale at
  0.035 world units per degree.
*/
export const MAP_SCALE = 0.035
export const MAP_W = 360 * MAP_SCALE
export const MAP_D = 180 * MAP_SCALE

/** How far each country stands proud of the sea face. */
const RELIEF = 0.22

/**
 * Which country the pointer is over, and which one is chosen.
 *
 * Module-level uniform objects rather than React state, for the same reason the
 * wave clock is one: the highlight has to follow the pointer, and routing that
 * through a re-render would rebuild the React tree on every mouse move to
 * change two floats on the GPU. Writing `.value` here repaints on the next
 * frame with no reconciliation at all.
 *
 * -1 means none. Country ids are indices into COUNTRIES.
 */
export const uHoverCountry = { value: -1 }
export const uPickedCountry = { value: -1 }

type Built = {
  geometry: THREE.BufferGeometry
  /** Country id per triangle, indexed by raycast faceIndex. */
  faceCountry: Int32Array
  /** Label anchor for each country, in plate-local (x, z). */
  centres: [number, number][]
}

/** Deterministic LCG, so the map is identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Every country as one mesh.
 *
 * 177 separate meshes would be 177 draw calls to draw a thing 600 pixels wide,
 * and the obvious alternative — one merged landmass — is exactly what was here
 * before and can only ever answer "that is land". So: one merged geometry, with
 * a per-vertex country id alongside the positions. The id does two jobs. On the
 * GPU it lets the highlight shader pick out one country without touching a
 * buffer. On the CPU, a raycast returns a faceIndex, and the id of that face's
 * first vertex is the country under the pointer — a lookup rather than a search
 * through 177 polygons.
 *
 * Merged by hand rather than through BufferGeometryUtils because every piece
 * comes from the same ExtrudeGeometry path and therefore has an identical
 * attribute set, which is the only thing that function would be checking, and
 * because the country attribute has to be filled in the same pass anyway.
 */
function build(source: readonly (readonly (readonly number[])[])[]): Built {
  const parts: THREE.BufferGeometry[] = []
  const centres: [number, number][] = []
  let vertexTotal = 0

  for (const rings of source) {
    const shapes = rings.map((ring) => {
      const shape = new THREE.Shape()
      for (let i = 0; i < ring.length; i += 2) {
        const x = (ring[i] / 10) * MAP_SCALE
        /*
          Latitude, un-negated, and this is the one line to be careful about.
          The shape is authored in XY and laid flat below with rotateX(-90),
          which sends shape Y to world -Z; north is -Z, so shape Y has to be
          latitude itself. Negating here as well — which an earlier version did,
          with a correct comment about north being -Z — cancels against the
          rotation and stands the whole map on its head.
        */
        const y = (ring[i + 1] / 10) * MAP_SCALE
        if (i === 0) shape.moveTo(x, y)
        else shape.lineTo(x, y)
      }
      shape.closePath()
      return shape
    })

    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: RELIEF,
      bevelEnabled: false,
      curveSegments: 1,
    })
    // Extruded along +Z in shape space; lay it flat so depth becomes height.
    geo.rotateX(-Math.PI / 2)
    parts.push(geo)
    vertexTotal += geo.attributes.position.count

    /*
      Label anchor: the area centroid of the country's largest ring.

      Not the centroid of all its rings — that puts France's label in the
      Atlantic somewhere between the mainland and its islands. Not the bounding
      box centre either, which for a crescent lands outside the country
      altogether. The area centroid of the biggest piece is wrong for a few
      genuinely horseshoe-shaped countries and right for the other hundred and
      seventy.
    */
    let biggest = rings[0]
    let biggestArea = -1
    for (const ring of rings) {
      let a = 0
      const n = ring.length / 2
      for (let i = 0, j = n - 1; i < n; j = i++) {
        a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1]
      }
      if (Math.abs(a) > biggestArea) {
        biggestArea = Math.abs(a)
        biggest = ring
      }
    }

    let cx = 0
    let cy = 0
    let signed = 0
    const n = biggest.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = biggest[i * 2]
      const yi = biggest[i * 2 + 1]
      const xj = biggest[j * 2]
      const yj = biggest[j * 2 + 1]
      const cross = xj * yi - xi * yj
      signed += cross
      cx += (xi + xj) * cross
      cy += (yi + yj) * cross
    }
    if (Math.abs(signed) < 1e-6) {
      // Degenerate after simplification — fall back to the mean of the points.
      cx = 0
      cy = 0
      for (let i = 0; i < n; i++) {
        cx += biggest[i * 2]
        cy += biggest[i * 2 + 1]
      }
      cx /= n
      cy /= n
    } else {
      cx /= 3 * signed
      cy /= 3 * signed
    }
    // Same axis convention as the shapes above: world z is -latitude.
    centres.push([(cx / 10) * MAP_SCALE, -(cy / 10) * MAP_SCALE])
  }

  const position = new Float32Array(vertexTotal * 3)
  const normal = new Float32Array(vertexTotal * 3)
  const color = new Float32Array(vertexTotal * 3)
  const aCountry = new Float32Array(vertexTotal)

  let v = 0
  for (let id = 0; id < parts.length; id++) {
    const geo = parts[id]
    const p = geo.attributes.position.array as Float32Array
    const nrm = geo.attributes.normal.array as Float32Array
    const count = geo.attributes.position.count

    position.set(p, v * 3)
    normal.set(nrm, v * 3)

    /*
      A per-country tint, baked rather than hashed in the shader.

      Without it the map is one flat green and the borders are invisible, which
      makes "click a country" a guess. The variation is small on purpose: this
      is meant to read as a lawn mown in different directions, not as a
      political atlas — the vivid version of this competes with the highlight,
      and then a selected country is no longer obviously the selected one.

      Multipliers around 1, because three multiplies the material colour by the
      vertex colour rather than replacing it, so the green stays in one place.
    */
    const rand = rng(id * 2654435761 + 12345)
    const shade = 0.88 + rand() * 0.24
    const warm = 0.94 + rand() * 0.12
    for (let i = 0; i < count; i++) {
      color[(v + i) * 3] = shade * warm
      color[(v + i) * 3 + 1] = shade
      color[(v + i) * 3 + 2] = shade * (1.9 - warm)
      aCountry[v + i] = id
    }

    v += count
    geo.dispose()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  geometry.setAttribute('aCountry', new THREE.BufferAttribute(aCountry, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // Non-indexed, so triangle t is vertices 3t, 3t+1, 3t+2 and they always share
  // a country — a triangle never spans two, because the parts were merged whole.
  const faceCountry = new Int32Array(vertexTotal / 3)
  for (let t = 0; t < faceCountry.length; t++) faceCountry[t] = aCountry[t * 3]

  return { geometry, faceCountry, centres }
}

let coarse: Built | null = null
let fine: Built | null = null

/**
 * The map as it looks from anywhere but the Garden itself.
 *
 * Built once, lazily. 2,197 points is a few milliseconds, and it is what the
 * plate wears at forty pixels across — where the difference between this and
 * the detailed set is smaller than one pixel.
 */
export function coarseMap(): Built {
  coarse ??= build(COUNTRIES.map((c) => c.rings))
  return coarse
}

/**
 * The detailed map, fetched and built on demand.
 *
 * Behind a dynamic import so its 288kB of coordinates never enters the initial
 * bundle: a visitor who does not open the Garden does not download a coastline.
 * Started when the district is focused, which is a second or two of camera
 * flight before anyone can read the map, so in practice it has already landed.
 *
 * The build is the slower half — 24,050 points is eleven times the coarse set,
 * extruded and merged on the main thread. Once per session, during a flight,
 * which is the cheapest moment available short of moving it to a worker.
 */
export async function loadFineMap(): Promise<Built> {
  if (fine) return fine
  const module = await import('./worldCountriesFine')
  fine ??= build(module.COUNTRIES_FINE)
  return fine
}

/**
 * The country under a raycast hit, or -1.
 *
 * Takes the map that was actually raycast. The two levels have different
 * triangle counts, so reading a fine faceIndex against the coarse lookup would
 * name a country essentially at random. R3F types faceIndex as
 * number | null | undefined, so the guard lives here rather than at every call.
 */
export function countryAt(map: Built, faceIndex: number | null | undefined): number {
  if (faceIndex === null || faceIndex === undefined) return -1
  const { faceCountry } = map
  return faceIndex >= 0 && faceIndex < faceCountry.length ? faceCountry[faceIndex] : -1
}

export type WorldMap = Built

const HIGHLIGHT_GLSL = /* glsl */ `
  varying float vCountry;
  uniform float uHover;
  uniform float uPicked;
  uniform vec3 uHoverTint;
  uniform vec3 uPickTint;
`

/**
 * The land material: turf, plus the country highlight.
 *
 * Compared with step() against a half-unit window rather than with ==, because
 * the id travels as a float through a varying and is interpolated across the
 * triangle. Every vertex of a triangle carries the same id so the interpolant
 * is constant in exact arithmetic, but it is not obliged to be bit-exact, and
 * an equality test on a float that is 42.000001 fails silently and leaves one
 * triangle of a highlighted country unlit.
 */
export function landMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: '#4d8a56',
    roughness: 0.92,
    vertexColors: true,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHover = uHoverCountry
    shader.uniforms.uPicked = uPickedCountry
    shader.uniforms.uHoverTint = { value: new THREE.Color('#cfe8a8') }
    shader.uniforms.uPickTint = { value: new THREE.Color('#ffd978') }

    shader.vertexShader = `attribute float aCountry;\nvarying float vCountry;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vCountry = aCountry;',
    )

    shader.fragmentShader = `${HIGHLIGHT_GLSL}\n${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
      #include <emissivemap_fragment>
      float sfHover = step(abs(vCountry - uHover), 0.5);
      float sfPicked = step(abs(vCountry - uPicked), 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, uHoverTint, sfHover * 0.34);
      diffuseColor.rgb = mix(diffuseColor.rgb, uPickTint, sfPicked * 0.55);
      // A little emission as well as albedo: a selected country that is in
      // shadow has to still look selected, and albedo alone cannot do that.
      totalEmissiveRadiance += uPickTint * sfPicked * 0.22;
      `,
    )
  }

  /*
    Turned well down from where the single merged landmass had it. Against
    seven hand-typed blobs the grain was the only thing giving the land any
    character, so it kept being pushed up; against real borders a strong
    per-fragment noise is itself what reads as pixelation, and it lands hardest
    on the thin coastal detail the outlines exist for.
  */
  /*
    Soft and large, not fine and strong — and the reasoning is worth keeping,
    because the obvious fix here is the wrong one.

    The complaint about this surface was that it looked blocky, and the instinct
    is to raise the frequency until the blocks are too small to see. That cannot
    work. The noise in surface.ts is a value lattice, and surface.ts quite
    correctly fades it out as the cells approach pixel size, so there is a floor
    of roughly three pixels per cell below which there is simply nothing left to
    draw. Chasing finer detail walks straight into that floor and lands on a
    material with no texture at all.

    What actually reads as blocky is contrast, not scale: a lattice cell is only
    visible as a cell when its value differs sharply from its neighbours. Ten
    pixels per cell at a sixth of the previous amplitude gives a surface that
    varies the way a lawn varies — enough that the light finds something, not
    enough that the eye can find the grid. The rest of the map's detail now
    comes from the coastlines, which is where it belongs.
  */
  weather(material, { grain: 9, mottle: 0.15, bump: 0.32, rough: 0.1 })

  // After weather(), which sets its own. This material's shader is not the
  // shared weathered one — it carries the highlight too — so it must not share
  // a program cache entry with it.
  material.customProgramCacheKey = () => 'weathered-countries'
  return material
}
