// src/ui/SessionRunner.tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { applyReview } from '../db/study'
import {
  getActiveSession, startSession, advanceSession, abandonSession,
} from '../db/sessions'
import { useSettingsStore } from '../stores/settingsStore'
import type { StudySession } from '../db/schema'
import type { Rating } from '../domain/srs'
import Button from './Button'
import EmptyState from './EmptyState'
import RenderedField from './RenderedField'
import CardFrame from './CardFrame'

const RATINGS: { label: string; rating: Rating; variant: 'ghost' | 'primary' }[] = [
  { label: 'Again', rating: 1, variant: 'ghost' },
  { label: 'Hard', rating: 2, variant: 'ghost' },
  { label: 'Good', rating: 3, variant: 'primary' },
  { label: 'Easy', rating: 4, variant: 'ghost' },
]

export default function SessionRunner({ deckId }: { deckId: string }) {
  const navigate = useNavigate()
  const sessionLength = useSettingsStore((s) => s.sessionLength)
  const newRatio = useSettingsStore((s) => s.newRatio)

  const [session, setSession] = useState<StudySession | null>(null)
  const [conflict, setConflict] = useState<StudySession | null>(null)
  const [revealed, setRevealed] = useState(false)
  const initFor = useRef<string | null>(null)

  useEffect(() => {
    if (initFor.current === deckId) return
    initFor.current = deckId
    let cancelled = false
    ;(async () => {
      const active = await getActiveSession()
      if (cancelled) return
      if (active && active.deckId !== deckId) {
        setConflict(active)
        return
      }
      if (active) {
        setSession(active)
        return
      }
      try {
        const started = await startSession(deckId, { length: sessionLength, newRatio })
        if (!cancelled) setSession(started)
      } catch {
        // Race (e.g. StrictMode double-invoke): adopt whatever became active.
        const now = await getActiveSession()
        if (cancelled || !now) return
        if (now.deckId === deckId) setSession(now)
        else setConflict(now)
      }
    })()
    return () => { cancelled = true }
  }, [deckId, sessionLength, newRatio])

  const conflictDeck = useLiveQuery(
    () => (conflict ? db.decks.get(conflict.deckId) : undefined),
    [conflict?.deckId],
  )

  const cardId =
    session && session.position < session.cardIds.length
      ? session.cardIds[session.position]
      : undefined
  const card = useLiveQuery(() => (cardId ? db.cards.get(cardId) : undefined), [cardId])
  const note = useLiveQuery(
    () => (card ? db.notes.get(card.noteId) : undefined),
    [card?.noteId],
  )

  if (conflict) {
    return (
      <div className="space-y-5 py-10 text-center">
        <p className="text-[var(--color-muted)]">
          You have an active session in{' '}
          <span className="font-medium text-[var(--color-text)]">
            {conflictDeck?.name ?? 'another deck'}
          </span>.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => navigate(`/study?deck=${conflict.deckId}`)}>Resume it</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await abandonSession(conflict.id)
              const started = await startSession(deckId, { length: sessionLength, newRatio })
              setConflict(null)
              setSession(started)
            }}
          >
            Discard &amp; start here
          </Button>
        </div>
      </div>
    )
  }

  if (!session) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (session.cardIds.length === 0) {
    return <EmptyState title="Nothing due right now." hint="Come back later or add more cards." />
  }

  if (session.position >= session.cardIds.length) {
    return (
      <EmptyState
        title="Session complete! 🎉"
        hint={`You studied ${session.cardIds.length} card${session.cardIds.length === 1 ? '' : 's'}.`}
      />
    )
  }

  async function rate(rating: Rating) {
    if (!session || !cardId) return
    await applyReview(cardId, rating)
    const updated = await advanceSession(session.id)
    setRevealed(false)
    setSession(updated)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>{session.position + 1} / {session.cardIds.length}</span>
        <button
          className="underline"
          onClick={async () => { await abandonSession(session.id); navigate(`/deck/${deckId}`) }}
        >
          Abandon
        </button>
      </div>

      <div
        className={
          note?.format === 'html'
            ? 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden min-h-40 flex items-center justify-center'
            : 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center min-h-40 flex items-center justify-center'
        }
      >
        {note?.format === 'html' ? (
          <div className="w-full">
            <CardFrame html={revealed ? note.fields.Back : note.fields.Front} css={note.css} seedKey={cardId} />
          </div>
        ) : (
          <div className="text-lg">
            {note && <RenderedField text={note.fields.Front} format={note.format} />}
            {revealed && note && (
              <>
                <hr className="my-4 border-[var(--color-border)]" />
                <div className="text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
              </>
            )}
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <Button key={r.rating} variant={r.variant} onClick={() => rate(r.rating)}>
              {r.label}
            </Button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setRevealed(true)}>
          Show answer
        </Button>
      )}
    </section>
  )
}
