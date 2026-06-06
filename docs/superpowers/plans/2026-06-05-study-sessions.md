# Study Sessions & Activity Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc "load due cards" study flow with durable, resumable study sessions composed from a configurable new/review ratio, and add a GitHub-style activity heatmap to the Progress page.

**Architecture:** Pure session composition and activity aggregation live framework-free in `src/domain`. A new `sessions` IndexedDB table (Dexie v2) holds the single active session and completed history. `StudyPage` becomes a thin switch: no `?deck=` param → `StudyHome` (deck picker); with a deck → `SessionRunner` (the session lifecycle UI). Settings gain `sessionLength` + `newRatio`, replacing the per-day new-card budget.

**Tech Stack:** React + react-router (HashRouter), Zustand (settings, localStorage), Dexie/IndexedDB, Vitest + fake-indexeddb + @testing-library/react, Tailwind v4.

---

## File Structure

- Create `src/domain/session.ts` — pure `buildSessionCards(due, opts)`.
- Create `src/domain/session.test.ts`.
- Create `src/domain/activity.ts` — pure `buildActivityCalendar(...)`.
- Create `src/domain/activity.test.ts`.
- Create `src/db/sessions.ts` — session lifecycle + queries.
- Create `src/db/sessions.test.ts`.
- Create `src/ui/SessionRunner.tsx` — session study UI.
- Create `src/ui/SessionRunner.test.tsx`.
- Create `src/ui/StudyHome.tsx` — deck picker + resume banner.
- Create `src/ui/StudyHome.test.tsx`.
- Create `src/ui/ActivityHeatmap.tsx` — heatmap with metric filter.
- Create `src/ui/ActivityHeatmap.test.tsx`.
- Modify `src/db/schema.ts` — add `StudySession`, `SessionStatus`.
- Modify `src/db/db.ts` — Dexie `version(2)` + `sessions` table.
- Modify `src/db/study.ts` — simplify `getDueCards`, drop budget/`countNewCardsToday`.
- Modify `src/db/study.test.ts` — drop budget tests.
- Modify `src/stores/settingsStore.ts` — `sessionLength` + `newRatio` + key migration.
- Modify `src/stores/settingsStore.test.ts`.
- Modify `src/pages/SettingsPage.tsx` — two settings with notes.
- Modify `src/pages/StudyPage.tsx` — switch StudyHome vs SessionRunner.
- Modify `src/pages/StudyPage.test.tsx` — becomes the switch test (or delete; superseded).
- Modify `src/pages/StatsPage.tsx` — embed heatmap.
- Modify `src/pages/DeckDetailPage.tsx` — "sessions completed today" indicator.

Commit cadence: one commit per task. **Do not add a `Co-Authored-By` trailer** (project rule).

---

## Task 1: Session composition (pure)

**Files:**
- Create: `src/domain/session.ts`
- Test: `src/domain/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/session.test.ts
import { describe, expect, it } from 'vitest'
import type { Card } from '../db/schema'
import { buildSessionCards } from './session'

function card(id: string, status: Card['srs']['status'], dueDate = 0): Card {
  return {
    id, noteId: `n-${id}`, deckId: 'd1', templateIndex: 0,
    srs: { status, ease: 2.5, intervalDays: 0, dueDate, reps: 0, lapses: 0 },
  }
}

const news = (n: number) => Array.from({ length: n }, (_, i) => card(`new${i}`, 'new'))
const reviews = (n: number) =>
  Array.from({ length: n }, (_, i) => card(`rev${i}`, 'review', i + 1))

describe('buildSessionCards', () => {
  it('splits by ratio when both pools are plentiful', () => {
    const r = buildSessionCards([...news(20), ...reviews(20)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(6)
    expect(r.reviewCount).toBe(4)
    expect(r.cardIds).toHaveLength(10)
  })

  it('puts review cards before new cards, reviews sorted by dueDate', () => {
    const r = buildSessionCards([...news(2), ...reviews(2)], { length: 4, newRatio: 0.5 })
    expect(r.cardIds).toEqual(['rev0', 'rev1', 'new0', 'new1'])
  })

  it('backfills from reviews when new cards are short (finished deck → all review)', () => {
    const r = buildSessionCards([...news(1), ...reviews(20)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(1)
    expect(r.reviewCount).toBe(9)
    expect(r.cardIds).toHaveLength(10)
  })

  it('backfills from new cards when reviews are short (fresh deck → all new)', () => {
    const r = buildSessionCards([...news(20), ...reviews(1)], { length: 10, newRatio: 0.6 })
    expect(r.newCount).toBe(9)
    expect(r.reviewCount).toBe(1)
    expect(r.cardIds).toHaveLength(10)
  })

  it('returns only what is available when fewer than length are due', () => {
    const r = buildSessionCards([...news(2), ...reviews(1)], { length: 10, newRatio: 0.6 })
    expect(r.cardIds).toHaveLength(3)
    expect(r.newCount).toBe(2)
    expect(r.reviewCount).toBe(1)
  })

  it('handles an empty due list', () => {
    const r = buildSessionCards([], { length: 10, newRatio: 0.6 })
    expect(r).toEqual({ cardIds: [], newCount: 0, reviewCount: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/session.test.ts`
Expected: FAIL — `buildSessionCards` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/session.ts
import type { Card } from '../db/schema'

export interface ComposeOptions {
  length: number
  newRatio: number
}

