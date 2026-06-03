import { describe, expect, it } from 'vitest'
import { mediaKind, mediaToken, parseField, mediaIdsIn } from './media'

describe('mediaKind', () => {
  it('classifies by MIME prefix', () => {
    expect(mediaKind('image/png')).toBe('image')
    expect(mediaKind('audio/mpeg')).toBe('audio')
    expect(mediaKind('video/mp4')).toBe('video')
    expect(mediaKind('application/pdf')).toBe('other')
  })
})

describe('mediaToken', () => {
  it('wraps an id in the token syntax', () => {
    expect(mediaToken('abc-123')).toBe('[[media:abc-123]]')
  })
})

describe('parseField', () => {
  it('returns a single text segment when there are no tokens', () => {
    expect(parseField('just text')).toEqual([{ type: 'text', value: 'just text' }])
  })

  it('splits text around a token', () => {
    expect(parseField('before [[media:m1]] after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'media', id: 'm1' },
      { type: 'text', value: ' after' },
    ])
  })

  it('handles a token at the very start and multiple tokens', () => {
    expect(parseField('[[media:m1]]x[[media:m2]]')).toEqual([
      { type: 'media', id: 'm1' },
      { type: 'text', value: 'x' },
      { type: 'media', id: 'm2' },
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseField('')).toEqual([])
  })
})

describe('mediaIdsIn', () => {
  it('collects unique ids across several fields', () => {
    expect(mediaIdsIn('a [[media:m1]] b', 'c [[media:m2]] [[media:m1]]')).toEqual(['m1', 'm2'])
  })

  it('returns an empty array when no tokens are present', () => {
    expect(mediaIdsIn('plain', 'text')).toEqual([])
  })
})
