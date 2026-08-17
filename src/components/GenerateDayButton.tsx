import { useState } from 'react'
import type { Banner, Day, Entry } from '../domain/types'
import { buildDayFromSuggestions, generateDay, type BannerSuggestion, type DaySuggestion, type EntrySuggestion } from '../rhythms/generate'
import type { PlannerDb } from '../store/db'
import { addDays, formatDayHeader } from '../utils/formatDate'

const SOURCE_LABEL: Record<BannerSuggestion['source'] | EntrySuggestion['source'], string> = {
  'weekday-rhythm': 'weekly',
  'monthly-entry': 'monthly',
  'monthly-banner': 'monthly',
  'carried-span': 'carried from yesterday',
}

interface GenerateDayButtonProps {
  db: PlannerDb
  days: Day[]
  onDayAdded: (day: Day) => void
}

// The button always proposes the day right after the latest one already in the stream —
// this is a forward-extension flow (PLAN.md's "generate a day for an upcoming Monday"),
// not an editor for a date that might already have a real Day record, so `db.putDay`'s
// insert-only semantics are safe here without needing an upsert.
function nextUngeneratedDate(days: Day[]): string {
  const latest = days.reduce((max, d) => (d.date > max ? d.date : max), days[0]?.date ?? '2026-01-01')
  return addDays(latest, 1)
}

export function GenerateDayButton({ db, days, onDayAdded }: GenerateDayButtonProps) {
  const [suggestion, setSuggestion] = useState<DaySuggestion | null>(null)
  const [dismissedBanners, setDismissedBanners] = useState<Set<number>>(new Set())
  const [dismissedEntries, setDismissedEntries] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  function handleGenerate() {
    const targetDate = nextUngeneratedDate(days)
    setSuggestion(generateDay(days, targetDate))
    setDismissedBanners(new Set())
    setDismissedEntries(new Set())
  }

  function handleCancel() {
    setSuggestion(null)
  }

  async function handleConfirm() {
    if (!suggestion) return
    const acceptedBanners: Banner[] = suggestion.banners
      .filter((_, i) => !dismissedBanners.has(i))
      .map((s) => s.banner)
    const acceptedEntries: Entry[] = suggestion.entries
      .filter((_, i) => !dismissedEntries.has(i))
      .map((s) => s.entry)

    const day = buildDayFromSuggestions(suggestion.date, acceptedBanners, acceptedEntries)
    setSaving(true)
    try {
      await db.putDay(day)
      onDayAdded(day)
      setSuggestion(null)
    } finally {
      setSaving(false)
    }
  }

  function toggleBanner(i: number) {
    setDismissedBanners((prev) => toggleInSet(prev, i))
  }

  function toggleEntry(i: number) {
    setDismissedEntries((prev) => toggleInSet(prev, i))
  }

  if (!suggestion) {
    return (
      <button type="button" className="gen-btn" onClick={handleGenerate}>
        ✨ Generate Day
      </button>
    )
  }

  const isEmpty = suggestion.banners.length === 0 && suggestion.entries.length === 0

  return (
    <div className="suggested-box">
      <div className="suggested-tag">
        A gentle guess at {formatDayHeader(suggestion.date)} — dismiss anything that doesn&rsquo;t belong
      </div>
      {isEmpty && <p className="suggested-empty">Nothing recurring found for this day yet.</p>}
      {suggestion.banners.map((s, i) => (
        <div className={dismissedBanners.has(i) ? 'sugg-row dismissed' : 'sugg-row'} key={`banner-${i}`}>
          <span className="banner">
            {s.banner.text}
            <span className="source">{SOURCE_LABEL[s.source]}</span>
          </span>
          <button type="button" className="dismiss" onClick={() => toggleBanner(i)}>
            {dismissedBanners.has(i) ? '+' : '×'}
          </button>
        </div>
      ))}
      {suggestion.entries.map((s, i) => (
        <div className={dismissedEntries.has(i) ? 'sugg-row dismissed' : 'sugg-row'} key={`entry-${i}`}>
          <span className="entry">
            <span className="time">{s.entry.time.kind === 'none' ? ' ' : s.entry.time.raw}</span>
            <span>{s.entry.text}</span>
            <span className="source">{SOURCE_LABEL[s.source]}</span>
          </span>
          <button type="button" className="dismiss" onClick={() => toggleEntry(i)}>
            {dismissedEntries.has(i) ? '+' : '×'}
          </button>
        </div>
      ))}
      <div className="sugg-actions">
        <button type="button" className="sugg-cancel" onClick={handleCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="sugg-confirm" onClick={handleConfirm} disabled={saving}>
          {saving ? 'Adding…' : 'Add day'}
        </button>
      </div>
    </div>
  )
}

function toggleInSet(set: Set<number>, i: number): Set<number> {
  const next = new Set(set)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  return next
}
