import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { importApkg, persistImport } from './import'
import { buildImportResult } from '../domain/anki/import'
import { readCollection } from '../domain/anki/collection'
import { unzipApkg } from '../domain/anki/unzip'
import { buildCollection, buildModernCollection, zipApkg, zipModernApkg, openFromBytes } from '../domain/anki/__fixtures__/build-apkg'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const models = {
  '1': { id: '1', name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
}
const decks = { '1': { id: '1', name: 'Default' }, '2': { id: '2', name: 'Spanish' } }

async function sampleApkg(): Promise<Uint8Array> {
  const cdb = await buildCollection({
    crt: 1_600_000_000, models, decks,
    notes: [{ id: 10, mid: '1', flds: 'Hola <img src="cat.jpg">Hello' }],
    cards: [{ id: 100, nid: 10, did: 2, ord: 0, type: 2, queue: 2, due: 5, ivl: 6, factor: 2500, reps: 2 }],
    revlog: [{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }],
  })
  return zipApkg(cdb, [{ filename: 'cat.jpg', bytes: new Uint8Array([1, 2, 3]) }])
}

describe('persistImport', () => {
  it('writes decks, notes, cards, media, and reviews in one transaction', async () => {
    const bytes = await sampleApkg()
    const { collection, media } = unzipApkg(bytes)
    const sqlDb = await openFromBytes(collection)
    const result = buildImportResult(readCollection(sqlDb), media)

    await persistImport(result)

    expect(await db.decks.count()).toBe(1) // empty Default deck is skipped
    expect(await db.notes.count()).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.media.count()).toBe(1)
    expect(await db.reviews.count()).toBe(1)
  })
})

describe('importApkg (modern schema v18, end-to-end)', () => {
  it('imports a modern .apkg with a Cloze note and a hierarchical deck name', async () => {
    const cdb = await buildModernCollection({
      crt: 1_600_000_000,
      notetypes: [
        { id: 1, name: 'Basic', fields: ['Front', 'Back'],
          templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }] },
        { id: 2, name: 'Cloze', cloze: true, fields: ['Text'],
          templates: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }] },
      ],
      decks: [{ id: 1, name: 'Default' }, { id: 2, name: 'Spanish\x1fVerbs' }],
      notes: [
        { id: 10, mid: 1, flds: 'Hello\x1fWorld' },
        { id: 11, mid: 2, flds: 'The {{c1::sky}} is {{c2::blue}}' },
      ],
      cards: [
        { id: 100, nid: 10, did: 2, ord: 0, type: 0 },
        { id: 101, nid: 11, did: 2, ord: 0, type: 0 },
        { id: 102, nid: 11, did: 2, ord: 1, type: 0 },
      ],
    })
    const file = new File([zipApkg(cdb)], 'modern.apkg')

    const summary = await importApkg(file, { openDb: openFromBytes })
    expect(summary.decks).toBe(1) // empty Default deck is skipped
    expect(summary.notes).toBe(2)
    expect(summary.cards).toBe(3) // 1 basic + 2 cloze ordinals

    const decks = await db.decks.toArray()
    expect(decks.map((d) => d.name).sort()).toEqual(['Spanish::Verbs'])
    const cloze = (await db.notes.toArray()).find((n) => n.type === 'cloze')!
    expect(cloze.format).toBe('html')
    expect(cloze.fields.Front).toContain('cloze')
  })
})

describe('importApkg (modern v3 package with media)', () => {
  it('imports a zstd .apkg whose media manifest is a protobuf, resolving image refs', async () => {
    const cdb = await buildModernCollection({
      crt: 1_600_000_000,
      notetypes: [
        { id: 1, name: 'Basic', fields: ['Front', 'Back'],
          templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}' }] },
      ],
      decks: [{ id: 1, name: 'Default' }],
      notes: [{ id: 10, mid: 1, flds: 'Look <img src="cat.jpg">\x1fA cat' }],
      cards: [{ id: 100, nid: 10, did: 1, ord: 0, type: 0 }],
    })
    const file = new File(
      [zipModernApkg(cdb, [{ filename: 'cat.jpg', bytes: new Uint8Array([1, 2, 3]) }])],
      'modern.apkg',
    )

    const summary = await importApkg(file, { openDb: openFromBytes })
    expect(summary.notes).toBe(1)
    expect(summary.media).toBe(1)

    const asset = (await db.media.toArray())[0]
    expect(asset.filename).toBe('cat.jpg')
    expect(asset.mime).toBe('image/jpeg')
    const note = (await db.notes.toArray())[0]
    expect(note.fields.Front).toContain('[[media:')
    expect(note.mediaRefs).toContain(asset.id)
  })
})

describe('importApkg (end-to-end with injected node loader)', () => {
  it('imports a built .apkg into IndexedDB', async () => {
    const file = new File([await sampleApkg()], 'sample.apkg')
    const summary = await importApkg(file, { openDb: openFromBytes })
    expect(summary.decks).toBe(1) // empty Default deck is skipped
    expect(summary.notes).toBe(1)
    expect(summary.cards).toBe(1)
    expect(summary.media).toBe(1)
    expect(summary.reviews).toBe(1)

    const note = (await db.notes.toArray())[0]
    expect(note.format).toBe('html')
    expect(note.fields.Front).toContain('[[media:')
    expect(await db.cards.count()).toBe(1)
  })
})
