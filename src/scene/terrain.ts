import * as THREE from 'three'
import { weather } from './surface'
import { uTime, WAVE_GLSL } from '../shaders/water'
import { DISTRICTS } from './districts'
import { buildGridArrays, buildPatchArrays, GRID_X, GRID_Z, shadeTerrain, type Palette } from './terrainField'
import type { TerrainRequest } from './terrain.worker'

// Re-exported so the rest of the scene keeps importing the height field from
// here — splitting the file is an implementation detail of the worker.
export { sampleHeight } from './terrainField'

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const rgb = (hex: string) => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

/**
 * The colour ramp, converted here rather than in the worker.
 *
 * THREE.Color applies the sRGB to linear-sRGB transform on construction, and
 * the material reads vertex colours in that working space. Converting with
 * three and shipping the resulting linear triples keeps the colours identical
 * to the synchronous version, without the worker needing three to say so.
 *
 * DEEP is matched to the water's own colour so the sea floor is
 * indistinguishable from open ocean through the 93%-opaque surface.
 */
/*
  Pulled well back from where these started.

  The greens were #5f8f4e and #3b6a3c — the saturation you would pick off a
  colour wheel for "grass" and "forest", and they made the islands read as
  moulded green plastic. Vegetation seen across water is never that pure: it is
  greyed by the air between, and it carries far more yellow, brown and olive
  than the word "green" suggests. ACES tone mapping compounds the problem,
  because it holds saturation into the highlights instead of rolling it off the
  way an untonemapped buffer did.

  The sand went the same way. #d9caa5 rendered as a piped band of cream icing
  around every island; real beach is darker, greyer and browner than people
  remember it being.
*/
const PALETTE: Palette = {
  deep: rgb('#1d5f8c'),
  wet: rgb('#6d6650'),
  sand: rgb('#c0b18e'),
  grass: rgb('#77895b'),
  forest: rgb('#4c6244'),
  /*
    Cooled from #7f776a. That was a warm grey, and once the hue drift in
    shadeTerrain pushed patches of it further toward red the Alps stopped
    reading as a mountain and started reading as a sand dune — which is a
    problem the geometry could not have fixed, because the shape was right and
    only the colour was wrong. Rock at altitude is grey with blue in it.
  */
  rock: rgb('#71737a'),
  snow: rgb('#eef2f8'),
  districts: DISTRICTS.map((d) => rgb(d.color)),
}

type TerrainArrays = {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint32Array
}

function assemble(r: TerrainArrays) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(r.colors, 3))
  geo.setIndex(new THREE.BufferAttribute(r.index, 1))
  geo.computeBoundingSphere()
  return geo
}

/*
  Resolution of the island drawn while the camera is down on the world map.

  452x576 against 192x246 is a fifth of the vertices. That is the point: with
  the camera ten units above a plate twelve units across, the land is scenery —
  most of it is outside the frustum, and a single mesh is submitted whole
  whether or not its triangles land on screen.

  Sized against the camera rather than picked round. The grid is graded, so a
  quad's world size depends where it is; at the Garden's own position, 128 gives
  a 3.8-unit quad, which from ten units up is enormous — the coarse island read
  as a handful of flat facets with hard silhouette edges rather than as
  low-detail ground. 192 brings that to 2.5 units, which under the fog this view
  applies is soft enough not to draw the eye.

  It is drawn rather than hidden because hiding it was worse. With nothing
  behind the plate the rays that miss it reach the sky sphere, and the underside
  of a Preetham sky is near-white — so the map sat in a bright void. A coarse
  island under heavy fog gives it somewhere to be.
*/
const LOD_X = 192
const LOD_Z = 246

let lodBuilt: THREE.BufferGeometry | null = null

/**
 * A coarse island, for when the map is the subject.
 *
 * Synchronous and lazy: about 21k vertices rather than 260k, which is
 * single-digit milliseconds — not worth a worker round trip, and built at most
 * once per session, the first time the camera drops onto the map.
 */
