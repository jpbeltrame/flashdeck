import { describe, expect, it } from 'vitest'
import { buildImportResult } from './import'
import type { ParsedCollection } from './collection'
import type { MediaFile } from './types'

const models = {
  '1': { id: '1', name: 'Basic', type: 0 as const, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }] },
  '2': { id: '2', name: 'Cloze', type: 1 as const, flds: [{ name: 'Text', ord: 0 }],
    tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }] },
}
const decks = { '1': { id: '1', name: 'Default' }, '2': { id: '2', name: 'Spanish::Verbs' } }

function collection(over: Partial<ParsedCollection> = {}): ParsedCollection {
  return {
    crt: 1_600_000_000, models, decks,
    notes: [
      { id: 10, mid: '1', flds: 'Hello <img src="cat.jpg">World' },
      { id: 11, mid: '2', flds: 'The {{c1::sky}} is {{c2::blue}}' },
    ],
    cards: [
      { id: 100, nid: 10, did: 2, ord: 0, type: 2, queue: 2, due: 5, ivl: 6, factor: 2300, reps: 2, lapses: 0 },
      { id: 101, nid: 11, did: 2, ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 },
      { id: 102, nid: 11, did: 2, ord: 1, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 },
    ],
    revlog: [{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2300 }],
    ...over,
  }
}

const media: MediaFile[] = [{ filename: 'cat.jpg', bytes: new Uint8Array([1, 2, 3]) }]

describe('buildImportResult', () => {
  it('creates one flat deck per Anki deck with the full name', () => {
    const r = buildImportResult(collection(), media)
    const names = r.decks.map((d) => d.name).sort()
    expect(names).toEqual(['Default', 'Spanish::Verbs'])
  })

  it('imports notes as HTML with media rewritten to tokens', () => {
    const r = buildImportResult(collection(), media)
    const basic = r.notes.find((n) => n.type === 'basic')!
    expect(basic.format).toBe('html')
    expect(basic.fields.Front).toContain('[[media:')
    expect(basic.fields.Back).toContain('<hr>')
    expect(basic.mediaRefs.length).toBe(1)
  })

  it('maps a Cloze note to two cards (one per ordinal) on the same note', () => {
    const r = buildImportResult(collection(), media)
    const clozeNote = r.notes.find((n) => n.type === 'cloze')!
    const clozeCards = r.cards.filter((c) => c.noteId === clozeNote.id)
    expect(clozeCards.map((c) => c.templateIndex).sort()).toEqual([0, 1])
  })

  it('maps SRS state and links the review log to the right card', () => {
    const r = buildImportResult(collection(), media)
    const reviewCard = r.cards.find((c) => c.srs.status === 'review')!
    expect(reviewCard.srs.intervalDays).toBe(6)
    expect(r.reviews).toHaveLength(1)
    expect(r.reviews[0].cardId).toBe(reviewCard.id)
    expect(r.reviews[0].rating).toBe(3)
  })

  it('creates a media asset per referenced file with an inferred MIME', () => {
    const r = buildImportResult(collection(), media)
    expect(r.media).toHaveLength(1)
    expect(r.media[0].mime).toBe('image/jpeg')
    expect(r.media[0].filename).toBe('cat.jpg')
  })

  it('carries the note-type css onto imported notes', () => {
    const col = collection()
    col.models['1'].css = '.card { font-size: 20px; }'
    const r = buildImportResult(col, media)
    expect(r.notes.find((n) => n.type === 'basic')!.css).toBe('.card { font-size: 20px; }')
  })

  it('drops cards whose deck is missing and warns', () => {
    const c = collection({ cards: [{ id: 200, nid: 10, did: 999, ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 }] })
    const r = buildImportResult(c, media)
    expect(r.cards).toHaveLength(0)
    expect(r.warnings.some((w) => /deck/i.test(w))).toBe(true)
  })
})
