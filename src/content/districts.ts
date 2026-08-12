import type { DistrictId } from '../scene/districts'

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
}

export const CONTENT: Record<DistrictId, DistrictContent> = {
  ideology: {
    summary:
      'The courses belief systems have charted — from logical reason, through ancient myth, to divine doctrine.',
    topics: [
      { name: 'Reason', note: 'Belief arrived at by argument.' },
      { name: 'Myth', note: 'Belief carried by story.' },
      { name: 'Doctrine', note: 'Belief held as revealed.' },
    ],
  },

  history: {
    summary: 'The annals of world history, and the ways the past keeps shaping the present.',
    topics: [
      { name: 'World History', note: 'The record, in sequence.' },
      { name: 'Cause and Consequence', note: 'How the past shapes the present.' },
    ],
  },

  geography: {
    summary: "Earth's landscapes, from the highest ground to the densest.",
    topics: [
      { name: 'Mountains', note: 'Towering ground.' },
      { name: 'Cities', note: 'Ground made dense.' },
      { name: 'Landscapes', note: 'Everything in between.' },
    ],
  },

  science: {
    summary: 'The realms of science, from the logic underneath to the cosmos overhead.',
    topics: [
      { name: 'Mathematics', note: 'The logic underneath.' },
      { name: 'Biology', note: 'The logic of living things.' },
      { name: 'Technology', note: 'Knowledge put to work.' },
      { name: 'Engineering', note: 'Knowledge built.' },
      { name: 'The Cosmos', note: 'Everything overhead.' },
    ],
  },

  art: {
    summary: 'Groves of creativity, from the oldest forms of making to the newest.',
    topics: [
      { name: 'Painting', note: 'Making, in pigment.' },
      { name: 'Literature', note: 'Making, in language.' },
      { name: 'Music', note: 'Making, in time.' },
      { name: 'Fashion', note: 'Making, worn.' },
      { name: 'Architecture', note: 'Making, inhabited.' },
      { name: 'Interactive Entertainment', note: 'Making, played.' },
    ],
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
