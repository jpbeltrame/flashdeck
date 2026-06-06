import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import { getDueCards, applyReview, countDue } from './study'

const NOW = 1_700_000_000_000

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('study queue', () => {
  it('treats brand-new cards (dueDate 0) as due', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    expect(await countDue('d1', NOW)).toBe(1)
  })

  it('scopes by deck and supports "all"', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd2', front: 'Q', back: 'A' })
    expect(await countDue('d1', NOW)).toBe(1)
    expect(await countDue('all', NOW)).toBe(2)
  })

  it('excludes cards scheduled into the future after a review', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOW)
    expect(await countDue('d1', NOW)).toBe(0)
    expect(await countDue('d1', NOW + 2 * 86_400_000)).toBe(1)
  })

  it('returns due cards with review cards before new cards', async () => {
    const a = await createTextCard({ deckId: 'd1', front: 'A', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'B', back: 'B' }) // stays new
    await applyReview(a.card.id, 1, NOW - 86_400_000) // Again → relearning, due ~now
    const due = await getDueCards('d1', NOW)
    expect(due).toHaveLength(2)
    expect(due[0].srs.status).not.toBe('new')
    expect(due[1].srs.status).toBe('new')
  })
})

describe('countNewCardsToday removed', () => {
  it('is no longer part of the study module', async () => {
    const mod = await import('./study')
    expect('countNewCardsToday' in mod).toBe(false)
  })
})

describe('applyReview', () => {
  it('updates SRS and writes a review log', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    const updated = await applyReview(card.id, 3, NOW)
    expect(updated.srs.status).toBe('review')
    expect(updated.srs.reps).toBe(1)
    const logs = await db.reviews.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ cardId: card.id, rating: 3, ts: NOW, statusBefore: 'new' })
  })

  it('throws for an unknown card', async () => {
    await expect(applyReview('missing', 3, NOW)).rejects.toThrow(/not found/i)
  })
})
