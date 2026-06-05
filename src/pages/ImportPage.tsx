import ApkgImport, { type ApkgImportProps } from '../ui/ApkgImport'

export type ImportPageProps = ApkgImportProps

export default function ImportPage({ openDb }: ImportPageProps) {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Import</h1>
        <p className="text-[var(--color-muted)] mt-1">Import an Anki .apkg deck (Basic + Cloze, media, history).</p>
      </div>

      <ApkgImport openDb={openDb} />
    </section>
  )
}
