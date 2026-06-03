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
