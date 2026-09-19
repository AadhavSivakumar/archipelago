import { useRef } from 'react'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import { CONTENT } from '../content/districts'
import { DISTRICTS, type DistrictId } from '../scene/districts'

/**
 * What a district actually contains, shown when one is focused.
 *
 * DOM rather than a drei `<Html>` in the scene. Text inside the canvas is
 * subject to the camera: it scales with distance, occludes against terrain, and
 * cannot be scrolled or selected. This is prose meant to be read, so it belongs
 * in the document, where it stays crisp at any zoom and screen readers can
 * reach it. The scene's job is to take you somewhere; this says where you are.
 */
export function DistrictDossier({ focus }: { focus: DistrictId | null }) {
  const panel = useRef<HTMLElement>(null)

  const district = focus ? DISTRICTS.find((d) => d.id === focus) : undefined
  const content = focus ? CONTENT[focus] : undefined

  useGSAP(() => {
    const el = panel.current
    if (!el) return

    if (REDUCED_MOTION) {
      gsap.set(el, { opacity: 1, y: 0 })
      return
    }

    /*
      set() then to(), never a bare from() — CLAUDE.md rule 6. A from() infers
      its destination from whatever the element holds when the tween is built,
      and under StrictMode's mount/revert/mount that can be an already-cleared
      value, animating 0 to 0 and leaving the panel invisible permanently.

      The delay lands the panel as the 1.5s camera flight settles, so the text
      arrives once there is something behind it to read it against.
    */
    gsap.set(el, { opacity: 0, y: 20 })
    gsap.to(el, { opacity: 1, y: 0, duration: 0.6, ease: EASE.entrance, delay: 0.95 })
  }, [focus])

  if (!district || !content) return null

  return (
    // Keyed so switching districts remounts rather than mutating in place —
    // otherwise the new district's text would cross-fade into the old one's
    // layout mid-tween.
    <aside
      key={district.id}
      ref={panel}
      className="dossier"
      style={{ '--accent': district.accent } as React.CSSProperties}
      aria-labelledby="dossier-title"
    >
      <h2 className="dossier__title" id="dossier-title">
        {district.name}
      </h2>
      <p className="dossier__summary">{content.summary}</p>
      {content.hint && <p className="dossier__hint">{content.hint}</p>}

      <ul className="dossier__topics">
        {content.topics.map((topic) => (
          <li key={topic.name} className="dossier__topic">
            <span className="dossier__name">{topic.name}</span>
            <span className="dossier__note">{topic.note}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
