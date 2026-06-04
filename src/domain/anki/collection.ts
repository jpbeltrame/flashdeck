import type { Database } from 'sql.js'
import type { AnkiCardRow, AnkiModel, AnkiNoteRow, AnkiRevlogRow, AnkiDeck } from './types'

export interface ParsedCollection {
  crt: number
  models: Record<string, AnkiModel>
  decks: Record<string, AnkiDeck>
  notes: AnkiNoteRow[]
  cards: AnkiCardRow[]
  revlog: AnkiRevlogRow[]
}

/** Run a query and return rows as objects keyed by column name. */
function rows(db: Database, sql: string): Record<string, unknown>[] {
  const res = db.exec(sql)
  if (res.length === 0) return []
  const { columns, values } = res[0]
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

export function readCollection(db: Database): ParsedCollection {
  const col = rows(db, 'SELECT crt, models, decks FROM col LIMIT 1')[0]
  return {
    crt: Number(col.crt),
    models: JSON.parse(String(col.models)) as Record<string, AnkiModel>,
    decks: JSON.parse(String(col.decks)) as Record<string, AnkiDeck>,
    notes: rows(db, 'SELECT id, mid, flds FROM notes').map((r) => ({
      id: Number(r.id), mid: String(r.mid), flds: String(r.flds),
    })),
    cards: rows(db, 'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards').map((r) => ({
      id: Number(r.id), nid: Number(r.nid), did: Number(r.did), ord: Number(r.ord), type: Number(r.type),
      queue: Number(r.queue), due: Number(r.due), ivl: Number(r.ivl), factor: Number(r.factor),
      reps: Number(r.reps), lapses: Number(r.lapses),
    })),
    revlog: rows(db, 'SELECT id, cid, ease, ivl, lastIvl, factor FROM revlog').map((r) => ({
      id: Number(r.id), cid: Number(r.cid), ease: Number(r.ease), ivl: Number(r.ivl),
      lastIvl: Number(r.lastIvl), factor: Number(r.factor),
    })),
  }
}
