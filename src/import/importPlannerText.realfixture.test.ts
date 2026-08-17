import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openPlannerDb } from '../store/db'
import { importPlannerText } from './importPlannerText'

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

describeIfFixture('importPlannerText against the real fullplannertext', () => {
  it('imports all 269 days and surfaces the known Feb 2 duplicate', async () => {
    const src = readFileSync(FIXTURE_PATH, 'utf8')
    const db = await openPlannerDb('test-import-realfixture-db')

    const result = await importPlannerText(src, db)

    expect(result.dayCount).toBe(269)
    expect(result.duplicateDates).toEqual(['2026-02-02'])
    expect(result.todoListCount).toBe(1)

    const stored = await db.getAllDays()
    expect(stored).toHaveLength(269)
    const feb2 = await db.getDay('2026-02-02')
    expect(feb2).toHaveLength(2)

    const todoLists = await db.getAllTodoLists()
    expect(todoLists).toHaveLength(1)
    expect(todoLists[0].heading).toBe('❤️ 2026 Masterplan')
    expect(todoLists[0].date).toBe('2026-07-25')
    expect(todoLists[0].sections.map((s) => s.label)).toEqual(['Kylie’s', 'Matt’s'])
  })
})
