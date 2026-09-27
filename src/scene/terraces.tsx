import { useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ORGANISMS, RANKS, TAXA } from '../content/taxonomy'
import { groupOf } from '../content/navigation'
import { ExhibitHall, Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelPlacement } from './exhibits'
import { ACCENT, DRESSED, mat, std, type LandmarkProps } from './landmarkKit'
import { select, useDistrictSelection } from '../state/selection'

/**
 * Taxonomic Terraces — the ranks of classification as a stepped pyramid.
 *
 * Eight terraces, one per rank: Domain on the small summit, Species on the
 * broad bottom step. Each taxon is a marker on its rank's terrace, and a
 * line runs from it up to the taxon above it. A dozen organisms are
 * classified all the way down, and where two share a taxon they share its
 * marker, so the lines branch exactly where the lineages part: human and
 * wolf run together from Eukarya to Mammalia and split at the order.
 *
 * The summit is the root because the finer ranks hold the most taxa: twelve
 * species need the widest ring, two domains the smallest. It also reads the
 * way the family trees elsewhere do, the most general at the top.
 *
 * Choosing any taxon lights its whole line, up to its domain and down to
 * every species under it.
 */

const N = RANKS.length
/** Outer radius of each rank's terrace; summit first. */
const RADIUS = RANKS.map((_, r) => 2.6 + r * 1.2)
/** Height of each rank's tread. */
const STEP_H = 0.75
const treadY = (r: number) => (N - r) * STEP_H
/** Where a rank's markers stand: the middle of its tread. */
const ringR = (r: number) => (r === 0 ? 1.3 : (RADIUS[r - 1] + RADIUS[r]) / 2)
/** Markers stand on posts, so the lines between them clear the risers. */
const POST = 0.9

const RANK_COLOURS = ['#f2cf6b', '#e8a06a', '#e07a7a', '#d98ac9', '#a48ae0', '#7aa0e8', '#6fc4d0', '#86dda3']

const STEP = new THREE.CylinderGeometry(1, 1, 1, 72)
const STEP_MATS = RANK_COLOURS.map((c) =>
  std({ color: new THREE.Color(c).lerp(new THREE.Color('#d8d2c6'), 0.72), roughness: 0.85 }, DRESSED),
)
const MARKER = (() => {
  const post = new THREE.CylinderGeometry(0.05, 0.07, POST, 8).translate(0, POST / 2, 0).toNonIndexed()
  const orb = new THREE.SphereGeometry(0.27, 24, 16).translate(0, POST + 0.2, 0).toNonIndexed()
  return mergeGeometries([post, orb])!
})()
const MARKER_MAT = std({ color: '#ffffff', roughness: 0.4, metalness: 0.15 }, DRESSED)
const HALO = new THREE.TorusGeometry(0.5, 0.05, 10, 40)
const LINE_DIM = new THREE.LineBasicMaterial({ color: '#5a6272', transparent: true, opacity: 0.45 })
const LINE_LIT = new THREE.LineBasicMaterial({ color: '#ffe08a' })

/** Every line from a taxon up to its parent, as a flat position array. */
function edgeGeometry(nodes: Exhibit[], keep: (child: number) => boolean) {
  const pos: number[] = []
  TAXA.forEach((t, i) => {
    if (t.parent < 0 || !keep(i)) return
    const a = nodes[i]
    const b = nodes[t.parent]
    pos.push(a.x, a.y + POST + 0.2, a.z, b.x, b.y + POST + 0.2, b.z)
  })
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
}

