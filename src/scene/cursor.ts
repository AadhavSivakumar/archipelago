/**
 * The pointer cursor, written once per change rather than once per move.
 *
 * Both the landmarks and the island ground decide on every pointermove whether
 * the thing under the cursor is clickable, and the naive version of that is to
 * assign document.body.style.cursor each time. Assigning it is not free even
 * when the value is identical: it is a write to an inline style, which
 * invalidates the element's computed style and schedules a recalc, and
 * pointermove fires at the pointer's full sampling rate — well above the frame
 * rate on a high-polling mouse.
 *
 * Caching the last value written turns the common case, where the pointer moves
 * across a surface it is already over, into a string comparison.
 *
 * Module-level state is right here because there is exactly one cursor. Two
 * components both drive it, and a per-component ref would let them disagree.
 */
let current = ''

export function setCursor(next: 'pointer' | '') {
  if (next === current) return
  current = next
  document.body.style.cursor = next
}
