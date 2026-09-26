import type { Day, ISODate } from '../domain/types'
import { dayAnchorId, formatDayShort } from '../utils/formatDate'

export function JumpBar({ days, today }: { days: Day[]; today: ISODate }) {
  return (
    <nav className="jumpbar">
      <div className="chips">
        {days.map((d) => (
          <a
            key={d.date}
            href={`#${dayAnchorId(d.date)}`}
            className={d.date === today ? 'today' : undefined}
            aria-current={d.date === today ? 'date' : undefined}
          >
            {formatDayShort(d.date)}
          </a>
        ))}
      </div>
    </nav>
  )
}
