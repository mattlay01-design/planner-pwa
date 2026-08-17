// Thin localStorage wrapper — untested, like ImportScreen's FileReader use, since it's a
// direct browser-API call rather than logic. The nudge decision itself lives in
// exportTracking.ts and is unit-tested against plain strings/Dates.
const KEY = 'planner-last-export'

export function getLastExportDate(): string | null {
  return localStorage.getItem(KEY)
}

export function recordExport(now: Date = new Date()): void {
  localStorage.setItem(KEY, now.toISOString())
}
