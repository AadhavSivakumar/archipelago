import type { Deity, Pantheon } from '../content/pantheons'

export type TreeNode = { deity: Deity; gen: number; x: number; y: number }
export type TreeLayout = {
  nodes: TreeNode[]
  /** Pairs of node indices: parent, child. */
  edges: [number, number][]
  rows: number
  halfWidth: number
  height: number
}

export const TREE_DX = 0.95
export const TREE_DY = 1.0

/**
 * Lays a pantheon out as a family tree: one row per generation, the
 * primordials at the top.
 *
 * A figure's generation is one below its parents'. A figure with no parents
 * but with children — a consort who married into the line, like Leto or
 * Sigyn — sits level with its partner rather than up among the primordials,
 * which is what a reader expects and what stops the top row filling with
 * mortals. Figures with neither parents nor children stand in the top row as
 * members of the pantheon apart from its line, which is what they are.
 *
 * Within a row, figures are ordered under the average position of their
 * parents so that lines cross as little as a single pass allows; consorts go
 * beside their partner. Nothing here is a general graph-drawing algorithm,
 * and it does not need to be: the largest of these has thirty-four figures.
 */
export function layoutTree(p: Pantheon): TreeLayout {
  const n = p.deities.length
  const index = new Map(p.deities.map((d, i) => [d.name, i]))
  const parentsOf = (i: number) =>
    (p.deities[i].parents ?? []).map((name) => index.get(name)).filter((j): j is number => j !== undefined)

  // Generation, by the longest line of descent from a primordial.
  const gen = new Array<number>(n).fill(-1)
  const visiting = new Set<number>()
  const generation = (i: number): number => {
    if (gen[i] >= 0) return gen[i]
    if (visiting.has(i)) return 0
    visiting.add(i)
    const ps = parentsOf(i)
    const v = ps.length ? Math.max(...ps.map(generation)) + 1 : 0
    visiting.delete(i)
    gen[i] = v
    return v
  }
  for (let i = 0; i < n; i++) generation(i)

  // Consorts, level with their partner.
  const children = Array.from({ length: n }, () => [] as number[])
  for (let i = 0; i < n; i++) for (const j of parentsOf(i)) children[j].push(i)
  const partnerOf = new Array<number>(n).fill(-1)
  for (let i = 0; i < n; i++) {
    if (parentsOf(i).length || children[i].length === 0) continue
    let level = -1
    for (const c of children[i]) {
      for (const j of parentsOf(c)) {
        if (j !== i && parentsOf(j).length && gen[j] > level) {
          level = gen[j]
          partnerOf[i] = j
        }
      }
    }
    if (level >= 0) gen[i] = level
  }

  const rows = Math.max(...gen) + 1
  const x = new Array<number>(n).fill(0)
  for (let r = 0; r < rows; r++) {
    const members: number[] = []
    for (let i = 0; i < n; i++) if (gen[i] === r) members.push(i)

    const place = (order: number[]) =>
      order.forEach((i, c) => {
        x[i] = (c - (order.length - 1) / 2) * TREE_DX
      })

    // First under the parents, consorts last; then again with each consort
    // keyed just to the right of the partner it was placed for.
    const under = (i: number) => {
      const ps = parentsOf(i).filter((j) => gen[j] < r)
      return ps.length ? ps.reduce((a, j) => a + x[j], 0) / ps.length : Number.POSITIVE_INFINITY
    }
    members.sort((a, b) => under(a) - under(b))
    place(members)
    const beside = (i: number) => (partnerOf[i] >= 0 ? x[partnerOf[i]] + TREE_DX * 0.5 : x[i])
    members.sort((a, b) => beside(a) - beside(b))
    place(members)
  }

  const nodes: TreeNode[] = p.deities.map((deity, i) => ({
    deity,
    gen: gen[i],
    x: x[i],
    y: (rows - 1 - gen[i]) * TREE_DY,
  }))
  const edges: [number, number][] = []
  for (let i = 0; i < n; i++) for (const j of parentsOf(i)) edges.push([j, i])

  return {
    nodes,
    edges,
    rows,
    halfWidth: Math.max(...x.map(Math.abs)) + TREE_DX * 0.5,
    height: (rows - 1) * TREE_DY,
  }
}
