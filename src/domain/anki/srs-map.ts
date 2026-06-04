import type { Card, ReviewLog } from '../../db/schema'
import type { AnkiCardRow, AnkiRevlogRow } from './types'

const MIN_EASE = 1.3

const STATUS_BY_TYPE: Record<number, Card['srs']['status']> = {
  0: 'new', 1: 'learning', 2: 'review', 3: 'relearning',
}

function intervalDays(ivl: number): number {
  if (ivl < 0) return Math.max(1, Math.ceil(-ivl / 86_400)) // negative = seconds
  return Math.max(0, ivl)
}

export function mapCardSrs(c: AnkiCardRow, crtSec: number, now: number): Card['srs'] {
  const status = STATUS_BY_TYPE[c.type] ?? 'new'
  const ease = c.factor > 0 ? Math.max(MIN_EASE, c.factor / 1000) : 2.5
  const ivl = intervalDays(c.ivl)

  let dueDate: number
  if (status === 'new') dueDate = 0
  else if (status === 'review') dueDate = (crtSec + c.due * 86_400) * 1000 // due = days since crt
  else dueDate = now // learning/relearning: treat as due now

  return { status, ease, intervalDays: ivl, dueDate, reps: c.reps, lapses: c.lapses }
}

/** Map a revlog row to a ReviewLog without id/cardId (the importer assigns those). */
export function mapRevlog(r: AnkiRevlogRow): Omit<ReviewLog, 'id' | 'cardId'> {
  const rating = Math.min(4, Math.max(1, r.ease)) as ReviewLog['rating']
  return {
    ts: r.id,
    rating,
    intervalBefore: intervalDays(r.lastIvl),
    intervalAfter: intervalDays(r.ivl),
    ease: r.factor > 0 ? r.factor / 1000 : 2.5,
  }
}
