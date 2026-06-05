import type { Card, Deck, Note, ReviewLog } from '../../db/schema'

/** A note-type template (one per generated Basic card; Cloze uses a single template). */
export interface AnkiTemplate {
  name: string
  ord: number
  qfmt: string
  afmt: string
}

/** A parsed Anki note type ("model"). `type` 0 = standard/Basic, 1 = Cloze. */
export interface AnkiModel {
  id: string
  name: string
  type: 0 | 1
  css?: string
  flds: { name: string; ord: number }[]
  tmpls: AnkiTemplate[]
}

export interface AnkiDeck {
  id: string
  name: string
}

export interface AnkiNoteRow {
  id: number
  mid: string // model id
  flds: string // 0x1f-separated field values
}

export interface AnkiCardRow {
  id: number
  nid: number // note id
  did: number // deck id
  ord: number // template index (Basic) or cloze ordinal (Cloze)
  type: number // 0 new, 1 learning, 2 review, 3 relearning
  queue: number
  due: number
  ivl: number // positive = days, negative = seconds
  factor: number // ease * 1000 (0 when never reviewed)
  reps: number
  lapses: number
}

export interface AnkiRevlogRow {
  id: number // epoch milliseconds
  cid: number // card id
  ease: number // 1..4
  ivl: number
  lastIvl: number
  factor: number
}

/** A single media file pulled out of the .apkg zip. */
export interface MediaFile {
  filename: string
  bytes: Uint8Array
}

/** Everything to persist except media bytes (streamed separately), produced purely. */
export interface ImportResult {
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  /** filename → media id; the streamed media payloads are persisted under these ids. */
  idByFilename: Map<string, string>
  reviews: ReviewLog[]
  warnings: string[]
}
