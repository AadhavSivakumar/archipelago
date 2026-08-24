import { use, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import {
  islandGeometry,
  islandLodGeometry,
  islandOccluderGeometry,
  ISLAND_LOD_MATERIAL,
  ISLAND_MATERIAL,
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
export function Island({ occluderRef, deepLinked, onPick, lowDetail }: IslandProps) {
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
        visible={!lowDetail}
        receiveShadow
        castShadow
      />
      {lowDetail && (
        <mesh geometry={islandLodGeometry()} material={ISLAND_LOD_MATERIAL} receiveShadow />
      )}
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
const WATER_GEOMETRY = new THREE.PlaneGeometry(1600, 1600, 400, 400)
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
