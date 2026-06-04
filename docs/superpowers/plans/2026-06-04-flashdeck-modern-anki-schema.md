# FlashDeck — Modern Anki Schema (v18) Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read note types and decks from the modern Anki schema (v18, used by Anki 23.x+ and the `collection.anki21b` zstd format), so `.apkg` files from current Anki import correctly instead of erroring. Everything downstream (fields, cloze, srs-map, import orchestration, UI) is unchanged — this only adds a new front-end that produces the same `ParsedCollection`.

**Architecture:** Modern Anki moved note types/decks out of the `col.models`/`col.decks` JSON blobs into dedicated tables (`notetypes`, `fields`, `templates`, `decks`), with template strings and the cloze flag inside **protobuf-encoded** `config` BLOB columns. A tiny dependency-free protobuf wire reader (`src/domain/anki/protobuf.ts`) extracts the fields we need. `collection.ts` gains a v18 reader: when `col.models` is empty, it reconstructs the existing `AnkiModel`/`AnkiDeck` shapes from the tables. The existing "unsupported newer Anki" error becomes the fallback only when neither layout yields note types.

**Tech Stack:** Existing stack; no new dependencies (we hand-decode the small protobuf blobs).

**Verified against Anki source** (`proto/anki/notetypes.proto`, `rslib/src/storage/upgrades/schema15_upgrade.sql`):
- `Notetype.Config.kind` = field **1** (varint); `KIND_CLOZE = 1`.
- `Notetype.Template.Config.q_format` = field **1** (string); `a_format` = field **2** (string).
- Tables: `notetypes(id, name, mtime_secs, usn, config)`, `fields(ntid, ord, name, config)`, `templates(ntid, ord, name, mtime_secs, usn, config)`, `decks(id, name, mtime_secs, usn, common, kind)`.
- Modern deck `name` uses `\x1f` (unit separator) between hierarchy levels → convert to `::` to match our flat-name convention.

**Builds on:** `src/domain/anki/collection.ts`, `src/domain/anki/types.ts`, `src/domain/anki/__fixtures__/build-apkg.ts`, `src/db/import.ts`.

> All commands run from project root `/Users/joao/projects/flashdeck`. Run one test file with `npm test -- <substring>`. No Co-Authored-By trailer in commits.

---

### Task 1: Protobuf wire-format reader (TDD)

A minimal, dependency-free reader that extracts one top-level field by number: a varint field or a length-delimited (string) field, skipping all other fields. Field numbers and string values we care about are small.

**Files:**
- Create: `src/domain/anki/protobuf.ts`
- Test: `src/domain/anki/protobuf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/protobuf.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { readVarintField, readStringField } from './protobuf'

describe('readVarintField', () => {
  it('reads a varint field by number', () => {
    // field 1, wire type 0 (varint), value 1  => tag 0x08, value 0x01
    expect(readVarintField(new Uint8Array([0x08, 0x01]), 1)).toBe(1)
  })
  it('returns undefined when the field is absent', () => {
    expect(readVarintField(new Uint8Array([0x08, 0x01]), 2)).toBeUndefined()
  })
  it('skips a preceding string field to reach a later varint field', () => {
    // field 1 string "Q" => 0x0a 0x01 0x51 ; then field 2 varint 1 => 0x10 0x01
    expect(readVarintField(new Uint8Array([0x0a, 0x01, 0x51, 0x10, 0x01]), 2)).toBe(1)
  })
})

describe('readStringField', () => {
  it('reads a length-delimited string field', () => {
    // field 1, wire type 2, len 1, 'Q'
    expect(readStringField(new Uint8Array([0x0a, 0x01, 0x51]), 1)).toBe('Q')
  })
  it('reads the second string field after the first', () => {
    // field 1 "Q" (0x0a 0x01 0x51), field 2 "A" (0x12 0x01 0x41)
    const bytes = new Uint8Array([0x0a, 0x01, 0x51, 0x12, 0x01, 0x41])
    expect(readStringField(bytes, 1)).toBe('Q')
    expect(readStringField(bytes, 2)).toBe('A')
  })
  it('returns undefined for a missing string field', () => {
    expect(readStringField(new Uint8Array([0x08, 0x01]), 1)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/protobuf`
Expected: FAIL — cannot resolve `./protobuf`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/protobuf.ts`:
```ts
// Minimal protobuf wire-format reader — just enough to pull individual fields
// out of Anki's notetype/template `config` blobs. No dependency.
// Wire types: 0 = varint, 1 = 64-bit, 2 = length-delimited, 5 = 32-bit.

