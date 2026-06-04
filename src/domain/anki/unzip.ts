import { unzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'
import { readLengthDelimitedFields, readStringField } from './protobuf'
import type { MediaFile } from './types'

// zstd frame magic number: 0x28 0xB5 0x2F 0xFD.
function isZstd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd
}

// .apkg media files are stored uncompressed, but .colpkg compresses them;
// decompress defensively so either works.
function maybeDecompress(bytes: Uint8Array): Uint8Array {
  return isZstd(bytes) ? zstdDecompress(bytes) : bytes
}

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

  // The "media" entry maps numbered zip files to their original filenames.
  // Legacy packages (anki2/anki21) use a JSON object; the modern v3 package
  // (anki21b) uses a zstd-compressed `MediaEntries` protobuf whose entry order
  // gives each file's index. Absent/empty => no media.
  const media: MediaFile[] = []
  const mapEntry = files['media']
  if (mapEntry) {
    if (choice.zstd) {
      // v3: repeated MediaEntry entries = 1; MediaEntry.name = 1. The zip file
      // for entry i is named String(i).
      const manifest = zstdDecompress(mapEntry)
      readLengthDelimitedFields(manifest, 1).forEach((entry, i) => {
        const filename = readStringField(entry, 1)
        const bytes = files[String(i)]
        if (filename && bytes) media.push({ filename, bytes: maybeDecompress(bytes) })
      })
    } else {
      const map = JSON.parse(new TextDecoder().decode(mapEntry)) as Record<string, string>
      for (const [num, filename] of Object.entries(map)) {
        const bytes = files[num]
        if (bytes) media.push({ filename, bytes })
      }
    }
  }
  return { collection, media }
}
