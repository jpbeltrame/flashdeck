import type { Database } from 'sql.js'
import type { AnkiCardRow, AnkiModel, AnkiNoteRow, AnkiRevlogRow, AnkiDeck } from './types'
import { readStringField, readVarintField } from './protobuf'

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

function parseJsonMap(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || value === '') return {}
  const s = String(value).trim()
  if (s === '' || s === 'null') return {}
  return JSON.parse(s) as Record<string, unknown>
}

function tableExists(db: Database, name: string): boolean {
  return rows(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0
}

/** Reconstruct note types from the modern notetypes/fields/templates tables. */
function readModernModels(db: Database): Record<string, AnkiModel> {
  const out: Record<string, AnkiModel> = {}
  for (const nt of rows(db, 'SELECT id, name, config FROM notetypes')) {
    const id = String(nt.id)
    const kind = readVarintField(nt.config as Uint8Array, 1) ?? 0
    const flds = rows(db, `SELECT ord, name FROM fields WHERE ntid = ${Number(nt.id)} ORDER BY ord`)
      .map((f) => ({ name: String(f.name), ord: Number(f.ord) }))
    const tmpls = rows(db, `SELECT ord, name, config FROM templates WHERE ntid = ${Number(nt.id)} ORDER BY ord`)
      .map((t) => ({
        name: String(t.name),
        ord: Number(t.ord),
        qfmt: readStringField(t.config as Uint8Array, 1) ?? '',
        afmt: readStringField(t.config as Uint8Array, 2) ?? '',
      }))
    out[id] = { id, name: String(nt.name), type: kind === 1 ? 1 : 0, flds, tmpls }
  }
  return out
}

/** Reconstruct decks from the modern decks table (\x1f hierarchy → ::). */
function readModernDecks(db: Database): Record<string, AnkiDeck> {
  const out: Record<string, AnkiDeck> = {}
  for (const d of rows(db, 'SELECT id, name FROM decks')) {
    const id = String(d.id)
    out[id] = { id, name: String(d.name).split('\x1f').join('::') }
  }
  return out
}

export function readCollection(db: Database): ParsedCollection {
  const col = rows(db, 'SELECT crt, models, decks FROM col LIMIT 1')[0]
  let models = parseJsonMap(col.models) as Record<string, AnkiModel>
  let decks = parseJsonMap(col.decks) as Record<string, AnkiDeck>

  // Modern Anki (schema v18+) leaves col.models/col.decks empty and stores the
  // data in dedicated tables instead.
  if (Object.keys(models).length === 0 && tableExists(db, 'notetypes')) {
    models = readModernModels(db)
    if (Object.keys(decks).length === 0 && tableExists(db, 'decks')) {
      decks = readModernDecks(db)
    }
  }

  if (Object.keys(models).length === 0) {
    const noteCount = rows(db, 'SELECT count(*) as cnt FROM notes')[0]
    if (Number(noteCount?.cnt) > 0) {
      throw new Error(
        'This .apkg was exported by a newer Anki version using a format FlashDeck cannot read yet. In Anki, re-export the deck with "Support older Anki versions" checked.',
      )
    }
  }

  return {
    crt: Number(col.crt),
    models,
    decks,
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
