import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { prefersReducedMotion } from '../animations/gsap'
import { DISTRICTS, districtCentre, type District, type DistrictId } from './districts'
import { sampleHeight } from './terrain'

// ---------------------------------------------------------------------------
// Shared materials. One instance each, reused by every landmark — a fresh
// MeshStandardMaterial per mesh would mean a fresh shader program per mesh.
// ---------------------------------------------------------------------------

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)

const mat = {
  marble: std({ color: '#e9e4da', roughness: 0.34 }),
  stone: std({ color: '#a8a297', roughness: 0.85 }),
  /** For open-ended and ring geometry, which is visible from both faces. */
  stoneBoth: std({ color: '#a8a297', roughness: 0.85, side: THREE.DoubleSide }),
  darkStone: std({ color: '#6d685f', roughness: 0.9 }),
  sandstone: std({ color: '#c39a68', roughness: 0.86 }),
  gold: std({ color: '#d9b451', roughness: 0.22, metalness: 0.95 }),
  brass: std({ color: '#b08d3f', roughness: 0.3, metalness: 0.85 }),
  steel: std({ color: '#b9c2cc', roughness: 0.24, metalness: 0.9 }),
  dark: std({ color: '#383d45', roughness: 0.55, metalness: 0.25 }),
  wood: std({ color: '#7a5230', roughness: 0.85 }),
  leaf: std({ color: '#3f7a43', roughness: 0.8 }),
  leafWarm: std({ color: '#6f9c3c', roughness: 0.8 }),
  hedge: std({ color: '#34693a', roughness: 0.92 }),
  glass: std({ color: '#a8dcff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6 }),
  snow: std({ color: '#f2f6fb', roughness: 0.7 }),
  ember: std({ color: '#d8543c', roughness: 0.55 }),
  canvasCloth: std({ color: '#efe6d8', roughness: 0.9 }),
}

/** One emissive accent material per district, keyed off the palette in districts.ts. */
const ACCENT = Object.fromEntries(
  DISTRICTS.map((d) => [
    d.id,
    std({
      color: d.accent,
      roughness: 0.3,
      metalness: 0.45,
      emissive: new THREE.Color(d.accent),
      emissiveIntensity: 0.18,
    }),
  ]),
) as Record<DistrictId, THREE.MeshStandardMaterial>

export type LandmarkProps = { d: District }

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

    // The coastline wobbles, so a radius that is inland on one bearing is open
    // water on another. Walk back toward the district centre until the ground is
    // properly above the waterline rather than trusting the radius.
    let h = sampleHeight(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
    for (let tries = 0; tries < 8 && h < MIN_PLANTING_HEIGHT; tries++) {
      r -= 1.2
      h = sampleHeight(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
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

/** Local y that puts an object on the ground at a district-local XZ. */
function groundAt(d: District, lx: number, lz: number) {
  const [cx, cz] = districtCentre(d)
  return sampleHeight(cx + lx, cz + lz) - d.pad
}

/**
 * Furthest point along a bearing that is still dry land, for things that belong
 * at the water's edge. Same reason as above: a fixed radius is not reliably on
 * the beach.
 */
function findShore(d: District, dirX: number, dirZ: number, from: number) {
  const [cx, cz] = districtCentre(d)
  for (let t = from; t > 2; t -= 0.6) {
    const h = sampleHeight(cx + dirX * t, cz + dirZ * t)
    if (h > 1.0) return { lx: dirX * t, lz: dirZ * t, y: h - d.pad }
  }
  return { lx: dirX * 2, lz: dirZ * 2, y: groundAt(d, dirX * 2, dirZ * 2) }
}

// ===========================================================================
// Ideology Isles — a domed rotunda ringed by slowly orbiting islets
// ===========================================================================

const STEP = new THREE.CylinderGeometry(1, 1, 0.45, 64)
const COLUMN = new THREE.CylinderGeometry(0.3, 0.36, 4.8, 24)
const CAPITAL = new THREE.BoxGeometry(0.95, 0.3, 0.95)
const ENTABLATURE = new THREE.CylinderGeometry(5.6, 5.6, 0.7, 64)
const DOME = new THREE.SphereGeometry(5.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2)
const FINIAL = new THREE.SphereGeometry(0.55, 32, 24)
const SPIRE = new THREE.ConeGeometry(0.3, 1.4, 24)

const ISLET_ROCK = new THREE.ConeGeometry(1.35, 2.6, 28)
const ISLET_TOP = new THREE.CylinderGeometry(1.38, 1.38, 0.3, 32)
const MONOLITH = new THREE.BoxGeometry(0.3, 1.9, 0.3)

const COLONNADE = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  return [Math.cos(a) * 4.9, Math.sin(a) * 4.9] as const
})

/** Islet centres, in the orbiting group's local space. */
const ISLETS = [0, 1, 2, 3].map((i) => {
  const a = (i / 4) * Math.PI * 2
  const r = 8.8
  return [Math.cos(a) * r, Math.sin(a * 1.7) * 1.8, Math.sin(a) * r] as [number, number, number]
})

export function IdeologyIsles() {
  const orbit = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    orbit.current.rotation.y += dt * 0.09
  })

  return (
    <group>
      <mesh geometry={STEP} scale={[7.4, 1, 7.4]} position={[0, 0.22, 0]} material={mat.stone} />
      <mesh geometry={STEP} scale={[6.7, 1, 6.7]} position={[0, 0.66, 0]} material={mat.stone} />
      <mesh geometry={STEP} scale={[6.1, 1, 6.1]} position={[0, 1.1, 0]} material={mat.marble} />

      <Instances geometry={COLUMN} material={mat.marble} limit={COLONNADE.length}>
        {COLONNADE.map(([x, z], i) => (
          <Instance key={i} position={[x, 3.72, z]} />
        ))}
      </Instances>
      <Instances geometry={CAPITAL} material={mat.marble} limit={COLONNADE.length}>
        {COLONNADE.map(([x, z], i) => (
          <Instance key={i} position={[x, 6.27, z]} />
        ))}
      </Instances>

      <mesh geometry={ENTABLATURE} position={[0, 6.77, 0]} material={mat.marble} />
      <mesh geometry={DOME} position={[0, 7.12, 0]} material={ACCENT.ideology} />
      <mesh geometry={FINIAL} position={[0, 12.6, 0]} material={mat.gold} />
      <mesh geometry={SPIRE} position={[0, 13.5, 0]} material={mat.gold} />

      {/* noShadow: still rotating after the shadow map freezes. */}
      <group ref={orbit} position={[0, 7, 0]} userData={{ noShadow: true }}>
        <Instances geometry={ISLET_ROCK} material={mat.darkStone} limit={ISLETS.length}>
          {ISLETS.map(([x, y, z], i) => (
            <Instance key={i} position={[x, y - 1.45, z]} rotation={[Math.PI, 0, 0]} />
          ))}
        </Instances>
        <Instances geometry={ISLET_TOP} material={mat.leafWarm} limit={ISLETS.length}>
          {ISLETS.map((p, i) => (
            <Instance key={i} position={p} />
          ))}
        </Instances>
        <Instances geometry={MONOLITH} material={ACCENT.ideology} limit={ISLETS.length}>
          {ISLETS.map(([x, y, z], i) => (
            <Instance key={i} position={[x, y + 1.1, z]} />
          ))}
        </Instances>
      </group>
    </group>
  )
}

// ===========================================================================
// Historical Habitat — ziggurat, obelisk, ruined colonnade, triumphal arch
// ===========================================================================

const ZIGGURAT_STEPS = [
  { s: 9.0, y: 0.5, h: 1.0 },
  { s: 7.6, y: 1.5, h: 1.0 },
  { s: 6.2, y: 2.5, h: 1.0 },
  { s: 4.8, y: 3.5, h: 1.0 },
  { s: 3.4, y: 4.6, h: 1.2 },
]
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const SHRINE = new THREE.BoxGeometry(2.2, 1.7, 2.2)

const OBELISK_SHAFT = new THREE.CylinderGeometry(0.42, 0.62, 7.4, 4)
const OBELISK_CAP = new THREE.ConeGeometry(0.6, 1.3, 4)
const RUIN_COLUMN = new THREE.CylinderGeometry(0.38, 0.44, 1, 24)
const ARCH_PIER = new THREE.BoxGeometry(1.1, 4, 1.4)
const ARCH_VAULT = new THREE.TorusGeometry(2.2, 0.55, 24, 64, Math.PI)
const ARCH_LINTEL = new THREE.BoxGeometry(6.4, 1.1, 1.6)

const RUINS = Array.from({ length: 7 }, (_, i) => {
  const a = (-50 + (i / 6) * 100) * (Math.PI / 180)
  const heights = [4.6, 3.1, 5.2, 1.4, 4.9, 2.3, 4.2]
  return { x: Math.cos(a) * 6.6, z: Math.sin(a) * 6.6, h: heights[i] }
})

export function HistoricalHabitat() {
  return (
    <group>
      <group position={[-2, 0, -1]}>
        <Instances geometry={UNIT_BOX} material={mat.sandstone} limit={ZIGGURAT_STEPS.length + 1}>
          {ZIGGURAT_STEPS.map((s, i) => (
            <Instance key={i} scale={[s.s, s.h, s.s]} position={[0, s.y, 0]} />
          ))}
          {/* The cap slab shares geometry and material, so it rides along. */}
          <Instance scale={[2.6, 0.25, 2.6]} position={[0, 7.0, 0]} />
        </Instances>
        <mesh geometry={SHRINE} position={[0, 6.05, 0]} material={ACCENT.history} />
      </group>

      <group position={[5.0, 0, -3.2]}>
        <mesh geometry={UNIT_BOX} scale={[1.8, 0.6, 1.8]} position={[0, 0.3, 0]} material={mat.stone} />
        <mesh geometry={OBELISK_SHAFT} rotation={[0, Math.PI / 4, 0]} position={[0, 4.3, 0]} material={mat.sandstone} />
        <mesh geometry={OBELISK_CAP} rotation={[0, Math.PI / 4, 0]} position={[0, 8.65, 0]} material={mat.gold} />
      </group>

      <Instances geometry={UNIT_BOX} material={mat.stone} limit={RUINS.length}>
        {RUINS.map((r, i) => (
          <Instance key={i} scale={[1.2, 0.3, 1.2]} position={[r.x, 0.15, r.z]} />
        ))}
      </Instances>
      <Instances geometry={RUIN_COLUMN} material={mat.marble} limit={RUINS.length}>
        {RUINS.map((r, i) => (
          <Instance key={i} scale={[1, r.h, 1]} position={[r.x, 0.3 + r.h / 2, r.z]} />
        ))}
      </Instances>

      <group position={[-0.5, 0, 5.9]}>
        <mesh geometry={ARCH_PIER} position={[-2.75, 2, 0]} material={mat.sandstone} />
        <mesh geometry={ARCH_PIER} position={[2.75, 2, 0]} material={mat.sandstone} />
        <mesh geometry={ARCH_VAULT} position={[0, 4, 0]} material={mat.sandstone} />
        <mesh geometry={ARCH_LINTEL} position={[0, 6.7, 0]} material={mat.stone} />
      </group>
    </group>
  )
}

// ===========================================================================
// Geographical Garden — armillary globe over a formal parterre
// ===========================================================================

// 64x48 was 6,016 triangles for a 3.2-unit sphere. 32x24 is 1,472 and reads
// identically at the size it occupies on screen.
const GLOBE = new THREE.SphereGeometry(3.2, 32, 24)
const GLOBE_MAT = std({ color: '#2f6f9e', roughness: 0.45, metalness: 0.15 })
const LANDMASS = new THREE.SphereGeometry(1, 32, 24)
const LANDMASS_MAT = std({ color: '#4f9d5e', roughness: 0.8 })
// Drawn three times (306-308). At tube radius 0.1 nobody can see 20 radial
// segments: 5,120 triangles each becomes 1,024, saving 12,288 across the three.
const RING = new THREE.TorusGeometry(4.05, 0.1, 8, 64)
const PLINTH_TOP = new THREE.CylinderGeometry(1.2, 1.7, 1.7, 40)
const PLINTH_BASE = new THREE.CylinderGeometry(2.4, 2.8, 0.7, 48)
const CYPRESS = new THREE.ConeGeometry(0.72, 3.6, 28)
const CYPRESS_TRUNK = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 16)

