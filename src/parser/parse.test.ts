import { describe, expect, it } from 'vitest'
import { parse } from './parse'

describe('parse', () => {
  it('parses a single day header with no banners or entries', () => {
    const src = `Thursday, January 1\n\n………………………………………………………………\n`

    const { days } = parse(src)

    expect(days).toEqual([
      {
        date: '2026-01-01',
        banners: [],
        groups: [],
      },
    ])
  })

  it('parses a single non-indented banner line', () => {
    const src = `Thursday, January 1\n\n*New Year’s Day!!\n\n………………………………………………………………\n`

    const { days } = parse(src)

    expect(days[0].banners).toEqual([
      { raw: '*New Year’s Day!!', text: 'New Year’s Day!!', indented: false },
    ])
  })

  it('parses two banners in ordinal position, one tab-indented (Apr 24)', () => {
    const src =
      'Friday, April 24\n\n\t*Melissa babysits!\n\n**On-call\n\n………………………………………………………………\n'

    const { days } = parse(src)

    expect(days[0].banners).toEqual([
      { raw: '\t*Melissa babysits!', text: 'Melissa babysits!', indented: true },
      { raw: '**On-call', text: 'On-call', indented: false },
    ])
  })

  it('parses a single untimed entry as a one-entry group', () => {
    const src = 'Thursday, January 1\n\nMom & Loo come over\n\n………………………………………………………………\n'

    const { days } = parse(src)

    expect(days[0].groups).toEqual([
      [
        {
          raw: 'Mom & Loo come over',
          time: { kind: 'none', raw: '' },
          text: 'Mom & Loo come over',
          children: [],
        },
      ],
    ])
  })

  it('parses an exact time entry', () => {
    const src = day('11:20am - pediatric appt (weight check)')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'exact', start: 11 * 60 + 20, raw: '11:20am', modifier: undefined })
    expect(entry.text).toBe('pediatric appt (weight check)')
  })

  it('parses a range time entry', () => {
    const src = day('9am-5pm - work')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'range', start: 9 * 60, end: 17 * 60, raw: '9am-5pm', modifier: undefined })
    expect(entry.text).toBe('work')
  })

  it('parses a range with an implied start meridiem (6-8:30pm)', () => {
    const src = day('6-8:30pm - Johnson house church')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'range', start: 18 * 60, end: 20 * 60 + 30, raw: '6-8:30pm', modifier: undefined })
  })

  it('parses a fuzzy -ish time entry', () => {
    const src = day('11am-ish - Leighton @ our house')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'fuzzy', start: 11 * 60, raw: '11am-ish', modifier: 'ish' })
    expect(entry.text).toBe('Leighton @ our house')
  })

  it('parses an alt slash time entry', () => {
    const src = day('2/3pm - Mom & Shannon babysit, go budget w/ Matt!')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'range', start: 14 * 60, end: 15 * 60, raw: '2/3pm', modifier: 'alt' })
    expect(entry.text).toBe('Mom & Shannon babysit, go budget w/ Matt!')
  })

  it('parses an approx ~ time entry', () => {
    const src = day('5pm~ - meet Sophie outdoors somewhere!')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'fuzzy', start: 17 * 60, raw: '5pm~', modifier: 'approx' })
    expect(entry.text).toBe('meet Sophie outdoors somewhere!')
  })

  it('parses an After-prefixed time entry', () => {
    const src = day('After 5pm - see Lorraien!')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'exact', start: 17 * 60, raw: 'After 5pm', modifier: 'after' })
    expect(entry.text).toBe('see Lorraien!')
  })

  it('marks a time uncertain when the entry text trails with "?" (Mom arrives?)', () => {
    const src = day('9pm - Mom arrives?')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'fuzzy', start: 21 * 60, raw: '9pm', modifier: 'uncertain' })
    expect(entry.text).toBe('Mom arrives?')
  })

  it('keeps the more specific -ish modifier even when the text also trails with "?"', () => {
    const src = day('6pm-ish - Brentwood library thing?')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time.modifier).toBe('ish')
  })

  it('parses an untimed entry as kind none', () => {
    const src = day('Dinner w/ fam')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'none', raw: '' })
    expect(entry.text).toBe('Dinner w/ fam')
  })

  it('leaves a parenthetical timezone untouched in the text', () => {
    const src = day('4-5pm (5-6pm ET) - call Rachel')
    const [entry] = parse(src).days[0].groups[0]
    expect(entry.time).toEqual({ kind: 'range', start: 16 * 60, end: 17 * 60, raw: '4-5pm', modifier: undefined })
    expect(entry.text).toBe('(5-6pm ET) - call Rachel')
  })
  it('nests a following single-entry-parent group into children when time ranges overlap (Apr 10)', () => {
    const src = day(
      '9am-6pm - MOM conference (breakfast and lunch provided)',
      '',
      '7:15-8:15am - bfast\n8:15-9:15am - opening panel\n9:15-9:45am - poster sessions\n9:45-10:45am - trauma & SU\n10:45-12pm - sneak out to feed baby\n12-1:15pm - lunch roundtable\n1:30-2:30pm - suicide loss OR booktok\n2:30-2:45pm - break to pump\n2:45-3:45pm - trauma OR suicide\n3:45-5pm - sneak out to feed baby\n10am-4pm - Audrey watches babe',
    )

    const groups = parse(src).days[0].groups

    expect(groups).toHaveLength(1)
    const [parentEntry] = groups[0]
    expect(parentEntry.text).toBe('MOM conference (breakfast and lunch provided)')
    expect(parentEntry.children).toHaveLength(11)
    expect(parentEntry.children[0].text).toBe('bfast')
    expect(parentEntry.children[0].time).toEqual({ kind: 'range', start: 7 * 60 + 15, end: 8 * 60 + 15, raw: '7:15-8:15am', modifier: undefined })
    expect(parentEntry.children[10].text).toBe('Audrey watches babe')
  })

  it('surfaces duplicate dates as separate Day entries (Feb 2)', () => {
    const src =
      'Monday, February 2\n\n9:15am - USPS appt @ U City\n\n7:15pm - book club!\n\n………………………………………………………………\n\n\n\nMonday, February 2\n\n9:15am - USPS appt @ U City\n\n7:15pm - book club!\n\n………………………………………………………………\n'

    const { days } = parse(src)

    expect(days).toHaveLength(2)
    expect(days[0].date).toBe('2026-02-02')
    expect(days[1].date).toBe('2026-02-02')
  })

  it('throws when a header weekday does not match the declared title year', () => {
    const src = `⚫️ 2026 Masterplan Hx\n\n………\n\nFriday, January 1\n\n………\n`
    expect(() => parse(src)).toThrow(/weekday/i)
  })

  it('infers the year from the title line', () => {
    const src = `⚫️ 2026 Masterplan Hx\n\n………\n\nThursday, January 1\n\n………\n`
    expect(parse(src).days[0].date).toBe('2026-01-01')
  })

  it('parses a combined two-day header into date + endDate (May 13-14)', () => {
    const src =
      '⚫️ 2026 Masterplan Hx\n\nWednesday, May 13-Thursday, May 14\n\n7:12-9:20am - STL to DFW (AA1410)\n\n………\n'

    const [parsed] = parse(src).days

    expect(parsed.date).toBe('2026-05-13')
    expect(parsed.endDate).toBe('2026-05-14')
    expect(parsed.groups[0][0].text).toBe('STL to DFW (AA1410)')
  })

  it('throws when a combined two-day header end weekday does not match', () => {
    const src = '⚫️ 2026 Masterplan Hx\n\nWednesday, May 13-Friday, May 14\n\n………\n'
    expect(() => parse(src)).toThrow(/weekday/i)
  })

  // Real case: fullplannertext:3318, a standalone "❤️ 2026 Masterplan" to-do-list block
  // sitting right after Sat July 25's day content, before the next separator. It isn't
  // day content — extracted into a separate TodoList instead of being swallowed into
  // July 25's groups (see extractTodoList in parse.ts).
  it('extracts a trailing to-do-list block into a separate TodoList instead of the day’s groups', () => {
    const src = day(
      '7pm - Hadestown @ Creve Coeur AMC!',
      '',
      '❤️ 2026 Masterplan',
      '',
      "Kylie’s To-Do: ",
      '',
      'Jurisprudence exam',
      'Call, ask about pump supplies: 1-844-867-9890',
      '',
      "Matt’s To-Do:",
      '',
      'Car maintenance',
      'Clean bathtub',
    )

    const { days, todoLists } = parse(src)

    expect(days[0].groups).toEqual([
      [{ raw: '7pm - Hadestown @ Creve Coeur AMC!', time: { kind: 'exact', start: 19 * 60, raw: '7pm', modifier: undefined }, text: 'Hadestown @ Creve Coeur AMC!', children: [] }],
    ])
    expect(todoLists).toHaveLength(1)
    expect(todoLists[0].heading).toBe('❤️ 2026 Masterplan')
    expect(todoLists[0].date).toBe(days[0].date)
    expect(todoLists[0].sections).toHaveLength(2)
    expect(todoLists[0].sections[0].label).toBe('Kylie’s')
    expect(todoLists[0].sections[0].items.map((i) => i.text)).toEqual([
      'Jurisprudence exam',
      'Call, ask about pump supplies: 1-844-867-9890',
    ])
    expect(todoLists[0].sections[1].label).toBe('Matt’s')
    expect(todoLists[0].sections[1].items.map((i) => i.text)).toEqual(['Car maintenance', 'Clean bathtub'])
  })
})

function day(...bodyLines: string[]): string {
  return `Thursday, January 1\n\n${bodyLines.join('\n')}\n\n………………………………………………………………\n`
}
