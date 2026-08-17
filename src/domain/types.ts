// Domain model per docs-planning/PLAN.md §Domain model. Every Entry/Banner keeps its
// original `raw` text forever — parsing only ever adds metadata, never rewrites or
// discards what she typed. Asterisk banner counts are derived from array position at
// render/export time and are never stored (see Banner below).

export type ISODate = string // YYYY-MM-DD

export interface Day {
  date: ISODate
  // Set only for combined-header spans, e.g. the source's one real case,
  // "Wednesday, May 13-Thursday, May 14" (an overnight trip written as a single
  // block). Derived at render/export time from date+endDate, like the banner
  // ordinal — never stored as raw header text.
  endDate?: ISODate
  banners: Banner[]
  groups: EntryGroup[]
}

export interface Banner {
  raw: string
  text: string
  indented: boolean
  spanId?: string // links banners belonging to the same carried-over span (e.g. an on-call streak)
}

// Blank-line-separated block; adjacency between entries in a group is meaningful
// (e.g. Jan 5's "AJ comes to watch Brooks" / "5pm-ish - Phil drops by").
export type EntryGroup = Entry[]

export interface Entry {
  raw: string
  time: TimeSpec
  text: string
  // Sub-agenda entries (e.g. Apr 10's MOM-conference schedule). Resolved 2026-08-02:
  // the source file has no tab indentation anywhere, so `children` cannot be detected
  // from indentation as PLAN.md originally assumed. The parser instead nests a group
  // into the preceding entry's `children` when that preceding group has exactly one
  // entry and the following group's times *overlap* the parent entry's time range
  // (not full containment — Apr 10's real data has a child, "7:15-8:15am - bfast",
  // starting before the parent's own stated "9am-6pm" range, so containment would
  // have missed the very case that motivated this rule). Chosen over flat-groups-only
  // or a hand-maintained exception list — see project memory for the discussion.
  children: Entry[]
}

// A running to-do list, distinct from a Day's dated content — real case: the source's
// "❤️ 2026 Masterplan" block (fullplannertext:3318), which sits in the stream right
// after Sat July 25 but isn't that day's content at all — it's a standalone list with
// its own "Kylie's To-Do:"/"Matt's To-Do:" sections. `date` records which Day it
// immediately followed in the source, purely so serialize() can put it back in the
// same place — it has no dated meaning otherwise. Every raw line is kept, same
// "never discard raw" rule as Day/Entry/Banner.
export interface TodoList {
  raw: string // the heading line as typed, e.g. "❤️ 2026 Masterplan"
  heading: string
  date: ISODate // the preceding Day's date, for round-trip placement only
  sections: TodoSection[]
}

export interface TodoSection {
  raw: string // e.g. "Kylie's To-Do:"
  label: string // "Kylie's", stripped of the trailing "To-Do:" marker
  items: TodoItem[]
}

export interface TodoItem {
  raw: string
  text: string
}

export type TimeSpecKind = 'exact' | 'range' | 'fuzzy' | 'none'
export type TimeSpecModifier = 'ish' | 'approx' | 'uncertain' | 'alt' | 'after'

export interface TimeSpec {
  kind: TimeSpecKind
  start?: number // minutes from midnight
  end?: number // minutes from midnight
  modifier?: TimeSpecModifier
  raw: string // the exact substring as typed, e.g. "9am-6pm", "11am-ish", "5pm~"
}
