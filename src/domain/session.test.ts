import { describe, expect, it } from 'vitest'
import type { Card } from '../db/schema'
import { buildSessionCards } from './session'

function card(id: string, status: Card['srs']['status'], dueDate = 0): Card {
  return {
    id, noteId: `n-${id}`, deckId: 'd1', templateIndex: 0,
    srs: { status, ease: 2.5, intervalDays: 0, dueDate, reps: 0, lapses: 0 },
  }
}

const news = (n: number) => Array.from({ length: n }, (_, i) => card(`new${i}`, 'new'))
const reviews = (n: number) =>
  Array.from({ length: n }, (_, i) => card(`rev${i}`, 'review', i + 1))

describe('buildSessionCards', () => {
  it('splits by ratio when both pools are plentiful', () => {
    const r = buildSessionCards([...news(20), ...reviews(20)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(6)
    expect(r.reviewCount).toBe(4)
    expect(r.cardIds).toHaveLength(10)
  })

  it('puts review cards before new cards, reviews sorted by dueDate', () => {
    const r = buildSessionCards([...news(2), ...reviews(2)], { length: 4, newRatio: 0.5 })
    expect(r.cardIds).toEqual(['rev0', 'rev1', 'new0', 'new1'])
  })

  it('backfills from reviews when new cards are short (finished deck → all review)', () => {
    const r = buildSessionCards([...news(1), ...reviews(20)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(1)
    expect(r.reviewCount).toBe(9)
    expect(r.cardIds).toHaveLength(10)
  })

  it('backfills from new cards when reviews are short (fresh deck → all new)', () => {
    const r = buildSessionCards([...news(20), ...reviews(1)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(9)
    expect(r.reviewCount).toBe(1)
    expect(r.cardIds).toHaveLength(10)
  })

  it('returns only what is available when fewer than length are due', () => {
    const r = buildSessionCards([...news(2), ...reviews(1)], { length: 10, newRatio: 0.6 })
    expect(r.cardIds).toHaveLength(3)
    expect(r.newCount).toBe(2)
    expect(r.reviewCount).toBe(1)
  })

  it('handles an empty due list', () => {
    const r = buildSessionCards([], { length: 10, newRatio: 0.6 })
    expect(r).toEqual({ cardIds: [], newCount: 0, reviewCount: 0 })
  })
})
