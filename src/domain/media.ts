export type MediaKind = 'image' | 'audio' | 'video' | 'other'

export function mediaKind(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}

// Inline reference embedded in a card field, e.g. "See [[media:1a2b]] closely".
const TOKEN_RE = /\[\[media:([^\]]+)\]\]/g

export function mediaToken(id: string): string {
  return `[[media:${id}]]`
}

export type FieldSegment =
  | { type: 'text'; value: string }
  | { type: 'media'; id: string }

export function parseField(text: string): FieldSegment[] {
  const segments: FieldSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, start) })
    segments.push({ type: 'media', id: match[1] })
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) })
  return segments
}

export function mediaIdsIn(...texts: string[]): string[] {
  const ids = new Set<string>()
  for (const text of texts) {
    for (const match of text.matchAll(TOKEN_RE)) ids.add(match[1])
  }
  return [...ids]
}
