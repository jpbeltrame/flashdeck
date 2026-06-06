import { useSettingsStore } from '../stores/settingsStore'

const fieldClass =
  'w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm'

export default function SettingsPage() {
  const sessionLength = useSettingsStore((s) => s.sessionLength)
  const newRatio = useSettingsStore((s) => s.newRatio)
  const setSessionLength = useSettingsStore((s) => s.setSessionLength)
  const setNewRatio = useSettingsStore((s) => s.setNewRatio)

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-[var(--color-muted)] mt-1">App settings.</p>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Study
      </h2>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Study session length</span>
        <input
          type="number"
          min={1}
          step={1}
          value={sessionLength}
          onChange={(e) => setSessionLength(e.target.valueAsNumber)}
          className={fieldClass}
        />
        <span className="block text-xs text-[var(--color-muted)]">
          How many cards each study session serves up.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">New cards: {Math.round(newRatio * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(newRatio * 100)}
          onChange={(e) => setNewRatio(e.target.valueAsNumber / 100)}
          className="w-full"
        />
        <span className="block text-xs text-[var(--color-muted)]">
          Target mix of new vs review cards per session. Once a deck has no new cards
          left, sessions become all-review.
        </span>
      </label>
    </section>
  )
}
