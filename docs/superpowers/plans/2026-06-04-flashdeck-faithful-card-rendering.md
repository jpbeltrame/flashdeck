# FlashDeck — Faithful Card Rendering (sandboxed iframe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render imported Anki cards faithfully in the study screen — including the note type's CSS and card-side JavaScript — so interactive note types (MCQ Ultimate, etc.) work. Untrusted deck code runs inside a sandboxed iframe with no access to the app.

**Architecture:** Import the note-type CSS (`Note.css`) and store the *faithful* rendered front/back (afmt with `{{FrontSide}}` expanded, `<script>` retained). A pure `buildCardDoc` builds a full HTML document (CSS + body + media data-URLs + a height-reporting script). A `CardFrame` component renders that document in `<iframe sandbox="allow-scripts">` (no `allow-same-origin` ⇒ opaque origin ⇒ no access to our DOM/IndexedDB/cookies). The study screen uses Anki's **replace** model for html notes (front doc → back doc on reveal); text notes and deck-list previews are unchanged.

**Tech Stack:** Existing stack. No new dependencies. Media inlined as `data:` URLs (a sandboxed iframe cannot read our `blob:` URLs).

**Security:** `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. Never add `allow-same-origin`. The iframe can run scripts but is same-origin-isolated, so deck JS cannot touch FlashDeck data.

**Verified Anki facts:** note-type CSS is `model.css` (legacy models JSON) and `Notetype.Config` protobuf field **3** (string) for the v18 schema (kind is field 1, already handled).

**Builds on:** `src/db/schema.ts`, `src/domain/anki/types.ts`, `src/domain/anki/collection.ts`, `src/domain/anki/fields.ts`, `src/domain/anki/import.ts`, `src/ui/RenderedField.tsx`, `src/pages/StudyPage.tsx`, `src/pages/DeckDetailPage.tsx`.

> Run one test file with `npm test -- <substring>`. No Co-Authored-By trailer in commits. All commands from project root.

---

### Task 1: Import the note-type CSS (TDD)

Add `css` to `AnkiModel` and `Note`. Legacy models JSON already carries `css`, so it flows through once the type allows it; the v18 reader must decode it from the notetype config (protobuf field 3).

**Files:**
- Modify: `src/domain/anki/types.ts`, `src/db/schema.ts`, `src/domain/anki/collection.ts`, `src/domain/anki/__fixtures__/build-apkg.ts`
- Test: `src/domain/anki/collection.test.ts`

- [ ] **Step 1: Extend the types**

In `src/domain/anki/types.ts`, add `css` to `AnkiModel`:
```ts
export interface AnkiModel {
  id: string
  name: string
  type: 0 | 1
  css?: string
  flds: { name: string; ord: number }[]
  tmpls: AnkiTemplate[]
}
```
In `src/db/schema.ts`, add `css` to `Note`:
```ts
export interface Note {
  id: string
  deckId: string
  type: 'basic' | 'cloze'
  format?: 'text' | 'html'
  /** Note-type stylesheet (imported Anki notes); applied when rendering in the card iframe. */
  css?: string
  fields: Record<string, string>
  mediaRefs: string[]
}
```

- [ ] **Step 2: Let the fixture set a v18 notetype css**

In `src/domain/anki/__fixtures__/build-apkg.ts`, extend `ModernNotetype` with an optional `css` and encode it as protobuf field 3 when building the notetype config. Change the interface:
```ts
export interface ModernNotetype {
  id: number
  name: string
  cloze?: boolean
  css?: string
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
}
```
And in `buildModernCollection`, replace the notetype-config line with one that includes kind (1) and css (3):
```ts
    const cfg: { num: number; value: number | string }[] = []
    if (nt.cloze) cfg.push({ num: 1, value: 1 })
    if (nt.css) cfg.push({ num: 3, value: nt.css })
    db.run('INSERT INTO notetypes (id, name, config) VALUES (?, ?, ?)', [nt.id, nt.name, encodeProto(cfg)])
