import { Exhibits, InstancedLabels, makeLabelAtlas, type Exhibit, type LabelAtlas, type LabelPlacement } from './exhibits'
import * as THREE from 'three'
import type { District } from './districts'
import { ERAS, eraOf, yearLabel, type Era, type HistoricEvent } from '../content/history'
import { groundAt, groundRibbon, QUARRIED, RIBBON_MAT, roughen, std } from './landmarkKit'

/**
 * A timeline as a district: events on stelae along a path that spirals in.
 *
 * Written for the Historical Habitat and shared with the Inventors' Inlet,
 * which is the same idea over a different list. Everything here is the
 * spiral and the stones; what stands at the centre is the district's own.
 */

/**
 * A stele: a rounded-top tablet, the shape a marker stone has had for five
 * thousand years. Extruded from a profile rather than boxed, so the top is an
 * arc and the edges carry a bevel, then roughened enough to be cut stone.
 */
export const STELE = (() => {
  const w = 0.5
  const h = 1.15
  const r = w / 2
  const shape = new THREE.Shape()
  shape.moveTo(-r, 0)
  shape.lineTo(r, 0)
  shape.lineTo(r, h - r)
  shape.absarc(0, h - r, r, 0, Math.PI, false)
  shape.lineTo(-r, 0)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 20,
  })
  geo.translate(0, 0, -0.08)
  return roughen(geo, 0.012)
})()
/** White, so the instance colour — the era's — is the stone's colour. */
const STELE_MAT = std({ color: '#ffffff', roughness: 0.86 }, QUARRIED)
/** A ring on the ground under the chosen stele. */
export const HALO = new THREE.TorusGeometry(0.72, 0.065, 10, 48)

const TIMELINE_TURNS = 3.5
/** Path centreline radii. The outer turn rides the plateau's shoulder. */
const TIMELINE_R_OUT = 9.2
const TIMELINE_R_IN = 4.3
const TIMELINE_PATH_W = 0.75
/** How far outside the path's edge each stele stands. */
const STELE_STANDOFF = 0.28

export type Timeline = {
  exhibits: Exhibit[]
  path: THREE.BufferGeometry
  atlas: LabelAtlas
  years: LabelPlacement[]
  eras: LabelPlacement[]
  /** Where the path begins: the obelisk stands here as its gate. */
  gate: { x: number; y: number; z: number }
}

/**
 * Lays the timeline out on the ground of one district.
 *
 * The spiral is sampled finely and walked by arc length, so the events are
 * evenly spaced along the path however the radius changes; the path itself is
 * a ribbon whose every vertex is dropped onto the terrain, so it climbs the
 * shoulder of the plateau where the outer turn leaves the flat.
 */