const UP = new THREE.Vector3(0, 1, 0)
const CONTINENTS = (
  [
    [0.4, 0.55, 0.7, 1.7, 1.2],
    [-0.7, 0.2, 0.6, 1.4, 1.0],
    [0.1, -0.75, 0.6, 1.3, 1.1],
    [-0.5, -0.4, -0.75, 1.5, 0.9],
    [0.75, -0.1, -0.6, 1.1, 0.8],
    [-0.15, 0.85, -0.5, 1.0, 0.9],
  ] as const
).map(([x, y, z, sx, sz]) => {
  const n = new THREE.Vector3(x, y, z).normalize()
  const e = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(UP, n),
  )
  return {
    position: n.clone().multiplyScalar(3.18).toArray() as [number, number, number],
    rotation: [e.x, e.y, e.z] as [number, number, number],
    scale: [sx, 0.14, sz] as [number, number, number],
  }
})

// 2,688 triangles each, three of them, for low garden hedges.
const HEDGE_RINGS = [4.8, 6.0, 7.0].map((r) => new THREE.TorusGeometry(r, 0.34, 10, 48))
const SPOKES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2)

export function GeographicalGarden({ d }: LandmarkProps) {
  const globe = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    globe.current.rotation.y += dt * 0.12
  })

  const cypresses = useMemo(() => scatter(d, 10, 8.5, 11.0, 0x5eed), [d])

  return (
    <group>
      <mesh geometry={PLINTH_BASE} position={[0, 0.35, 0]} material={mat.stone} />
      <mesh geometry={PLINTH_TOP} position={[0, 1.55, 0]} material={mat.marble} />

      <group position={[0, 6.1, 0]}>
        <group ref={globe}>
          {/*
            Untagged on purpose. This sphere rotates about an axis through its
            own centre, so its cast silhouette never changes — freezing its
            shadow is exact, not an approximation. Tagging the whole group cost
            a ~6-unit shadow ellipse on the parterre while the armillary rings
            outside it kept casting, which read as a bug.
          */}
          <mesh geometry={GLOBE} material={GLOBE_MAT} />
          {/*
            The decals do change silhouette (they stand ~13% proud of the
            sphere), so they are excluded — via a wrapping group, never a
            userData prop on <Instances>: drei spreads caller props over its own
            `userData: { instances, limit, frames }`, and R3F assigns plain
            objects wholesale, so that would delete `instances` and make
            PositionMesh.raycast throw on every pointer move.
          */}
          <group userData={{ noShadow: true }}>
            <Instances geometry={LANDMASS} material={LANDMASS_MAT} limit={CONTINENTS.length}>
              {CONTINENTS.map((c, i) => (
                <Instance key={i} position={c.position} rotation={c.rotation} scale={c.scale} />
              ))}
            </Instances>
          </group>
        </group>
        {/* Armillary rings stay fixed while the globe turns inside them. */}
        <mesh geometry={RING} rotation={[Math.PI / 2, 0, 0]} material={mat.brass} />
        <mesh geometry={RING} rotation={[Math.PI / 2, 0, Math.PI / 2]} scale={[0.99, 0.99, 1]} material={mat.brass} />
        <mesh geometry={RING} rotation={[0, 0, 0.41]} material={ACCENT.geography} />
      </group>

      {HEDGE_RINGS.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.34, 0]}
          material={mat.hedge}
        />
      ))}
      <Instances geometry={UNIT_BOX} material={mat.hedge} limit={SPOKES.length}>
        {SPOKES.map((a, i) => (
          <Instance
            key={i}
            scale={[2.2, 0.6, 0.4]}
            position={[Math.cos(a) * 5.9, 0.3, Math.sin(a) * 5.9]}
            rotation={[0, -a, 0]}
          />
        ))}
      </Instances>

      {/* The per-tree group is gone, so its scale has to be folded into the
          children's offsets by hand — both sat on the group's Y axis. */}
      <Instances geometry={CYPRESS_TRUNK} material={mat.wood} limit={cypresses.length}>
        {cypresses.map((c, i) => (
          <Instance
            key={i}
            position={[c.position[0], c.position[1] + 0.35 * c.scale, c.position[2]]}
            scale={c.scale}
          />
        ))}
      </Instances>
      <Instances geometry={CYPRESS} material={mat.leaf} limit={cypresses.length}>
        {cypresses.map((c, i) => (
          <Instance
            key={i}
            position={[c.position[0], c.position[1] + 2.5 * c.scale, c.position[2]]}
            scale={c.scale}
          />
        ))}
      </Instances>
    </group>
  )
}

