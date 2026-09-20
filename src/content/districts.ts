import type { DistrictId } from '../scene/districts'
import { ERAS, EVENTS, eraOf, yearLabel, type Era } from './history'
import { PANTHEONS } from './pantheons'
import { MEDIA } from './artworks'
import { BRANCHES, SUBJECTS } from './sciences'
import { SOCIETY } from './society'
import { FAMILIES } from './languages'
import { LIFE } from './life'
import { COSMOS } from './cosmos'
import { INVENTIONS } from './inventions'
import { IDEOLOGIES } from './ideologies'
import { CREATURES, LEGENDS } from './lore'

/**
 * What each district is actually about.
 *
 * Kept out of scene/districts.ts on purpose. Every field in that file feeds the
 * terrain generator — angle and radius place the plateau, pad and padRadius
 * flatten it, relief and bumps shape the ground around it — and mixing
 * paragraphs into a table where the other columns are consumed by
 * `sampleHeight` would bury the geometry it exists to describe.
 *
 * The topics are not invented. Each district's blurb already enumerated them as
 * inert prose; this promotes them into structure so the dossier can render
 * them. Where a blurb listed six things there are six topics, and where it
 * listed two there are two — the counts are uneven because the source is.
 */

export type Topic = {
  name: string
  /** One line. Frames the topic; does not claim anything the blurb did not. */
  note: string
}

export type DistrictContent = {
  /** The blurb, tightened to a single sentence for the dossier's opening. */
  summary: string
  topics: Topic[]
  /** How to use what is there, for the districts that can be clicked around. */
  hint?: string
}

/*
  Four of the six now derive their topics from the exhibits themselves, so
  the panel can never list a subject the island does not have. The eras carry
  the years their events span; the pantheons and media carry their counts.
*/
const eraTopics = (events: readonly { year: number }[]): Topic[] =>
  (Object.keys(ERAS) as Era[]).map((id) => {
    const years = events.filter((ev) => eraOf(ev.year) === id).map((ev) => ev.year)
    const first = Math.min(...years)
    const last = Math.max(...years)
    return {
      name: ERAS[id].name,
      note: years.length === 1 ? yearLabel(first) : `${yearLabel(first)} – ${yearLabel(last)}`,
    }
  })

export const CONTENT: Record<DistrictId, DistrictContent> = {
  ideology: {
    summary: `${IDEOLOGIES.length} schools of thought, each on an islet of its own, each a family tree of ideas.`,
    topics: IDEOLOGIES.map((g) => ({ name: g.name, note: `${g.figures.length} ideas, from ${g.figures[0].name} down.` })),
    hint: 'Choose an islet to raise its tree of ideas, then any idea in it to read about it.',
  },

  mythology: {
    summary: `${PANTHEONS.length} pantheons with their family trees, ${LEGENDS.length} legends along the avenue, and ${CREATURES.length} creatures on the outer ring.`,
    topics: [
      { name: 'Pantheons', note: PANTHEONS.map((p) => p.name).join(', ') + '.' },
      { name: 'Legends', note: `${LEGENDS.length} stories, from the Enūma Eliš to the Dreamtime.` },
      { name: 'Creatures', note: `${CREATURES.length} of them, from the dragon to the wendigo.` },
    ],
    hint: "Choose a shrine to raise its pantheon's family tree, a stone on the avenue for a legend, or a statue for a creature.",
  },

  history: {
    summary: `A timeline of ${EVENTS.length} turning points in the human story, winding in from the first farms to the present day.`,
    topics: eraTopics(EVENTS),
    hint: 'Choose a stone to read what happened. The arrow keys walk the years.',
  },

  geography: {
    summary: "Earth's landscapes, from the highest ground to the densest.",
    topics: [
      { name: 'Mountains', note: 'Towering ground.' },
      { name: 'Cities', note: 'Ground made dense.' },
      { name: 'Landscapes', note: 'Everything in between.' },
    ],
    hint: 'Choose a country to read about it.',
  },

  science: {
    summary: `The realms of science: ${SUBJECTS.length} subjects in ${BRANCHES.length} branches, each a station along the shore.`,
    topics: BRANCHES.map((branch) => ({
      name: branch.name,
      note: SUBJECTS.filter((s) => s.branch === branch.id)
        .map((s) => s.name)
        .join(', '),
    })),
    hint: 'Choose a station on the beach to read about its subject.',
  },

  art: {
    summary: `${MEDIA.reduce((n, m) => n + m.works.length, 0)} works that other works are measured against, in ${MEDIA.length} galleries, one per medium.`,
    topics: MEDIA.map((m) => ({ name: m.name, note: `${m.works.length} works, ${m.works[0].year} onward.` })),
    hint: 'Choose a pedestal to read about the work on it; hover to see what each one is.',
  },

  anthropology: {
    summary: `The peaks of human society: ${SOCIETY.reduce((n, t) => n + t.items.length, 0)} waymarks on six trails, one for each way people live together.`,
    topics: SOCIETY.map((t) => ({ name: t.name, note: `${t.note} ${t.items.length} signs.` })),
    hint: 'Choose a signpost on any trail to read about it.',
  },

  languages: {
    summary: `${FAMILIES.length} language families, each a stone on the rim of the lagoon, each a family tree over the water.`,
    topics: FAMILIES.map((f) => ({ name: f.name, note: `${f.figures.length} tongues, from ${f.figures[0].name} down.` })),
    hint: 'Choose a stone to raise its family tree over the lagoon, then any tongue in it to read about it.',
  },

  life: {
    summary: `The tree of life in ${LIFE.length} trees, from the domains down to the species at the tips.`,
    topics: LIFE.map((g) => ({ name: g.name, note: `${g.figures.length} kinds, from ${g.figures[0].name} down.` })),
    hint: 'Choose a carved pole to raise its tree, then any kind of living thing in it.',
  },

  cosmos: {
    summary: 'The solar system on an orrery, and three rings around it: the moons, the probes, and the constellations.',
    topics: COSMOS.map((g) => ({ name: g.name, note: `${g.items.length} on the ${g.id === 'planets' ? 'orrery' : 'ring'}.` })),
    hint: 'Choose a planet on the orrery, or any marker on the rings around it.',
  },

  inventions: {
    summary: `${INVENTIONS.length} things people made, on a second spiral: from the hand axe to the transformer.`,
    topics: eraTopics(INVENTIONS),
    hint: 'Choose a stone to read about what was made. The arrow keys walk the years.',
  },
}
