# FlashDeck Phase 4 — Anki `.apkg` Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open an Anki `.apkg` file and import its decks, Basic + Cloze notes, media, and review history into FlashDeck's IndexedDB — preserving due dates and streaks on a best-effort basis, with warnings for anything unsupported.

**Architecture:** A pure, framework-free domain layer under `src/domain/anki/` does all parsing and mapping over plain data and an injected sql.js `Database` (no WASM-loading or DB concerns). `unzip.ts` selects + decompresses the collection and collects media; `collection.ts` reads the SQLite tables; `cloze.ts` + `fields.ts` render Anki HTML templates into sanitized `Front`/`Back` HTML with media refs rewritten to our `[[media:<id>]]` tokens; `srs-map.ts` maps Anki scheduling/revlog onto our SM-2 state; `import.ts` orchestrates all of that into a plain `ImportResult`. The edge layer `src/db/import.ts` loads the WASM and persists an `ImportResult` in one Dexie transaction; `src/pages/ImportPage.tsx` drives file pick → preview → confirm. Notes gain a `format: 'text' | 'html'` discriminator so `RenderedField` renders imported HTML (sanitized) while existing plain-text cards are untouched.

**Tech Stack:** Existing stack (React 19 + TS + Vite, Dexie/IndexedDB, Tailwind v4, Vitest + Testing Library, `fake-indexeddb`, DOMPurify) plus new deps: `fflate` (unzip), `sql.js` (SQLite WASM), `fzstd` (zstd decompress for `collection.anki21b`).

**Builds on:** `src/db/schema.ts`, `src/db/db.ts`, `src/db/decks.ts`, `src/ui/RenderedField.tsx`, `src/domain/media.ts`, `src/pages/ImportPage.tsx`.

**Design decisions (from brainstorming):**
- Container formats: `collection.anki21b` (zstd) → `collection.anki21` → `collection.anki2`, in that priority.
- History: best-effort map of each card's due/interval/ease onto our SM-2 state **and** import `revlog` rows as `ReviewLog`s.
- Decks: each Anki deck → one **flat** `Deck`, full `::` name kept verbatim (a roadmap TODO is added for true nested hierarchy).
- Fields: imported notes are `format: 'html'`, rendered through DOMPurify-sanitized HTML with `[[media:<id>]]` tokens; Anki templates are collapsed into precomputed `Front`/`Back` HTML at import time.

> All commands run from the project root `/Users/joao/projects/flashdeck`. Run one test file with `npm test -- <substring>`.

## File structure

| File | Responsibility |
|---|---|
| `src/domain/anki/types.ts` | Shared types: `AnkiModel`, `AnkiNote`, `AnkiCard`, `AnkiRevlog`, `ImportResult`, etc. |
| `src/domain/anki/unzip.ts` | Pure: select collection entry by priority, zstd-decompress if needed, collect media as `{filename, bytes}[]`. |
| `src/domain/anki/cloze.ts` | Pure: list cloze ordinals; render a cloze field for a given ordinal + side. |
| `src/domain/anki/fields.ts` | Pure: split note fields, rewrite media refs to tokens, render a card's `Front`/`Back` from its model template. |
| `src/domain/anki/collection.ts` | Pure-ish: read `col`/`notes`/`cards`/`revlog` from an injected sql.js `Database` into typed rows. |
| `src/domain/anki/srs-map.ts` | Pure: map an Anki card → our `Card['srs']`; map an Anki revlog row → our `ReviewLog` shape. |
| `src/domain/anki/import.ts` | Pure: orchestrate parsed collection + media into an `ImportResult` (+ warnings). |
| `src/domain/anki/__fixtures__/build-apkg.ts` | **Test-only** helper: build a valid `.apkg` (sql.js + fflate) and open collection bytes in node. |
| `src/db/anki-sqlite.ts` | App edge: load sql.js WASM via `?url` and open collection bytes. |
| `src/db/import.ts` | Edge: `importApkg(file, { openDb? })` → unzip, open, parse, persist in a transaction. |
| `src/db/schema.ts` | Add `Note.format?: 'text' \| 'html'`. |
| `src/ui/RenderedField.tsx` | Add a sanitized-HTML render path for `format: 'html'`. |
| `src/pages/ImportPage.tsx` | File pick → preview → confirm import → result. |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install runtime + type deps**

Run:
```bash
npm install fflate sql.js fzstd
npm install -D @types/sql.js
```
Expected: installs succeed; `package.json` lists `fflate`, `sql.js`, `fzstd` under dependencies and `@types/sql.js` under devDependencies.

- [ ] **Step 2: Verify the sql.js wasm asset exists**

