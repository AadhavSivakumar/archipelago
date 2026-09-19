/**
 * The Scientific Shores: the subjects, each a station along the beach.
 *
 * A subject rather than a discovery, because the Shores' brief is the realms
 * of science — the map of the territory, not the events on it. Those belong to
 * the Historical Habitat's timeline, and several are there.
 */
export type Subject = { name: string; article: string; blurb: string; color: string }

export const SUBJECTS: readonly Subject[] = [
  { name: 'Mathematics', article: 'Mathematics', blurb: 'Number, structure, space and change.', color: '#d8e4f7' },
  { name: 'Physics', article: 'Physics', blurb: 'Matter, energy, and the laws that bind them.', color: '#8fd6ff' },
  { name: 'Chemistry', article: 'Chemistry', blurb: 'What substances are made of, and how they change.', color: '#f2cf6b' },
  { name: 'Biology', article: 'Biology', blurb: 'Living things, and the processes of life.', color: '#86dda3' },
  { name: 'Astronomy', article: 'Astronomy', blurb: 'Everything beyond the atmosphere.', color: '#c9b6ff' },
  { name: 'Earth science', article: 'Earth science', blurb: 'The planet itself: rock, ocean, air and climate.', color: '#c8a15a' },
  { name: 'Medicine', article: 'Medicine', blurb: 'The science and practice of healing.', color: '#f0b7a0' },
  { name: 'Neuroscience', article: 'Neuroscience', blurb: 'The nervous system, from a neuron to a mind.', color: '#e79ad8' },
  { name: 'Ecology', article: 'Ecology', blurb: 'Organisms and the environments they share.', color: '#9ec27a' },
  { name: 'Computer science', article: 'Computer science', blurb: 'Computation, algorithms and information.', color: '#b9c7d6' },
  { name: 'Engineering', article: 'Engineering', blurb: 'Applying all of the above to build what is needed.', color: '#e8a06a' },
]
