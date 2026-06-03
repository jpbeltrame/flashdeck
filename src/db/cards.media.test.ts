import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard, updateTextCard, deleteCard, listCardsByDeck } from './cards'
import { addMedia, getMedia } from './media'
import { mediaToken } from '../domain/media'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function blob(): Blob {
  return new Blob(['x'], { type: 'image/png' })
}

describe('cards repository — media refs', () => {
  it('derives mediaRefs from tokens in the front/back on create', async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { note } = await createTextCard({
      deckId: 'd1',
      front: `Look: ${mediaToken(asset.id)}`,
      back: 'A',
    })
    expect(note.mediaRefs).toEqual([asset.id])
  })

  it('recomputes mediaRefs on update and prunes the now-orphaned asset', async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { note } = await createTextCard({
      deckId: 'd1',
      front: mediaToken(asset.id),
      back: 'A',
    })
    expect(note.mediaRefs).toEqual([asset.id])

    await updateTextCard(note.id, 'no media now', 'A')

    const rows = await listCardsByDeck('d1')
    expect(rows[0].note.mediaRefs).toEqual([])
    expect(await getMedia(asset.id)).toBeUndefined() // pruned
  })

  it("prunes a card's media when the card is deleted", async () => {
    const asset = await addMedia(blob(), 'p.png', 'image/png')
    const { card } = await createTextCard({
      deckId: 'd1',
      front: mediaToken(asset.id),
      back: 'A',
    })
    await deleteCard(card.id)
    expect(await getMedia(asset.id)).toBeUndefined()
  })
})
