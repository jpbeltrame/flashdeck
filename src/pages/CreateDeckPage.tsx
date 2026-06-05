import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDeck } from '../db/decks'
import Button from '../ui/Button'
import ApkgImport from '../ui/ApkgImport'

const fieldClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'

export default function CreateDeckPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    const deck = await createDeck(trimmed, description.trim() || undefined)
    navigate(`/deck/${deck.id}`)
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Create deck</h1>

      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); create() }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Biology"
            className={fieldClass}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={3}
            className={`${fieldClass} resize-y`}
          />
        </label>

        <Button type="submit" disabled={!name.trim()}>Create deck</Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        or import an existing deck
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <ApkgImport />
    </section>
  )
}
