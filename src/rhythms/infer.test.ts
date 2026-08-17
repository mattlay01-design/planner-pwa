import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Banner, Day, Entry } from '../domain/types'
import { parse } from '../parser/parse'
import { inferMonthlyBanners, inferMonthlyEntries, inferRhythms } from './infer'

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

describe('inferRhythms', () => {
  it('proposes an entry that recurs on every trailing occurrence of the target weekday', () => {
    // Three Mondays, same entry each time, target is the next Monday.
    const days: Day[] = [
      mondayWith('2026-01-05', bookClub()),
      mondayWith('2026-01-12', bookClub()),
      mondayWith('2026-01-19', bookClub()),
    ]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toEqual([
      {
        entry: bookClub(),
        occurrences: 3,
        windowSize: 3,
        sourceDates: ['2026-01-05', '2026-01-12', '2026-01-19'],
      },
    ])
  })

  it('groups occurrences with minor trailing-text variance as one recurring entry (real Feb pattern)', () => {
    const days: Day[] = [
      mondayWith('2026-01-05', bookClub()),
      mondayWith('2026-01-12', bookClub()),
      mondayWith('2026-01-19', bookClubWithPrayer()),
    ]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toEqual([
      {
        entry: bookClubWithPrayer(),
        occurrences: 3,
        windowSize: 3,
        sourceDates: ['2026-01-05', '2026-01-12', '2026-01-19'],
      },
    ])
  })

  it('keeps distinct recurring entries separate and surfaces a one-off with occurrences: 1', () => {
    const days: Day[] = [
      mondayWith('2026-01-05', bookClub(), workBlock()),
      mondayWith('2026-01-12', bookClub(), workBlock()),
      mondayWith('2026-01-19', bookClub(), rentDue()),
    ]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toContainEqual({
      entry: bookClub(),
      occurrences: 3,
      windowSize: 3,
      sourceDates: ['2026-01-05', '2026-01-12', '2026-01-19'],
    })
    expect(candidates).toContainEqual({
      entry: workBlock(),
      occurrences: 2,
      windowSize: 3,
      sourceDates: ['2026-01-05', '2026-01-12'],
    })
    expect(candidates).toContainEqual({
      entry: rentDue(),
      occurrences: 1,
      windowSize: 3,
      sourceDates: ['2026-01-19'],
    })
    expect(candidates).toHaveLength(3)
  })

  it('uses whatever trailing history exists when fewer than a full window is available', () => {
    const days: Day[] = [mondayWith('2026-01-19', bookClub())]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toEqual([
      {
        entry: bookClub(),
        occurrences: 1,
        windowSize: 1,
        sourceDates: ['2026-01-19'],
      },
    ])
  })

  it('recognizes a pattern shift (time changes, text stays) as the same recurring entry via time-range overlap', () => {
    const days: Day[] = [
      mondayWith('2026-01-05', workNineToFive()),
      mondayWith('2026-01-12', workNineToFive()),
      mondayWith('2026-01-19', workNineToFour()),
    ]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toEqual([
      {
        entry: workNineToFour(),
        occurrences: 3,
        windowSize: 3,
        sourceDates: ['2026-01-05', '2026-01-12', '2026-01-19'],
      },
    ])
  })

  it('does not cluster same-text entries at non-overlapping times as one recurring entry', () => {
    const morningCall: Entry = {
      raw: '9am - call Rachel',
      time: { kind: 'exact', start: 9 * 60, raw: '9am' },
      text: 'call Rachel',
      children: [],
    }
    const eveningCall: Entry = {
      raw: '8pm - call Rachel',
      time: { kind: 'exact', start: 20 * 60, raw: '8pm' },
      text: 'call Rachel',
      children: [],
    }
    const days: Day[] = [mondayWith('2026-01-19', morningCall), mondayWith('2026-01-12', eveningCall)]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toContainEqual({
      entry: morningCall,
      occurrences: 1,
      windowSize: 2,
      sourceDates: ['2026-01-19'],
    })
    expect(candidates).toContainEqual({
      entry: eveningCall,
      occurrences: 1,
      windowSize: 2,
      sourceDates: ['2026-01-12'],
    })
    expect(candidates).toHaveLength(2)
  })

  it('caps the trailing window at 8 occurrences rather than using the entire year', () => {
    const days: Day[] = Array.from({ length: 10 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 5 + i * 7))
      return mondayWith(date.toISOString().slice(0, 10), bookClub())
    })
    // 10 trailing Mondays exist; only the most recent 8 should count.
    const targetDate = new Date(Date.UTC(2026, 0, 5 + 10 * 7)).toISOString().slice(0, 10)

    const candidates = inferRhythms(days, targetDate)

    expect(candidates).toEqual([
      {
        entry: bookClub(),
        occurrences: 8,
        windowSize: 8,
        sourceDates: days.slice(2).map((d) => d.date),
      },
    ])
  })

  it('ignores days on or after the target date', () => {
    const days: Day[] = [mondayWith('2026-01-19', bookClub()), mondayWith('2026-01-26', bookClub())]

    const candidates = inferRhythms(days, '2026-01-26')

    expect(candidates).toEqual([
      {
        entry: bookClub(),
        occurrences: 1,
        windowSize: 1,
        sourceDates: ['2026-01-19'],
      },
    ])
  })
})