// ===========================================================================
// Scientific Shores — observatory, atom sculpture, lighthouse, jetty
// ===========================================================================

const OBS_BASE = new THREE.CylinderGeometry(3.6, 4.0, 1.0, 56)
const OBS_TOWER = new THREE.CylinderGeometry(3.0, 3.2, 5.0, 56)
const OBS_BAND = new THREE.TorusGeometry(3.06, 0.24, 20, 64)
const OBS_DOME = new THREE.SphereGeometry(3.1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2)
const OBS_SLOT = new THREE.BoxGeometry(0.9, 3.3, 3.3)
const TELESCOPE = new THREE.CylinderGeometry(0.34, 0.46, 4.2, 24)

const NUCLEUS = new THREE.SphereGeometry(0.85, 48, 32)
// Also drawn three times (378-380), same reasoning as RING above.
const ORBITAL = new THREE.TorusGeometry(2.5, 0.1, 8, 64)
const ELECTRON = new THREE.SphereGeometry(0.24, 24, 18)

const LH_TOWER = new THREE.CylinderGeometry(0.95, 1.7, 7.2, 36)
const LH_GALLERY = new THREE.CylinderGeometry(1.35, 1.35, 0.3, 36)
const LH_LANTERN = new THREE.CylinderGeometry(1.0, 1.0, 1.4, 32)
const LH_ROOF = new THREE.ConeGeometry(1.35, 1.5, 32)
const LH_LAMP = new THREE.SphereGeometry(0.5, 32, 24)
const LAMP_MAT = std({ color: '#fff2c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 2.4, roughness: 0.4 })

const JETTY_POSTS = Array.from({ length: 7 }, (_, i) => i)

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
      <mesh geometry={LH_TOWER} position={[0, 4.0, 0]} material={mat.marble} />
      <mesh geometry={LH_GALLERY} position={[0, 7.75, 0]} material={mat.dark} />
      <mesh geometry={LH_LANTERN} position={[0, 8.6, 0]} material={mat.glass} />
      <mesh geometry={LH_LAMP} position={[0, 8.6, 0]} material={LAMP_MAT} />
      <mesh geometry={LH_ROOF} position={[0, 10.05, 0]} material={mat.ember} />
      <pointLight ref={lamp} position={[0, 8.6, 0]} distance={38} decay={2} color="#ffdc9a" intensity={18} />
    </group>
  )
}

