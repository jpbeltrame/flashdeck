# FlashDeck Phase 3 — Media Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let cards embed images, audio, and video stored as IndexedDB blobs — attach media in the card editor and render it in the deck list and study screen.

**Architecture:** Media is stored as `MediaAsset` blobs in the existing Dexie `media` table. A field's text carries inline `[[media:<id>]]` tokens; a note's `mediaRefs` is *derived* from the tokens in its fields. A pure, framework-free module (`src/domain/media.ts`) parses tokens and classifies MIME types; a `media` repository (`src/db/media.ts`) owns blob persistence and orphan cleanup. A `RenderedField` component resolves tokens to object-URL-backed `<img>`/`<audio>`/`<video>` elements and is reused by the editor preview, deck list, and study screen.

**Tech Stack:** Existing Phase 1/2 stack — React 19 + TS + Vite, Dexie/IndexedDB, `dexie-react-hooks` `useLiveQuery`, Tailwind v4, Vitest + Testing Library, `fake-indexeddb` for DB tests.

**Builds on Phase 2:** `src/db/schema.ts` (`MediaAsset`, `Note.mediaRefs`), `src/db/db.ts` (`media` table), `src/db/cards.ts` (card repo), `src/ui/CardEditor.tsx`, `src/pages/StudyPage.tsx`, `src/pages/DeckDetailPage.tsx`.

**Design notes / scope:**
- Own-created card fields are **plain text** (rendered with `whitespace-pre-wrap`), not HTML. Imported Anki HTML + DOMPurify sanitization is Phase 4 — do not add it here.
- Token format is `[[media:<uuid>]]`. `Note.mediaRefs` is always recomputed from field text on save, so it never drifts.
- jsdom has no `URL.createObjectURL`/`revokeObjectURL`; component tests that render media stub them (shown in each relevant task).

> All commands run from the project root `/Users/joao/projects/flashdeck`. Run a single test file with `npm test -- <substring>`.

---

### Task 1: Media domain helpers (TDD)

Pure functions: classify a MIME type, build a media token, parse a field into text/media segments, and collect the media ids referenced by one or more field strings. No DB, no React.

**Files:**
- Create: `src/domain/media.ts`
- Test: `src/domain/media.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/media.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mediaKind, mediaToken, parseField, mediaIdsIn } from './media'

describe('mediaKind', () => {
  it('classifies by MIME prefix', () => {
    expect(mediaKind('image/png')).toBe('image')
    expect(mediaKind('audio/mpeg')).toBe('audio')
    expect(mediaKind('video/mp4')).toBe('video')
    expect(mediaKind('application/pdf')).toBe('other')
  })
})

describe('mediaToken', () => {
  it('wraps an id in the token syntax', () => {
    expect(mediaToken('abc-123')).toBe('[[media:abc-123]]')
  })
})

describe('parseField', () => {
  it('returns a single text segment when there are no tokens', () => {
    expect(parseField('just text')).toEqual([{ type: 'text', value: 'just text' }])
  })

  it('splits text around a token', () => {
    expect(parseField('before [[media:m1]] after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'media', id: 'm1' },
      { type: 'text', value: ' after' },
    ])
  })

  it('handles a token at the very start and multiple tokens', () => {
    expect(parseField('[[media:m1]]x[[media:m2]]')).toEqual([
      { type: 'media', id: 'm1' },
      { type: 'text', value: 'x' },
      { type: 'media', id: 'm2' },
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseField('')).toEqual([])
  })
})

describe('mediaIdsIn', () => {
  it('collects unique ids across several fields', () => {
    expect(mediaIdsIn('a [[media:m1]] b', 'c [[media:m2]] [[media:m1]]')).toEqual(['m1', 'm2'])
  })

  it('returns an empty array when no tokens are present', () => {
    expect(mediaIdsIn('plain', 'text')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- domain/media`
Expected: FAIL — cannot resolve `./media`.

- [ ] **Step 3: Implement the helpers**

