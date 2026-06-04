// Minimal protobuf wire-format reader — just enough to pull individual fields
// out of Anki's notetype/template `config` blobs. No dependency.
// Wire types: 0 = varint, 1 = 64-bit, 2 = length-delimited, 5 = 32-bit.

interface Cursor {
  bytes: Uint8Array
  pos: number
}

// Values we read (field tags, kind, string lengths) are small; using
// multiplication keeps larger skipped varints from corrupting the position.
function readVarint(c: Cursor): number {
  let result = 0
  let shift = 0
  for (;;) {
    const b = c.bytes[c.pos++]
    result += (b & 0x7f) * 2 ** shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return result
}

function skipField(c: Cursor, wireType: number): void {
  switch (wireType) {
    case 0: readVarint(c); break
    case 1: c.pos += 8; break
    case 2: { const len = readVarint(c); c.pos += len; break }
    case 5: c.pos += 4; break
    default: throw new Error(`Unsupported protobuf wire type ${wireType}`)
  }
}

export function readVarintField(bytes: Uint8Array, field: number): number | undefined {
  const c: Cursor = { bytes, pos: 0 }
  while (c.pos < bytes.length) {
    const tag = readVarint(c)
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (fieldNum === field && wireType === 0) return readVarint(c)
    skipField(c, wireType)
  }
  return undefined
}

export function readStringField(bytes: Uint8Array, field: number): string | undefined {
  const c: Cursor = { bytes, pos: 0 }
  while (c.pos < bytes.length) {
    const tag = readVarint(c)
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (fieldNum === field && wireType === 2) {
      const len = readVarint(c)
      const str = new TextDecoder().decode(bytes.subarray(c.pos, c.pos + len))
      c.pos += len
      return str
    }
    skipField(c, wireType)
  }
  return undefined
}

/**
 * Return the raw bytes of every length-delimited (wire type 2) occurrence of a
 * field — used for `repeated` fields, including repeated sub-messages (each
 * returned slice can be parsed again with these readers).
 */
export function readLengthDelimitedFields(bytes: Uint8Array, field: number): Uint8Array[] {
  const c: Cursor = { bytes, pos: 0 }
  const out: Uint8Array[] = []
  while (c.pos < bytes.length) {
    const tag = readVarint(c)
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (fieldNum === field && wireType === 2) {
      const len = readVarint(c)
      out.push(bytes.subarray(c.pos, c.pos + len))
      c.pos += len
    } else {
      skipField(c, wireType)
    }
  }
  return out
}