export function ScientificShores({ d }: LandmarkProps) {
  // "Outward" is away from the island centre, which is the direction the shore
  // lies in. Both the jetty and the lighthouse are placed along it.
  const outward = useMemo(() => {
    const [cx, cz] = districtCentre(d)
    const len = Math.hypot(cx, cz) || 1
    return { x: cx / len, z: cz / len }
  }, [d])

  const jetty = useMemo(
    () =>
      JETTY_POSTS.map((i) => {
        const t = 10 + i * 1.8
        return { lx: outward.x * t, lz: outward.z * t }
      }),
    [outward],
  )

  // On the headland beside the jetty — found by walking in from the water rather
  // than guessed, or it ends up submerged wherever the coastline happens to dip.
  const lighthouse = useMemo(() => {
    const bearing = 0.9
    const dx = outward.x * Math.cos(bearing) - outward.z * Math.sin(bearing)
    const dz = outward.z * Math.cos(bearing) + outward.x * Math.sin(bearing)
    return findShore(d, dx, dz, 14)
  }, [d, outward])

  const deckAngle = useMemo(() => {
    const [cx, cz] = districtCentre(d)
    return -Math.atan2(cz, cx)
  }, [d])

  const deckMid = jetty[Math.floor(jetty.length / 2)]

  return (
    <group>
      <group position={[-3.4, 0, -2.2]}>
        <mesh geometry={OBS_BASE} position={[0, 0.5, 0]} material={mat.stone} />
        <mesh geometry={OBS_TOWER} position={[0, 3.5, 0]} material={mat.marble} />
        <mesh geometry={OBS_BAND} rotation={[Math.PI / 2, 0, 0]} position={[0, 6.0, 0]} material={mat.steel} />
        <mesh geometry={OBS_DOME} position={[0, 6.15, 0]} material={ACCENT.science} />
        <mesh geometry={OBS_SLOT} position={[0, 7.6, 1.5]} material={mat.dark} />
        <mesh geometry={TELESCOPE} position={[0, 8.4, 2.1]} rotation={[Math.PI / 3.1, 0, 0]} material={mat.steel} />
      </group>

      <group position={[4.4, 0, 2.8]}>
        <Atom />
      </group>

      <group position={[lighthouse.lx, lighthouse.y, lighthouse.lz]}>
        <Lighthouse />
      </group>

      {/* Jetty: a deck spanning the posts, each post sunk to the sea floor. */}
      <mesh
        geometry={UNIT_BOX}
        scale={[15, 0.3, 1.8]}
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
    </group>
  )
}

