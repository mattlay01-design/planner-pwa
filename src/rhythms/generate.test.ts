import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Banner, Day, Entry } from '../domain/types'
import { parse } from '../parser/parse'
import { buildDayFromSuggestions, generateDay } from './generate'

// fullplannertext is gitignored real family data (see CLAUDE.md "Critical: data
// sensitivity") — present locally, restored from git history for development.
const FIXTURE_PATH = resolve(__dirname, '../../fullplannertext')
const hasFixture = (() => {
  try {
    readFileSync(FIXTURE_PATH, 'utf8')
    return true
  } catch {
    return false
  }
})()
const describeIfFixture = hasFixture ? describe : describe.skip

describe('generateDay', () => {
  it('suggests a weekday-rhythm entry that recurred on a majority of trailing occurrences', () => {
    const days: Day[] = [
      mondayWith('2026-01-05', bookClub()),
      mondayWith('2026-01-12', bookClub()),
      mondayWith('2026-01-19', bookClub()),
    ]

    const suggestion = generateDay(days, '2026-01-26')

    expect(suggestion).toEqual({
      date: '2026-01-26',
      banners: [],
      entries: [
        {
          entry: bookClub(),
          source: 'weekday-rhythm',
          occurrences: 3,
          windowSize: 3,
        },
      ],
    })
  })

  it('omits a weekday entry that occurred on fewer than half of trailing occurrences', () => {
    const days: Day[] = [
      mondayWith('2026-01-05', bookClub()),
      mondayWith('2026-01-12', bookClub(), oneOff()),
      mondayWith('2026-01-19', bookClub()),
      mondayWith('2026-01-26', bookClub()),
    ]

    const suggestion = generateDay(days, '2026-02-02')

    expect(suggestion.entries).toEqual([
      {
        entry: bookClub(),
        source: 'weekday-rhythm',
        occurrences: 4,
        windowSize: 4,
      },
    ])
  })
})

describe('generateDay monthly banners', () => {
  it('suggests a monthly banner that recurred on a majority of trailing month-anchor days', () => {
    const days: Day[] = [dayWithBanner('2026-06-01', rentDueBanner()), dayWithBanner('2026-07-01', rentDueBanner())]

    const suggestion = generateDay(days, '2026-08-01')

    expect(suggestion.banners).toEqual([
      {
        banner: rentDueBanner(),
        source: 'monthly-banner',
        occurrences: 2,
        windowSize: 2,
      },
    ])
  })

  it('omits a monthly banner seen on only one trailing month-anchor day (a single occurrence cannot distinguish a rhythm from a coincidence)', () => {
    const days: Day[] = [
      dayWithBanner('2026-05-01', rentDueBanner()),
      dayWithBanner('2026-06-01', onCallBanner()),
      dayWithBanner('2026-07-01', onCallBanner()),
    ]

    const suggestion = generateDay(days, '2026-08-01')

    expect(suggestion.banners).not.toContainEqual(expect.objectContaining({ banner: rentDueBanner() }))
    expect(suggestion.banners).toContainEqual({
      banner: onCallBanner(),
      source: 'monthly-banner',
      occurrences: 2,
      windowSize: 3,
    })
  })
})

describe('generateDay monthly entries', () => {
  it('suggests a month-anchored plain entry (real BUDGET!!! case, no leading asterisk)', () => {
    const days: Day[] = [dayWithEntry('2026-06-01', budget()), dayWithEntry('2026-07-01', budget())]

    const suggestion = generateDay(days, '2026-08-01')

    expect(suggestion.entries).toEqual([
      {
        entry: budget(),
        source: 'monthly-entry',
        occurrences: 2,
        windowSize: 2,
      },
    ])
  })
})

describe('generateDay banner dedup across sources', () => {
  it('does not duplicate a banner suggested by both monthly-banner and carried-span', () => {
    // On-call recurs on day-of-month-14 across two trailing months (fires monthly-banner
    // for target Mar 14) AND was on Mar 13, the immediately preceding day (fires
    // carried-span too) — both signals agree on the same banner.
    const days: Day[] = [
      dayWithBanner('2026-01-14', onCallBanner()),
      dayWithBanner('2026-02-14', onCallBanner()),
      dayWithBanner('2026-03-13', onCallBanner()),
    ]

    const suggestion = generateDay(days, '2026-03-14')

    expect(suggestion.banners).toHaveLength(1)
  })
})

