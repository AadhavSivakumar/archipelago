import { useEffect, useState } from 'react'
import { telemetry } from '../scene/telemetry'

/** On only when the page is opened with ?debug — nobody else ever sees it. */
const ENABLED = new URLSearchParams(window.location.search).has('debug')

const TIERS = ['full', 'vertex cuts', 'fill cuts']

/**
 * A screenshot-able readout of the scene's health.
 *
 * Every attempt so far to fix a black flash has been made without seeing the
 * machine it happens on. This puts the GPU, the browser, the drawing-buffer
 * size, the smoothed frame time, the quality tier the governor settled at and
 * the count of WebGL context losses in one corner, so that "it still flashes"
 * can arrive with the six numbers that distinguish the possible causes.
 *
 * Polled four times a second from a store the render loop writes to. Not
 * subscribed per frame: a diagnostic must never become a cost worth
 * diagnosing.
 */
export function DebugOverlay() {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!ENABLED) return
    const id = window.setInterval(() => tick((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [])

  if (!ENABLED) return null

  const t = telemetry
  const fps = t.frameMs > 0 ? Math.round(1000 / t.frameMs) : 0
  const since = t.lastLossAt ? `${Math.round((performance.now() - t.lastLossAt) / 1000)}s ago` : 'never'

  return (
    <aside className="debug" aria-label="Rendering diagnostics">
      <div className="debug__row debug__row--wide">{t.renderer || '…'}</div>
      <div className="debug__row debug__row--wide">{navigator.userAgent}</div>
      <div className="debug__row">
        <span>buffer</span>
        <span>
          {t.width}×{t.height} @{t.dpr}×
        </span>
      </div>
      <div className="debug__row">
        <span>frame</span>
        <span>
          {t.frameMs.toFixed(1)} ms · {fps} fps
        </span>
      </div>
      <div className="debug__row">
        <span>quality</span>
        <span>
          tier {t.tier} · {TIERS[t.tier]}
        </span>
      </div>
      <div className="debug__row">
        <span>draw</span>
        <span>
          {t.drawCalls} calls · {(t.triangles / 1000).toFixed(0)}k tris
        </span>
      </div>
      <div className={`debug__row${t.contextLosses ? ' debug__row--alert' : ''}`}>
        <span>context lost</span>
        <span>
          {t.contextLosses}× · restored {t.contextRestores}× · last {since}
        </span>
      </div>
    </aside>
  )
}
