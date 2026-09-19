export type DistrictId =
  | 'ideology'
  | 'history'
  | 'geography'
  | 'science'
  | 'art'
  | 'anthropology'
  | 'languages'
  | 'life'
  | 'cosmos'
  | 'inventions'

export type District = {
  id: DistrictId
  name: string
  blurb: string
  /** Terrain tint blended into the vertex colours around this district. */
  color: string
  /** Landmark highlight colour, also used by the overlay. */
  accent: string
  /**
   * World position of the district centre.
   *
   * Explicit coordinates rather than the bearing-and-radius this used to carry.
   * That polar form only made sense while there was one island and the six
   * districts were spaced evenly around it; an archipelago has no single centre
   * to be at a bearing from, and the islands are placed for composition rather
   * than symmetry.
   */
  x: number
  z: number
  /**
   * Bearing, in radians, pointing from the district out toward open water —
   * (cos, sin) maps to (x, z).
   *
   * Was derived from the direction away from the island's centre, which is
   * meaningless now that each district IS its own island. It decides where the
   * camera parks when the district is focused, and which way Scientific Shores
   * runs its jetty, so it has to point at water rather than at a neighbour.
   */
  seaward: number
  /**
   * How the camera frames this district.
   *
   * 'shore' — the default — parks off the coast on the seaward bearing and
   * looks back at the land, which is the right read for a building on an
   * island: you see its elevation against the sky.
   *
   * 'plan' looks almost straight down instead. It exists for the Geographical
   * Garden, whose subject is an equirectangular world map laid flat — an
   * oblique view of a map is a view of a slab, and the projection only becomes
   * legible from directly above it. The one thing it must not be is exactly
   * vertical: with the view direction parallel to the camera's up vector the
   * look-at basis is degenerate and OrbitControls has no defined azimuth, so it
   * keeps a small tilt.
   */
  framing?: 'shore' | 'plan'
  /** Height of the flattened plateau the landmark stands on. */
  pad: number
  padRadius: number
  /** Extra terrain roughness in the ring around the plateau. */
  relief: number
  /**
   * Additional peaks, offset from the district centre, applied after
   * flattening. Order carries no meaning — the Alps landmark plants its cairn
   * on whichever of these is tallest, so these can be retuned freely.
   */
  bumps?: { dx: number; dz: number; h: number; r: number }[]
}

/**
 * Ordered as presented in the overlay.
 *
 * The camera looks from +Z toward -Z, so the layout reads front to back:
 * open ocean nearest the viewer, five islands staggered through the middle
 * ground, and the mainland spanning the far edge. The Alps are the one district
 * not on an island of their own — they rise out of the mainland as a range,
 * which is both what mountains do and what gives the composition its backdrop.
 *
 * Island extents live in terrain.ts; these are the centres the plateaus and
 * landmarks sit on. The two are checked against each other by eye and by the
 * landmass survey — every district must land on its own separate island.
 */
