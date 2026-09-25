import { use, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import {
  islandGeometry,
  islandLodGeometry,
  islandOccluderGeometry,
  ISLAND_DEPTH_MATERIAL,
  ISLAND_DETAIL_MATERIAL,
  ISLAND_LOD_MATERIAL,
  ISLAND_MATERIAL,
  PATCH_HOLE,
  patchGeometry,
  uHole,
} from './terrain'
import { DISTRICTS, districtCentre, type DistrictId } from './districts'
import { setCursor } from './cursor'
import { uTime, water } from '../shaders/water'

/**
 * How near a click has to land to count as picking a district, in world units.
 *
 * The islands are 24-26 units across and their centres are 40-90 apart, so 26
 * covers a district's own island generously without ever reaching a
 * neighbour's. Clicks on the open mainland or on an uninhabited islet fall
 * outside every radius and do nothing, which is the right answer: there is
 * nothing there to go to.
 */
const PICK_RADIUS = 26

/** The district whose island a world-space point falls on, if any. */
function nearestDistrict(x: number, z: number): DistrictId | null {
  let best: DistrictId | null = null
  let bestDist = PICK_RADIUS

  for (const d of DISTRICTS) {
    const [cx, cz] = districtCentre(d)
    const dist = Math.hypot(x - cx, z - cz)
    if (dist < bestDist) {
      bestDist = dist
      best = d.id
    }
  }

  return best
}

type IslandProps = {
  /**
   * Owned by Scene, because the district labels raycast their occlusion against
   * it — a label on the far side of the island has to know the landmass is in
   * the way. See islandOccluderGeometry for why this is a proxy and not the
   * mesh you can actually see.
   */
  occluderRef: RefObject<THREE.Mesh>
  /** Called when the visitor clicks the ground inside a district's island. */
  onPick: (id: DistrictId) => void
  /** Skip the reveal: the visitor arrived pointed at a district already. */
  deepLinked: boolean
  /**
   * Swap to the coarse island. Set while the camera is down on the world map,
   * where the land is scenery behind a document rather than the subject.
   */
  lowDetail: boolean
  /**
   * Stop drawing the land at all. Set only once the haze has already dissolved
   * it to a flat colour, so this is never a visible change — see Scene's
   * `stripped`.
   */
  hidden: boolean
  /**
   * The district to lay dense ground under, if any: the one the camera is
   * down at. Null from the home view, where nothing is near enough to need
   * it, and on the map, where the land is not the subject.
   */
  detail: DistrictId | null
  /** True while the camera is in flight; the patch is not swapped in then. */
  flying: boolean
}

/** A triangle nobody will ever see, so the patch's program is compiled at startup. */
const PRELOAD_TRI = new THREE.BufferGeometry().setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0, 0.01]), 3),
)

/**
 * Dense ground under one district — see patchGeometry. Built on a worker
 * when the district is focused, so it arrives a beat into the flight rather
 * than stalling it; kept once built; and while it is in place, the coarse
 * mesh is cut away beneath it.
 */
