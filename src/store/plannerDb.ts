import { openPlannerDb, type PlannerDb } from './db'

// Singleton so the app's read (App.tsx on load) and write (ImportScreen) paths share
// one connection instead of each opening the default-named db independently.
let dbPromise: Promise<PlannerDb> | null = null

export function getPlannerDb(): Promise<PlannerDb> {
  if (!dbPromise) dbPromise = openPlannerDb()
  return dbPromise
}
