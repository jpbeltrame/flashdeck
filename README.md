# FlashDeck

A mobile-first, offline-first Progressive Web App for spaced-repetition study.
No backend — your decks, media, and progress live entirely on your device.

## Features
- Create, edit, and organize decks and cards (text, image, audio, video).
- Spaced repetition with the SM-2 algorithm and progress tracking.
- Open and play Anki `.apkg` decks (Basic + Cloze + media); export back to `.apkg`.
- Study schedules per deck or combined, with in-app reminders and `.ics` export.
- Light and dark mode. Installable and fully usable offline.

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build
```

## Deployment
Pushes to `main` build and deploy to GitHub Pages via GitHub Actions. In the repo,
set Settings → Pages → Source = "GitHub Actions". The app is served from
`/flashdeck/` (configured as Vite `base`).

## Tech
React + TypeScript + Vite, Tailwind CSS v4, Zustand, Dexie (IndexedDB),
vite-plugin-pwa (Workbox), React Router (HashRouter), Vitest.

## Status
Phase 1 (Foundation) complete. See `docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`.
