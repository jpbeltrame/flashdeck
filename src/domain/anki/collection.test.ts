import { describe, expect, it } from 'vitest'
import { readCollection } from './collection'
import { buildCollection, buildModernCollection } from './__fixtures__/build-apkg'

const models = {
  '1': { id: 1, name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
}
const decks = { '1': { id: 1, name: 'Default' }, '2': { id: 2, name: 'Spanish::Verbs' } }

describe('readCollection', () => {
  it('throws a clear error when col.models is empty but notes are present and no modern tables (legacy fixture)', async () => {
    const db = await buildCollection({
      crt: 1_600_000_000,
      models: {},
      decks: {},
      notes: [{ id: 10, mid: '1', flds: 'Q\x1fA' }],
      cards: [],
    })
    expect(() => readCollection(db)).toThrow(/newer Anki version/i)
  })

  it('still throws the clear error when col.models is empty but notes exist (legacy fixture, no modern tables)', async () => {
    const db = await buildCollection({ models: {}, decks: {}, notes: [{ id: 1, mid: '1', flds: 'x' }], cards: [] })
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

describe('readCollection (modern schema v18)', () => {
  it('reconstructs Basic + Cloze note types and decks from the dedicated tables', async () => {
    const db = await buildModernCollection({
      crt: 1_600_000_000,
      notetypes: [
        { id: 1, name: 'Basic', fields: ['Front', 'Back'],
          templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}' }] },
        { id: 2, name: 'Cloze', cloze: true, fields: ['Text'],
          templates: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }] },
      ],
      decks: [{ id: 1, name: 'Default' }, { id: 2, name: 'Spanish\x1fVerbs' }],
      notes: [{ id: 10, mid: 1, flds: 'Q\x1fA' }],
      cards: [{ id: 100, nid: 10, did: 2, ord: 0, type: 0 }],
    })
    const col = readCollection(db)
    expect(col.crt).toBe(1_600_000_000)
    expect(col.models['1']).toMatchObject({ id: '1', name: 'Basic', type: 0 })
    expect(col.models['1'].flds).toEqual([{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }])
    expect(col.models['1'].tmpls[0]).toMatchObject({ ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' })
    expect(col.models['2'].type).toBe(1)
    expect(col.decks['2'].name).toBe('Spanish::Verbs')
    expect(col.notes).toEqual([{ id: 10, mid: '1', flds: 'Q\x1fA' }])
  })

  it('reads the note-type css from the v18 notetype config', async () => {
    const db = await buildModernCollection({
      crt: 1_600_000_000,
      notetypes: [{ id: 1, name: 'Styled', css: '.card { color: red; }', fields: ['Front', 'Back'],
        templates: [{ name: 'C', qfmt: '{{Front}}', afmt: '{{Back}}' }] }],
      decks: [{ id: 1, name: 'Default' }],
      notes: [{ id: 10, mid: 1, flds: 'Q\x1fA' }],
      cards: [{ id: 100, nid: 10, did: 1, ord: 0, type: 0 }],
    })
    expect(readCollection(db).models['1'].css).toBe('.card { color: red; }')
  })

  it('still throws the clear error when neither layout has note types but notes exist', async () => {
    const db = await buildCollection({ models: {}, decks: {}, notes: [{ id: 1, mid: '1', flds: 'x' }], cards: [] })
    expect(() => readCollection(db)).toThrow(/newer Anki version/i)
  })
})
