import type { ISODate } from '../domain/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Parses the ISO date's Y/M/D directly rather than going through `new Date(iso)`,
// which interprets bare "YYYY-MM-DD" as UTC midnight and can shift the weekday by
// a day depending on the local timezone.
export function formatDayHeader(date: ISODate): string {
  const [year, month, day] = date.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[month - 1]} ${day}`
}

// Short "Mon D" form for compact UI (e.g. jump-bar chips). Derives straight from the
// ISO date rather than re-parsing formatDayHeader's rendered string.
export function formatDayShort(date: ISODate): string {
  const [, month, day] = date.split('-').map(Number)
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`
}

export function dayAnchorId(date: ISODate): string {
  return `day-${date}`
}

// UTC arithmetic avoids local-timezone DST edge cases shifting the date by a day.
export function addDays(date: ISODate, n: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
