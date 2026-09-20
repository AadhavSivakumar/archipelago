import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../animations/gsap'
import { NAV } from '../content/navigation'
import { DISTRICTS, type DistrictId } from '../scene/districts'
import { select, useSelection } from '../state/selection'

type Props = { focus: DistrictId | null }

/**
 * The strip along the bottom: everything the focused district holds, as a
 * row of buttons, grouped where the district groups them.
 *
 * The same selection the scene uses, from the other direction. Clicking a
 * stone on the island and clicking its name here do the same thing and show
 * the same state, so the two are one control with two faces — and this face
 * is the one a keyboard can reach and a screen reader can read.
 *
 * Groups are a second, quieter row above the items: eras, pantheons, media.
 * Browsing a group does not choose anything, except on the Ideology Isles,
 * where a pantheon is itself something to look at.
 */
export function ExhibitNav({ focus }: Props) {
  const selection = useSelection()
  const config = focus ? NAV[focus] : null
  const groups = config?.groups ?? []

  // Which group's items are showing. Follows the selection, but can be
  // browsed away from it without changing it.
  const [viewed, setViewed] = useState(0)
  useEffect(() => {
    setViewed(0)
  }, [focus])
  useEffect(() => {
    if (selection) setViewed(selection.group)
  }, [selection])

  // Keep the chosen item in view: an arrow key in the scene may have moved
  // the selection a long way along the row.
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>('.exnav__item.is-active')
    active?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [selection, viewed])

  if (!focus || !config || groups.length === 0) return null

  const district = DISTRICTS.find((d) => d.id === focus)!
  const shown = Math.min(viewed, groups.length - 1)
  const group = groups[shown]

  return (
    <nav
      className="exnav"
      aria-label={`${district.name} exhibits`}
      style={{ '--accent': district.accent } as React.CSSProperties}
    >
      {groups.length > 1 && (
        <div className="exnav__groups">
          {groups.map((g, k) => {
            const isSelected = selection?.group === k
            const selectable = g.selectable ?? config.groupsSelectable
            return (
              <button
                key={g.name}
                type="button"
                className={`exnav__group${k === shown ? ' is-viewed' : ''}${isSelected ? ' is-selected' : ''}`}
                style={{ '--group': g.color } as React.CSSProperties}
                aria-pressed={selectable ? isSelected : k === shown}
                onClick={() => {
                  setViewed(k)
                  if (!selectable) return
                  // A pantheon: choose it, or — chosen already with no god
                  // under it — let it go.
                  select(isSelected && selection.item < 0 ? null : { district: focus, group: k, item: -1 })
                }}
              >
                {g.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="exnav__items" ref={row}>
        {group.items.map((it) => {
          const active = selection?.group === shown && selection.item === it.index
          return (
            <button
              key={it.index}
              type="button"
              className={`exnav__item${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() =>
                select(
                  active
                    ? (group.selectable ?? config.groupsSelectable)
                      ? { district: focus, group: shown, item: -1 }
                      : null
                    : { district: focus, group: shown, item: it.index },
                )
              }
            >
              <span className="exnav__name">{it.name}</span>
              {it.note && <span className="exnav__note">{it.note}</span>}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
