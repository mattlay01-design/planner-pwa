import { useState } from 'react'
import type { Banner, Day, Entry } from '../domain/types'
import { parseEntry } from '../parser/parse'
import type { PlannerDb } from '../store/db'
import { dayAnchorId, formatDayHeader } from '../utils/formatDate'
import { moved } from '../utils/arrays'

function EntryRow({ entry: e, variant }: { entry: Entry; variant: 'entry' | 'child' }) {
  return (
    <div className={variant}>
      <span className="time">{e.time.kind === 'none' ? ' ' : e.time.raw}</span>
      <span>{e.text}</span>
    </div>
  )
}

interface DayCardProps {
  day: Day
  occurrenceIndex: number
  db: PlannerDb
  onDayUpdated: (occurrenceIndex: number, day: Day) => void
}

export function DayCard({ day, occurrenceIndex, db, onDayUpdated }: DayCardProps) {
  const [editingBanner, setEditingBanner] = useState<number | null>(null)
  const [addingBanner, setAddingBanner] = useState(false)
  const [editingEntry, setEditingEntry] = useState<number | null>(null) // group index; entries edited one-per-group
  const [addingEntry, setAddingEntry] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(next: Day) {
    setSaving(true)
    try {
      await db.updateDay(day.date, occurrenceIndex, next)
      onDayUpdated(occurrenceIndex, next)
    } finally {
      setSaving(false)
    }
  }

  function startAddBanner() {
    setDraft('')
    setAddingBanner(true)
  }

  function startEditBanner(i: number) {
    setDraft(day.banners[i].text)
    setEditingBanner(i)
  }

  async function commitAddBanner() {
    const text = draft.trim()
    setAddingBanner(false)
    if (!text) return
    // raw mirrors what parseBanner would produce for a freshly-typed, non-indented
    // banner (a single leading asterisk) — the actual asterisk count is re-derived from
    // array position at serialize time regardless, but this keeps the field
    // parser-shaped/indistinguishable from a real parsed Banner, not just text repeated.
    const banner: Banner = { raw: `*${text}`, text, indented: false }
    await save({ ...day, banners: [...day.banners, banner] })
  }

  async function commitEditBanner() {
    if (editingBanner === null) return
    const i = editingBanner
    const text = draft.trim()
    setEditingBanner(null)
    if (!text) return
    const banners = day.banners.map((b, bi) => (bi === i ? { ...b, raw: `${b.indented ? '\t' : ''}*${text}`, text } : b))
    await save({ ...day, banners })
  }

  async function removeBanner(i: number) {
    await save({ ...day, banners: day.banners.filter((_, bi) => bi !== i) })
  }

  async function moveBanner(i: number, dir: -1 | 1) {
    await save({ ...day, banners: moved(day.banners, i, i + dir) })
  }

  function startAddEntry() {
    setDraft('')
    setAddingEntry(true)
  }

  // Only single-entry groups with no children are edited in place — editing would
  // otherwise need to synthesize a whole new sub-agenda block, and re-typing over a raw
  // line that already carries children would silently drop them (children are never
  // reconstructible from a single edited line). Such entries can still be moved/removed.
  function canEditEntry(groupIndex: number): boolean {
    const group = day.groups[groupIndex]
    return group.length === 1 && group[0].children.length === 0
  }

  function startEditEntry(groupIndex: number) {
    if (!canEditEntry(groupIndex)) return
    setDraft(day.groups[groupIndex][0].raw)
    setEditingEntry(groupIndex)
  }

  async function commitAddEntry() {
    const line = draft.trim()
    setAddingEntry(false)
    if (!line) return
    // Each freeform-added entry becomes its own single-entry group, same convention
    // GenerateDayButton uses — suggestions/manual adds carry no group/adjacency info.
    await save({ ...day, groups: [...day.groups, [parseEntry(line)]] })
  }

  async function commitEditEntry() {
    if (editingEntry === null) return
    const gi = editingEntry
    const line = draft.trim()
    setEditingEntry(null)
    if (!line) return
    const groups = day.groups.map((g, i) => (i === gi ? [parseEntry(line)] : g))
    await save({ ...day, groups })
  }

  async function removeEntryGroup(groupIndex: number) {
    await save({ ...day, groups: day.groups.filter((_, gi) => gi !== groupIndex) })
  }

  async function moveEntryGroup(groupIndex: number, dir: -1 | 1) {
    await save({ ...day, groups: moved(day.groups, groupIndex, groupIndex + dir) })
  }

  return (
    <section className="day" id={dayAnchorId(day.date)}>
      <div className="day-header-row">
        <div className="day-header">{formatDayHeader(day.date)}</div>
      </div>

      <div className="banners">
        {day.banners.map((b, i) =>
          editingBanner === i ? (
            <input
              key={i}
              className="edit-input banner-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEditBanner}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditBanner()
                if (e.key === 'Escape') setEditingBanner(null)
              }}
              disabled={saving}
            />
          ) : (
            <span key={i} className={b.indented ? 'banner indented editable' : 'banner editable'}>
              <span onClick={() => startEditBanner(i)}>{b.text}</span>
              <button type="button" className="mini-btn" onClick={() => moveBanner(i, -1)} disabled={i === 0 || saving} aria-label="Move banner earlier">
                ‹
              </button>
              <button type="button" className="mini-btn" onClick={() => moveBanner(i, 1)} disabled={i === day.banners.length - 1 || saving} aria-label="Move banner later">
                ›
              </button>
              <button type="button" className="mini-btn" onClick={() => removeBanner(i)} disabled={saving} aria-label="Remove banner">
                ×
              </button>
            </span>
          ),
        )}
        {addingBanner ? (
          <input
            className="edit-input banner-input"
            autoFocus
            placeholder="New banner…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAddBanner}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAddBanner()
              if (e.key === 'Escape') setAddingBanner(false)
            }}
            disabled={saving}
          />
        ) : (
          <button type="button" className="banner add-banner" onClick={startAddBanner} disabled={saving}>
            + banner
          </button>
        )}
      </div>

      {day.groups.map((group, gi) => (
        <div className="group editable-group" key={gi}>
          {editingEntry === gi ? (
            <input
              className="edit-input entry-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEditEntry}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditEntry()
                if (e.key === 'Escape') setEditingEntry(null)
              }}
              disabled={saving}
            />
          ) : (
            <div className="entry-row-edit">
              <div
                className={canEditEntry(gi) ? 'entry-row-main' : 'entry-row-main not-editable'}
                title={canEditEntry(gi) ? undefined : "Can't edit this inline — only move or remove the whole block"}
                onClick={() => startEditEntry(gi)}
              >
                {group.map((entry, ei) => (
                  <div key={ei}>
                    <EntryRow entry={entry} variant="entry" />
                    {entry.children.length > 0 && (
                      <div className="children">
                        {entry.children.map((child, ci) => (
                          <EntryRow entry={child} variant="child" key={ci} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!canEditEntry(gi) && (
                  <div className="not-editable-note">🔒 can't edit inline — move or remove only</div>
                )}
              </div>
              <div className="entry-row-actions">
                <button type="button" className="mini-btn" onClick={() => moveEntryGroup(gi, -1)} disabled={gi === 0 || saving} aria-label="Move entry earlier">
                  ‹
                </button>
                <button type="button" className="mini-btn" onClick={() => moveEntryGroup(gi, 1)} disabled={gi === day.groups.length - 1 || saving} aria-label="Move entry later">
                  ›
                </button>
                <button type="button" className="mini-btn" onClick={() => removeEntryGroup(gi)} disabled={saving} aria-label="Remove entry">
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {addingEntry ? (
        <input
          className="edit-input entry-input"
          autoFocus
          placeholder="9am-5pm - new entry…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAddEntry}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitAddEntry()
            if (e.key === 'Escape') setAddingEntry(false)
          }}
          disabled={saving}
        />
      ) : (
        <button type="button" className="add-entry" onClick={startAddEntry} disabled={saving}>
          + entry
        </button>
      )}
    </section>
  )
}
