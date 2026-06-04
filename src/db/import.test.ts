import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { importApkg, persistImport } from './import'
import { buildImportResult } from '../domain/anki/import'
import { readCollection } from '../domain/anki/collection'
import { unzipApkg } from '../domain/anki/unzip'
import { buildCollection, zipApkg, openFromBytes } from '../domain/anki/__fixtures__/build-apkg'

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

    expect(await db.decks.count()).toBe(2)
    expect(await db.notes.count()).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.media.count()).toBe(1)
    expect(await db.reviews.count()).toBe(1)
  })
})

describe('importApkg (end-to-end with injected node loader)', () => {
  it('imports a built .apkg into IndexedDB', async () => {
    const file = new File([await sampleApkg()], 'sample.apkg')
    const summary = await importApkg(file, { openDb: openFromBytes })
    expect(summary.decks).toBe(2)
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
