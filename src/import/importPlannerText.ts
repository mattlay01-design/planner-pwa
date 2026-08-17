import type { Day } from '../domain/types'
import { parse } from '../parser/parse'
import type { PlannerDb } from '../store/db'

function findDuplicateDates(days: Day[]): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const day of days) {
    if (seen.has(day.date)) {
      if (!duplicates.includes(day.date)) duplicates.push(day.date)
    } else {
      seen.add(day.date)
    }
  }
  return duplicates
}

export type ImportMode = 'replace' | 'merge'

export interface ImportResult {
  dayCount: number
  todoListCount: number
  // Dates that appeared more than once in the source (e.g. Feb 2 in the real
  // fullplannertext), surfaced rather than silently dropped or merged — see
  // CLAUDE.md's "Feb 2 appearing twice verbatim" hard case.
  duplicateDates: string[]
  // 'merge' mode only: dates that were already present in storage before this import,
  // so their days/todoLists from the source were left out rather than added as a
  // duplicate occurrence. Empty in 'replace' mode (nothing to skip — storage is cleared
  // first).
  skippedDates: string[]
}

// mode 'replace' (the default, and the only behavior before multi-upload support):
// wipes existing storage and repopulates from this text — used for first-run import and
// for restoring a backup, where "restore" means "replace with this export," not "merge."
// mode 'merge': adds only the days/todoLists whose date isn't already stored, leaving
// everything already there untouched — for uploading a second, non-overlapping chunk
// (e.g. importing a future-only note now, then a separate history note later) without
// clobbering edits already made to what's there.
export async function importPlannerText(
  rawText: string,
  db: PlannerDb,
  mode: ImportMode = 'replace',
): Promise<ImportResult> {
  const { days, todoLists } = parse(rawText)

  if (mode === 'replace') {
    await db.clearAll()
    await db.putDays(days)
    await db.putTodoLists(todoLists)
    return { dayCount: days.length, todoListCount: todoLists.length, duplicateDates: findDuplicateDates(days), skippedDates: [] }
  }

  const [existingDays, existingTodoLists] = await Promise.all([db.getAllDays(), db.getAllTodoLists()])
  const existingDates = new Set(existingDays.map((d) => d.date))
  const existingTodoDates = new Set(existingTodoLists.map((l) => l.date))

  const newDays = days.filter((d) => !existingDates.has(d.date))
  const newTodoLists = todoLists.filter((l) => !existingTodoDates.has(l.date))

  const skippedDates = [...new Set(days.filter((d) => existingDates.has(d.date)).map((d) => d.date))]

  // Only report duplicates among the days actually kept — a source-duplicate date that's
  // also already in storage is fully dropped via skippedDates, not "kept twice."
  const duplicateDates = findDuplicateDates(newDays)

  await db.putDays(newDays)
  await db.putTodoLists(newTodoLists)

  return { dayCount: newDays.length, todoListCount: newTodoLists.length, duplicateDates, skippedDates }
}
