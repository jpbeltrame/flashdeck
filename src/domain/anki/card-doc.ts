export interface CardDocMedia {
  url: string
  kind: 'image' | 'audio' | 'video' | 'other'
}

export interface CardDocOptions {
  html: string
  css?: string
  dark?: boolean
  /** id -> resolved media (data: URL + kind). */
  media?: Record<string, CardDocMedia>
}

// Reports the rendered height to the parent so the iframe can be sized.
const HEIGHT_SCRIPT =
  `(function(){function h(){parent.postMessage({type:'flashdeck-card-height',` +
  `height:document.documentElement.scrollHeight},'*')}` +
  `window.addEventListener('load',h);` +
  `if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement);` +
  `setTimeout(h,50);setTimeout(h,300)})()`

export function buildCardDoc(opts: CardDocOptions): string {
  let body = opts.html
  for (const [id, m] of Object.entries(opts.media ?? {})) {
    const token = `[[media:${id}]]`
    body = m.kind === 'audio'
      ? body.split(token).join(`<audio controls src="${m.url}"></audio>`)
      : body.split(token).join(m.url) // sits inside an <img>/<video> src
  }
  const cls = `card${opts.dark ? ' nightMode night_mode' : ''}`
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${opts.css ?? ''}</style></head>` +
    `<body class="${cls}"><div id="qa">${body}</div>` +
    `<script>${HEIGHT_SCRIPT}</script></body></html>`
  )
}