function DetailPatch({ id, flying }: { id: DistrictId; flying: boolean }) {
  const d = DISTRICTS.find((x) => x.id === id)!
  const gl = useThree((s) => s.gl)
  const [built, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  /*
    Built during the flight, swapped in once it lands, and kept through any
    hops within the district after that. Swapping mid-flight costs a frame —
    the geometry upload and a shadow-map pass — and a stall in the middle of
    a camera move is the one place it shows.
  */
  const [landed, setLanded] = useState(false)
  useEffect(() => setLanded(false), [id])
  useEffect(() => {
    if (built && !flying) setLanded(true)
  }, [built, flying])
  const geometry = landed ? built : null

  useEffect(() => {
    let live = true
    setGeometry(null)
    patchGeometry(id, d.x, d.z).then((built) => {
      if (live) setGeometry(built)
    })
    return () => {
      live = false
    }
  }, [id, d])

  useEffect(() => {
    if (!geometry) return
    uHole.value.set(d.x, d.z, PATCH_HOLE, 1)
    // The shadow map is frozen once the reveal settles; one more pass, so
    // the fine ground casts and receives what the coarse one did.
    gl.shadowMap.needsUpdate = true
    return () => {
      uHole.value.w = 0
      gl.shadowMap.needsUpdate = true
    }
  }, [geometry, d, gl])

  if (!geometry) return null
  return <mesh geometry={geometry} material={ISLAND_DETAIL_MATERIAL} receiveShadow castShadow />
}

/**
 * The landmass. GSAP owns the group's `scale.y` for the intro reveal and
 * nothing else writes it, so the island grows out of the sea once and stays put.
 *
 * The reveal drives the GROUP rather than the visible mesh so the invisible
 * raycast proxy rises with it. Scaling only the mesh would leave labels
 * occluding against a full-height mountain for the first two seconds, while the
 * island the visitor can see is still flat.
 */
export function Island({ occluderRef, deepLinked, onPick, lowDetail, hidden, detail, flying }: IslandProps) {
  const group = useRef<THREE.Group>(null!)

  /*
    The display mesh is built on a worker, so this suspends until it arrives —
    the nearest <Suspense> is in Scene, which lets the sky, the ocean and the
    ambient layer paint immediately instead of the page holding a blank canvas
    for the ~390ms the build takes.

    islandGeometry() caches its promise, so re-rendering (StrictMode renders
    this twice on purpose) resolves against the same one rather than suspending
    forever on a fresh promise each pass.
  */
  const geometry = use(islandGeometry())

  // The occluder stays synchronous: it is cheap, and the labels raycast against
  // it from the frame they mount.
  const occluder = useMemo(() => islandOccluderGeometry(), [])

  useGSAP(() => {
    const g = group.current
    if (!g) return
    // Already there — either because motion is unwelcome, or because the
    // visitor followed a link to a district and the island growing out of the
    // sea underneath them is not the shot they asked for.
    if (REDUCED_MOTION || deepLinked) {
      gsap.set(g.scale, { y: 1 })
      return
    }
    gsap.set(g.scale, { y: 0.02 })
    gsap.to(g.scale, { y: 1, duration: 2.2, ease: EASE.entrance })
  }, [deepLinked])

  return (
    <group ref={group}>
      {/*
        Both islands exist; only one is drawn. Swapping `visible` rather than
        unmounting keeps the reveal's GSAP timeline pointed at a stable object
        and avoids rebuilding a half-million-triangle BufferGeometry the worker
        spent 390ms on. The coarse one is built once, on the first frame it is
        needed, and kept.

        Neither is hidden outright any more. With nothing behind the plate, rays
        that miss it reach the sky sphere, whose underside is near-white — the
        map sat in a bright void rather than on an island.
      */}
      <mesh
        geometry={geometry}
        material={ISLAND_MATERIAL}
        customDepthMaterial={ISLAND_DEPTH_MATERIAL}
        visible={!lowDetail && !hidden}
        receiveShadow
        castShadow
      />
      {detail && !lowDetail && !hidden && <DetailPatch id={detail} flying={flying} />}
      {/* Present from the start so <Preload all> compiles the patch's program
          during the boot screen rather than mid-flight, the first time one is
          drawn. Two hundred units under the sea. */}
      <mesh geometry={PRELOAD_TRI} material={ISLAND_DETAIL_MATERIAL} position={[0, -200, 0]} />
      {/*
        Mounted always, drawn only on the map. If this mesh only existed once
        the camera had arrived, its program would compile and its 47k vertices
        would upload on the first frame it was drawn — which is mid-flight, on
        the way into the Garden, and is a stall exactly where one is most
        visible. Present from the start, <Preload all> in Scene compiles it and
        uploads it with everything else, during the boot screen.
      */}
      <mesh
        geometry={islandLodGeometry()}
        material={ISLAND_LOD_MATERIAL}
        visible={lowDetail && !hidden}
        receiveShadow
      />
      {/*
        Never drawn — a raycast target only. three does not consult `visible`
        when raycasting (Raycaster.intersect checks layers, Mesh.raycast never
        reads it), and Mesh supplies a default material, which is all the
        raycast needs. Being invisible also keeps it out of the shadow pass.

        It carries the ground click as well as the label occlusion, and it is
        the right mesh for both. The display mesh beside it is half a million
        triangles with no BVH; putting a pointer handler on THAT would make
        every mouse move raycast it, which was measured at 26ms — more than a
        whole frame's budget spent deciding whether the cursor is over grass.
        This proxy answers the same question in under 2ms.
      */}
      <mesh
        ref={occluderRef}
        geometry={occluder}
        visible={false}
        onClick={(e) => {
          const id = nearestDistrict(e.point.x, e.point.z)
          if (!id) return
          e.stopPropagation()
          onPick(id)
        }}
        /*
          The ground is clickable over a district's island and inert everywhere
          else, and nothing on screen distinguishes the two — so the cursor has
          to. onPointerMove rather than onPointerOver, because the answer
          depends on WHERE on this one mesh the pointer is, and `over` fires
          once on entry and never again as it crosses from a district's island
          out to open mainland.

          R3F fires move after the out/over pair within a single pointermove, so
          leaving a landmark onto the island beneath it ends with this handler
          having the last word rather than the landmark's onPointerOut.
        */
        onPointerMove={(e) => {
          setCursor(nearestDistrict(e.point.x, e.point.z) ? 'pointer' : '')
        }}
        onPointerOut={() => setCursor('')}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

// Wide enough that its edge is always past the fog's far plane — otherwise the
// horizon shows a square rim of ocean. Grown with the world: the terrain now
// reaches ±460, and on a narrow viewport framing.ts scales the fog out too.
/*
  256 segments rather than 400: 131,000 triangles instead of 320,000.

  The plane stays 1600 units across, because it has to reach past the fog's far
  plane or the horizon shows a square rim of ocean. Only the sampling changes,
  from 4-unit quads to 6.25.

  That is under Nyquist for the swell as it was, so the swell changed with it —
  the 0.46 component, a 13.6-unit wavelength that needed four-unit quads to
  carry, is gone from shaders/water.ts. What it contributed is now the coarsest
  of the per-fragment chop terms, which costs no vertices at all.
*/
const WATER_GEOMETRY = new THREE.PlaneGeometry(1600, 1600, 256, 256)
WATER_GEOMETRY.rotateX(-Math.PI / 2)

/*
  Roughness raised from 0.08, which sounds like the wrong direction for water
  and is not. At 0.08 the surface is a near-mirror, and what it was mirroring
  was a 256px procedural environment with almost no structure in it — so every
  wave face returned the same blue and the whole ocean collapsed to one flat
  value. A rougher surface spreads each reflection over a lobe instead, which
  lets neighbouring wave faces return visibly different amounts of sky and
  gives the swell its shading back. The deeper base colour then reads as water
  with depth under it rather than as painted board.
*/
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#12496f',
  roughness: 0.22,
  metalness: 0.5,
  transparent: true,
  opacity: 0.94,
})

// The wave itself now lives in src/shaders/water.ts, because the island's foam
// band and the drifting boat have to agree with it exactly.
/*
  chopStrength 1.7 rather than 1. The ripple used to be applied in the wrong
  basis, which spread it across axes it did not belong on and made it look
  busier than it was; corrected, the same numbers read noticeably calmer. This
  puts the apparent texture back where it was, honestly this time.
*/
water(WATER_MATERIAL, { swell: true, chopStrength: 1.7 })

export function Water({ visible }: { visible: boolean }) {
  useFrame((state) => {
    uTime.value = state.clock.elapsedTime
  })

  // Deliberately not a shadow receiver: the depth pass renders the *undisplaced*
  // plane (onBeforeCompile does not touch the depth material), so the waves
  // self-shadow against their own flat shadow map and the whole ocean goes dark.
  return <mesh geometry={WATER_GEOMETRY} material={WATER_MATERIAL} visible={visible} />
}