// ===========================================================================
// Artistic Arboretum — amphitheatre, torus-knot sculpture, a grove
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
    tread: new THREE.RingGeometry(rInner, rInner + 0.85, 72, 1, 0, Math.PI),
    riser: new THREE.CylinderGeometry(rInner, rInner, 0.72, 72, 1, true, 0, Math.PI),
    y: (i + 1) * 0.72,
  }
})
const STAGE = new THREE.CylinderGeometry(2.2, 2.2, 0.32, 56)
// The single most tessellated object in the scene: 256x40x2 = 20,480 triangles
// for a sculpture about three units across. 128x12 gives 3,072.
const KNOT = new THREE.TorusKnotGeometry(1.55, 0.42, 128, 12, 2, 3)
const EASEL_LEG = new THREE.CylinderGeometry(0.07, 0.09, 3, 12)
const CANVAS = new THREE.BoxGeometry(2.4, 1.8, 0.12)

const TRUNK = new THREE.CylinderGeometry(0.2, 0.34, 2.6, 18)
// x22 instances in the grove, so this one multiplies: 816 triangles each was
// 17,952 for the canopies alone. 16x12 brings that to 7,392 — a 59% cut that
// still holds a round silhouette at the distance a district view parks at.
// 12x10 was measurably faceted across 22 spheres at once.
const CANOPY = new THREE.SphereGeometry(1.45, 16, 12)

