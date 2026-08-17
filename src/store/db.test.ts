import { describe, expect, it } from 'vitest'
import type { Day } from '../domain/types'
import { freshTestDb } from './testDb'

const jan5: Day = {
  date: '2026-01-05',
  banners: [],
  groups: [[{ raw: 'AJ comes to watch Brooks', time: { kind: 'none', raw: '' }, text: 'AJ comes to watch Brooks', children: [] }]],
}

describe('db', () => {
  it('stores a day and retrieves it by date', async () => {
    const db = await freshTestDb()

    await db.putDay(jan5)
    const found = await db.getDay('2026-01-05')

    expect(found).toEqual([jan5])
  })

  it('preserves two days with the same date instead of overwriting (Feb 2 duplicate)', async () => {
    const db = await freshTestDb()
    const feb2a: Day = { date: '2026-02-02', banners: [], groups: [] }
    const feb2b: Day = {
      date: '2026-02-02',
      banners: [{ raw: '*Groundhog Day', text: 'Groundhog Day', indented: false }],
      groups: [],
    }

    await db.putDay(feb2a)
    await db.putDay(feb2b)
    const found = await db.getDay('2026-02-02')

    expect(found).toEqual([feb2a, feb2b])
  })

  it('putDays bulk-inserts, and getAllDays returns everything sorted by date', async () => {
    const db = await freshTestDb()
    const jan1: Day = { date: '2026-01-01', banners: [], groups: [] }
    const sep1: Day = { date: '2026-09-01', banners: [], groups: [] }

    await db.putDays([sep1, jan5, jan1])
    const all = await db.getAllDays()

    expect(all).toEqual([jan1, jan5, sep1])
  })

  it('updateDay replaces the content of an existing record in place', async () => {
    const db = await freshTestDb()
    await db.putDay(jan5)

    const edited: Day = { ...jan5, banners: [{ raw: 'Edited', text: 'Edited', indented: false }] }
    await db.updateDay('2026-01-05', 0, edited)

    expect(await db.getDay('2026-01-05')).toEqual([edited])
    expect(await db.getAllDays()).toEqual([edited])
  })

  it('updateDay targets one occurrence of a duplicate date without touching the other', async () => {
    const db = await freshTestDb()
    const feb2a: Day = { date: '2026-02-02', banners: [], groups: [] }
    const feb2b: Day = {
      date: '2026-02-02',
      banners: [{ raw: '*Groundhog Day', text: 'Groundhog Day', indented: false }],
      groups: [],
    }
    await db.putDay(feb2a)
    await db.putDay(feb2b)

    const editedFirst: Day = { ...feb2a, groups: [[{ raw: 'Added', time: { kind: 'none', raw: '' }, text: 'Added', children: [] }]] }
    await db.updateDay('2026-02-02', 0, editedFirst)

    expect(await db.getDay('2026-02-02')).toEqual([editedFirst, feb2b])
  })
})
