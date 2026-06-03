# FlashDeck — Design Spec

**Date:** 2026-06-03
**Status:** Approved (design); pending implementation plan

A mobile-first, offline-first Progressive Web App for spaced-repetition flash-card
study. No backend — all data lives on-device. Deployed as a static site to GitHub
Pages. Opens and plays Anki `.apkg` decks and exports back to Anki format.

---

## 1. Goals & non-goals

### Goals
- CRUD decks and flash cards.
- Cards support text, image, audio, and video content.
- Open and play Anki `.apkg` files (Basic + Cloze note types, with media and
  imported review history).
- Export a deck back to `.apkg`; export progress and schedule.
- Track study progress with a spaced-repetition algorithm (SM-2).
- Set up study schedules per deck or combined (times/day, days of week) with
  in-app reminders.
- Light and dark mode.
- Calm, focused, education-oriented design that does not disrupt the student.

### Non-goals (explicitly out of scope)
- Any backend / server / account system.
- Reliable OS-level background push notifications (not achievable without a push
  server, especially on iOS). Replaced by in-app reminders + `.ics` calendar
  export.
- Full Anki fidelity: card-side JavaScript, exotic add-on note types, and custom
  template scripting are not reproduced. Such decks import on a best-effort basis
  and the user is warned.
- FSRS scheduling (SM-2 is used instead).

---

## 2. Decisions (resolved during brainstorming)

| Topic | Decision |
|---|---|
| Notifications | **In-app reminders only** (banner + due badge + best-effort Web Notification when app/SW alive). `.ics` export provides reliable OS reminders. |
| SRS algorithm | **SM-2 (Anki-classic)** |
| Anki fidelity | **Basic + Cloze note types, media, and imported review history.** Advanced JS/add-on note types out of scope. |
| Visual direction | **"Focus Mono"** — near-monochrome neutrals + single indigo accent, crisp sans, generous whitespace, calm motion. |

---

## 3. Tech stack & architecture

| Concern | Choice | Rationale |
|---|---|---|
| Build / SPA | Vite + React + TypeScript | Fast, standard, strong PWA tooling |
| PWA | vite-plugin-pwa (Workbox) | Precache app shell, offline-first, install prompt |
| Routing | React Router (HashRouter) | Avoids GitHub Pages deep-link 404s on static hosting |
| Styling | Tailwind CSS + CSS-variable tokens | Consistent design system, class-based dark mode |
| State | Zustand + Dexie live queries | Lightweight, reactive to DB changes |
| Storage | IndexedDB via Dexie | Only viable store for blobs + structured data. localStorage used only for the theme flag. |
| Anki parse | fflate (unzip) + sql.js (SQLite WASM) | Read `.apkg` → `collection.anki2` + media |
| Anki export | sql.js + fflate | Build a valid `.apkg` |
| Sanitization | DOMPurify | Render imported HTML/templates safely |
| Tests | Vitest + React Testing Library | TDD on the pure-logic core |

**Layering:** UI components → Zustand stores → repositories → Dexie (DB). Domain
logic (SM-2, scheduler, Anki import/export, cloze rendering) lives in pure,
framework-free, independently unit-tested modules.

**Module boundaries (each has one clear purpose):**
- `db/` — Dexie schema + typed repositories. *Owns persistence; no UI/domain logic.*
- `domain/srs.ts` — SM-2 pure functions: `(state, rating) → newState`.
- `domain/scheduler.ts` — schedule config → due sessions / next reminder time.
- `domain/anki/import.ts`, `export.ts`, `cloze.ts` — `.apkg` round-trip + cloze.
- `domain/media.ts` — blob ↔ object-URL helpers.
- `stores/` — Zustand stores (decks, study session, settings).
- `ui/` — design-system primitives + feature components.
- `pages/` — routed screens.

---

## 4. Data model (IndexedDB stores)

- **Deck** `{ id, name, description, parentId?, createdAt, updatedAt }`
- **Note** `{ id, deckId, type: 'basic'|'cloze', fields: Record<string,string>, mediaRefs: string[] }`
  — one note may yield multiple cards (cloze).
