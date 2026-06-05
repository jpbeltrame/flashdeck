import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { mediaIdsIn, mediaKind } from '../domain/media'
import { buildCardDoc, type CardDocMedia } from '../domain/anki/card-doc'

async function blobToDataUrl(blob: Blob): Promise<string> {
  // Use arrayBuffer() which is available in both browsers and Node.js (jsdom
  // test env may have its own Blob type; cast to any to avoid prototype check).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ab = await (blob as any).arrayBuffer() as ArrayBuffer
  const bytes = new Uint8Array(ab)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export default function CardFrame({
  html,
  css,
  seedKey,
}: {
  html: string
  css?: string
  /**
   * Identifies the card. While it stays the same (question → answer of one
   * card) the Persistence store is preserved so the answer side reads what the
   * question side wrote; when it changes (next card) the store is cleared.
   */
  seedKey?: string
}) {
  const [doc, setDoc] = useState('')
  const [height, setHeight] = useState(160)
  const frameRef = useRef<HTMLIFrameElement>(null)
  // Persistence store written by the in-frame MCQ JS, carried question→answer.
  const persistence = useRef<Record<string, string>>({})
  const persistenceKey = useRef(seedKey)

  if (persistenceKey.current !== seedKey) {
    persistenceKey.current = seedKey
    persistence.current = {}
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ids = mediaIdsIn(html)
      const assets = await db.media.bulkGet(ids)
      const media: Record<string, CardDocMedia> = {}
      for (let i = 0; i < ids.length; i++) {
        const asset = assets[i]
        if (!asset) continue
        media[ids[i]] = { url: await blobToDataUrl(asset.blob), kind: mediaKind(asset.mime) }
      }
      if (cancelled) return
      const dark = document.documentElement.classList.contains('dark')
      setDoc(buildCardDoc({ html, css, dark, media, persistence: persistence.current }))
    })()
    return () => { cancelled = true }
  }, [html, css])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return
      const data = e.data as { type?: string; height?: number; store?: unknown }
      if (data?.type === 'flashdeck-card-height') {
        const h = Number(data.height)
        if (Number.isFinite(h)) setHeight(Math.max(80, h))
      } else if (data?.type === 'flashdeck-persistence' && data.store && typeof data.store === 'object') {
        persistence.current = data.store as Record<string, string>
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // sandbox="allow-scripts" WITHOUT allow-same-origin: deck JS runs but cannot
  // reach our DOM, IndexedDB, cookies, or same-origin network.
  return (
    <iframe
      ref={frameRef}
      title="card"
      sandbox="allow-scripts"
      srcDoc={doc}
      className="w-full border-0 bg-transparent"
      style={{ height }}
    />
  )
}
