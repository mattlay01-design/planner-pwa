import { openPlannerDb, type PlannerDb } from './db'

// Test-only helper: each call opens a uniquely-named IndexedDB so fake-indexeddb
// doesn't bleed state between tests (it has no automatic per-test reset).
let dbCounter = 0

export function freshTestDb(): Promise<PlannerDb> {
  dbCounter += 1
  return openPlannerDb(`test-planner-db-${dbCounter}`)
}