describe('inferMonthlyBanners', () => {
  it('proposes a banner that recurs on the same day-of-month across trailing months', () => {
    const days: Day[] = [
      dayWithBanners('2026-06-01', rentDueBanner()),
      dayWithBanners('2026-07-01', rentDueBanner()),
    ]

    const candidates = inferMonthlyBanners(days, '2026-08-01')

    expect(candidates).toEqual([
      {
        banner: rentDueBanner(),
        occurrences: 2,
        windowSize: 2,
        sourceDates: ['2026-06-01', '2026-07-01'],
      },
    ])
  })

  it('ignores banners on days with a different day-of-month', () => {
    const days: Day[] = [dayWithBanners('2026-06-01', rentDueBanner()), dayWithBanners('2026-06-15', onCallBanner())]

    const candidates = inferMonthlyBanners(days, '2026-07-01')

    expect(candidates).toEqual([
      {
        banner: rentDueBanner(),
        occurrences: 1,
        windowSize: 1,
        sourceDates: ['2026-06-01'],
      },
    ])
  })
})

describe('inferMonthlyEntries', () => {
  it('proposes a plain (non-banner) entry that recurs on the same day-of-month, real BUDGET!!! case', () => {
    const days: Day[] = [dayWithEntries('2026-06-01', budget()), dayWithEntries('2026-07-01', budget())]

    const candidates = inferMonthlyEntries(days, '2026-08-01')

    expect(candidates).toEqual([
      {
        entry: budget(),
        occurrences: 2,
        windowSize: 2,
        sourceDates: ['2026-06-01', '2026-07-01'],
      },
    ])
  })
})

describeIfFixture('inferRhythms against the real fullplannertext', () => {
  it('recognizes book club as a recurring Monday 7:15pm entry through the real Feb 2 duplicate', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const candidates = inferRhythms(days, '2026-02-09')
    const bookClubCandidate = candidates.find((c) => c.entry.text.startsWith('book club'))

    expect(bookClubCandidate).toBeDefined()
    // Jan 5, 12, 19, 26 + both real Feb 2 duplicate records = 6 trailing Mondays.
    expect(bookClubCandidate?.windowSize).toBe(6)
    expect(bookClubCandidate?.occurrences).toBe(6)
    expect(bookClubCandidate?.sourceDates).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      '2026-02-02',
      '2026-02-02',
    ])
  })
})

describeIfFixture('inferMonthlyBanners against the real fullplannertext', () => {
  it('recognizes Rent due! and SKIP SAVAGE as day-of-month-1 banners through Aug 1 / Sep 1', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const candidates = inferMonthlyBanners(days, '2026-09-01')

    const rentDue = candidates.find((c) => c.banner.text === 'Rent due!')
    expect(rentDue).toBeDefined()
    expect(rentDue?.occurrences).toBe(1)
    expect(rentDue?.sourceDates).toEqual(['2026-08-01'])

    const skipSavage = candidates.find((c) => c.banner.text === 'SKIP SAVAGE')
    expect(skipSavage).toBeDefined()
    expect(skipSavage?.occurrences).toBe(1)
    expect(skipSavage?.sourceDates).toEqual(['2026-08-01'])
  })
})

describeIfFixture('inferMonthlyEntries against the real fullplannertext', () => {
  it('recognizes BUDGET!!! as a day-of-month entry through Aug 1 / Sep 1', () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const days = parse(src).days

    const candidates = inferMonthlyEntries(days, '2026-09-01')

    const budgetCandidate = candidates.find((c) => c.entry.text === 'BUDGET!!!')
    expect(budgetCandidate).toBeDefined()
    expect(budgetCandidate?.occurrences).toBe(1)
    expect(budgetCandidate?.sourceDates).toEqual(['2026-08-01'])
  })
})

function rentDueBanner(): Banner {
  return { raw: '*Rent due!', text: 'Rent due!', indented: false }
}

function onCallBanner(): Banner {
  return { raw: '*On-call', text: 'On-call', indented: false }
}

function dayWithBanners(date: string, ...banners: Banner[]): Day {
  return { date, banners, groups: [] }
}

function dayWithEntries(date: string, ...entries: Entry[]): Day {
  return { date, banners: [], groups: [entries] }
}

function budget(): Entry {
  return {
    raw: 'BUDGET!!!',
    time: { kind: 'none', raw: '' },
    text: 'BUDGET!!!',
    children: [],
  }
}

function workBlock(): Entry {
  return {
    raw: '9am-5pm - work',
    time: { kind: 'range', start: 9 * 60, end: 17 * 60, raw: '9am-5pm' },
    text: 'work',
    children: [],
  }
}

function workNineToFive(): Entry {
  return {
    raw: '9am-5pm - work',
    time: { kind: 'range', start: 9 * 60, end: 17 * 60, raw: '9am-5pm' },
    text: 'work',
    children: [],
  }
}

function workNineToFour(): Entry {
  return {
    raw: '9am-4pm - work (WFH)',
    time: { kind: 'range', start: 9 * 60, end: 16 * 60, raw: '9am-4pm' },
    text: 'work (WFH)',
    children: [],
  }
}

function rentDue(): Entry {
  return {
    raw: 'Rent due!',
    time: { kind: 'none', raw: '' },
    text: 'Rent due!',
    children: [],
  }
}

function bookClubWithPrayer(): Entry {
  return {
    raw: '7:15pm - book club!— share & prayer',
    time: { kind: 'exact', start: 19 * 60 + 15, raw: '7:15pm' },
    text: 'book club!— share & prayer',
    children: [],
  }
}

function bookClub(): Entry {
  return {
    raw: '7:15pm - book club!',
    time: { kind: 'exact', start: 19 * 60 + 15, raw: '7:15pm' },
    text: 'book club!',
    children: [],
  }
}

function mondayWith(date: string, ...entries: Entry[]): Day {
  return { date, banners: [], groups: [entries] }
}
