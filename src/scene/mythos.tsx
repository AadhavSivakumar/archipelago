import { useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CREATURES, LEGENDS } from '../content/lore'
import { PANTHEONS } from '../content/pantheons'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelPlacement } from './exhibits'
import { layoutTree } from './familyTree'
import { ACCENT, DRESSED, groundAt, groundRibbon, lumpen, mat, RIBBON_MAT, roughen, std, type LandmarkProps } from './landmarkKit'
import { select, useDistrictSelection } from '../state/selection'
import { HALO, STELE, STELE_MAT } from './timeline'
import { Tree, treeExtent, useTreePick } from './trees'

/**
 * Mythological Monument — a tower on a mesa, and everything myth has: the
 * gods in their family trees, the legends they star in, and the creatures.
 *
 * Three collections round one tower. Fourteen shrines stand in a ring, one
 * per pantheon, each with its totem; choose one and the pantheon's family
 * tree hangs in the air above the shrine. An avenue of story stones runs in
 * from the seaward side to the tower's foot, one per legend. And round the
 * outside stand the creatures, each a statue on a plinth. Both rings leave
 * a gap where the avenue passes through them.
 */

const TOWER = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(2.6, 0)
  at(2.6, 0.5)
  at(2.1, 0.7)
  at(1.9, 1.4)
  at(1.65, 1.6)
  // The shaft: a long, slightly concave taper.
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    at(1.65 - 0.85 * Math.pow(t, 0.8), 1.6 + t * 10.4)
  }
  at(0.8, 12.0)
  at(1.15, 12.3) // capital
  at(1.15, 12.9)
  at(0.95, 13.1)
  at(0, 13.1)
  return new THREE.LatheGeometry(p, 64)
})()
const STEP = new THREE.CylinderGeometry(1, 1, 0.42, 96)
const STEPS = [
  { r: 6.0, y: 0.21 },
  { r: 5.2, y: 0.63 },
  { r: 4.4, y: 1.05 },
]
const CROWN = new THREE.SphereGeometry(1.05, 48, 32)

/** A shrine: a small stone house with a gabled roof, in one geometry. */
const SHRINE = (() => {
  const body = new THREE.BoxGeometry(1.5, 1.25, 1.5).translate(0, 0.625, 0).toNonIndexed()
  const gable = new THREE.Shape()
  gable.moveTo(-0.95, 0)
  gable.lineTo(0, 0.7)
  gable.lineTo(0.95, 0)
  gable.closePath()
  const roof = new THREE.ExtrudeGeometry(gable, { depth: 1.9, bevelEnabled: false, curveSegments: 1 })
  roof.translate(0, 1.25, -0.95)
  return mergeGeometries([body, roof])!
})()
/** The totem before each shrine, in its pantheon's colour: the thing to click. */
const TOTEM = roughen(new THREE.CylinderGeometry(0.2, 0.32, 2.2, 5, 3), 0.05)
const TOTEM_MAT = std({ color: '#ffffff', roughness: 0.7, metalness: 0.1 }, DRESSED)
const SHRINE_RING = new THREE.TorusGeometry(1.5, 0.07, 10, 56)

/** A creature: a crouching, weathered form on a plinth. */
const STATUE = (() => {
  const plinth = new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(0, 0.25, 0).toNonIndexed()
  const beast = lumpen(new THREE.IcosahedronGeometry(0.55, 2), 0x6a3, 0.9, 5)
  beast.scale(1, 0.85, 1.25)
  beast.translate(0, 0.98, 0)
  return mergeGeometries([plinth, roughen(beast, 0.06)])!
})()
const STATUE_MAT = std({ color: '#ffffff', roughness: 0.82 }, DRESSED)
const STATUE_HALO = new THREE.TorusGeometry(0.72, 0.06, 10, 44)

const GROUPS = PANTHEONS.map((p) => ({ id: p.id, name: p.name, article: p.article, color: p.color, figures: p.deities }))
const TREES = GROUPS.map((g) => layoutTree(g.figures))
const LEGEND_GROUP = GROUPS.length
const CREATURE_GROUP = GROUPS.length + 1

const SHRINE_R = 8.0
const CREATURE_R = 10.6
/** Half the angular gap each ring leaves for the avenue, either side of seaward. */
const GAP = 0.36
const TREE_LIFT = 2.6