```
(Remove the previous `const ntConfig = ...` / insert using `ntConfig`.)

- [ ] **Step 3: Write the failing test**

Add to `src/domain/anki/collection.test.ts` inside the modern-schema describe block:
```ts
  it('reads the note-type css from the v18 notetype config', async () => {
    const db = await buildModernCollection({
      crt: 1_600_000_000,
      notetypes: [{ id: 1, name: 'Styled', css: '.card { color: red; }', fields: ['Front', 'Back'],
        templates: [{ name: 'C', qfmt: '{{Front}}', afmt: '{{Back}}' }] }],
      decks: [{ id: 1, name: 'Default' }],
      notes: [{ id: 10, mid: 1, flds: 'Q\x1fA' }],
      cards: [{ id: 100, nid: 10, did: 1, ord: 0, type: 0 }],
    })
    expect(readCollection(db).models['1'].css).toBe('.card { color: red; }')
  })
```

- [ ] **Step 4: Run it → FAIL** (`npm test -- anki/collection`): `css` is `undefined`.

- [ ] **Step 5: Read css in the v18 reader**

In `src/domain/anki/collection.ts`, in `readModernModels`, set `css` on the returned model using the protobuf reader (field 3):
```ts
    out[id] = {
      id, name: String(nt.name), type: kind === 1 ? 1 : 0,
      css: readStringField(nt.config as Uint8Array, 3),
      flds, tmpls,
    }
```
(The legacy JSON path needs no change — `css` is already present in the parsed model objects and now allowed by the type.)

- [ ] **Step 6: Run it → PASS** (`npm test -- anki/collection`).

- [ ] **Step 7: Commit**
```bash
git add src/domain/anki/types.ts src/db/schema.ts src/domain/anki/collection.ts src/domain/anki/collection.test.ts src/domain/anki/__fixtures__/build-apkg.ts
git commit -m "feat: import the Anki note-type css (legacy + v18 protobuf field 3) (TDD)"
```

---

### Task 2: Faithful render at import (TDD)

Render imported cards the Anki way: expand `{{FrontSide}}` in the back (the study screen now *replaces* front with back, so no duplication), keep `<script>` (it runs in the iframe), and drop the now-inaccurate "card-side script unsupported" warning. Store `note.css`.

**Files:**
- Modify: `src/domain/anki/fields.ts`, `src/domain/anki/import.ts`
- Test: `src/domain/anki/fields.test.ts`, `src/domain/anki/import.test.ts`

- [ ] **Step 1: Update the fields tests**

In `src/domain/anki/fields.test.ts`:
- Change the Basic render expectation back to the faithful (FrontSide-expanded) form:
```ts
    const { front, back, warnings } = renderCard(basic, { Front: 'Q', Back: 'A' }, 0, map)
    expect(front).toBe('Q')
    expect(back).toBe('Q<hr>A') // {{FrontSide}} expands to the front (Anki-faithful)
    expect(warnings).toEqual([])
```
- Replace the `warns about card-side script` test with one asserting script is retained and NOT warned:
```ts
  it('keeps card-side script (it runs sandboxed) and does not warn', () => {
    const m: AnkiModel = { ...basic, tmpls: [{ name: 'x', ord: 0, qfmt: '<script>x()</script>{{Front}}', afmt: '{{Back}}' }] }
    const { front, warnings } = renderCard(m, { Front: 'Q', Back: 'A' }, 0, map)
    expect(front).toBe('<script>x()</script>Q')
    expect(warnings).toEqual([])
  })
```
(The conditional-section and cloze tests stay unchanged.)

- [ ] **Step 2: Run → FAIL** (`npm test -- anki/fields`).

- [ ] **Step 3: Update `renderCard`**

In `src/domain/anki/fields.ts`:
- Remove the script-warning block entirely:
```ts
  // (delete these lines)
  if (tmpl && /<script/i.test(tmpl.qfmt + tmpl.afmt)) {
    warnings.push(`Note type "${model.name}" uses card-side script, which is not supported; rendered without it.`)
  }
```
- Change the back line to expand `{{FrontSide}}` to the rendered front:
```ts
  const back = substitute(tmpl?.afmt ?? '', 'back').replace(/\{\{FrontSide\}\}/g, front)
```
`warnings` stays declared (still used for nothing now, returned empty) — keep `const warnings: string[] = []` and `return { front, back, warnings }`.

- [ ] **Step 4: Run → PASS** (`npm test -- anki/fields`).

- [ ] **Step 5: Store css on imported notes + update import test**

In `src/domain/anki/import.ts`, where the note object is pushed in `buildImportResult`, add `css: model.css`:
```ts
    notes.push({
      id: noteId, deckId: firstDeck, type: model.type === 1 ? 'cloze' : 'basic', format: 'html',
      css: model.css,
      fields: { Front: display.front, Back: display.back },
      mediaRefs: mediaIdsIn(fieldText),
    })
