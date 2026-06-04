import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import { zipSync, strToU8 } from 'fflate'

// Resolve wasm path relative to project root to avoid jsdom url-scheme issues.
const wasmPath = resolve(__dirname, '../../../../node_modules/sql.js/dist/sql-wasm.wasm')

export async function newSql(): Promise<Database> {
  const SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) })
  return new SQL.Database()
}

export interface FixtureOptions {
  crt?: number
  models: Record<string, unknown>
  decks: Record<string, unknown>
  notes: { id: number; mid: string; flds: string }[]
  cards: Partial<{ id: number; nid: number; did: number; ord: number; type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number }>[]
  revlog?: { id: number; cid: number; ease: number; ivl: number; lastIvl: number; factor: number }[]
}

/** Build an in-memory Anki collection database with the standard schema. */
export async function buildCollection(opts: FixtureOptions): Promise<Database> {
  const db = await newSql()
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer,
      dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer,
      tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer,
      usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
      lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer,
      lastIvl integer, factor integer, time integer, type integer);
  `)
  db.run('INSERT INTO col (id, crt, models, decks) VALUES (1, ?, ?, ?)', [
    opts.crt ?? 1_600_000_000, JSON.stringify(opts.models), JSON.stringify(opts.decks),
  ])
  for (const n of opts.notes) {
    db.run('INSERT INTO notes (id, mid, flds, sfld) VALUES (?, ?, ?, ?)', [n.id, Number(n.mid), n.flds, n.flds])
  }
  for (const c of opts.cards) {
    db.run(
      'INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [c.id ?? 1, c.nid ?? 1, c.did ?? 1, c.ord ?? 0, c.type ?? 0, c.queue ?? 0, c.due ?? 0,
       c.ivl ?? 0, c.factor ?? 0, c.reps ?? 0, c.lapses ?? 0],
    )
  }
  for (const r of opts.revlog ?? []) {
    db.run('INSERT INTO revlog (id, cid, ease, ivl, lastIvl, factor) VALUES (?,?,?,?,?,?)',
      [r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor])
  }
  return db
}

/** Open existing collection bytes with sql.js in Node (mirrors the app loader). */
export async function openFromBytes(bytes: Uint8Array): Promise<Database> {
  const SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) })
  return new SQL.Database(bytes)
}

/** Zip a built collection (+ optional media) into .apkg bytes. */
export function zipApkg(db: Database, media: { filename: string; bytes: Uint8Array }[] = []): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'collection.anki2': db.export() }
  const map: Record<string, string> = {}
  media.forEach((m, i) => { map[String(i)] = m.filename; entries[String(i)] = m.bytes })
  entries['media'] = strToU8(JSON.stringify(map))
  return zipSync(entries)
}

// --- Modern (schema v18) fixtures ---------------------------------------

function encodeVarint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v > 0x7f) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128) }
  out.push(v)
  return out
}

/** Encode a flat protobuf message from {fieldNumber: value}. number => varint, string => length-delimited. */
export function encodeProto(fields: { num: number; value: number | string }[]): Uint8Array {
  const out: number[] = []
  for (const f of fields) {
    if (typeof f.value === 'number') {
      out.push((f.num << 3) | 0, ...encodeVarint(f.value))
    } else {
      const strBytes = [...new TextEncoder().encode(f.value)]
      out.push((f.num << 3) | 2, ...encodeVarint(strBytes.length), ...strBytes)
    }
  }
  return new Uint8Array(out)
}

export interface ModernNotetype {
  id: number
  name: string
  cloze?: boolean
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
}

export interface ModernFixtureOptions {
  crt?: number
  notetypes: ModernNotetype[]
  decks: { id: number; name: string }[] // name may contain \x1f for hierarchy
  notes: { id: number; mid: number; flds: string }[]
  cards: Partial<{ id: number; nid: number; did: number; ord: number; type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number }>[]
  revlog?: { id: number; cid: number; ease: number; ivl: number; lastIvl: number; factor: number }[]
}

/** Build an in-memory modern (schema v18) Anki collection: empty col.models/decks, data in dedicated tables. */
export async function buildModernCollection(opts: ModernFixtureOptions): Promise<Database> {
  const db = await newSql()
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer,
      dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer,
      tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer,
      usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
      lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer,
      lastIvl integer, factor integer, time integer, type integer);
    CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob);
    CREATE TABLE fields (ntid integer, ord integer, name text, config blob);
    CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob);
    CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob);
  `)
  db.run("INSERT INTO col (id, crt, models, decks) VALUES (1, ?, '', '')", [opts.crt ?? 1_600_000_000])

  for (const nt of opts.notetypes) {
    const ntConfig = nt.cloze ? encodeProto([{ num: 1, value: 1 }]) : encodeProto([])
    db.run('INSERT INTO notetypes (id, name, config) VALUES (?, ?, ?)', [nt.id, nt.name, ntConfig])
    nt.fields.forEach((name, ord) => {
      db.run('INSERT INTO fields (ntid, ord, name, config) VALUES (?, ?, ?, ?)', [nt.id, ord, name, encodeProto([])])
    })
    nt.templates.forEach((t, ord) => {
      db.run('INSERT INTO templates (ntid, ord, name, config) VALUES (?, ?, ?, ?)', [
        nt.id, ord, t.name, encodeProto([{ num: 1, value: t.qfmt }, { num: 2, value: t.afmt }]),
      ])
    })
  }
  for (const d of opts.decks) {
    db.run('INSERT INTO decks (id, name, common, kind) VALUES (?, ?, ?, ?)', [d.id, d.name, encodeProto([]), encodeProto([])])
  }
  for (const n of opts.notes) {
    db.run('INSERT INTO notes (id, mid, flds, sfld) VALUES (?, ?, ?, ?)', [n.id, n.mid, n.flds, n.flds])
  }
  for (const c of opts.cards) {
    db.run(
      'INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [c.id ?? 1, c.nid ?? 1, c.did ?? 1, c.ord ?? 0, c.type ?? 0, c.queue ?? 0, c.due ?? 0,
       c.ivl ?? 0, c.factor ?? 0, c.reps ?? 0, c.lapses ?? 0],
    )
  }
  for (const r of opts.revlog ?? []) {
    db.run('INSERT INTO revlog (id, cid, ease, ivl, lastIvl, factor) VALUES (?,?,?,?,?,?)',
      [r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor])
  }
  return db
}
