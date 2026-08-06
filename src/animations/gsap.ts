import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

// Registering useGSAP lets GSAP's context track and revert tweens created inside
// it. Do this once, here — not per component.
gsap.registerPlugin(useGSAP)

/**
 * Shared easing vocabulary. Reach for these instead of inlining ease strings so
 * motion stays consistent across the scene.
 */
export const EASE = {
  entrance: 'power3.out',
  pop: 'back.out(1.7)',
  smooth: 'power2.inOut',
} as const

export { gsap, useGSAP }
