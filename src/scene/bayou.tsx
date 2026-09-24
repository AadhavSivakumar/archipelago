import { useCallback, useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { LIFE } from '../content/life'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelPlacement } from './exhibits'
import { layoutTree } from './familyTree'
import { ACCENT, DRESSED, groundAt, groundRibbon, lumpen, mat, RIBBON_MAT, roughen, scatter, std, type LandmarkProps } from './landmarkKit'
import { Tree, treeExtent, useTreePick } from './trees'

/**
 * Biological Bayou — a swamp at the head of a bay, a boardwalk through it,
 * and the tree of life in five trees.
 *
 * Bald cypresses stand in the shallows with their knees up; a boardwalk
 * winds between them; and along it stand five carved poles, one per tree —
 * the domains, the invertebrates, the vertebrates, the plants, the fungi.
 * Choose a pole and its tree hangs in the air above it.
 */

/** A bald cypress: a trunk that flares hard at the base, as swamp trees do. */
const cypress = (segments: number) => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(0.7, 0)
  at(0.42, 0.5)
  at(0.3, 1.2)
  at(0.24, 2.6)
  at(0.18, 4.4)
  at(0.12, 5.6)
  at(0, 5.6)
  return new THREE.LatheGeometry(p, segments)
}
// Coarse from the home view, fine when the district is looked at — see the
// Arboretum's canopies for why.
const CYPRESS = cypress(14)
const CYPRESS_HI = cypress(36)
const CANOPY_SEEDS = [0x3b1, 0x7c2]
const CANOPY = CANOPY_SEEDS.map((seed) => lumpen(new THREE.SphereGeometry(1.15, 18, 12), seed, 0.7, 6))
const CANOPY_HI = CANOPY_SEEDS.map((seed) => lumpen(new THREE.SphereGeometry(1.15, 34, 22), seed, 0.7, 6))
/** A cypress knee: the root that stands up out of the water. */
const KNEE = roughen(new THREE.ConeGeometry(0.22, 0.9, 7, 2), 0.05)

/** A carved pole, the marker for one tree of life. */
const POLE = (() => {
  const p: THREE.Vector2[] = []
  const at = (r: number, y: number) => p.push(new THREE.Vector2(r, y))
  at(0, 0)
  at(0.36, 0)
  at(0.32, 0.5)
  at(0.4, 0.8)
  at(0.3, 1.2)
  at(0.38, 1.6)
  at(0.28, 2.0)
  at(0.36, 2.4)
  at(0.2, 2.7)
  at(0, 2.75)
  return roughen(new THREE.LatheGeometry(p, 10), 0.03)
})()
const POLE_MAT = std({ color: '#ffffff', roughness: 0.8 }, DRESSED)
const POLE_RING = new THREE.TorusGeometry(0.8, 0.06, 10, 44)

const LAYOUTS = LIFE.map((g) => layoutTree(g.figures))
const TREE_LIFT = 3.0

