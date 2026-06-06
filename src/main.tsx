import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/index.css'
import App from './App'

// iOS standalone PWA viewport bug: on first paint window.innerHeight (and
// vh/dvh/100%) report the screen height MINUS the top safe-area inset, and stay
// wrong until the first scroll gesture — confirmed on-device (932 screen vs 873
// innerHeight, delta == 59px top inset). So innerHeight can't be trusted on
// load. Derive the full screen height for the current orientation from
// window.screen, which is correct from the first frame. (screen.width/height
// are orientation-agnostic on iOS — always native portrait — so we pick the
// right dimension ourselves.) AppShell consumes this via height: var(--app-height).
function syncAppHeight() {
  const { width, height } = window.screen
  const portrait = window.matchMedia('(orientation: portrait)').matches
  const full = portrait ? Math.max(width, height) : Math.min(width, height)
  document.documentElement.style.setProperty('--app-height', `${full}px`)
}
syncAppHeight()
window.addEventListener('resize', syncAppHeight)
window.addEventListener('orientationchange', syncAppHeight)
window.addEventListener('pageshow', syncAppHeight)
window.visualViewport?.addEventListener('resize', syncAppHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
