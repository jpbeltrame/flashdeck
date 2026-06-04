import { describe, expect, it } from 'vitest'
import { readVarintField, readStringField } from './protobuf'

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
