import { parse } from '../parser/parse'
import type { PlannerDb } from '../store/db'

export interface ImportResult {
  dayCount: number
  todoListCount: number
  // Dates that appeared more than once in the source (e.g. Feb 2 in the real
  // fullplannertext), surfaced rather than silently dropped or merged — see
  // CLAUDE.md's "Feb 2 appearing twice verbatim" hard case.
  duplicateDates: string[]
}

export async function importPlannerText(rawText: string, db: PlannerDb): Promise<ImportResult> {
  const { days, todoLists } = parse(rawText)
  // Import replaces whatever's stored, rather than appending — the same path doubles
  // as backup-restore (PLAN.md §3/§7), where "restore" means "replace with this export,"
  // not "merge." Without this, re-running import would duplicate every day, not just
  // genuine same-date duplicates like Feb 2.
  await db.clearAll()
  await db.putDays(days)
  await db.putTodoLists(todoLists)

  const seen = new Set<string>()
  const duplicateDates: string[] = []
  for (const day of days) {
    if (seen.has(day.date)) {
      if (!duplicateDates.includes(day.date)) duplicateDates.push(day.date)
    } else {
      seen.add(day.date)
    }
  }

  return { dayCount: days.length, todoListCount: todoLists.length, duplicateDates }
}
