// src/domain/activity.ts

export interface ActivityDay {
  date: number      // local start-of-day epoch ms
  cards: number     // reviews that day
  sessions: number  // sessions completed that day
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function tally(timestamps: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const t of timestamps) {
    const key = startOfDay(t)
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}

/**
 * Build a per-day activity series for the last `days` days ending today.
 * DST-safe: each day is derived with setDate rather than fixed-ms stepping.
 */
export function buildActivityCalendar(
  reviewTs: number[],
  sessionCompletedTs: number[],
  now: number,
  days = 371,
): ActivityDay[] {
  const cardsByDay = tally(reviewTs)
  const sessionsByDay = tally(sessionCompletedTs)
  const out: ActivityDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.getTime()
    out.push({ date: key, cards: cardsByDay.get(key) ?? 0, sessions: sessionsByDay.get(key) ?? 0 })
  }
  return out
}
