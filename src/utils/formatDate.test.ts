import { describe, expect, it } from 'vitest'
import { pickScrollTargetDate, todayISO } from './formatDate'

describe('pickScrollTargetDate', () => {
  const dates = ['2026-09-20', '2026-09-26', '2026-10-01']

  it('picks today when today has a day', () => {
    expect(pickScrollTargetDate(dates, '2026-09-26')).toBe('2026-09-26')
  })

  it('picks the next future day when today is missing', () => {
    expect(pickScrollTargetDate(dates, '2026-09-27')).toBe('2026-10-01')
    expect(pickScrollTargetDate([...dates].reverse(), '2026-09-21')).toBe('2026-09-26')
  })

  it('picks the last day when all days are past', () => {
    expect(pickScrollTargetDate(dates, '2026-11-01')).toBe('2026-10-01')
  })

  it('returns undefined for no days', () => {
    expect(pickScrollTargetDate([], '2026-09-26')).toBeUndefined()
  })
})

describe('todayISO', () => {
  it('uses the local calendar date', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
