import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { zstdCompressSync } from 'node:zlib'
import { selectCollectionName, unzipApkg } from './unzip'
import { encodeMediaEntries } from './__fixtures__/build-apkg'

describe('selectCollectionName', () => {
  it('prefers anki21b, then anki21, then anki2', () => {
    expect(selectCollectionName(['collection.anki2', 'collection.anki21', 'collection.anki21b']))
      .toEqual({ name: 'collection.anki21b', zstd: true })
    expect(selectCollectionName(['collection.anki2', 'collection.anki21']))
      .toEqual({ name: 'collection.anki21', zstd: false })
    expect(selectCollectionName(['collection.anki2']))
      .toEqual({ name: 'collection.anki2', zstd: false })
  })

  it('returns null when no collection entry is present', () => {
    expect(selectCollectionName(['media', '0'])).toBeNull()
  })
})

describe('unzipApkg', () => {
  it('extracts an uncompressed collection and maps media by number', () => {
    const zip = zipSync({
      'collection.anki2': strToU8('SQLITE-BYTES'),
      media: strToU8(JSON.stringify({ '0': 'cat.jpg', '1': 'meow.mp3' })),
      '0': strToU8('JPEGDATA'),
      '1': strToU8('MP3DATA'),
    })
    const out = unzipApkg(zip)
    expect(new TextDecoder().decode(out.collection)).toBe('SQLITE-BYTES')
    expect(out.media).toEqual([
      { filename: 'cat.jpg', bytes: expect.any(Uint8Array) },
      { filename: 'meow.mp3', bytes: expect.any(Uint8Array) },
    ])
    expect(new TextDecoder().decode(out.media[0].bytes)).toBe('JPEGDATA')
  })

  it('parses the v3 media manifest (zstd protobuf) and maps files by index', () => {
    const raw = strToU8('SQLITE')
    const zip = zipSync({
      'collection.anki21b': new Uint8Array(zstdCompressSync(raw)),
      media: new Uint8Array(zstdCompressSync(encodeMediaEntries(['cat.jpg', 'meow.mp3']))),
      '0': strToU8('JPEGDATA'),
      '1': strToU8('MP3DATA'),
    })
    const out = unzipApkg(zip)
    expect(new TextDecoder().decode(out.collection)).toBe('SQLITE')
    expect(out.media).toEqual([
      { filename: 'cat.jpg', bytes: expect.any(Uint8Array) },
      { filename: 'meow.mp3', bytes: expect.any(Uint8Array) },
    ])
    expect(new TextDecoder().decode(out.media[0].bytes)).toBe('JPEGDATA')
  })

  it('zstd-decompresses an anki21b collection', () => {
    const raw = strToU8('DECOMPRESSED-SQLITE')
    const zip = zipSync({
      'collection.anki21b': new Uint8Array(zstdCompressSync(raw)),
      media: new Uint8Array(zstdCompressSync(encodeMediaEntries([]))),
    })
    const out = unzipApkg(zip)
    expect(new TextDecoder().decode(out.collection)).toBe('DECOMPRESSED-SQLITE')
    expect(out.media).toEqual([])
  })

  it('throws a clear error when there is no collection', () => {
    const zip = zipSync({ media: strToU8('{}') })
    expect(() => unzipApkg(zip)).toThrow(/no Anki collection/i)
  })
})
