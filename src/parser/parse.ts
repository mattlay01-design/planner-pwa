import type { Banner, Day, Entry, EntryGroup, TodoList, TodoSection } from '../domain/types'
import { extractTimeSpec } from './timeSpec'

const HEADER_RE = /^([A-Za-z]+), ([A-Za-z]+) (\d{1,2})\s*$/
// A single block can span two calendar days, written as one combined header
// (the source's one real case: "Wednesday, May 13-Thursday, May 14", an overnight trip).
const COMBINED_HEADER_RE = /^([A-Za-z]+), ([A-Za-z]+) (\d{1,2})-([A-Za-z]+), ([A-Za-z]+) (\d{1,2})\s*$/
const SEPARATOR_RE = /^…+$/
const BANNER_RE = /^(\t?)(\*+)(.*)$/
const TITLE_YEAR_RE = /(\d{4})/
// Marks a line as a to-do-list section heading (real cases: "Kylie's To-Do:",
// "Matt's To-Do:") — used both to spot where a running to-do list starts (the group
// immediately before the first such line) and to split it into per-person sections.
const TODO_SECTION_RE = /^(.*)To-Do:\s*$/i

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function isoFromUtcMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

interface HeaderPart {
  weekday: string
  monthIndex: number
  day: number
}

interface HeaderRef {
  start: HeaderPart
  end?: HeaderPart // combined two-day header, e.g. "Wednesday, May 13-Thursday, May 14"
}

interface ResolvedDate {
  date: string
  endDate?: string
}

function resolvePart(part: HeaderPart, cursor: number, year: number): { candidate: number; year: number } | null {
  let candidate = Date.UTC(year, part.monthIndex, part.day)
  if (candidate < cursor) {
    year += 1
    candidate = Date.UTC(year, part.monthIndex, part.day)
  }
  const weekday = WEEKDAYS[new Date(candidate).getUTCDay()]
  if (weekday !== part.weekday) return null
  return { candidate, year }
}

// Walks forward from Jan 1 of `startYear`, resolving each header to the next date
// (never earlier than the previous one, equal allowed for verbatim duplicates like
// Feb 2) whose weekday matches what's written. A weekday mismatch means either the
// wrong seed year or a genuinely malformed header — both are parse errors, not guesses.
function walkForward(headers: HeaderRef[], startYear: number): ResolvedDate[] | null {
  let cursor = Date.UTC(startYear, 0, 1)
  let year = startYear
  const dates: ResolvedDate[] = []

  for (const h of headers) {
    const startResolved = resolvePart(h.start, cursor, year)
    if (!startResolved) return null
    cursor = startResolved.candidate
    year = startResolved.year

    let endDate: string | undefined
    if (h.end) {
      const endResolved = resolvePart(h.end, cursor, year)
      if (!endResolved) return null
      cursor = endResolved.candidate
      year = endResolved.year
      endDate = isoFromUtcMs(endResolved.candidate)
    }

    dates.push({ date: isoFromUtcMs(startResolved.candidate), endDate })
  }

  return dates
}

function describeHeader(h: HeaderPart): string {
  return `${h.weekday}, ${MONTHS[h.monthIndex]} ${h.day}`
}

function resolveYears(headers: HeaderRef[], titleYear: number | null): ResolvedDate[] {
  if (headers.length === 0) return []

  if (titleYear !== null) {
    const dates = walkForward(headers, titleYear)
    if (!dates) {
      throw new Error(`Header weekday doesn't match the declared year ${titleYear}: "${describeHeader(headers[0].start)}"`)
    }
    return dates
  }

  // No title year to seed from (only exercised by tests — the real fixture always has
  // one): brute-force search a generous window around the app's known ~2026 data.
  for (let year = 2024; year <= 2100; year++) {
    const dates = walkForward(headers, year)
    if (dates) return dates
  }

  throw new Error(`Could not infer a year consistent with header weekdays, starting from "${describeHeader(headers[0].start)}"`)
}

function findTitleYear(source: string): number | null {
  const firstHeaderIndex = source.search(HEADER_RE_MULTILINE)
  const titleSection = firstHeaderIndex === -1 ? source : source.slice(0, firstHeaderIndex)
  const match = TITLE_YEAR_RE.exec(titleSection)
  return match ? Number(match[1]) : null
}
const HEADER_RE_MULTILINE = /^([A-Za-z]+, [A-Za-z]+ \d{1,2}(-[A-Za-z]+, [A-Za-z]+ \d{1,2})?)\s*$/m

function matchHeader(line: string): HeaderRef | null {
  const combined = COMBINED_HEADER_RE.exec(line)
  if (combined) {
    const [, sw, sm, sd, ew, em, ed] = combined
    return {
      start: { weekday: sw, monthIndex: MONTHS.indexOf(sm), day: Number(sd) },
      end: { weekday: ew, monthIndex: MONTHS.indexOf(em), day: Number(ed) },
    }
  }
  const single = HEADER_RE.exec(line)
  if (single) {
    const [, weekday, monthName, dayStr] = single
    return { start: { weekday, monthIndex: MONTHS.indexOf(monthName), day: Number(dayStr) } }
  }
  return null
}

