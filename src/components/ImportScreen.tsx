import { useState } from 'react'
import type { Day, TodoList } from '../domain/types'
import { importPlannerText } from '../import/importPlannerText'
import type { PlannerDb } from '../store/db'

interface ImportScreenProps {
  db: PlannerDb
  onImported: (days: Day[], todoLists: TodoList[], duplicateDates: string[]) => void
}

export function ImportScreen({ db, onImported }: ImportScreenProps) {
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')

  async function handleText(text: string) {
    setImporting(true)
    setError(null)
    try {
      const result = await importPlannerText(text, db)
      const [days, todoLists] = await Promise.all([db.getAllDays(), db.getAllTodoLists()])
      onImported(days, todoLists, result.duplicateDates)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setImporting(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => handleText(String(reader.result ?? ''))
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  function handlePasteSubmit() {
    if (!pasted.trim()) return
    handleText(pasted)
  }

  return (
    <div className="phone import-screen">
      <h1>Import your planner</h1>
      <p>Choose your exported planner text file to load your year.</p>
      <label className="import-picker">
        {importing ? 'Importing…' : 'Choose file'}
        <input
          type="file"
          accept=".txt,text/plain"
          aria-label="Choose planner text file to import"
          onChange={handleFileChange}
          disabled={importing}
        />
      </label>
      <p>Or paste your planner text directly:</p>
      <textarea
        className="import-paste"
        aria-label="Paste planner text to import"
        placeholder="Paste your planner text here…"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        disabled={importing}
        rows={8}
      />
      <button type="button" className="import-picker" onClick={handlePasteSubmit} disabled={importing || !pasted.trim()}>
        {importing ? 'Importing…' : 'Import pasted text'}
      </button>
      <p className="import-error" aria-live="polite">
        {error ?? ''}
      </p>
    </div>
  )
}
