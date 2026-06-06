import { describe, expect, it } from 'vitest'
import { mapCardSrs, mapRevlog } from './srs-map'
import type { AnkiCardRow, AnkiRevlogRow } from './types'

const crt = 1_600_000_000 // collection creation, epoch seconds
const now = 1_600_864_000_000 // 10 days after crt, in ms

function card(over: Partial<AnkiCardRow> = {}): AnkiCardRow {
  return { id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 12, ivl: 6, factor: 2300, reps: 4, lapses: 1, ...over }
}

describe('mapCardSrs', () => {
  it('maps a review card: status, ease, interval, crt-based due', () => {
    const srs = mapCardSrs(card(), crt, now)
    expect(srs.status).toBe('review')
    expect(srs.ease).toBeCloseTo(2.3)
    expect(srs.intervalDays).toBe(6)
    expect(srs.reps).toBe(4)
    expect(srs.lapses).toBe(1)
    expect(srs.dueDate).toBe((crt + 12 * 86400) * 1000) // due is days since crt
  })

  it('maps a new card to status new with dueDate 0', () => {
    const srs = mapCardSrs(card({ type: 0, queue: 0, ivl: 0, factor: 0 }), crt, now)
    expect(srs.status).toBe('new')
    expect(srs.dueDate).toBe(0)
    expect(srs.ease).toBe(2.5) // factor 0 => default
  })

  it('clamps a tiny ease to the SM-2 minimum and converts negative ivl (seconds) to days', () => {
    const srs = mapCardSrs(card({ factor: 1000, ivl: -600 }), crt, now)
    expect(srs.ease).toBe(1.3)
    expect(srs.intervalDays).toBe(1) // 600s rounds up to 1 day
  })

  it('maps learning cards to status learning, due now', () => {
    const srs = mapCardSrs(card({ type: 1, queue: 1 }), crt, now)
    expect(srs.status).toBe('learning')
    expect(srs.dueDate).toBe(now)
  })
})

describe('mapRevlog', () => {
  it('maps ease→rating and intervals', () => {
    const row: AnkiRevlogRow = { id: 1_600_500_000_000, cid: 1, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }
    expect(mapRevlog(row)).toEqual({
      ts: 1_600_500_000_000, rating: 3, statusBefore: 'review',
      intervalBefore: 1, intervalAfter: 6, ease: 2.5,
    })
  })
  it('clamps an out-of-range ease into 1..4', () => {
    expect(mapRevlog({ id: 1, cid: 1, ease: 9, ivl: 1, lastIvl: 0, factor: 0 }).rating).toBe(4)
  })
  it('derives statusBefore from lastIvl (0=new, <0=learning, >0=review)', () => {
    const base = { id: 1, cid: 1, ease: 3, ivl: 1, factor: 2500 }
    expect(mapRevlog({ ...base, lastIvl: 0 }).statusBefore).toBe('new')
    expect(mapRevlog({ ...base, lastIvl: -60 }).statusBefore).toBe('learning')
    expect(mapRevlog({ ...base, lastIvl: 5 }).statusBefore).toBe('review')
  })
})
