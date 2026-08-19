import { useEffect, useState } from 'react'

/**
 * What a country is, shown when one is chosen on the world map.
 *
 * Fetched from Wikipedia at the moment it is asked for, which is the one place
 * this project reaches the network at runtime and is worth justifying. Every
 * other asset is built or baked precisely because it is needed to draw the
 * first frame; this is needed only after a deliberate click, it is prose rather
 * than geometry, and there are 242 of them — a paragraph each is far more than
 * belongs in a bundle that has to arrive before anything appears. It also stays
 * current, which a baked copy would not.
 *
 * The failure path is a real path, not an afterthought. The article may not
 * exist under this name, the name may be ambiguous, the network may be absent,
 * and the visitor may be somewhere Wikipedia is blocked. In every one of those
 * the map still works and the card says plainly that it has nothing, because a
 * card that silently shows the previous country's text would be worse than one
 * that shows none.
 */

/**
 * Natural Earth's ADMIN names against Wikipedia's article titles.
 *
 * Only the ones that genuinely do not resolve. Wikipedia follows redirects, so
 * 'United States of America', 'Republic of Serbia' and 'East Timor' all land
 * correctly on their own; these are the cases that end at a disambiguation page
 * or nowhere, where following the link would show the visitor a list of
 * meanings rather than a country.
 */
const TITLES: Record<string, string> = {
  Georgia: 'Georgia (country)',
  Vatican: 'Vatican City',
  Macedonia: 'North Macedonia',
  'South Georgia and the Islands': 'South Georgia and the South Sandwich Islands',
  'Hong Kong S.A.R.': 'Hong Kong',
  'Macao S.A.R': 'Macau',
  Aland: 'Åland Islands',
  'Saint Barthelemy': 'Saint Barthélemy',
  'Cyprus No Mans Area': 'United Nations Buffer Zone in Cyprus',
  'Akrotiri Sovereign Base Area': 'Akrotiri and Dhekelia',
  'Dhekelia Sovereign Base Area': 'Akrotiri and Dhekelia',
  'US Naval Base Guantanamo Bay': 'Guantanamo Bay Naval Base',
  'Scarborough Reef': 'Scarborough Shoal',
  'Brazilian Island': 'Ilha Brasileira',
  'Indian Ocean Territories': 'Australian Indian Ocean Territories',
}

type Summary = { title: string; extract: string; url: string }

/*
  One request per country per session. The map invites clicking around, and
  going back to a country you have already looked at should not go back to the
  network — nor should the flicker of a re-fetch make it look like something
  changed. Module scope rather than component state because it should survive
  the card unmounting, which it does every time the selection clears.
*/
const cache = new Map<string, Summary | null>()

async function summarise(name: string): Promise<Summary | null> {
  if (cache.has(name)) return cache.get(name) ?? null

  const title = TITLES[name] ?? name
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, '_'),
  )}`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const data = await response.json()

    /*
      `type` matters as much as the status. A disambiguation page answers 200
      with a perfectly well-formed body whose extract is a sentence about the
      word rather than the place, so treating any 200 as success would put "Georgia
      may refer to:" under a country.
    */
    if (data.type !== 'standard' || !data.extract) throw new Error(data.type ?? 'no extract')

    const summary: Summary = {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
    }
    cache.set(name, summary)
    return summary
  } catch {
    // Cached too. A country whose article cannot be found will not be found on
    // the second click either, and retrying on every selection would spend the
    // visitor's connection to fail again.
    cache.set(name, null)
    return null
  }
}

export function CountryCard({ name }: { name: string | null }) {
  const [state, setState] = useState<{ for: string; data: Summary | null } | null>(null)

  useEffect(() => {
    if (!name) {
      setState(null)
      return
    }

    /*
      Guarded against arriving out of order. Clicking across three countries
      quickly starts three requests, and they can finish in any order — without
      this, a slow first response can land after a fast third and leave the card
      describing a country that is no longer selected.
    */
    let live = true
    setState(null)
    summarise(name).then((data) => {
      if (live) setState({ for: name, data })
    })
    return () => {
      live = false
    }
  }, [name])

  if (!name) return null

  const ready = state?.for === name

  return (
    <aside className="country-card" aria-label={`About ${name}`}>
      <h2 className="country-card__title">{ready && state.data ? state.data.title : name}</h2>

      {!ready && <p className="country-card__body country-card__body--wait">Looking it up…</p>}

      {ready && state.data && (
        <>
          <p className="country-card__body">{state.data.extract}</p>
          <a
            className="country-card__link"
            href={state.data.url}
            target="_blank"
            /*
              noreferrer as well as noopener. noopener is the security half —
              it stops the opened page reaching back through window.opener —
              and noreferrer keeps this site's URL out of Wikipedia's logs,
              which is not their business.
            */
            rel="noopener noreferrer"
          >
            Read on Wikipedia →
          </a>
        </>
      )}

      {ready && !state.data && (
        <p className="country-card__body country-card__body--wait">
          No article could be found for this territory.
        </p>
      )}
    </aside>
  )
}
