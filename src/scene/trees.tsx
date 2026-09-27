import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { District } from './districts'
import type { Figure, TreeLayout } from './familyTree'
import { Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelAtlas, type LabelPlacement, type SubFocus } from './exhibits'
import { std } from './landmarkKit'
import { publishView, select, useDistrictSelection } from '../state/selection'

/**
 * A family tree in the air: figures as orbs, a row per generation, lines to
 * each parent, names under each one. Written for the gods of the Ideology
 * Isles and shared with the language families of the Lagoon and the tree of
 * life in the Bayou, which are the same shape over different names.
 *
 * `treeFigures` turns a layout into exhibits at a place in a district; `Tree`
 * draws them. The parent owns the choice and where the tree hangs.
 */

/** What a tree is a tree of: any named collection of figures. */
export type TreeGroup = { id: string; name: string; article: string; color: string }

/** One figure of a family tree. */
const ORB = new THREE.SphereGeometry(0.42, 40, 28)
const ORB_MAT = std({ color: '#ffffff', roughness: 0.32, metalness: 0.25 }, { grain: 8, mottle: 0.05, bump: 0.1, rough: 0.1 })
/** Lines of descent. */
const LINEAGE_MAT = new THREE.LineBasicMaterial({ color: '#f2cf6b', transparent: true, opacity: 0.7 })

const PANEL = new THREE.PlaneGeometry(1, 1)
const PANEL_MAT = new THREE.MeshBasicMaterial({
  color: '#0b1522',
  transparent: true,
  opacity: 0.9,
  // Writes depth, and is drawn first among the transparent things, so the
  // labels of whatever stands behind the tree are hidden rather than
  // showing through it as a second layer of text.
  side: THREE.DoubleSide,
  fog: false,
  toneMapped: false,
})

const NO_LINES = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))

/** Name labels, drawn the first time a group is chosen and kept. */
const ATLASES = new Map<string, LabelAtlas>()
function atlasFor(group: TreeGroup, figures: readonly Figure[]): LabelAtlas {
  let atlas = ATLASES.get(group.id)
  if (!atlas) {
    atlas = makeLabelAtlas(figures.map((f) => f.name))
    ATLASES.set(group.id, atlas)
  }
  return atlas
}

/**
 * The figures of a tree as exhibits, hung with its lowest row at `base` and
 * its rows spread along `axis` — the direction that reads left to right from
 * wherever the camera will stand.
 */
export function treeFigures(
  layout: TreeLayout,
  group: TreeGroup,
  base: [number, number, number],
  axis: { x: number; z: number },
  kicker: (figure: Figure) => string,
): Exhibit[] {
  return layout.nodes.map((node) => ({
    name: node.figure.name,
    article: node.figure.article,
    kicker: kicker(node.figure),
    x: base[0] + axis.x * node.x,
    y: base[1] + node.y,
    z: base[2] + axis.z * node.x,
    color: group.color,
    elevation: 0.16,
  }))
}

