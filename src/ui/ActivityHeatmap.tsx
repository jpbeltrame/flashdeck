// src/ui/ActivityHeatmap.tsx
import { useState } from 'react'
import type { ActivityDay } from '../domain/activity'

type Metric = 'cards' | 'sessions' | 'both'

const LEVEL_CLASS = [
  'bg-[var(--color-border)]',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-400 dark:bg-emerald-600',
  'bg-emerald-500 dark:bg-emerald-400',
]

// Per-metric bucket thresholds (value >= threshold ⇒ that level).
const THRESHOLDS: Record<Metric, number[]> = {
  cards: [1, 4, 8, 15],
  sessions: [1, 2, 3, 4],
  both: [1, 4, 8, 15],
}

function valueFor(d: ActivityDay, metric: Metric): number {
  if (metric === 'cards') return d.cards
  if (metric === 'sessions') return d.sessions
  return d.cards + d.sessions
}

function levelOf(value: number, metric: Metric): number {
  const t = THRESHOLDS[metric]
  let level = 0
  for (let i = 0; i < t.length; i++) if (value >= t[i]) level = i + 1
  return level
}

function dayLabel(date: number): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const METRICS: { key: Metric; label: string }[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'both', label: 'Both' },
]

export default function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const [metric, setMetric] = useState<Metric>('both')

  // Pad the start so the first column begins on the correct weekday row (0=Sun).
  const lead = days.length > 0 ? new Date(days[0].date).getDay() : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="flex gap-1 rounded-full border border-[var(--color-border)] p-0.5 text-xs">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={`rounded-full px-2 py-0.5 ${
                metric === key
                  ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1 w-max">
          {Array.from({ length: lead }, (_, i) => (
            <div key={`pad-${i}`} className="h-3 w-3" />
          ))}
          {days.map((d) => {
            const v = valueFor(d, metric)
            return (
              <div
                key={d.date}
                title={`${dayLabel(d.date)}: ${d.cards} cards, ${d.sessions} sessions`}
                className={`h-3 w-3 rounded-sm ${LEVEL_CLASS[levelOf(v, metric)]}`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
