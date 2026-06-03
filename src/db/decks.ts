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
