# FlashDeck Phase 2 — Decks, Text Cards & Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlashDeck usable end-to-end for text cards — create/edit/delete decks and cards, study due cards with an SM-2 scheduler, and see basic progress.

**Architecture:** A pure, framework-free SM-2 engine (`src/domain/srs.ts`) drives scheduling. Repositories in `src/db` own all persistence (cards/notes, review logging, study queue, stats). React pages use `dexie-react-hooks`' `useLiveQuery` for reactive reads and call repositories for writes. No media yet (Phase 3); cards are Basic front/back text.

**Tech Stack:** Existing Phase 1 stack — React 19 + TS + Vite, Dexie/IndexedDB, Zustand, React Router (HashRouter), Tailwind v4, Vitest + Testing Library, `fake-indexeddb` for DB tests.

**Builds on Phase 1:** `src/db/schema.ts` (entities), `src/db/db.ts` (Dexie tables), `src/db/decks.ts` (deck repo), the routed pages in `src/pages`, and `src/ui/AppShell.tsx`.

> All commands run from the project root `/Users/joao/projects/flashdeck`. Run a single test file with `npm test -- <substring>`.

---

### Task 1: SM-2 scheduling engine (TDD)

The scheduling core. Pure functions, no DB or React. Ratings are `1=Again, 2=Hard, 3=Good, 4=Easy`.

**Files:**
- Create: `src/domain/srs.ts`
- Test: `src/domain/srs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/srs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { newCardSrs, reviewCard, DAY_MS } from './srs'

const NOW = 1_700_000_000_000

describe('newCardSrs', () => {
  it('returns sensible defaults for a brand-new card', () => {
    expect(newCardSrs()).toEqual({
      status: 'new',
      ease: 2.5,
      intervalDays: 0,
      dueDate: 0,
      reps: 0,
      lapses: 0,
    })
  })
})

describe('reviewCard — passing', () => {
  it('Good on a new card schedules 1 day out and graduates to review', () => {
    const r = reviewCard(newCardSrs(), 3, NOW)
    expect(r.status).toBe('review')
    expect(r.intervalDays).toBe(1)
    expect(r.reps).toBe(1)
    expect(r.dueDate).toBe(NOW + DAY_MS)
  })

  it('Easy on a new card jumps to 4 days', () => {
    expect(reviewCard(newCardSrs(), 4, NOW).intervalDays).toBe(4)
  })

  it('second Good (reps=1) schedules 6 days', () => {
    const first = reviewCard(newCardSrs(), 3, NOW)
    expect(reviewCard(first, 3, NOW).intervalDays).toBe(6)
  })

  it('mature Good multiplies interval by ease', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 6, dueDate: NOW, reps: 2, lapses: 0 }
    expect(reviewCard(srs, 3, NOW).intervalDays).toBe(15) // round(6 * 2.5)
  })

  it('mature Hard multiplies interval by 1.2', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 10, dueDate: NOW, reps: 3, lapses: 0 }
    expect(reviewCard(srs, 2, NOW).intervalDays).toBe(12) // round(10 * 1.2)
  })
})

describe('reviewCard — failing (Again)', () => {
  it('lapses the card into relearning at 1 day and increments lapses', () => {
    const srs = { status: 'review' as const, ease: 2.5, intervalDays: 30, dueDate: NOW, reps: 5, lapses: 1 }
    const r = reviewCard(srs, 1, NOW)
    expect(r.status).toBe('relearning')
    expect(r.intervalDays).toBe(1)
    expect(r.reps).toBe(0)
    expect(r.lapses).toBe(2)
  })

  it('never lets ease fall below 1.3', () => {
    let srs = newCardSrs()
    for (let i = 0; i < 12; i++) srs = reviewCard(srs, 1, NOW)
    expect(srs.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('reviewCard — ease adjustments', () => {
  it('Good leaves ease unchanged, Easy raises it, Hard lowers it', () => {
    const base = { status: 'review' as const, ease: 2.5, intervalDays: 10, dueDate: NOW, reps: 3, lapses: 0 }
    expect(reviewCard(base, 3, NOW).ease).toBeCloseTo(2.5, 5)
    expect(reviewCard(base, 4, NOW).ease).toBeCloseTo(2.6, 5)
    expect(reviewCard(base, 2, NOW).ease).toBeCloseTo(2.36, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- srs`
