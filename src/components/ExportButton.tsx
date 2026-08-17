import { useState } from 'react'
import type { Day, TodoList } from '../domain/types'
import { getLastExportDate, recordExport } from '../export/exportStorage'
import { shouldNudgeToExport } from '../export/exportTracking'
import { serialize } from '../parser/serialize'

interface ExportButtonProps {
  days: Day[]
  todoLists?: TodoList[]
}

function exportFileName(): string {
  return `planner-export-${new Date().toISOString().slice(0, 10)}.txt`
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  // Some webviews only honor a download-triggering anchor that's actually in the
  // document; append/remove it around the click rather than firing it detached.
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Web Share API (with a File attachment) is the primary path — it hands the exported
// text straight to Notes/Messages/email via the OS share sheet, matching PLAN.md §7.
// Browsers/contexts that don't support sharing files (most desktop browsers), or that
// reject the share call for policy reasons (observed: Chrome/Windows can report
// canShare: true yet still throw NotAllowedError from share() itself), fall back to a
// plain blob-URL download — which still produces a restorable .txt snapshot, so a
// share-permission quirk never blocks the actual backup.
async function shareOrDownload(text: string): Promise<void> {
  const file = new File([text], exportFileName(), { type: 'text/plain' })
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string }) => Promise<void>
  }

  try {
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: 'Planner export' })
      return
    }
  } catch (err) {
    // The user closing the native share sheet is not a failure — leave it unexported
    // rather than silently also triggering a download behind their back. Any other
    // failure (canShare/share throwing instead of just being unsupported) falls
    // through to the download below.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
  }

  downloadFile(file)
}

export function ExportButton({ days, todoLists = [] }: ExportButtonProps) {
  const [lastExportDate, setLastExportDate] = useState(getLastExportDate)
  const [status, setStatus] = useState<'idle' | 'exporting' | 'error'>('idle')

  async function handleExport() {
    setStatus('exporting')
    try {
      const text = serialize(days, todoLists)
      await shareOrDownload(text)
      recordExport()
      setLastExportDate(getLastExportDate())
      setStatus('idle')
    } catch (err) {
      // AbortError is the user dismissing the native share sheet — not a real failure.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle')
        return
      }
      console.error('export failed', err)
      setStatus('error')
    }
  }

  const nudge = shouldNudgeToExport(lastExportDate)

  return (
    <div className="export-area">
      <button type="button" className="export-btn" onClick={handleExport} disabled={status === 'exporting'}>
        {status === 'exporting' ? 'Exporting…' : 'Export'}
      </button>
      {nudge && <span className="export-nudge">Back up your year — it's been a while</span>}
      {status === 'error' && <span className="export-error">Export failed — try again</span>}
    </div>
  )
}
