import type { DistrictId } from '../scene/districts'
import { ERAS, EVENTS, eraOf, yearLabel, type Era, type HistoricEvent } from './history'
import { PANTHEONS } from './pantheons'
import { MEDIA } from './artworks'
import { BRANCHES, SUBJECTS } from './sciences'
import { COUNTRIES } from '../scene/worldCountries'
import { SOCIETY } from './society'
import { FAMILIES } from './languages'
import { LIFE } from './life'
import { COSMOS } from './cosmos'
import { INVENTIONS } from './inventions'
import { IDEOLOGIES } from './ideologies'
import { CREATURES, LEGENDS } from './lore'
import type { Figure } from '../scene/familyTree'

/**
 * What is chosen within a district, as the page and the scene both see it.
 *
 * `group` and `item` index into that district's navigation below; `item` is
 * -1 when the group itself is the thing chosen, which only the Ideology Isles
 * allow (a pantheon, before any of its gods). The district is carried so a
 * selection can never be applied to the wrong island: one left over from the
 * last district is simply not for the new one, rather than a stale index that
 * happens to be in range.
 */
export type Selection = { district: DistrictId; group: number; item: number }

export type NavItem = {
  name: string
  note?: string
  /** The district's own index for this thing: an event, a god, a country. */
  index: number
}
export type NavGroup = {
  name: string
  color: string
  items: NavItem[]
  /** Overrides the district's rule for this group alone. */
  selectable?: boolean
}
export type NavConfig = {
  groups: NavGroup[]
  /** Whether choosing a group is itself a selection (a pantheon), or only a
      way of browsing (an era, a medium). */
  groupsSelectable: boolean
}

/*
  The flat, two-dimensional index of everything the islands hold, so that a
  visitor who would rather read a list than hunt a stone can do so — and so
  that a screen reader has a route to every exhibit, which the instanced
  meshes in the scene cannot offer.

  Derived from the same content the districts are built from, so the two can
  never disagree about what exists.
*/
const ERA_IDS = Object.keys(ERAS) as Era[]

/** Events by era, in the events' own indices. */
function eraGroups(events: readonly HistoricEvent[]): NavGroup[] {
  return ERA_IDS.map((era) => ({
    name: ERAS[era].name,
    color: ERAS[era].color,
    items: events
      .map((ev, i) => ({ ev, i }))
      .filter(({ ev }) => eraOf(ev.year) === era)
      .map(({ ev, i }) => ({ name: ev.label, note: yearLabel(ev.year), index: i })),
  })).filter((group) => group.items.length > 0)
}

/** Trees, one group each; a figure's note names what it comes from. */
function treeGroups(groups: readonly { name: string; color: string; figures: readonly Figure[] }[], from: string): NavGroup[] {
  return groups.map((g) => ({
    name: g.name,
    color: g.color,
    items: g.figures.map((f, i) => ({ name: f.name, note: f.parents?.length ? `${from} ${f.parents.join(' & ')}` : undefined, index: i })),
  }))
}

function artGroups(): NavGroup[] {
  let offset = 0
  return MEDIA.map((medium) => {
    const items = medium.works.map((work, i) => ({ name: work.title, note: work.artist, index: offset + i }))
    offset += medium.works.length
    return { name: medium.name, color: medium.color, items }
  })
}

export const NAV: Record<DistrictId, NavConfig> = {
  history: { groups: eraGroups(EVENTS), groupsSelectable: false },
  inventions: { groups: eraGroups(INVENTIONS), groupsSelectable: false },
  languages: { groups: treeGroups(FAMILIES, 'from'), groupsSelectable: true },
  life: { groups: treeGroups(LIFE, 'within'), groupsSelectable: true },
  cosmos: {
    groups: COSMOS.map((g) => ({
      name: g.name,
      color: g.color,
      items: g.items.map((it, i) => ({ name: it.name, note: it.note, index: i })),
    })),
    groupsSelectable: false,
  },
  ideology: { groups: treeGroups(IDEOLOGIES, 'from'), groupsSelectable: true },
  mythology: {
    groups: [
      ...treeGroups(
        PANTHEONS.map((p) => ({ name: p.name, color: p.color, figures: p.deities })),
        'child of',
      ),
      {
        name: 'Legends',
        color: '#e8d8a6',
        items: LEGENDS.map((l, i) => ({ name: l.name, note: l.origin, index: i })),
        selectable: false,
      },
      {
        name: 'Creatures',
        color: '#b9c7d6',
        items: CREATURES.map((c, i) => ({ name: c.name, note: c.origin, index: i })),
        selectable: false,
      },
    ],
    groupsSelectable: true,
  },
  geography: {
    groups: [
      {
        name: 'Countries',
        color: '#86dda3',
        items: COUNTRIES.map((c, id) => ({ name: c.name, index: id })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    ],
    groupsSelectable: false,
  },
  science: {
    groups: BRANCHES.map((branch) => ({
      name: branch.name,
      color: branch.color,
      items: SUBJECTS.map((s, i) => ({ s, i }))
        .filter(({ s }) => s.branch === branch.id)
        .map(({ s, i }) => ({ name: s.name, index: i })),
    })),
    groupsSelectable: false,
  },
  art: { groups: artGroups(), groupsSelectable: false },
  anthropology: {
    groups: (() => {
      let offset = 0
      return SOCIETY.map((trail) => {
        const items = trail.items.map((it, i) => ({ name: it.name, index: offset + i }))
        offset += trail.items.length
        return { name: trail.name, color: trail.color, items }
      })
    })(),
    groupsSelectable: false,
  },
}

/** The group an item belongs to, for a district reporting a click in the scene. */
export function groupOf(district: DistrictId, index: number) {
  return Math.max(0, NAV[district].groups.findIndex((group) => group.items.some((it) => it.index === index)))
}

/** The strip's height, for the chrome above it to keep clear of. */
export function navHeight(district: DistrictId | null) {
  const groups = district ? NAV[district].groups : []
  if (groups.length === 0) return 0
  return groups.length > 1 ? 98 : 62
}
