import type { DistrictId } from '../scene/districts'
import { ERAS, EVENTS, eraOf, yearLabel, type Era } from './history'
import { PANTHEONS } from './pantheons'
import { MEDIA } from './artworks'
import { BRANCHES, SUBJECTS } from './sciences'
import { COUNTRIES } from '../scene/worldCountries'

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
export type NavGroup = { name: string; color: string; items: NavItem[] }
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

function artGroups(): NavGroup[] {
  let offset = 0
  return MEDIA.map((medium) => {
    const items = medium.works.map((work, i) => ({ name: work.title, note: work.artist, index: offset + i }))
    offset += medium.works.length
    return { name: medium.name, color: medium.color, items }
  })
}

export const NAV: Record<DistrictId, NavConfig> = {
  history: {
    groups: ERA_IDS.map((era) => ({
      name: ERAS[era].name,
      color: ERAS[era].color,
      items: EVENTS.map((ev, i) => ({ ev, i }))
        .filter(({ ev }) => eraOf(ev.year) === era)
        .map(({ ev, i }) => ({ name: ev.label, note: yearLabel(ev.year), index: i })),
    })).filter((group) => group.items.length > 0),
    groupsSelectable: false,
  },
  ideology: {
    groups: PANTHEONS.map((p) => ({
      name: p.name,
      color: p.color,
      items: p.deities.map((deity, i) => ({
        name: deity.name,
        note: deity.parents?.length ? `child of ${deity.parents.join(' & ')}` : undefined,
        index: i,
      })),
    })),
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
  anthropology: { groups: [], groupsSelectable: false },
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