export function islandLodGeometry() {
  if (lodBuilt) return lodBuilt
  const { positions, index } = buildGridArrays(LOD_X, LOD_Z)
  const { normals, colors } = shadeTerrain(positions, index, PALETTE)
  lodBuilt = assemble({ positions, normals, colors, index })
  return lodBuilt
}

/**
 * The plain material the coarse island wears.
 *
 * Unweathered, and that is most of the saving: the grain in surface.ts is four
 * octaves of value noise plus screen-space derivatives per fragment, by some
 * distance the most expensive shader in the scene. Same vertex colours, so the
 * land keeps its palette and loses only its texture — which under the fog this
 * view applies is not visible anyway.
 */
export const ISLAND_LOD_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0,
})

/** The synchronous path, kept as the fallback for when a worker cannot start. */
function buildIslandGeometrySync() {
  const { positions, index } = buildGridArrays(GRID_X, GRID_Z)
  const { normals, colors } = shadeTerrain(positions, index, PALETTE)
  return assemble({ positions, normals, colors, index })
}

let pending: Promise<THREE.BufferGeometry> | null = null

/**
 * The island mesh, built on a worker.
 *
 * This is ~390ms of arithmetic: the height field, then vertex normals over half
 * a million triangles, then the colour ramp. Run on the main thread it lands
 * AFTER React's first commit, which is precisely the worst moment — the boot
 * screen in index.html has already been cleared by then, so the block is spent
 * showing an empty canvas rather than the loading state that exists for it.
 *
 * Off-thread, the page paints sky and ocean immediately and the island arrives
 * when it is ready. The four arrays come back as transferables, so the handover
 * is a pointer move rather than a multi-megabyte copy.
 *
 * The promise is cached because React may render Island more than once —
 * StrictMode does so deliberately — and `use()` needs a stable promise or the
 * component re-suspends forever on a fresh one.
 */
export function islandGeometry(): Promise<THREE.BufferGeometry> {
  if (pending) return pending

  pending = new Promise<THREE.BufferGeometry>((resolve) => {
    let worker: Worker
    try {
      // This exact `new URL(..., import.meta.url)` form is what Vite detects in
      // order to emit the worker as its own chunk; a computed path is not
      // bundled and would 404 in the production build.
      worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
    } catch (reason) {
      console.warn('Terrain worker unavailable, building on the main thread:', reason)
      resolve(buildIslandGeometrySync())
      return
    }

    const fallBackToMainThread = (reason: unknown) => {
      console.warn('Terrain worker failed, building on the main thread:', reason)
      worker.terminate()
      resolve(buildIslandGeometrySync())
    }

    worker.onmessage = (event: MessageEvent<TerrainArrays>) => {
      worker.terminate()
      resolve(assemble(event.data))
    }
    worker.onerror = fallBackToMainThread
    worker.onmessageerror = fallBackToMainThread

    const request: TerrainRequest = { kind: 'grid', segX: GRID_X, segZ: GRID_Z, palette: PALETTE }
    worker.postMessage(request)
  })

  return pending
}

// ---------------------------------------------------------------------------
// The detail patch
// ---------------------------------------------------------------------------

/** Half-width of the square of dense ground under a focused district. */
export const PATCH_HALF = 34
/** Just over a quarter of a unit between vertices: 58k of them, 115k
    triangles, about three hundred milliseconds on a worker. */
const PATCH_SEG = 240
/** The rim over which the patch eases to the coarse mesh's own heights. */
const PATCH_BLEND = 5
/**
 * Half-width of the hole cut in the coarse mesh under the patch: inside the
 * rim, so the coarse mesh is gone everywhere the patch is still the field,
 * and the two overlap only where the patch has begun to match it.
 */
export const PATCH_HOLE = PATCH_HALF - PATCH_BLEND + 1

