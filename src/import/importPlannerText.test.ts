import { describe, expect, it } from 'vitest'
import { freshTestDb } from '../store/testDb'
import { importPlannerText } from './importPlannerText'

describe('importPlannerText', () => {
  it('parses the raw text and persists every day into the given db', async () => {
    const db = await freshTestDb()
    const src = `Thursday, January 1\n\n………………………………………………………………\nFriday, January 2\n\n………………………………………………………………\n`

    const result = await importPlannerText(src, db)

    expect(result.dayCount).toBe(2)
    const all = await db.getAllDays()
    expect(all.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02'])
  })

  it('surfaces duplicate dates (e.g. Feb 2 appearing twice) rather than silently absorbing them', async () => {
    const db = await freshTestDb()
    const src =
      `Monday, February 2\n\n………………………………………………………………\n` +
      `Monday, February 2\n\n………………………………………………………………\n` +
      `Tuesday, February 3\n\n………………………………………………………………\n`

    const result = await importPlannerText(src, db)

    expect(result.dayCount).toBe(3)
    expect(result.duplicateDates).toEqual(['2026-02-02'])
  })

  it('replaces any previously-imported data instead of appending on top of it (re-import / restore)', async () => {
    const db = await freshTestDb()
    const src = `Thursday, January 1\n\n………………………………………………………………\n`

    await importPlannerText(src, db)
    await importPlannerText(src, db)
    const all = await db.getAllDays()

    expect(all).toHaveLength(1)
  })

  it("in 'merge' mode, adds only days whose date isn't already stored, leaving existing days untouched", async () => {
    const db = await freshTestDb()
    const first = `Thursday, January 1\n\n………………………………………………………………\nFriday, January 2\n\n………………………………………………………………\n`
    await importPlannerText(first, db)
    // Edit Jan 1 after the first import, so we can prove a merge import doesn't clobber it.
    await db.updateDay('2026-01-01', 0, { date: '2026-01-01', banners: [], groups: [[
      { raw: '9am - edited after first import', time: { kind: 'none', raw: '' }, text: 'edited after first import', children: [] },
    ]] })

    const second =
      `Friday, January 2\n\n………………………………………………………………\nSaturday, January 3\n\n………………………………………………………………\n`
    const result = await importPlannerText(second, db, 'merge')

    expect(result.dayCount).toBe(1) // only Jan 3 was actually new
    expect(result.skippedDates).toEqual(['2026-01-02'])
    const all = await db.getAllDays()
    expect(all.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(all[0].groups[0][0].text).toBe('edited after first import') // untouched
  })

  it("in 'merge' mode, skips todo lists whose date already has one stored", async () => {
    const db = await freshTestDb()
    const withTodo =
      `Saturday, July 25\n\n7pm - Hadestown\n\n❤️ 2026 Masterplan\n\nKylie's To-Do:\n\nBuy milk\n\nMatt's To-Do:\n\nMow lawn\n\n………………………………………………………………\n`
    await importPlannerText(withTodo, db)

    const result = await importPlannerText(withTodo, db, 'merge')

    expect(result.todoListCount).toBe(0)
    const all = await db.getAllTodoLists()
    expect(all).toHaveLength(1)
  })

  it("in 'merge' mode, a source-duplicate date already in storage is reported as skipped, not as a kept duplicate", async () => {
    const db = await freshTestDb()
    await importPlannerText(`Monday, February 2\n\n………………………………………………………………\n`, db)

    const second =
      `Monday, February 2\n\n………………………………………………………………\n` +
      `Monday, February 2\n\n………………………………………………………………\n` +
      `Tuesday, February 3\n\n………………………………………………………………\n`
    const result = await importPlannerText(second, db, 'merge')

    expect(result.dayCount).toBe(1) // only Feb 3 was actually new
    expect(result.skippedDates).toEqual(['2026-02-02'])
    expect(result.duplicateDates).toEqual([]) // both Feb 2 occurrences were dropped, not "kept twice"
    const all = await db.getAllDays()
    expect(all.map((d) => d.date)).toEqual(['2026-02-02', '2026-02-03'])
  })
})
