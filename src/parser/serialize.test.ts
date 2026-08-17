import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import { serialize } from './serialize'

describe('serialize', () => {
  it('serializes a single day with no banners or entries, and round-trips', () => {
    const { days } = parse('Thursday, January 1\n\n………………………………………………………………\n')
    const out = serialize(days)

    expect(out).toContain('Thursday, January 1')
    expect(out).toContain('………………………………………………………………')
    expect(parse(out).days).toEqual(days)
  })

  it('renumbers banner asterisks by array position, not stored count', () => {
    const { days } = parse('Thursday, January 1\n\n*New Year’s Day!!\n\n**J flies back!\n\n………………………………………………………………\n')
    days[0].banners.reverse()

    const out = serialize(days)

    expect(out).toContain('*J flies back!\n')
    expect(out).toContain('**New Year’s Day!!\n')
  })

  it('round-trips a tab-indented banner (Apr 24)', () => {
    const src = 'Friday, April 24\n\n\t*Melissa babysits!\n\n**On-call\n\n………………………………………………………………\n'
    const { days } = parse(src)

    const reparsed = parse(serialize(days)).days

    expect(reparsed).toEqual(days)
  })

  it('round-trips an entry with nested children unchanged (Apr 10 shape)', () => {
    const src = 'Thursday, January 1\n\n9am-6pm - conference\n\n7:15-8:15am - bfast\n8:15-9:15am - panel\n\n………………………………………………………………\n'
    const { days } = parse(src)

    const reparsed = parse(serialize(days)).days

    expect(reparsed).toEqual(days)
  })

  it('round-trips a combined two-day header (May 13-14)', () => {
    const src =
      '⚫️ 2026 Masterplan Hx\n\nWednesday, May 13-Thursday, May 14\n\n7:12-9:20am - STL to DFW (AA1410)\n\n………………………………………………………………\n'
    const { days } = parse(src)

    const out = serialize(days)

    expect(out).toContain('Wednesday, May 13-Thursday, May 14')
    expect(parse(out).days).toEqual(days)
  })

  it('round-trips duplicate dates as two separate day blocks (Feb 2)', () => {
    const src =
      'Monday, February 2\n\n9:15am - USPS appt @ U City\n\n………………………………………………………………\n\n\n\nMonday, February 2\n\n9:15am - USPS appt @ U City\n\n………………………………………………………………\n'
    const { days } = parse(src)

    const reparsed = parse(serialize(days)).days

    expect(reparsed).toEqual(days)
    expect(reparsed).toHaveLength(2)
  })

  // Real case: fullplannertext:3318 — a to-do list following a day round-trips back
  // into the same place in the text, not lost or reattached to the wrong day.
  it('round-trips a trailing to-do list back after the day it followed', () => {
    const src =
      'Saturday, July 25\n\n7pm - Hadestown!\n\n❤️ 2026 Masterplan\n\nKylie’s To-Do: \n\nJurisprudence exam\n\n………………………………………………………………\n'
    const { days, todoLists } = parse(src)

    const out = serialize(days, todoLists)
    const reparsed = parse(out)

    expect(reparsed.days).toEqual(days)
    expect(reparsed.todoLists).toEqual(todoLists)
  })

  // Regression: serialize() used to match a TodoList onto every Day sharing its
  // date, duplicating the block when a date is a genuine duplicate (Feb 2 case).
  it('places a to-do list after only the day it followed, even with a duplicate date', () => {
    const src =
      'Monday, February 2\n\n9:15am - USPS appt @ U City\n\n………………………………………………………………\n\n\n\nMonday, February 2\n\n9:15am - USPS appt @ U City\n\n❤️ 2026 Masterplan\n\nKylie’s To-Do: \n\nJurisprudence exam\n\n………………………………………………………………\n'
    const { days, todoLists } = parse(src)
    expect(todoLists).toHaveLength(1)

    const out = serialize(days, todoLists)

    expect(out.match(/Masterplan/g)).toHaveLength(1)
    const reparsed = parse(out)
    expect(reparsed.days).toEqual(days)
    expect(reparsed.todoLists).toEqual(todoLists)
  })
})