describe('generateDay carried banner spans', () => {
  it('carries forward a banner from the immediately preceding day (real on-call streak case)', () => {
    const days: Day[] = [dayWithBanner('2026-03-14', onCallBanner())]

    const suggestion = generateDay(days, '2026-03-15')

    expect(suggestion.banners).toContainEqual({
      banner: onCallBanner(),
      source: 'carried-span',
    })
  })

  it('does not carry a banner forward when the preceding day is not immediately before the target', () => {
    const days: Day[] = [dayWithBanner('2026-03-10', onCallBanner())]

    const suggestion = generateDay(days, '2026-03-15')

    expect(suggestion.banners).not.toContainEqual(expect.objectContaining({ source: 'carried-span' }))
  })
})

describeIfFixture('generateDay against the real fullplannertext', () => {
  it('surfaces BUDGET!!! once it has recurred on day-of-month 1 twice (real Aug 1 / Sep 1 case)', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const suggestion = generateDay(days, '2026-10-01')

    expect(suggestion.entries).toContainEqual(expect.objectContaining({ entry: expect.objectContaining({ text: 'BUDGET!!!' }) }))
  })

  it('does not surface BUDGET!!! yet on Sep 1, when it has only appeared once so far (Aug 1)', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const suggestion = generateDay(days, '2026-09-01')

    expect(suggestion.entries).not.toContainEqual(expect.objectContaining({ entry: expect.objectContaining({ text: 'BUDGET!!!' }) }))
  })

  it('does not duplicate an entry suggested by both weekday-rhythm and monthly-entry (real NCF-WE Sunday/day-1 coincidence)', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const suggestion = generateDay(days, '2026-03-15')
    const ncfEntries = suggestion.entries.filter((e) => e.entry.text.toLowerCase().includes('ncf'))

    expect(ncfEntries).toHaveLength(1)
  })

  it('carries the On-call banner forward into Apr 8 from the real Apr 6-7 streak', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const suggestion = generateDay(days, '2026-04-08')

    expect(suggestion.banners).toContainEqual(
      expect.objectContaining({ banner: expect.objectContaining({ text: 'On-call' }), source: 'carried-span' }),
    )
  })
})

describe('buildDayFromSuggestions', () => {
  it('builds an empty day when nothing is accepted', () => {
    expect(buildDayFromSuggestions('2026-01-26', [], [])).toEqual({
      date: '2026-01-26',
      banners: [],
      groups: [],
    })
  })

  it('puts each accepted entry into its own group and keeps accepted banner order', () => {
    const day = buildDayFromSuggestions('2026-08-01', [rentDueBanner(), onCallBanner()], [bookClub(), budget()])

    expect(day).toEqual({
      date: '2026-08-01',
      banners: [rentDueBanner(), onCallBanner()],
      groups: [[bookClub()], [budget()]],
    })
  })
})

function dayWithEntry(date: string, entry: Entry): Day {
  return { date, banners: [], groups: [[entry]] }
}

function budget(): Entry {
  return {
    raw: 'BUDGET!!!',
    time: { kind: 'none', raw: '' },
    text: 'BUDGET!!!',
    children: [],
  }
}

function onCallBanner(): Banner {
  return { raw: '*On-call', text: 'On-call', indented: false }
}

function dayWithBanner(date: string, banner: Banner): Day {
  return { date, banners: [banner], groups: [] }
}

function rentDueBanner(): Banner {
  return { raw: '*Rent due!', text: 'Rent due!', indented: false }
}

function bookClub(): Entry {
  return {
    raw: '7:15pm - book club!',
    time: { kind: 'exact', start: 19 * 60 + 15, raw: '7:15pm' },
    text: 'book club!',
    children: [],
  }
}

function oneOff(): Entry {
  return {
    raw: 'dentist',
    time: { kind: 'none', raw: '' },
    text: 'dentist',
    children: [],
  }
}

function mondayWith(date: string, ...entries: Entry[]): Day {
  return { date, banners: [], groups: [entries] }
}
