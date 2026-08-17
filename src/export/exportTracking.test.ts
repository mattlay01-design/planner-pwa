import { describe, expect, it } from 'vitest'
import { shouldNudgeToExport } from './exportTracking'

describe('shouldNudgeToExport', () => {
  it('nudges when no export has ever happened', () => {
    expect(shouldNudgeToExport(null, new Date('2026-08-11'))).toBe(true)
  })

  it('does not nudge the day after an export', () => {
    expect(shouldNudgeToExport('2026-08-10T00:00:00.000Z', new Date('2026-08-11'))).toBe(false)
  })

  it('does not nudge just under a week later', () => {
    expect(shouldNudgeToExport('2026-08-05T00:00:00.000Z', new Date('2026-08-11'))).toBe(false)
  })

  it('nudges exactly a week later', () => {
    expect(shouldNudgeToExport('2026-08-04T00:00:00.000Z', new Date('2026-08-11'))).toBe(true)
  })

  it('nudges well over a week later', () => {
    expect(shouldNudgeToExport('2026-07-01T00:00:00.000Z', new Date('2026-08-11'))).toBe(true)
  })

  it('nudges when the stored date is unparseable rather than never nudging again', () => {
    expect(shouldNudgeToExport('not-a-date', new Date('2026-08-11'))).toBe(true)
  })
})