Expected: FAIL — cannot resolve `./srs`.

- [ ] **Step 3: Implement the engine**

Create `src/domain/srs.ts`:
```ts
import type { Card } from '../db/schema'

export type Rating = 1 | 2 | 3 | 4
export const DAY_MS = 86_400_000
const MIN_EASE = 1.3

type Srs = Card['srs']

// Map the 4 buttons onto the SM-2 quality scale (0–5); q < 3 is a lapse.
const QUALITY: Record<Rating, number> = { 1: 2, 2: 3, 3: 4, 4: 5 }

export function newCardSrs(): Srs {
  return { status: 'new', ease: 2.5, intervalDays: 0, dueDate: 0, reps: 0, lapses: 0 }
}

export function reviewCard(srs: Srs, rating: Rating, now: number = Date.now()): Srs {
  const q = QUALITY[rating]
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  const ease = Math.max(MIN_EASE, srs.ease + easeDelta)

  // Lapse: drop into relearning, 1-day step.
  if (q < 3) {
    return {
      status: 'relearning',
      ease,
      intervalDays: 1,
      dueDate: now + DAY_MS,
      reps: 0,
      lapses: srs.lapses + 1,
    }
  }

  let intervalDays: number
  if (srs.reps === 0) {
    intervalDays = rating === 4 ? 4 : 1
  } else if (srs.reps === 1) {
    intervalDays = rating === 2 ? 4 : 6
  } else if (rating === 2) {
    intervalDays = Math.round(srs.intervalDays * 1.2)
  } else {
    intervalDays = Math.round(srs.intervalDays * ease)
    if (rating === 4) intervalDays = Math.round(intervalDays * 1.3)
  }
  intervalDays = Math.max(1, intervalDays)

  return {
    status: 'review',
    ease,
    intervalDays,
    dueDate: now + intervalDays * DAY_MS,
    reps: srs.reps + 1,
    lapses: srs.lapses,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- srs`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SM-2 scheduling engine (TDD)"
```

---

### Task 2: Cards & notes repository (TDD)

Create/list/update/delete Basic text cards. A Note holds the fields; one Card references it (cloze's many-cards-per-note comes in Phase 4).

**Files:**
- Create: `src/db/cards.ts`
- Test: `src/db/cards.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/cards.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  createTextCard, listCardsByDeck, updateTextCard, deleteCard, countCardsByDeck,
} from './cards'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('cards repository', () => {
  it('creates a basic note + card with new-card SRS', async () => {
    const { card, note } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    expect(note.type).toBe('basic')
    expect(note.fields).toEqual({ Front: 'Q', Back: 'A' })
    expect(card.deckId).toBe('d1')
    expect(card.srs.status).toBe('new')
    expect(await countCardsByDeck('d1')).toBe(1)
  })

  it('lists cards joined with their notes', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q1', back: 'A1' })
    await createTextCard({ deckId: 'd1', front: 'Q2', back: 'A2' })
    await createTextCard({ deckId: 'd2', front: 'X', back: 'Y' })
    const rows = await listCardsByDeck('d1')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.note.fields.Front).sort()).toEqual(['Q1', 'Q2'])
  })

  it('updates a card’s text via its note', async () => {
    const { note } = await createTextCard({ deckId: 'd1', front: 'old', back: 'old' })
    await updateTextCard(note.id, 'new front', 'new back')
    const rows = await listCardsByDeck('d1')
    expect(rows[0].note.fields).toEqual({ Front: 'new front', Back: 'new back' })
  })

  it('deletes the card and its orphaned note', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await deleteCard(card.id)
    expect(await countCardsByDeck('d1')).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- cards`
Expected: FAIL — cannot resolve `./cards`.

- [ ] **Step 3: Implement the repository**

Create `src/db/cards.ts`:
```ts
import { db } from './db'
import type { Card, Note } from './schema'
import { newCardSrs } from '../domain/srs'

export interface TextCardInput {
  deckId: string
  front: string
  back: string
}

export interface CardWithNote {
  card: Card
  note: Note
}

export async function createTextCard(input: TextCardInput): Promise<CardWithNote> {
  const note: Note = {
    id: crypto.randomUUID(),
    deckId: input.deckId,
    type: 'basic',
    fields: { Front: input.front, Back: input.back },
    mediaRefs: [],
  }
  const card: Card = {
    id: crypto.randomUUID(),
    noteId: note.id,
    deckId: input.deckId,
    templateIndex: 0,
    srs: newCardSrs(),
  }
  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.notes.add(note)
    await db.cards.add(card)
  })
  return { card, note }
}