```
Add a test in `src/domain/anki/import.test.ts` (the pure-domain one at `src/domain/anki/import.test.ts`) — add to the existing `describe('buildImportResult', ...)`:
```ts
  it('carries the note-type css onto imported notes', () => {
    const col = collection()
    col.models['1'].css = '.card { font-size: 20px; }'
    const r = buildImportResult(col, media)
    expect(r.notes.find((n) => n.type === 'basic')!.css).toBe('.card { font-size: 20px; }')
  })
```

- [ ] **Step 6: Run → PASS** (`npm test -- anki/import`). Also run `npm test -- db/import` to confirm the e2e import tests still pass (the back now expands FrontSide; the modern e2e asserts cloze.fields.Front contains 'cloze' — unaffected).

- [ ] **Step 7: Commit**
```bash
git add src/domain/anki/fields.ts src/domain/anki/fields.test.ts src/domain/anki/import.ts src/domain/anki/import.test.ts
git commit -m "feat: faithful import render — expand FrontSide, keep script, store note css (TDD)"
```

---

### Task 3: `buildCardDoc` — the sandboxed card document (TDD)

A pure function that assembles the full HTML document rendered inside the iframe: the note-type CSS, the card body with `[[media:<id>]]` tokens resolved to data URLs, an Anki-style `.card` (+ `nightMode` in dark mode) wrapper, and a tiny script that reports its height to the parent.

**Files:**
- Create: `src/domain/anki/card-doc.ts`
- Test: `src/domain/anki/card-doc.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/anki/card-doc.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildCardDoc } from './card-doc'

