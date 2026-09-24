import { useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { FAMILIES } from '../content/languages'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelPlacement } from './exhibits'
import { layoutTree } from './familyTree'
import { Instance, Instances } from '@react-three/drei'
import { ACCENT, BOULDER, DRESSED, groundAt, mat, PALM_FRONDS, PALM_TRUNK, roughen, std, type LandmarkProps } from './landmarkKit'
import { Tree, treeExtent, useTreePick } from './trees'

/**
 * Linguistic Lagoon — an atoll, a ring of rune stones, and a tree of tongues
 * over the water.
 *
 * The terrain makes the atoll itself: the lagoon is carved below the
 * waterline in districts.ts, the ring of sand round it is the plateau's
 * rim, and a mouth is cut through the ring on the seaward side. Round its rim stand sixteen
 * stones, one per language family, and choosing one raises that family's
 * tree in the air over the lagoon — the same tree the gods hang in on the
 * Isles, over different names. The rim is the only place to stand, so
 * everything faces inward to the water, which is where the reading is.
 */

const RIM_R = 7.6
const TREE_BASE_Y = 2.6

/** A rune stone: a tall, tapered, hewn pillar, tinted by its family. */
const RUNESTONE = roughen(new THREE.CylinderGeometry(0.26, 0.4, 2.3, 6, 3), 0.06)
const RUNESTONE_MAT = std({ color: '#ffffff', roughness: 0.78 }, DRESSED)
const RUNESTONE_RING = new THREE.TorusGeometry(0.72, 0.06, 10, 44)

const LAYOUTS = FAMILIES.map((f) => layoutTree(f.figures))

const STONES: Exhibit[] = FAMILIES.map((family, i) => {
  const a = (i / FAMILIES.length) * Math.PI * 2 + 0.2
  return {
    name: family.name,
    article: family.article,
    kicker: `Language family · ${family.figures.length} tongues`,
    x: Math.cos(a) * RIM_R,
    y: 0,
    z: Math.sin(a) * RIM_R,
    yaw: -a,
    color: family.color,
    extent: treeExtent(LAYOUTS[i]),
    elevation: 0.3,
  }
})

const BOULDERS = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + 0.1 + (i % 3) * 0.05
  const r = RIM_R + 1.4 + (i % 4) * 0.5
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.6 + (i % 5) * 0.14, rot: i * 1.3 }
})
/** Palms on the rim, everywhere but the mouth. */
const PALMS = Array.from({ length: 12 }, (_, i) => {
  const a = 1.9 + 0.7 + (i / 12) * (Math.PI * 2 - 1.4)
  const r = RIM_R + 2.6 + (i % 3) * 0.7
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.75 + (i % 4) * 0.12, rot: i * 2.1 }
})

export function LinguisticLagoon({ d, focused }: LandmarkProps) {
  // The stones stand on the rim's real ground, which slopes down to the water.
  const stones = useMemo(() => STONES.map((s) => ({ ...s, y: groundAt(d, s.x, s.z) })), [d])
  const boulders = useMemo(() => BOULDERS.map((b) => ({ ...b, y: groundAt(d, b.x, b.z) })), [d])
  const palms = useMemo(() => PALMS.map((p) => ({ ...p, y: groundAt(d, p.x, p.z) })), [d])

  // Every tree hangs over the middle of the lagoon, whichever stone chose it.
  const anchorOf = useCallback((): [number, number, number] => [0, TREE_BASE_Y, 0], [])
  const axis = useMemo(() => ({ x: Math.sin(d.seaward), z: -Math.cos(d.seaward) }), [d])
  const kicker = useCallback(
    (g: number, f: { parents?: readonly string[] }) =>
      f.parents?.length ? `${FAMILIES[g].name} · from ${f.parents.join(' and ')}` : `${FAMILIES[g].name} family`,
    [],
  )
  const pick = useTreePick(d, focused, FAMILIES, LAYOUTS, anchorOf, axis, kicker)

  const atlas = useMemo(() => makeLabelAtlas(FAMILIES.map((f) => f.name)), [])
  const labels = useMemo<LabelPlacement[]>(
    () => stones.map((s, i) => ({ cell: i, x: s.x, y: s.y + 2.75, z: s.z, width: 1.9 })),
    [stones],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick.pickGroup(-1)}>
      {boulders.map((b, i) => (
        <mesh key={i} geometry={BOULDER} position={[b.x, b.y + 0.2, b.z]} rotation={[b.rot, b.rot * 0.7, 0]} scale={b.s} material={mat.darkStone} />
      ))}
      <Instances geometry={PALM_TRUNK} material={mat.wood} limit={palms.length}>
        {palms.map((p, i) => (
          <Instance key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.s} />
        ))}
      </Instances>
      <Instances geometry={PALM_FRONDS} material={mat.leafBoth} limit={palms.length}>
        {palms.map((p, i) => (
          <Instance key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.s} />
        ))}
      </Instances>

      <Exhibits
        d={d}
        focused={focused}
        items={stones}
        geometry={RUNESTONE}
        material={RUNESTONE_MAT}
        lift={1.15}
        labelHeight={2.2}
        marker={{ geometry: RUNESTONE_RING, material: ACCENT.languages, lift: -1.1 }}
        keys={false}
        picked={pick.group}
        onPick={pick.pickGroup}
        onSubFocus={pick.onGroupSubFocus}
        place={(_, i) => [0, TREE_BASE_Y + LAYOUTS[i].height / 2, 0]}
      />
      <InstancedLabels atlas={atlas} placements={labels} fade={[40, 80]} />

      {pick.layout && (
        <Tree
          key={FAMILIES[pick.group].id}
          d={d}
          focused={focused}
          group={FAMILIES[pick.group]}
          layout={pick.layout}
          figures={pick.figures}
          picked={pick.figure}
          onPick={pick.pickFigure}
        />
      )}
    </ExhibitHall>
  )
}
