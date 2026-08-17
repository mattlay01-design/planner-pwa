import { openDB, type IDBPDatabase } from 'idb'
import type { Day, ISODate, TodoList } from '../domain/types'

const STORE = 'days'
const DATE_INDEX = 'date'
const TODO_STORE = 'todoLists'
const TODO_DATE_INDEX = 'date'

interface DayRecord extends Day {
  id: string
}

interface TodoListRecord extends TodoList {
  id: string
}

export interface PlannerDb {
  putDay(day: Day): Promise<void>
  putDays(days: Day[]): Promise<void>
  getDay(date: ISODate): Promise<Day[]>
  getAllDays(): Promise<Day[]>
  // occurrenceIndex disambiguates same-date records (e.g. Feb 2's real duplicate) — it's
  // the record's position among same-date days, matching the "date#n" id putDay assigns.
  updateDay(date: ISODate, occurrenceIndex: number, day: Day): Promise<void>
  putTodoLists(lists: TodoList[]): Promise<void>
  getAllTodoLists(): Promise<TodoList[]>
  // occurrenceIndex mirrors updateDay's — todoLists have no natural unique key beyond
  // the Day they followed, and there's no guarantee only one ever follows a given date.
  updateTodoList(date: ISODate, occurrenceIndex: number, list: TodoList): Promise<void>
  clearAll(): Promise<void>
}

export async function openPlannerDb(name = 'planner-db'): Promise<PlannerDb> {
  const idb: IDBPDatabase = await openDB(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(DATE_INDEX, 'date')
      }
      if (oldVersion < 2) {
        const todoStore = db.createObjectStore(TODO_STORE, { keyPath: 'id' })
        todoStore.createIndex(TODO_DATE_INDEX, 'date')
      }
    },
  })

  async function putDay(day: Day) {
    // id is "date#n" rather than plain date, so a genuine duplicate date (Feb 2 in the
    // real data) gets its own record instead of overwriting the first. Assumes putDay
    // isn't called concurrently for the same date — true for putDays' sequential loop.
    const existing = (await idb.getAllFromIndex(STORE, DATE_INDEX, day.date)) as DayRecord[]
    const record: DayRecord = { ...day, id: `${day.date}#${existing.length}` }
    await idb.put(STORE, record)
  }

  return {
    putDay,

    async putDays(days: Day[]) {
      for (const day of days) {
        await putDay(day)
      }
    },

    async getDay(date: ISODate) {
      const records = (await idb.getAllFromIndex(STORE, DATE_INDEX, date)) as DayRecord[]
      return records.map(({ id, ...day }) => day)
    },

    async updateDay(date: ISODate, occurrenceIndex: number, day: Day) {
      const record: DayRecord = { ...day, id: `${date}#${occurrenceIndex}` }
      await idb.put(STORE, record)
    },

    async getAllDays() {
      // Object store's primary key is "date#n", so key order (idb.getAll's default)
      // already sorts by date, then by insertion order within a duplicate date.
      const records = (await idb.getAll(STORE)) as DayRecord[]
      return records.map(({ id, ...day }) => day)
    },

    async putTodoLists(lists: TodoList[]) {
      for (const list of lists) {
        const existing = (await idb.getAllFromIndex(
          TODO_STORE,
          TODO_DATE_INDEX,
          list.date,
        )) as TodoListRecord[]
        const record: TodoListRecord = { ...list, id: `${list.date}#${existing.length}` }
        await idb.put(TODO_STORE, record)
      }
    },

    async getAllTodoLists() {
      const records = (await idb.getAll(TODO_STORE)) as TodoListRecord[]
      return records.map(({ id, ...list }) => list)
    },

    async updateTodoList(date: ISODate, occurrenceIndex: number, list: TodoList) {
      const record: TodoListRecord = { ...list, id: `${date}#${occurrenceIndex}` }
      await idb.put(TODO_STORE, record)
    },

    async clearAll() {
      await idb.clear(STORE)
      await idb.clear(TODO_STORE)
    },
  }
}
