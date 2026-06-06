import type { Card } from '../db/schema'

export interface ComposeOptions {
  length: number
  newRatio: number
}

export interface ComposedSession {
  cardIds: string[]
  newCount: number
  reviewCount: number
}

/** Pick and order a session's cards from the due pool, honouring the new/review ratio. */
export function buildSessionCards(due: Card[], opts: ComposeOptions): ComposedSession {
  const { length, newRatio } = opts
  const newCards = due.filter((c) => c.srs.status === 'new')
  const reviewCards = due
    .filter((c) => c.srs.status !== 'new')
    .sort((a, b) => a.srs.dueDate - b.srs.dueDate)

  const targetNew = Math.round(length * newRatio)
  const targetReview = length - targetNew

  let takeNew = Math.min(targetNew, newCards.length)
  let takeReview = Math.min(targetReview, reviewCards.length)

  // Backfill any leftover capacity from whichever pool still has cards.
  let remaining = length - takeNew - takeReview
  if (remaining > 0) {
    const moreReview = Math.min(remaining, reviewCards.length - takeReview)
    takeReview += moreReview
    remaining -= moreReview
    const moreNew = Math.min(remaining, newCards.length - takeNew)
    takeNew += moreNew
  }

  // Reviews first, then new (matches the app's "new cards last" convention).
  const cardIds = [
    ...reviewCards.slice(0, takeReview),
    ...newCards.slice(0, takeNew),
  ].map((c) => c.id)

  return { cardIds, newCount: takeNew, reviewCount: takeReview }
}
