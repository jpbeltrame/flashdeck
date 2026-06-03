import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  createTextCard, listCardsByDeck, updateTextCard, deleteCard, countCardsByDeck,
} from './cards'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('cards repository', () => {
  it('creates a basic note + card with new-card SRS', async () => {
    const { card, note } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    expect(note.type).toBe('basic')
    expect(note.fields).toEqual({ Front: 'Q', Back: 'A' })
    expect(card.deckId).toBe('d1')
    expect(card.srs.status).toBe('new')
    expect(await countCardsByDeck('d1')).toBe(1)
  })

  it('lists cards joined with their notes', async () => {
    await createTextCard({ deckId: 'd1', front: 'Q1', back: 'A1' })
    await createTextCard({ deckId: 'd1', front: 'Q2', back: 'A2' })
    await createTextCard({ deckId: 'd2', front: 'X', back: 'Y' })
    const rows = await listCardsByDeck('d1')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.note.fields.Front).sort()).toEqual(['Q1', 'Q2'])
  })

  it('updates a card’s text via its note', async () => {
    const { note } = await createTextCard({ deckId: 'd1', front: 'old', back: 'old' })
    await updateTextCard(note.id, 'new front', 'new back')
    const rows = await listCardsByDeck('d1')
    expect(rows[0].note.fields).toEqual({ Front: 'new front', Back: 'new back' })
  })

  it('deletes the card and its orphaned note', async () => {
    const { card } = await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await deleteCard(card.id)
    expect(await countCardsByDeck('d1')).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })
})
