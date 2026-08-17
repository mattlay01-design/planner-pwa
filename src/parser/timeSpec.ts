import type { TimeSpec, TimeSpecModifier } from '../domain/types'

const TIME = String.raw`\d{1,2}(?::\d{2})?`

// Ordered most-specific first: two "H(am|pm)-ish" tokens joined by "-ish-" (nap-tracking
// entries like "8am-ish-9am-ish first nap", fullplannertext:2672), then "H-ish-Hish-pm"
// (the one line that puts "ish" before the end meridiem instead of after:
// "3pm-ish-3:30ish-pm", fullplannertext:2767), then a clean numeric range
// ("9am-5pm"), an alt "H/H(am|pm)" ("2/3pm"), and finally a single time ("11:20am").
const ISH_ISH_RANGE_RE = new RegExp(`^(${TIME})(am|pm)?-ish-(${TIME})(am|pm)`, 'i')
const ISH_MERIDIEM_SWAP_RANGE_RE = new RegExp(`^(${TIME})(am|pm)?-ish-(${TIME})ish-(am|pm)`, 'i')
const RANGE_RE = new RegExp(`^(${TIME})(am|pm)?-(${TIME})(am|pm)`, 'i')
const ALT_RE = new RegExp(`^(${TIME})(am|pm)?/(${TIME})(am|pm)`, 'i')
const EXACT_RE = new RegExp(`^(${TIME})(am|pm)`, 'i')
const AFTER_PREFIX_RE = /^after\s+/i

const FUZZY_MODIFIERS: TimeSpecModifier[] = ['ish', 'approx', 'uncertain']

function toMinutes(clock: string, meridiem: string): number {
  const [hourStr, minuteStr] = clock.split(':')
  let hour = Number(hourStr)
  const minute = minuteStr ? Number(minuteStr) : 0
  const isPm = meridiem.toLowerCase() === 'pm'
  if (isPm && hour !== 12) hour += 12
  if (!isPm && hour === 12) hour = 0
  return hour * 60 + minute
}

// A range's kind is 'fuzzy' only for the genuinely-inexact modifiers — 'alt' ("2/3pm",
// meaning "2pm or 3pm") and 'after' keep 'range'/'exact' since the time itself is stated
// precisely, just open-ended or disjunctive.
function kindFor(baseKind: 'exact' | 'range', modifier: TimeSpecModifier | undefined): TimeSpec['kind'] {
  return modifier && FUZZY_MODIFIERS.includes(modifier) ? 'fuzzy' : baseKind
}

function buildRangeSpec(
  startClock: string,
  startMeridiemRaw: string | undefined,
  endClock: string,
  endMeridiem: string,
  modifier: TimeSpecModifier | undefined,
  raw: string,
): TimeSpec {
  const startMeridiem = startMeridiemRaw ?? endMeridiem
  return {
    kind: kindFor('range', modifier),
    start: toMinutes(startClock, startMeridiem),
    end: toMinutes(endClock, endMeridiem),
    modifier,
    raw,
  }
}

interface Consumed {
  time: TimeSpec
  restStart: number
}

function stripModifierSuffix(line: string, start: number): { modifier?: TimeSpecModifier; end: number } {
  if (line.startsWith('~', start)) return { modifier: 'approx', end: start + 1 }
  if (line.startsWith('-ish', start)) return { modifier: 'ish', end: start + 4 }
  return { end: start }
}

function consumeLeadingTime(line: string): Consumed | null {
  let afterModifier: TimeSpecModifier | undefined
  let offset = 0
  const afterMatch = AFTER_PREFIX_RE.exec(line)
  if (afterMatch) {
    afterModifier = 'after'
    offset = afterMatch[0].length
  }
  const rest = line.slice(offset)

  const ishIshMatch = ISH_ISH_RANGE_RE.exec(rest)
  if (ishIshMatch) {
    const [full, startClock, startMeridiemRaw, endClock, endMeridiem] = ishIshMatch
    const raw = line.slice(0, offset + full.length)
    return {
      time: buildRangeSpec(startClock, startMeridiemRaw, endClock, endMeridiem, afterModifier ?? 'ish', raw),
      restStart: offset + full.length,
    }
  }

  const ishSwapMatch = ISH_MERIDIEM_SWAP_RANGE_RE.exec(rest)
  if (ishSwapMatch) {
    const [full, startClock, startMeridiemRaw, endClock, endMeridiem] = ishSwapMatch
    const raw = line.slice(0, offset + full.length)
    return {
      time: buildRangeSpec(startClock, startMeridiemRaw, endClock, endMeridiem, afterModifier ?? 'ish', raw),
      restStart: offset + full.length,
    }
  }

  const rangeMatch = RANGE_RE.exec(rest)
  if (rangeMatch) {
    const [full, startClock, startMeridiemRaw, endClock, endMeridiem] = rangeMatch
    const suffix = stripModifierSuffix(line, offset + full.length)
    const raw = line.slice(0, suffix.end)
    return {
      time: buildRangeSpec(startClock, startMeridiemRaw, endClock, endMeridiem, afterModifier ?? suffix.modifier, raw),
      restStart: suffix.end,
    }
  }

  const altMatch = ALT_RE.exec(rest)
  if (altMatch) {
    const [full, startClock, startMeridiemRaw, endClock, endMeridiem] = altMatch
    const raw = line.slice(0, offset + full.length)
    return {
      time: buildRangeSpec(startClock, startMeridiemRaw, endClock, endMeridiem, 'alt', raw),
      restStart: offset + full.length,
    }
  }

  const exactMatch = EXACT_RE.exec(rest)
  if (exactMatch) {
    const [full, clock, meridiem] = exactMatch
    const suffix = stripModifierSuffix(line, offset + full.length)
    const modifier = afterModifier ?? suffix.modifier
    const raw = line.slice(0, suffix.end)
    return {
      time: { kind: kindFor('exact', modifier), start: toMinutes(clock, meridiem), modifier, raw },
      restStart: suffix.end,
    }
  }

  return null
}

// A trailing "?" on the entry's own text (not on the time token) signals she's unsure
// the plan will actually happen at the stated time — real cases: "9pm - Mom arrives?"
// (fullplannertext:4014), "2:30pm - Mom flies out?" (4154), "9am-4pm - WFH?" (3526).
// Only applies when no more specific modifier (ish/approx/alt/after) already describes
// the time — e.g. "6pm-ish - Brentwood library thing?" (282) keeps 'ish'.
function applyUncertainTextModifier(time: TimeSpec, text: string): TimeSpec {
  if (time.modifier || time.kind === 'none' || !text.trim().endsWith('?')) return time
  return { ...time, kind: 'fuzzy', modifier: 'uncertain' }
}

export function extractTimeSpec(line: string): { time: TimeSpec; text: string } {
  const consumed = consumeLeadingTime(line)
  if (!consumed) {
    return { time: { kind: 'none', raw: '' }, text: line }
  }

  const text = line.slice(consumed.restStart).replace(/^\s*-\s*|^\s+/, '')
  return { time: applyUncertainTextModifier(consumed.time, text), text }
}
