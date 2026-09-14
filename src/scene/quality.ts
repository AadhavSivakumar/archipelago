/**
 * The one number every expensive shader in the scene reads.
 *
 * 1 is full quality. 0 tells the surface grain in surface.ts and the water chop
 * in shaders/water.ts to skip their work entirely — a uniform branch, taken the
 * same way by every fragment of a draw, so on the GPU it costs a compare and
 * nothing else. In between, the effects scale down proportionally.
 *
 * A module-level uniform object rather than React state, for the same reason
 * the wave clock and the country highlight are: it has to reach every material
 * in the scene, and routing a float to forty shader programs through props and
 * re-renders is the wrong tool. Every weathered material registers this SAME
 * object in its uniforms, so writing `.value` here changes all of them on the
 * next frame with no reconciliation and — this is the part that matters — no
 * reallocation. Nothing here can produce a black frame.
 */
export const uQuality = { value: 1 }

/**
 * Quality tiers, chosen by the governor in Scene from the measured frame time.
 *
 *   0  everything
 *   1  vertex cuts: the coarse island, no clouds, birds or boat
 *   2  fill cuts too: no surface grain, no water chop
 *
 * Ordered so that each step removes what costs the most for the least visible
 * loss. The coarse island is a fifth of the vertices for a silhouette that is
 * identical at the home distance; the grain and the chop are the two most
 * expensive fragment shaders in the scene and the two the eye misses least.
 */
export type QualityTier = 0 | 1 | 2

/** What the shader dial should read at each tier. */
export const QUALITY_FOR_TIER: Record<QualityTier, number> = { 0: 1, 1: 1, 2: 0 }
