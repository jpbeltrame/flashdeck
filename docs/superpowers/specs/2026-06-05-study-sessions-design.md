# Study Sessions & Activity Heatmap — Design

**Date:** 2026-06-05
**Status:** Approved

## Goal

Replace the ad-hoc "load a queue of due cards" study flow with an explicit
**study session** concept:

- Starting a session serves a fixed-size set of cards (the *study session
  length*), composed from a configurable new/review ratio.
- A user may start any number of sessions per day, but only **one is active at a
  time**, and an active session is durable (survives reload) and resumable.
- Completion is tracked per deck and per day.
- The Progress page gains a GitHub-style **activity heatmap** aggregating all
  activity (cards reviewed and sessions completed) per day, with a metric filter.

This supersedes the per-day new-card budget added on 2026-06-05 (the
`newCardsPerDay` setting), whose job moves into session composition.

## Data model

### New table: `sessions` (Dexie v2)

Adding a table requires a Dexie version bump to `version(2)`. Existing
`cards`/`notes`/`reviews`/etc. stores are carried forward unchanged; no data
migration is needed.

```ts
export interface StudySession {
  id: string                 // crypto.randomUUID()
  deckId: string
  startedAt: number          // Date.now()
  completedAt?: number       // set when status -> 'completed'
  status: 'active' | 'completed' | 'abandoned'
  cardIds: string[]          // frozen study set, in order
  position: number           // index of the next card to rate (resume point)
  newCount: number           // composition snapshot at start (for stats)
  reviewCount: number
}
```

Store definition: `sessions: 'id, deckId, status, completedAt'`.

**Invariant:** at most one session with `status === 'active'` exists at any time.
Enforced in `src/db/sessions.ts` (not by a DB constraint).

**Completion per deck/day is derived** — query `status: 'completed'` sessions and
group by `startOfDay(completedAt)` and `deckId`. No separate daily-completion
table (rejected alternative: a `dailyCompletions` table — redundant, another
thing to keep consistent).

## Session composition (pure)

New module `src/domain/session.ts`, framework-free and unit-tested (TDD).

```ts
interface ComposeOptions { length: number; newRatio: number }
interface ComposedSession { cardIds: string[]; newCount: number; reviewCount: number }
function buildSessionCards(due: Card[], opts: ComposeOptions): ComposedSession
```

Algorithm, given the deck's due cards (`dueDate <= now`):

1. Split `due` into `newCards` (`status === 'new'`) and `reviewCards` (any other
   status). Sort review cards by `dueDate` ascending.
2. `targetNew = Math.round(length * newRatio)`, `targetReview = length - targetNew`.
3. Take `min(targetNew, newCards.length)` new and `min(targetReview,
   reviewCards.length)` review.
4. **Backfill:** if one pool came up short of its target, fill the remaining
   capacity (up to `length`) from the other pool.
   - Deck with no new cards left ⇒ all-review session.
   - Brand-new deck with no reviews ⇒ all-new session.
5. If fewer than `length` cards are due in total, the session is just what is
   available (may be empty).