export function TaxonomicTerraces({ d, focused }: LandmarkProps) {
  const picked = useDistrictSelection(d.id)?.item ?? -1
  const pick = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: groupOf(d.id, i), item: i }),
    [d.id],
  )

  // The chosen taxon's line: every ancestor, and every descendant.
  const lit = useMemo(() => {
    const on = new Set<number>()
    if (picked < 0) return on
    for (let i = picked; i >= 0; i = TAXA[i].parent) on.add(i)
    const members = new Set(TAXA[picked].members)
    TAXA.forEach((t, i) => {
      if (t.rank > TAXA[picked].rank && t.members.every((m) => members.has(m))) on.add(i)
    })
    return on
  }, [picked])

  /*
    Bearings. The organisms are spread over 240 degrees centred on the side
    the camera comes from, so the whole diagram faces the visitor; a taxon
    stands at the middle of the organisms it covers, which keeps branches
    from crossing because the organisms are ordered by lineage.
  */
  const nodes = useMemo<Exhibit[]>(() => {
    const span = (240 * Math.PI) / 180
    const organismAngle = (i: number) => d.seaward - span / 2 + ((i + 0.5) / ORGANISMS.length) * span
    return TAXA.map((t, i) => {
      const a = t.members.reduce((s, i) => s + organismAngle(i), 0) / t.members.length
      const r = ringR(t.rank)
      const species = t.rank === N - 1
      const organism = ORGANISMS[t.members[0]]
      return {
        name: species ? `${organism.common} (${t.name})` : t.name,
        article: t.article,
        kicker: species ? `Species · ${organism.common}` : `${RANKS[t.rank]} · ${t.members.length} of the ${ORGANISMS.length} here`,
        x: Math.cos(a) * r,
        y: treadY(t.rank),
        z: Math.sin(a) * r,
        // Off the chosen line, a marker greys out, so the line is what stands out.
        color: lit.size > 0 && !lit.has(i) ? '#6b7280' : RANK_COLOURS[t.rank],
        // Far enough back to see the line it belongs to, not only itself.
        extent: 5.5,
        elevation: 0.55,
      }
    })
  }, [d, lit])

  const dimEdges = useMemo(() => edgeGeometry(nodes, () => true), [nodes])
  const litEdges = useMemo(() => edgeGeometry(nodes, (i) => lit.has(i) && lit.has(TAXA[i].parent)), [nodes, lit])

  const atlas = useMemo(
    () => makeLabelAtlas(TAXA.map((t) => (t.rank === N - 1 ? ORGANISMS[t.members[0]].common : t.name)), { cellWidth: 384 }),
    [],
  )
  const labels = useMemo<LabelPlacement[]>(
    () => nodes.map((n, i) => ({ cell: i, x: n.x, y: n.y + POST + 0.72, z: n.z, width: TAXA[i].rank === N - 1 ? 2.0 : 1.9 })),
    [nodes],
  )

  // The rank names, on the flank just outside the diagram's span.
  const rankAtlas = useMemo(() => makeLabelAtlas([...RANKS]), [])
  const rankLabels = useMemo<LabelPlacement[]>(
    () =>
      RANKS.map((_, r) => {
        const a = d.seaward + (135 * Math.PI) / 180
        const rr = ringR(r)
        return { cell: r, x: Math.cos(a) * rr, y: treadY(r) + 0.55, z: Math.sin(a) * rr, width: 2.1 }
      }),
    [d],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick(-1)}>
      {/* The terraces: widest at the bottom, each rank a step. */}
      {RANKS.map((_, r) => (
        <mesh
          key={r}
          geometry={STEP}
          material={STEP_MATS[r]}
          scale={[RADIUS[r], treadY(r), RADIUS[r]]}
          position={[0, treadY(r) / 2, 0]}
        />
      ))}

      <lineSegments geometry={dimEdges} material={LINE_DIM} raycast={() => null} userData={{ noShadow: true }} />
      <lineSegments geometry={litEdges} material={LINE_LIT} raycast={() => null} userData={{ noShadow: true }} />

      <Exhibits
        d={d}
        focused={focused}
        items={nodes}
        geometry={MARKER}
        material={MARKER_MAT}
        labelHeight={2.1}
        highlight="#ffffff"
        marker={{ geometry: HALO, material: ACCENT.taxonomy }}
        picked={picked}
        onPick={pick}
      />
      <InstancedLabels atlas={atlas} placements={labels} fade={[28, 52]} />
      <InstancedLabels atlas={rankAtlas} placements={rankLabels} fade={[60, 95]} />
      {/* A capstone on the summit, in the district's colour. */}
      <mesh geometry={STEP} material={mat.marble} scale={[0.5, 0.3, 0.5]} position={[0, treadY(0) + 0.15, 0]} />
    </ExhibitHall>
  )
}
