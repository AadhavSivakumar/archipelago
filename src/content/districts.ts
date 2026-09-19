import type { DistrictId } from '../scene/districts'
import { ERAS, EVENTS, eraOf, yearLabel, type Era } from './history'
import { PANTHEONS } from './pantheons'
import { MEDIA } from './artworks'
import { BRANCHES, SUBJECTS } from './sciences'

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
const eraTopics = (): Topic[] =>
  (Object.keys(ERAS) as Era[]).map((id) => {
    const years = EVENTS.filter((ev) => eraOf(ev.year) === id).map((ev) => ev.year)
    const first = Math.min(...years)
    const last = Math.max(...years)
    return {
      name: ERAS[id].name,
      note: years.length === 1 ? yearLabel(first) : `${yearLabel(first)} – ${yearLabel(last)}`,
    }
  })

export const CONTENT: Record<DistrictId, DistrictContent> = {
  ideology: {
    summary: `${PANTHEONS.length} mythologies, each on an islet of its own, and the family tree of every god in them.`,
    topics: PANTHEONS.map((p) => ({ name: p.name, note: `${p.deities.length} figures, from ${p.deities[0].name} down.` })),
    hint: 'Choose an islet to raise its family tree, then any figure in it to read who they were.',
  },

  history: {
    summary: `A timeline of ${EVENTS.length} turning points in the human story, winding in from the first farms to the present day.`,
    topics: eraTopics(),
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
    summary: 'The peaks of human society — how people organise themselves, and how they live.',
    topics: [
      { name: 'Culture', note: 'What a people shares.' },
      { name: 'Politics', note: 'How it decides.' },
      { name: 'Business', note: 'How it trades.' },
      { name: 'Law', note: 'How it binds itself.' },
      { name: 'Wellness', note: 'How it keeps.' },
      { name: 'Cuisine', note: 'How it eats.' },
    ],
  },
}