6. **Order:** review cards first, then new cards (matches the current "new cards
   last" behaviour). Not interleaved — decided default.

`newCount` / `reviewCount` reflect the actually-selected composition.

## Session lifecycle (`src/db/sessions.ts`)

- `startSession(deckId, now?)` — fetches the deck's due cards, calls
  `buildSessionCards`, writes a new `active` session with `position: 0`. Throws if
  an active session already exists (callers check first).
- `getActiveSession()` — the single `active` session, or `undefined`.
- `getSession(id)` — by id.
- `advanceSession(id)` — increments `position`; when `position` reaches
  `cardIds.length`, transitions to `completed` (sets `completedAt`).
- `completeSession(id)` / `abandonSession(id)` — explicit status transitions.
- `completedSessionsByDay(now?, days?)` — completed sessions grouped by day, for
  stats/heatmap.

Reviews continue to be written to the `reviews` table via the existing
`applyReview` (with `statusBefore`), so streak and review counts keep working.

## Study flow (`src/pages/StudyPage.tsx`)

Scope is **per-deck only**: the route is `/study?deck=:id`. The old `?deck=all`
mode is removed; `DeckDetailPage`'s "Study" button is the entry point.

On mount for `deckId`:

1. `getActiveSession()`:
   - none ⇒ start a session for this deck.
   - active **for this deck** ⇒ resume it (load `cardIds`, jump to `position`).
   - active **for a different deck** ⇒ show a **resume-or-discard prompt**:
     *"You have an active session in **{deck name}**. Resume it, or discard it and
     start here?"* Resume navigates to that deck's session; discard abandons it
     and starts a fresh session here.
2. Render the card at `cardIds[position]`. Resume relies on the frozen `cardIds`
   plus `position`, so cards already rated earlier in the session stay out even
   though they were rescheduled (snapshot semantics, same as today's queue).
3. Each rating: `applyReview(cardId, rating)` then `advanceSession(id)`.
4. When the session completes, show the completion screen (reuses the existing
   "All done 🎉" state, with the session's card count).
5. An **Abandon** control abandons the active session and returns to the deck.

## Settings (`src/stores/settingsStore.ts` + `src/pages/SettingsPage.tsx`)

- Rename `newCardsPerDay` → **`sessionLength`** (default `20`). Migrate the
  localStorage key: on init, if the new key `flashdeck-session-length` is absent
  but the old `flashdeck-new-cards-per-day` exists, adopt the old value.
  Setting note: *"How many cards each study session serves up."*
- New **`newRatio`** (default `0.6`), localStorage key
  `flashdeck-new-ratio`, clamped to `[0, 1]`. Rendered as a "% new vs review"
  control. Note: *"Target mix of new vs review cards per session. Once a deck has
  no new cards left, sessions become all-review."*
- Remove the `getDueCards` per-day new-card budget and `countNewCardsToday`
  (superseded by session composition). Keep `statusBefore` on `ReviewLog` and on
  the Anki revlog mapping. `getDueCards(scope, now)` simplifies to "all due cards,
  reviews-by-due-date then new last"; it is the pool `startSession` composes from.

## Activity heatmap

### Aggregation (pure) — `src/domain/activity.ts`

```ts
interface ActivityDay { date: number; cards: number; sessions: number }
function buildActivityCalendar(
  reviewTs: number[],         // ts of each review
  sessionCompletedTs: number[], // completedAt of each completed session
  now: number,
  days = 371,                 // ~53 weeks, aligned to full weeks
): ActivityDay[]
```

Buckets each timestamp by `startOfDay`, returns one entry per day across the
window (zero-filled), oldest first, aligned so the grid starts on a week
boundary. Unit-tested (TDD).

### Component — `src/ui/ActivityHeatmap.tsx`

GitHub-style grid: weeks as columns, weekdays (Sun–Sat) as rows, colored squares
using Tailwind CSS-variable tokens. A **metric filter** segmented control —
*Cards · Sessions · Both* — selects the intensity value (`Both` = `cards +
sessions`). Intensity mapped to fixed buckets per metric. Hover tooltip shows the
date and both counts.

Embedded in `StatsPage` above the existing stat tiles. The page heading stays
"Progress".

## Testing (TDD)

- `src/domain/session.test.ts` — ratio split, backfill both directions,
  fewer-than-length pools, empty pool, ordering.
- `src/domain/activity.test.ts` — day bucketing, window range/zero-fill, the
  three metrics.
- `src/db/sessions.test.ts` — single-active enforcement, start/advance/complete,
  abandon, resume from `position`, derived completed-by-day.
- `src/stores/settingsStore.test.ts` — rename default, old-key migration,
  `newRatio` clamp.
- `src/pages/StudyPage.test.tsx` — start a session, resume prompt for a different
  deck, complete a session, abandon.

## Decided defaults (flagged, not asked again)

1. Within a session, review cards precede new cards (not interleaved).
2. Completion is derived from the `sessions` table, not a separate daily table.

## Out of scope

- All-decks ("study everything") sessions — per-deck only for now.
- Configurable per-deck session length / ratio (global settings only).
- Heatmap year navigation / multi-year history (single rolling ~53-week window).