export async function listCardsByDeck(deckId: string): Promise<CardWithNote[]> {
  const [cards, notes] = await Promise.all([
    db.cards.where('deckId').equals(deckId).toArray(),
    db.notes.where('deckId').equals(deckId).toArray(),
  ])
  const noteById = new Map(notes.map((n) => [n.id, n]))
  return cards
    .map((card) => ({ card, note: noteById.get(card.noteId) }))
    .filter((row): row is CardWithNote => row.note !== undefined)
}

export async function updateTextCard(noteId: string, front: string, back: string): Promise<void> {
  await db.notes.update(noteId, { fields: { Front: front, Back: back } })
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    await db.cards.delete(cardId)
    const remaining = await db.cards.where('noteId').equals(card.noteId).count()
    if (remaining === 0) await db.notes.delete(card.noteId)
  })
}

export function countCardsByDeck(deckId: string): Promise<number> {
  return db.cards.where('deckId').equals(deckId).count()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- cards`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add cards/notes repository for text cards (TDD)"
```

---

### Task 3: Study queue & review logging (TDD)

Builds the due-card queue and applies a rating: updates the card's SRS via the engine and writes a `ReviewLog`.

**Files:**
- Create: `src/db/study.ts`
- Test: `src/db/study.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/study.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import { getDueCards, applyReview, countDue } from './study'

const NOW = 1_700_000_000_000

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('study queue', () => {
  it('treats brand-new cards (dueDate 0) as due', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    expect(await countDue('d1', NOW)).toBe(1)
  })

  it('scopes by deck and supports "all"', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd2', front: 'Q', back: 'A' })
    expect(await countDue('d1', NOW)).toBe(1)
    expect(await countDue('all', NOW)).toBe(2)
  })

  it('excludes cards scheduled into the future after a review', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOW) // Good → 1 day out
    expect(await countDue('d1', NOW)).toBe(0)
    expect(await countDue('d1', NOW + 2 * 86_400_000)).toBe(1)
  })

  it('respects the limit', async () => {
    await createTextCard({ deckId: 'd1', front: 'A', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'B', back: 'B' })
    await createTextCard({ deckId: 'd1', front: 'C', back: 'C' })
    expect(await getDueCards('d1', NOW, 2)).toHaveLength(2)
  })
})

describe('applyReview', () => {
  it('updates SRS and writes a review log', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    const updated = await applyReview(card.id, 3, NOW)
    expect(updated.srs.status).toBe('review')
    expect(updated.srs.reps).toBe(1)
    const logs = await db.reviews.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ cardId: card.id, rating: 3, ts: NOW })
  })

  it('throws for an unknown card', async () => {
    await expect(applyReview('missing', 3, NOW)).rejects.toThrow(/not found/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- study`
Expected: FAIL — cannot resolve `./study`.

- [ ] **Step 3: Implement the study repository**

Create `src/db/study.ts`:
```ts
import { db } from './db'
import type { Card, ReviewLog } from './schema'
import { reviewCard, type Rating } from '../domain/srs'

async function cardsForScope(scope: string): Promise<Card[]> {
  if (scope === 'all') return db.cards.toArray()
  return db.cards.where('deckId').equals(scope).toArray()
}

export async function getDueCards(
  scope: string,
  now: number = Date.now(),
  limit = 100,
): Promise<Card[]> {
  const cards = await cardsForScope(scope)
  const due = cards.filter((c) => c.srs.dueDate <= now)
  // New cards last; otherwise soonest-due first.
  due.sort((a, b) => {
    const aNew = a.srs.status === 'new' ? 1 : 0
    const bNew = b.srs.status === 'new' ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    return a.srs.dueDate - b.srs.dueDate
  })
  return due.slice(0, limit)
}

export async function countDue(scope: string, now: number = Date.now()): Promise<number> {
  const cards = await cardsForScope(scope)
  return cards.filter((c) => c.srs.dueDate <= now).length
}

export async function applyReview(
  cardId: string,
  rating: Rating,
  now: number = Date.now(),
): Promise<Card> {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`Card not found: ${cardId}`)
    const after = reviewCard(card.srs, rating, now)
    const updated: Card = { ...card, srs: after }
    const log: ReviewLog = {
      id: crypto.randomUUID(),
      cardId,
      ts: now,
      rating,
      intervalBefore: card.srs.intervalDays,
      intervalAfter: after.intervalDays,
      ease: after.ease,
    }
    await db.cards.put(updated)
    await db.reviews.add(log)
    return updated
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- study`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add study queue and review logging (TDD)"
```

---

### Task 4: Progress/stats repository (TDD)

Counts that power the Progress page and deck cards.

**Files:**
- Create: `src/db/stats.ts`
- Test: `src/db/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/stats.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import { applyReview } from './study'
import { reviewsToday, studyStreak, deckProgress, startOfDay } from './stats'

const DAY = 86_400_000
const NOON = startOfDay(1_700_000_000_000) + 12 * 3_600_000

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('reviewsToday', () => {
  it('counts only reviews since local midnight', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - DAY) // yesterday
    await applyReview(card.id, 3, NOON)       // today
    expect(await reviewsToday(NOON)).toBe(1)
  })
})

