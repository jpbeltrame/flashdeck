# Create Deck Page — Design

**Date:** 2026-06-04
**Status:** Approved

## Goal

Give deck creation a dedicated page that holds both ways to create a deck:
a form to create one from scratch (name + optional description) and an inline
control to import an Anki `.apkg`. Remove the cramped inline create form from the
Decks list.

## Route

- New route `/new` → `CreateDeckPage`, registered flat in `src/App.tsx`
  alongside the other routes, inside the `AppShell` layout.

## Reusable import component

Extract the `.apkg` import UI (file picker + busy / error / summary states) out
of `ImportPage` into a shared component `src/ui/ApkgImport.tsx`.

- Keeps the `openDb?` test-seam prop currently on `ImportPage`.
- `ImportPage` (`/import`) becomes a thin wrapper rendering `<ApkgImport />`, so
  the existing route and `ImportPage.test.tsx` keep working unchanged (same
  `Choose .apkg file` label).
- `CreateDeckPage` embeds the same `<ApkgImport />` inline.

Rejected alternative: duplicate the import markup in the new page — two copies to
maintain.

## CreateDeckPage layout

- Heading: "Create deck".
- **From scratch** form:
  - Name `<input>` (required).
  - Description `<textarea>` (optional). `createDeck(name, description)` already
    accepts a description.
  - "Create deck" `<Button>`, disabled while the trimmed name is empty.
  - On submit → `createDeck(name, description)` → `navigate('/deck/<id>')` so the
    user lands on the new deck's detail page to start adding cards.
- Divider labelled "or import an existing deck".
- Inline `<ApkgImport />` control below the divider.

## DecksPage changes

- Remove the inline name `<input>` and the `add()` handler.
- Replace the header "Import .apkg" link with a **"+ New deck"** link to `/new`.
- Update the empty-state hint to point at that button.

## Testing

- New `CreateDeckPage.test.tsx`: fill name + description, submit, assert the deck
  is persisted in IndexedDB (and renders within a `MemoryRouter`).
- Update `DecksPage.test.tsx`: drop the inline-create test; assert the
  "New deck" link and the empty state render.
- `ImportPage.test.tsx`: unchanged, passes via the wrapper.

## Out of scope

- Editing deck description after creation.
- Drag-and-drop file import.
