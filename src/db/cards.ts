import { db } from './db'
import type { Card, Note } from './schema'
import { newCardSrs } from '../domain/srs'
import { mediaIdsIn } from '../domain/media'
import { pruneOrphanMedia } from './media'

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
    mediaRefs: mediaIdsIn(input.front, input.back),
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
  // Reclaim any media attached in the editor that never made it onto a saved note
  // (e.g. an earlier cancelled edit). The new note's own refs are safe.
  await pruneOrphanMedia()
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
  await db.notes.update(noteId, {
    fields: { Front: front, Back: back },
    mediaRefs: mediaIdsIn(front, back),
  })
  await pruneOrphanMedia()
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    await db.cards.delete(cardId)
    const remaining = await db.cards.where('noteId').equals(card.noteId).count()
    if (remaining === 0) await db.notes.delete(card.noteId)
  })
  await pruneOrphanMedia()
}

export function countCardsByDeck(deckId: string): Promise<number> {
  return db.cards.where('deckId').equals(deckId).count()
}
