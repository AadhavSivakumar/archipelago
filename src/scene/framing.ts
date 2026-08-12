/**
 * Viewport-aware camera framing.
 *
 * three.js holds the VERTICAL field of view, so as a viewport narrows it shows
 * a proportionally narrower slice of the world at the same distance. At a
 * phone's ~0.46 aspect the horizontal half-width at the default home distance
 * works out around 12 world units against an ISLAND_RADIUS of 30 — the landmass
 * simply runs off both edges, and no amount of orbiting fixes it.
 *
 * Two levers, and both are needed. Widening the vertical FOV buys back
 * horizontal field without moving the camera; pulling back buys the rest.
 * Either one alone has to go far enough to look wrong — holding the horizontal
 * field at 0.46 aspect on FOV alone wants about 112 degrees, and on distance
 * alone it wants past both the orbit ceiling of 110 and the fog far plane
 * of 210.
 *
 * These constants frame the island correctly by construction, but framing is a
 * thing you judge by eye — they are worth a look on a real phone.
 */

const BASE_FOV = 42
const BASE_ASPECT = 16 / 9

/** Past this the perspective distortion is more objectionable than the crop. */
const MAX_FOV = 64
/** Past this the camera leaves the fog and approaches the orbit ceiling. */
const MAX_PULLBACK = 1.5
/** Nothing sensible is narrower than this; stops the maths running away. */
const MIN_ASPECT = 0.35

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Half-width of the visible field at unit distance, for a given FOV/aspect. */
function halfWidth(fov: number, aspect: number) {
  return Math.tan(rad(fov / 2)) * aspect
}

/** The horizontal field the scene was composed for. */
const TARGET = halfWidth(BASE_FOV, BASE_ASPECT)

/**
 * Vertical FOV that holds the horizontal field roughly constant as the viewport
 * narrows. Wide viewports are unchanged — this only ever opens the lens up.
 */
export function fovForAspect(aspect: number) {
  if (aspect >= BASE_ASPECT) return BASE_FOV
  const halfV = TARGET / Math.max(aspect, MIN_ASPECT)
  return Math.min(MAX_FOV, deg(Math.atan(halfV)) * 2)
}

/**
 * Distance multiplier picking up whatever the FOV cap could not recover. 1 on
 * any viewport at or wider than 16:9.
 */
export function frameScale(aspect: number) {
  if (aspect >= BASE_ASPECT) return 1
  const got = halfWidth(fovForAspect(aspect), Math.max(aspect, MIN_ASPECT))
  return Math.min(MAX_PULLBACK, Math.max(1, TARGET / got))
}
