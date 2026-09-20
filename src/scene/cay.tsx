import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COSMOS } from '../content/cosmos'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelPlacement } from './exhibits'
import { Instance, Instances } from '@react-three/drei'
import { ACCENT, DRESSED, groundAt, mat, METAL, PALM_FRONDS, PALM_TRUNK, std, type LandmarkProps } from './landmarkKit'
import { select, useDistrictSelection } from '../state/selection'

/**
 * Celestial Cay — an orrery on a small island, ringed by its moons, its
 * probes and its constellations.
 *
 * The orrery turns while nobody is looking at it and stops when the district
 * is focused, like the Isles' islets and for the same reason: the camera
 * flies to where a planet was when it was chosen. Around it, three rings of
 * markers stand on the ground, each ring one collection.
 */

const PLINTH = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(1.5, 0)
  at(1.5, 0.3)
  at(1.1, 0.45)
  at(0.9, 1.4)
  at(1.15, 1.6)
  at(1.15, 1.8)
  at(0, 1.8)
  return new THREE.LatheGeometry(p, 64)
})()
const ORRERY_Y = 2.6
const SPHERE = new THREE.SphereGeometry(1, 28, 18)
const BODY_MAT = std({ color: '#ffffff', roughness: 0.55, metalness: 0.05 }, { grain: 8, mottle: 0.12, bump: 0.12, rough: 0.1 })
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
const RING_MAT = std({ color: '#9c7f3f', roughness: 0.38, metalness: 0.82 }, METAL)
const SATURN_RING = new THREE.RingGeometry(0.5, 0.85, 48)
const SATURN_RING_MAT = std({ color: '#d9c48a', roughness: 0.6, side: THREE.DoubleSide }, DRESSED)

/** A small pedestal with a sphere on it, for a moon. */
const MOON_STAND = (() => {
  const stand = new THREE.CylinderGeometry(0.14, 0.2, 0.7, 16).translate(0, 0.35, 0)
  const orb = new THREE.SphereGeometry(0.24, 20, 14).translate(0, 0.95, 0)
  return mergeGeometries([stand, orb])!
})()
/** A mast with a dish, for a probe. */
const PROBE_MAST = (() => {
  const mast = new THREE.CylinderGeometry(0.05, 0.07, 1.6, 10).translate(0, 0.8, 0)
  const dish = new THREE.ConeGeometry(0.34, 0.22, 20, 1, true).rotateX(Math.PI).translate(0, 1.72, 0)
  return mergeGeometries([mast, dish])!
})()
/** A post with a star on top, for a constellation. */
const STAR_POST = (() => {
  // The octahedron is non-indexed and a merge needs both parts the same way,
  // or it returns null and the whole canvas goes with it.
  const post = new THREE.CylinderGeometry(0.06, 0.09, 1.3, 8).translate(0, 0.65, 0).toNonIndexed()
  const star = new THREE.OctahedronGeometry(0.28).translate(0, 1.55, 0)
  return mergeGeometries([post, star])!
})()
const MARKER_MAT = std({ color: '#ffffff', roughness: 0.5, metalness: 0.2 }, DRESSED)
const HALO = new THREE.TorusGeometry(0.55, 0.05, 10, 40)

const PLANET_COLOURS: Record<string, string> = {
  'The Sun': '#ffd36b',
  Mercury: '#a8a29a',
  Venus: '#e8cf9a',
  Earth: '#5c9ad8',
  Mars: '#d07a52',
  Ceres: '#9a948c',
  Jupiter: '#d8b48a',
  Saturn: '#e6d3a0',
  Uranus: '#9fdbe6',
  Neptune: '#5f7fe0',
  Pluto: '#c9b49a',
  Eris: '#e8e8ea',
}

const GROUPS = COSMOS
const PLANETS = GROUPS[0].items
const RING_RADII = [5.0, 6.2, 7.4]

/** The orrery's items, in its own turning frame. */
const PLANET_ITEMS: Exhibit[] = PLANETS.map((p, i) => {
  const a = i * 2.4
  const r = p.orbit ?? 0
  return {
    name: p.name,
    article: p.article,
    kicker: p.note ?? 'Planet',
    x: Math.cos(a) * r,
    y: ORRERY_Y,
    z: Math.sin(a) * r,
    scale: p.size ?? 0.1,
    color: PLANET_COLOURS[p.name] ?? GROUPS[0].color,
    extent: 1.6,
    elevation: 0.35,
  }
})

/** A ring of markers on the ground, evenly round the orrery. */
function ring(d: { seaward: number }, k: number, kicker: (note?: string) => string, groundY: (x: number, z: number) => number): Exhibit[] {
  const g = GROUPS[k]
  const r = RING_RADII[k - 1]
  return g.items.map((it, i) => {
    const a = d.seaward + Math.PI / g.items.length + (i / g.items.length) * Math.PI * 2
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    return { name: it.name, article: it.article, kicker: kicker(it.note), x, y: groundY(x, z), z, yaw: -a, color: g.color, extent: 1.6 }
  })
}

/** Palms on the sand beyond the rings, on the bearings the camera does not use. */
const PALMS = Array.from({ length: 7 }, (_, i) => {
  const a = 1.25 + 1.1 + (i / 7) * (Math.PI * 2 - 2.2)
  const r = 9.0 + (i % 3) * 0.8
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + (i % 3) * 0.12, rot: i * 1.7 }
})