export interface ComposedSession {
  cardIds: string[]
  newCount: number
  reviewCount: number
}

/** Pick and order a session's cards from the due pool, honouring the new/review ratio. */
export function buildSessionCards(due: Card[], opts: ComposeOptions): ComposedSession {
  const { length, newRatio } = opts
  const newCards = due.filter((c) => c.srs.status === 'new')
  const reviewCards = due
    .filter((c) => c.srs.status !== 'new')
    .sort((a, b) => a.srs.dueDate - b.srs.dueDate)

  const targetNew = Math.round(length * newRatio)
  const targetReview = length - targetNew

  let takeNew = Math.min(targetNew, newCards.length)
  let takeReview = Math.min(targetReview, reviewCards.length)

  // Backfill any leftover capacity from whichever pool still has cards.
  let remaining = length - takeNew - takeReview
  if (remaining > 0) {
    const moreReview = Math.min(remaining, reviewCards.length - takeReview)
    takeReview += moreReview
    remaining -= moreReview
    const moreNew = Math.min(remaining, newCards.length - takeNew)
    takeNew += moreNew
  }

  // Reviews first, then new (matches the app's "new cards last" convention).
  const cardIds = [
    ...reviewCards.slice(0, takeReview),
    ...newCards.slice(0, takeNew),
  ].map((c) => c.id)

  return { cardIds, newCount: takeNew, reviewCount: takeReview }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/session.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/session.ts src/domain/session.test.ts
git commit -m "feat: pure session composition with new/review ratio"
```

---

## Task 2: Activity calendar aggregation (pure)

**Files:**
- Create: `src/domain/activity.ts`
- Test: `src/domain/activity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/activity.test.ts
import { describe, expect, it } from 'vitest'
import { buildActivityCalendar } from './activity'

const DAY = 86_400_000
// A fixed local-noon "now" keeps day bucketing stable regardless of tz.
const NOW = new Date(2026, 5, 5, 12, 0, 0).getTime() // 2026-06-05 12:00 local

describe('buildActivityCalendar', () => {
  it('returns one entry per day in the window, oldest first', () => {
    const cal = buildActivityCalendar([], [], NOW, 7)
    expect(cal).toHaveLength(7)
    expect(cal[0].date).toBeLessThan(cal[6].date)
    expect(cal.every((d) => d.cards === 0 && d.sessions === 0)).toBe(true)
  })

  it('counts reviews and completed sessions on their local day', () => {
    const today = new Date(2026, 5, 5, 9, 0, 0).getTime()
    const yesterday = today - DAY
    const cal = buildActivityCalendar(
      [today, today, yesterday],          // 3 reviews
      [today],                            // 1 completed session
      NOW, 7,
    )
    const last = cal[cal.length - 1]
    const prev = cal[cal.length - 2]
    expect(last).toMatchObject({ cards: 2, sessions: 1 })
    expect(prev).toMatchObject({ cards: 1, sessions: 0 })
  })

  it('ignores timestamps older than the window', () => {
    const old = NOW - 10 * DAY
    const cal = buildActivityCalendar([old], [], NOW, 7)
    expect(cal.reduce((s, d) => s + d.cards, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/activity.test.ts`
Expected: FAIL — `buildActivityCalendar` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/activity.ts

export interface ActivityDay {
  date: number      // local start-of-day epoch ms
  cards: number     // reviews that day
  sessions: number  // sessions completed that day
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function tally(timestamps: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const t of timestamps) {
    const key = startOfDay(t)
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}

/**
 * Build a per-day activity series for the last `days` days ending today.
 * DST-safe: each day is derived with setDate rather than fixed-ms stepping.
 */
export function buildActivityCalendar(
  reviewTs: number[],
  sessionCompletedTs: number[],
  now: number,
  days = 371,
): ActivityDay[] {
  const cardsByDay = tally(reviewTs)
  const sessionsByDay = tally(sessionCompletedTs)
  const out: ActivityDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.getTime()
    out.push({ date: key, cards: cardsByDay.get(key) ?? 0, sessions: sessionsByDay.get(key) ?? 0 })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/activity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/activity.ts src/domain/activity.test.ts
git commit -m "feat: pure activity calendar aggregation"
```

---

## Task 3: Sessions table + lifecycle

**Files:**
- Modify: `src/db/schema.ts` (add interface)
- Modify: `src/db/db.ts:14-24` (Dexie v2)
- Create: `src/db/sessions.ts`
- Test: `src/db/sessions.test.ts`

- [ ] **Step 1: Add the schema type and table (no test yet — supporting change)**

In `src/db/schema.ts`, append:

```ts
export type SessionStatus = 'active' | 'completed' | 'abandoned'

export interface StudySession {
  id: string
  deckId: string
  startedAt: number
  completedAt?: number
  status: SessionStatus
  cardIds: string[]   // frozen study set, in order
  position: number    // index of the next card to rate
  newCount: number    // composition snapshot at start
  reviewCount: number
}
```

In `src/db/db.ts`, add the import and table field, then add a `version(2)` block. Replace the constructor body:

```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  Deck, Note, Card, MediaAsset, ReviewLog, Schedule, StudySession,
} from './schema'

export class FlashDeckDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  media!: EntityTable<MediaAsset, 'id'>
  reviews!: EntityTable<ReviewLog, 'id'>
  schedules!: EntityTable<Schedule, 'id'>
  sessions!: EntityTable<StudySession, 'id'>

  constructor() {
    super('flashdeck')
    this.version(1).stores({
      decks: 'id, parentId, updatedAt',
      notes: 'id, deckId, type',
      cards: 'id, noteId, deckId, srs.dueDate, srs.status',
      media: 'id, filename',
      reviews: 'id, cardId, ts',
      schedules: 'id, scope',
    })
    this.version(2).stores({
      sessions: 'id, deckId, status, completedAt',
    })
  }
}

export const db = new FlashDeckDB()
```

- [ ] **Step 2: Write the failing test**

```ts
// src/db/sessions.test.ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import {
  startSession, getActiveSession, getSession, advanceSession, abandonSession,
  completedSessionTimestamps, countDeckSessionsCompletedToday,
} from './sessions'

const NOW = new Date(2026, 5, 5, 9, 0, 0).getTime()
const OPTS = { length: 10, newRatio: 0.6 }

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seed(deckId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await createTextCard({ deckId, front: `${deckId}-${i}`, back: 'a' })
  }
}

describe('startSession', () => {
  it('creates an active session with a composed card set', async () => {
    await seed('d1', 3)
    const s = await startSession('d1', OPTS, NOW)
    expect(s.status).toBe('active')
    expect(s.cardIds).toHaveLength(3)
    expect(s.position).toBe(0)
    expect(await getActiveSession()).toMatchObject({ id: s.id })
  })

  it('refuses to start when a session is already active', async () => {
    await seed('d1', 3)
    await startSession('d1', OPTS, NOW)
    await expect(startSession('d2', OPTS, NOW)).rejects.toThrow(/active/i)
  })
})

describe('advanceSession', () => {
  it('advances position and completes at the end', async () => {
    await seed('d1', 2)
    const s = await startSession('d1', OPTS, NOW)
    const a1 = await advanceSession(s.id, NOW)
    expect(a1.position).toBe(1)
    expect(a1.status).toBe('active')
    const a2 = await advanceSession(s.id, NOW)
    expect(a2.position).toBe(2)
    expect(a2.status).toBe('completed')
    expect(a2.completedAt).toBe(NOW)
    // A completed session frees the active slot.
    expect(await getActiveSession()).toBeUndefined()
  })
})

describe('abandonSession', () => {
  it('marks abandoned and frees the active slot', async () => {
    await seed('d1', 2)
    const s = await startSession('d1', OPTS, NOW)
    await abandonSession(s.id)
    expect((await getSession(s.id))?.status).toBe('abandoned')
    expect(await getActiveSession()).toBeUndefined()
  })
})

describe('completion queries', () => {
  it('lists completed timestamps and counts deck completions today', async () => {
    await seed('d1', 1)
    const s = await startSession('d1', OPTS, NOW)
    await advanceSession(s.id, NOW) // completes (1 card)
    expect(await completedSessionTimestamps()).toEqual([NOW])
    expect(await countDeckSessionsCompletedToday('d1', NOW)).toBe(1)
    expect(await countDeckSessionsCompletedToday('d2', NOW)).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/sessions.test.ts`
Expected: FAIL — `src/db/sessions.ts` does not exist.

- [ ] **Step 4: Write the implementation**

```ts
// src/db/sessions.ts
import { db } from './db'
import type { StudySession } from './schema'
import { getDueCards } from './study'
import { buildSessionCards, type ComposeOptions } from '../domain/session'
import { startOfDay } from './stats'

export async function getActiveSession(): Promise<StudySession | undefined> {
  return db.sessions.where('status').equals('active').first()
}

export async function getSession(id: string): Promise<StudySession | undefined> {
  return db.sessions.get(id)
}

export async function startSession(
  deckId: string,
  opts: ComposeOptions,
  now: number = Date.now(),
): Promise<StudySession> {
  if (await getActiveSession()) throw new Error('A session is already active')
  const due = await getDueCards(deckId, now)
  const composed = buildSessionCards(due, opts)
  const session: StudySession = {
    id: crypto.randomUUID(),
    deckId,
    startedAt: now,
    status: 'active',
    cardIds: composed.cardIds,
    position: 0,
    newCount: composed.newCount,
    reviewCount: composed.reviewCount,
  }
  await db.sessions.add(session)
  return session
}

export async function advanceSession(
  id: string,
  now: number = Date.now(),
): Promise<StudySession> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id)
    if (!s) throw new Error(`Session not found: ${id}`)
    const position = s.position + 1
    const done = position >= s.cardIds.length
    const updated: StudySession = {
      ...s,
      position,
      status: done ? 'completed' : s.status,
      completedAt: done ? now : s.completedAt,
    }
    await db.sessions.put(updated)
    return updated
  })
}

export async function abandonSession(id: string): Promise<void> {
  await db.sessions.update(id, { status: 'abandoned' })
}

export async function completedSessionTimestamps(): Promise<number[]> {
  const sessions = await db.sessions.where('status').equals('completed').toArray()
  return sessions
    .map((s) => s.completedAt)
    .filter((t): t is number => typeof t === 'number')
}

export async function countDeckSessionsCompletedToday(
  deckId: string,
  now: number = Date.now(),
): Promise<number> {
  const dayStart = startOfDay(now)
  const sessions = await db.sessions.where('deckId').equals(deckId).toArray()
  return sessions.filter(
    (s) => s.status === 'completed' && s.completedAt != null && s.completedAt >= dayStart,
  ).length
}
```

Note: `startOfDay` is already exported from `src/db/stats.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/db/sessions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/db.ts src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat: study session table and lifecycle (Dexie v2)"
```

---

## Task 4: Rename setting to sessionLength + add newRatio

This task renames the store and updates **all** current consumers in one commit so the build stays green. `StudyPage` is temporarily reverted to a settings-free queue load (it is fully rewritten in Task 5).

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/stores/settingsStore.test.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/StudyPage.tsx`

- [ ] **Step 1: Write the failing store test**

Replace the entire contents of `src/stores/settingsStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useSettingsStore, DEFAULT_SESSION_LENGTH, DEFAULT_NEW_RATIO,
} from './settingsStore'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({
    sessionLength: DEFAULT_SESSION_LENGTH,
    newRatio: DEFAULT_NEW_RATIO,
  })
})

afterEach(() => {
  vi.resetModules()
})

describe('settingsStore', () => {
  it('defaults sessionLength to 20 and newRatio to 0.6', () => {
    expect(DEFAULT_SESSION_LENGTH).toBe(20)
    expect(DEFAULT_NEW_RATIO).toBe(0.6)
  })

  it('migrates the legacy new-cards-per-day key on init', async () => {
    localStorage.setItem('flashdeck-new-cards-per-day', '8')
    vi.resetModules()
    const fresh = await import('./settingsStore')
    expect(fresh.useSettingsStore.getState().sessionLength).toBe(8)
  })

  it('loads the default sessionLength from empty storage', async () => {
    localStorage.clear()
    vi.resetModules()
    const fresh = await import('./settingsStore')
    expect(fresh.useSettingsStore.getState().sessionLength).toBe(20)
  })

  it('persists and clamps sessionLength to a >=1 integer', () => {
    useSettingsStore.getState().setSessionLength(4.9)
    expect(useSettingsStore.getState().sessionLength).toBe(4)
    useSettingsStore.getState().setSessionLength(0)
    expect(useSettingsStore.getState().sessionLength).toBe(1)
    expect(localStorage.getItem('flashdeck-session-length')).toBe('1')
  })

  it('persists and clamps newRatio to [0,1]', () => {
    useSettingsStore.getState().setNewRatio(1.5)
    expect(useSettingsStore.getState().newRatio).toBe(1)
    useSettingsStore.getState().setNewRatio(-0.2)
    expect(useSettingsStore.getState().newRatio).toBe(0)
    expect(localStorage.getItem('flashdeck-new-ratio')).toBe('0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/settingsStore.test.ts`
Expected: FAIL — `DEFAULT_SESSION_LENGTH` / `sessionLength` not exported.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `src/stores/settingsStore.ts`:

```ts
import { create } from 'zustand'

export const DEFAULT_SESSION_LENGTH = 20
export const DEFAULT_NEW_RATIO = 0.6

const LENGTH_KEY = 'flashdeck-session-length'
const LEGACY_LENGTH_KEY = 'flashdeck-new-cards-per-day'
const RATIO_KEY = 'flashdeck-new-ratio'

function initialSessionLength(): number {
  const raw = localStorage.getItem(LENGTH_KEY) ?? localStorage.getItem(LEGACY_LENGTH_KEY)
  if (raw === null) return DEFAULT_SESSION_LENGTH
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_SESSION_LENGTH
}

function initialNewRatio(): number {
  const raw = localStorage.getItem(RATIO_KEY)
  if (raw === null) return DEFAULT_NEW_RATIO
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_NEW_RATIO
}

interface SettingsState {
  /** How many cards a study session serves up. */
  sessionLength: number
  /** Target fraction of new cards per session, 0..1. */
  newRatio: number
  setSessionLength: (n: number) => void
  setNewRatio: (r: number) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  sessionLength: initialSessionLength(),
  newRatio: initialNewRatio(),
  setSessionLength: (n) => {
    const clamped = Math.max(1, Math.floor(Number.isFinite(n) ? n : DEFAULT_SESSION_LENGTH))
    localStorage.setItem(LENGTH_KEY, String(clamped))
    set({ sessionLength: clamped })
  },
  setNewRatio: (r) => {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(r) ? r : DEFAULT_NEW_RATIO))
    localStorage.setItem(RATIO_KEY, String(clamped))
    set({ newRatio: clamped })
  },
}))
```

- [ ] **Step 4: Update SettingsPage to the new UI**

Replace the entire contents of `src/pages/SettingsPage.tsx`:

```tsx
import { useSettingsStore } from '../stores/settingsStore'

const fieldClass =
  'w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'

export default function SettingsPage() {
  const sessionLength = useSettingsStore((s) => s.sessionLength)
  const newRatio = useSettingsStore((s) => s.newRatio)
  const setSessionLength = useSettingsStore((s) => s.setSessionLength)
  const setNewRatio = useSettingsStore((s) => s.setNewRatio)

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-[var(--color-muted)] mt-1">App settings.</p>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Study
      </h2>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Study session length</span>
        <input
          type="number"
          min={1}
          step={1}
          value={sessionLength}
          onChange={(e) => setSessionLength(e.target.valueAsNumber)}
          className={fieldClass}
        />
        <span className="block text-xs text-[var(--color-muted)]">
          How many cards each study session serves up.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">New cards: {Math.round(newRatio * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(newRatio * 100)}
          onChange={(e) => setNewRatio(e.target.valueAsNumber / 100)}
          className="w-full"
        />
        <span className="block text-xs text-[var(--color-muted)]">
          Target mix of new vs review cards per session. Once a deck has no new cards
          left, sessions become all-review.
        </span>
      </label>
    </section>
  )
}
```

- [ ] **Step 5: Decouple StudyPage from the old setting (temporary)**

Replace lines that read the setting in `src/pages/StudyPage.tsx`. Remove the settings import and the `newCardsPerDay` usage; load the queue with no options. Apply these three edits:

Remove this import line:
```tsx
import { useSettingsStore } from '../stores/settingsStore'
```
Remove this line:
```tsx
  const newCardsPerDay = useSettingsStore((s) => s.newCardsPerDay)
```
Change the effect body from:
```tsx
    getDueCards(scope, Date.now(), { newCardsPerDay }).then((cards) => {
      if (active) setQueue(cards)
    })
    return () => { active = false }
  }, [scope, newCardsPerDay])
```
to:
```tsx
    getDueCards(scope, Date.now()).then((cards) => {
      if (active) setQueue(cards)
    })
    return () => { active = false }
  }, [scope])
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/stores/settingsStore.test.ts && npx tsc -b`
Expected: store tests PASS; `tsc` clean (note: `getDueCards` still accepts the optional 3rd arg, so calling it with two args is valid).

- [ ] **Step 7: Commit**

```bash
git add src/stores/settingsStore.ts src/stores/settingsStore.test.ts src/pages/SettingsPage.tsx src/pages/StudyPage.tsx
git commit -m "feat: rename setting to sessionLength, add newRatio (with legacy migration)"
```

---

## Task 5: Study UI — StudyHome + SessionRunner

Splits `StudyPage` into a deck picker (`/study`) and the session runner (`/study?deck=:id`).

**Files:**
- Create: `src/ui/StudyHome.tsx`
- Create: `src/ui/StudyHome.test.tsx`
- Create: `src/ui/SessionRunner.tsx`
- Create: `src/ui/SessionRunner.test.tsx`
- Modify: `src/pages/StudyPage.tsx` (becomes a switch)
- Delete: `src/pages/StudyPage.test.tsx` (superseded by the two new tests)

- [ ] **Step 1: Write the failing SessionRunner test**

```tsx
// src/ui/SessionRunner.test.tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import { startSession } from '../db/sessions'
import SessionRunner from './SessionRunner'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderRunner(deckId: string) {
  return render(
    <MemoryRouter initialEntries={[`/study?deck=${deckId}`]}>
      <SessionRunner deckId={deckId} />
    </MemoryRouter>,
  )
}

describe('SessionRunner', () => {
  it('starts a session, reveals, rates, and completes', async () => {
    const user = userEvent.setup()
    await createTextCard({ deckId: 'd1', front: 'Capital of France?', back: 'Paris' })
    renderRunner('d1')

    expect(await screen.findByText('Capital of France?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('Paris')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /good/i }))

    expect(await screen.findByText(/session complete/i)).toBeInTheDocument()
    expect(await db.reviews.count()).toBe(1)
  })

  it('shows nothing-due when the deck has no due cards', async () => {
    await db.decks.add({ id: 'd1', name: 'Empty', createdAt: 0, updatedAt: 0 })
    renderRunner('d1')
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })

  it('prompts to resume or discard when another deck has an active session', async () => {
    await db.decks.add({ id: 'd2', name: 'Other Deck', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd2', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'Q1', back: 'A1' })
    await startSession('d2', { length: 10, newRatio: 0.6 })

    renderRunner('d1')
    expect(await screen.findByText(/Other Deck/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/SessionRunner.test.tsx`
Expected: FAIL — `./SessionRunner` does not exist.

- [ ] **Step 3: Implement SessionRunner**

```tsx
// src/ui/SessionRunner.tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { applyReview } from '../db/study'
import {
  getActiveSession, startSession, advanceSession, abandonSession,
} from '../db/sessions'
import { useSettingsStore } from '../stores/settingsStore'
import type { StudySession } from '../db/schema'
import type { Rating } from '../domain/srs'
import Button from './Button'
import EmptyState from './EmptyState'
import RenderedField from './RenderedField'
import CardFrame from './CardFrame'

const RATINGS: { label: string; rating: Rating; variant: 'ghost' | 'primary' }[] = [
  { label: 'Again', rating: 1, variant: 'ghost' },
  { label: 'Hard', rating: 2, variant: 'ghost' },
  { label: 'Good', rating: 3, variant: 'primary' },
  { label: 'Easy', rating: 4, variant: 'ghost' },
]

export default function SessionRunner({ deckId }: { deckId: string }) {
  const navigate = useNavigate()
  const sessionLength = useSettingsStore((s) => s.sessionLength)
  const newRatio = useSettingsStore((s) => s.newRatio)

  const [session, setSession] = useState<StudySession | null>(null)
  const [conflict, setConflict] = useState<StudySession | null>(null)
  const [revealed, setRevealed] = useState(false)
  const initFor = useRef<string | null>(null)

  useEffect(() => {
    if (initFor.current === deckId) return
    initFor.current = deckId
    let cancelled = false
    ;(async () => {
      const active = await getActiveSession()
      if (cancelled) return
      if (active && active.deckId !== deckId) {
        setConflict(active)
        return
      }
      if (active) {
        setSession(active)
        return
      }
      try {
        const started = await startSession(deckId, { length: sessionLength, newRatio })
        if (!cancelled) setSession(started)
      } catch {
        // Race (e.g. StrictMode double-invoke): adopt whatever became active.
        const now = await getActiveSession()
        if (cancelled || !now) return
        if (now.deckId === deckId) setSession(now)
        else setConflict(now)
      }
    })()
    return () => { cancelled = true }
  }, [deckId, sessionLength, newRatio])

  const conflictDeck = useLiveQuery(
    () => (conflict ? db.decks.get(conflict.deckId) : undefined),
    [conflict?.deckId],
  )

  const cardId =
    session && session.position < session.cardIds.length
      ? session.cardIds[session.position]
      : undefined
  const card = useLiveQuery(() => (cardId ? db.cards.get(cardId) : undefined), [cardId])
  const note = useLiveQuery(
    () => (card ? db.notes.get(card.noteId) : undefined),
    [card?.noteId],
  )

  if (conflict) {
    return (
      <div className="space-y-5 py-10 text-center">
        <p className="text-[var(--color-muted)]">
          You have an active session in{' '}
          <span className="font-medium text-[var(--color-text)]">
            {conflictDeck?.name ?? 'another deck'}
          </span>.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => navigate(`/study?deck=${conflict.deckId}`)}>Resume it</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await abandonSession(conflict.id)
              const started = await startSession(deckId, { length: sessionLength, newRatio })
              setConflict(null)
              setSession(started)
            }}
          >
            Discard &amp; start here
          </Button>
        </div>
      </div>
    )
  }

  if (!session) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (session.cardIds.length === 0) {
    return <EmptyState title="Nothing due right now." hint="Come back later or add more cards." />
  }

  if (session.position >= session.cardIds.length) {
    return (
      <EmptyState
        title="Session complete! 🎉"
        hint={`You studied ${session.cardIds.length} card${session.cardIds.length === 1 ? '' : 's'}.`}
      />
    )
  }

  async function rate(rating: Rating) {
    if (!session || !cardId) return
    await applyReview(cardId, rating)
    const updated = await advanceSession(session.id)
    setRevealed(false)
    setSession(updated)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>{session.position + 1} / {session.cardIds.length}</span>
        <button
          className="underline"
          onClick={async () => { await abandonSession(session.id); navigate(`/deck/${deckId}`) }}
        >
          Abandon
        </button>
      </div>

      <div
        className={
          note?.format === 'html'
            ? 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden min-h-40 flex items-center justify-center'
            : 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center min-h-40 flex items-center justify-center'
        }
      >
        {note?.format === 'html' ? (
          <div className="w-full">
            <CardFrame html={revealed ? note.fields.Back : note.fields.Front} css={note.css} seedKey={cardId} />
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

- [ ] **Step 4: Run the SessionRunner test**

Run: `npx vitest run src/ui/SessionRunner.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing StudyHome test**

```tsx
// src/ui/StudyHome.test.tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import { startSession } from '../db/sessions'
import StudyHome from './StudyHome'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderHome() {
  return render(<MemoryRouter><StudyHome /></MemoryRouter>)
}

describe('StudyHome', () => {
  it('lists decks with their due counts', async () => {
    await db.decks.add({ id: 'd1', name: 'Biology', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    renderHome()
    expect(await screen.findByText('Biology')).toBeInTheDocument()
    expect(screen.getByText(/1 due/)).toBeInTheDocument()
  })

  it('shows a resume banner when a session is active', async () => {
    await db.decks.add({ id: 'd1', name: 'Biology', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await startSession('d1', { length: 10, newRatio: 0.6 })
    renderHome()
    expect(await screen.findByText(/resume active session/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/ui/StudyHome.test.tsx`
Expected: FAIL — `./StudyHome` does not exist.

- [ ] **Step 7: Implement StudyHome**

```tsx
// src/ui/StudyHome.tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDecks } from '../db/decks'
import { db } from '../db/db'
import { getActiveSession } from '../db/sessions'
import Card from './Card'
import EmptyState from './EmptyState'

export default function StudyHome() {
  const data = useLiveQuery(async () => {
    const decks = await listDecks()
    const now = Date.now()
    const cards = await db.cards.toArray()
    const active = await getActiveSession()
    return {
      active,
      decks: decks.map((deck) => ({
        deck,
        due: cards.filter((c) => c.deckId === deck.id && c.srs.dueDate <= now).length,
      })),
    }
  }, [])

  if (!data) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (data.decks.length === 0) {
    return <EmptyState title="No decks to study." hint="Create or import a deck first." />
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Study</h1>

      {data.active && (
        <Link to={`/study?deck=${data.active.deckId}`} className="block">
          <Card className="flex items-center justify-between border-[var(--color-accent)]">
            <span className="font-medium text-[var(--color-accent)]">Resume active session</span>
            <span className="text-xs text-[var(--color-muted)]">
              {data.active.position}/{data.active.cardIds.length}
            </span>
          </Card>
        </Link>
      )}

      <div className="space-y-3">
        {data.decks.map(({ deck, due }) => (
          <Link key={deck.id} to={`/study?deck=${deck.id}`} className="block">
            <Card className="flex items-center justify-between">
              <span className="font-medium">{deck.name}</span>
              <span className="text-xs text-[var(--color-muted)]">{due} due</span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Run the StudyHome test**

Run: `npx vitest run src/ui/StudyHome.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Turn StudyPage into a switch and delete its old test**

Replace the entire contents of `src/pages/StudyPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom'
import StudyHome from '../ui/StudyHome'
import SessionRunner from '../ui/SessionRunner'

export default function StudyPage() {
  const [params] = useSearchParams()
  const deck = params.get('deck')
  return deck ? <SessionRunner deckId={deck} /> : <StudyHome />
}
```

Then delete the superseded test:

```bash
git rm src/pages/StudyPage.test.tsx
```

- [ ] **Step 10: Run the full suite + typecheck**

Run: `npm test && npx tsc -b`
Expected: all PASS, `tsc` clean.

- [ ] **Step 11: Commit**

```bash
git add src/ui/StudyHome.tsx src/ui/StudyHome.test.tsx src/ui/SessionRunner.tsx src/ui/SessionRunner.test.tsx src/pages/StudyPage.tsx
git commit -m "feat: session-based study flow (StudyHome + SessionRunner)"
```

---

## Task 6: Simplify getDueCards

Now the only caller of `getDueCards` is `src/db/sessions.ts` (with `(deckId, now)`), so the per-day new-card budget can be removed.

**Files:**
- Modify: `src/db/study.ts`
- Modify: `src/db/study.test.ts`

- [ ] **Step 1: Rewrite the study queue test**

Replace the `study queue` describe block in `src/db/study.test.ts` and the import line.

Change the import line:
```ts
import { getDueCards, applyReview, countDue } from './study'
```
(remove `countNewCardsToday`).

Replace the entire `describe('study queue', ...)` block with:

```ts
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
    await applyReview(card.id, 3, NOW)
    expect(await countDue('d1', NOW)).toBe(0)
    expect(await countDue('d1', NOW + 2 * 86_400_000)).toBe(1)
  })

  it('returns due cards with review cards before new cards', async () => {
    const a = await createTextCard({ deckId: 'd1', front: 'A', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'B', back: 'B' }) // stays new
    await applyReview(a.card.id, 1, NOW) // Again → relearning, due ~now
    const due = await getDueCards('d1', NOW)
    expect(due).toHaveLength(2)
    expect(due[0].srs.status).not.toBe('new')
    expect(due[1].srs.status).toBe('new')
  })
})

describe('countNewCardsToday removed', () => {
  it('is no longer part of the study module', async () => {
    const mod = await import('./study')
    expect('countNewCardsToday' in mod).toBe(false)
  })
})
```

Keep the existing `describe('applyReview', ...)` block (with the `statusBefore: 'new'` assertion) unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/study.test.ts`
Expected: FAIL — the `Again → relearning` ordering test still works under the old impl, but `countNewCardsToday removed` FAILS because the function still exists.

- [ ] **Step 3: Simplify the implementation**

In `src/db/study.ts`, remove `QueueOptions`, `startOfLocalDay`, `countNewCardsToday`, and replace `getDueCards` so the file reads:

```ts
import { db } from './db'
import type { Card, ReviewLog } from './schema'
import { reviewCard, type Rating } from '../domain/srs'

async function cardsForScope(scope: string): Promise<Card[]> {
  if (scope === 'all') return db.cards.toArray()
  return db.cards.where('deckId').equals(scope).toArray()
}

export async function getDueCards(scope: string, now: number = Date.now()): Promise<Card[]> {
  const cards = await cardsForScope(scope)
  const due = cards.filter((c) => c.srs.dueDate <= now)
  // New cards last; otherwise soonest-due first.
  due.sort((a, b) => {
    const aNew = a.srs.status === 'new' ? 1 : 0
    const bNew = b.srs.status === 'new' ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    return a.srs.dueDate - b.srs.dueDate
  })
  return due
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
      statusBefore: card.srs.status,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/study.test.ts src/db/sessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/study.ts src/db/study.test.ts
git commit -m "refactor: drop per-day new-card budget from getDueCards"
```

---

## Task 7: Deck detail — completed-today indicator

**Files:**
- Modify: `src/pages/DeckDetailPage.tsx`

This is a small presentational addition; verified via the full build/test rather than a dedicated brittle DOM test.

- [ ] **Step 1: Add the indicator**

In `src/pages/DeckDetailPage.tsx`, add the import:

```tsx
import { countDeckSessionsCompletedToday } from '../db/sessions'
```

Add a live query near the existing ones (after the `rows` query, around line 17):

```tsx
  const doneToday = useLiveQuery(() => countDeckSessionsCompletedToday(id), [id])
```

In the header block, under the deck title (`<h1>`), add:

```tsx
          {doneToday ? (
            <p className="text-xs text-[var(--color-muted)]">
              {doneToday} session{doneToday === 1 ? '' : 's'} completed today
            </p>
          ) : null}
```

- [ ] **Step 2: Typecheck + full tests**

Run: `npx tsc -b && npm test`
Expected: clean + all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DeckDetailPage.tsx
git commit -m "feat: show sessions completed today on deck detail"
```

---

## Task 8: Activity heatmap component

**Files:**
- Create: `src/ui/ActivityHeatmap.tsx`
- Test: `src/ui/ActivityHeatmap.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ActivityHeatmap.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActivityDay } from '../domain/activity'
import ActivityHeatmap from './ActivityHeatmap'

function days(n: number): ActivityDay[] {
  const base = new Date(2026, 0, 1).getTime()
  return Array.from({ length: n }, (_, i) => ({
    date: base + i * 86_400_000,
    cards: i,
    sessions: i % 2,
  }))
}

describe('ActivityHeatmap', () => {
  it('renders a cell per day with a count tooltip', () => {
    render(<ActivityHeatmap days={days(7)} />)
    // Each day cell exposes its counts via title.
    expect(screen.getAllByTitle(/cards/).length).toBe(7)
  })

  it('exposes Cards / Sessions / Both metric filters', async () => {
    const user = userEvent.setup()
    render(<ActivityHeatmap days={days(7)} />)
    expect(screen.getByRole('button', { name: /^cards$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sessions$/i })).toBeInTheDocument()
    const both = screen.getByRole('button', { name: /^both$/i })
    await user.click(both)
    expect(both).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ActivityHeatmap.test.tsx`
Expected: FAIL — `./ActivityHeatmap` does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// src/ui/ActivityHeatmap.tsx
import { useState } from 'react'
import type { ActivityDay } from '../domain/activity'

type Metric = 'cards' | 'sessions' | 'both'

const LEVEL_CLASS = [
  'bg-[var(--color-border)]',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-400 dark:bg-emerald-600',
  'bg-emerald-500 dark:bg-emerald-400',
]

// Per-metric bucket thresholds (value >= threshold ⇒ that level).
const THRESHOLDS: Record<Metric, number[]> = {
  cards: [1, 4, 8, 15],
  sessions: [1, 2, 3, 4],
  both: [1, 4, 8, 15],
}

function valueFor(d: ActivityDay, metric: Metric): number {
  if (metric === 'cards') return d.cards
  if (metric === 'sessions') return d.sessions
  return d.cards + d.sessions
}

function levelOf(value: number, metric: Metric): number {
  const t = THRESHOLDS[metric]
  let level = 0
  for (let i = 0; i < t.length; i++) if (value >= t[i]) level = i + 1
  return level
}

function dayLabel(date: number): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const METRICS: { key: Metric; label: string }[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'both', label: 'Both' },
]

export default function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const [metric, setMetric] = useState<Metric>('both')

  // Pad the start so the first column begins on the correct weekday row (0=Sun).
  const lead = days.length > 0 ? new Date(days[0].date).getDay() : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="flex gap-1 rounded-full border border-[var(--color-border)] p-0.5 text-xs">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={`rounded-full px-2 py-0.5 ${
                metric === key
                  ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1 w-max">
          {Array.from({ length: lead }, (_, i) => (
            <div key={`pad-${i}`} className="h-3 w-3" />
          ))}
          {days.map((d) => {
            const v = valueFor(d, metric)
            return (
              <div
                key={d.date}
                title={`${dayLabel(d.date)}: ${d.cards} cards, ${d.sessions} sessions`}
                className={`h-3 w-3 rounded-sm ${LEVEL_CLASS[levelOf(v, metric)]}`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ActivityHeatmap.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ActivityHeatmap.tsx src/ui/ActivityHeatmap.test.tsx
git commit -m "feat: GitHub-style activity heatmap with metric filter"
```

---

## Task 9: Embed the heatmap in the Progress page

**Files:**
- Modify: `src/pages/StatsPage.tsx`

- [ ] **Step 1: Wire the heatmap into StatsPage**

Replace the entire contents of `src/pages/StatsPage.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { reviewsToday, studyStreak } from '../db/stats'
import { countDue } from '../db/study'
import { completedSessionTimestamps } from '../db/sessions'
import { buildActivityCalendar } from '../domain/activity'
import Card from '../ui/Card'
import ActivityHeatmap from '../ui/ActivityHeatmap'

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
    const reviews = await db.reviews.toArray()
    const sessions = await completedSessionTimestamps()
    return {
      today: await reviewsToday(now),
      streak: await studyStreak(now),
      total: await db.cards.count(),
      due: await countDue('all', now),
      calendar: buildActivityCalendar(reviews.map((r) => r.ts), sessions, now),
    }
  }, [])

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Progress</h1>

      {data && (
        <Card>
          <ActivityHeatmap days={data.calendar} />
        </Card>
      )}

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

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all tests PASS; lint shows only the pre-existing errors in `anki-sqlite.ts`, `DeckDetailPage.tsx` (note: confirm your DeckDetailPage edit introduced no new lint errors), `CardFrame.tsx`, `RenderedField.tsx`; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/StatsPage.tsx
git commit -m "feat: activity heatmap on the Progress page"
```

---

## Final Verification

- [ ] Run `npm test` — all green.
- [ ] Run `npm run build` — succeeds (PWA + base path).
- [ ] Manual smoke (optional, `npm run dev`): create a deck with cards → Study tab lists it → start a session → rate through → "Session complete" → Progress page heatmap shows today's activity. Start a session, navigate to another deck's study → resume/discard prompt appears.

---

## Notes for the implementer

- **Day boundaries** use local midnight via `startOfDay` (already in `src/db/stats.ts`) and `setHours(0,0,0,0)`. Tests pin `NOW` to a local time-of-day to stay tz-stable.
- **Single-active invariant** is enforced in `startSession` (throws). `SessionRunner` catches that throw to recover from React StrictMode double-invocation.
- **Snapshot semantics:** a session stores a frozen `cardIds` + `position`. Resuming continues from `position`; already-rated cards do not reappear even though they were rescheduled.
- **No `Co-Authored-By` trailer** on commits (project rule in memory).
- Pre-existing lint errors in `anki-sqlite.ts`, `DeckDetailPage.tsx`, `CardFrame.tsx`, `RenderedField.tsx` are out of scope — do not let them block, but do not add new ones.
```
