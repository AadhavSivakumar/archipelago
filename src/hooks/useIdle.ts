import { useEffect, useRef, useState } from 'react'

const ACTIVITY = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const

/**
 * True once the visitor has left the page alone for `delay` milliseconds.
 *
 * The wake path is guarded by a ref rather than reading `idle` from state,
 * because `pointermove` fires on every frame of a mouse drag and an unguarded
 * `setIdle(false)` would queue a React render per event. The ref makes the
 * common case — already awake, moving the mouse — a timer reset and nothing
 * else.
 *
 * The default was 4200ms, which meant a visitor who paused to read the panel had
 * usually moved again before the drift ever began — the scene's one piece of
 * ambient life was mostly not happening. 2400 starts it inside a natural pause
 * without firing between deliberate movements, and the two-and-a-half second
 * ramp in Scene.tsx means an accidental trigger goes almost unnoticed.
 */
export function useIdle(delay = 2400) {
  const [idle, setIdle] = useState(false)
  const isIdle = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const wake = () => {
      if (isIdle.current) {
        isIdle.current = false
        setIdle(false)
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        isIdle.current = true
        setIdle(true)
      }, delay)
    }

    ACTIVITY.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    // Start the clock: arriving and doing nothing should still go idle.
    wake()

    return () => {
      clearTimeout(timer)
      ACTIVITY.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [delay])

  return idle
}
