import { db } from './db'
import type { MediaAsset } from './schema'

export async function addMedia(blob: Blob, filename: string, mime: string, id?: string): Promise<MediaAsset> {
  const asset: MediaAsset = { id: id ?? crypto.randomUUID(), blob, mime, filename }
  await db.media.add(asset)
  return asset
}

export function getMedia(id: string): Promise<MediaAsset | undefined> {
  return db.media.get(id)
}

// Delete any media asset not referenced by some note's mediaRefs. Returns how many were removed.
export async function pruneOrphanMedia(): Promise<number> {
  const [notes, assets] = await Promise.all([db.notes.toArray(), db.media.toArray()])
  const referenced = new Set<string>()
  for (const note of notes) for (const id of note.mediaRefs) referenced.add(id)
  const orphans = assets.filter((a) => !referenced.has(a.id)).map((a) => a.id)
  if (orphans.length > 0) await db.media.bulkDelete(orphans)
  return orphans.length
}