export const DISTRICTS: District[] = [
  {
    id: 'ideology',
    name: 'Ideology Isles',
    blurb:
      'Chart the courses of belief systems, from logical reason and ancient myths to divine doctrines.',
    color: '#c2a03f',
    accent: '#f2cf6b',
    x: -52,
    z: -20,
    seaward: 2.1,
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
    x: 48,
    z: -22,
    seaward: 0.93,
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
    x: 44,
    z: 26,
    seaward: 0.62,
    framing: 'plan',
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
    /*
      On the mainland, not an island of its own: a beach on the continental
      shore, with its plateau running down to the waterline about thirteen units
      seaward and the jetty carrying on from there. Of the six it is the one
      whose name asks to be at the water's edge rather than surrounded by it.

      Its seaward bearing points straight out to sea (+Z) because that is what
      the jetty needs — it has to reach open water, and every bearing that
      framed the camera better ran the jetty along the coast instead. The
      consequence is that this one district's camera standoff passes over a
      corner of Historical Habitat's island rather than over water. Measured, it
      clears that ground by seventeen units and none of it is in frame, so the
      bearing follows the jetty.
    */
    x: 46,
    z: -75,
    seaward: 1.57,
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
    x: -46,
    z: 26,
    seaward: 2.16,
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
    x: -6,
    z: -70,
    seaward: 1.57,
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
  /*
    The four that came later, placed where the first six left room.

    The foreground had to stay open — anything in front of the centre island
    hides the globe from the home camera — so the Lagoon and the Cay sit far
    out on either flank, past the edge of the home frame, and the Bayou and
    the Inlet take the mainland shore to either side of the Alps — the coast
    already bends inland at both, and the Inlet's bend is deepened a little
    into an inlet. The idle orbit brings the flank islands into view; the bar
    along the top reaches all of them.
  */
  {
    id: 'languages',
    name: 'Linguistic Lagoon',
    blurb:
      "Follow the family trees of the world's languages, from the reconstructed proto-tongues down to the ones spoken today.",
    color: '#4f9a92',
    accent: '#8fe3d9',
    x: -70,
    z: 62,
    seaward: 1.9,
    pad: 4.0,
    padRadius: 5.5,
    relief: 1.4,
    // Carved below the waterline: the lagoon itself, inside the atoll's rim.
    bumps: [{ dx: 0, dz: 0, h: -8, r: 4.5 }],
  },
  {
    id: 'life',
    name: 'Biological Bayou',
    blurb: 'Wade through the tree of life, from the first cells to every kingdom of living things.',
    color: '#5c8f4a',
    accent: '#a6e37a',
    x: -66,
    z: -81,
    seaward: 1.57,
    pad: 2.2,
    padRadius: 7,
    relief: 1.2,
  },
  {
    id: 'cosmos',
    name: 'Celestial Cay',
    blurb: 'Look up: the planets on an orrery, their moons, the probes we sent, and the constellations we drew.',
    color: '#5a6fa8',
    accent: '#b4c6ff',
    x: 70,
    z: 62,
    seaward: 1.25,
    pad: 4.5,
    padRadius: 5,
    relief: 1.5,
  },
  {
    id: 'inventions',
    name: "Inventors' Inlet",
    blurb:
      'A second timeline, of the things people made: from the hand axe and the plough to the transistor and the web.',
    color: '#a8783f',
    accent: '#f2c27a',
    x: 94,
    z: -88,
    seaward: 1.57,
    pad: 2.4,
    padRadius: 10,
    relief: 1.4,
  },
]

/** Horizontal centre of a district, as [x, z]. */
export function districtCentre(d: District): [number, number] {
  return [d.x, d.z]
}

/**
 * Where the camera parks when a district is focused: out along the district's
 * seaward bearing and above it, so the framing is always from off the coast
 * looking back at the land. Each bearing is chosen to have open water behind
 * the camera — with the islands scattered, a bearing that merely pointed away
 * from the world origin would put the camera inside a neighbour.
 */
export function districtView(d: District, scale = 1) {
  if (d.framing === 'plan') {
    /*
      Overhead, tilted 15 degrees off vertical — see the `framing` note above
      for why it cannot be 0.

      Close enough that the map IS the screen.

      At the base 42-degree vertical fov on 16:9 the horizontal half-field is
      0.633 units per unit of distance, so 10 units out gives a half-width of
      6.33 — against the map FACE's half-width of 6.30. The projection therefore
      fills the frame edge to edge, and the stone kerb and the hedge around it
      fall outside on a 16:9 viewport. That is the right thing to lose: they are
      the garden the map sits in, and at this distance the map is the subject.
      The 12 units this used to sit at left about a tenth of the width to them.

      Vertically there is more room than needed — the face is 6.3 deep against a
      7.7-unit field — which is the margin the 15-degree tilt eats, and what
      keeps the far edge of the projection on screen rather than cropped.

      This used to stand off at 22 to keep the map clear of the fixed side
      panel. The panel now slides away when the camera comes down here, so there
      is nothing left to leave room for.

      Scaled like every other view, so a narrow viewport pulls back rather than
      cropping the Pacific.

      The tilt is 6 degrees off vertical, down from 15. A map read at an angle
      is a picture of a slab: the graticule stops being square, the far half of
      the projection draws smaller than the near half, and a country in the
      north is rendered at a different scale from its neighbour in the south —
      for a diagram whose whole claim is to be an equirectangular projection,
      that is the one distortion worth avoiding. Six degrees still gives the
      plate enough parallax to read as an object with thickness rather than a
      flat image.

      It cannot be zero: with the view direction parallel to the camera's up
      vector the look-at basis is degenerate and OrbitControls has no defined
      azimuth to hold.
    */
    return {
      position: { x: d.x, y: d.pad + 9.95 * scale, z: d.z + 1.05 * scale },
      target: { x: d.x, y: d.pad, z: d.z },
    }
  }

  const ox = Math.cos(d.seaward)
  const oz = Math.sin(d.seaward)
  return {
    position: { x: d.x + ox * 42 * scale, y: d.pad + 22 * scale, z: d.z + oz * 42 * scale },
    target: { x: d.x, y: d.pad + 2, z: d.z },
  }
}

/** Full world position of a district's plateau. */
export function districtPosition(d: District): [number, number, number] {
  const [x, z] = districtCentre(d)
  return [x, d.pad, z]
}
