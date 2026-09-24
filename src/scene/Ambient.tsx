import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { weather } from './surface'
import { waveHeight } from '../shaders/water'

/*
  Life around the archipelago.

  The problem this solves: at the default framing the camera parks around 67
  units out, where the small per-landmark rotations are close to invisible, and
  the water shader is the entire ambient motion of the world. The island reads
  as a model rather than a place.

  The constraint that shapes all of it: fog is distance-based, [95, 300] scaled
  by the viewport (Scene.tsx). Anything past the far plane is fully fog-coloured
  and therefore invisible, and anything nearer than the near plane is unfogged
  and reads as a cut-out. So everything here lives between those two numbers,
  and the clouds in particular sit where the fog is thick enough to soften them.

  The second constraint is the frustum: the home shot looks down, so there is a
  ceiling on what is on-screen at all. Both are measured, not guessed — an
  earlier version of this file put the clouds at a height that was never once
  inside the home frustum on a 16:9 viewport.

  Everything is module-scope geometry and one material per kind, and each family
  is a single <Instances> — a scene this size should not spend draw calls on
  scenery.
*/

// ---------------------------------------------------------------------------
// Deterministic placement, matching the rest of the scene's approach.
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Clouds
// ---------------------------------------------------------------------------

/** Flattened spheres rather than textured planes: no texture to fetch, and a
 *  billboard quad without one reads as a card, not a cloud. */
/*
  16x10, down from 28x20. Eighty-two lobes are drawn, so this was 87,000
  triangles of soft translucent blob seen from at least 250 units away and
  through most of the fog. At 300 triangles each the silhouette is the same once
  the material's 0.46 opacity has had its way with it.
*/
const CLOUD = new THREE.SphereGeometry(1, 16, 10)
const CLOUD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#f6f9fd',
  roughness: 1,
  metalness: 0,
  transparent: true,
  // Lower than before: lobes overlap, and the overlaps are what give a cloud
  // its density. At 0.62 each the stacked centres went solid.
  // Raised from 0.34: at 250-440 units the fog already takes most of them,
  // and what came through was too faint to register as sky at all.
  opacity: 0.46,
  // Depth-write off so overlapping puffs in one cloud do not cut each other.
  depthWrite: false,
})

/**
 * Clouds, as clusters of overlapping lobes rather than one squashed sphere
 * each.
 *
 * A single ellipsoid reads as a lozenge no matter how many segments it has —
 * smoothness is not the same thing as shape. What makes a cloud legible is an
 * irregular, heaped silhouette, which costs nothing here: every lobe of every
 * cloud is an instance of the same sphere, so the whole sky is still one draw
 * call.
 *
 * Lobes shrink and sag toward the ends of each cloud, so the mass piles up in
 * the middle instead of running as an even sausage.
 */