Create `src/domain/media.ts`:
```ts
export type MediaKind = 'image' | 'audio' | 'video' | 'other'

export function mediaKind(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}

// Inline reference embedded in a card field, e.g. "See [[media:1a2b]] closely".
const TOKEN_RE = /\[\[media:([^\]]+)\]\]/g

export function mediaToken(id: string): string {
  return `[[media:${id}]]`
}

export type FieldSegment =
  | { type: 'text'; value: string }
  | { type: 'media'; id: string }

export function parseField(text: string): FieldSegment[] {
  const segments: FieldSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, start) })
    segments.push({ type: 'media', id: match[1] })
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) })
  return segments
}

export function mediaIdsIn(...texts: string[]): string[] {
  const ids = new Set<string>()
  for (const text of texts) {
    for (const match of text.matchAll(TOKEN_RE)) ids.add(match[1])
  }
  return [...ids]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- domain/media`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add media domain helpers — token parsing + MIME classification (TDD)"
```

---

### Task 2: Media repository (TDD)

Owns the `media` table: store a blob, fetch one, and prune assets no longer referenced by any note.

**Files:**
- Create: `src/db/media.ts`
- Test: `src/db/media.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/media.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addMedia, getMedia, pruneOrphanMedia } from './media'
import type { Note } from './schema'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function blob(text = 'data'): Blob {
  return new Blob([text], { type: 'image/png' })
}

