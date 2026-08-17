import type { TodoList } from '../domain/types'
import type { PlannerDb } from '../store/db'
import { TodoListCard } from './TodoListCard'

interface TodoListStreamProps {
  todoLists: TodoList[]
  db: PlannerDb
  // occurrenceIndex is the list's position among other records sharing its date —
  // mirrors DayStream's same handling for Day's real duplicate-date case.
  onTodoListUpdated: (occurrenceIndex: number, list: TodoList) => void
}

export function TodoListStream({ todoLists, db, onTodoListUpdated }: TodoListStreamProps) {
  const occurrenceCounts = new Map<string, number>()

  if (todoLists.length === 0) {
    return <p className="suggested-empty">No to-do lists in this import.</p>
  }

  return (
    <main>
      {todoLists.map((list) => {
        const occurrenceIndex = occurrenceCounts.get(list.date) ?? 0
        occurrenceCounts.set(list.date, occurrenceIndex + 1)
        return (
          <TodoListCard
            todoList={list}
            occurrenceIndex={occurrenceIndex}
            db={db}
            onTodoListUpdated={onTodoListUpdated}
            key={`${list.date}#${occurrenceIndex}`}
          />
        )
      })}
    </main>
  )
}