export function Tree({
  d,
  focused,
  group,
  layout,
  figures,
  picked,
  onPick,
  onSubFocus,
  keys = true,
}: {
  d: District
  focused: boolean
  group: TreeGroup
  layout: TreeLayout
  figures: readonly Exhibit[]
  picked: number
  onPick: (index: number) => void
  onSubFocus?: (view: SubFocus) => void
  keys?: boolean
}) {
  const lineage = useMemo(() => {
    if (figures.length === 0) return NO_LINES
    const pos = new Float32Array(layout.edges.length * 6)
    layout.edges.forEach(([a, b], k) => {
      const A = figures[a]
      const B = figures[b]
      pos.set([A.x, A.y, A.z, B.x, B.y, B.z], k * 6)
    })
    return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [layout, figures])

  const names = useMemo<LabelPlacement[]>(
    () => figures.map((f, i) => ({ cell: i, x: f.x, y: f.y - 0.82, z: f.z, width: 2.7 })),
    [figures],
  )
  const atlas = useMemo(() => atlasFor(group, layout.nodes.map((n) => n.figure)), [group, layout])

  /*
    A dark panel behind the tree, so it is read against one steady colour
    instead of against whatever the camera happens to see through it — a
    tower, a hillside, the sea. Sized to the figures, set a little behind
    them on the side away from the camera, and facing the way the tree does.
  */
  const backdrop = useMemo(() => {
    if (figures.length === 0) return null
    const ox = Math.cos(d.seaward)
    const oz = Math.sin(d.seaward)
    const ax = Math.sin(d.seaward)
    const az = -Math.cos(d.seaward)
    let lo = Infinity, hi = -Infinity, bottom = Infinity, top = -Infinity
    let cx = 0, cz = 0
    for (const f of figures) {
      const along = f.x * ax + f.z * az
      lo = Math.min(lo, along)
      hi = Math.max(hi, along)
      bottom = Math.min(bottom, f.y)
      top = Math.max(top, f.y)
      cx += f.x
      cz += f.z
    }
    cx /= figures.length
    cz /= figures.length
    // Recentre along the tree's own axis, then step back from the camera.
    const mid = (lo + hi) / 2
    const offAlong = mid - (cx * ax + cz * az)
    return {
      position: [cx + ax * offAlong - ox * 0.9, (bottom + top) / 2 - 0.35, cz + az * offAlong - oz * 0.9] as [number, number, number],
      scale: [hi - lo + 3.2, top - bottom + 2.9, 1] as [number, number, number],
      rotation: [0, Math.atan2(ox, oz), 0] as [number, number, number],
    }
  }, [figures, d])

  return (
    <group userData={{ noShadow: true }}>
      {backdrop && <mesh geometry={PANEL} material={PANEL_MAT} {...backdrop} raycast={() => null} renderOrder={-1} />}
      <lineSegments geometry={lineage} material={LINEAGE_MAT} raycast={() => null} />
      <Exhibits
        d={d}
        focused={focused}
        items={figures}
        geometry={ORB}
        material={ORB_MAT}
        labelHeight={0.95}
        extent={2.6}
        highlight="#ffffff"
        keys={keys}
        picked={picked}
        onPick={onPick}
        onSubFocus={onSubFocus}
        castShadow={false}
      />
      <InstancedLabels atlas={atlas} placements={names} />
    </group>
  )
}

/**
 * The two-level choice a district of trees has: a group (a pantheon, a
 * language family, a kingdom) and, once one is chosen, a figure within it.
 *
 * Everything the Ideology Isles worked out about that — the group view
 * published until a figure narrows it, the step back to the group when the
 * figure is let go of, the arrow keys walking the groups until a figure
 * takes them — in one place, for the Lagoon and the Bayou to share.
 */
export function useTreePick(
  d: District,
  focused: boolean,
  groups: readonly TreeGroup[],
  layouts: readonly TreeLayout[],
  anchorOf: (group: number) => [number, number, number],
  axis: { x: number; z: number },
  kicker: (group: number, figure: Figure) => string,
) {
  const selection = useDistrictSelection(d.id)
  const group = selection?.group ?? -1
  const figure = selection?.item ?? -1

  const pickGroup = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: i, item: -1 }),
    [d.id],
  )
  const pickFigure = useCallback(
    (i: number) => select({ district: d.id, group, item: i }),
    [d.id, group],
  )

  // A district may have groups beyond its trees — the Monument's legends and
  // creatures — which choose nothing to hang in the air.
  const layout = group >= 0 && group < layouts.length ? layouts[group] : null
  const figures = useMemo<Exhibit[]>(
    () => (layout ? treeFigures(layout, groups[group], anchorOf(group), axis, (f) => kicker(group, f)) : []),
    [layout, group, groups, anchorOf, axis, kicker],
  )

  // What the page describes while no figure is chosen: the group. Kept so
  // that letting go of a figure widens back to it rather than to nothing.
  const groupView = useRef<SubFocus | null>(null)
  useLayoutEffect(() => {
    if (group >= 0 && figure < 0 && groupView.current) publishView(groupView.current)
  }, [group, figure])
  const onGroupSubFocus = useCallback(
    (view: SubFocus) => {
      groupView.current = view
      if (figure < 0) publishView(view)
    },
    [figure],
  )

  // The arrow keys walk the groups while none has a figure chosen under it;
  // the tree's own collection takes them over once one does.
  useEffect(() => {
    if (!focused || figure >= 0) return
    const n = groups.length
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') pickGroup(group < 0 ? 0 : (group + 1) % n)
      else if (e.key === 'ArrowLeft') pickGroup(group < 0 ? n - 1 : (group - 1 + n) % n)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, figure, group, groups.length, pickGroup])

  return { group, figure, pickGroup, pickFigure, layout, figures, onGroupSubFocus }
}

/** The half-extent the camera frames for a whole tree. */
export const treeExtent = (layout: TreeLayout) => Math.max(layout.halfWidth, layout.height / 2) + 0.7
