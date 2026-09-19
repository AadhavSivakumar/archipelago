/**
 * Wikipedia's REST summary, fetched on demand and cached for the session.
 *
 * This is the one place the project reaches the network at runtime, and it is
 * worth being clear about why. Everything else is baked into the bundle
 * precisely because it is needed to draw the first frame. This is prose, it
 * follows a deliberate click, and there are now several hundred subjects
 * across the districts — a paragraph each is far more than belongs in a
 * bundle that has to arrive before anything appears. It also stays current,
 * which a baked copy would not.
 */

/** What a district asks the page to describe when something on it is chosen. */
export type Subject = {
  name: string
  /** The Wikipedia article title, which is not always the display name. */
  article: string
  /** A line under the name: a year, an artist, a pantheon. */
  kicker?: string
}

export type Summary = { title: string; extract: string; url: string }

/*
  One request per article per session. Every district invites clicking around,
  and going back to something already looked at should not go back to the
  network — nor should the flicker of a re-fetch make it look like something
  changed. Module scope rather than component state because it must survive
  the card unmounting, which it does every time a selection clears.

  A failure is cached too. An article that cannot be found will not be found on
  the second click either, and retrying on every selection would spend the
  visitor's connection to fail again.
*/
const cache = new Map<string, Summary | null>()
/** Requests in the air, so a second ask for the same article joins the first. */
const inflight = new Map<string, Promise<Summary | null>>()

export function summarise(article: string): Promise<Summary | null> {
  if (cache.has(article)) return Promise.resolve(cache.get(article) ?? null)
  const pending = inflight.get(article)
  if (pending) return pending

  const request = fetchSummary(article).finally(() => inflight.delete(article))
  inflight.set(article, request)
  return request
}

async function fetchSummary(article: string): Promise<Summary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    article.replace(/ /g, '_'),
  )}`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const data = await response.json()

    /*
      `type` matters as much as the status. A disambiguation page answers 200
      with a perfectly well-formed body whose extract is a sentence about the
      word rather than the thing, so treating any 200 as success would put
      "Georgia may refer to:" under a country.
    */
    if (data.type !== 'standard' || !data.extract) throw new Error(data.type ?? 'no extract')

    const summary: Summary = {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${article}`,
    }
    cache.set(article, summary)
    return summary
  } catch {
    cache.set(article, null)
    return null
  }
}

/**
 * Natural Earth's ADMIN names against Wikipedia's article titles.
 *
 * Only the ones that genuinely do not resolve. Wikipedia follows redirects, so
 * 'United States of America', 'Republic of Serbia' and 'East Timor' all land
 * correctly on their own; these are the cases that end at a disambiguation
 * page or nowhere.
 */
const COUNTRY_TITLES: Record<string, string> = {
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

export const countryArticle = (name: string) => COUNTRY_TITLES[name] ?? name
