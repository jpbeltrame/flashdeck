import Dexie, { type EntityTable } from 'dexie'
import type {
  Deck, Note, Card, MediaAsset, ReviewLog, Schedule,
} from './schema'

export class FlashDeckDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  media!: EntityTable<MediaAsset, 'id'>
  reviews!: EntityTable<ReviewLog, 'id'>
  schedules!: EntityTable<Schedule, 'id'>

  constructor() {
    super('flashdeck')
    this.version(1).stores({
      decks: 'id, parentId, updatedAt',
      notes: 'id, deckId, type',
      cards: 'id, noteId, deckId, srs.dueDate, srs.status',
      media: 'id, filename',
      reviews: 'id, cardId, ts',
      schedules: 'id, scope',
    })
  }
}

export const db = new FlashDeckDB()