interface Cursor {
  bytes: Uint8Array
  pos: number
}

// Values we read (field tags, kind, string lengths) are small; using
// multiplication keeps larger skipped varints from corrupting the position.
function readVarint(c: Cursor): number {
  let result = 0
  let shift = 0
  for (;;) {
    const b = c.bytes[c.pos++]
    result += (b & 0x7f) * 2 ** shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return result
}

function skipField(c: Cursor, wireType: number): void {
  switch (wireType) {
    case 0: readVarint(c); break
    case 1: c.pos += 8; break
    case 2: { const len = readVarint(c); c.pos += len; break }
    case 5: c.pos += 4; break
    default: throw new Error(`Unsupported protobuf wire type ${wireType}`)
  }
}

export function readVarintField(bytes: Uint8Array, field: number): number | undefined {
  const c: Cursor = { bytes, pos: 0 }
  while (c.pos < bytes.length) {
    const tag = readVarint(c)
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (fieldNum === field && wireType === 0) return readVarint(c)
    skipField(c, wireType)
  }
  return undefined
}

export function readStringField(bytes: Uint8Array, field: number): string | undefined {
  const c: Cursor = { bytes, pos: 0 }
  while (c.pos < bytes.length) {
    const tag = readVarint(c)
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (fieldNum === field && wireType === 2) {
      const len = readVarint(c)
      const str = new TextDecoder().decode(bytes.subarray(c.pos, c.pos + len))
      c.pos += len
      return str
    }
    skipField(c, wireType)
  }
  return undefined
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/protobuf`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/protobuf.ts src/domain/anki/protobuf.test.ts
git commit -m "feat: add minimal protobuf field reader for Anki config blobs (TDD)"
```

---

### Task 2: v18 model/deck reader + detection (TDD)

Teach `collection.ts` to reconstruct `AnkiModel`/`AnkiDeck` from the modern tables when the legacy `col.models` JSON is empty. Add a tiny protobuf **encoder** and a `buildModernCollection` helper to the (test-only) fixture builder so we can build and round-trip v18 collections.

**Files:**
- Modify: `src/domain/anki/collection.ts`
- Modify: `src/domain/anki/__fixtures__/build-apkg.ts`
- Test: `src/domain/anki/collection.test.ts` (add cases)

- [ ] **Step 1: Add a protobuf encoder + modern-collection builder to the fixture**

Append to `src/domain/anki/__fixtures__/build-apkg.ts` (it already imports `initSqlJs`, `Database`, `zipSync`, `strToU8`, `readFileSync`, `resolve`, and defines `newSql`/`wasmPath`; reuse them):
```ts
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
  // Empty legacy models/decks JSON, like real modern collections.
  db.run("INSERT INTO col (id, crt, models, decks) VALUES (1, ?, '', '')", [opts.crt ?? 1_600_000_000])

  for (const nt of opts.notetypes) {
    db.run('INSERT INTO notetypes (id, name, config) VALUES (?, ?, ?)', [
      nt.id, nt.name, encodeProto(nt.cloze ? [{ num: 1, value: 1 }] : []),
    ])
    nt.fields.forEach((name, ord) => {
      db.run('INSERT INTO fields (ntid, ord, name, config) VALUES (?, ?, ?, ?)', [nt.id, ord, name, new Uint8Array()])
    })
    nt.templates.forEach((t, ord) => {
      db.run('INSERT INTO templates (ntid, ord, name, config) VALUES (?, ?, ?, ?)', [
        nt.id, ord, t.name, encodeProto([{ num: 1, value: t.qfmt }, { num: 2, value: t.afmt }]),
      ])
    })
  }
  for (const d of opts.decks) {
    db.run('INSERT INTO decks (id, name, common, kind) VALUES (?, ?, ?, ?)', [d.id, d.name, new Uint8Array(), new Uint8Array()])
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
```

- [ ] **Step 2: Write the failing tests**

Add to `src/domain/anki/collection.test.ts` (keep existing imports; add `buildModernCollection` to the fixture import):
```ts
import { buildCollection, buildModernCollection } from './__fixtures__/build-apkg'
```
Add these tests inside the file:
```ts
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
    expect(col.models['2'].type).toBe(1) // cloze
    // \x1f hierarchy separator becomes ::
    expect(col.decks['2'].name).toBe('Spanish::Verbs')
    expect(col.notes).toEqual([{ id: 10, mid: '1', flds: 'Q\x1fA' }])
  })

  it('still throws the clear error when neither layout has note types but notes exist', async () => {
    const db = await buildCollection({ models: {}, decks: {}, notes: [{ id: 1, mid: '1', flds: 'x' }], cards: [] })
    expect(() => readCollection(db)).toThrow(/newer Anki version/i)
  })
})
```
(The second test re-confirms the fallback: a legacy collection with empty models and NO `notetypes` table still errors.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- anki/collection`
Expected: FAIL — modern note types are not read yet (models empty → error thrown).

- [ ] **Step 4: Implement the v18 reader + detection**

In `src/domain/anki/collection.ts`, add imports at the top:
```ts
import { readStringField, readVarintField } from './protobuf'
```

Add a helper to detect a table and the two reconstruction functions (place them above `readCollection`):
```ts
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
```

Then update `readCollection` so that, after parsing the legacy JSON maps, it falls back to the modern tables before throwing. Replace the current body that computes `models`/`decks` and throws, with:
```ts
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
```
> Keep the existing `parseJsonMap` helper and `rows` helper as they are. If `readCollection` currently declares `models`/`decks` with `const`, change them to `let` as shown. Note the `rows()` SQL for modern tables interpolates a numeric `Number(nt.id)` (safe — it's coerced to a number, not raw text), matching the existing code style which has no parameterized-query helper.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- anki/collection`
Expected: PASS — the existing legacy tests, the existing "empty {}" error test, plus the two new modern-schema tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/anki/collection.ts src/domain/anki/__fixtures__/build-apkg.ts src/domain/anki/collection.test.ts
git commit -m "feat: read note types and decks from modern Anki schema (v18) tables (TDD)"
```

---

### Task 3: End-to-end modern import + verification + docs

Prove a modern `.apkg` round-trips through the full pipeline (`zipApkg` → `unzipApkg` → `readCollection` → `buildImportResult` → `persistImport`), run the whole suite + build, and update the roadmap note.

**Files:**
- Test: `src/db/import.test.ts` (add a case)
- Modify: `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`

- [ ] **Step 1: Add the end-to-end modern test**

In `src/db/import.test.ts`, add `buildModernCollection` to the fixture import:
```ts
import { buildCollection, buildModernCollection, zipApkg, openFromBytes } from '../domain/anki/__fixtures__/build-apkg'
```
Add this test inside the file:
```ts
describe('importApkg (modern schema v18, end-to-end)', () => {
  it('imports a modern .apkg with a Cloze note and \x1f deck name', async () => {
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
    expect(summary.decks).toBe(2)
    expect(summary.notes).toBe(2)
    expect(summary.cards).toBe(3) // 1 basic + 2 cloze ordinals

    const decks = await db.decks.toArray()
    expect(decks.map((d) => d.name).sort()).toEqual(['Default', 'Spanish::Verbs'])
    const cloze = (await db.notes.toArray()).find((n) => n.type === 'cloze')!
    expect(cloze.format).toBe('html')
    expect(cloze.fields.Front).toContain('cloze')
  })
})
```

- [ ] **Step 2: Run the e2e test**

Run: `npm test -- db/import`
Expected: PASS — existing import tests plus the new modern-schema e2e case.

- [ ] **Step 3: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Update the roadmap deferred note**

In `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`, the "Deferred" paragraph currently begins with the nested-deck note. Add a sentence recording that modern-schema reading is now done, leaving only nested hierarchy deferred. Replace the Deferred paragraph with:
```
**Deferred:** Nested deck hierarchy on import — Anki `::`/`\x1f` subdecks currently
import as flat decks keeping the full name verbatim. Rebuilding parent/child
`Deck.parentId` nesting (and the UI to show it) is deferred to a later phase.
Modern Anki schema (v18+, incl. zstd `collection.anki21b`) note types and decks
ARE read (see `2026-06-04-flashdeck-modern-anki-schema.md`).
```

- [ ] **Step 5: Commit**

```bash
git add src/db/import.test.ts docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md
git commit -m "test: end-to-end modern Anki .apkg import; docs: note v18 support"
```

---

## Definition of Done
- A modern `.apkg` (empty `col.models`/`col.decks`, data in `notetypes`/`fields`/`templates`/`decks` tables, incl. the zstd `collection.anki21b` container) imports correctly: Basic + Cloze note types, decks (with `\x1f` → `::`), media, and history.
- The clear "re-export with older Anki versions" error remains as the fallback only when neither schema yields note types.
- No new runtime dependencies; protobuf blobs are hand-decoded.
- `npm test` and `npm run build` both pass.