/**
 * Where the coarse mesh is cut away: x, z, half-width, and whether at all.
 * Written by the Island when a patch is in place; read by the island's colour
 * and depth shaders alike, so the shadow pass has the same hole and the coarse
 * ground under the patch cannot shadow it.
 */
export const uHole = { value: new THREE.Vector4(0, 0, 0, 0) }

const patches = new Map<string, Promise<THREE.BufferGeometry>>()

/**
 * The dense ground under a district, built on a worker and kept.
 *
 * Kept, up to three: coming back to a district should not cost the build
 * again, and three is enough for the pair the visitor is moving between plus
 * the one before. The oldest is let go when a fourth arrives.
 */
export function patchGeometry(key: string, cx: number, cz: number): Promise<THREE.BufferGeometry> {
  const cached = patches.get(key)
  if (cached) return cached

  const built = new Promise<THREE.BufferGeometry>((resolve) => {
    const started = performance.now()
    let worker: Worker
    try {
      worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
    } catch (reason) {
      console.warn('Terrain worker unavailable for the detail patch:', reason)
      const { positions, index } = buildPatchArraysSync(cx, cz)
      const { normals, colors } = shadeTerrain(positions, index, PALETTE)
      resolve(assemble({ positions, normals, colors, index }))
      return
    }
    worker.onmessage = (event: MessageEvent<TerrainArrays>) => {
      worker.terminate()
      console.info(`[archipelago] detail patch ${key} built in ${(performance.now() - started).toFixed(0)}ms`)
      resolve(assemble(event.data))
    }
    worker.onerror = (reason) => {
      console.warn('Terrain worker failed for the detail patch:', reason)
      worker.terminate()
      const { positions, index } = buildPatchArraysSync(cx, cz)
      const { normals, colors } = shadeTerrain(positions, index, PALETTE)
      resolve(assemble({ positions, normals, colors, index }))
    }
    const request: TerrainRequest = { kind: 'patch', cx, cz, half: PATCH_HALF, seg: PATCH_SEG, blend: PATCH_BLEND, palette: PALETTE }
    worker.postMessage(request)
  })

  patches.set(key, built)
  if (patches.size > 3) {
    const oldest = patches.keys().next().value!
    patches.get(oldest)!.then((geometry) => geometry.dispose())
    patches.delete(oldest)
  }
  return built
}

function buildPatchArraysSync(cx: number, cz: number) {
  return buildPatchArrays(cx, cz, PATCH_HALF, PATCH_SEG, PATCH_BLEND)
}

/**
 * Coarse enough to be cheap, fine enough to keep the silhouette honest.
 *
 * Deliberately NOT scaled with the world: this is raycast six times on every
 * frame the camera moves, and its cost is linear in triangle count.
 */
const OCCLUDER_X = 64
const OCCLUDER_Z = 82

function buildOccluderGeometry() {
  // Positions and index only — this mesh is never drawn, so it needs neither
  // normals nor colours. At 65 x 83 vertices it is a few milliseconds, which is
  // why it stays on the main thread while the display mesh does not: it has to
  // exist the moment the labels do.
  const { positions, index } = buildGridArrays(OCCLUDER_X, OCCLUDER_Z)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))

  // Both matter for raycast cost. Mesh.raycast tries a bounding-box reject
  // before touching triangles, but guards it with `boundingBox !== null` — and
  // nothing computes it unless asked, so without this the reject never fires.
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

let occluderBuilt: THREE.BufferGeometry | null = null

/**
 * A coarse stand-in for the island, used only as a raycast target.
 *
 * drei's `<Html occlude>` re-tests a label whenever its projected position
 * moves more than 0.001 *pixels* — so every frame of every camera flight, every
 * orbit drag, and the ~2s of OrbitControls damping that follows one. Against
 * the display mesh that is half a million triangles times six labels, with no
 * BVH: measured at 26ms of main-thread JS per frame, more than the entire 60fps
 * budget spent answering a yes/no question.
 */
