export interface Deck {
  id: string
  name: string
  description?: string
  parentId?: string
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  deckId: string
  type: 'basic' | 'cloze'
  /** Render mode for fields. Absent or 'text' = plain text (own-created cards); 'html' = sanitized HTML (Anki imports). */
  format?: 'text' | 'html'
  /** Note-type stylesheet (imported Anki notes); applied when rendering in the card iframe. */
  css?: string
  fields: Record<string, string>
  mediaRefs: string[]
}

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning'

export interface Card {
  id: string
  noteId: string
  deckId: string
  templateIndex: number
  srs: {
    status: CardStatus
    ease: number
    intervalDays: number
    dueDate: number
    reps: number
    lapses: number
  }
}

export interface MediaAsset {
  id: string
  blob: Blob
  mime: string
  filename: string
}

export interface ReviewLog {
  id: string
  cardId: string
  ts: number
  rating: 1 | 2 | 3 | 4
  intervalBefore: number
  intervalAfter: number
  ease: number
}

export interface Schedule {
  id: string
  scope: string // a deckId, or the literal 'combined'
  times: string[] // 'HH:MM'
  daysOfWeek: number[] // 0–6, Sunday=0
  remindBeforeMin: number
  enabled: boolean
}