export function CelestialCay({ d, focused }: LandmarkProps) {
  const orrery = useRef<THREE.Group>(null!)
  const palms = useMemo(() => PALMS.map((p) => ({ ...p, y: groundAt(d, p.x, p.z) })), [d])
  useFrame((_, dt) => {
    if (!focused) orrery.current.rotation.y += dt * 0.12
  })

  const selection = useDistrictSelection(d.id)
  const group = selection?.group ?? -1
  const item = selection?.item ?? -1
  const pick = useCallback(
    (k: number, i: number) => select(i < 0 ? null : { district: d.id, group: k, item: i }),
    [d.id],
  )

  /** A planet's authored position, carried round by the orrery. */
  const planet = useCallback((it: Exhibit): [number, number, number] => {
    const a = orrery.current?.rotation.y ?? 0
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [it.x * c + it.z * s, it.y, -it.x * s + it.z * c]
  }, [])

  const groundY = useCallback((x: number, z: number) => groundAt(d, x, z), [d])
  const moons = useMemo(() => ring(d, 1, (n) => `Moon of ${n}`, groundY), [d, groundY])
  const probes = useMemo(() => ring(d, 2, (n) => `Launched ${n}`, groundY), [d, groundY])
  const constellations = useMemo(() => ring(d, 3, (n) => (n ? `${n} constellation` : 'Constellation'), groundY), [d, groundY])

  const rings = [moons, probes, constellations]
  const atlases = useMemo(() => rings.map((items) => makeLabelAtlas(items.map((it) => it.name))), [moons, probes, constellations]) // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo<LabelPlacement[][]>(
    () => rings.map((items) => items.map((it, i) => ({ cell: i, x: it.x, y: it.y + 2.1 + (i % 2) * 0.3, z: it.z, width: 1.4 }))),
    [moons, probes, constellations], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const headings = useMemo(() => makeLabelAtlas(GROUPS.slice(1).map((g) => g.name)), [])
  const headingLabels = useMemo<LabelPlacement[]>(
    () =>
      RING_RADII.map((r, k) => {
        const a = d.seaward + Math.PI
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        return { cell: k, x, y: groundAt(d, x, z) + 3.2, z, width: 2.4 }
      }),
    [d],
  )

  const saturn = PLANET_ITEMS.find((p) => p.name === 'Saturn')!

  return (
    <ExhibitHall focused={focused} onClear={() => pick(0, -1)}>
      <mesh geometry={PLINTH} material={mat.marble} />
      <mesh geometry={new THREE.CylinderGeometry(0.12, 0.16, ORRERY_Y - 1.8, 12)} position={[0, 1.8 + (ORRERY_Y - 1.8) / 2, 0]} material={RING_MAT} />

      {/* noShadow: still turning after the shadow map freezes. */}
      <group ref={orrery} userData={{ noShadow: true }}>
        {PLANETS.filter((p) => (p.orbit ?? 0) > 0).map((p) => (
          <mesh key={p.name} geometry={new THREE.TorusGeometry(p.orbit, 0.02, 8, 96)} rotation={[Math.PI / 2, 0, 0]} position={[0, ORRERY_Y, 0]} material={RING_MAT} raycast={() => null} />
        ))}
        <mesh geometry={SPHERE} scale={1.05} position={[0, ORRERY_Y, 0]} material={GLOW_MAT} raycast={() => null} />
        <mesh geometry={SATURN_RING} position={[saturn.x, saturn.y, saturn.z]} rotation={[-Math.PI / 2 + 0.3, 0, 0]} material={SATURN_RING_MAT} raycast={() => null} />
        <Exhibits
          d={d}
          focused={focused}
          items={PLANET_ITEMS}
          geometry={SPHERE}
          material={BODY_MAT}
          labelHeight={0.9}
          highlight="#ffffff"
          keys={group <= 0}
          picked={group === 0 ? item : -1}
          onPick={(i) => pick(0, i)}
          place={planet}
          castShadow={false}
        />
      </group>

      {rings.map((items, k) => (
        <group key={k}>
          <Exhibits
            d={d}
            focused={focused}
            items={items}
            geometry={[MOON_STAND, PROBE_MAST, STAR_POST][k]}
            material={MARKER_MAT}
            labelHeight={2.6}
            marker={{ geometry: HALO, material: ACCENT.cosmos }}
            keys={group === k + 1}
            picked={group === k + 1 ? item : -1}
            onPick={(i) => pick(k + 1, i)}
          />
          <InstancedLabels atlas={atlases[k]} placements={labels[k]} fade={[24, 44]} />
        </group>
      ))}
      <InstancedLabels atlas={headings} placements={headingLabels} fade={[60, 95]} />

      <Instances geometry={PALM_TRUNK} material={mat.wood} limit={palms.length}>
        {palms.map((p, i) => (
          <Instance key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.s} />
        ))}
      </Instances>
      <Instances geometry={PALM_FRONDS} material={mat.leaf} limit={palms.length}>
        {palms.map((p, i) => (
          <Instance key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.s} />
        ))}
      </Instances>
    </ExhibitHall>
  )
}

