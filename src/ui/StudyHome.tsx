// src/ui/StudyHome.tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDecks } from '../db/decks'
import { db } from '../db/db'
import { getActiveSession } from '../db/sessions'
import Card from './Card'
import EmptyState from './EmptyState'

export default function StudyHome() {
  const data = useLiveQuery(async () => {
    const decks = await listDecks()
    const now = Date.now()
    const cards = await db.cards.toArray()
    const active = await getActiveSession()
    return {
      active,
      decks: decks.map((deck) => ({
        deck,
        due: cards.filter((c) => c.deckId === deck.id && c.srs.dueDate <= now).length,
      })),
    }
  }, [])

  if (!data) return <p className="text-[var(--color-muted)]">Loading…</p>

  if (data.decks.length === 0) {
    return <EmptyState title="No decks to study." hint="Create or import a deck first." />
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Study</h1>

      {data.active && (
        <Link to={`/study?deck=${data.active.deckId}`} className="block">
          <Card className="flex items-center justify-between border-[var(--color-accent)]">
            <span className="font-medium text-[var(--color-accent)]">Resume active session</span>
            <span className="text-xs text-[var(--color-muted)]">
              {data.active.position}/{data.active.cardIds.length}
            </span>
          </Card>
        </Link>
      )}

      <div className="space-y-3">
        {data.decks.map(({ deck, due }) => (
          <Link key={deck.id} to={`/study?deck=${deck.id}`} className="block">
            <Card className="flex items-center justify-between">
              <span className="font-medium">{deck.name}</span>
              <span className="text-xs text-[var(--color-muted)]">{due} due</span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