export function ArtisticArboretum({ d }: LandmarkProps) {
  const knot = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    knot.current.rotation.y += dt * 0.35
    knot.current.rotation.z += dt * 0.12
  })

  const grove = useMemo(() => scatter(d, 22, 7.5, 11.0, 0xa27), [d])

  return (
    <group>
      <group position={[-1.8, 0, 1.4]} rotation={[0, -0.5, 0]}>
        {SEAT_TIERS.map((t, i) => (
          <group key={i}>
            <mesh geometry={t.tread} rotation={[-Math.PI / 2, 0, 0]} position={[0, t.y, 0]} material={mat.stoneBoth} />
            <mesh geometry={t.riser} position={[0, t.y - 0.36, 0]} material={mat.stoneBoth} />
          </group>
        ))}
        <mesh geometry={STAGE} position={[0, 0.16, 0]} material={mat.marble} />
      </group>

      <group position={[4.6, 0, -3.2]}>
        <mesh geometry={PLINTH_BASE} scale={[0.62, 1, 0.62]} position={[0, 0.35, 0]} material={mat.marble} />
        <mesh geometry={UNIT_BOX} scale={[1.1, 2.2, 1.1]} position={[0, 1.8, 0]} material={mat.marble} />
        <mesh ref={knot} geometry={KNOT} position={[0, 4.9, 0]} material={ACCENT.art} userData={{ noShadow: true }} />
      </group>

      <group position={[5.0, groundAt(d, 5.0, 3.4), 3.4]} rotation={[0, -0.9, 0]}>
        <mesh geometry={EASEL_LEG} position={[-0.7, 1.5, 0]} rotation={[0, 0, 0.09]} material={mat.wood} />
        <mesh geometry={EASEL_LEG} position={[0.7, 1.5, 0]} rotation={[0, 0, -0.09]} material={mat.wood} />
        <mesh geometry={EASEL_LEG} position={[0, 1.5, -0.6]} rotation={[0.14, 0, 0]} material={mat.wood} />
        <mesh geometry={CANVAS} position={[0, 2.4, 0.1]} material={mat.canvasCloth} />
        <mesh geometry={CANVAS} scale={[0.82, 0.72, 1]} position={[0, 2.4, 0.18]} material={ACCENT.art} />
      </group>

      <Instances geometry={TRUNK} material={mat.wood} limit={32}>
        {grove.map((t, i) => (
          <Instance key={i} position={[t.position[0], t.position[1] + 1.3 * t.scale, t.position[2]]} scale={t.scale} />
        ))}
      </Instances>
      <Instances geometry={CANOPY} material={mat.leaf} limit={32}>
        {grove.map((t, i) => (
          <Instance
            key={i}
            position={[t.position[0], t.position[1] + 3.2 * t.scale, t.position[2]]}
            rotation={[0, t.rotation, 0]}
            scale={t.scale * (0.85 + (i % 3) * 0.12)}
          />
        ))}
      </Instances>
    </group>
  )
}

