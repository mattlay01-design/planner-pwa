import { useState } from 'react'
import type { TodoItem, TodoList, TodoSection } from '../domain/types'
import type { PlannerDb } from '../store/db'
import { moved } from '../utils/arrays'

interface EditTarget {
  sectionIndex: number
  itemIndex: number | null // null while adding a new item to the section
}

interface TodoListCardProps {
  todoList: TodoList
  occurrenceIndex: number
  db: PlannerDb
  onTodoListUpdated: (occurrenceIndex: number, list: TodoList) => void
}

// Mirrors DayCard's freeform add/edit/remove/reorder pattern, scoped to items within a
// section — sections themselves (one per person, e.g. "Kylie's"/"Matt's") aren't
// added/removed here, since the real data only ever has the two and TodoList's shape
// assumes a small, stable set of sections per list.
export function TodoListCard({ todoList, occurrenceIndex, db, onTodoListUpdated }: TodoListCardProps) {
  const [editingLabel, setEditingLabel] = useState<number | null>(null) // section index
  const [editingItem, setEditingItem] = useState<EditTarget | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(next: TodoList) {
    setSaving(true)
    try {
      await db.updateTodoList(todoList.date, occurrenceIndex, next)
      onTodoListUpdated(occurrenceIndex, next)
    } finally {
      setSaving(false)
    }
  }

  function withSection(sectionIndex: number, fn: (s: TodoSection) => TodoSection): TodoList {
    const sections = todoList.sections.map((s, si) => (si === sectionIndex ? fn(s) : s))
    return { ...todoList, sections }
  }

  function startEditLabel(sectionIndex: number) {
    setDraft(todoList.sections[sectionIndex].label)
    setEditingLabel(sectionIndex)
  }

  async function commitEditLabel() {
    if (editingLabel === null) return
    const sectionIndex = editingLabel
    const label = draft.trim()
    setEditingLabel(null)
    if (!label) return
    await save(withSection(sectionIndex, (s) => ({ ...s, raw: `${label} To-Do:`, label })))
  }

  function startAddItem(sectionIndex: number) {
    setDraft('')
    setEditingItem({ sectionIndex, itemIndex: null })
  }

  function startEditItem(sectionIndex: number, itemIndex: number) {
    setDraft(todoList.sections[sectionIndex].items[itemIndex].text)
    setEditingItem({ sectionIndex, itemIndex })
  }

  async function commitItem() {
    if (!editingItem) return
    const { sectionIndex, itemIndex } = editingItem
    const text = draft.trim()
    setEditingItem(null)
    if (!text) return
    const item: TodoItem = { raw: text, text }
    await save(
      withSection(sectionIndex, (s) => ({
        ...s,
        items: itemIndex === null ? [...s.items, item] : s.items.map((it, i) => (i === itemIndex ? item : it)),
      })),
    )
  }

  async function removeItem(sectionIndex: number, itemIndex: number) {
    await save(withSection(sectionIndex, (s) => ({ ...s, items: s.items.filter((_, i) => i !== itemIndex) })))
  }

  async function moveItem(sectionIndex: number, itemIndex: number, dir: -1 | 1) {
    await save(withSection(sectionIndex, (s) => ({ ...s, items: moved(s.items, itemIndex, itemIndex + dir) })))
  }

  return (
    <section className="day todo-list">
      <div className="day-header-row">
        <div className="day-header">{todoList.heading}</div>
      </div>

      {todoList.sections.map((section, si) => (
        <div className="todo-section" key={si}>
          {editingLabel === si ? (
            <input
              className="edit-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEditLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditLabel()
                if (e.key === 'Escape') setEditingLabel(null)
              }}
              disabled={saving}
            />
          ) : (
            <div className="todo-section-label editable" onClick={() => startEditLabel(si)}>
              {section.label}
            </div>
          )}

          {section.items.map((item, ii) =>
            editingItem?.sectionIndex === si && editingItem.itemIndex === ii ? (
              <input
                key={ii}
                className="edit-input entry-input"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitItem}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitItem()
                  if (e.key === 'Escape') setEditingItem(null)
                }}
                disabled={saving}
              />
            ) : (
              <div className="todo-item entry-row-edit" key={ii}>
                <div className="entry-row-main" onClick={() => startEditItem(si, ii)}>
                  {item.text}
                </div>
                <div className="entry-row-actions">
                  <button type="button" className="mini-btn" onClick={() => moveItem(si, ii, -1)} disabled={ii === 0 || saving} aria-label="Move item earlier">
                    ‹
                  </button>
                  <button type="button" className="mini-btn" onClick={() => moveItem(si, ii, 1)} disabled={ii === section.items.length - 1 || saving} aria-label="Move item later">
                    ›
                  </button>
                  <button type="button" className="mini-btn" onClick={() => removeItem(si, ii)} disabled={saving} aria-label="Remove item">
                    ×
                  </button>
                </div>
              </div>
            ),
          )}

          {editingItem?.sectionIndex === si && editingItem.itemIndex === null ? (
            <input
              className="edit-input entry-input"
              autoFocus
              placeholder="New item…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitItem}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitItem()
                if (e.key === 'Escape') setEditingItem(null)
              }}
              disabled={saving}
            />
          ) : (
            <button type="button" className="add-entry" onClick={() => startAddItem(si)} disabled={saving}>
              + item
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
