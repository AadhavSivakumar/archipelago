import { useMemo, useSyncExternalStore } from 'react'
import type { Selection } from '../content/navigation'
import type { DistrictId } from '../scene/districts'
import type { SubFocus } from '../scene/exhibits'
import type { Subject } from '../components/wikipedia'

/**
 * The one thing chosen, and what it looks like — shared by the page and the
 * scene without either owning it.
 *
 * Why a store and not state in App: the choice is written from the strip
 * along the bottom (the DOM root) and from the objects on the island (the
 * canvas root), and read by the strip, by the district it is in, by the
 * camera rig and by the corner card. Routed through App's state, every choice
 * re-rendered the page, which re-rendered the canvas, which re-rendered all
 * six districts — hundreds of components, worked through in slices between
 * frames — and the island answered a click a beat late. Subscribers of an
 * external store re-render synchronously and only they do: the district
 * whose selection changed, the strip, the rig, the card.
 *
 * Two fields, written by different hands. `selection` is the choice, in the
 * district's own indices; `view` is that choice as a place to fly and a thing
 * to describe, and only the district can compute it, because only the
 * district knows where its stones stand. A district publishes its view in a
 * layout effect, so the camera learns where to go in the same commit as the
 * stone lights up. Clearing the selection clears the view at once; setting a
 * new one keeps the old view for the instant until the district replaces it.
 */
type State = { selection: Selection | null; view: SubFocus | null }

let state: State = { selection: null, view: null }
const listeners = new Set<() => void>()

function emit(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getSelection = () => state.selection

export function select(selection: Selection | null) {
  if (selection === state.selection) return
  emit({ selection, view: selection ? state.view : null })
}

export function publishView(view: SubFocus) {
  if (view === state.view) return
  emit({ ...state, view })
}

export const useSelection = () => useSyncExternalStore(subscribe, getSelection)

/** This district's selection, or null — and null stays null, so a change in
    another district's selection does not re-render this one. */
export function useDistrictSelection(district: DistrictId) {
  return useSyncExternalStore(subscribe, () => (state.selection?.district === district ? state.selection : null))
}

export const useView = () => useSyncExternalStore(subscribe, () => state.view)

/** The view as the corner card wants it. */
export function useSubject(): Subject | null {
  const view = useView()
  return useMemo(() => (view ? { name: view.name, article: view.article, kicker: view.kicker } : null), [view])
}
