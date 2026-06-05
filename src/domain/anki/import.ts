import type { Card, Deck, Note, ReviewLog } from '../../db/schema'
import { mediaIdsIn } from '../media'
import type { ParsedCollection } from './collection'
import { renderCard, rewriteMedia, splitFields, type RenderedCard } from './fields'
import { mapCardSrs, mapRevlog } from './srs-map'
import type { ImportResult } from './types'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

export function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/**
 * Build everything to persist except the media blobs. Media is keyed by
 * `idByFilename` (filename→id) so the actual bytes can be streamed into storage
 * separately, one file at a time, instead of being held in memory here.
 */
export function buildImportResult(col: ParsedCollection, filenames: string[], now: number = Date.now()): ImportResult {
  const warnings: string[] = []

  // 1. filename→id map, used both for rewriting note refs and (later) for
  //    matching streamed media payloads to their persisted id.
  const idByFilename = new Map<string, string>()
  for (const filename of filenames) idByFilename.set(filename, crypto.randomUUID())

  // 2. Decks: one flat Deck per Anki deck that actually contains cards, full
  //    name kept verbatim. Anki collections always ship a built-in "Default"
  //    deck (and may carry other empty decks); importing those would create
  //    stray empty decks, so only emit decks referenced by a card.
  const usedDeckIds = new Set(col.cards.map((c) => String(c.did)))
  const deckIdByAnki = new Map<string, string>()
  const decks: Deck[] = []
  for (const [ankiId, d] of Object.entries(col.decks)) {
    if (!usedDeckIds.has(ankiId)) continue
    const id = crypto.randomUUID()
    deckIdByAnki.set(ankiId, id)
    decks.push({ id, name: d.name, createdAt: now, updatedAt: now })
  }

  // 3. Notes (HTML, media-rewritten). One FlashDeck note per Anki note; its deck
  //    is taken from its first card below, so build a lookup first.
  const cardsByNote = new Map<number, typeof col.cards>()
  for (const c of col.cards) {
    const list = cardsByNote.get(c.nid) ?? []
    list.push(c)
    cardsByNote.set(c.nid, list)
  }

  const notes: Note[] = []
  const cards: Card[] = []
  const cardIdByAnki = new Map<number, string>()

  for (const n of col.notes) {
    const model = col.models[n.mid]
    if (!model) { warnings.push(`Note ${n.id} uses an unknown note type; skipped.`); continue }
    const noteCards = cardsByNote.get(n.id) ?? []
    if (noteCards.length === 0) continue

    // Field values, media-rewritten, used by every card of this note.
    const rawFields = splitFields(n.flds, model.flds.map((f) => f.name))
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawFields)) fields[k] = rewriteMedia(v, idByFilename)

    // The note's deck is its first card's deck (must exist).
    const firstDeck = deckIdByAnki.get(String(noteCards[0].did))
    if (!firstDeck) {
      warnings.push(`Note ${n.id} references a missing deck (${noteCards[0].did}); skipped.`)
      continue
    }

    const noteId = crypto.randomUUID()
    let display: RenderedCard | undefined

    for (const c of noteCards) {
      const deckId = deckIdByAnki.get(String(c.did))
      if (!deckId) { warnings.push(`Card ${c.id} references a missing deck (${c.did}); skipped.`); continue }
      const cardId = crypto.randomUUID()
      cardIdByAnki.set(c.id, cardId)
      cards.push({
        id: cardId, noteId, deckId, templateIndex: c.ord, srs: mapCardSrs(c, col.crt, now),
      })
      const rc = renderCard(model, fields, c.ord, idByFilename)
      for (const w of rc.warnings) if (!warnings.includes(w)) warnings.push(w)
      if (c === noteCards[0]) display = rc
    }

    // Store rendered Front/Back from the note's first card for editor/list display.
    const fieldText = `${display!.front}\n${display!.back}`
    notes.push({
      id: noteId, deckId: firstDeck, type: model.type === 1 ? 'cloze' : 'basic', format: 'html',
      css: model.css,
      fields: { Front: display!.front, Back: display!.back },
      mediaRefs: mediaIdsIn(fieldText),
    })
  }

  // 4. Review logs, linked to imported cards (skip orphans).
  const reviews: ReviewLog[] = []
  for (const r of col.revlog) {
    const cardId = cardIdByAnki.get(r.cid)
    if (!cardId) continue
    reviews.push({ id: crypto.randomUUID(), cardId, ...mapRevlog(r) })
  }

  return { decks, notes, cards, idByFilename, reviews, warnings }
}