export function layoutTimeline(d: District, events: readonly HistoricEvent[]): Timeline {
  const n = events.length
  const theta0 = d.seaward
  const total = TIMELINE_TURNS * Math.PI * 2
  const radiusAt = (t: number) => TIMELINE_R_OUT - (TIMELINE_R_OUT - TIMELINE_R_IN) * t

  const K = 1200
  const samples: { theta: number; r: number; s: number }[] = []
  let s = 0
  let px = 0
  let pz = 0
  for (let k = 0; k <= K; k++) {
    const t = k / K
    const theta = theta0 + t * total
    const r = radiusAt(t)
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    if (k > 0) s += Math.hypot(x - px, z - pz)
    samples.push({ theta, r, s })
    px = x
    pz = z
  }
  const length = s

  /** The spiral at a distance along it. */
  const at = (dist: number) => {
    let lo = 1
    let hi = K
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (samples[mid].s < dist) lo = mid + 1
      else hi = mid
    }
    const b = samples[lo]
    const a = samples[lo - 1]
    const f = b.s === a.s ? 0 : Math.min(1, Math.max(0, (dist - a.s) / (b.s - a.s)))
    return { theta: a.theta + (b.theta - a.theta) * f, r: a.r + (b.r - a.r) * f }
  }

  // Events, evenly spaced along the path, each standing just outside its
  // outer edge and turned to face across it.
  const exhibits: Exhibit[] = events.map((ev, i) => {
    const { theta, r } = at((i / (n - 1)) * length)
    const rr = r + TIMELINE_PATH_W / 2 + STELE_STANDOFF
    const x = Math.cos(theta) * rr
    const z = Math.sin(theta) * rr
    const era = ERAS[eraOf(ev.year)]
    return {
      name: ev.label,
      article: ev.article,
      kicker: `${yearLabel(ev.year)} · ${era.name}`,
      x,
      y: groundAt(d, x, z),
      z,
      yaw: Math.atan2(-Math.cos(theta), -Math.sin(theta)),
      color: era.color,
    }
  })

  /*
    The path: a ribbon, coloured by the era of the last event passed. The
    colour changes exactly at each era's first stele, so the path is the
    legend for the stones standing on it.
  */
  const eraColourAt = (dist: number) => {
    const i = Math.min(n - 1, Math.floor((dist / length) * (n - 1) + 1e-6))
    return ERAS[eraOf(events[i].year)].color
  }
  const M = 420
  const line = Array.from({ length: M + 1 }, (_, k) => {
    const dist = (k / M) * length
    const { theta, r } = at(dist)
    // A shade under the stones' own colour, so the stelae stand out on it.
    return {
      x: Math.cos(theta) * r,
      z: Math.sin(theta) * r,
      color: new THREE.Color(eraColourAt(dist)).multiplyScalar(0.62),
    }
  })
  const path = groundRibbon(d, line, TIMELINE_PATH_W)

  /*
    Labels: the year over every stele, and the era's name over the first
    stele of each era. Years alternate between two heights so that neighbours
    a unit and a half apart do not overprint each other from the district
    view.
  */
  const eraIds = Object.keys(ERAS) as Era[]
  const atlas = makeLabelAtlas([...events.map((ev) => yearLabel(ev.year)), ...eraIds.map((id) => ERAS[id].name)])
  // Three heights, cycling, so that neighbours a unit apart do not overprint.
  const years: LabelPlacement[] = exhibits.map((e, i) => ({
    cell: i,
    x: e.x,
    y: e.y + 1.4 + (i % 3) * 0.3,
    z: e.z,
    width: 1.25,
  }))
  const eras: LabelPlacement[] = []
  let lastEra: Era | null = null
  events.forEach((ev, i) => {
    const era = eraOf(ev.year)
    if (era === lastEra) return
    lastEra = era
    const e = exhibits[i]
    eras.push({ cell: n + eraIds.indexOf(era), x: e.x, y: e.y + 2.55, z: e.z, width: 2.4 })
  })

  // The gate: a little before the first stele, on the path's own bearing.
  const gateR = TIMELINE_R_OUT + 1.0
  const gateTheta = theta0 - 0.32
  const gx = Math.cos(gateTheta) * gateR
  const gz = Math.sin(gateTheta) * gateR
  const gate = { x: gx, y: groundAt(d, gx, gz), z: gz }

  return { exhibits, path, atlas, years, eras, gate }
}


/**
 * The path, the stones on it, and their labels — one collection of exhibits.
 *
 * The parent owns the choice and the monument; this draws the timeline it
 * laid out and reports picks through `onPick` in the events' own indices.
 */
export function Timeline({
  d,
  focused,
  layout,
  picked,
  onPick,
  marker,
}: {
  d: District
  focused: boolean
  layout: Timeline
  picked: number
  onPick: (index: number) => void
  /** The ring under the chosen stone: the district's accent. */
  marker: THREE.Material
}) {
  return (
    <>
      <mesh geometry={layout.path} material={RIBBON_MAT} receiveShadow />
      <Exhibits
        d={d}
        focused={focused}
        items={layout.exhibits}
        geometry={STELE}
        material={STELE_MAT}
        labelHeight={3.05}
        extent={3.0}
        marker={{ geometry: HALO, material: marker }}
        picked={picked}
        onPick={onPick}
      />
      {/* Years are for someone standing among the stones; eras read from the
          district view and go before the home view. */}
      <InstancedLabels atlas={layout.atlas} placements={layout.years} fade={[18, 34]} />
      <InstancedLabels atlas={layout.atlas} placements={layout.eras} fade={[60, 95]} />
    </>
  )
}
