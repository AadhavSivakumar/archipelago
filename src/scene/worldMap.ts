import * as THREE from 'three'
import { COUNTRIES } from './worldCountries'

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

/**
 * How far the border lines float above the land they outline.
 *
 * Coplanar geometry z-fights, and over a surface this large the fighting shows
 * as the border flickering in and out along its length as the camera moves. A
 * thousandth of a unit is far below anything visible at any zoom this scene
 * allows, and comfortably past the depth buffer's resolution at these near and
 * far planes.
 */
export const BORDER_LIFT = 0.001

/**
 * How far each country stands proud of the sea face.
 *
 * Cut from 0.22, and this is a texture fix rather than a modelling one. The
 * extrusion's side walls are unlit compared with its top, so every coastline
 * carries a dark fringe as wide as the wall projects — and seen 15 degrees off
 * vertical, 0.22 projects to six pixels. Around a coastline made of tens of
 * thousands of small features that is not an edge, it is a texture, and it was
 * a substantial part of what read as the land being noisy. At 0.09 the fringe
 * is two pixels: enough to say the land is raised, not enough to draw.
 */
const RELIEF = 0.09

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
  /**
   * Half-extents of each country in plate-local units, as [halfX, halfZ].
   *
   * What the camera needs in order to frame one. Taken over ALL of a country's
   * rings rather than just its largest, because framing Norway on its mainland
   * alone would cut off Svalbard, and a visitor who clicked a country expects
   * to be shown the country.
   */
  spans: [number, number][]
  /** Country outlines as line segments, for the borders drawn over the land. */
  borders: THREE.BufferGeometry
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
  const spans: [number, number][] = []
  /** Flat [x0,y0,z0, x1,y1,z1, ...] pairs for the border LineSegments. */
  const edges: number[] = []
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

    /*
      Bounds over every ring, and the border segments, in one pass.

      The borders are drawn as lines rather than baked into the land as a darker
      rim, because a rim has to be a fixed width in WORLD units and would then
      be four pixels across at one zoom and forty at another. A line is one
      pixel at every zoom, which is what a border on a map is: a mark that says
      where, not how wide.
    */
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity

    for (const ring of rings) {
      const n = ring.length / 2
      for (let i = 0; i < n; i++) {
        const ax = (ring[i * 2] / 10) * MAP_SCALE
        const az = -(ring[i * 2 + 1] / 10) * MAP_SCALE
        const j = (i + 1) % n
        const bx = (ring[j * 2] / 10) * MAP_SCALE
        const bz = -(ring[j * 2 + 1] / 10) * MAP_SCALE

        if (ax < x0) x0 = ax
        if (ax > x1) x1 = ax
        if (az < z0) z0 = az
        if (az > z1) z1 = az

        // At the land's top face; BORDER_LIFT below floats it clear of it.
        edges.push(ax, RELIEF, az, bx, RELIEF, bz)
      }
    }

    spans.push([(x1 - x0) / 2, (z1 - z0) / 2])
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

  const borders = new THREE.BufferGeometry()
  borders.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges), 3))
  borders.computeBoundingSphere()

  return { geometry, faceCountry, centres, spans, borders }
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
    /*
      Exempt from fog, along with the rest of the plate — see the note on the
      haze in Scene.tsx.

      The fog that dissolves the world while the map is being read has to reach
      full opacity within about eleven units to swallow the hedge, and the
      plate's own far corners are twelve from the same camera. There is no pair
      of near/far values that hides one and spares the other. Turning fog off
      for the surfaces that make up the map removes the conflict entirely: the
      haze can then be as tight as it needs to be, and the projection stays
      exactly as crisp as it was.
    */
    fog: false,
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
    No weathering at all on the land, and that is the end of a long argument
    with this surface.

    It was tuned coarse, then fine, then nearly flat, and each version was worse
    than it sounded because the premise was wrong. A map's land is a FILL. Every
    mark on it that is not a coastline or a border competes with the only two
    things on the plate that carry meaning — which is exactly why making the
    texture more detailed kept making the map look worse. The per-country tint
    baked into the vertex colours distinguishes one country from the next using
    flat fields, which is how maps have always done it, and the borders drawn
    over the top do the rest.

    This also drops the four-octave noise and the screen-space derivatives from
    the most-covered surface in the view, which is the cheapest fragment shader
    this district has ever had.
  */

  // After weather(), which sets its own. This material's shader is not the
  // shared weathered one — it carries the highlight too — so it must not share
  // a program cache entry with it.
  material.customProgramCacheKey = () => 'weathered-countries'
  return material
}

/**
 * The line the borders are drawn with.
 *
 * LineBasicMaterial's `linewidth` is ignored by every WebGL implementation —
 * the spec allows only 1.0 — and that is the right answer here anyway. One
 * device pixel is a hairline on a 2x display and stays a hairline however far
 * the camera comes in, which is what a border on a map should do. Drawing them
 * as thick geometry instead would mean choosing a world width, and a world
 * width is wrong at every zoom except the one it was chosen for.
 *
 * Unlit on purpose: a border is a notation, not a thing in the scene, and a
 * border that dims as the sun moves off it reads as a scratch.
 */
export const BORDER_MATERIAL = new THREE.LineBasicMaterial({
  color: '#2b4a34',
  transparent: true,
  opacity: 0.55,
  // Unfogged with the land it divides; see landMaterial.
  fog: false,
})
