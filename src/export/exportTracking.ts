const NUDGE_AFTER_DAYS = 7
const NUDGE_AFTER_MS = NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000

// lastExportDate is an ISO timestamp string (Date#toISOString), or null if no export
// has ever happened. PLAN.md §7: "Tracks last-export date; nudges after ~a week."
export function shouldNudgeToExport(lastExportDate: string | null, now: Date = new Date()): boolean {
  if (!lastExportDate) return true
  const elapsed = now.getTime() - new Date(lastExportDate).getTime()
  // An unparseable date (corrupt storage, format change) yields NaN, which every
  // comparison returns false for — nudge in that case rather than never nudging again.
  if (Number.isNaN(elapsed)) return true
  return elapsed >= NUDGE_AFTER_MS
}
