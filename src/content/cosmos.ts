/**
 * The Celestial Cay: the solar system as an orrery, and the sky around it.
 *
 * Four collections. The planets stand on the orrery itself — the Sun at the
 * centre, each planet on its ring, at a spacing that is not to scale because
 * nothing that put Neptune in the same frame as Mercury could be. The moons,
 * the probes and the constellations stand on rings of their own around it.
 */
export type Body = {
  name: string
  article: string
  /** Orrery ring radius and sphere size, planets only. */
  orbit?: number
  size?: number
  note?: string
}

export type CosmosGroup = { id: string; name: string; color: string; items: readonly Body[] }

export const COSMOS: readonly CosmosGroup[] = [
  {
    id: 'planets',
    name: 'Planets',
    color: '#f2cf6b',
    items: [
      { name: 'The Sun', article: 'Sun', orbit: 0, size: 0.75, note: 'The star' },
      { name: 'Mercury', article: 'Mercury (planet)', orbit: 1.35, size: 0.11 },
      { name: 'Venus', article: 'Venus', orbit: 1.8, size: 0.19 },
      { name: 'Earth', article: 'Earth', orbit: 2.3, size: 0.2 },
      { name: 'Mars', article: 'Mars', orbit: 2.8, size: 0.14 },
      { name: 'Ceres', article: 'Ceres (dwarf planet)', orbit: 3.25, size: 0.06, note: 'Dwarf planet' },
      { name: 'Jupiter', article: 'Jupiter', orbit: 3.9, size: 0.44 },
      { name: 'Saturn', article: 'Saturn', orbit: 4.75, size: 0.38 },
      { name: 'Uranus', article: 'Uranus', orbit: 5.45, size: 0.28 },
      { name: 'Neptune', article: 'Neptune', orbit: 6.05, size: 0.27 },
      { name: 'Pluto', article: 'Pluto', orbit: 6.6, size: 0.07, note: 'Dwarf planet' },
      { name: 'Eris', article: 'Eris (dwarf planet)', orbit: 7.1, size: 0.07, note: 'Dwarf planet' },
    ],
  },
  {
    id: 'moons',
    name: 'Moons',
    color: '#d8e4f7',
    items: [
      { name: 'The Moon', article: 'Moon', note: 'Earth' },
      { name: 'Phobos', article: 'Phobos (moon)', note: 'Mars' },
      { name: 'Io', article: 'Io (moon)', note: 'Jupiter' },
      { name: 'Europa', article: 'Europa (moon)', note: 'Jupiter' },
      { name: 'Ganymede', article: 'Ganymede (moon)', note: 'Jupiter' },
      { name: 'Callisto', article: 'Callisto (moon)', note: 'Jupiter' },
      { name: 'Titan', article: 'Titan (moon)', note: 'Saturn' },
      { name: 'Enceladus', article: 'Enceladus', note: 'Saturn' },
      { name: 'Titania', article: 'Titania (moon)', note: 'Uranus' },
      { name: 'Triton', article: 'Triton (moon)', note: 'Neptune' },
      { name: 'Charon', article: 'Charon (moon)', note: 'Pluto' },
    ],
  },
  {
    id: 'probes',
    name: 'Probes',
    color: '#b4c6ff',
    items: [
      { name: 'Voyager 1', article: 'Voyager 1', note: '1977' },
      { name: 'Voyager 2', article: 'Voyager 2', note: '1977' },
      { name: 'Hubble', article: 'Hubble Space Telescope', note: '1990' },
      { name: 'Galileo', article: 'Galileo (spacecraft)', note: '1989' },
      { name: 'Cassini–Huygens', article: 'Cassini–Huygens', note: '1997' },
      { name: 'International Space Station', article: 'International Space Station', note: '1998' },
      { name: 'Rosetta', article: 'Rosetta (spacecraft)', note: '2004' },
      { name: 'New Horizons', article: 'New Horizons', note: '2006' },
      { name: 'Juno', article: 'Juno (spacecraft)', note: '2011' },
      { name: 'Curiosity', article: 'Curiosity (rover)', note: '2011' },
      { name: 'Parker Solar Probe', article: 'Parker Solar Probe', note: '2018' },
      { name: 'Perseverance', article: 'Perseverance (rover)', note: '2020' },
      { name: 'James Webb', article: 'James Webb Space Telescope', note: '2021' },
    ],
  },
  {
    id: 'constellations',
    name: 'Constellations',
    color: '#c9b6ff',
    items: [
      { name: 'Aries', article: 'Aries (constellation)', note: 'Zodiac' },
      { name: 'Taurus', article: 'Taurus (constellation)', note: 'Zodiac' },
      { name: 'Gemini', article: 'Gemini (constellation)', note: 'Zodiac' },
      { name: 'Cancer', article: 'Cancer (constellation)', note: 'Zodiac' },
      { name: 'Leo', article: 'Leo (constellation)', note: 'Zodiac' },
      { name: 'Virgo', article: 'Virgo (constellation)', note: 'Zodiac' },
      { name: 'Libra', article: 'Libra (constellation)', note: 'Zodiac' },
      { name: 'Scorpius', article: 'Scorpius', note: 'Zodiac' },
      { name: 'Sagittarius', article: 'Sagittarius (constellation)', note: 'Zodiac' },
      { name: 'Capricornus', article: 'Capricornus', note: 'Zodiac' },
      { name: 'Aquarius', article: 'Aquarius (constellation)', note: 'Zodiac' },
      { name: 'Pisces', article: 'Pisces (constellation)', note: 'Zodiac' },
      { name: 'Orion', article: 'Orion (constellation)' },
      { name: 'Ursa Major', article: 'Ursa Major' },
      { name: 'Ursa Minor', article: 'Ursa Minor' },
      { name: 'Cassiopeia', article: 'Cassiopeia (constellation)' },
      { name: 'Crux', article: 'Crux' },
      { name: 'Cygnus', article: 'Cygnus (constellation)' },
      { name: 'Lyra', article: 'Lyra' },
      { name: 'Andromeda', article: 'Andromeda (constellation)' },
      { name: 'Pegasus', article: 'Pegasus (constellation)' },
      { name: 'Draco', article: 'Draco (constellation)' },
      { name: 'Canis Major', article: 'Canis Major' },
      { name: 'Aquila', article: 'Aquila (constellation)' },
      { name: 'Centaurus', article: 'Centaurus' },
      { name: 'Perseus', article: 'Perseus (constellation)' },
    ],
  },
]
