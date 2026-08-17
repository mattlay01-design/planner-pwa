import type { Banner, Day, Entry, ISODate, TimeSpec } from '../domain/types'

export interface RhythmCandidate {
  entry: Entry
  occurrences: number
  windowSize: number
  sourceDates: ISODate[]
}

export interface MonthlyBannerCandidate {
  banner: Banner
  occurrences: number
  windowSize: number
  sourceDates: ISODate[]
}

// PLAN.md §4: "trailing same-weekday history (~6-8 occurrences)" — caps the window so a
// pattern shift late in the year (e.g. WFH hours changing) isn't diluted by months-old data.
// Sparse history (fewer than this many occurrences exist) is handled naturally: the filter
// below just returns whatever's available, uncapped.
const TRAILING_WINDOW_CAP = 8

function weekdayOf(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

// Normalized for comparison only — punctuation/case differences (e.g. trailing
// "!— share & prayer") shouldn't split what's really the same recurring entry.
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

// One text "recurs as" another when they share a common prefix substantial enough
// to be the same underlying plan (e.g. "book club!" vs "book club!— share & prayer").
export function isSameRecurringText(a: string, b: string): boolean {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return na === nb
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  return longer.startsWith(shorter) || longer.includes(shorter)
}

function timeInterval(time: TimeSpec): [number, number] | null {
  if (time.start === undefined) return null
  return [time.start, time.end ?? time.start]
}

// Two entries recur as "the same" time slot when their ranges overlap — not exact
// equality — so a real shift like "9am-5pm - work" -> "9am-4pm - work (WFH)" still
// matches (the new range sits inside the old one), per PLAN.md's pattern-shift example.
// Untimed entries only match other untimed entries; a timed and an untimed entry don't.
function timeRangesOverlap(a: TimeSpec, b: TimeSpec): boolean {
  const ia = timeInterval(a)
  const ib = timeInterval(b)
  if (!ia || !ib) return !ia && !ib
  return ia[0] <= ib[1] && ib[0] <= ia[1]
}

// Days sharing targetDate's recurrence key (weekday or day-of-month), strictly before
// it, most recent first-capped at TRAILING_WINDOW_CAP.
function trailingMatchingDays(days: Day[], targetDate: ISODate, keyOf: (date: ISODate) => number): Day[] {
  const targetKey = keyOf(targetDate)
  return days
    .filter((d) => d.date < targetDate && keyOf(d.date) === targetKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-TRAILING_WINDOW_CAP)
}

interface DatedItem<T> {
  date: ISODate
  item: T
}

// Within a single Day, two distinct items can coincidentally match `sameItem` (real case:
// "BUDGET!!!" and an unrelated to-do "Budget" both land on Aug 1 and normalize the same way).
// That's not a real recurrence signal, so only the first match per Day counts — but two
// separate Day records that legitimately share a date (the real Feb 2 duplicate) are
// unaffected, since each is deduped independently before crossing into clusterByRecurrence.
function collectDatedItems<T>(
  trailingDays: Day[],
  itemsOf: (day: Day) => T[],
  sameItem: (a: T, b: T) => boolean,
): DatedItem<T>[] {
  return trailingDays.flatMap((d) => {
    const deduped: T[] = []
    for (const item of itemsOf(d)) {
      if (!deduped.some((existing) => sameItem(existing, item))) deduped.push(item)
    }
    return deduped.map((item) => ({ date: d.date, item }))
  })
}

interface Cluster<T> {
  representative: T
  occurrences: number
  sourceDates: ISODate[]
}

// Greedily groups items recurring across days: each item joins the first cluster it
// matches (via `sameItem`), or starts a new one. The cluster's representative is its
// most recent occurrence, so a pattern shift (e.g. the WFH hour change) is reflected
// rather than an old, stale variant.
function clusterByRecurrence<T>(datedItems: DatedItem<T>[], sameItem: (a: T, b: T) => boolean): Cluster<T>[] {
  const clusters: DatedItem<T>[][] = []
  for (const di of datedItems) {
    const cluster = clusters.find((c) => sameItem(c[0].item, di.item))
    if (cluster) cluster.push(di)
    else clusters.push([di])
  }

  return clusters.map((cluster) => {
    const sorted = [...cluster].sort((a, b) => a.date.localeCompare(b.date))
    const mostRecent = sorted[sorted.length - 1]
    return {
      representative: mostRecent.item,
      occurrences: cluster.length,
      sourceDates: sorted.map((di) => di.date),
    }
  })
}

export const sameEntry = (a: Entry, b: Entry): boolean =>
  isSameRecurringText(a.text, b.text) && timeRangesOverlap(a.time, b.time)

export function inferRhythms(days: Day[], targetDate: ISODate): RhythmCandidate[] {
  const trailingDays = trailingMatchingDays(days, targetDate, weekdayOf)
  const windowSize = trailingDays.length

  const datedEntries = collectDatedItems(trailingDays, (d) => d.groups.flat(), sameEntry)
  const clusters = clusterByRecurrence(datedEntries, sameEntry)

  return clusters.map((c) => ({
    entry: c.representative,
    occurrences: c.occurrences,
    windowSize,
    sourceDates: c.sourceDates,
  }))
}

// Month-boundary items (e.g. "Rent due!", "SKIP SAVAGE") anchor to day-of-month
// rather than weekday — a separate pass from inferRhythms, per PLAN.md §4.
const sameBanner = (a: Banner, b: Banner): boolean => isSameRecurringText(a.text, b.text)

export function inferMonthlyBanners(days: Day[], targetDate: ISODate): MonthlyBannerCandidate[] {
  const trailingDays = trailingMatchingDays(days, targetDate, dayOfMonth)
  const windowSize = trailingDays.length

  const datedBanners = collectDatedItems(trailingDays, (d) => d.banners, sameBanner)
  const clusters = clusterByRecurrence(datedBanners, sameBanner)

  return clusters.map((c) => ({
    banner: c.representative,
    occurrences: c.occurrences,
    windowSize,
    sourceDates: c.sourceDates,
  }))
}

// Catches month-anchored items with no leading asterisk (real case: BUDGET!!!,
// fullplannertext:3447/3845) that inferMonthlyBanners can't see since it's scoped to
// Banners only. Same day-of-month clustering, over plain Entry items instead.
export function inferMonthlyEntries(days: Day[], targetDate: ISODate): RhythmCandidate[] {
  const trailingDays = trailingMatchingDays(days, targetDate, dayOfMonth)
  const windowSize = trailingDays.length

  const datedEntries = collectDatedItems(trailingDays, (d) => d.groups.flat(), sameEntry)
  const clusters = clusterByRecurrence(datedEntries, sameEntry)

  return clusters.map((c) => ({
    entry: c.representative,
    occurrences: c.occurrences,
    windowSize,
    sourceDates: c.sourceDates,
  }))
}
