import { useEffect, useState } from 'react'

// TEMPORARY diagnostic overlay for the iOS standalone bottom-gap bug.
// REMOVE once the gap is understood/fixed. Bump BUILD on every deploy so a
// stale service worker (old cached bundle) is immediately obvious in a
// screenshot.
const BUILD = 'DIAG-1'

export default function ViewportDebug() {
  const [info, setInfo] = useState('')

  useEffect(() => {
    // Probe elements measure the *resolved* env() insets in px.
    const probeBottom = document.createElement('div')
    probeBottom.style.cssText =
      'position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none'
    const probeTop = document.createElement('div')
    probeTop.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);pointer-events:none'
    document.body.append(probeBottom, probeTop)

    const update = () => {
      const shell = document.querySelector('[data-shell]') as HTMLElement | null
      const appH = getComputedStyle(document.documentElement)
        .getPropertyValue('--app-height')
        .trim()
      setInfo(
        [
          `BUILD ${BUILD}`,
          `screen ${window.screen.width}x${window.screen.height}`,
          `innerH ${window.innerHeight}`,
          `vv.h ${window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'}`,
          `docClientH ${document.documentElement.clientHeight}`,
          `--app-height ${appH || '(unset)'}`,
          `shellH ${shell ? Math.round(shell.getBoundingClientRect().height) : 'n/a'}`,
          `SAB ${probeBottom.offsetHeight}  SAT ${probeTop.offsetHeight}`,
          `scrollY ${Math.round(window.scrollY)}  docH ${document.documentElement.scrollHeight}`,
        ].join('   '),
      )
    }

    update()
    const id = window.setInterval(update, 400)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      probeBottom.remove()
      probeTop.remove()
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top)',
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(200,0,0,0.9)',
        color: '#fff',
        font: '11px/1.4 ui-monospace, monospace',
        padding: '4px 6px',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}
    >
      {info}
    </div>
  )
}
