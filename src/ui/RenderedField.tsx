import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DOMPurify from 'dompurify'
import { getMedia } from '../db/media'
import { db } from '../db/db'
import { parseField, mediaKind, mediaIdsIn } from '../domain/media'

function MediaSegment({ id }: { id: string }) {
  const asset = useLiveQuery(() => getMedia(id), [id])
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    // useLiveQuery returns a fresh object on every re-query, so key the effect on
    // the stable id to avoid re-creating the URL (and flickering) on unrelated changes.
    if (!asset) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(asset.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id])

  if (!asset || !url) return null

  switch (mediaKind(asset.mime)) {
    case 'image':
      return <img src={url} alt={asset.filename} className="mx-auto max-h-60 rounded-xl" />
    case 'audio':
      return <audio src={url} controls className="w-full" />
    case 'video':
      return <video src={url} controls className="mx-auto max-h-60 rounded-xl" />
    default:
      return <a href={url} download={asset.filename} className="underline">{asset.filename}</a>
  }
}

function TextField({ text }: { text: string }) {
  const segments = parseField(text)
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'media' ? (
          <MediaSegment key={i} id={seg.id} />
        ) : (
          seg.value.trim() && (
            <p key={i} className="whitespace-pre-wrap">{seg.value.trim()}</p>
          )
        ),
      )}
    </div>
  )
}

function HtmlField({ text }: { text: string }) {
  const ids = mediaIdsIn(text)
  const assets = useLiveQuery(() => db.media.bulkGet(ids), [text])
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (assets === undefined) return
    // Sanitize FIRST while [[media:id]] tokens are still present (they pass
    // DOMPurify's URI filter), THEN swap tokens for app-generated object URLs —
    // doing it the other way round makes DOMPurify strip the blob: src.
    let resolved = DOMPurify.sanitize(text, { ADD_ATTR: ['controls'] })
    const urls: string[] = []
    ids.forEach((id, i) => {
      const asset = assets[i]
      if (!asset) return
      const url = URL.createObjectURL(asset.blob)
      urls.push(url)
      const token = `[[media:${id}]]`
      if (mediaKind(asset.mime) === 'audio') {
        // Standalone token (from [sound:]) → an audio element.
        resolved = resolved.split(token).join(`<audio controls src="${url}"></audio>`)
      } else {
        resolved = resolved.split(token).join(url) // token sits inside an <img src="...">
      }
    })
    setHtml(resolved)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [assets, text])

  return <div className="anki-field space-y-2" dangerouslySetInnerHTML={{ __html: html }} />
}

export interface RenderedFieldProps {
  text: string
  format?: 'text' | 'html'
}

export default function RenderedField({ text, format = 'text' }: RenderedFieldProps) {
  return format === 'html' ? <HtmlField text={text} /> : <TextField text={text} />
}
