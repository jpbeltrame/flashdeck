import { describe, expect, it } from 'vitest'
import { readVarintField, readStringField, readLengthDelimitedFields } from './protobuf'

describe('readVarintField', () => {
  it('reads a varint field by number', () => {
    expect(readVarintField(new Uint8Array([0x08, 0x01]), 1)).toBe(1)
  })
  it('returns undefined when the field is absent', () => {
    expect(readVarintField(new Uint8Array([0x08, 0x01]), 2)).toBeUndefined()
  })
  it('skips a preceding string field to reach a later varint field', () => {
    expect(readVarintField(new Uint8Array([0x0a, 0x01, 0x51, 0x10, 0x01]), 2)).toBe(1)
  })
})

describe('readStringField', () => {
  it('reads a length-delimited string field', () => {
    expect(readStringField(new Uint8Array([0x0a, 0x01, 0x51]), 1)).toBe('Q')
  })
  it('reads the second string field after the first', () => {
    const bytes = new Uint8Array([0x0a, 0x01, 0x51, 0x12, 0x01, 0x41])
    expect(readStringField(bytes, 1)).toBe('Q')
    expect(readStringField(bytes, 2)).toBe('A')
  })
  it('returns undefined for a missing string field', () => {
    expect(readStringField(new Uint8Array([0x08, 0x01]), 1)).toBeUndefined()
  })
})

describe('readLengthDelimitedFields', () => {
  it('returns every length-delimited value for a repeated field, in order', () => {
    // repeated field 1: "Q" (0x0a 0x01 0x51) then "A" (0x0a 0x01 0x41)
    const bytes = new Uint8Array([0x0a, 0x01, 0x51, 0x0a, 0x01, 0x41])
    const parts = readLengthDelimitedFields(bytes, 1)
    expect(parts.map((p) => new TextDecoder().decode(p))).toEqual(['Q', 'A'])
  })

  it('reads sub-messages so a nested string field can be extracted', () => {
    // field 1 = sub-message { field 1 (string) = "cat.jpg" }
    const name = [...new TextEncoder().encode('cat.jpg')]
    const sub = [0x0a, name.length, ...name] // inner: field 1, len, bytes
    const bytes = new Uint8Array([0x0a, sub.length, ...sub]) // outer: field 1, len, sub
    const entries = readLengthDelimitedFields(bytes, 1)
    expect(entries).toHaveLength(1)
    expect(readStringField(entries[0], 1)).toBe('cat.jpg')
  })

  it('returns an empty array when the field is absent', () => {
    expect(readLengthDelimitedFields(new Uint8Array([0x08, 0x01]), 1)).toEqual([])
  })
})
