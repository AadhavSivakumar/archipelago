import { useEffect, useState } from 'react'
import { summarise, type Subject, type Summary } from './wikipedia'

/**
 * What the chosen thing is, in the corner the district dossier normally holds.
 *
 * One card for every district: a country, an event, a god, a painting, a
 * science. They differ only in what they are called and which article says
 * what they are, and the kicker line carries whatever a name alone leaves out
 * — the year, the artist, the pantheon.
 *
 * The failure path is a real path. The article may not exist under this
 * title, the name may be ambiguous, the network may be absent, and the visitor
 * may be somewhere Wikipedia is blocked. In every one of those the scene
 * still works and the card says plainly that it has nothing, because a card
 * that silently shows the previous subject's text would be worse than none.
 */
export function WikiCard({ name, article, kicker }: Subject) {
  const [state, setState] = useState<{ for: string; data: Summary | null } | null>(null)

  useEffect(() => {
    /*
      Guarded against arriving out of order. Stepping through a timeline with
      the arrow keys starts a request per step, and they can finish in any
      order — without this, a slow early response can land after a fast later
      one and leave the card describing something no longer selected.
    */
    let live = true
    setState(null)
    summarise(article).then((data) => {
      if (live) setState({ for: article, data })
    })
    return () => {
      live = false
    }
  }, [article])

  const ready = state?.for === article

  return (
    <aside className="wiki-card" aria-label={`About ${name}`}>
      {kicker && <p className="wiki-card__kicker">{kicker}</p>}
      <h2 className="wiki-card__title">{ready && state.data ? state.data.title : name}</h2>

      {!ready && <p className="wiki-card__body wiki-card__body--wait">Looking it up…</p>}

      {ready && state.data && (
        <>
          <p className="wiki-card__body">{state.data.extract}</p>
          <a
            className="wiki-card__link"
            href={state.data.url}
            target="_blank"
            // noopener stops the opened page reaching back through
            // window.opener; noreferrer keeps this site's URL out of
            // Wikipedia's logs, which is not their business.
            rel="noopener noreferrer"
          >
            Read on Wikipedia →
          </a>
        </>
      )}

      {ready && !state.data && (
        <p className="wiki-card__body wiki-card__body--wait">No article could be found for this.</p>
      )}
    </aside>
  )
}
