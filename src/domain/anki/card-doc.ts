// Anki's desktop reviewer and AnkiDroid bundle jQuery in the card webview, so a
// large share of community note types assume `$`/`jQuery` is a global. Our
// sandboxed iframe loads nothing, so those templates throw "$ is not defined".
// Bundling jQuery here makes faithful rendering match the Anki runtime.
import jquerySrc from 'jquery/dist/jquery.min.js?raw'

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
  /**
   * Seed for the in-frame `Persistence` store (key -> JSON-stringified value),
   * used to carry MCQ state (shuffled option order, etc.) from the question
   * side to the answer side. See {@link PERSISTENCE_SCRIPT}.
   */
  persistence?: Record<string, string>
}

// Lays cards out at the iframe's own width (not the browser's ~980px mobile
// default) and keeps wide content/media from overflowing the frame. Runs
// before the note-type CSS so decks can still override anything they set.
const BASE_RESET =
  `*{box-sizing:border-box}` +
  `html,body{margin:0;padding:0}` +
  `body{overflow-wrap:break-word;word-break:break-word}` +
  `img,video,table,iframe{max-width:100%;height:auto}`

// Anki MCQ note types rely on a host-provided `Persistence` API (AnkiDroid /
// anki-persistence) to pass the shuffled option order from the question side to
// the answer side. Our iframe is sandboxed WITHOUT allow-same-origin, so its
// origin is opaque and sessionStorage/window.top are unavailable — leaving the
// real library as a stub that has only isAvailable(), so an unguarded
// `Persistence.setItem(...)` throws "is not a function".
//
// We install a complete, sandbox-safe polyfill (API-compatible with
// anki-persistence: JSON-encoded values, `_default` key, getAllKeys) backed by
// a plain object seeded from the parent. Every mutation is relayed to the parent
// via postMessage so the answer side can be seeded with what the question side
// wrote. `__SEED__` is replaced with the serialized seed at build time.
const PERSISTENCE_SCRIPT =
  `(function(){var K="_default";var store=__SEED__;` +
  `function notify(){try{parent.postMessage({type:'flashdeck-persistence',store:store},'*')}catch(e){}}` +
  `window.Persistence={` +
  `isAvailable:function(){return true},` +
  `setItem:function(k,v){if(arguments.length<2){v=k;k=K}store[k]=JSON.stringify(v);notify()},` +
  `getItem:function(k){if(k===undefined)k=K;return k in store?JSON.parse(store[k]):null},` +
  `removeItem:function(k){if(k===undefined)k=K;delete store[k];notify()},` +
  `clear:function(){store={};notify()},` +
  `getAllKeys:function(){return Object.keys(store).sort()}};` +
  `})()`

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
  const persistence = PERSISTENCE_SCRIPT.replace(
    '__SEED__',
    JSON.stringify(opts.persistence ?? {}),
  )
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>${BASE_RESET}</style>` +
    `<style>${opts.css ?? ''}</style>` +
    `<script>${jquerySrc}</script>` +
    `<script>${persistence}</script></head>` +
    `<body class="${cls}"><div id="qa">${body}</div>` +
    `<script>${HEIGHT_SCRIPT}</script></body></html>`
  )
}
