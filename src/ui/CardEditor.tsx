import { useState } from 'react'
import Button from './Button'

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

  const field = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'

  return (
    <div className="space-y-2">
      <textarea aria-label="Front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" rows={2} className={field} />
      <textarea aria-label="Back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" rows={2} className={field} />
      <div className="flex gap-2">
        <Button onClick={submit}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  )
}
