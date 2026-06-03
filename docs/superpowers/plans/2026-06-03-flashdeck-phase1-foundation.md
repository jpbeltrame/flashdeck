# FlashDeck Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an installable, offline-capable React PWA shell — dark-mode design system, IndexedDB schema, routed page stubs, and an automated GitHub Pages deploy — that everything in later phases builds on.

**Architecture:** Vite + React + TypeScript SPA. UI → Zustand stores → Dexie (IndexedDB) repositories. Class-based dark mode via Tailwind CSS v4. HashRouter for GitHub Pages-safe deep links. vite-plugin-pwa (Workbox) for the offline app shell. Pure/domain logic stays framework-free and unit-tested with Vitest.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand, Dexie + dexie-react-hooks, React Router (HashRouter), vite-plugin-pwa, Vitest + Testing Library, GitHub Actions → Pages.

> All commands run from the project root `/Users/joao/projects/flashdeck`.

---

### Task 1: Scaffold the project and initialize git

**Files:**
- Create: whole Vite project tree (in place)
- Create: `.gitignore` (from template)

- [ ] **Step 1: Scaffold Vite React+TS in the current directory**

The directory already contains `docs/`, so scaffold in place and keep existing files.

Run:
```bash
npm create vite@latest . -- --template react-ts
```
If prompted that the directory is not empty, choose **"Ignore files and continue"**.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```

- [ ] **Step 3: Verify the dev server boots**

Run:
```bash
npm run dev
```
Expected: Vite prints `Local: http://localhost:5173/`. Stop it with Ctrl-C.

- [ ] **Step 4: Initialize git and append to .gitignore**

Run:
```bash
git init
printf '\n# Brainstorm scratch\n.superpowers/\n\n# Vite\ndist/\ndev-dist/\n' >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React+TS project"
```

---

### Task 2: Tailwind CSS v4 + design tokens + dark mode base

**Files:**
- Modify: `vite.config.ts`
- Create: `src/styles/index.css` (replaces default `src/index.css`)
- Modify: `src/main.tsx` (import the new stylesheet)
- Delete: `src/App.css`

- [ ] **Step 1: Install Tailwind v4**

Run:
```bash
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add the Tailwind plugin to Vite**

Edit `vite.config.ts` to:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Create the stylesheet with tokens + dark variant**

Create `src/styles/index.css`:
```css
@import "tailwindcss";

/* Class-based dark mode: .dark on <html> activates dark utilities */
@custom-variant dark (&:where(.dark, .dark *));

/* "Focus Mono" design tokens */
@theme {
  --color-accent: #4f6bed;
  --color-accent-fg: #ffffff;

  --color-bg: #ffffff;
  --color-surface: #f7f9fc;
  --color-border: #e7eaf0;
  --color-text: #1c2433;
  --color-muted: #9aa3b5;
}

.dark {
  --color-bg: #0f141c;
  --color-surface: #161d28;
  --color-border: #273141;
  --color-text: #e7ecf3;
  --color-muted: #7a869a;
}

html, body, #root { height: 100%; }
body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 4: Wire the stylesheet and remove defaults**

In `src/main.tsx`, replace `import './index.css'` with `import './styles/index.css'`.
Delete the default files:
```bash
rm -f src/index.css src/App.css
```
In `src/App.tsx`, remove the `import './App.css'` line if present.

- [ ] **Step 5: Verify build still works**

Run:
```bash
npm run build
```
Expected: build completes with no errors and emits `dist/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Tailwind v4 with Focus Mono design tokens and dark mode"
```

---

### Task 3: Theme store with persistence (TDD)

**Files:**
- Create: `src/stores/themeStore.ts`
- Test: `src/stores/themeStore.test.ts`
- Create: `vitest.setup.ts`
- Modify: `vite.config.ts` (add test config)

- [ ] **Step 1: Install test tooling**

Run:
```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.setup.ts` (the `matchMedia` stub is required — jsdom omits it and `themeStore` calls it on load):
```ts
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
```

Update `vite.config.ts` to add a test block and the triple-slash reference:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

Add scripts to `package.json` (`"scripts"` block): `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 3: Write the failing test**

Create `src/stores/themeStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './themeStore'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  useThemeStore.setState({ theme: 'light' })
})

