import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useVirtualizer } from '@tanstack/react-virtual'
import { db } from '../db/db'
import { listCardsByDeck, createTextCard, updateTextCard, deleteCard } from '../db/cards'
import { countDeckSessionsCompletedToday } from '../db/sessions'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import CardEditor from '../ui/CardEditor'
import CardFrame from '../ui/CardFrame'
import RenderedField from '../ui/RenderedField'

export default function DeckDetailPage() {
  const { id = '' } = useParams()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const rows = useLiveQuery(() => listCardsByDeck(id), [id])
  const doneToday = useLiveQuery(() => countDeckSessionsCompletedToday(id), [id])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 240,
    overscan: 4,
  })

  return (
    <section className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-xs text-[var(--color-muted)]">← Decks</Link>
          <h1 className="text-xl font-semibold">{deck?.name ?? 'Deck'}</h1>
          {doneToday ? (
            <p className="text-xs text-[var(--color-muted)]">
              {doneToday} session{doneToday === 1 ? '' : 's'} completed today
            </p>
          ) : null}
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

      <div ref={parentRef} className="-mx-1 flex-1 overflow-y-auto px-1">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const { card, note } = rows![vi.index]
            return (
              <div
                key={card.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                {editingId === note.id ? (
                  <Card>
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
                  <Card className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {note.format === 'html' ? (
                        <CardFrame html={note.fields.Front} css={note.css} seedKey={note.id} />
                      ) : (
                        <>
                          <div className="font-medium"><RenderedField text={note.fields.Front} format={note.format} /></div>
                          <div className="text-sm text-[var(--color-muted)]"><RenderedField text={note.fields.Back} format={note.format} /></div>
                        </>
                      )}
                    </div>
                    <Button variant="ghost" onClick={() => setEditingId(note.id)}>Edit</Button>
                    <Button variant="danger" onClick={() => deleteCard(card.id)}>Delete</Button>
                  </Card>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