describe('studyStreak', () => {
  it('counts consecutive days ending today', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - 2 * DAY)
    await applyReview(card.id, 3, NOON - DAY)
    await applyReview(card.id, 3, NOON)
    expect(await studyStreak(NOON)).toBe(3)
  })

  it('is zero when there is a gap before today', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await applyReview(card.id, 3, NOON - 3 * DAY)
    expect(await studyStreak(NOON)).toBe(0)
  })
})

describe('deckProgress', () => {
  it('reports total / new / due counts', async () => {
    const a = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'Q2', back: 'A2' })
    await applyReview(a.card.id, 3, NOON) // one card no longer new, due tomorrow
    const p = await deckProgress('d1', NOON)
    expect(p).toEqual({ total: 2, new: 1, due: 1 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Implement the stats repository**

Create `src/db/stats.ts`:
```ts
import { db } from './db'

const DAY_MS = 86_400_000

export interface DeckProgress {
  total: number
  new: number
  due: number
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export async function reviewsToday(now: number = Date.now()): Promise<number> {
  return db.reviews.where('ts').between(startOfDay(now), now, true, true).count()
}

export async function studyStreak(now: number = Date.now()): Promise<number> {
  const reviews = await db.reviews.orderBy('ts').toArray()
  if (reviews.length === 0) return 0
  const days = new Set(reviews.map((r) => startOfDay(r.ts)))
  let cursor = startOfDay(now)
  if (!days.has(cursor)) cursor -= DAY_MS // today not yet studied: try yesterday
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= DAY_MS
  }
  return streak
}

export async function deckProgress(deckId: string, now: number = Date.now()): Promise<DeckProgress> {
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  return {
    total: cards.length,
    new: cards.filter((c) => c.srs.status === 'new').length,
    due: cards.filter((c) => c.srs.dueDate <= now).length,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add progress/stats repository (TDD)"
```

---

### Task 5: Reusable UI primitives

Small shared components so pages stay focused. No tests (presentational).

**Files:**
- Create: `src/ui/Button.tsx`
- Create: `src/ui/Card.tsx`
- Create: `src/ui/EmptyState.tsx`

- [ ] **Step 1: Create the Button**

Create `src/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]',
  ghost: 'border border-[var(--color-border)] text-[var(--color-text)]',
  danger: 'border border-[var(--color-border)] text-red-500',
}

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  )
}
```

- [ ] **Step 2: Create the Card container**

Create `src/ui/Card.tsx`:
```tsx
import type { ReactNode } from 'react'

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${className}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create the EmptyState**

Create `src/ui/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react'

export default function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="text-center py-16">
      <p className="font-medium">{title}</p>
      {hint && <p className="text-[var(--color-muted)] text-sm mt-1">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Button, Card, and EmptyState UI primitives"
```

---

### Task 6: Deck CRUD UI (with component test)

The home page: list decks (with due/total counts), create, rename, delete, and open a deck.

**Files:**
- Create: `src/vitest.d.ts`
- Rewrite: `src/pages/DecksPage.tsx`
- Test: `src/pages/DecksPage.test.tsx`

- [ ] **Step 1: Make jest-dom matcher types available to the type-checker**

The component tests use matchers like `toBeInTheDocument()`. `npm run build` runs
`tsc -b` over `src/`, so these matchers must be typed or the build fails. Create
`src/vitest.d.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Write the failing component test**

Create `src/pages/DecksPage.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import DecksPage from './DecksPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DecksPage />
    </MemoryRouter>,
  )
}

describe('DecksPage', () => {
  it('creates a deck and shows it in the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText(/new deck name/i), 'Biology')
    await user.click(screen.getByRole('button', { name: /add deck/i }))
    expect(await screen.findByText('Biology')).toBeInTheDocument()
  })

  it('shows the empty state when there are no decks', async () => {
    renderPage()
    expect(await screen.findByText(/no decks yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- DecksPage`
Expected: FAIL — current stub has no inputs/buttons.

- [ ] **Step 4: Implement the page**

Rewrite `src/pages/DecksPage.tsx`:
```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDecks, createDeck, renameDeck, deleteDeck } from '../db/decks'
import { db } from '../db/db'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'

function useDeckCounts() {
  // Recompute counts whenever cards change.
  return useLiveQuery(async () => {
    const decks = await listDecks()
    const now = Date.now()
    const cards = await db.cards.toArray()
    return decks.map((deck) => {
      const mine = cards.filter((c) => c.deckId === deck.id)
      return {
        deck,
        total: mine.length,
        due: mine.filter((c) => c.srs.dueDate <= now).length,
      }
    })
  }, [])
}

export default function DecksPage() {
  const rows = useDeckCounts()
  const [name, setName] = useState('')

  async function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createDeck(trimmed)
    setName('')
  }

  async function rename(id: string, current: string) {
    const next = window.prompt('Rename deck', current)
    if (next && next.trim()) await renameDeck(id, next.trim())
  }

  async function remove(id: string, deckName: string) {
    if (window.confirm(`Delete "${deckName}" and all its cards?`)) await deleteDeck(id)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Decks</h1>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New deck name"
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <Button onClick={add}>Add deck</Button>
      </div>

      {rows && rows.length === 0 && (
        <EmptyState title="No decks yet." hint="Create your first deck above." />
      )}

      <div className="space-y-3">
        {rows?.map(({ deck, total, due }) => (
          <Card key={deck.id} className="flex items-center gap-3">
            <Link to={`/deck/${deck.id}`} className="flex-1">
              <div className="font-medium">{deck.name}</div>
              <div className="text-xs text-[var(--color-muted)]">
                {total} cards · {due} due
              </div>
            </Link>
            <Button variant="ghost" onClick={() => rename(deck.id, deck.name)}>Rename</Button>
            <Button variant="danger" onClick={() => remove(deck.id, deck.name)}>Delete</Button>
          </Card>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- DecksPage`
Expected: PASS (2 passing).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: deck CRUD UI with live counts (TDD)"
```

---

### Task 7: Card CRUD UI inside a deck

Open a deck: list its cards, add a text card, edit, delete, and start studying just this deck.

**Files:**
- Rewrite: `src/pages/DeckDetailPage.tsx`
- Create: `src/ui/CardEditor.tsx`

- [ ] **Step 1: Create the card editor form**

Create `src/ui/CardEditor.tsx`:
```tsx
import { useState } from 'react'
import Button from './Button'

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

  const field = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'

  return (
    <div className="space-y-2">
      <textarea aria-label="Front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" rows={2} className={field} />
      <textarea aria-label="Back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" rows={2} className={field} />
      <div className="flex gap-2">
        <Button onClick={submit}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the deck detail page**

Rewrite `src/pages/DeckDetailPage.tsx`:
```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { listCardsByDeck, createTextCard, updateTextCard, deleteCard } from '../db/cards'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import CardEditor from '../ui/CardEditor'

export default function DeckDetailPage() {
  const { id = '' } = useParams()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const rows = useLiveQuery(() => listCardsByDeck(id), [id])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-xs text-[var(--color-muted)]">← Decks</Link>
          <h1 className="text-xl font-semibold">{deck?.name ?? 'Deck'}</h1>
        </div>
        <Link to={`/study?deck=${id}`}>
          <Button>Study</Button>
        </Link>
      </div>

      {adding ? (
        <Card>
          <CardEditor
            submitLabel="Save card"
            onCancel={() => setAdding(false)}
            onSubmit={async (front, back) => {
              await createTextCard({ deckId: id, front, back })
              setAdding(false)
            }}
          />
        </Card>
      ) : (
        <Button variant="ghost" onClick={() => setAdding(true)}>+ Add card</Button>
      )}

      {rows && rows.length === 0 && !adding && (
        <EmptyState title="No cards yet." hint="Add your first card above." />
      )}

      <div className="space-y-3">
        {rows?.map(({ card, note }) =>
          editingId === note.id ? (
            <Card key={card.id}>
              <CardEditor
                initialFront={note.fields.Front}
                initialBack={note.fields.Back}
                submitLabel="Update"
                onCancel={() => setEditingId(null)}
                onSubmit={async (front, back) => {
                  await updateTextCard(note.id, front, back)
                  setEditingId(null)
                }}
              />
            </Card>
          ) : (
            <Card key={card.id} className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-medium">{note.fields.Front}</div>
                <div className="text-sm text-[var(--color-muted)]">{note.fields.Back}</div>
              </div>
              <Button variant="ghost" onClick={() => setEditingId(note.id)}>Edit</Button>
              <Button variant="danger" onClick={() => deleteCard(card.id)}>Delete</Button>
            </Card>
          ),
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify build + existing tests**

Run: `npx tsc -b && npm test`
Expected: compiles; all prior tests still pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: card CRUD UI with inline editor inside a deck"
```

---

### Task 8: Study screen (with component test)

The core loop: pick a scope (a deck via `?deck=`, else all decks), reveal each due card, rate it, and see a session summary.

**Files:**
- Rewrite: `src/pages/StudyPage.tsx`
- Test: `src/pages/StudyPage.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/pages/StudyPage.test.tsx`:
```tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import StudyPage from './StudyPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderStudy() {
  return render(
    <MemoryRouter initialEntries={['/study']}>
      <StudyPage />
    </MemoryRouter>,
  )
}

describe('StudyPage', () => {
  it('reveals the answer then accepts a rating and advances to done', async () => {
    const user = userEvent.setup()
    await createTextCard({ deckId: 'd1', front: 'Capital of France?', back: 'Paris' })
    renderStudy()

    expect(await screen.findByText('Capital of France?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('Paris')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /good/i }))

    expect(await screen.findByText(/all done/i)).toBeInTheDocument()
    expect(await db.reviews.count()).toBe(1)
  })

  it('shows the all-caught-up state when nothing is due', async () => {
    renderStudy()
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- StudyPage`
Expected: FAIL — current stub has no study flow.

- [ ] **Step 3: Implement the study screen**

Rewrite `src/pages/StudyPage.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getDueCards, applyReview } from '../db/study'
import type { Card } from '../db/schema'
import type { Rating } from '../domain/srs'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'

const RATINGS: { label: string; rating: Rating; variant: 'ghost' | 'primary' }[] = [
  { label: 'Again', rating: 1, variant: 'ghost' },
  { label: 'Hard', rating: 2, variant: 'ghost' },
  { label: 'Good', rating: 3, variant: 'primary' },
  { label: 'Easy', rating: 4, variant: 'ghost' },
]

export default function StudyPage() {
  const [params] = useSearchParams()
  const scope = params.get('deck') ?? 'all'

  const [queue, setQueue] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  // Load the queue once at session start (snapshot, so re-scheduled cards don't reappear).
  useEffect(() => {
    let active = true
    getDueCards(scope, Date.now(), 200).then((cards) => {
      if (active) setQueue(cards)
    })
    return () => { active = false }
  }, [scope])

  const current = queue?.[index]
  const note = useLiveQuery(
    () => (current ? db.notes.get(current.noteId) : undefined),
    [current?.noteId],
  )

  if (queue === null) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (queue.length === 0) {
    return <EmptyState title="Nothing due right now." hint="Come back later or add more cards." />
  }

  if (!current) {
    return (
      <EmptyState
        title="All done! 🎉"
        hint={`You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'} this session.`}
      />
    )
  }

  async function rate(rating: Rating) {
    if (!current) return
    await applyReview(current.id, rating)
    setRevealed(false)
    setReviewed((n) => n + 1)
    setIndex((i) => i + 1)
  }

  return (
    <section className="space-y-6">
      <div className="text-xs text-[var(--color-muted)] text-center">
        {index + 1} / {queue.length}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center min-h-40 flex items-center justify-center">
        <div>
          <div className="text-lg">{note?.fields.Front}</div>
          {revealed && (
            <>
              <hr className="my-4 border-[var(--color-border)]" />
              <div className="text-lg text-[var(--color-muted)]">{note?.fields.Back}</div>
            </>
          )}
        </div>
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <Button key={r.rating} variant={r.variant} onClick={() => rate(r.rating)}>
              {r.label}
            </Button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setRevealed(true)}>
          Show answer
        </Button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- StudyPage`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: study screen with reveal + SM-2 rating loop (TDD)"
```

---

### Task 9: Progress page

Surface the stats: reviews today, streak, total/due across all decks.

**Files:**
- Rewrite: `src/pages/StatsPage.tsx`

- [ ] **Step 1: Implement the page**

Rewrite `src/pages/StatsPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { reviewsToday, studyStreak } from '../db/stats'
import { countDue } from '../db/study'
import Card from '../ui/Card'

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-[var(--color-muted)] mt-1">{label}</div>
    </Card>
  )
}

export default function StatsPage() {
  const data = useLiveQuery(async () => {
    const now = Date.now()
    return {
      today: await reviewsToday(now),
      streak: await studyStreak(now),
      total: await db.cards.count(),
      due: await countDue('all', now),
    }
  }, [])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Progress</h1>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Reviewed today" value={data?.today ?? 0} />
        <Stat label="Day streak" value={data?.streak ?? 0} />
        <Stat label="Cards due" value={data?.due ?? 0} />
        <Stat label="Total cards" value={data?.total ?? 0} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify the full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; production build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: progress page with reviews/streak/due/total stats"
```

---

## Phase 2 Definition of Done
- SM-2 engine, cards/study/stats repositories all unit-tested and green.
- Decks: create, rename, delete, with live total/due counts on the home page.
- Cards: add, edit, delete text (Front/Back) cards inside a deck.
- Study: reveal → 4-button rating → SM-2 reschedules and logs the review; session
  summary on completion; scoped per-deck (`?deck=`) or all decks.
- Progress page shows reviews-today, day streak, due, and total counts.
- `npm test` and `npm run build` both pass.

Next: **Phase 3 — Media cards** (image/audio/video stored as IndexedDB blobs,
rendered in the editor and study screen). Its plan is written when Phase 2
completes.