type Layout = {
  shrines: Exhibit[]
  legends: Exhibit[]
  creatures: Exhibit[]
  avenue: THREE.BufferGeometry
  shrineLabels: LabelPlacement[]
  legendLabels: LabelPlacement[]
  creatureLabels: LabelPlacement[]
  headings: LabelPlacement[]
}

function layoutMonument(d: { seaward: number } & Parameters<typeof groundAt>[0]): Layout {
  const ring = (n: number) =>
    Array.from({ length: n }, (_, i) => d.seaward + GAP + ((i + 0.5) / n) * (Math.PI * 2 - GAP * 2))

  const shrines: Exhibit[] = ring(GROUPS.length).map((a, i) => {
    const x = Math.cos(a) * SHRINE_R
    const z = Math.sin(a) * SHRINE_R
    return {
      name: GROUPS[i].name,
      article: GROUPS[i].article,
      kicker: `Pantheon · ${GROUPS[i].figures.length} figures`,
      x,
      y: groundAt(d, x, z),
      z,
      // Facing the tower.
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
      color: GROUPS[i].color,
      extent: treeExtent(TREES[i]),
      elevation: 0.3,
    }
  })

  const creatures: Exhibit[] = ring(CREATURES.length).map((a, i) => {
    const x = Math.cos(a) * CREATURE_R
    const z = Math.sin(a) * CREATURE_R
    return {
      name: CREATURES[i].name,
      article: CREATURES[i].article,
      kicker: `${CREATURES[i].origin} · creature`,
      x,
      y: groundAt(d, x, z),
      z,
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + i * 0.6,
      color: '#c4cdd8',
      extent: 1.7,
    }
  })

  /*
    The avenue: four rows of story stones flanking a path that runs from the
    outer ring in to the tower's steps, on the seaward bearing. Legends are
    dealt out across the rows in order, so the story runs down the avenue
    rather than up one side and down the other.
  */
  const ax = Math.cos(d.seaward)
  const az = Math.sin(d.seaward)
  const tx = -Math.sin(d.seaward)
  const tz = Math.cos(d.seaward)
  const ROWS = [-2.5, -1.35, 1.35, 2.5]
  const perRow = Math.ceil(LEGENDS.length / ROWS.length)
  const legends: Exhibit[] = LEGENDS.map((legend, i) => {
    const row = i % ROWS.length
    const along = 11.4 - Math.floor(i / ROWS.length) * (8.4 / Math.max(1, perRow - 1))
    const x = ax * along + tx * ROWS[row]
    const z = az * along + tz * ROWS[row]
    return {
      name: legend.name,
      article: legend.article,
      kicker: `${legend.origin} · legend`,
      x,
      y: groundAt(d, x, z),
      z,
      // Facing across the path.
      yaw: Math.atan2(-tx * Math.sign(ROWS[row]), -tz * Math.sign(ROWS[row])),
      color: '#e8d8a6',
      extent: 1.7,
    }
  })
  const plank = new THREE.Color('#9d9a92').multiplyScalar(0.7)
  const M = 40
  const line = Array.from({ length: M + 1 }, (_, k) => {
    const along = 2.6 + (k / M) * 10.0
    return { x: ax * along, z: az * along, color: plank }
  })
  const avenue = groundRibbon(d, line, 1.4)

  const shrineLabels = shrines.map((s, i) => ({ cell: i, x: s.x, y: s.y + 2.9, z: s.z, width: 1.7 }))
  const legendLabels = legends.map((l, i) => ({ cell: i, x: l.x, y: l.y + 1.45 + (Math.floor(i / ROWS.length) % 2) * 0.32, z: l.z, width: 1.5 }))
  const creatureLabels = creatures.map((c, i) => ({ cell: i, x: c.x, y: c.y + 1.9 + (i % 2) * 0.32, z: c.z, width: 1.3 }))
  const headAt = (r: number, a: number, cell: number): LabelPlacement => {
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    return { cell, x, y: groundAt(d, x, z) + 3.4, z, width: 2.6 }
  }
  const headings = [headAt(7.0, d.seaward, 0), headAt(SHRINE_R, d.seaward + Math.PI, 1), headAt(CREATURE_R, d.seaward + Math.PI * 0.55, 2)]

  return { shrines, legends, creatures, avenue, shrineLabels, legendLabels, creatureLabels, headings }
}

