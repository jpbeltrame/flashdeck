import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addMedia, getMedia, pruneOrphanMedia } from './media'
import type { Note } from './schema'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function blob(text = 'data'): Blob {
  return new Blob([text], { type: 'image/png' })
}

describe('media repository', () => {
  it('stores a blob and returns an asset with an id', async () => {
    const asset = await addMedia(blob(), 'pic.png', 'image/png')
    expect(asset.id).toBeTruthy()
    expect(asset.filename).toBe('pic.png')
    expect(asset.mime).toBe('image/png')
    const fetched = await getMedia(asset.id)
    expect(fetched?.filename).toBe('pic.png')
  })

  it('getMedia returns undefined for an unknown id', async () => {
    expect(await getMedia('nope')).toBeUndefined()
  })

  it('prunes assets not referenced by any note and reports the count', async () => {
    const referenced = await addMedia(blob(), 'keep.png', 'image/png')
    await addMedia(blob(), 'orphan.png', 'image/png')
    const note: Note = {
      id: 'n1', deckId: 'd1', type: 'basic',
      fields: { Front: `[[media:${referenced.id}]]`, Back: 'A' },
      mediaRefs: [referenced.id],
    }
    await db.notes.add(note)

    expect(await pruneOrphanMedia()).toBe(1)
    expect(await getMedia(referenced.id)).toBeDefined()
    expect(await db.media.count()).toBe(1)
  })

  it('prunes nothing when every asset is referenced', async () => {
    const a = await addMedia(blob(), 'a.png', 'image/png')
    await db.notes.add({
      id: 'n1', deckId: 'd1', type: 'basic',
      fields: { Front: 'Q', Back: 'A' }, mediaRefs: [a.id],
    })
    expect(await pruneOrphanMedia()).toBe(0)
  })
})
