import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

// Registering useGSAP lets GSAP's context track and revert tweens created inside
// it. Do this once, here — not per component.
gsap.registerPlugin(useGSAP)

/*
  A stalled frame slows the animation down; it never skips it forward.

  GSAP's default only intervenes when a single frame takes over half a
  second, and passes anything shorter straight through as elapsed time. So
  when the main thread stalls for a few hundred milliseconds mid-flight — a
  detail mesh landing, a shader compiling, a shadow map re-rendering — the
  camera tween jumps that far along its path in one frame. Recorded on a hop
  between two districts: 28 units in a single frame, straight to the end.
  Any gap over 250ms is now counted as 33ms. Ordinary slow frames, down to
  four a second, still run in real time — any lower a threshold, and a
  machine that is merely slow sees every animation crawl.
*/
gsap.ticker.lagSmoothing(250, 33)

/**
 * Shared easing vocabulary. Reach for these instead of inlining ease strings so
 * motion stays consistent across the scene.
 */
export const EASE = {
  entrance: 'power3.out',
  pop: 'back.out(1.7)',
  smooth: 'power2.inOut',
} as const

/**
 * Whether the visitor has asked their system for reduced motion.
 *
 * Read once at module scope rather than subscribed to. This value gates how
 * timelines are *built*, so reacting to a mid-visit change would mean tearing
 * down and rebuilding the opening sequence — a stranger experience than the one
 * it set out to avoid. A reload picks it up.
 *
 * What it suppresses here is the large stuff: the camera flights, the island
 * and district reveals, and the lighthouse's 14 -> 26 intensity pulse, which is
 * a luminance flash rather than mere movement. The slow ornament rotations stay
 * — they are small on screen and read as ambient life, not motion.
 */
const REDUCED_MOTION_QUERY =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

export const REDUCED_MOTION = REDUCED_MOTION_QUERY?.matches ?? false

/**
 * Live read of the same preference.
 *
 * The snapshot above is right for the one-shot decisions — the island and
 * district reveals happen once, before anyone could plausibly change the
 * setting. But the district flights and the lighthouse pulse run for as long as
 * the page is open, and the CSS half of this feature is live by nature, so a
 * frozen read there would leave the two halves disagreeing after a mid-session
 * toggle. Reading `.matches` off an existing MediaQueryList is a property
 * lookup, cheap enough for a useFrame body.
 */
export function prefersReducedMotion() {
  return REDUCED_MOTION_QUERY?.matches ?? false
}

export { gsap, useGSAP }
