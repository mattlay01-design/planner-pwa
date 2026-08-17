import { useState } from 'react'
import type { Day, TodoList } from '../domain/types'
import type { PlannerDb } from '../store/db'
import { formatDayShort } from '../utils/formatDate'
import { DayCard } from './DayCard'
import { ExportButton } from './ExportButton'
import { GenerateDayButton } from './GenerateDayButton'
import { JumpBar } from './JumpBar'
import { TodoListStream } from './TodoListStream'

interface DayStreamProps {
  days: Day[]
  todoLists: TodoList[]
  db: PlannerDb
  onDayAdded: (day: Day) => void
  // occurrenceIndex is the day's position among other records sharing its date (e.g.
  // the real Feb 2 duplicate) — needed to target the right record on edit.
  onDayUpdated: (occurrenceIndex: number, day: Day) => void
  onTodoListUpdated: (occurrenceIndex: number, list: TodoList) => void
  // Dates that appeared more than once in the most recent import (e.g. Feb 2 in the
  // real fullplannertext) — surfaced per PLAN.md's verification step rather than
  // silently absorbed. Empty/omitted outside a just-completed import.
  duplicateDates?: string[]
}

export function DayStream({
  days,
  todoLists,
  db,
  onDayAdded,
  onDayUpdated,
  onTodoListUpdated,
  duplicateDates = [],
}: DayStreamProps) {
  const [tab, setTab] = useState<'days' | 'todos'>('days')
  const occurrenceCounts = new Map<string, number>()

  return (
    <div className="phone">
      <div className="chrome">
        <div className="tabs">
          <button type="button" className={tab === 'days' ? 'tab active' : 'tab'} onClick={() => setTab('days')}>
            Days
          </button>
          <button type="button" className={tab === 'todos' ? 'tab active' : 'tab'} onClick={() => setTab('todos')}>
            To-Do
          </button>
        </div>
        <JumpBar days={days} />
        <ExportButton days={days} todoLists={todoLists} />
      </div>
      {duplicateDates.length > 0 && (
        <p className="import-notice">
          {duplicateDates.length === 1 ? 'This date appears' : 'These dates appear'} twice in your import — both
          were kept: {duplicateDates.map(formatDayShort).join(', ')}
        </p>
      )}
      {tab === 'days' ? (
        <main>
          {days.map((day) => {
            const occurrenceIndex = occurrenceCounts.get(day.date) ?? 0
            occurrenceCounts.set(day.date, occurrenceIndex + 1)
            return (
              <DayCard
                day={day}
                occurrenceIndex={occurrenceIndex}
                db={db}
                onDayUpdated={onDayUpdated}
                key={`${day.date}#${occurrenceIndex}`}
              />
            )
          })}
          <GenerateDayButton db={db} days={days} onDayAdded={onDayAdded} />
        </main>
      ) : (
        <TodoListStream todoLists={todoLists} db={db} onTodoListUpdated={onTodoListUpdated} />
      )}
    </div>
  )
}
