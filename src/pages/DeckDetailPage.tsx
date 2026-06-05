import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { listCardsByDeck, createTextCard, updateTextCard, deleteCard } from '../db/cards'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import CardEditor from '../ui/CardEditor'
import RenderedField from '../ui/RenderedField'

export default function DeckDetailPage() {
  const { id = '' } = useParams()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const rows = useLiveQuery(() => listCardsByDeck(id), [id])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-xs text-[var(--color-muted)]">← Decks</Link>
          <h1 className="text-xl font-semibold">{deck?.name ?? 'Deck'}</h1>
        </div>
        <Link to={`/study?deck=${id}`}>
          <Button>Study</Button>
        </Link>
      </div>

      {adding ? (
        <Card>
          <CardEditor
            submitLabel="Save card"
            onCancel={() => setAdding(false)}
            onSubmit={async (front, back) => {
              await createTextCard({ deckId: id, front, back })
              setAdding(false)
            }}
          />
        </Card>
      ) : (
        <Button variant="ghost" onClick={() => setAdding(true)}>+ Add card</Button>
      )}

      {rows && rows.length === 0 && !adding && (
        <EmptyState title="No cards yet." hint="Add your first card above." />
      )}

      <div className="space-y-3">
        {rows?.map(({ card, note }) =>
          editingId === note.id ? (
            <Card key={card.id}>
              <CardEditor
                initialFront={note.fields.Front}
                initialBack={note.fields.Back}
                submitLabel="Update"
                onCancel={() => setEditingId(null)}
                onSubmit={async (front, back) => {
                  await updateTextCard(note.id, front, back)
                  setEditingId(null)
                }}
              />
            </Card>
          ) : (
            <Card key={card.id} className="flex items-start gap-3">
              <div className="flex-1 space-y-1">
                <div className="font-medium"><RenderedField text={note.fields.Front} format={note.format} /></div>
                {note.format !== 'html' && (
                  <div className="text-sm text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
                )}
              </div>
              <Button variant="ghost" onClick={() => setEditingId(note.id)}>Edit</Button>
              <Button variant="danger" onClick={() => deleteCard(card.id)}>Delete</Button>
            </Card>
          ),
        )}
      </div>
    </section>
  )
}
