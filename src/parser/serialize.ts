import type { Day, Entry, TodoList } from '../domain/types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SEPARATOR = '…'.repeat(24)

function formatHeaderDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ]
  return `${weekday}, ${MONTHS[month - 1]} ${day}`
}

function serializeHeader(day: Day): string {
  const start = formatHeaderDate(day.date)
  if (!day.endDate) return start
  return `${start}-${formatHeaderDate(day.endDate)}`
}

// Asterisk count is derived from array position, never stored — this is what
// eliminates the source file's manual-drift problem. See Banner in domain/types.ts.
function serializeBanner(index: number, text: string, indented: boolean): string {
  const stars = '*'.repeat(index + 1)
  return `${indented ? '\t' : ''}${stars}${text}`
}

// A parent entry's children are re-derived on re-parse via the time-range overlap
// heuristic (see domain/types.ts), which only fires when the children form their own
// blank-line-separated group after a single-entry parent group. So a blank line must
// separate the parent's raw line from its children's block, and the children's lines
// must stay adjacent to each other (no blank between them).
function serializeEntry(entry: Entry): string[] {
  if (entry.children.length === 0) return [entry.raw]
  return [entry.raw, '', ...entry.children.map((child) => child.raw)]
}

// A todo list is reinserted right after the Day it followed in the source (its `date`
// field), before that day's separator — same blank-line-per-block convention as
// entries/banners use elsewhere in this file.
function serializeTodoList(list: TodoList): string[] {
  const lines: string[] = [list.heading, '']
  for (const section of list.sections) {
    lines.push(section.raw, '')
    for (const item of section.items) lines.push(item.raw)
    lines.push('')
  }
  return lines
}

export function serialize(days: Day[], todoLists: TodoList[] = []): string {
  const blocks: string[] = []
  // A TodoList is placed right after the Day it followed in source order, not
  // just any Day sharing its date — matching on date alone would duplicate the
  // list onto every same-date Day (a real case: Feb 2 appears twice verbatim).
  // Each list is consumed at most once, in the order both arrays already share.
  const unplaced = [...todoLists]

  for (const day of days) {
    const lines: string[] = [serializeHeader(day), '']

    day.banners.forEach((banner, index) => {
      lines.push(serializeBanner(index, banner.text, banner.indented))
      lines.push('')
    })

    day.groups.forEach((group) => {
      for (const entry of group) lines.push(...serializeEntry(entry))
      lines.push('')
    })

    const matchIndex = unplaced.findIndex((t) => t.date === day.date)
    if (matchIndex !== -1) {
      const [list] = unplaced.splice(matchIndex, 1)
      lines.push(...serializeTodoList(list))
    }

    lines.push('', SEPARATOR)
    blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n\n') + '\n'
}
