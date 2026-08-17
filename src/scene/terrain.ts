import * as THREE from 'three'
import { weather } from './surface'
import { uTime, WAVE_GLSL } from '../shaders/water'
import { DISTRICTS } from './districts'
import { buildGridArrays, GRID_X, GRID_Z, shadeTerrain, type Palette } from './terrainField'

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
  Resolution of the stand-in used while the camera is down on the world map.

  452 x 576 against 128 x 164 is a twelfth of the vertices and a twelfth of the
  triangles. That ratio is the point: with the camera five to fourteen units
  above a plate twelve units across, the island is peripheral — most of it is
  outside the frustum, and a single mesh is submitted whole whether or not its
  triangles land on screen. Half a million vertices transformed every frame to
  draw the strip of grass around a map is the definition of paying for detail
  nobody is looking at.

  Not a further reduction than this, because the coastline is still in shot at
  the edges of the frame and its silhouette is what a coarser grid loses first.
*/
const LOD_X = 128
const LOD_Z = 164

let lodBuilt: THREE.BufferGeometry | null = null

/**
 * A coarse island, for when the map is the subject.
 *
 * Synchronous and lazy. Unlike the display mesh this is roughly 20k vertices
 * rather than 260k, which measures in single-digit milliseconds — not worth a
 * worker round trip, and it is built at most once per session, the first time
 * the camera drops below the switch threshold.
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
 * Unweathered, and that is most of the saving. The grain in surface.ts is four
 * octaves of value noise plus screen-space derivatives per fragment, which is
 * by some distance the most expensive shader in the scene; dropping it matters
 * more than the triangle count does, because the fragments it covers are the
 * ones nearest the camera. Same vertex colours, so the land keeps its palette
 * and only loses its texture.
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

    worker.postMessage({ segX: GRID_X, segZ: GRID_Z, palette: PALETTE })
  })

  return pending
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

/* Weathered at a scale the vertex grid cannot reach — see the note by the
   weather() call further down, which has to run after the foam patch below. */
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

  The grid is 452x576, and it is graded rather than uniform: the parameter
  range is +/-90 by +/-115 and grade() expands it cubically out to +/-600 by
  +/-900. So the quads are about 0.4 units at the centre of the archipelago,
  roughly 0.75 at the edge of a district island, and 1.7 by the time the
  mainland is 80 units out — fine near the camera, and coarser exactly where
  the fog is already taking it.

  Even 0.4 units is a long way above the scale at which a surface stops looking
  like a surface, and there is no way to close that with geometry: halving the
  quad quadruples a mesh that already takes 390ms to build. Everything finer
  than a quad has to come from the shader, and this is where it comes from.

  Applied here rather than at the declaration above on purpose: weather()
  chains onto whatever onBeforeCompile a material is carrying when it is
  called, and the foam patch is installed by plain assignment. Weathering first
  would have the foam assignment overwrite it outright, silently, with the only
  symptom being terrain that stays smooth.
*/
weather(ISLAND_MATERIAL, { grain: 0.85, mottle: 0.3, bump: 0.85, rough: 0.16 })
