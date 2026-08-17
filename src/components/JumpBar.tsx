import type { Day } from '../domain/types'
import { dayAnchorId, formatDayShort } from '../utils/formatDate'

export function JumpBar({ days }: { days: Day[] }) {
  return (
    <nav className="jumpbar">
      <div className="chips">
        {days.map((d) => (
          <a key={d.date} href={`#${dayAnchorId(d.date)}`}>
            {formatDayShort(d.date)}
          </a>
        ))}
      </div>
      <span className="label">B — Warm</span>
    </nav>
  )
}
