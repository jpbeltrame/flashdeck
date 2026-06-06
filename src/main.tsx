import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/index.css'
import App from './App'

// iOS standalone PWAs compute viewport units (dvh/vh/100%) against a stale
// viewport on first paint — the shell only sizes correctly after a scroll or
// other relayout. Drive the height from the measured innerHeight (full screen,
// unaffected by the keyboard) and re-sync on every viewport event so it's right
// from the first frame and self-heals as iOS settles. AppShell consumes this
// via height: var(--app-height).
function syncAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
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