// ===========================================================================
// Anthropologic Alps — stone circle, summit cairn, a span between two peaks
// ===========================================================================

const STANDING_STONE = new THREE.BoxGeometry(1.5, 3.0, 0.95)
const LINTEL = new THREE.BoxGeometry(2.2, 0.55, 1.0)
const CAIRN_ROCK = new THREE.IcosahedronGeometry(1, 2)
const FLAGPOLE = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 14)
const BANNER = new THREE.BoxGeometry(1.9, 1.1, 0.06)

const HENGE = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, a }
})
const CAIRN_STACK = [1.0, 0.82, 0.64, 0.48, 0.34]

const HOUSE_BODY = new THREE.BoxGeometry(1.9, 1.5, 2.3)
const HOUSE_ROOF = new THREE.ConeGeometry(1.75, 1.2, 4)
const CHIMNEY = new THREE.BoxGeometry(0.32, 0.9, 0.32)

/** A handful of chalets on the lower slopes. */
function Village({ d }: { d: District }) {
  const houses = useMemo(() => scatter(d, 7, 6.5, 10.5, 0x71ce), [d])

  /*
    Instancing flattens the per-house group away, so anything the group used to
    carry has to be applied per instance. Body and roof sat on its Y axis and
    only need the scale folded in, but the chimney is offset in X and Z, so the
    group's Y rotation genuinely moved it — that rotation is reapplied by hand
    here. three's Y rotation maps (x, z) to (x cos + z sin, -x sin + z cos).
  */
  const chalets = useMemo(
    () =>
      houses.map((h, i) => {
        const scale = 0.8 + (i % 3) * 0.12
        const [hx, hy, hz] = h.position
        const cos = Math.cos(h.rotation)
        const sin = Math.sin(h.rotation)
        return {
          rotation: h.rotation,
          scale,
          body: [hx, hy + 0.75 * scale, hz] as [number, number, number],
          roof: [hx, hy + 2.1 * scale, hz] as [number, number, number],
          chimney: [
            hx + (0.55 * cos + 0.6 * sin) * scale,
            hy + 2.3 * scale,
            hz + (-0.55 * sin + 0.6 * cos) * scale,
          ] as [number, number, number],
        }
      }),
    [houses],
  )

  return (
    <group>
      <Instances geometry={HOUSE_BODY} material={mat.wood} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.body} rotation={[0, c.rotation, 0]} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={HOUSE_ROOF} material={mat.snow} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.roof} rotation={[0, c.rotation + Math.PI / 4, 0]} scale={c.scale} />
        ))}
      </Instances>
      <Instances geometry={CHIMNEY} material={mat.darkStone} limit={chalets.length}>
        {chalets.map((c, i) => (
          <Instance key={i} position={c.chimney} rotation={[0, c.rotation, 0]} scale={c.scale} />
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
              rotation={[0, -s.a, 0]}
              scale={[1, 0.8 + (i % 3) * 0.18, 1]}
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

export const LANDMARKS: Record<DistrictId, (props: LandmarkProps) => React.JSX.Element> = {
  ideology: IdeologyIsles,
  history: HistoricalHabitat,
  geography: GeographicalGarden,
  science: ScientificShores,
  art: ArtisticArboretum,
  anthropology: AnthropologicAlps,
}
