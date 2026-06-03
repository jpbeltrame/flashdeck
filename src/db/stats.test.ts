import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import { applyReview } from './study'
import { reviewsToday, studyStreak, deckProgress, startOfDay } from './stats'

const DAY = 86_400_000
const NOON = startOfDay(1_700_000_000_000) + 12 * 3_600_000

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('reviewsToday', () => {
  it('counts only reviews since local midnight', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - DAY) // yesterday
    await applyReview(card.id, 3, NOON)       // today
    expect(await reviewsToday(NOON)).toBe(1)
  })
})

describe('studyStreak', () => {
  it('counts consecutive days ending today', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - 2 * DAY)
    await applyReview(card.id, 3, NOON - DAY)
    await applyReview(card.id, 3, NOON)
    expect(await studyStreak(NOON)).toBe(3)
  })

  it('is zero when there is a gap before today', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - 3 * DAY)
    expect(await studyStreak(NOON)).toBe(0)
  })
})

describe('deckProgress', () => {
  it('reports total / new / due counts', async () => {
    const a = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'Q2', back: 'A2' })
    await applyReview(a.card.id, 3, NOON) // one card no longer new, due tomorrow
    const p = await deckProgress('d1', NOON)
    expect(p).toEqual({ total: 2, new: 1, due: 1 })
  })
})