describe('themeStore', () => {
  it('toggles between light and dark', () => {
    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists the theme to localStorage', () => {
    useThemeStore.getState().setTheme('dark')
    expect(localStorage.getItem('flashdeck-theme')).toBe('dark')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run:
```bash
npm test -- themeStore
```
Expected: FAIL — cannot resolve `./themeStore`.

- [ ] **Step 5: Implement the theme store**

Create `src/stores/themeStore.ts`:
```ts
import { create } from 'zustand'

type Theme = 'light' | 'dark'
const KEY = 'flashdeck-theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    localStorage.setItem(KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

// Apply on module load so the first paint matches the stored theme.
applyTheme(useThemeStore.getState().theme)
```

Install Zustand:
```bash
npm install zustand
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
npm test -- themeStore
```
Expected: PASS (2 passing).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add persisted theme store with dark-mode toggle (TDD)"
```

---

### Task 4: Dexie database schema and a repository (TDD)

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/db.ts`
- Create: `src/db/decks.ts`
- Test: `src/db/decks.test.ts`

- [ ] **Step 1: Install Dexie**

Run:
```bash
npm install dexie dexie-react-hooks
```

- [ ] **Step 2: Define the typed entities**

Create `src/db/schema.ts`:
```ts
export interface Deck {
  id: string
  name: string
  description?: string
  parentId?: string
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  deckId: string
  type: 'basic' | 'cloze'
  fields: Record<string, string>
  mediaRefs: string[]
}

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning'

export interface Card {
  id: string
  noteId: string
  deckId: string
  templateIndex: number
  srs: {
    status: CardStatus
    ease: number
    intervalDays: number
    dueDate: number
    reps: number
    lapses: number
  }
}

export interface MediaAsset {
  id: string
  blob: Blob
  mime: string
  filename: string
}

export interface ReviewLog {
  id: string
  cardId: string
  ts: number
  rating: 1 | 2 | 3 | 4
  intervalBefore: number
  intervalAfter: number
  ease: number
}

export interface Schedule {
  id: string
  scope: string // a deckId, or the literal 'combined'
  times: string[] // 'HH:MM'
  daysOfWeek: number[] // 0–6, Sunday=0
  remindBeforeMin: number
  enabled: boolean
}
```

- [ ] **Step 3: Define the Dexie database**

Create `src/db/db.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  Deck, Note, Card, MediaAsset, ReviewLog, Schedule,
} from './schema'

export class FlashDeckDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  media!: EntityTable<MediaAsset, 'id'>
  reviews!: EntityTable<ReviewLog, 'id'>
  schedules!: EntityTable<Schedule, 'id'>

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
  }
}

export const db = new FlashDeckDB()
```

- [ ] **Step 4: Write the failing test for the deck repository**

Create `src/db/decks.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createDeck, listDecks, renameDeck, deleteDeck } from './decks'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('deck repository', () => {
  it('creates and lists a deck', async () => {
    const deck = await createDeck('Biology')
    const all = await listDecks()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(deck.id)
    expect(all[0].name).toBe('Biology')
  })

  it('renames a deck and bumps updatedAt', async () => {
    const deck = await createDeck('Bio')
    await renameDeck(deck.id, 'Biology 101')
    const all = await listDecks()
    expect(all[0].name).toBe('Biology 101')
    expect(all[0].updatedAt).toBeGreaterThanOrEqual(deck.updatedAt)
  })

  it('deletes a deck', async () => {
    const deck = await createDeck('Temp')
    await deleteDeck(deck.id)
    expect(await listDecks()).toHaveLength(0)
  })
})
```

Install the in-memory IndexedDB shim:
```bash
npm install -D fake-indexeddb
```

- [ ] **Step 5: Run the test to verify it fails**

Run:
```bash
npm test -- decks
```
Expected: FAIL — cannot resolve `./decks`.

- [ ] **Step 6: Implement the deck repository**

Create `src/db/decks.ts`:
```ts
import { db } from './db'
import type { Deck } from './schema'

export async function createDeck(name: string, description?: string): Promise<Deck> {
  const now = Date.now()
  const deck: Deck = {
    id: crypto.randomUUID(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  }
  await db.decks.add(deck)
  return deck
}

export function listDecks(): Promise<Deck[]> {
  return db.decks.orderBy('updatedAt').reverse().toArray()
}

export async function renameDeck(id: string, name: string): Promise<void> {
  await db.decks.update(id, { name, updatedAt: Date.now() })
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await db.cards.where('deckId').equals(id).delete()
    await db.notes.where('deckId').equals(id).delete()
    await db.decks.delete(id)
  })
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
npm test -- decks
```
Expected: PASS (3 passing).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Dexie schema and deck repository (TDD)"
```

---

### Task 5: Routing skeleton, app shell, and page stubs

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Create: `src/ui/AppShell.tsx`
- Create: `src/ui/ThemeToggle.tsx`
- Create: `src/pages/{DecksPage,DeckDetailPage,StudyPage,StatsPage,SchedulePage,ImportPage,ExportPage,SettingsPage}.tsx`

- [ ] **Step 1: Install React Router**

Run:
```bash
npm install react-router-dom
```

- [ ] **Step 2: Create the eight page stubs**

Create each file under `src/pages/` with this shape (substitute the name). Example `src/pages/DecksPage.tsx`:
```tsx
export default function DecksPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Decks</h1>
      <p className="text-[var(--color-muted)] mt-1">No decks yet.</p>
    </section>
  )
}
```
Repeat for `DeckDetailPage` ("Deck"), `StudyPage` ("Study"), `StatsPage` ("Progress"), `SchedulePage` ("Schedule"), `ImportPage` ("Import"), `ExportPage` ("Export"), `SettingsPage` ("Settings"), changing the heading text accordingly.

- [ ] **Step 3: Create the theme toggle component**

Create `src/ui/ThemeToggle.tsx`:
```tsx
import { useThemeStore } from '../stores/themeStore'

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-full px-3 py-1 text-sm border border-[var(--color-border)]"
    >
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  )
}
```

- [ ] **Step 4: Create the app shell with a thumb-reachable bottom nav**

Create `src/ui/AppShell.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const tabs = [
  { to: '/', label: 'Decks', end: true },
  { to: '/study', label: 'Study', end: false },
  { to: '/stats', label: 'Progress', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function AppShell() {
  return (
    <div className="flex flex-col h-full max-w-screen-sm mx-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="font-semibold">FlashDeck</span>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <Outlet />
      </main>

      <nav className="flex border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-sm ${
                isActive ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-muted)]'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 5: Define routes in App.tsx**

Replace `src/App.tsx` with:
```tsx
import { Routes, Route } from 'react-router-dom'
import AppShell from './ui/AppShell'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import StudyPage from './pages/StudyPage'
import StatsPage from './pages/StatsPage'
import SchedulePage from './pages/SchedulePage'
import ImportPage from './pages/ImportPage'
import ExportPage from './pages/ExportPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DecksPage />} />
        <Route path="deck/:id" element={<DeckDetailPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 6: Wrap the app in HashRouter**

Replace `src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
```

- [ ] **Step 7: Verify it builds and renders**

Run:
```bash
npm run build && npm run dev
```
Expected: build succeeds; opening the dev URL shows the FlashDeck header, "Decks" page, bottom nav, and a working dark-mode toggle. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add HashRouter app shell, bottom nav, and page stubs"
```

---

### Task 6: PWA — manifest, icons, and service worker

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`

- [ ] **Step 1: Install vite-plugin-pwa**

Run:
```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Generate placeholder PWA icons**

Create three solid indigo PNG icons (replace with real artwork later):
```bash
mkdir -p public/icons
python3 - <<'PY'
import struct, zlib
def png(path, size, rgb=(79,107,237)):
    def chunk(t,d): 
        c=t+d; return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    ihdr=struct.pack('>IIBBBBB',size,size,8,2,0,0,0)
    row=b'\x00'+bytes(rgb)*size
    raw=row*size
    with open(path,'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
png('public/icons/icon-192.png',192)
png('public/icons/icon-512.png',512)
png('public/icons/maskable-512.png',512)
print('icons written')
PY
```
Expected output: `icons written`.

- [ ] **Step 3: Configure the PWA plugin**

Update `vite.config.ts` to add the plugin and manifest:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'FlashDeck',
        short_name: 'FlashDeck',
        description: 'Offline spaced-repetition flash cards',
        theme_color: '#4f6bed',
        background_color: '#0f141c',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,wasm}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 4: Set the theme-color meta in index.html**

In `index.html`, inside `<head>`, add:
```html
<meta name="theme-color" content="#4f6bed" />
```
and update the `<title>` to `FlashDeck`.

- [ ] **Step 5: Verify the service worker and manifest are emitted**

Run:
```bash
npm run build
```
Expected: build output lists `dist/sw.js` and `dist/manifest.webmanifest`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PWA manifest, icons, and Workbox service worker"
```

---

### Task 7: GitHub Pages deploy via Actions

**Files:**
- Modify: `vite.config.ts` (set `base`)
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Set the Vite base path**

GitHub Project Pages serve from `/<repo>/`. Add `base: '/flashdeck/'` to the
`defineConfig` object in `vite.config.ts` (top level, alongside `plugins`):
```ts
export default defineConfig({
  base: '/flashdeck/',
  plugins: [
    // …unchanged…
  ],
  // …unchanged…
})
```
> If the repo is later published under a different name, update this string to match.

- [ ] **Step 2: Create the deploy workflow**

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify a production build with the base path**

Run:
```bash
npm run build
```
Expected: asset URLs in `dist/index.html` are prefixed with `/flashdeck/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: deploy to GitHub Pages on push to main"
```

> **Manual step (record, don't automate):** after first push, in the GitHub repo
> go to Settings → Pages → Build and deployment → Source = **GitHub Actions**.

---

### Task 8: Project documentation (CLAUDE.md + README.md)

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Write CLAUDE.md**

Create `CLAUDE.md`:
```markdown
# CLAUDE.md — FlashDeck

Offline-first PWA for spaced-repetition flash cards. No backend; all data lives
on-device in IndexedDB. Deployed as a static site to GitHub Pages.

## Commands
- `npm run dev` — local dev server
- `npm test` — run Vitest once
- `npm run test:watch` — watch mode
- `npm run build` — production build (PWA + base path `/flashdeck/`)

## Architecture
- UI (`src/ui`, `src/pages`) → Zustand stores (`src/stores`) → repositories
  (`src/db`) → Dexie/IndexedDB.
- Pure domain logic lives framework-free in `src/domain` (SM-2 SRS, scheduler,
  Anki import/export, cloze) and is unit-tested with Vitest. TDD this layer.
- Routing uses **HashRouter** (GitHub Pages deep-link safety). Do not switch to
  BrowserRouter without adding a Pages SPA fallback.
- Styling: Tailwind CSS v4 with CSS-variable tokens; dark mode via the `.dark`
  class on `<html>` (managed by `src/stores/themeStore.ts`).

## Conventions
- IDs: `crypto.randomUUID()`. Timestamps: `Date.now()` (ms).
- Media (image/audio/video) stored as Blobs in the `media` table; never in
  localStorage. localStorage holds only the theme flag.
- Imported HTML/templates must be sanitized with DOMPurify before render.

## Roadmap
See `docs/superpowers/specs/2026-06-03-flashdeck-pwa-design.md` and
`docs/superpowers/plans/2026-06-03-flashdeck-roadmap.md`.
```

- [ ] **Step 2: Write README.md**

Create `README.md`:
```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add CLAUDE.md and README.md"
```

---

## Phase 1 Definition of Done
- `npm test` passes (theme store + deck repository).
- `npm run build` emits a PWA (`sw.js`, `manifest.webmanifest`) with the
  `/flashdeck/` base path.
- App runs: header, routed pages, thumb-reachable bottom nav, working dark mode.
- Dexie schema (`decks/notes/cards/media/reviews/schedules`) created with a
  working deck repository.
- GitHub Actions deploy workflow present; `CLAUDE.md` and `README.md` written.

Next: **Phase 2 — Decks & text cards** (full deck/card CRUD UI, study screen, SM-2
engine, basic progress). Its plan is written when Phase 1 completes.
