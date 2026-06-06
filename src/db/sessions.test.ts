// src/db/sessions.test.ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTextCard } from './cards'
import {
  startSession, getActiveSession, getSession, advanceSession, abandonSession,
  completedSessionTimestamps, countDeckSessionsCompletedToday,
} from './sessions'

const NOW = new Date(2026, 5, 5, 9, 0, 0).getTime()
const OPTS = { length: 10, newRatio: 0.6 }

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seed(deckId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await createTextCard({ deckId, front: `${deckId}-${i}`, back: 'a' })
  }
}

describe('startSession', () => {
  it('creates an active session with a composed card set', async () => {
    await seed('d1', 3)
    const s = await startSession('d1', OPTS, NOW)
    expect(s.status).toBe('active')
    expect(s.cardIds).toHaveLength(3)
    expect(s.position).toBe(0)
    expect(await getActiveSession()).toMatchObject({ id: s.id })
  })

  it('refuses to start when a session is already active', async () => {
    await seed('d1', 3)
    await startSession('d1', OPTS, NOW)
    await expect(startSession('d2', OPTS, NOW)).rejects.toThrow(/active/i)
  })
})

describe('advanceSession', () => {
  it('advances position and completes at the end', async () => {
    await seed('d1', 2)
    const s = await startSession('d1', OPTS, NOW)
    const a1 = await advanceSession(s.id, NOW)
    expect(a1.position).toBe(1)
    expect(a1.status).toBe('active')
    const a2 = await advanceSession(s.id, NOW)
    expect(a2.position).toBe(2)
    expect(a2.status).toBe('completed')
    expect(a2.completedAt).toBe(NOW)
    // A completed session frees the active slot.
    expect(await getActiveSession()).toBeUndefined()
  })
})

describe('abandonSession', () => {
  it('marks abandoned and frees the active slot', async () => {
    await seed('d1', 2)
    const s = await startSession('d1', OPTS, NOW)
    await abandonSession(s.id)
    expect((await getSession(s.id))?.status).toBe('abandoned')
    expect(await getActiveSession()).toBeUndefined()
  })
})

describe('completion queries', () => {
  it('lists completed timestamps and counts deck completions today', async () => {
    await seed('d1', 1)
    const s = await startSession('d1', OPTS, NOW)
    await advanceSession(s.id, NOW) // completes (1 card)
    expect(await completedSessionTimestamps()).toEqual([NOW])
    expect(await countDeckSessionsCompletedToday('d1', NOW)).toBe(1)
    expect(await countDeckSessionsCompletedToday('d2', NOW)).toBe(0)
  })
})
