import { Unzip, UnzipInflate, UnzipPassThrough, unzipSync } from 'fflate'
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

/**
 * Parse the `media` manifest entry into an ordered index→filename map. Legacy
 * packages use a JSON object; the modern v3 package uses a zstd-compressed
 * `MediaEntries` protobuf whose entry order gives each file's index. The zip
 * file for entry i is named String(i).
 */
export function parseMediaManifest(mapEntry: Uint8Array | undefined, zstd: boolean): Map<number, string> {
  const out = new Map<number, string>()
  if (!mapEntry) return out
  if (zstd) {
    const manifest = zstdDecompress(mapEntry)
    readLengthDelimitedFields(manifest, 1).forEach((entry, i) => {
      const filename = readStringField(entry, 1)
      if (filename) out.set(i, filename)
    })
  } else {
    const map = JSON.parse(new TextDecoder().decode(mapEntry)) as Record<string, string>
    for (const [num, filename] of Object.entries(map)) out.set(Number(num), filename)
  }
  return out
}

/**
 * Stream a zip from a ReadableStream through fflate's incremental unzipper,
 * buffering only the entries `wanted()` selects and handing each to `onEntry`.
 * Un-wanted entries are never started, so their payloads are skipped without
 * being decompressed or held in memory — this is what keeps peak memory flat
 * for huge media-heavy .apkg files on memory-capped browsers (e.g. iOS Safari).
 *
 * `onEntry` is awaited between source chunks, giving natural backpressure: a
 * caller persisting each entry pauses the read until its write completes.
 */
async function pumpUnzip(
  stream: ReadableStream<Uint8Array>,
  wanted: (name: string) => boolean,
  onEntry: (name: string, bytes: Uint8Array) => void | Promise<void>,
): Promise<void> {
  const unz = new Unzip()
  unz.register(UnzipInflate) // deflate (most zip writers)
  unz.register(UnzipPassThrough) // stored (Anki media is uncompressed)

  const ready: { name: string; bytes: Uint8Array }[] = []
  let failure: unknown = null

  unz.onfile = (file) => {
    if (!wanted(file.name)) return // skip: never started ⇒ fflate seeks past it
    const chunks: Uint8Array[] = []
    let total = 0
    file.ondata = (err, chunk, final) => {
      if (err) { failure = err; return }
      if (chunk && chunk.length) { chunks.push(chunk.slice()); total += chunk.length } // copy: fflate reuses buffers
      if (final) {
        const bytes = new Uint8Array(total)
        let off = 0
        for (const c of chunks) { bytes.set(c, off); off += c.length }
        ready.push({ name: file.name, bytes })
      }
    }
    file.start()
  }

  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    unz.push(value ?? new Uint8Array(0), done)
    if (failure) throw failure
    while (ready.length) { const e = ready.shift()!; await onEntry(e.name, e.bytes) }
    if (done) break
  }
}

export interface ApkgHeader {
  collection: Uint8Array
  /** index → filename, in media-manifest order. */
  filenames: Map<number, string>
}

/**
 * Streaming pass 1: read only the collection database and the media manifest,
 * skipping every media payload. Returns the (zstd-decompressed) collection plus
 * the index→filename map needed to assign ids and rewrite refs.
 */
export async function readApkgHeader(stream: ReadableStream<Uint8Array>): Promise<ApkgHeader> {
  const buffered = new Map<string, Uint8Array>()
  await pumpUnzip(
    stream,
    (name) => name === 'media' || name.startsWith('collection.anki'),
    (name, bytes) => { buffered.set(name, bytes) },
  )
  const choice = selectCollectionName([...buffered.keys()])
  if (!choice) throw new Error('This file contains no Anki collection (collection.anki2/anki21/anki21b).')
  const raw = buffered.get(choice.name)!
  const collection = choice.zstd ? zstdDecompress(raw) : raw
  return { collection, filenames: parseMediaManifest(buffered.get('media'), choice.zstd) }
}

/**
 * Streaming pass 2: invoke `onMedia` for each media payload, one at a time,
 * resolving its numeric entry name to a filename via `filenames`. `onMedia` is
 * awaited before the next entry is read, so callers can persist and release
 * each blob without accumulating them in memory.
 */
export async function streamApkgMedia(
  stream: ReadableStream<Uint8Array>,
  filenames: Map<number, string>,
  onMedia: (filename: string, bytes: Uint8Array) => void | Promise<void>,
): Promise<void> {
  await pumpUnzip(
    stream,
    (name) => /^\d+$/.test(name) && filenames.has(Number(name)),
    async (name, bytes) => {
      const filename = filenames.get(Number(name))!
      await onMedia(filename, maybeDecompress(bytes))
    },
  )
}

export function unzipApkg(zipBytes: Uint8Array): UnzippedApkg {
  const files = unzipSync(zipBytes)
  const choice = selectCollectionName(Object.keys(files))
  if (!choice) throw new Error('This file contains no Anki collection (collection.anki2/anki21/anki21b).')

  const raw = files[choice.name]
  const collection = choice.zstd ? zstdDecompress(raw) : raw

  // The "media" entry maps numbered zip files to their original filenames.
  const media: MediaFile[] = []
  for (const [i, filename] of parseMediaManifest(files['media'], choice.zstd)) {
    const bytes = files[String(i)]
    if (bytes) media.push({ filename, bytes: maybeDecompress(bytes) })
  }
  return { collection, media }
}