describe('media repository', () => {
  it('stores a blob and returns an asset with an id', async () => {
    const asset = await addMedia(blob(), 'pic.png', 'image/png')
    expect(asset.id).toBeTruthy()
    expect(asset.filename).toBe('pic.png')
    expect(asset.mime).toBe('image/png')
    const fetched = await getMedia(asset.id)
    expect(fetched?.filename).toBe('pic.png')
  })

  it('getMedia returns undefined for an unknown id', async () => {
    expect(await getMedia('nope')).toBeUndefined()
  })

  it('prunes assets not referenced by any note and reports the count', async () => {
    const referenced = await addMedia(blob(), 'keep.png', 'image/png')
    await addMedia(blob(), 'orphan.png', 'image/png')
    const note: Note = {
      id: 'n1', deckId: 'd1', type: 'basic',
      fields: { Front: `[[media:${referenced.id}]]`, Back: 'A' },
      mediaRefs: [referenced.id],
    }
    await db.notes.add(note)

    expect(await pruneOrphanMedia()).toBe(1)
    expect(await getMedia(referenced.id)).toBeDefined()
    expect(await db.media.count()).toBe(1)
  })

  it('prunes nothing when every asset is referenced', async () => {
    const a = await addMedia(blob(), 'a.png', 'image/png')
    await db.notes.add({
      id: 'n1', deckId: 'd1', type: 'basic',
      fields: { Front: 'Q', Back: 'A' }, mediaRefs: [a.id],
    })
    expect(await pruneOrphanMedia()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- db/media`
Expected: FAIL — cannot resolve `./media`.

- [ ] **Step 3: Implement the repository**

Create `src/db/media.ts`:
```ts
import { db } from './db'
import type { MediaAsset } from './schema'

export async function addMedia(blob: Blob, filename: string, mime: string): Promise<MediaAsset> {
  const asset: MediaAsset = { id: crypto.randomUUID(), blob, mime, filename }
  await db.media.add(asset)
  return asset
}

export function getMedia(id: string): Promise<MediaAsset | undefined> {
  return db.media.get(id)
}

// Delete any media asset not referenced by some note's mediaRefs. Returns how many were removed.
export async function pruneOrphanMedia(): Promise<number> {
  const [notes, assets] = await Promise.all([db.notes.toArray(), db.media.toArray()])
  const referenced = new Set<string>()
  for (const note of notes) for (const id of note.mediaRefs) referenced.add(id)
  const orphans = assets.filter((a) => !referenced.has(a.id)).map((a) => a.id)
  if (orphans.length > 0) await db.media.bulkDelete(orphans)
  return orphans.length
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- db/media`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add media repository with orphan pruning (TDD)"
```

---

### Task 3: Derive note.mediaRefs in the cards repository (TDD)

Card fields may now contain media tokens. On create/update, recompute `note.mediaRefs` from the field text; on update/delete, prune orphaned media.

**Files:**
- Modify: `src/db/cards.ts`
- Test: `src/db/cards.media.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/cards.media.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard, updateTextCard, deleteCard, listCardsByDeck } from './cards'
import { addMedia, getMedia } from './media'
import { mediaToken } from '../domain/media'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function blob(): Blob {
  return new Blob(['x'], { type: 'image/png' })
}

describe('cards repository — media refs', () => {
  it('derives mediaRefs from tokens in the front/back on create', async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { note } = await createTextCard({
      deckId: 'd1',
      front: `Look: ${mediaToken(asset.id)}`,
      back: 'A',
    })
    expect(note.mediaRefs).toEqual([asset.id])
  })

  it('recomputes mediaRefs on update and prunes the now-orphaned asset', async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { note } = await createTextCard({
      deckId: 'd1',
      front: mediaToken(asset.id),
      back: 'A',
    })
    expect(note.mediaRefs).toEqual([asset.id])

    await updateTextCard(note.id, 'no media now', 'A')

    const rows = await listCardsByDeck('d1')
    expect(rows[0].note.mediaRefs).toEqual([])
    expect(await getMedia(asset.id)).toBeUndefined() // pruned
  })

  it('prunes a card’s media when the card is deleted', async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { card } = await createTextCard({
      deckId: 'd1',
      front: mediaToken(asset.id),
      back: 'A',
    })
    await deleteCard(card.id)
    expect(await getMedia(asset.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- cards.media`
Expected: FAIL — `note.mediaRefs` is `[]` after create (tokens not yet parsed).

- [ ] **Step 3: Update the cards repository**

In `src/db/cards.ts`, add these imports after the existing imports (after `import { newCardSrs } from '../domain/srs'`):
```ts
import { mediaIdsIn } from '../domain/media'
import { pruneOrphanMedia } from './media'
```

In `createTextCard`, replace the `mediaRefs: []` line in the `note` object with:
```ts
    mediaRefs: mediaIdsIn(input.front, input.back),
```

Replace the whole `updateTextCard` function with:
```ts
export async function updateTextCard(noteId: string, front: string, back: string): Promise<void> {
  await db.notes.update(noteId, {
    fields: { Front: front, Back: back },
    mediaRefs: mediaIdsIn(front, back),
  })
  await pruneOrphanMedia()
}
```

Replace the whole `deleteCard` function with:
```ts
export async function deleteCard(cardId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    await db.cards.delete(cardId)
    const remaining = await db.cards.where('noteId').equals(card.noteId).count()
    if (remaining === 0) await db.notes.delete(card.noteId)
  })
  await pruneOrphanMedia()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- cards`
Expected: PASS — both `cards.test.ts` (existing, still green) and `cards.media.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: derive note.mediaRefs from field tokens + prune media on edit/delete (TDD)"
```

---

### Task 4: RenderedField component (with component test)

Resolves a field's tokens to elements: text segments render as paragraphs; media segments load the asset and render an object-URL-backed `<img>`/`<audio>`/`<video>`. Object URLs are revoked on unmount/asset change.

**Files:**
- Create: `src/ui/RenderedField.tsx`
- Test: `src/ui/RenderedField.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/ui/RenderedField.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

beforeAll(() => {
  // jsdom has no object-URL API.
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('RenderedField', () => {
  it('renders plain text', async () => {
    render(<RenderedField text="hello world" />)
    expect(await screen.findByText('hello world')).toBeInTheDocument()
  })

  it('renders an image for an image media token', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<RenderedField text={`before ${mediaToken(asset.id)}`} />)
    expect(await screen.findByText('before')).toBeInTheDocument()
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'blob:mock')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- RenderedField`
Expected: FAIL — cannot resolve `./RenderedField`.

- [ ] **Step 3: Implement the component**

Create `src/ui/RenderedField.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMedia } from '../db/media'
import { parseField, mediaKind } from '../domain/media'

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

export default function RenderedField({ text }: { text: string }) {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- RenderedField`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add RenderedField — resolves media tokens to img/audio/video (TDD)"
```

---

### Task 5: Attach media in the card editor (with component test)

Add per-side file inputs to `CardEditor`. Selecting a file stores it via `addMedia` and appends its token to that field. A live `RenderedField` preview shows the result.

**Files:**
- Rewrite: `src/ui/CardEditor.tsx`
- Test: `src/ui/CardEditor.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/ui/CardEditor.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/db'
import CardEditor from './CardEditor'

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CardEditor media attach', () => {
  it('attaches an image to the front and submits a token in the field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CardEditor submitLabel="Save card" onSubmit={onSubmit} />)

    const file = new File(['x'], 'pic.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/attach to front/i), file)

    // The front field now contains a media token.
    const front = screen.getByLabelText('Front') as HTMLTextAreaElement
    expect(front.value).toMatch(/\[\[media:.+\]\]/)
    expect(await db.media.count()).toBe(1)

    await user.type(screen.getByLabelText('Back'), 'Answer')
    await user.click(screen.getByRole('button', { name: /save card/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [front2] = onSubmit.mock.calls[0]
    expect(front2).toMatch(/\[\[media:.+\]\]/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CardEditor`
Expected: FAIL — there is no "Attach to front" control yet.

- [ ] **Step 3: Rewrite the editor**

Rewrite `src/ui/CardEditor.tsx`:
```tsx
import { useState } from 'react'
import Button from './Button'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

export interface CardEditorProps {
  initialFront?: string
  initialBack?: string
  submitLabel: string
  onSubmit: (front: string, back: string) => void | Promise<void>
  onCancel?: () => void
}

export default function CardEditor({
  initialFront = '',
  initialBack = '',
  submitLabel,
  onSubmit,
  onCancel,
}: CardEditorProps) {
  const [front, setFront] = useState(initialFront)
  const [back, setBack] = useState(initialBack)

  async function submit() {
    if (!front.trim() || !back.trim()) return
    await onSubmit(front.trim(), back.trim())
    setFront('')
    setBack('')
  }

  async function attach(side: 'front' | 'back', file: File | undefined) {
    if (!file) return
    const asset = await addMedia(file, file.name, file.type || 'application/octet-stream')
    const append = (prev: string) => (prev ? `${prev}\n${mediaToken(asset.id)}` : mediaToken(asset.id))
    if (side === 'front') setFront(append)
    else setBack(append)
  }

  const field = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'
  const fileInput = 'block text-xs text-[var(--color-muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--color-surface)] file:px-2 file:py-1'

  return (
    <div className="space-y-2">
      <textarea aria-label="Front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" rows={2} className={field} />
      <input
        aria-label="Attach to front"
        type="file"
        accept="image/*,audio/*,video/*"
        className={fileInput}
        onChange={(e) => { attach('front', e.target.files?.[0]); e.target.value = '' }}
      />
      {front.trim() && (
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <RenderedField text={front} />
        </div>
      )}

      <textarea aria-label="Back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" rows={2} className={field} />
      <input
        aria-label="Attach to back"
        type="file"
        accept="image/*,audio/*,video/*"
        className={fileInput}
        onChange={(e) => { attach('back', e.target.files?.[0]); e.target.value = '' }}
      />
      {back.trim() && (
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <RenderedField text={back} />
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={submit}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- CardEditor`
Expected: PASS (1 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: attach image/audio/video media in the card editor with live preview (TDD)"
```

---

### Task 6: Render media in the deck list and study screen (with component test)

Use `RenderedField` so media tokens display as media in the deck detail list and during study. Add a study component test for an image card.

**Files:**
- Modify: `src/pages/DeckDetailPage.tsx`
- Modify: `src/pages/StudyPage.tsx`
- Modify: `src/pages/StudyPage.test.tsx`

- [ ] **Step 1: Render media in the deck detail list**

In `src/pages/DeckDetailPage.tsx`, add this import after `import CardEditor from '../ui/CardEditor'`:
```tsx
import RenderedField from '../ui/RenderedField'
```

Replace the non-editing card preview block:
```tsx
              <div className="flex-1">
                <div className="font-medium">{note.fields.Front}</div>
                <div className="text-sm text-[var(--color-muted)]">{note.fields.Back}</div>
              </div>
```
with:
```tsx
              <div className="flex-1 space-y-1">
                <div className="font-medium"><RenderedField text={note.fields.Front} /></div>
                <div className="text-sm text-[var(--color-muted)]"><RenderedField text={note.fields.Back} /></div>
              </div>
```

- [ ] **Step 2: Render media in the study screen**

In `src/pages/StudyPage.tsx`, add this import after `import EmptyState from '../ui/EmptyState'`:
```tsx
import RenderedField from '../ui/RenderedField'
```

Replace the card body block:
```tsx
        <div>
          <div className="text-lg">{note?.fields.Front}</div>
          {revealed && (
            <>
              <hr className="my-4 border-[var(--color-border)]" />
              <div className="text-lg text-[var(--color-muted)]">{note?.fields.Back}</div>
            </>
          )}
        </div>
```
with:
```tsx
        <div className="text-lg">
          {note && <RenderedField text={note.fields.Front} />}
          {revealed && note && (
            <>
              <hr className="my-4 border-[var(--color-border)]" />
              <div className="text-[var(--color-muted)]"><RenderedField text={note.fields.Back} /></div>
            </>
          )}
        </div>
```

- [ ] **Step 3: Add the object-URL stub and an image study test**

In `src/pages/StudyPage.test.tsx`, add `beforeAll` to the existing vitest imports (change the import line to include it) and stub the object-URL API. Add this block immediately after the imports, before the existing `beforeEach`:
```tsx
beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})
```
Ensure the test file imports `beforeAll` (e.g. `import { beforeAll, beforeEach, describe, expect, it } from 'vitest'`).

Add these imports near the other imports:
```tsx
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
```

Add this test inside the existing `describe('StudyPage', ...)` block:
```tsx
  it('renders an image on the front of a media card', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    await createTextCard({ deckId: 'd1', front: mediaToken(asset.id), back: 'Paris' })
    renderStudy()
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock')
  })
```

- [ ] **Step 4: Run the study tests to verify they pass**

Run: `npm test -- StudyPage`
Expected: PASS — existing two cases plus the new image case.

- [ ] **Step 5: Verify the full suite + production build**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc -b` + Vite production build succeed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: render media in deck list and study screen via RenderedField"
```

---

### Task 7: Update the roadmap

Mark Phase 3 implemented.

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`

- [ ] **Step 1: Update the status table**

In `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`, change the Phase 3 row's plan file and status:
```
| 3 | Media cards (image/audio/video via IndexedDB blobs) | `2026-06-03-flashdeck-phase3-media-cards.md` | ✅ Implemented |
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: mark Phase 3 (media cards) implemented in roadmap"
```

---

## Phase 3 Definition of Done
- `domain/media.ts` (token parsing, MIME classification) and `db/media.ts` (blob persistence, orphan pruning) are unit-tested and green.
- Card fields carry `[[media:<id>]]` tokens; `note.mediaRefs` is derived from field text on every create/update; editing or deleting a card prunes orphaned media blobs.
- The card editor attaches image/audio/video files (stored as IndexedDB blobs) with a live preview.
- Media renders as `<img>`/`<audio>`/`<video>` in the deck detail list and the study screen, with object URLs revoked on unmount.
- `npm test` and `npm run build` both pass.

Next: **Phase 4 — Anki import** (`.apkg`: Basic + Cloze + media + history). Its plan is written when Phase 3 completes.
