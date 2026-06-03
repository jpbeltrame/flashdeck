import { db } from './db'

const DAY_MS = 86_400_000

export interface DeckProgress {
  total: number
  new: number
  due: number
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export async function reviewsToday(now: number = Date.now()): Promise<number> {
  return db.reviews.where('ts').between(startOfDay(now), now, true, true).count()
}

export async function studyStreak(now: number = Date.now()): Promise<number> {
  const reviews = await db.reviews.orderBy('ts').toArray()
  if (reviews.length === 0) return 0
  const days = new Set(reviews.map((r) => startOfDay(r.ts)))
  let cursor = startOfDay(now)
  if (!days.has(cursor)) cursor -= DAY_MS // today not yet studied: try yesterday
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= DAY_MS
  }
  return streak
}

export async function deckProgress(deckId: string, now: number = Date.now()): Promise<DeckProgress> {
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  return {
    total: cards.length,
    new: cards.filter((c) => c.srs.status === 'new').length,
    due: cards.filter((c) => c.srs.dueDate <= now).length,
  }
}
