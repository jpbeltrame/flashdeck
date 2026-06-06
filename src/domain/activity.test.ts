// src/domain/activity.test.ts
import { describe, expect, it } from 'vitest'
import { buildActivityCalendar } from './activity'

const DAY = 86_400_000
// A fixed local-noon "now" keeps day bucketing stable regardless of tz.
const NOW = new Date(2026, 5, 5, 12, 0, 0).getTime() // 2026-06-05 12:00 local

describe('buildActivityCalendar', () => {
  it('returns one entry per day in the window, oldest first', () => {
    const cal = buildActivityCalendar([], [], NOW, 7)
    expect(cal).toHaveLength(7)
    expect(cal[0].date).toBeLessThan(cal[6].date)
    expect(cal.every((d) => d.cards === 0 && d.sessions === 0)).toBe(true)
  })

  it('counts reviews and completed sessions on their local day', () => {
    const today = new Date(2026, 5, 5, 9, 0, 0).getTime()
    const yesterday = today - DAY
    const cal = buildActivityCalendar(
      [today, today, yesterday],          // 3 reviews
      [today],                            // 1 completed session
      NOW, 7,
    )
    const last = cal[cal.length - 1]
    const prev = cal[cal.length - 2]
    expect(last).toMatchObject({ cards: 2, sessions: 1 })
    expect(prev).toMatchObject({ cards: 1, sessions: 0 })
  })

  it('ignores timestamps older than the window', () => {
    const old = NOW - 10 * DAY
    const cal = buildActivityCalendar([old], [], NOW, 7)
    expect(cal.reduce((s, d) => s + d.cards, 0)).toBe(0)
  })
})
