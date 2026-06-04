import type { Database } from 'sql.js'
import { db } from './db'
import { unzipApkg } from '../domain/anki/unzip'
import { readCollection } from '../domain/anki/collection'
import { buildImportResult } from '../domain/anki/import'
import type { ImportResult } from '../domain/anki/types'
import { openCollection } from './anki-sqlite'

/** Persist a fully-built ImportResult atomically. */
export async function persistImport(result: ImportResult): Promise<void> {
  await db.transaction('rw', [db.decks, db.notes, db.cards, db.media, db.reviews], async () => {
    await db.decks.bulkAdd(result.decks)
    await db.media.bulkAdd(result.media)
    await db.notes.bulkAdd(result.notes)
    await db.cards.bulkAdd(result.cards)
    await db.reviews.bulkAdd(result.reviews)
  })
}

export interface ImportSummary {
  decks: number
  notes: number
  cards: number
  media: number
  reviews: number
  warnings: string[]
}

export interface ImportOptions {
  /** Inject a sql.js opener (tests use a node loader); defaults to the app WASM loader. */
  openDb?: (bytes: Uint8Array) => Promise<Database>
}

/** Full pipeline: read a .apkg File, parse it, persist it, return a summary. */
export async function importApkg(file: File, opts: ImportOptions = {}): Promise<ImportSummary> {
  const openDb = opts.openDb ?? openCollection
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { collection, media } = unzipApkg(bytes)
  const sqlDb = await openDb(collection)
  try {
    const result = buildImportResult(readCollection(sqlDb), media)
    await persistImport(result)
    return {
      decks: result.decks.length,
      notes: result.notes.length,
      cards: result.cards.length,
      media: result.media.length,
      reviews: result.reviews.length,
      warnings: result.warnings,
    }
  } finally {
    sqlDb.close()
  }
}