const CLOUD_LOBES = (() => {
  const rand = rng(0xc10d)
  const lobes: {
    position: [number, number, number]
    scale: [number, number, number]
    rotation: number
  }[] = []

  for (let i = 0; i < 16; i++) {
    const angle = rand() * Math.PI * 2
    /*
      Height derived from the framing rather than chosen, because a downward-
      looking camera leaves only a sliver of sky and a guess lands outside it
      every time. This has now been wrong in both directions: at y=28-36 the
      clouds were below the horizon and painted as grey scum across the water,
      and the correction to y=96-142 overshot so far that all thirteen sat above
      the top of the frame and the sky was simply empty.

      So: the home camera sits at y=40 and looks from z=92 toward z=-30, which
      is 14.7 degrees below horizontal, and the vertical fov is 42. The top of
      the frustum is therefore 21 - 14.7 = 6.3 degrees ABOVE horizontal, and
      anything at a lower elevation than 0 is below the horizon line. The whole
      sky this scene has is that 6.3-degree band.

      Placing them at a fixed 3.55 degrees — the middle of the band — makes the
      height a function of the distance rather than an independent number, so
      near and far clouds sit on the same line of sight instead of stacking. It
      also means this stays correct if the ring is widened: only the elevation
      is a constant, and it is the one with a stated reason.

      The radius is bounded by the fog, not by the frustum. Fog runs 200-560, so
      at 250-440 the clouds come through at roughly 15-65 percent haze — present
      as sky, never as hard white shapes pasted over the horizon.
    */
    const radius = 250 + rand() * 190
    const cx = Math.cos(angle) * radius
    const cz = Math.sin(angle) * radius
    // Spread across 2.6-4.9 degrees rather than pinned to one. A single
    // elevation put every cloud on one ruled line above the horizon, which
    // reads as a band rather than as weather; a range keeps them stacked in
    // depth without letting any of them leave the sliver.
    const cy = 40 + radius * (0.045 + rand() * 0.04)
    // Wider than before: at 250+ units out, a 34-unit puff is a smudge.
    const width = 46 + rand() * 54
    const heading = rand() * Math.PI
    const count = 4 + Math.floor(rand() * 4)

    for (let k = 0; k < count; k++) {
      // -1 at one end of the cloud, +1 at the other.
      const t = count === 1 ? 0 : (k / (count - 1) - 0.5) * 2
      const taper = t * t
      const size = (1 - 0.5 * taper) * (0.62 + rand() * 0.5)
      const along = t * width * 0.75 + (rand() - 0.5) * 4

      lobes.push({
        position: [
          cx + Math.cos(heading) * along + (rand() - 0.5) * 5,
          cy - taper * 2.4 + (rand() - 0.5) * 2.2,
          cz + Math.sin(heading) * along + (rand() - 0.5) * 5,
        ],
        scale: [width * 0.4 * size, width * 0.16 * size, width * 0.33 * size],
        rotation: rand() * Math.PI,
      })
    }
  }
  return lobes
})()

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------

/*
  Birds are specks, not shapes.

  At 0.6 radius in a dark slate they rendered as black diamonds hanging in the
  middle distance — closer to debris on the lens than to wildlife. Distant birds
  read almost entirely as a small, soft, moving mark; the geometry only has to
  not be a square. Smaller, lighter, and pushed further out and higher.
*/
const BIRD = new THREE.TetrahedronGeometry(0.22, 1)
const BIRD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#6b7686',
  roughness: 0.95,
  // Unlit enough not to flash bright when the sun catches a facet.
  metalness: 0,
})

const BIRDS = (() => {
  const rand = rng(0xb14d)
  return Array.from({ length: 16 }, () => ({
    // Wide enough to range across the islands rather than circling one, and far
    // enough out that none of them crosses the camera at close range.
    radius: 70 + rand() * 70,
    // Well above the Alps, so they read against sky rather than against land.
    height: 46 + rand() * 26,
    phase: rand() * Math.PI * 2,
    speed: 0.06 + rand() * 0.05,
    bob: 0.7 + rand() * 1.4,
    scale: 0.7 + rand() * 0.5,
  }))
})()

// ---------------------------------------------------------------------------
// Boat
// ---------------------------------------------------------------------------

const HULL = new THREE.BoxGeometry(2.6, 0.7, 1.1)
const PROW = new THREE.ConeGeometry(0.55, 1.3, 24)
const MAST = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 20)
const SAIL = new THREE.BoxGeometry(0.08, 2.0, 1.5)

/*
  The boat is weathered; the clouds and birds above deliberately are not. Grain
  on a cloud reads as static, and the birds are four pixels across at the home
  view — every cycle spent on their surface is a cycle wasted.
*/
const HULL_MATERIAL = weather(
  new THREE.MeshStandardMaterial({ color: '#5e4229', roughness: 0.88 }),
  { grain: 12, mottle: 0.3, bump: 0.3, rough: 0.16 },
)
const SAIL_MATERIAL = weather(
  new THREE.MeshStandardMaterial({ color: '#ded4c4', roughness: 0.92 }),
  { grain: 16, mottle: 0.18, bump: 0.3, rough: 0.1 },
)

/*
  The boat used to circle the origin, which worked when there was exactly one
  island there to sail around. On an archipelago a circuit at any fixed radius
  runs straight through something — every candidate centred on the origin was
  checked against the height field and each one beached itself.

  This circuit sits in the open water on the seaward side, and every point of it
  samples the full seabed depth of -40, i.e. nowhere near land.
*/
const BOAT_CENTRE = { x: 0, z: 70 }
const BOAT_RADIUS = 16

