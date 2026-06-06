// src/db/sessions.ts
import { db } from './db'
import type { StudySession } from './schema'
import { getDueCards } from './study'
import { buildSessionCards, type ComposeOptions } from '../domain/session'
import { startOfDay } from './stats'

export async function getActiveSession(): Promise<StudySession | undefined> {
  return db.sessions.where('status').equals('active').first()
}

export async function getSession(id: string): Promise<StudySession | undefined> {
  return db.sessions.get(id)
}

export async function startSession(
  deckId: string,
  opts: ComposeOptions,
  now: number = Date.now(),
): Promise<StudySession> {
  if (await getActiveSession()) throw new Error('A session is already active')
  const due = await getDueCards(deckId, now)
  const composed = buildSessionCards(due, opts)
  const session: StudySession = {
    id: crypto.randomUUID(),
    deckId,
    startedAt: now,
    status: 'active',
    cardIds: composed.cardIds,
    position: 0,
    newCount: composed.newCount,
    reviewCount: composed.reviewCount,
  }
  await db.sessions.add(session)
  return session
}

export async function advanceSession(
  id: string,
  now: number = Date.now(),
): Promise<StudySession> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id)
    if (!s) throw new Error(`Session not found: ${id}`)
    const position = s.position + 1
    const done = position >= s.cardIds.length
    const updated: StudySession = {
      ...s,
      position,
      status: done ? 'completed' : s.status,
      completedAt: done ? now : s.completedAt,
    }
    await db.sessions.put(updated)
    return updated
  })
}

export async function abandonSession(id: string): Promise<void> {
  await db.sessions.update(id, { status: 'abandoned' })
}

export async function completedSessionTimestamps(): Promise<number[]> {
  const sessions = await db.sessions.where('status').equals('completed').toArray()
  return sessions
    .map((s) => s.completedAt)
    .filter((t): t is number => typeof t === 'number')
}

export async function countDeckSessionsCompletedToday(
  deckId: string,
  now: number = Date.now(),
): Promise<number> {
  const dayStart = startOfDay(now)
  const sessions = await db.sessions.where('deckId').equals(deckId).toArray()
  return sessions.filter(
    (s) => s.status === 'completed' && s.completedAt != null && s.completedAt >= dayStart,
  ).length
}
