import { useState } from 'react'
import type { Database } from 'sql.js'
import { importApkg, type ImportSummary } from '../db/import'

export interface ApkgImportProps {
  /** Test seam: inject a sql.js opener. Defaults to the app WASM loader. */
  openDb?: (bytes: Uint8Array) => Promise<Database>
}

/** Reusable .apkg picker with busy / error / summary states. */
export default function ApkgImport({ openDb }: ApkgImportProps) {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(null); setSummary(null)
    try {
      setSummary(await importApkg(file, openDb ? { openDb } : {}))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Choose .apkg file</span>
        <input
          aria-label="Choose .apkg file"
          type="file"
          // No `accept` filter: Safari iOS greys out files whose extension it
          // doesn't recognize (`.apkg` has no registered UTI), making them
          // un-selectable. importApkg() validates contents on parse instead.
          disabled={busy}
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-accent)] file:px-3 file:py-2 file:text-white"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </label>

      {busy && <p className="text-[var(--color-muted)]">Importing…</p>}

      {error && (
        <div className="rounded-xl border border-red-400 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </div>
      )}

      {summary && (
        <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm">
          <p className="font-medium">Imported {summary.decks} deck{summary.decks === 1 ? '' : 's'}.</p>
          <p className="text-[var(--color-muted)]">
            {summary.notes} notes · {summary.cards} cards · {summary.media} media · {summary.reviews} reviews
          </p>
          {summary.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[var(--color-muted)]">
              {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