export function islandOccluderGeometry() {
  occluderBuilt ??= buildOccluderGeometry()
  return occluderBuilt
}

/** The hole in the coarse mesh, as GLSL: a square, in the island's own XZ. */
const HOLE_GLSL = /* glsl */ `
  if (uHole.w > 0.5 && max(abs(vLocalPos.x - uHole.x), abs(vLocalPos.z - uHole.y)) < uHole.z) discard;
`

/**
 * The island's material, made twice: once for the coarse mesh, which has a
 * hole cut in it wherever a detail patch sits, and once for the patch itself,
 * which has none but is pulled a hair toward the camera so that in the rim
 * where the two overlap it is the patch that shows.
 *
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
function islandMaterial(withHole: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    if (withHole) shader.uniforms.uHole = uHole

    shader.vertexShader = `varying vec3 vLocalPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vLocalPos = position;',
    )

    shader.fragmentShader = `uniform float uTime;\n${withHole ? 'uniform vec4 uHole;\n' : ''}varying vec3 vLocalPos;\n${WAVE_GLSL}\n${shader.fragmentShader}`
      // First thing in main, so a discarded fragment costs nothing more.
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${withHole ? HOLE_GLSL : ''}`)
      .replace(
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
      float foam = 1.0 - smoothstep(0.0, 0.7, abs(vLocalPos.y - surface));
      // Narrower and weaker, and tinted rather than white. At 1.1 units and 60%
      // toward white every island wore a hard bright ring, which is most of
      // what made them read as moulded plastic.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.92), foam * 0.34);
    `,
      )
  }

  /*
    Grain below the reach of the vertex grid.

    Even a quarter of a unit is a long way above the scale at which a surface
    stops looking like a surface, and there is no way to close that with
    geometry. Everything finer than a quad has to come from the shader, and
    this is where it comes from.

    Applied here rather than at the declaration on purpose: weather() chains
    onto whatever onBeforeCompile a material is carrying when it is called,
    and the foam patch is installed by plain assignment. Weathering first
    would have the foam assignment overwrite it outright, silently, with the
    only symptom being terrain that stays smooth.

    Four octaves now, where it was three: the per-octave footprint fade in
    surface.ts means the fourth costs only the fragments close enough to
    resolve it, which is the detail patch under the camera and nothing else.
  */
  weather(material, { grain: 0.85, mottle: 0.24, bump: 0.65, rough: 0.16, octaves: 4 })
  // Different source, so never the same compiled program.
  material.customProgramCacheKey = () => `island-${withHole ? 'coarse' : 'patch'}`
  return material
}

export const ISLAND_MATERIAL = islandMaterial(true)

export const ISLAND_DETAIL_MATERIAL = islandMaterial(false)
ISLAND_DETAIL_MATERIAL.polygonOffset = true
ISLAND_DETAIL_MATERIAL.polygonOffsetFactor = -1
ISLAND_DETAIL_MATERIAL.polygonOffsetUnits = -2

/**
 * The coarse mesh's depth, for the shadow pass, with the same hole.
 *
 * Without it the coarse ground under a patch would still be in the shadow
 * map, and wherever it lay a hair above the patch's surface — which, being
 * a coarser sampling of the same field, it does half the time — the patch
 * would be in its shadow: a mottle of dark splotches that is not there.
 */
export const ISLAND_DEPTH_MATERIAL = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
ISLAND_DEPTH_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uHole = uHole
  shader.vertexShader = `varying vec3 vLocalPos;\n${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  vLocalPos = position;',
  )
  shader.fragmentShader = `uniform vec4 uHole;\nvarying vec3 vLocalPos;\n${shader.fragmentShader}`.replace(
    '#include <clipping_planes_fragment>',
    `#include <clipping_planes_fragment>${HOLE_GLSL}`,
  )
}
ISLAND_DEPTH_MATERIAL.customProgramCacheKey = () => 'island-depth-hole'
