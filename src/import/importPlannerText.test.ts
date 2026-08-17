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
})