function Boat() {
  const boat = useRef<THREE.Group>(null!)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const angle = t * 0.035
    const x = BOAT_CENTRE.x + Math.cos(angle) * BOAT_RADIUS
    const z = BOAT_CENTRE.z + Math.sin(angle) * BOAT_RADIUS

    // The JS twin of the ocean's vertex shader, so the hull sits ON the surface
    // rather than at a guessed height near it. This is the whole reason the
    // wave function was lifted out into src/shaders/water.ts.
    const h = waveHeight(x, z, t)
    boat.current.position.set(x, h - 0.15, z)

    /*
      Face along the tangent. The quarter turn is not optional: the boat travels
      counter-clockwise so its velocity is (-sin a, 0, cos a), but a Y rotation
      of -a sends local +X to (cos a, 0, sin a) — the outward radial. Without
      the extra -PI/2 the hull crabs sideways for its whole circuit with the bow
      aimed at the horizon, which also reads end-on from most camera angles.
    */
    boat.current.rotation.y = -angle - Math.PI / 2
    const ahead = waveHeight(
      BOAT_CENTRE.x + Math.cos(angle + 0.05) * BOAT_RADIUS,
      BOAT_CENTRE.z + Math.sin(angle + 0.05) * BOAT_RADIUS,
      t,
    )
    boat.current.rotation.z = (ahead - h) * 0.9
    boat.current.rotation.x = Math.sin(t * 0.9) * 0.045
  })

  return (
    <group ref={boat}>
      <mesh geometry={HULL} material={HULL_MATERIAL} />
      <mesh geometry={PROW} material={HULL_MATERIAL} position={[1.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
      <mesh geometry={MAST} material={HULL_MATERIAL} position={[0, 1.7, 0]} />
      <mesh geometry={SAIL} material={SAIL_MATERIAL} position={[0.05, 2.0, 0]} />
    </group>
  )
}

// ---------------------------------------------------------------------------

export function Ambient({ visible }: { visible: boolean }) {
  const clouds = useRef<THREE.Group>(null!)
  const birds = useRef<(THREE.Object3D | null)[]>([])

  useFrame((state, dt) => {
    // Slow enough to be felt rather than watched.
    clouds.current.rotation.y += dt * 0.004

    const t = state.clock.elapsedTime
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i]
      const node = birds.current[i]
      if (!node) continue
      const angle = b.phase + t * b.speed
      node.position.set(
        Math.cos(angle) * b.radius,
        b.height + Math.sin(t * 0.8 + b.phase) * b.bob,
        Math.sin(angle) * b.radius,
      )
      // Same quarter turn as the boat, for the same reason.
      node.rotation.y = -angle - Math.PI / 2
      node.rotation.z = Math.sin(t * 2.2 + b.phase) * 0.35
    }
  })

  const cloudGeometry = useMemo(() => CLOUD, [])

  /*
    Hidden rather than unmounted. The useFrame above keeps running and keeps the
    flock and the boat on their courses while they are out of sight, so coming
    back up from the map finds them where they would have been rather than
    snapped back to their starting phase — and nothing has to be rebuilt.
  */
  return (
    <group visible={visible}>
      <group ref={clouds}>
        <Instances geometry={cloudGeometry} material={CLOUD_MATERIAL} limit={CLOUD_LOBES.length}>
          {CLOUD_LOBES.map((c, i) => (
            <Instance key={i} position={c.position} scale={c.scale} rotation={[0, c.rotation, 0]} />
          ))}
        </Instances>
      </group>

      {/*
        frustumCulled off deliberately. These <Instance> elements carry no
        position prop, so on frame one every instance matrix is still at the
        origin; three computes the InstancedMesh's bounding sphere from that and
        — because it only recomputes when the sphere is null — keeps it forever.
        From frame two the flock orbits at radius 34-60 entirely outside its own
        bounds, so it would be culled or drawn as one unit on the strength of a
        sphere at the world origin. One draw call of 22 tetrahedra is not
        worth culling anyway.
      */}
      <Instances geometry={BIRD} material={BIRD_MATERIAL} limit={BIRDS.length} frustumCulled={false}>
        {BIRDS.map((b, i) => (
          <Instance
            key={i}
            ref={(el: THREE.Object3D | null) => {
              birds.current[i] = el
            }}
            scale={b.scale}
          />
        ))}
      </Instances>

      <Boat />
    </group>
  )
}
