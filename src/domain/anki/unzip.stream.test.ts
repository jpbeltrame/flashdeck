import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { zstdCompressSync } from 'node:zlib'
import { readApkgHeader, streamApkgMedia } from './unzip'
import { encodeMediaEntries } from './__fixtures__/build-apkg'

/** A ReadableStream that emits `bytes` in small chunks, so entries span chunk
 *  boundaries (exercises the streaming reader's buffering/backpressure). */
function streamOf(bytes: Uint8Array, chunkSize = 7): ReadableStream<Uint8Array> {
  let pos = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos >= bytes.length) return controller.close()
      const end = Math.min(pos + chunkSize, bytes.length)
      controller.enqueue(bytes.slice(pos, end))
      pos = end
    },
  })
}

// Mirrors a real .apkg layout: collection first, numbered media payloads, then
// the `media` manifest LAST — the v3 ordering that breaks manifest-before-media
// assumptions.
function legacyApkg(): Uint8Array {
  return zipSync({
    'collection.anki2': strToU8('SQLITE-BYTES'),
    '0': strToU8('JPEGDATA'),
    '1': strToU8('MP3DATA'),
    media: strToU8(JSON.stringify({ '0': 'cat.jpg', '1': 'meow.mp3' })),
  })
}

function modernApkg(): Uint8Array {
  return zipSync({
    'collection.anki21b': new Uint8Array(zstdCompressSync(strToU8('DECOMPRESSED'))),
    '0': strToU8('JPEGDATA'),
    '1': strToU8('MP3DATA'),
    media: new Uint8Array(zstdCompressSync(encodeMediaEntries(['cat.jpg', 'meow.mp3']))),
  })
}

describe('readApkgHeader (streaming pass 1)', () => {
  it('reads the legacy collection and the manifest even when it comes last', async () => {
    const { collection, filenames } = await readApkgHeader(streamOf(legacyApkg()))
    expect(new TextDecoder().decode(collection)).toBe('SQLITE-BYTES')
    expect([...filenames.entries()]).toEqual([[0, 'cat.jpg'], [1, 'meow.mp3']])
  })

  it('zstd-decompresses an anki21b collection and parses the protobuf manifest', async () => {
    const { collection, filenames } = await readApkgHeader(streamOf(modernApkg()))
    expect(new TextDecoder().decode(collection)).toBe('DECOMPRESSED')
    expect([...filenames.values()]).toEqual(['cat.jpg', 'meow.mp3'])
  })

  it('throws a clear error when there is no collection entry', async () => {
    const zip = zipSync({ media: strToU8('{}') })
    await expect(readApkgHeader(streamOf(zip))).rejects.toThrow(/no Anki collection/i)
  })
})

describe('streamApkgMedia (streaming pass 2)', () => {
  it('yields each media payload once, resolving index→filename from the map', async () => {
    const filenames = new Map([[0, 'cat.jpg'], [1, 'meow.mp3']])
    const seen: { filename: string; text: string }[] = []
    await streamApkgMedia(streamOf(legacyApkg()), filenames, (filename, bytes) => {
      seen.push({ filename, text: new TextDecoder().decode(bytes) })
    })
    expect(seen).toEqual([
      { filename: 'cat.jpg', text: 'JPEGDATA' },
      { filename: 'meow.mp3', text: 'MP3DATA' },
    ])
  })

  it('awaits an async onMedia before reading the next entry (backpressure)', async () => {
    const filenames = new Map([[0, 'cat.jpg'], [1, 'meow.mp3']])
    let inFlight = 0
    let maxInFlight = 0
    await streamApkgMedia(streamOf(legacyApkg(), 3), filenames, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
    })
    expect(maxInFlight).toBe(1)
  })
})
