import { describe, expect, it } from 'vitest'
import { newCardSrs, reviewCard, DAY_MS } from './srs'

const NOW = 1_700_000_000_000

describe('newCardSrs', () => {
  it('returns sensible defaults for a brand-new card', () => {
    expect(newCardSrs()).toEqual({
      status: 'new',
      ease: 2.5,
      intervalDays: 0,
      dueDate: 0,
      reps: 0,
      lapses: 0,
    })
  })
})

describe('reviewCard — passing', () => {
  it('Good on a new card schedules 1 day out and graduates to review', () => {
    const r = reviewCard(newCardSrs(), 3, NOW)
    expect(r.status).toBe('review')
    expect(r.intervalDays).toBe(1)
    expect(r.reps).toBe(1)
    expect(r.dueDate).toBe(NOW + DAY_MS)
  })

  it('Easy on a new card jumps to 4 days', () => {
    expect(reviewCard(newCardSrs(), 4, NOW).intervalDays).toBe(4)
  })

  it('second Good (reps=1) schedules 6 days', () => {
    const first = reviewCard(newCardSrs(), 3, NOW)
    expect(reviewCard(first, 3, NOW).intervalDays).toBe(6)
  })

  it('mature Good multiplies interval by ease', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 6, dueDate: NOW, reps: 2, lapses: 0 }
    expect(reviewCard(srs, 3, NOW).intervalDays).toBe(15) // round(6 * 2.5)
  })

  it('mature Hard multiplies interval by 1.2', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 10, dueDate: NOW, reps: 3, lapses: 0 }
    expect(reviewCard(srs, 2, NOW).intervalDays).toBe(12) // round(10 * 1.2)
  })
})

describe('reviewCard — failing (Again)', () => {
  it('lapses the card into relearning at 1 day and increments lapses', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 30, dueDate: NOW, reps: 5, lapses: 1 }
    const r = reviewCard(srs, 1, NOW)
    expect(r.status).toBe('relearning')
    expect(r.intervalDays).toBe(1)
    expect(r.reps).toBe(0)
    expect(r.lapses).toBe(2)
  })

  it('never lets ease fall below 1.3', () => {
    let srs = newCardSrs()
    for (let i = 0; i < 12; i++) srs = reviewCard(srs, 1, NOW)
    expect(srs.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('reviewCard — ease adjustments', () => {
  it('Good leaves ease unchanged, Easy raises it, Hard lowers it', () => {
    const base = { status: 'review' as const, ease: 2.5, intervalDays: 10, dueDate: NOW, reps: 3, lapses: 0 }
    expect(reviewCard(base, 3, NOW).ease).toBeCloseTo(2.5, 5)
    expect(reviewCard(base, 4, NOW).ease).toBeCloseTo(2.6, 5)
    expect(reviewCard(base, 2, NOW).ease).toBeCloseTo(2.36, 5)
  })
})
