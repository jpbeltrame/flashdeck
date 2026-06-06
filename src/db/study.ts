import { db } from './db'
import type { Card, ReviewLog } from './schema'
import { reviewCard, type Rating } from '../domain/srs'

async function cardsForScope(scope: string): Promise<Card[]> {
  if (scope === 'all') return db.cards.toArray()
  return db.cards.where('deckId').equals(scope).toArray()
}

export async function getDueCards(scope: string, now: number = Date.now()): Promise<Card[]> {
  const cards = await cardsForScope(scope)
  const due = cards.filter((c) => c.srs.dueDate <= now)
  // New cards last; otherwise soonest-due first.
  due.sort((a, b) => {
    const aNew = a.srs.status === 'new' ? 1 : 0
    const bNew = b.srs.status === 'new' ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    return a.srs.dueDate - b.srs.dueDate
  })
  return due
}

export async function countDue(scope: string, now: number = Date.now()): Promise<number> {
  const cards = await cardsForScope(scope)
  return cards.filter((c) => c.srs.dueDate <= now).length
}

export async function applyReview(
  cardId: string,
  rating: Rating,
  now: number = Date.now(),
): Promise<Card> {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`Card not found: ${cardId}`)
    const after = reviewCard(card.srs, rating, now)
    const updated: Card = { ...card, srs: after }
    const log: ReviewLog = {
      id: crypto.randomUUID(),
      cardId,
      ts: now,
      rating,
      statusBefore: card.srs.status,
      intervalBefore: card.srs.intervalDays,
      intervalAfter: after.intervalDays,
      ease: after.ease,
    }
    await db.cards.put(updated)
    await db.reviews.add(log)
    return updated
  })
}
