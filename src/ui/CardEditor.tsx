import { useState } from 'react'
import Button from './Button'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

export interface CardEditorProps {
  initialFront?: string
  initialBack?: string
  submitLabel: string
  onSubmit: (front: string, back: string) => void | Promise<void>
  onCancel?: () => void
}

export default function CardEditor({
  initialFront = '',
  initialBack = '',
  submitLabel,
  onSubmit,
  onCancel,
}: CardEditorProps) {
  const [front, setFront] = useState(initialFront)
  const [back, setBack] = useState(initialBack)

  async function submit() {
    if (!front.trim() || !back.trim()) return
    await onSubmit(front.trim(), back.trim())
    setFront('')
    setBack('')
  }

  function attach(side: 'front' | 'back', file: File | undefined) {
    if (!file) return
    // Generate the ID synchronously so the token is appended immediately (before the async DB write)
    const id = crypto.randomUUID()
    const token = mediaToken(id)
    const append = (prev: string) => (prev ? `${prev}\n${token}` : token)
    if (side === 'front') setFront(append)
    else setBack(append)
    // Persist to DB asynchronously (fire-and-forget in the event handler)
    addMedia(file, file.name, file.type || 'application/octet-stream', id).catch(console.error)
  }

  const field = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'
  const fileInput = 'block text-xs text-[var(--color-muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--color-surface)] file:px-2 file:py-1'

  return (
    <div className="space-y-2">
      <textarea aria-label="Front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" rows={2} className={field} />
      <input
        aria-label="Attach to front"
        type="file"
        accept="image/*,audio/*,video/*"
        className={fileInput}
        onChange={(e) => { attach('front', e.target.files?.[0]); e.target.value = '' }}
      />
      {front.trim() && (
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <RenderedField text={front} />
        </div>
      )}

      <textarea aria-label="Back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" rows={2} className={field} />
      <input
        aria-label="Attach to back"
        type="file"
        accept="image/*,audio/*,video/*"
        className={fileInput}
        onChange={(e) => { attach('back', e.target.files?.[0]); e.target.value = '' }}
      />
      {back.trim() && (
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <RenderedField text={back} />
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={submit}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  )
}
