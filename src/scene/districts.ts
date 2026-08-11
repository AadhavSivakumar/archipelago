const DEG = Math.PI / 180

export type DistrictId =
  | 'ideology'
  | 'history'
  | 'geography'
  | 'science'
  | 'art'
  | 'anthropology'

export type District = {
  id: DistrictId
  name: string
  blurb: string
  /** Terrain tint blended into the vertex colours around this district. */
  color: string
  /** Landmark highlight colour, also used by the overlay. */
  accent: string
  /** Bearing around the island centre. */
  angle: number
  /** Distance from the island centre. */
  radius: number
  /** Height of the flattened plateau the landmark stands on. */
  pad: number
  padRadius: number
  /** Extra terrain roughness in the ring around the plateau. */
  relief: number
  /** Additional peaks, offset from the district centre, applied after flattening. */
  bumps?: { dx: number; dz: number; h: number; r: number }[]
}

/**
 * Ordered as presented in the overlay. Angles are spaced 60° apart so the six
 * plateaus sit evenly around the landmass without their reliefs overlapping.
 * The camera starts on the +Z side, so the Alps sit at 270° (far side) where
 * their peaks frame the scene instead of hiding it.
 */
export const DISTRICTS: District[] = [
  {
    id: 'ideology',
    name: 'Ideology Isles',
    blurb:
      'Chart the courses of belief systems, from logical reason and ancient myths to divine doctrines.',
    color: '#c2a03f',
    accent: '#f2cf6b',
    angle: 330 * DEG,
    radius: 16,
    pad: 7.2,
    padRadius: 8,
    relief: 2.2,
  },
  {
    id: 'history',
    name: 'Historical Habitat',
    blurb:
      'Journey through the annals of world history and see how the past shapes the present.',
    color: '#b0693c',
    accent: '#e8a06a',
    angle: 210 * DEG,
    radius: 15.5,
    pad: 8.4,
    padRadius: 7.5,
    relief: 2.6,
  },
  {
    id: 'geography',
    name: 'Geographical Garden',
    blurb:
      "Cultivate your knowledge of Earth's landscapes, from towering mountains to sprawling cities.",
    color: '#4f9d69',
    accent: '#86dda3',
    angle: 150 * DEG,
    radius: 15,
    pad: 4.6,
    padRadius: 7.5,
    relief: 1.8,
  },
  {
    id: 'science',
    name: 'Scientific Shores',
    blurb:
      'Explore the realms of science, from the logic of mathematics and biology to technology, engineering, and the cosmos.',
    color: '#3f7fa6',
    accent: '#8fd6ff',
    angle: 90 * DEG,
    radius: 17.5,
    pad: 2.0,
    padRadius: 8,
    relief: 1.1,
  },
  {
    id: 'art',
    name: 'Artistic Arboretum',
    blurb:
      'Journey through groves of creativity, from painting, literature, and music to fashion, architecture, and interactive entertainment.',
    color: '#9c5390',
    accent: '#e79ad8',
    angle: 30 * DEG,
    radius: 15,
    pad: 5.4,
    padRadius: 7.5,
    relief: 2.0,
  },
  {
    id: 'anthropology',
    name: 'Anthropologic Alps',
    blurb:
      'Scale the peaks of human society, from culture and politics to business, law, wellness, and cuisine.',
    color: '#8d9bb5',
    accent: '#d8e4f7',
    angle: 270 * DEG,
    radius: 12.5,
    pad: 14.5,
    padRadius: 5,
    relief: 4.5,
    bumps: [
      { dx: -7.5, dz: -3.5, h: 9.5, r: 5.2 },
      { dx: 6.5, dz: -4.5, h: 8, r: 4.6 },
      { dx: 0.5, dz: -9, h: 12, r: 6 },
      { dx: -3, dz: 4.5, h: 4.5, r: 4 },
    ],
  },
]

/** Horizontal centre of a district, as [x, z]. */
export function districtCentre(d: District): [number, number] {
  return [Math.cos(d.angle) * d.radius, Math.sin(d.angle) * d.radius]
}

/**
 * Where the camera parks when a district is focused: outward along the
 * district's own bearing and above it, so the framing is always from off the
 * coast looking back at the island. Hand-tuned per-district offsets got this
 * wrong for the Alps, which ended up viewed from inside the mountain.
 */
export function districtView(d: District) {
  const [x, z] = districtCentre(d)
  const len = Math.hypot(x, z) || 1
  const ox = x / len
  const oz = z / len
  return {
    position: { x: x + ox * 42, y: d.pad + 22, z: z + oz * 42 },
    target: { x, y: d.pad + 2, z },
  }
}

/** Full world position of a district's plateau. */
export function districtPosition(d: District): [number, number, number] {
  const [x, z] = districtCentre(d)
  return [x, d.pad, z]
}