function parseBanner(line: string): Banner | null {
  const match = BANNER_RE.exec(line)
  if (!match) return null

  const [, tab, , text] = match
  return { raw: line, text, indented: tab === '\t' }
}

// Exported so the freeform add/edit UI (DayCard) can turn a single typed line into an
// Entry using the exact same time/text extraction the parser uses on import — this is
// what guarantees a hand-typed entry serializes and re-parses identically to a parsed one.
export function parseEntry(line: string): Entry {
  const { time, text } = extractTimeSpec(line)
  return { raw: line, time, text, children: [] }
}

// The nested-sub-agenda heuristic (see the comment on Entry.children in domain/types.ts):
// a single-entry-parent group absorbs a following group into its `children` when the
// group's own AGGREGATE span (earliest start to latest end across all its entries)
// overlaps the parent's time range — not when every individual entry does. Apr 10's
// sub-agenda opens with "7:15-8:15am - bfast", which precedes the parent's stated
// "9am-6pm" start and so wouldn't overlap on its own; it's the group's later entries
// (e.g. "10am-4pm - Audrey watches babe") overlapping the parent that pulls the whole
// block in.
function groupOverlapsParentSpan(parent: Entry, group: Entry[]): boolean {
  const parentStart = parent.time.start
  if (parentStart === undefined) return false
  const parentEnd = parent.time.end ?? parentStart

  const starts = group.map((e) => e.time.start).filter((s): s is number => s !== undefined)
  if (starts.length === 0) return false
  const ends = group.map((e) => e.time.end ?? e.time.start).filter((e): e is number => e !== undefined)

  const groupStart = Math.min(...starts)
  const groupEnd = Math.max(...ends)

  return groupStart <= parentEnd && groupEnd >= parentStart
}

// A running to-do list (real case: "❤️ 2026 Masterplan", fullplannertext:3318) isn't
// day content — it's a standalone block that happens to sit in the stream right after
// a Day. Recognized by shape rather than by its specific heading text: a single-entry
// heading group immediately followed by a "X's To-Do:" section. Everything from the
// heading group onward is pulled out of the day's groups and returned separately.
function extractTodoList(date: string, groups: EntryGroup[]): { groups: EntryGroup[]; todoList: TodoList | null } {
  const sectionStart = groups.findIndex((g) => g.length === 1 && TODO_SECTION_RE.test(g[0].text))
  if (sectionStart <= 0) return { groups, todoList: null }

  const headingGroup = groups[sectionStart - 1]
  if (headingGroup.length !== 1) return { groups, todoList: null }
  const heading = headingGroup[0]

  const sections: TodoSection[] = []
  let currentSection: TodoSection | null = null
  for (let i = sectionStart; i < groups.length; i++) {
    for (const entry of groups[i]) {
      const sectionMatch = TODO_SECTION_RE.exec(entry.text)
      if (sectionMatch) {
        currentSection = { raw: entry.raw, label: sectionMatch[1].trim(), items: [] }
        sections.push(currentSection)
      } else if (currentSection) {
        currentSection.items.push({ raw: entry.raw, text: entry.text })
      }
    }
  }

  return {
    groups: groups.slice(0, sectionStart - 1),
    todoList: { raw: heading.raw, heading: heading.text, date, sections },
  }
}

function finalizeGroups(rawGroups: Entry[][]): EntryGroup[] {
  const groups: EntryGroup[] = []

  for (const group of rawGroups) {
    const prevGroup = groups[groups.length - 1]
    if (prevGroup && prevGroup.length === 1 && group.length > 0 && groupOverlapsParentSpan(prevGroup[0], group)) {
      prevGroup[0].children.push(...group)
      continue
    }
    groups.push(group)
  }

  return groups
}

export interface ParseResult {
  days: Day[]
  todoLists: TodoList[]
}

export function parse(source: string): ParseResult {
  const lines = source.split('\n')

  const headers: HeaderRef[] = []
  for (const line of lines) {
    const match = matchHeader(line)
    if (match) headers.push(match)
  }
  const dates = resolveYears(headers, findTitleYear(source))

  const days: Day[] = []
  const todoLists: TodoList[] = []

  let current: Day | null = null
  let rawGroups: Entry[][] = []
  let currentGroup: Entry[] = []
  let headerIndex = 0

  function flushGroup() {
    if (currentGroup.length > 0) {
      rawGroups.push(currentGroup)
      currentGroup = []
    }
  }

  function flushDay() {
    if (!current) return
    flushGroup()
    const { groups, todoList } = extractTodoList(current.date, finalizeGroups(rawGroups))
    current.groups = groups
    if (todoList) todoLists.push(todoList)
    rawGroups = []
  }

  for (const line of lines) {
    const headerMatch = matchHeader(line)
    if (headerMatch) {
      flushDay()
      const resolved = dates[headerIndex++]
      current = { date: resolved.date, endDate: resolved.endDate, banners: [], groups: [] }
      days.push(current)
      continue
    }

    if (SEPARATOR_RE.test(line)) {
      flushDay()
      current = null
      continue
    }

    if (!current) continue

    if (line.trim() === '') {
      flushGroup()
      continue
    }

    const banner = parseBanner(line)
    if (banner) {
      current.banners.push(banner)
      continue
    }

    currentGroup.push(parseEntry(line))
  }

  flushDay()

  return { days, todoLists }
}