- **Card** `{ id, noteId, deckId, templateIndex, srs: { status: 'new'|'learning'|'review'|'relearning', ease, intervalDays, dueDate, reps, lapses } }`
- **MediaAsset** `{ id, blob, mime, filename }` — rendered via object URLs.
- **ReviewLog** `{ id, cardId, ts, rating: 1|2|3|4, intervalBefore, intervalAfter, ease }`
- **Schedule** `{ id, scope: deckId | 'combined', times: string[] /* HH:MM */, daysOfWeek: number[] /* 0–6 */, remindBeforeMin: number, enabled: boolean }`
- **Settings** `{ theme: 'light'|'dark'|'system', dailyNewLimit, dailyReviewLimit, ... }`

---

## 5. Core study loop (SM-2)

`domain/srs.ts` is pure: given a card's SRS state and a rating
(Again / Hard / Good / Easy → 1–4), return the new state and next due date. The
study screen builds a queue of due cards (per deck or combined), shows the front,
reveals the back on tap, takes a rating, applies SM-2, writes a `ReviewLog`, and
respects daily new/review limits. Cloze cards render with the active deletion
hidden then revealed.

---

## 6. Anki `.apkg` import

1. Unzip the `.apkg` with fflate.
2. Load `collection.anki2` with sql.js; read `col` (note types/templates),
   `notes`, `cards`, `revlog`.
3. Map the `media` JSON (number → filename) and store referenced files as
   `MediaAsset` blobs.
4. Render **Basic** templates and **Cloze** deletions (`{{c1::…}}`), sanitized
   with DOMPurify.
5. Import existing scheduling/review history where present so streaks and due
   dates carry over.
6. Warn the user about anything unsupported (JS-in-card, add-on note types).

---

## 7. Export

- **Deck → `.apkg`:** rebuild a SQLite collection + media zip (sql.js + fflate);
  round-trips back into Anki.
- **Progress & schedule → JSON:** full backup/restore of decks, cards, reviews,
  schedules, settings.
- **Schedule → `.ics`:** downloadable calendar events with a 5-min-before alarm —
  the reliable, no-backend path to a true OS reminder (incl. iOS).

---

## 8. Scheduling & reminders (in-app)

Per-deck **or** combined schedules: times-of-day, days-of-week, sessions/day,
`remindBeforeMin` (default 5). While the app is open, a reminder engine shows a
"time to study / N due" banner and a due-count badge, and fires a best-effort Web
Notification when permission is granted and the app/service worker is alive.
Reliable background push is intentionally out of scope; `.ics` export covers true
OS reminders.

---

## 9. Design system — "Focus Mono"

- Near-monochrome neutral palette + single indigo accent (`#4f6bed`).
- Crisp system sans; generous whitespace; calm motion (gentle reveal/flip).
- Light + dark via `class` toggle on `<html>`; design tokens as CSS variables.
- Mobile-first: large touch targets, thumb-reachable primary actions, full-bleed
  study cards.

---

## 10. Pages

Decks (home) · Deck detail · Card editor (text/image/audio/video) · Study ·
Stats/Progress · Schedule · Import · Export · Settings.

---

## 11. Deployment & repo deliverables

- GitHub Actions builds and deploys to GitHub Pages on push to `main`.
- Vite `base` set to the repo path; HashRouter + Workbox handle offline + deep
  links.
- **`CLAUDE.md`** — architecture, conventions, commands for future Claude sessions.
- **`README.md`** — features, dev/build/deploy instructions, usage.

---

## 12. Build order (phased)

1. **Foundation** — scaffold (Vite/React/TS), Tailwind design system + dark mode,
   Dexie schema, routing, PWA setup, GitHub Pages CI, `CLAUDE.md` + `README.md`.
2. **Decks & text cards** — CRUD + study screen + SM-2 + basic progress.
3. **Media cards** — image/audio/video via IndexedDB blobs.
4. **Anki import** — `.apkg` (Basic + Cloze + media + history).
5. **Export** — `.apkg`, JSON backup, `.ics`.
6. **Scheduling & reminders + Stats dashboard.**
7. **Polish** — offline hardening, performance, accessibility.

---

## 13. Testing strategy

- Pure domain modules (`srs`, `scheduler`, `anki/*`, `cloze`) are TDD'd with
  Vitest — these carry the core correctness risk.
- Repositories tested against an in-memory/IndexedDB shim.
- Component smoke tests for the study loop and card editor with React Testing
  Library.
- A small set of real-world `.apkg` fixtures verifies import/export round-trips.