Run: `ls node_modules/sql.js/dist/sql-wasm.wasm`
Expected: the file path prints (the test fixture helper and app loader both rely on it).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add fflate, sql.js, fzstd for Anki .apkg import"
```

---

### Task 2: Add the `format` discriminator to Note

Imported notes render as sanitized HTML; existing plain-text cards keep today's behavior. A missing `format` means `'text'` (backward compatible), so no data migration is needed.

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add the field**

In `src/db/schema.ts`, update the `Note` interface:
```ts
export interface Note {
  id: string
  deckId: string
  type: 'basic' | 'cloze'
  /** Render mode for fields. Absent or 'text' = plain text (own-created cards); 'html' = sanitized HTML (Anki imports). */
  format?: 'text' | 'html'
  fields: Record<string, string>
  mediaRefs: string[]
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: `tsc -b` + Vite build succeed (the new optional field breaks nothing).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add Note.format discriminator (text|html) for Anki HTML imports"
```

---

### Task 3: Anki domain types

Shared types used across the domain modules. No logic.

**Files:**
- Create: `src/domain/anki/types.ts`

- [ ] **Step 1: Create the types**

Create `src/domain/anki/types.ts`:
```ts
import type { Card, Deck, MediaAsset, Note, ReviewLog } from '../../db/schema'

/** A note-type template (one per generated Basic card; Cloze uses a single template). */
export interface AnkiTemplate {
  name: string
  ord: number
  qfmt: string
  afmt: string
}

/** A parsed Anki note type ("model"). `type` 0 = standard/Basic, 1 = Cloze. */
export interface AnkiModel {
  id: string
  name: string
  type: 0 | 1
  flds: { name: string; ord: number }[]
  tmpls: AnkiTemplate[]
}

export interface AnkiDeck {
  id: string
  name: string
}

export interface AnkiNoteRow {
  id: number
  mid: string // model id
  flds: string // 0x1f-separated field values
}

export interface AnkiCardRow {
  id: number
  nid: number // note id
  did: number // deck id
  ord: number // template index (Basic) or cloze ordinal (Cloze)
  type: number // 0 new, 1 learning, 2 review, 3 relearning
  queue: number
  due: number
  ivl: number // positive = days, negative = seconds
  factor: number // ease * 1000 (0 when never reviewed)
  reps: number
  lapses: number
}

export interface AnkiRevlogRow {
  id: number // epoch milliseconds
  cid: number // card id
  ease: number // 1..4
  ivl: number
  lastIvl: number
  factor: number
}

/** A single media file pulled out of the .apkg zip. */
export interface MediaFile {
  filename: string
  bytes: Uint8Array
}

/** Everything to persist, produced purely (no DB writes here). */
export interface ImportResult {
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  media: MediaAsset[]
  reviews: ReviewLog[]
  warnings: string[]
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/domain/anki/types.ts
git commit -m "feat: add Anki domain types"
```

---

### Task 4: Unzip + collection selection (TDD)

Pick the right collection entry by priority, zstd-decompress `collection.anki21b`, and collect media files by joining the `media` JSON map (number → filename) to the numbered file entries.

**Files:**
- Create: `src/domain/anki/unzip.ts`
- Test: `src/domain/anki/unzip.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/unzip.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { zstdCompressSync } from 'node:zlib'
import { selectCollectionName, unzipApkg } from './unzip'

describe('selectCollectionName', () => {
  it('prefers anki21b, then anki21, then anki2', () => {
    expect(selectCollectionName(['collection.anki2', 'collection.anki21', 'collection.anki21b']))
      .toEqual({ name: 'collection.anki21b', zstd: true })
    expect(selectCollectionName(['collection.anki2', 'collection.anki21']))
      .toEqual({ name: 'collection.anki21', zstd: false })
    expect(selectCollectionName(['collection.anki2']))
      .toEqual({ name: 'collection.anki2', zstd: false })
  })

  it('returns null when no collection entry is present', () => {
    expect(selectCollectionName(['media', '0'])).toBeNull()
  })
})

describe('unzipApkg', () => {
  it('extracts an uncompressed collection and maps media by number', () => {
    const zip = zipSync({
      'collection.anki2': strToU8('SQLITE-BYTES'),
      media: strToU8(JSON.stringify({ '0': 'cat.jpg', '1': 'meow.mp3' })),
      '0': strToU8('JPEGDATA'),
      '1': strToU8('MP3DATA'),
    })
    const out = unzipApkg(zip)
    expect(new TextDecoder().decode(out.collection)).toBe('SQLITE-BYTES')
    expect(out.media).toEqual([
      { filename: 'cat.jpg', bytes: expect.any(Uint8Array) },
      { filename: 'meow.mp3', bytes: expect.any(Uint8Array) },
    ])
    expect(new TextDecoder().decode(out.media[0].bytes)).toBe('JPEGDATA')
  })

  it('zstd-decompresses an anki21b collection', () => {
    const raw = strToU8('DECOMPRESSED-SQLITE')
    const zip = zipSync({
      'collection.anki21b': new Uint8Array(zstdCompressSync(raw)),
      media: strToU8('{}'),
    })
    const out = unzipApkg(zip)
    expect(new TextDecoder().decode(out.collection)).toBe('DECOMPRESSED-SQLITE')
    expect(out.media).toEqual([])
  })

  it('throws a clear error when there is no collection', () => {
    const zip = zipSync({ media: strToU8('{}') })
    expect(() => unzipApkg(zip)).toThrow(/no Anki collection/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/unzip`
Expected: FAIL — cannot resolve `./unzip`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/unzip.ts`:
```ts
import { unzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'
import type { MediaFile } from './types'

export interface UnzippedApkg {
  collection: Uint8Array
  media: MediaFile[]
}

/** Choose the collection entry by Anki's format priority. */
export function selectCollectionName(names: string[]): { name: string; zstd: boolean } | null {
  if (names.includes('collection.anki21b')) return { name: 'collection.anki21b', zstd: true }
  if (names.includes('collection.anki21')) return { name: 'collection.anki21', zstd: false }
  if (names.includes('collection.anki2')) return { name: 'collection.anki2', zstd: false }
  return null
}

export function unzipApkg(zipBytes: Uint8Array): UnzippedApkg {
  const files = unzipSync(zipBytes)
  const choice = selectCollectionName(Object.keys(files))
  if (!choice) throw new Error('This file contains no Anki collection (collection.anki2/anki21/anki21b).')

  const raw = files[choice.name]
  const collection = choice.zstd ? zstdDecompress(raw) : raw

  // The "media" entry maps numeric keys to original filenames; the numbered
  // entries hold the bytes. Absent or empty map => no media.
  const media: MediaFile[] = []
  const mapEntry = files['media']
  if (mapEntry) {
    const map = JSON.parse(new TextDecoder().decode(mapEntry)) as Record<string, string>
    for (const [num, filename] of Object.entries(map)) {
      const bytes = files[num]
      if (bytes) media.push({ filename, bytes })
    }
  }
  return { collection, media }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/unzip`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/unzip.ts src/domain/anki/unzip.test.ts
git commit -m "feat: unzip .apkg, select+zstd-decompress collection, map media (TDD)"
```

---

### Task 5: Cloze rendering (TDD)

Parse `{{c1::answer::hint}}` syntax: list the ordinals present, and render a field for a given **card ordinal** (0-based; card ord 0 = cloze `c1`) and side. On the front, the active deletion shows `[hint]` (or `[...]`); on the back it shows the answer. Non-active clozes always show their answer text.

**Files:**
- Create: `src/domain/anki/cloze.ts`
- Test: `src/domain/anki/cloze.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/cloze.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clozeOrdinals, renderCloze } from './cloze'

describe('clozeOrdinals', () => {
  it('lists unique 0-based ordinals present', () => {
    expect(clozeOrdinals('{{c1::a}} and {{c3::b}} and {{c1::c}}')).toEqual([0, 2])
  })
  it('returns empty when there are no clozes', () => {
    expect(clozeOrdinals('plain text')).toEqual([])
  })
})

describe('renderCloze', () => {
  const text = 'The {{c1::sky}} is {{c2::blue::color}}.'

  it('hides the active deletion on the front and reveals others', () => {
    expect(renderCloze(text, 0, 'front')).toBe(
      'The <span class="cloze">[...]</span> is blue.',
    )
  })
  it('uses the hint when present on the front', () => {
    expect(renderCloze(text, 1, 'front')).toBe(
      'The sky is <span class="cloze">[color]</span>.',
    )
  })
  it('reveals the active deletion on the back', () => {
    expect(renderCloze(text, 0, 'back')).toBe(
      'The <span class="cloze">sky</span> is blue.',
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/cloze`
Expected: FAIL — cannot resolve `./cloze`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/cloze.ts`:
```ts
// Matches {{cN::answer}} or {{cN::answer::hint}}. Non-greedy answer so adjacent
// clozes don't merge.
const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g

/** Unique 0-based ordinals present (cloze c1 => ordinal 0). */
export function clozeOrdinals(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) found.add(Number(m[1]) - 1)
  return [...found].sort((a, b) => a - b)
}

/** Render a cloze field for a card ordinal (0-based) and side. */
export function renderCloze(text: string, ord: number, side: 'front' | 'back'): string {
  const active = ord + 1
  return text.replace(CLOZE_RE, (_full, numStr: string, answer: string, hint?: string) => {
    const num = Number(numStr)
    if (num !== active) return answer // other clozes always show their answer
    if (side === 'back') return `<span class="cloze">${answer}</span>`
    return `<span class="cloze">[${hint && hint.length > 0 ? hint : '...'}]</span>`
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/cloze`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/cloze.ts src/domain/anki/cloze.test.ts
git commit -m "feat: add Anki cloze rendering (ordinals + front/back) (TDD)"
```

---

### Task 6: Field splitting, media rewrite, and card rendering (TDD)

Split a note's `flds` string into a `{name: value}` record using the model field names; rewrite Anki media refs (`<img src="f">`, `<img src='f'>`, `[sound:f]`) into our `[[media:<id>]]` tokens using a filename→id map; and render a card's `Front`/`Back` HTML from its model template (substituting `{{Field}}`, `{{cloze:Field}}`, `{{FrontSide}}`; stripping section markers `{{#x}}`/`{{^x}}`/`{{/x}}`), collecting a warning when card-side `<script>` is present.

**Files:**
- Create: `src/domain/anki/fields.ts`
- Test: `src/domain/anki/fields.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/fields.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { splitFields, rewriteMedia, renderCard } from './fields'
import { mediaToken } from '../media'
import type { AnkiModel } from './types'

describe('splitFields', () => {
  it('zips 0x1f-separated values to model field names', () => {
    expect(splitFields('QA', ['Front', 'Back'])).toEqual({ Front: 'Q', Back: 'A' })
  })
})

describe('rewriteMedia', () => {
  const map = new Map([['cat.jpg', 'ID1'], ['meow.mp3', 'ID2']])
  it('rewrites img src (double and single quotes)', () => {
    expect(rewriteMedia('<img src="cat.jpg">', map)).toBe(`<img src="${mediaToken('ID1')}">`)
    expect(rewriteMedia("<img src='cat.jpg'>", map)).toBe(`<img src="${mediaToken('ID1')}">`)
  })
  it('rewrites [sound:f] to a standalone token', () => {
    expect(rewriteMedia('hear [sound:meow.mp3]', map)).toBe(`hear ${mediaToken('ID2')}`)
  })
  it('leaves unknown refs untouched', () => {
    expect(rewriteMedia('<img src="gone.jpg">', map)).toBe('<img src="gone.jpg">')
  })
})

const basic: AnkiModel = {
  id: '1', name: 'Basic', type: 0,
  flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
  tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
}
const cloze: AnkiModel = {
  id: '2', name: 'Cloze', type: 1,
  flds: [{ name: 'Text', ord: 0 }],
  tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
}

describe('renderCard', () => {
  const map = new Map<string, string>()
  it('renders a Basic card front/back via the template', () => {
    const { front, back, warnings } = renderCard(basic, { Front: 'Q', Back: 'A' }, 0, map)
    expect(front).toBe('Q')
    expect(back).toBe('Q<hr>A')
    expect(warnings).toEqual([])
  })
  it('renders a Cloze card for the given ordinal', () => {
    const { front, back } = renderCard(cloze, { Text: 'The {{c1::sky}} is {{c2::blue}}' }, 0, map)
    expect(front).toBe('The <span class="cloze">[...]</span> is blue')
    expect(back).toBe('The <span class="cloze">sky</span> is blue')
  })
  it('warns about card-side script', () => {
    const m: AnkiModel = { ...basic, tmpls: [{ name: 'x', ord: 0, qfmt: '<script>x()</script>{{Front}}', afmt: '{{Back}}' }] }
    const { warnings } = renderCard(m, { Front: 'Q', Back: 'A' }, 0, map)
    expect(warnings.some((w) => /script/i.test(w))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/fields`
Expected: FAIL — cannot resolve `./fields`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/fields.ts`:
```ts
import { mediaToken } from '../media'
import { renderCloze } from './cloze'
import type { AnkiModel } from './types'

/** Anki separates field values with the unit-separator control char. */
const FIELD_SEP = ''

export function splitFields(flds: string, fieldNames: string[]): Record<string, string> {
  const values = flds.split(FIELD_SEP)
  const out: Record<string, string> = {}
  fieldNames.forEach((name, i) => { out[name] = values[i] ?? '' })
  return out
}

/** Rewrite Anki media references to our [[media:<id>]] tokens using filename→id. */
export function rewriteMedia(html: string, idByFilename: Map<string, string>): string {
  // <img src="file"> / <img src='file'>
  let out = html.replace(/<img\b[^>]*?\bsrc=(["'])(.*?)\1[^>]*>/gi, (full, _q, file: string) => {
    const id = idByFilename.get(file)
    return id ? `<img src="${mediaToken(id)}">` : full
  })
  // [sound:file]
  out = out.replace(/\[sound:(.*?)\]/gi, (full, file: string) => {
    const id = idByFilename.get(file)
    return id ? mediaToken(id) : full
  })
  return out
}

function stripSections(template: string): string {
  // Best-effort: drop Anki conditional markers, keep their inner content.
  return template.replace(/\{\{[#^/][^}]*\}\}/g, '')
}

export interface RenderedCard {
  front: string
  back: string
  warnings: string[]
}

/**
 * Render a card's Front/Back HTML from its model template.
 * `fields` are the note's field values (already media-rewritten by the caller).
 * `ord` is the card ordinal (template index for Basic, cloze ordinal for Cloze).
 */
export function renderCard(
  model: AnkiModel,
  fields: Record<string, string>,
  ord: number,
  _idByFilename: Map<string, string>,
): RenderedCard {
  const warnings: string[] = []
  const tmpl = model.type === 1
    ? model.tmpls[0]
    : (model.tmpls.find((t) => t.ord === ord) ?? model.tmpls[0])

  if (tmpl && /<script/i.test(tmpl.qfmt + tmpl.afmt)) {
    warnings.push(`Note type "${model.name}" uses card-side script, which is not supported; rendered without it.`)
  }

  const substitute = (template: string, side: 'front' | 'back'): string => {
    let out = stripSections(template ?? '')
    // {{cloze:Field}} → cloze-rendered field
    out = out.replace(/\{\{cloze:([^}]+)\}\}/g, (_m, name: string) =>
      renderCloze(fields[name.trim()] ?? '', ord, side))
    // {{Field}} → field value (skip the special {{FrontSide}}, handled below)
    out = out.replace(/\{\{(?!FrontSide)([^}#^/]+?)\}\}/g, (_m, name: string) =>
      fields[name.trim()] ?? '')
    return out
  }

  const front = substitute(tmpl?.qfmt ?? '', 'front')
  const back = substitute(tmpl?.afmt ?? '', 'back').replace(/\{\{FrontSide\}\}/g, front)
  return { front, back, warnings }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/fields`
Expected: PASS (7 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/fields.ts src/domain/anki/fields.test.ts
git commit -m "feat: split fields, rewrite media refs, render Anki card templates (TDD)"
```

---

### Task 7: SRS mapping (TDD)

Map an Anki card's scheduling onto our `Card['srs']`, and an Anki revlog row onto our `ReviewLog` (minus id/cardId, which the importer fills in).

**Files:**
- Create: `src/domain/anki/srs-map.ts`
- Test: `src/domain/anki/srs-map.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/srs-map.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mapCardSrs, mapRevlog } from './srs-map'
import type { AnkiCardRow, AnkiRevlogRow } from './types'

const crt = 1_600_000_000 // collection creation, epoch seconds
const now = 1_600_864_000_000 // 10 days after crt, in ms

function card(over: Partial<AnkiCardRow> = {}): AnkiCardRow {
  return { id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 12, ivl: 6, factor: 2300, reps: 4, lapses: 1, ...over }
}

describe('mapCardSrs', () => {
  it('maps a review card: status, ease, interval, crt-based due', () => {
    const srs = mapCardSrs(card(), crt, now)
    expect(srs.status).toBe('review')
    expect(srs.ease).toBeCloseTo(2.3)
    expect(srs.intervalDays).toBe(6)
    expect(srs.reps).toBe(4)
    expect(srs.lapses).toBe(1)
    expect(srs.dueDate).toBe((crt + 12 * 86400) * 1000) // due is days since crt
  })

  it('maps a new card to status new with dueDate 0', () => {
    const srs = mapCardSrs(card({ type: 0, queue: 0, ivl: 0, factor: 0 }), crt, now)
    expect(srs.status).toBe('new')
    expect(srs.dueDate).toBe(0)
    expect(srs.ease).toBe(2.5) // factor 0 => default
  })

  it('clamps a tiny ease to the SM-2 minimum and converts negative ivl (seconds) to days', () => {
    const srs = mapCardSrs(card({ factor: 1000, ivl: -600 }), crt, now)
    expect(srs.ease).toBe(1.3)
    expect(srs.intervalDays).toBe(1) // 600s rounds up to 1 day
  })

  it('maps learning cards to status learning, due now', () => {
    const srs = mapCardSrs(card({ type: 1, queue: 1 }), crt, now)
    expect(srs.status).toBe('learning')
    expect(srs.dueDate).toBe(now)
  })
})

describe('mapRevlog', () => {
  it('maps ease→rating and intervals', () => {
    const row: AnkiRevlogRow = { id: 1_600_500_000_000, cid: 1, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }
    expect(mapRevlog(row)).toEqual({
      ts: 1_600_500_000_000, rating: 3, intervalBefore: 1, intervalAfter: 6, ease: 2.5,
    })
  })
  it('clamps an out-of-range ease into 1..4', () => {
    expect(mapRevlog({ id: 1, cid: 1, ease: 9, ivl: 1, lastIvl: 0, factor: 0 }).rating).toBe(4)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/srs-map`
Expected: FAIL — cannot resolve `./srs-map`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/srs-map.ts`:
```ts
import type { Card, ReviewLog } from '../../db/schema'
import type { AnkiCardRow, AnkiRevlogRow } from './types'

const DAY_MS = 86_400_000
const MIN_EASE = 1.3

const STATUS_BY_TYPE: Record<number, Card['srs']['status']> = {
  0: 'new', 1: 'learning', 2: 'review', 3: 'relearning',
}

function intervalDays(ivl: number): number {
  if (ivl < 0) return Math.max(1, Math.ceil(-ivl / 86_400)) // negative = seconds
  return Math.max(0, ivl)
}

export function mapCardSrs(c: AnkiCardRow, crtSec: number, now: number): Card['srs'] {
  const status = STATUS_BY_TYPE[c.type] ?? 'new'
  const ease = c.factor > 0 ? Math.max(MIN_EASE, c.factor / 1000) : 2.5
  const ivl = intervalDays(c.ivl)

  let dueDate: number
  if (status === 'new') dueDate = 0
  else if (status === 'review') dueDate = (crtSec + c.due * 86_400) * 1000 // due = days since crt
  else dueDate = now // learning/relearning: treat as due now

  return { status, ease, intervalDays: ivl, dueDate, reps: c.reps, lapses: c.lapses }
}

/** Map a revlog row to a ReviewLog without id/cardId (the importer assigns those). */
export function mapRevlog(r: AnkiRevlogRow): Omit<ReviewLog, 'id' | 'cardId'> {
  const rating = Math.min(4, Math.max(1, r.ease)) as ReviewLog['rating']
  return {
    ts: r.id,
    rating,
    intervalBefore: intervalDays(r.lastIvl),
    intervalAfter: intervalDays(r.ivl),
    ease: r.factor > 0 ? r.factor / 1000 : 2.5,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/srs-map`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/srs-map.ts src/domain/anki/srs-map.test.ts
git commit -m "feat: map Anki card scheduling + revlog onto SM-2 state (TDD)"
```

---

### Task 8: Read the collection from sql.js + a test `.apkg` builder (TDD)

`collection.ts` reads typed rows from an injected sql.js `Database`. The test needs a real database, so this task also creates the **test-only** fixture builder (`__fixtures__/build-apkg.ts`) that loads sql.js in node (via `wasmBinary` read from `node_modules`), builds a minimal Anki collection, and can zip it into a `.apkg`. The builder is reused by Tasks 9 and 11.

**Files:**
- Create: `src/domain/anki/__fixtures__/build-apkg.ts`
- Create: `src/domain/anki/collection.ts`
- Test: `src/domain/anki/collection.test.ts`

- [ ] **Step 1: Create the fixture builder**

Create `src/domain/anki/__fixtures__/build-apkg.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database } from 'sql.js'
import { zipSync, strToU8 } from 'fflate'

// Load sql.js in node by handing it the wasm bytes directly — robust under jsdom.
const wasmPath = fileURLToPath(new URL('../../../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))

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

/** Zip a built collection (+ optional media) into .apkg bytes. */
export function zipApkg(db: Database, media: { filename: string; bytes: Uint8Array }[] = []): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'collection.anki2': db.export() }
  const map: Record<string, string> = {}
  media.forEach((m, i) => { map[String(i)] = m.filename; entries[String(i)] = m.bytes })
  entries['media'] = strToU8(JSON.stringify(map))
  return zipSync(entries)
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/domain/anki/collection.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { readCollection } from './collection'
import { buildCollection } from './__fixtures__/build-apkg'

const models = {
  '1': { id: 1, name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
}
const decks = { '1': { id: 1, name: 'Default' }, '2': { id: 2, name: 'Spanish::Verbs' } }

describe('readCollection', () => {
  it('reads col (crt, models, decks), notes, cards, and revlog', async () => {
    const db = await buildCollection({
      crt: 1_600_000_000, models, decks,
      notes: [{ id: 10, mid: '1', flds: 'QA' }],
      cards: [{ id: 100, nid: 10, did: 2, ord: 0, type: 2, ivl: 6, factor: 2500, reps: 3 }],
      revlog: [{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }],
    })
    const col = readCollection(db)
    expect(col.crt).toBe(1_600_000_000)
    expect(col.models['1'].name).toBe('Basic')
    expect(col.decks['2'].name).toBe('Spanish::Verbs')
    expect(col.notes).toEqual([{ id: 10, mid: '1', flds: 'QA' }])
    expect(col.cards[0]).toMatchObject({ id: 100, nid: 10, did: 2, ord: 0, type: 2, ivl: 6, factor: 2500 })
    expect(col.revlog).toEqual([{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- anki/collection`
Expected: FAIL — cannot resolve `./collection`.

- [ ] **Step 4: Implement**

Create `src/domain/anki/collection.ts`:
```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- anki/collection`
Expected: PASS (1 passing).

- [ ] **Step 6: Commit**

```bash
git add src/domain/anki/collection.ts src/domain/anki/__fixtures__/build-apkg.ts src/domain/anki/collection.test.ts
git commit -m "feat: read Anki collection tables via sql.js + add .apkg test fixture builder (TDD)"
```

---

### Task 9: Import orchestration (TDD)

The pure heart: given a `ParsedCollection` and the media files, produce an `ImportResult` — decks, notes (HTML, media rewritten), cards (with mapped SRS + ord), media assets, review logs (linked to the right card), and warnings. No DB, no WASM.

**Files:**
- Create: `src/domain/anki/import.ts`
- Test: `src/domain/anki/import.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/import.test.ts`:
```ts
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
      { id: 10, mid: '1', flds: 'Hello <img src="cat.jpg">World' },
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

  it('drops cards whose deck is missing and warns', () => {
    const c = collection({ cards: [{ id: 200, nid: 10, did: 999, ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 }] })
    const r = buildImportResult(c, media)
    expect(r.cards).toHaveLength(0)
    expect(r.warnings.some((w) => /deck/i.test(w))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- anki/import`
Expected: FAIL — cannot resolve `./import`.

- [ ] **Step 3: Implement**

Create `src/domain/anki/import.ts`:
```ts
import type { Card, Deck, MediaAsset, Note, ReviewLog } from '../../db/schema'
import { mediaIdsIn } from '../media'
import type { ParsedCollection } from './collection'
import { renderCard, rewriteMedia, splitFields } from './fields'
import { mapCardSrs, mapRevlog } from './srs-map'
import type { ImportResult, MediaFile } from './types'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export function buildImportResult(col: ParsedCollection, mediaFiles: MediaFile[], now: number = Date.now()): ImportResult {
  const warnings: string[] = []

  // 1. Media assets + filename→id map for ref rewriting.
  const media: MediaAsset[] = []
  const idByFilename = new Map<string, string>()
  for (const f of mediaFiles) {
    const id = crypto.randomUUID()
    idByFilename.set(f.filename, id)
    const mime = mimeFor(f.filename)
    media.push({ id, blob: new Blob([f.bytes], { type: mime }), mime, filename: f.filename })
  }

  // 2. Decks: one flat Deck per Anki deck, full name kept verbatim.
  const deckIdByAnki = new Map<string, string>()
  const decks: Deck[] = []
  for (const [ankiId, d] of Object.entries(col.decks)) {
    const id = crypto.randomUUID()
    deckIdByAnki.set(ankiId, id)
    decks.push({ id, name: d.name, createdAt: now, updatedAt: now })
  }

  // 3. Notes (HTML, media-rewritten). One FlashDeck note per Anki note; its deck
  //    is taken from its first card below, so build a lookup first.
  const cardsByNote = new Map<number, typeof col.cards>()
  for (const c of col.cards) {
    const list = cardsByNote.get(c.nid) ?? []
    list.push(c)
    cardsByNote.set(c.nid, list)
  }

  const notes: Note[] = []
  const cards: Card[] = []
  const noteIdByAnki = new Map<number, string>()
  const cardIdByAnki = new Map<number, string>()

  for (const n of col.notes) {
    const model = col.models[n.mid]
    if (!model) { warnings.push(`Note ${n.id} uses an unknown note type; skipped.`); continue }
    const noteCards = cardsByNote.get(n.id) ?? []
    if (noteCards.length === 0) continue

    // Field values, media-rewritten, used by every card of this note.
    const rawFields = splitFields(n.flds, model.flds.map((f) => f.name))
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawFields)) fields[k] = rewriteMedia(v, idByFilename)

    // The note's deck is its first card's deck (must exist).
    const firstDeck = deckIdByAnki.get(String(noteCards[0].did))
    if (!firstDeck) {
      warnings.push(`Note ${n.id} references a missing deck (${noteCards[0].did}); skipped.`)
      continue
    }

    const noteId = crypto.randomUUID()
    noteIdByAnki.set(n.id, noteId)

    for (const c of noteCards) {
      const deckId = deckIdByAnki.get(String(c.did))
      if (!deckId) { warnings.push(`Card ${c.id} references a missing deck (${c.did}); skipped.`); continue }
      const cardId = crypto.randomUUID()
      cardIdByAnki.set(c.id, cardId)
      cards.push({
        id: cardId, noteId, deckId, templateIndex: c.ord, srs: mapCardSrs(c, col.crt, now),
      })
      const rc = renderCard(model, fields, c.ord, idByFilename)
      for (const w of rc.warnings) if (!warnings.includes(w)) warnings.push(w)
    }

    // Store rendered Front/Back from the note's first card for editor/list display.
    const display = renderCard(model, fields, noteCards[0].ord, idByFilename)
    const fieldText = `${display.front}\n${display.back}`
    notes.push({
      id: noteId, deckId: firstDeck, type: model.type === 1 ? 'cloze' : 'basic', format: 'html',
      fields: { Front: display.front, Back: display.back },
      mediaRefs: mediaIdsIn(fieldText),
    })
  }

  // 4. Review logs, linked to imported cards (skip orphans).
  const reviews: ReviewLog[] = []
  for (const r of col.revlog) {
    const cardId = cardIdByAnki.get(r.cid)
    if (!cardId) continue
    reviews.push({ id: crypto.randomUUID(), cardId, ...mapRevlog(r) })
  }

  return { decks, notes, cards, media, reviews, warnings }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- anki/import`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/anki/import.ts src/domain/anki/import.test.ts
git commit -m "feat: orchestrate parsed collection + media into an ImportResult (TDD)"
```

---

### Task 10: Persist an import + the app sql.js loader, end-to-end (TDD)

The edge: `src/db/anki-sqlite.ts` loads the WASM in the app via a `?url` import; `src/db/import.ts` exposes `persistImport(result)` (transactional write) and `importApkg(file, { openDb })` (full pipeline with an injectable DB opener so tests use the node loader). The end-to-end test builds a real `.apkg` with the fixture builder and imports it.

**Files:**
- Create: `src/db/anki-sqlite.ts`
- Create: `src/db/import.ts`
- Test: `src/db/import.test.ts`

- [ ] **Step 1: Create the app sql.js loader**

Create `src/db/anki-sqlite.ts`:
```ts
import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: ReturnType<typeof initSqlJs> | null = null

/** Open Anki collection bytes with sql.js in the browser (WASM via Vite ?url). */
export async function openCollection(bytes: Uint8Array): Promise<Database> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  const SQL = await sqlPromise
  return new SQL.Database(bytes)
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/db/import.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import { db } from './db'
import { importApkg, persistImport } from './import'
import { buildImportResult } from '../domain/anki/import'
import { readCollection } from '../domain/anki/collection'
import { unzipApkg } from '../domain/anki/unzip'
import { buildCollection, zipApkg } from '../domain/anki/__fixtures__/build-apkg'

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
    notes: [{ id: 10, mid: '1', flds: 'Hola <img src="cat.jpg">Hello' }],
    cards: [{ id: 100, nid: 10, did: 2, ord: 0, type: 2, queue: 2, due: 5, ivl: 6, factor: 2500, reps: 2 }],
    revlog: [{ id: 1_600_500_000_000, cid: 100, ease: 3, ivl: 6, lastIvl: 1, factor: 2500 }],
  })
  return zipApkg(cdb, [{ filename: 'cat.jpg', bytes: new Uint8Array([1, 2, 3]) }])
}

describe('persistImport', () => {
  it('writes decks, notes, cards, media, and reviews in one transaction', async () => {
    const bytes = await sampleApkg()
    const { collection, media } = unzipApkg(bytes)
    const sqlDb = await openFrom(collection)
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
    const summary = await importApkg(file, { openDb: openFrom })
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

// Open collection bytes with sql.js in node (mirrors the app loader).
async function openFrom(bytes: Uint8Array): Promise<Database> {
  const initSqlJs = (await import('sql.js')).default
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const wasmPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
  const SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) })
  return new SQL.Database(bytes)
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- db/import`
Expected: FAIL — cannot resolve `./import`.

- [ ] **Step 4: Implement**

Create `src/db/import.ts`:
```ts
import type { Database } from 'sql.js'
import { db } from './db'
import { unzipApkg } from '../domain/anki/unzip'
import { readCollection } from '../domain/anki/collection'
import { buildImportResult } from '../domain/anki/import'
import type { ImportResult } from '../domain/anki/types'
import { openCollection } from './anki-sqlite'

/** Persist a fully-built ImportResult atomically. */
export async function persistImport(result: ImportResult): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.media, db.reviews, async () => {
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- db/import`
Expected: PASS (2 passing).

- [ ] **Step 6: Commit**

```bash
git add src/db/anki-sqlite.ts src/db/import.ts src/db/import.test.ts
git commit -m "feat: persist Anki import end-to-end + app sql.js WASM loader (TDD)"
```

---

### Task 11: Render imported HTML notes (component test)

Add a sanitized-HTML render path to `RenderedField` for `format: 'html'` notes: resolve `[[media:<id>]]` tokens to object URLs (in `src` attributes and standalone, the latter becoming `<audio>`), sanitize with DOMPurify, and inject. Plain-text notes keep today's behavior.

**Files:**
- Modify: `src/ui/RenderedField.tsx`
- Test: `src/ui/RenderedField.html.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/ui/RenderedField.html.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('RenderedField (html format)', () => {
  it('renders sanitized HTML and strips scripts', async () => {
    render(<RenderedField text={'<b>bold</b><script>alert(1)</script>'} format="html" />)
    expect(await screen.findByText('bold')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('resolves an image media token in an img src', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<RenderedField text={`<img src="${mediaToken(asset.id)}">`} format="html" />)
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'blob:mock')
  })

  it('still renders plain text when format is text', async () => {
    render(<RenderedField text="just text" />)
    expect(await screen.findByText('just text')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- RenderedField.html`
Expected: FAIL — `RenderedField` has no `format` prop / HTML handling.

- [ ] **Step 3: Implement the HTML path**

Rewrite `src/ui/RenderedField.tsx` to add the HTML branch while keeping the existing text path. Replace the whole file with:
```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DOMPurify from 'dompurify'
import { getMedia } from '../db/media'
import { db } from '../db/db'
import { parseField, mediaKind, mediaIdsIn } from '../domain/media'

function MediaSegment({ id }: { id: string }) {
  const asset = useLiveQuery(() => getMedia(id), [id])
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!asset) return
    const objectUrl = URL.createObjectURL(asset.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset])

  if (!asset || !url) return null

  switch (mediaKind(asset.mime)) {
    case 'image':
      return <img src={url} alt={asset.filename} className="mx-auto max-h-60 rounded-xl" />
    case 'audio':
      return <audio src={url} controls className="w-full" />
    case 'video':
      return <video src={url} controls className="mx-auto max-h-60 rounded-xl" />
    default:
      return <a href={url} download={asset.filename} className="underline">{asset.filename}</a>
  }
}

function TextField({ text }: { text: string }) {
  const segments = parseField(text)
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'media' ? (
          <MediaSegment key={i} id={seg.id} />
        ) : (
          seg.value.trim() && (
            <p key={i} className="whitespace-pre-wrap">{seg.value.trim()}</p>
          )
        ),
      )}
    </div>
  )
}

function HtmlField({ text }: { text: string }) {
  const ids = mediaIdsIn(text)
  const assets = useLiveQuery(() => db.media.bulkGet(ids), [text])
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (assets === undefined) return
    const urls: string[] = []
    let resolved = text
    ids.forEach((id, i) => {
      const asset = assets[i]
      if (!asset) return
      const url = URL.createObjectURL(asset.blob)
      urls.push(url)
      const token = `[[media:${id}]]`
      if (mediaKind(asset.mime) === 'audio') {
        // Standalone token (from [sound:]) → an audio element.
        resolved = resolved.split(token).join(`<audio controls src="${url}"></audio>`)
      } else {
        resolved = resolved.split(token).join(url) // token sits inside an <img src="...">
      }
    })
    // Sanitize the Anki HTML; object URLs are app-generated and injected after.
    setHtml(DOMPurify.sanitize(resolved, { ADD_ATTR: ['controls'] }))
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [assets, text])

  return <div className="anki-field space-y-2" dangerouslySetInnerHTML={{ __html: html }} />
}

export interface RenderedFieldProps {
  text: string
  format?: 'text' | 'html'
}

export default function RenderedField({ text, format = 'text' }: RenderedFieldProps) {
  return format === 'html' ? <HtmlField text={text} /> : <TextField text={text} />
}
```

- [ ] **Step 4: Run the test + existing RenderedField tests**

Run: `npm test -- RenderedField`
Expected: PASS — both `RenderedField.test.tsx` (existing text cases) and `RenderedField.html.test.tsx`.

- [ ] **Step 5: Pass the note format through study + deck list**

In `src/pages/StudyPage.tsx`, update the two `RenderedField` usages to forward the note's format:
```tsx
          {note && <RenderedField text={note.fields.Front} format={note.format} />}
```
and
```tsx
              <div className="text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
```

In `src/pages/DeckDetailPage.tsx`, update the two `RenderedField` usages in the non-editing preview:
```tsx
                <div className="font-medium"><RenderedField text={note.fields.Front} format={note.format} /></div>
                <div className="text-sm text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
```

- [ ] **Step 6: Run the affected suites**

Run: `npm test -- StudyPage RenderedField`
Expected: PASS (no regressions; `format` is optional so existing cards render as text).

- [ ] **Step 7: Commit**

```bash
git add src/ui/RenderedField.tsx src/ui/RenderedField.html.test.tsx src/pages/StudyPage.tsx src/pages/DeckDetailPage.tsx
git commit -m "feat: render imported Anki notes as sanitized HTML with media (TDD)"
```

---

### Task 12: Import page UI (component test)

Wire the pipeline to a screen: pick a `.apkg`, run `importApkg`, show a success summary (counts) and any warnings, or an error.

**Files:**
- Rewrite: `src/pages/ImportPage.tsx`
- Test: `src/pages/ImportPage.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/pages/ImportPage.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/db'
import { buildCollection, zipApkg } from '../domain/anki/__fixtures__/build-apkg'
import type { Database } from 'sql.js'
import ImportPage from './ImportPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function openFrom(bytes: Uint8Array): Promise<Database> {
  const initSqlJs = (await import('sql.js')).default
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const wasmPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
  const SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) })
  return new SQL.Database(bytes)
}

async function sampleFile(): Promise<File> {
  const models = {
    '1': { id: '1', name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
  }
  const cdb = await buildCollection({
    crt: 1_600_000_000, models, decks: { '1': { id: '1', name: 'Default' } },
    notes: [{ id: 10, mid: '1', flds: 'QA' }],
    cards: [{ id: 100, nid: 10, did: 1, ord: 0, type: 0 }],
  })
  return new File([zipApkg(cdb)], 'sample.apkg')
}

describe('ImportPage', () => {
  it('imports a chosen .apkg and shows a summary', async () => {
    const user = userEvent.setup()
    render(<ImportPage openDb={openFrom} />)
    await user.upload(screen.getByLabelText(/choose .apkg/i), await sampleFile())

    expect(await screen.findByText(/imported/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 deck/i)).toBeInTheDocument()
    expect(await db.cards.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ImportPage`
Expected: FAIL — there is no file input / `openDb` prop yet.

- [ ] **Step 3: Rewrite the page**

Rewrite `src/pages/ImportPage.tsx`:
```tsx
import { useState } from 'react'
import type { Database } from 'sql.js'
import { importApkg, type ImportSummary } from '../db/import'

export interface ImportPageProps {
  /** Test seam: inject a sql.js opener. Defaults to the app WASM loader. */
  openDb?: (bytes: Uint8Array) => Promise<Database>
}

export default function ImportPage({ openDb }: ImportPageProps) {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(null); setSummary(null)
    try {
      setSummary(await importApkg(file, openDb ? { openDb } : {}))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Import</h1>
        <p className="text-[var(--color-muted)] mt-1">Import an Anki .apkg deck (Basic + Cloze, media, history).</p>
      </div>

      <label className="block">
        <span className="sr-only">Choose .apkg file</span>
        <input
          aria-label="Choose .apkg file"
          type="file"
          accept=".apkg,application/zip"
          disabled={busy}
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-accent)] file:px-3 file:py-2 file:text-white"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </label>

      {busy && <p className="text-[var(--color-muted)]">Importing…</p>}

      {error && (
        <div className="rounded-xl border border-red-400 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </div>
      )}

      {summary && (
        <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm">
          <p className="font-medium">Imported {summary.decks} deck{summary.decks === 1 ? '' : 's'}.</p>
          <p className="text-[var(--color-muted)]">
            {summary.notes} notes · {summary.cards} cards · {summary.media} media · {summary.reviews} reviews
          </p>
          {summary.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[var(--color-muted)]">
              {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ImportPage`
Expected: PASS (1 passing).

- [ ] **Step 5: Confirm the route renders the page**

Confirm `ImportPage` is rendered by the router with no required props (the `openDb` prop is optional). Check `src/App.tsx` (or wherever routes are declared) shows `<ImportPage />` for the import route; if it passes props, none are required. No change expected.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ImportPage.tsx src/pages/ImportPage.test.tsx
git commit -m "feat: Anki .apkg import page with summary + warnings (TDD)"
```

---

### Task 13: Full verification + roadmap update

Run the whole suite and production build, then mark Phase 4 done and add the nested-deck roadmap TODO.

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`

- [ ] **Step 1: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc -b` + Vite production build succeed (the `sql-wasm.wasm` asset is bundled — the workbox `globPatterns` already includes `wasm`).

- [ ] **Step 2: Update the roadmap**

In `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`, update the Phase 4 row:
```
| 4 | Anki import (`.apkg`: Basic + Cloze + media + history) | `2026-06-03-flashdeck-phase4-anki-import.md` | ✅ Implemented |
```
And append a TODO note under the table:
```
**Deferred:** Nested deck hierarchy on import — Anki `::` subdecks currently
import as flat decks keeping the full name verbatim. Rebuilding parent/child
`Deck.parentId` nesting (and the UI to show it) is deferred to a later phase.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md
git commit -m "docs: mark Phase 4 (Anki import) implemented; defer nested-deck hierarchy"
```

---

## Phase 4 Definition of Done
- `npm test` and `npm run build` both pass.
- A `.apkg` (legacy `anki2`, modern `anki21`, or zstd `anki21b`) can be selected on the Import page and imported into IndexedDB.
- Basic and Cloze notes import as sanitized HTML; Cloze notes produce one card per ordinal on a shared note; media files become `MediaAsset` blobs with refs rewritten to `[[media:<id>]]`.
- Card scheduling (status/ease/interval/due) and `revlog` history map best-effort onto SM-2 `Card.srs` and `ReviewLog`s, so due dates and streaks carry over.
- Anki decks import as flat decks with full `::` names; unsupported content (unknown note types, card-side script, missing decks/media) yields warnings shown after import rather than failing the whole file.
- Imported HTML renders (sanitized) in the deck list and study screen; existing plain-text cards are unaffected.

Next: **Phase 5 — Export** (`.apkg`, JSON backup, `.ics`).
