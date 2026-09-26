// Thin localStorage wrapper — untested, like ImportScreen's FileReader use, since it's a
// direct browser-API call rather than logic. The nudge decision itself lives in
// exportTracking.ts and is unit-tested against plain strings/Dates.
const KEY = 'planner-last-export'

// localStorage can throw (blocked site data, some private modes). A failed read just means
// "never exported" (nudge shows); a failed write must not fail the export itself.
export function getLastExportDate(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function recordExport(now: Date = new Date()): void {
  try {
    localStorage.setItem(KEY, now.toISOString())
  } catch {
    // ignore — see above
  }
}
