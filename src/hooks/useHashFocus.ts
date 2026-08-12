import { useCallback, useEffect, useState } from 'react'
import { DISTRICTS, type DistrictId } from '../scene/districts'

const IDS = new Set<string>(DISTRICTS.map((d) => d.id))

/**
 * The URL is the source of truth for which district is focused. Anything not
 * naming a real district — an empty hash, a stale link, someone's typo — reads
 * as the whole island rather than throwing.
 */
function fromHash(): DistrictId | null {
  const raw = window.location.hash.replace(/^#/, '')

  let id: string
  try {
    id = decodeURIComponent(raw)
  } catch {
    /*
      decodeURIComponent throws URIError on a malformed percent-escape, and the
      URL parser preserves them verbatim — `new URL('…#100%').hash` really is
      '#100%'. That reaches here from a typo, a chat client truncating a link
      mid-escape, or a tracker suffix.

      This function is called from a useState lazy initialiser, so an escape
      would throw during App's render; the only ErrorBoundary is rendered BY
      App, so nothing above it catches, the root never commits, and the visitor
      is left on the boot skeleton forever. A whole dead page for a stray '%'.
    */
    return null
  }

  return IDS.has(id) ? (id as DistrictId) : null
}

/**
 * Focus state, kept in the address bar.
 *
 * Three things this buys that `useState` could not: a link to Scientific Shores
 * can exist and be shared, a reload keeps you where you were, and the browser's
 * Back button steps out of a district instead of leaving the site — which is
 * what a phone's back gesture does, so without this the only way out of a
 * district on mobile was to find the reset button.
 *
 * The hash rather than a path, because this is a static GitHub Pages deploy:
 * there is no server to rewrite `/science` back to index.html, so a real route
 * would 404 on refresh.
 */
export function useHashFocus() {
  const [focus, setFocusState] = useState<DistrictId | null>(fromHash)

  useEffect(() => {
    const sync = () => setFocusState(fromHash())
    // popstate covers Back and Forward; hashchange covers someone editing the
    // address bar directly. They overlap on some paths, which is harmless —
    // React bails out when the value is unchanged.
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const setFocus = useCallback((next: DistrictId | null) => {
    // Compare against the URL, not against React state: the URL is what the
    // history stack actually holds, so this is the check that stops a repeated
    // click stacking identical entries for Back to chew through. It reads
    // window.location rather than state, so it belongs above the setter — that
    // way state and the URL move together or not at all. Keeping it out of the
    // state updater also keeps the updater pure, which matters because
    // StrictMode double-invokes those in development.
    if (fromHash() !== next) {
      const url = next ? `#${next}` : window.location.pathname + window.location.search
      window.history.pushState(null, '', url)
    }

    setFocusState(next)
  }, [])

  return [focus, setFocus] as const
}
