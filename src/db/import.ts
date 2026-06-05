import type { Database } from 'sql.js'
import { db } from './db'
import { readApkgHeader, streamApkgMedia } from '../domain/anki/unzip'
import { readCollection } from '../domain/anki/collection'
import { buildImportResult, mimeFor } from '../domain/anki/import'
import type { ImportResult } from '../domain/anki/types'
import { openCollection } from './anki-sqlite'

/** Persist the non-media records atomically. Media bytes are streamed in separately. */
export async function persistImport(result: ImportResult): Promise<void> {
  await db.transaction('rw', [db.decks, db.notes, db.cards, db.reviews], async () => {
    await db.decks.bulkAdd(result.decks)
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

/**
 * Full pipeline: read a .apkg File, parse it, persist it, return a summary.
 *
 * The file is streamed in two passes from `File.stream()` so the whole archive
 * is never held in memory at once — essential for large media decks (hundreds
 * of MB of audio) on memory-capped browsers like iOS Safari, where reading the
 * whole file + unzipping it eagerly crashed the tab.
 *   Pass 1: read the (small) collection DB + media manifest, build/persist the
 *           non-media records.
 *   Pass 2: stream each media payload straight into IndexedDB, one at a time.
 */
export async function importApkg(file: File, opts: ImportOptions = {}): Promise<ImportSummary> {
  const openDb = opts.openDb ?? openCollection

  const { collection, filenames } = await readApkgHeader(file.stream())
  const sqlDb = await openDb(collection)
  let result: ImportResult
  try {
    result = buildImportResult(readCollection(sqlDb), [...filenames.values()])
  } finally {
    sqlDb.close()
  }
  await persistImport(result)

  // Pass 2: persist media incrementally, releasing each blob before the next.
  let media = 0
  await streamApkgMedia(file.stream(), filenames, async (filename, bytes) => {
    const id = result.idByFilename.get(filename)
    if (!id) return
    const mime = mimeFor(filename)
    await db.media.put({ id, blob: new Blob([bytes as unknown as ArrayBuffer], { type: mime }), mime, filename })
    media++
  })

  return {
    decks: result.decks.length,
    notes: result.notes.length,
    cards: result.cards.length,
    media,
    reviews: result.reviews.length,
    warnings: result.warnings,
  }
}
