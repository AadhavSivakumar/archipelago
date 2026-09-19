/**
 * The Scientific Shores: the subjects, each a station along the beach.
 *
 * A subject rather than a discovery, because the Shores' brief is the realms
 * of science — the map of the territory, not the events on it. Those belong to
 * the Historical Habitat's timeline, and several are there.
 *
 * Grouped into the four branches a survey of science conventionally uses:
 * the formal sciences, which study what must be true; the physical, which
 * study what the world is made of; the life sciences, which study what
 * lives; and the applied, which put the rest to work.
 */
export type Branch = 'formal' | 'physical' | 'life' | 'applied'

export type Subject = { name: string; article: string; blurb: string; color: string; branch: Branch }

export const BRANCHES: readonly { id: Branch; name: string; color: string; note: string }[] = [
  { id: 'formal', name: 'Formal sciences', color: '#d8e4f7', note: 'What must be true, reasoned from axioms.' },
  { id: 'physical', name: 'Physical sciences', color: '#8fd6ff', note: 'What the world is made of, and how it moves.' },
  { id: 'life', name: 'Life sciences', color: '#86dda3', note: 'What lives, from a cell to a biosphere.' },
  { id: 'applied', name: 'Applied sciences', color: '#e8a06a', note: 'The rest, put to work.' },
]

export const SUBJECTS: readonly Subject[] = [
  { name: 'Mathematics', article: 'Mathematics', blurb: 'Number, structure, space and change.', color: '#d8e4f7', branch: 'formal' },
  { name: 'Logic', article: 'Logic', blurb: 'The rules of valid reasoning.', color: '#c4d3e8', branch: 'formal' },
  { name: 'Statistics', article: 'Statistics', blurb: 'What data can and cannot tell you.', color: '#b0c2dc', branch: 'formal' },
  { name: 'Computer science', article: 'Computer science', blurb: 'Computation, algorithms and information.', color: '#b9c7d6', branch: 'formal' },
  { name: 'Physics', article: 'Physics', blurb: 'Matter, energy, and the laws that bind them.', color: '#8fd6ff', branch: 'physical' },
  { name: 'Chemistry', article: 'Chemistry', blurb: 'What substances are made of, and how they change.', color: '#f2cf6b', branch: 'physical' },
  { name: 'Astronomy', article: 'Astronomy', blurb: 'Everything beyond the atmosphere.', color: '#c9b6ff', branch: 'physical' },
  { name: 'Earth science', article: 'Earth science', blurb: 'The planet itself: rock, ocean, air and climate.', color: '#c8a15a', branch: 'physical' },
  { name: 'Oceanography', article: 'Oceanography', blurb: 'The seas: their currents, chemistry and life.', color: '#6fb6d8', branch: 'physical' },
  { name: 'Meteorology', article: 'Meteorology', blurb: 'The atmosphere, and what it will do tomorrow.', color: '#a9c8e8', branch: 'physical' },
  { name: 'Biology', article: 'Biology', blurb: 'Living things, and the processes of life.', color: '#86dda3', branch: 'life' },
  { name: 'Genetics', article: 'Genetics', blurb: 'Heredity: how traits are carried and passed on.', color: '#9ec27a', branch: 'life' },
  { name: 'Microbiology', article: 'Microbiology', blurb: 'Life too small to see.', color: '#b8d98a', branch: 'life' },
  { name: 'Botany', article: 'Botany', blurb: 'Plants, from algae to the tallest trees.', color: '#7ccf8e', branch: 'life' },
  { name: 'Zoology', article: 'Zoology', blurb: 'Animals: their bodies, behaviour and kinds.', color: '#a4d68c', branch: 'life' },
  { name: 'Ecology', article: 'Ecology', blurb: 'Organisms and the environments they share.', color: '#9ec27a', branch: 'life' },
  { name: 'Neuroscience', article: 'Neuroscience', blurb: 'The nervous system, from a neuron to a mind.', color: '#e79ad8', branch: 'life' },
  { name: 'Medicine', article: 'Medicine', blurb: 'The science and practice of healing.', color: '#f0b7a0', branch: 'life' },
  { name: 'Engineering', article: 'Engineering', blurb: 'Applying all of the above to build what is needed.', color: '#e8a06a', branch: 'applied' },
  { name: 'Materials science', article: 'Materials science', blurb: 'What things can be made of, and why they hold.', color: '#d9a066', branch: 'applied' },
  { name: 'Robotics', article: 'Robotics', blurb: 'Machines that sense, decide and move.', color: '#e6c05a', branch: 'applied' },
  { name: 'Artificial intelligence', article: 'Artificial intelligence', blurb: 'Machines that learn and reason.', color: '#f2cf6b', branch: 'applied' },
]
