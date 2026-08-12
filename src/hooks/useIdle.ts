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
 */
export function useIdle(delay = 4200) {
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
