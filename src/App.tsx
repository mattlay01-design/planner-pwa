import { useEffect, useState } from 'react'
import { DayStream } from './components/DayStream'
import { ImportScreen } from './components/ImportScreen'
import type { Day, TodoList } from './domain/types'
import type { PlannerDb } from './store/db'
import { getPlannerDb } from './store/plannerDb'

type ReadyState = { status: 'ready'; db: PlannerDb; days: Day[]; todoLists: TodoList[]; duplicateDates: string[]; skippedDates: string[] }

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; db: PlannerDb }
  | ReadyState
  | { status: 'merge-import'; from: ReadyState }

// Swaps in `next` for the occurrenceIndex-th item sharing its date (same-date records,
// e.g. the real Feb 2 duplicate, are told apart by position).
function replaceOccurrence<T extends { date: string }>(items: T[], occurrenceIndex: number, next: T): T[] {
  let seen = -1
  return items.map((item) => {
    if (item.date !== next.date) return item
    seen += 1
    return seen === occurrenceIndex ? next : item
  })
}

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' })

  function updateReady(fn: (s: ReadyState) => ReadyState) {
    setState((s) => (s.status === 'ready' ? fn(s) : s))
  }

  useEffect(() => {
    let cancelled = false
    getPlannerDb()
      .then(async (db) => {
        const [days, todoLists] = await Promise.all([db.getAllDays(), db.getAllTodoLists()])
        if (cancelled) return
        setState(
          days.length > 0
            ? { status: 'ready', db, days, todoLists, duplicateDates: [], skippedDates: [] }
            : { status: 'empty', db },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not open storage.' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') return null

  if (state.status === 'error') {
    return (
      <div className="import-screen">
        <h1>Something went wrong</h1>
        <p className="import-error">{state.message}</p>
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <ImportScreen
        db={state.db}
        onImported={(days, todoLists, duplicateDates, skippedDates) =>
          setState({ status: 'ready', db: state.db, days, todoLists, duplicateDates, skippedDates })
        }
      />
    )
  }

  if (state.status === 'merge-import') {
    const { from } = state
    return (
      <ImportScreen
        db={from.db}
        mode="merge"
        onCancel={() => setState(from)}
        onImported={(days, todoLists, duplicateDates, skippedDates) =>
          setState({ status: 'ready', db: from.db, days, todoLists, duplicateDates, skippedDates })
        }
      />
    )
  }

  return (
    <DayStream
      days={state.days}
      todoLists={state.todoLists}
      db={state.db}
      duplicateDates={state.duplicateDates}
      skippedDates={state.skippedDates}
      onAddMoreDays={() => setState({ status: 'merge-import', from: state })}
      // Functional updates: saves from two different cards can resolve before a
      // re-render, and spreading the render-time `state` would drop the first one.
      onDayAdded={(day) =>
        updateReady((s) => ({
          ...s,
          // Stable sort so a placeholder day (arbitrary date, not necessarily "next")
          // lands in the right chronological spot instead of always at the end.
          days: [...s.days, day].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        }))
      }
      onDayUpdated={(occurrenceIndex, day) =>
        updateReady((s) => ({ ...s, days: replaceOccurrence(s.days, occurrenceIndex, day) }))
      }
      onTodoListUpdated={(occurrenceIndex, list) =>
        updateReady((s) => ({ ...s, todoLists: replaceOccurrence(s.todoLists, occurrenceIndex, list) }))
      }
    />
  )
}
