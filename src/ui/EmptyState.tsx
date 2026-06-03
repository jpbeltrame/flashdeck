import type { ReactNode } from 'react'

export default function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="text-center py-16">
      <p className="font-medium">{title}</p>
      {hint && <p className="text-[var(--color-muted)] text-sm mt-1">{hint}</p>}
    </div>
  )
}
