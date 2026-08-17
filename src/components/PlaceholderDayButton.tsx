import { useState } from 'react'
import { parseEntry } from '../parser/parse'
import type { Day } from '../domain/types'
import type { PlannerDb } from '../store/db'

interface PlaceholderDayButtonProps {
  db: PlannerDb
  onDayAdded: (day: Day) => void
}

// A placeholder day isn't a forward-extension of the stream the way GenerateDayButton's
// suggestion is — the date is picked freely (e.g. "sometime in September I know is
// booked, but not which day yet"), so it needs its own date input rather than always
// targeting "the day after the latest one." putDay's date#n id scheme already supports
// this: adding a placeholder for a date that already has a Day just becomes another
// occurrence, same as a genuine duplicate date (Feb 2).
export function PlaceholderDayButton({ db, onDayAdded }: PlaceholderDayButtonProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function startOpen() {
    setDate('')
    setNote('')
    setOpen(true)
  }

  async function commit() {
    if (!date) return
    const text = note.trim()
    const day: Day = {
      date,
      banners: [],
      groups: text ? [[parseEntry(text)]] : [],
    }
    setSaving(true)
    try {
      await db.putDay(day)
      onDayAdded(day)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="placeholder-btn" onClick={startOpen}>
        + Placeholder day
      </button>
    )
  }

  return (
    <div className="placeholder-box">
      <div className="suggested-tag">Mark a day you know is coming, even without full details</div>
      <label className="placeholder-field">
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} autoFocus />
      </label>
      <label className="placeholder-field">
        Note (optional)
        <input
          type="text"
          placeholder="Something's happening this day…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
        />
      </label>
      <div className="sugg-actions">
        <button type="button" className="sugg-cancel" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="sugg-confirm" onClick={commit} disabled={saving || !date}>
          {saving ? 'Adding…' : 'Add day'}
        </button>
      </div>
    </div>
  )
}
