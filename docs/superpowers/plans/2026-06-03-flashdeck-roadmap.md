# FlashDeck — Implementation Roadmap

This project is built in phases. Each phase produces working, testable software and
gets its own detailed implementation plan (written when the phase begins).

**Spec:** `docs/superpowers/specs/2026-06-03-flashdeck-pwa-design.md`

| # | Phase | Plan file | Status |
|---|---|---|---|
| 1 | Foundation (scaffold, design system, dark mode, DB schema, routing, PWA, CI, docs) | `2026-06-03-flashdeck-phase1-foundation.md` | ✅ Implemented |
| 2 | Decks & text cards (CRUD + study screen + SM-2 + basic progress) | `2026-06-03-flashdeck-phase2-decks-and-study.md` | Plan written |
| 3 | Media cards (image/audio/video via IndexedDB blobs) | `2026-06-03-flashdeck-phase3-media-cards.md` | ✅ Implemented |
| 4 | Anki import (`.apkg`: Basic + Cloze + media + history) | `2026-06-03-flashdeck-phase4-anki-import.md` | ✅ Implemented |
| 5 | Export (`.apkg`, JSON backup, `.ics`) | _to be written_ | Pending |
| 6 | Scheduling & reminders + Stats dashboard | _to be written_ | Pending |
| 7 | Polish (offline hardening, performance, accessibility) | _to be written_ | Pending |

**Why phased:** the phases are largely independent subsystems with clear handoffs
(a working app shell → CRUD/study → media → import → export → scheduling → polish).
Writing one bite-sized plan per phase keeps each plan executable and reviewable.

**Deferred:** Nested deck hierarchy on import — Anki `::`/`\x1f` subdecks currently
import as flat decks keeping the full name verbatim. Rebuilding parent/child
`Deck.parentId` nesting (and the UI to show it) is deferred to a later phase.
Modern Anki schema (v18+, incl. zstd `collection.anki21b`) note types and decks
ARE read (see `2026-06-04-flashdeck-modern-anki-schema.md`).

**Card-side JavaScript** in imported note types (e.g. MCQ) IS supported: cards
render in a sandboxed `<iframe sandbox="allow-scripts">` with the note-type CSS
(see `2026-06-04-flashdeck-faithful-card-rendering.md`). In-card answer buttons
are visual only — grading still uses FlashDeck's rating buttons.