export function BiologicalBayou({ d, focused }: LandmarkProps) {
  // Poles on an arc facing the water, so the camera comes in on them squarely.
  const poles = useMemo<Exhibit[]>(
    () =>
      LIFE.map((group, i) => {
        const a = d.seaward - 1.1 + (i / (LIFE.length - 1)) * 2.2
        const x = Math.cos(a) * 4.4
        const z = Math.sin(a) * 4.4
        return {
          name: group.name,
          article: group.article,
          kicker: `Tree of life · ${group.figures.length} kinds`,
          x,
          y: groundAt(d, x, z),
          z,
          yaw: -a,
          color: group.color,
          extent: treeExtent(LAYOUTS[i]),
          elevation: 0.3,
        }
      }),
    [d],
  )

  const anchorOf = useCallback(
    (g: number): [number, number, number] => [poles[g].x, poles[g].y + TREE_LIFT, poles[g].z],
    [poles],
  )
  const axis = useMemo(() => ({ x: Math.sin(d.seaward), z: -Math.cos(d.seaward) }), [d])
  const kicker = useCallback(
    (g: number, f: { parents?: readonly string[] }) =>
      f.parents?.length ? `${LIFE[g].name} · within ${f.parents.join(' and ')}` : LIFE[g].name,
    [],
  )
  const pick = useTreePick(d, focused, LIFE, LAYOUTS, anchorOf, axis, kicker)

  /*
    The cypresses stand to either side of the poles, never in front of them:
    the camera comes in along the seaward bearing, and a crown on that line
    would be the only thing it saw. Those that land within fifty degrees of
    it are dropped, and a few more are stood out in the shallows on the
    flanks, where a bayou's trees actually are.
  */
  const cypresses = useMemo(() => {
    const clear = (a: number) => {
      const diff = Math.abs(((a - d.seaward + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      return diff > 0.9
    }
    const inland = scatter(d, 18, 6.5, 12.0, 0x5b4).filter((t) => clear(Math.atan2(t.position[2], t.position[0])))
    const shallows = [-1.25, -0.95, 0.95, 1.25, -1.6, 1.6].map((off, i) => {
      const a = d.seaward + off
      const r = 12.5 + (i % 3) * 1.4
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      return { position: [x, groundAt(d, x, z), z] as [number, number, number], rotation: i * 1.9, scale: 0.85 + (i % 2) * 0.2 }
    })
    return [...inland, ...shallows]
  }, [d])
  const knees = useMemo(() => scatter(d, 30, 5.0, 12.0, 0x9d1), [d])

  // The boardwalk: a plank path winding from the shore in past the poles.
  const walk = useMemo(() => {
    const plank = new THREE.Color('#6b4a2e')
    const M = 60
    const line = Array.from({ length: M + 1 }, (_, k) => {
      const t = k / M
      const a = d.seaward + 0.9 - t * 1.8
      const r = 3.0 + Math.sin(t * Math.PI) * 4.0
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, color: plank }
    })
    // Held just above the water where it crosses a channel: planks on piles.
    return groundRibbon(d, line, 1.0, -d.pad + 0.45)
  }, [d])

  const atlas = useMemo(() => makeLabelAtlas(LIFE.map((g) => g.name)), [])
  const labels = useMemo<LabelPlacement[]>(
    () => poles.map((p, i) => ({ cell: i, x: p.x, y: p.y + 3.2, z: p.z, width: 2.2 })),
    [poles],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick.pickGroup(-1)}>
      <Instances geometry={focused ? CYPRESS_HI : CYPRESS} material={mat.wood} limit={cypresses.length}>
        {cypresses.map((t, i) => (
          <Instance key={i} position={t.position} rotation={[0, t.rotation, 0]} scale={t.scale} />
        ))}
      </Instances>
      {(focused ? CANOPY_HI : CANOPY).map((canopy, v) => (
        <Instances key={v} geometry={canopy} material={mat.leaf} limit={cypresses.length}>
          {cypresses
            .filter((_, i) => i % 2 === v)
            .map((t, i) => (
              <Instance
                key={i}
                position={[t.position[0], t.position[1] + 5.3 * t.scale, t.position[2]]}
                rotation={[0, t.rotation, 0]}
                scale={t.scale}
              />
            ))}
        </Instances>
      ))}
      <Instances geometry={KNEE} material={mat.wood} limit={knees.length}>
        {knees.map((k, i) => (
          <Instance key={i} position={[k.position[0], k.position[1] + 0.3, k.position[2]]} rotation={[0, k.rotation, 0]} scale={k.scale * 0.8} />
        ))}
      </Instances>

      <mesh geometry={walk} material={RIBBON_MAT} receiveShadow />

      <Exhibits
        d={d}
        focused={focused}
        items={poles}
        geometry={POLE}
        material={POLE_MAT}
        labelHeight={3.0}
        marker={{ geometry: POLE_RING, material: ACCENT.life }}
        keys={false}
        picked={pick.group}
        onPick={pick.pickGroup}
        onSubFocus={pick.onGroupSubFocus}
        place={(it, i) => [it.x, it.y + TREE_LIFT + LAYOUTS[i].height / 2, it.z]}
      />
      <InstancedLabels atlas={atlas} placements={labels} fade={[40, 80]} />

      {pick.layout && (
        <Tree
          key={LIFE[pick.group].id}
          d={d}
          focused={focused}
          group={LIFE[pick.group]}
          layout={pick.layout}
          figures={pick.figures}
          picked={pick.figure}
          onPick={pick.pickFigure}
        />
      )}
    </ExhibitHall>
  )
}
