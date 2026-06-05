import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDecks, createDeck, renameDeck, deleteDeck } from '../db/decks'
import { db } from '../db/db'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'

function useDeckCounts() {
  // Recompute counts whenever cards change.
  return useLiveQuery(async () => {
    const decks = await listDecks()
    const now = Date.now()
    const cards = await db.cards.toArray()
    return decks.map((deck) => {
      const mine = cards.filter((c) => c.deckId === deck.id)
      return {
        deck,
        total: mine.length,
        due: mine.filter((c) => c.srs.dueDate <= now).length,
      }
    })
  }, [])
}

export default function DecksPage() {
  const rows = useDeckCounts()
  const [name, setName] = useState('')

  async function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createDeck(trimmed)
    setName('')
  }

  async function rename(id: string, current: string) {
    const next = window.prompt('Rename deck', current)
    if (next && next.trim()) await renameDeck(id, next.trim())
  }

  async function remove(id: string, deckName: string) {
    if (window.confirm(`Delete "${deckName}" and all its cards?`)) await deleteDeck(id)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Decks</h1>
        <Link to="/import" className="text-sm text-[var(--color-accent)] font-medium">
          Import .apkg
        </Link>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New deck name"
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <Button onClick={add}>Add deck</Button>
      </div>

      {rows && rows.length === 0 && (
        <EmptyState title="No decks yet." hint="Create your first deck above." />
      )}

      <div className="space-y-3">
        {rows?.map(({ deck, total, due }) => (
          <Card key={deck.id} className="flex items-center gap-3">
            <Link to={`/deck/${deck.id}`} className="flex-1">
              <div className="font-medium">{deck.name}</div>
              <div className="text-xs text-[var(--color-muted)]">
                {total} cards · {due} due
              </div>
            </Link>
            <Button variant="ghost" onClick={() => rename(deck.id, deck.name)}>Rename</Button>
            <Button variant="danger" onClick={() => remove(deck.id, deck.name)}>Delete</Button>
          </Card>
        ))}
      </div>
    </section>
  )
}