describe('buildCardDoc', () => {
  it('embeds the css and the body inside a .card wrapper', () => {
    const doc = buildCardDoc({ html: '<p>hi</p>', css: '.card{color:red}' })
    expect(doc).toContain('<style>.card{color:red}</style>')
    expect(doc).toContain('<p>hi</p>')
    expect(doc).toContain('class="card"')
    expect(doc).toContain('flashdeck-card-height') // height-reporting script
  })

  it('adds the nightMode class in dark mode', () => {
    expect(buildCardDoc({ html: 'x', dark: true })).toContain('nightMode')
  })

  it('resolves an image media token to its data url (in an img src)', () => {
    const doc = buildCardDoc({
      html: '<img src="[[media:m1]]">',
      media: { m1: { url: 'data:image/png;base64,AAAA', kind: 'image' } },
    })
    expect(doc).toContain('<img src="data:image/png;base64,AAAA">')
    expect(doc).not.toContain('[[media:m1]]')
  })

  it('renders a standalone audio token as an <audio> element', () => {
    const doc = buildCardDoc({
      html: 'listen [[media:a1]]',
      media: { a1: { url: 'data:audio/mpeg;base64,BBBB', kind: 'audio' } },
    })
    expect(doc).toContain('<audio controls src="data:audio/mpeg;base64,BBBB"></audio>')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npm test -- card-doc`).

- [ ] **Step 3: Implement**

Create `src/domain/anki/card-doc.ts`:
```ts
export interface CardDocMedia {
  url: string
  kind: 'image' | 'audio' | 'video' | 'other'
}

export interface CardDocOptions {
  html: string
  css?: string
  dark?: boolean
  /** id -> resolved media (data: URL + kind). */
  media?: Record<string, CardDocMedia>
}

// Reports the rendered height to the parent so the iframe can be sized.
const HEIGHT_SCRIPT =
  `(function(){function h(){parent.postMessage({type:'flashdeck-card-height',` +
  `height:document.documentElement.scrollHeight},'*')}` +
  `window.addEventListener('load',h);` +
  `if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement);` +
  `setTimeout(h,50);setTimeout(h,300)})()`

export function buildCardDoc(opts: CardDocOptions): string {
  let body = opts.html
  for (const [id, m] of Object.entries(opts.media ?? {})) {
    const token = `[[media:${id}]]`
    body = m.kind === 'audio'
      ? body.split(token).join(`<audio controls src="${m.url}"></audio>`)
      : body.split(token).join(m.url) // sits inside an <img>/<video> src
  }
  const cls = `card${opts.dark ? ' nightMode night_mode' : ''}`
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${opts.css ?? ''}</style></head>` +
    `<body class="${cls}"><div id="qa">${body}</div>` +
    `<script>${HEIGHT_SCRIPT}</script></body></html>`
  )
}
```

- [ ] **Step 4: Run → PASS** (`npm test -- card-doc`).

- [ ] **Step 5: Commit**
```bash
git add src/domain/anki/card-doc.ts src/domain/anki/card-doc.test.ts
git commit -m "feat: build sandboxed card HTML document with css + media data-urls (TDD)"
```

---

### Task 4: `CardFrame` component (with component test)

Resolves a card's media to data URLs, builds the document with `buildCardDoc`, and renders it in a sandboxed iframe; auto-sizes via `postMessage`.

**Files:**
- Create: `src/ui/CardFrame.tsx`
- Test: `src/ui/CardFrame.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/ui/CardFrame.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import CardFrame from './CardFrame'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CardFrame', () => {
  it('renders a sandboxed iframe whose srcdoc includes the css', async () => {
    render(<CardFrame html="<p>hi</p>" css=".card{color:red}" />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('.card{color:red}'))
    expect(frame.getAttribute('srcdoc')).toContain('<p>hi</p>')
  })

  it('inlines referenced media as a data url', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<CardFrame html={`<img src="${mediaToken(asset.id)}">`} />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('data:image/png;base64,'))
    expect(frame.getAttribute('srcdoc')).not.toContain('[[media:')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npm test -- CardFrame`).

- [ ] **Step 3: Implement**

Create `src/ui/CardFrame.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { mediaIdsIn, mediaKind } from '../domain/media'
import { buildCardDoc, type CardDocMedia } from '../domain/anki/card-doc'

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export default function CardFrame({ html, css }: { html: string; css?: string }) {
  const [doc, setDoc] = useState('')
  const [height, setHeight] = useState(160)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ids = mediaIdsIn(html)
      const assets = await db.media.bulkGet(ids)
      const media: Record<string, CardDocMedia> = {}
      for (let i = 0; i < ids.length; i++) {
        const asset = assets[i]
        if (!asset) continue
        media[ids[i]] = { url: await blobToDataUrl(asset.blob), kind: mediaKind(asset.mime) }
      }
      if (cancelled) return
      const dark = document.documentElement.classList.contains('dark')
      setDoc(buildCardDoc({ html, css, dark, media }))
    })()
    return () => { cancelled = true }
  }, [html, css])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (
        frameRef.current &&
        e.source === frameRef.current.contentWindow &&
        (e.data as { type?: string })?.type === 'flashdeck-card-height'
      ) {
        const h = Number((e.data as { height?: number }).height)
        if (Number.isFinite(h)) setHeight(Math.max(80, h))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // sandbox="allow-scripts" WITHOUT allow-same-origin: deck JS runs but cannot
  // reach our DOM, IndexedDB, cookies, or same-origin network.
  return (
    <iframe
      ref={frameRef}
      title="card"
      sandbox="allow-scripts"
      srcDoc={doc}
      className="w-full border-0 bg-transparent"
      style={{ height }}
    />
  )
}
```

- [ ] **Step 4: Run → PASS** (`npm test -- CardFrame`). If jsdom lacks `Blob.prototype.arrayBuffer`, report it; the fix is to read via `FileReader.readAsDataURL` instead — but modern jsdom supports `arrayBuffer()`.

- [ ] **Step 5: Commit**
```bash
git add src/ui/CardFrame.tsx src/ui/CardFrame.test.tsx
git commit -m "feat: CardFrame renders Anki cards in a sandboxed iframe with data-url media (TDD)"
```

---

### Task 5: Use CardFrame in study; trim deck-list preview for html notes

Study renders html notes with `CardFrame` using the **replace** flow (front doc, then back doc on reveal). Text notes keep the existing render. The deck-list preview shows only the Front for html notes (the stored Back now repeats the question via FrontSide).

**Files:**
- Modify: `src/pages/StudyPage.tsx`, `src/pages/DeckDetailPage.tsx`
- Test: `src/pages/StudyPage.test.tsx`

- [ ] **Step 1: Render html cards via CardFrame in StudyPage**

In `src/pages/StudyPage.tsx`, add the import:
```tsx
import CardFrame from '../ui/CardFrame'
```
Replace the card-body block:
```tsx
        <div className="text-lg">
          {note && <RenderedField text={note.fields.Front} format={note.format} />}
          {revealed && note && (
            <>
              <hr className="my-4 border-[var(--color-border)]" />
              <div className="text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
            </>
          )}
        </div>
```
with a branch on format (html ⇒ CardFrame replace flow; text ⇒ existing append flow):
```tsx
        {note?.format === 'html' ? (
          <div className="w-full">
            <CardFrame html={revealed ? note.fields.Back : note.fields.Front} css={note.css} />
          </div>
        ) : (
          <div className="text-lg">
            {note && <RenderedField text={note.fields.Front} format={note.format} />}
            {revealed && note && (
              <>
                <hr className="my-4 border-[var(--color-border)]" />
                <div className="text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 2: Deck-list preview shows Front only for html notes**

In `src/pages/DeckDetailPage.tsx`, the non-editing preview currently renders Front and Back via `RenderedField`. Read the file, then change the Back line so it only renders for non-html notes:
```tsx
                <div className="font-medium"><RenderedField text={note.fields.Front} format={note.format} /></div>
                {note.format !== 'html' && (
                  <div className="text-sm text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
                )}
```
(For html notes the Back repeats the question via FrontSide, so it's omitted from the compact list preview.)

- [ ] **Step 3: Add a study test for an html (iframe) card**

In `src/pages/StudyPage.test.tsx`, add a test that an html note renders the sandboxed iframe. Use the cards repo plus a direct note/card insert with `format: 'html'`. Add near the other tests (the file already stubs object URLs and imports `db`, `screen`, etc. — match its existing imports/helpers; add `crypto.randomUUID()` inserts):
```tsx
  it('renders an html note inside a sandboxed iframe', async () => {
    const noteId = crypto.randomUUID()
    await db.notes.add({
      id: noteId, deckId: 'd1', type: 'basic', format: 'html',
      css: '.card{color:#333}', fields: { Front: '<b>Q</b>', Back: '<b>Q</b><hr>A' }, mediaRefs: [],
    })
    await db.cards.add({
      id: crypto.randomUUID(), noteId, deckId: 'd1', templateIndex: 0,
      srs: { status: 'new', ease: 2.5, intervalDays: 0, dueDate: 0, reps: 0, lapses: 0 },
    })
    renderStudy()
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  })
```
> If `renderStudy()` / the deck id differ in the existing test file, mirror whatever the existing tests use (same deck id and render helper). The point is: insert an html note+card and assert the iframe (`title="card"`) appears.

- [ ] **Step 4: Run the affected suites**

Run: `npm test -- StudyPage CardFrame DeckDetail`
Expected: PASS (existing text/media study tests still green; new html-iframe test passes).

- [ ] **Step 5: Commit**
```bash
git add src/pages/StudyPage.tsx src/pages/DeckDetailPage.tsx src/pages/StudyPage.test.tsx
git commit -m "feat: render imported html cards in the study screen via sandboxed CardFrame"
```

---

### Task 6: Full verification + docs

- [ ] **Step 1: Full suite + build**

Run: `npm test && npm run build`
Expected: all green; production build succeeds.

- [ ] **Step 2: Roadmap note**

In `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`, update the `**Deferred:**` paragraph so the card-JS line reflects support. Replace the sentence about card-side JS (if present) / append:
```
**Card-side JavaScript** in imported note types (e.g. MCQ) IS supported: cards
render in a sandboxed `<iframe sandbox="allow-scripts">` with the note-type CSS
(see `2026-06-04-flashdeck-faithful-card-rendering.md`). In-card answer buttons
are visual only — grading still uses FlashDeck's rating buttons.
```

- [ ] **Step 3: Commit**
```bash
git add docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md
git commit -m "docs: note sandboxed card-JS rendering support"
```

---

## Definition of Done
- Imported note types with card-side CSS/JS (e.g. MCQ Ultimate) render and behave in the study screen as in Anki, inside a sandboxed iframe.
- The iframe uses `sandbox="allow-scripts"` only (no `allow-same-origin`); deck code cannot access app data.
- Note-type CSS is imported (legacy + v18); the faithful front/back are stored (FrontSide expanded, script retained); the obsolete "script unsupported" warning is gone.
- Text (own-created) cards and deck-list previews are unchanged.
- `npm test` and `npm run build` both pass.
