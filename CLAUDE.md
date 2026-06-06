# CLAUDE.md — FlashDeck

Offline-first PWA for spaced-repetition flash cards. No backend; all data lives
on-device in IndexedDB. Deployed as a static site to GitHub Pages.

## Commands
- `npm run dev` — local dev server
- `npm test` — run Vitest once
- `npm run test:watch` — watch mode
- `npm run lint` — ESLint
- `npm run build` — production build (PWA + base path `/flashdeck/`)

## Architecture
- UI (`src/ui`, `src/pages`) → Zustand stores (`src/stores`) → repositories
  (`src/db`) → Dexie/IndexedDB.
- Pure domain logic lives framework-free in `src/domain` and is unit-tested
  with Vitest. TDD this layer. Key modules: `srs.ts` (SM-2 scheduling),
  `media.ts`, and `domain/anki/` (`.apkg` parsing: `unzip`, `protobuf`,
  `collection`, `fields`, `cloze`, `srs-map`).
- Anki import spans two layers: pure parsing in `src/domain/anki/`, then the
  DB-write pipeline in `src/db/import.ts` + `src/db/anki-sqlite.ts`.
- Routing uses **HashRouter** (GitHub Pages deep-link safety). Do not switch to
  BrowserRouter without adding a Pages SPA fallback.
- Styling: Tailwind CSS v4 with CSS-variable tokens; dark mode via the `.dark`
  class on `<html>` (managed by `src/stores/themeStore.ts`).

## Conventions
- IDs: `crypto.randomUUID()`. Timestamps: `Date.now()` (ms).
- Media (image/audio/video) stored as Blobs in the `media` table; never in
  localStorage. localStorage holds only the theme flag.
- Imported HTML/templates must be sanitized with DOMPurify before render.

## Gotchas
- Anki import stack: `sql.js` reads the collection SQLite, `fflate` unzips,
  `fzstd` handles zstd in modern `.apkg`, plus a hand-rolled `protobuf.ts`.
- `.apkg` import MUST stream the archive (`domain/anki/unzip.stream.ts`), never
  buffer the whole file — iOS imposes a per-tab RAM cap. Covered by a test.
- CI (`.github/workflows/deploy.yml`) runs `npm test` + `npm run build` on push
  to `main` (Node 22), then deploys `dist/` to GitHub Pages.

## Roadmap
See `docs/superpowers/specs/2026-06-03-flashdeck-pwa-design.md` and
`docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`.
