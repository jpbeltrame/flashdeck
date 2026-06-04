import { describe, expect, it } from 'vitest'
import { readCollection } from './collection'
import { buildCollection } from './__fixtures__/build-apkg'

const models = {
  '1': { id: 1, name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
}
const decks = { '1': { id: 1, name: 'Default' }, '2': { id: 2, name: 'Spanish::Verbs' } }

describe('readCollection', () => {
  it('throws a clear error when col.models is empty but notes are present (modern Anki schema)', async () => {
    const db = await buildCollection({
      crt: 1_600_000_000,
      models: {},
      decks: {},
      notes: [{ id: 10, mid: '1', flds: 'Q\x1fA' }],
      cards: [],
    })
    expect(() => readCollection(db)).toThrow(/newer Anki version/i)
  })

  it('reads col (crt, models, decks), notes, cards, and revlog', async () => {
    const db = await buildCollection({
      crt: 1_600_000_000, models, decks,
      notes: [{ id: 10, mid: '1', flds: 'Q\x1fA' }],
      cards: [{ id: 100, nid: 10, did: 2, ord: 0, type: 2, ivl: 6, factor: 2500, reps: 3 }],
      revlog: [{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }],
    })
    const col = readCollection(db)
    expect(col.crt).toBe(1_600_000_000)
    expect(col.models['1'].name).toBe('Basic')
    expect(col.decks['2'].name).toBe('Spanish::Verbs')
    expect(col.notes).toEqual([{ id: 10, mid: '1', flds: 'Q\x1fA' }])
    expect(col.cards[0]).toMatchObject({ id: 100, nid: 10, did: 2, ord: 0, type: 2, ivl: 6, factor: 2500 })
    expect(col.revlog).toEqual([{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }])
  })
})
