import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMedia } from '../db/media'
import { parseField, mediaKind } from '../domain/media'

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

export default function RenderedField({ text }: { text: string }) {
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
