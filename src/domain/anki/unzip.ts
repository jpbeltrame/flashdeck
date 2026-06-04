import { unzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'
import type { MediaFile } from './types'

export interface UnzippedApkg {
  collection: Uint8Array
  media: MediaFile[]
}

/** Choose the collection entry by Anki's format priority. */
export function selectCollectionName(names: string[]): { name: string; zstd: boolean } | null {
  if (names.includes('collection.anki21b')) return { name: 'collection.anki21b', zstd: true }
  if (names.includes('collection.anki21')) return { name: 'collection.anki21', zstd: false }
  if (names.includes('collection.anki2')) return { name: 'collection.anki2', zstd: false }
  return null
}

export function unzipApkg(zipBytes: Uint8Array): UnzippedApkg {
  const files = unzipSync(zipBytes)
  const choice = selectCollectionName(Object.keys(files))
  if (!choice) throw new Error('This file contains no Anki collection (collection.anki2/anki21/anki21b).')

  const raw = files[choice.name]
  const collection = choice.zstd ? zstdDecompress(raw) : raw

  // The "media" entry maps numeric keys to original filenames; the numbered
  // entries hold the bytes. Absent or empty map => no media.
  const media: MediaFile[] = []
  const mapEntry = files['media']
  if (mapEntry) {
    const map = JSON.parse(new TextDecoder().decode(mapEntry)) as Record<string, string>
    for (const [num, filename] of Object.entries(map)) {
      const bytes = files[num]
      if (bytes) media.push({ filename, bytes })
    }
  }
  return { collection, media }
}
