import { useEffect, useState } from 'react'
import { DayStream } from './components/DayStream'
import { ImportScreen } from './components/ImportScreen'
import type { Day, TodoList } from './domain/types'
import type { PlannerDb } from './store/db'
import { getPlannerDb } from './store/plannerDb'

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; db: PlannerDb }
  | { status: 'ready'; db: PlannerDb; days: Day[]; todoLists: TodoList[]; duplicateDates: string[] }

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getPlannerDb()
      .then(async (db) => {
        const [days, todoLists] = await Promise.all([db.getAllDays(), db.getAllTodoLists()])
        if (cancelled) return
        setState(
          days.length > 0 ? { status: 'ready', db, days, todoLists, duplicateDates: [] } : { status: 'empty', db },
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
        onImported={(days, todoLists, duplicateDates) =>
          setState({ status: 'ready', db: state.db, days, todoLists, duplicateDates })
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
      onDayAdded={(day) =>
        setState({ ...state, days: [...state.days, day] })
      }
      onDayUpdated={(occurrenceIndex, day) => {
        let seen = -1
        const days = state.days.map((d) => {
          if (d.date !== day.date) return d
          seen += 1
          return seen === occurrenceIndex ? day : d
        })
        setState({ ...state, days })
      }}
      onTodoListUpdated={(occurrenceIndex, list) => {
        let seen = -1
        const todoLists = state.todoLists.map((l) => {
          if (l.date !== list.date) return l
          seen += 1
          return seen === occurrenceIndex ? list : l
        })
        setState({ ...state, todoLists })
      }}
    />
  )
}
