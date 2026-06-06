import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getDueCards, applyReview } from '../db/study'
import type { Card } from '../db/schema'
import type { Rating } from '../domain/srs'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import RenderedField from '../ui/RenderedField'
import CardFrame from '../ui/CardFrame'

const RATINGS: { label: string; rating: Rating; variant: 'ghost' | 'primary' }[] = [
  { label: 'Again', rating: 1, variant: 'ghost' },
  { label: 'Hard', rating: 2, variant: 'ghost' },
  { label: 'Good', rating: 3, variant: 'primary' },
  { label: 'Easy', rating: 4, variant: 'ghost' },
]

export default function StudyPage() {
  const [params] = useSearchParams()
  const scope = params.get('deck') ?? 'all'

  const [queue, setQueue] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  // Load the queue once at session start (snapshot, so re-scheduled cards don't reappear).
  useEffect(() => {
    let active = true
    getDueCards(scope, Date.now(), 200).then((cards) => {
      if (active) setQueue(cards)
    })
    return () => { active = false }
  }, [scope])

  const current = queue?.[index]
  const note = useLiveQuery(
    () => (current ? db.notes.get(current.noteId) : undefined),
    [current?.noteId],
  )

  if (queue === null) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (queue.length === 0) {
    return <EmptyState title="Nothing due right now." hint="Come back later or add more cards." />
  }

  if (!current) {
    return (
      <EmptyState
        title="All done! 🎉"
        hint={`You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'} this session.`}
      />
    )
  }

  async function rate(rating: Rating) {
    if (!current) return
    await applyReview(current.id, rating)
    setRevealed(false)
    setReviewed((n) => n + 1)
    setIndex((i) => i + 1)
  }

  return (
    <section className="space-y-6">
      <div className="text-xs text-[var(--color-muted)] text-center">
        {index + 1} / {queue.length}
      </div>

      <div
        className={
          note?.format === 'html'
            ? // HTML cards bring their own note-type CSS (padding + background),
              // so the container only supplies the rounded frame — no extra
              // padding to double up with the card's own and waste width.
              'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden min-h-40 flex items-center justify-center'
            : 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center min-h-40 flex items-center justify-center'
        }
      >
        {note?.format === 'html' ? (
          // Imported cards render faithfully (note-type CSS + JS) in a sandboxed
          // iframe, using Anki's replace flow: front, then back on reveal.
          <div className="w-full">
            <CardFrame html={revealed ? note.fields.Back : note.fields.Front} css={note.css} seedKey={current.id} />
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
