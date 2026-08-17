import type { Banner, Day, Entry, ISODate } from '../domain/types'
import { addDays } from '../utils/formatDate'
import { inferMonthlyBanners, inferMonthlyEntries, inferRhythms, isSameRecurringText, sameEntry } from './infer'

export interface EntrySuggestion {
  entry: Entry
  source: 'weekday-rhythm' | 'monthly-entry'
  occurrences: number
  windowSize: number
}

export type BannerSuggestion =
  | { banner: Banner; source: 'monthly-banner'; occurrences: number; windowSize: number }
  | { banner: Banner; source: 'carried-span' }

export interface DaySuggestion {
  date: ISODate
  banners: BannerSuggestion[]
  entries: EntrySuggestion[]
}

// A weekday rhythm is confident enough to surface once it recurred on at least half of the
// trailing window it was inferred over — a one-off in an 8-week window isn't a rhythm.
const WEEKDAY_INCLUSION_THRESHOLD = 0.5

function isConfidentWeekdayRhythm(occurrences: number, windowSize: number): boolean {
  return occurrences / windowSize >= WEEKDAY_INCLUSION_THRESHOLD
}

// Monthly candidates (inferMonthlyBanners/inferMonthlyEntries) originally skipped any
// inclusion bar (occurrences >= 1), on the theory that a monthly cadence gives far fewer
// trailing data points than weekly. In real use this surfaced one-off coincidences (a
// flight itinerary, a single dinner) as if they were recurring, since a single same-
// day-of-month hit can't distinguish "recurring" from "coincidence." Real recurring
// items (BUDGET!!!, Rent due!, SKIP SAVAGE) have each landed on the same day-of-month
// at least twice in the real data, so requiring 2 occurrences still catches them while
// rejecting the false positives.
const MONTHLY_INCLUSION_THRESHOLD = 2

function isConfidentMonthlyRhythm(occurrences: number): boolean {
  return occurrences >= MONTHLY_INCLUSION_THRESHOLD
}

// Independent sources can propose the same underlying item (real cases: "On-call" as both
// a monthly-banner and a carried-span; "NCF-WE" as both a weekday-rhythm and a
// monthly-entry, since a weekly Sunday event can coincidentally land on the 1st of the
// month). Keeps the first (richer) suggestion — sources are ordered so an occurrence-backed
// one comes before a bare carried-span.
function dedupeBy<T>(items: T[], sameItem: (a: T, b: T) => boolean): T[] {
  const result: T[] = []
  for (const item of items) {
    if (!result.some((existing) => sameItem(existing, item))) result.push(item)
  }
  return result
}

// A banner streak (on-call, a visitor run) carries forward when the immediately preceding
// day has a Banner with matching text — no spanId bookkeeping needed, since "did yesterday
// have this banner" is the whole signal.
function carriedBannerSuggestions(days: Day[], targetDate: ISODate): BannerSuggestion[] {
  const prevDate = addDays(targetDate, -1)
  const precedingBanners = days.filter((d) => d.date === prevDate).flatMap((d) => d.banners)

  const deduped: Banner[] = []
  for (const banner of precedingBanners) {
    if (!deduped.some((existing) => isSameRecurringText(existing.text, banner.text))) deduped.push(banner)
  }

  return deduped.map((banner) => ({ banner, source: 'carried-span' }))
}

// Turns the banners/entries a user accepted out of a DaySuggestion into a real Day —
// each accepted entry becomes its own single-entry group, since suggestions carry no
// adjacency-group information of their own. Entries/banners keep the `raw` they had on
// the source day they were inferred from, so export still round-trips them correctly.
export function buildDayFromSuggestions(date: ISODate, banners: Banner[], entries: Entry[]): Day {
  return { date, banners, groups: entries.map((entry) => [entry]) }
}

export function generateDay(days: Day[], targetDate: ISODate): DaySuggestion {
  const entries = dedupeBy(
    [
      ...inferRhythms(days, targetDate)
        .filter((c) => isConfidentWeekdayRhythm(c.occurrences, c.windowSize))
        .map((c): EntrySuggestion => ({ entry: c.entry, source: 'weekday-rhythm', occurrences: c.occurrences, windowSize: c.windowSize })),
      ...inferMonthlyEntries(days, targetDate)
        .filter((c) => isConfidentMonthlyRhythm(c.occurrences))
        .map((c): EntrySuggestion => ({ entry: c.entry, source: 'monthly-entry', occurrences: c.occurrences, windowSize: c.windowSize })),
    ],
    (a, b) => sameEntry(a.entry, b.entry),
  )

  const banners = dedupeBy(
    [
      ...inferMonthlyBanners(days, targetDate)
        .filter((c) => isConfidentMonthlyRhythm(c.occurrences))
        .map((c): BannerSuggestion => ({ banner: c.banner, source: 'monthly-banner', occurrences: c.occurrences, windowSize: c.windowSize })),
      ...carriedBannerSuggestions(days, targetDate),
    ],
    (a, b) => isSameRecurringText(a.banner.text, b.banner.text),
  )

  return { date: targetDate, banners, entries }
}