export function MythologicalMonument({ d, focused }: LandmarkProps) {
  const layout = useMemo(() => layoutMonument(d), [d])

  const anchorOf = useCallback(
    (g: number): [number, number, number] => [layout.shrines[g].x, layout.shrines[g].y + TREE_LIFT, layout.shrines[g].z],
    [layout],
  )
  const axis = useMemo(() => ({ x: Math.sin(d.seaward), z: -Math.cos(d.seaward) }), [d])
  const kicker = useCallback(
    (g: number, f: { parents?: readonly string[] }) =>
      f.parents?.length ? `${GROUPS[g].name} · child of ${f.parents.join(' and ')}` : `${GROUPS[g].name} pantheon`,
    [],
  )
  const pick = useTreePick(d, focused, GROUPS, TREES, anchorOf, axis, kicker)

  // The two collections that are not trees: chosen directly, no group step.
  const selection = useDistrictSelection(d.id)
  const legendPicked = selection?.group === LEGEND_GROUP ? selection.item : -1
  const creaturePicked = selection?.group === CREATURE_GROUP ? selection.item : -1
  const pickIn = useCallback(
    (group: number) => (i: number) => select(i < 0 ? null : { district: d.id, group, item: i }),
    [d.id],
  )

  const shrineAtlas = useMemo(() => makeLabelAtlas(GROUPS.map((g) => g.name)), [])
  const legendAtlas = useMemo(() => makeLabelAtlas(LEGENDS.map((l) => l.name), { cellWidth: 384 }), [])
  const creatureAtlas = useMemo(() => makeLabelAtlas(CREATURES.map((c) => c.name)), [])
  const headings = useMemo(() => makeLabelAtlas(['Legends', 'Pantheons', 'Creatures']), [])

  return (
    <ExhibitHall focused={focused} onClear={() => select(null)}>
      {STEPS.map((s, i) => (
        <mesh key={i} geometry={STEP} scale={[s.r, 1, s.r]} position={[0, s.y, 0]} material={mat.stone} />
      ))}
      <mesh geometry={TOWER} position={[0, 1.26, 0]} material={mat.sandstone} />
      <mesh geometry={CROWN} position={[0, 15.3, 0]} material={ACCENT.mythology} />

      <mesh geometry={layout.avenue} material={RIBBON_MAT} receiveShadow />

      {/* The shrines, with their totems: the pantheons. */}
      <Exhibits
        d={d}
        focused={focused}
        items={layout.shrines}
        geometry={TOTEM}
        material={TOTEM_MAT}
        lift={1.1}
        parts={[{ geometry: SHRINE, material: mat.stone, lift: 0 }]}
        labelHeight={2.2}
        marker={{ geometry: SHRINE_RING, material: ACCENT.mythology, lift: -1.06 }}
        keys={false}
        picked={pick.group < GROUPS.length ? pick.group : -1}
        onPick={pick.pickGroup}
        onSubFocus={pick.onGroupSubFocus}
        place={(it, i) => [it.x, it.y + TREE_LIFT + TREES[i].height / 2, it.z]}
      />
      <InstancedLabels atlas={shrineAtlas} placements={layout.shrineLabels} fade={[40, 80]} />

      {/* The avenue of story stones: the legends. */}
      <Exhibits
        d={d}
        focused={focused}
        items={layout.legends}
        geometry={STELE}
        material={STELE_MAT}
        labelHeight={2.0}
        marker={{ geometry: HALO, material: ACCENT.mythology }}
        keys={selection?.group === LEGEND_GROUP}
        picked={legendPicked}
        onPick={pickIn(LEGEND_GROUP)}
      />
      <InstancedLabels atlas={legendAtlas} placements={layout.legendLabels} fade={[16, 30]} />

      {/* The outer ring: the creatures. */}
      <Exhibits
        d={d}
        focused={focused}
        items={layout.creatures}
        geometry={STATUE}
        material={STATUE_MAT}
        labelHeight={2.2}
        marker={{ geometry: STATUE_HALO, material: ACCENT.mythology }}
        keys={selection?.group === CREATURE_GROUP}
        picked={creaturePicked}
        onPick={pickIn(CREATURE_GROUP)}
      />
      <InstancedLabels atlas={creatureAtlas} placements={layout.creatureLabels} fade={[20, 36]} />
      <InstancedLabels atlas={headings} placements={layout.headings} fade={[60, 95]} />

      {pick.layout && (
        <Tree
          key={GROUPS[pick.group].id}
          d={d}
          focused={focused}
          group={GROUPS[pick.group]}
          layout={pick.layout}
          figures={pick.figures}
          picked={pick.figure}
          onPick={pick.pickFigure}
        />
      )}
    </ExhibitHall>
  )
}
