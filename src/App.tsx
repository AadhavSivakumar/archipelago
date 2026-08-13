import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { DistrictDossier } from './components/DistrictDossier'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashFocus } from './hooks/useHashFocus'
import { Scene } from './scene/Scene'
import { DISTRICTS } from './scene/districts'

export function App() {
  // App state, not transform state — this changes on click, not per frame, so a
  // React re-render is the right tool. Everything the camera does in response
  // runs on the object graph via GSAP. It lives in the URL so a district can be
  // linked to, reloaded into, and backed out of.
  const [focus, setFocus] = useHashFocus()

  // Only meaningful below 720px, where the panel becomes a bottom sheet. On
  // desktop the toggle is display:none and the panel is always open.
  const [panelOpen, setPanelOpen] = useState(false)

  // Escape leaves a district from anywhere. The reset button was the only way
  // out, and on a phone it sits below the panel's 46dvh fold.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFocus])

  const focused = DISTRICTS.find((d) => d.id === focus)

  return (
    <>
      {/*
        The panel comes first in the DOM on purpose. drei portals each district
        label into the canvas wrapper, so with the canvas first those six pills
        took the first six tab stops — ahead of the <h1> — and a focused one
        could sit off-frustum with `overflow: hidden` preventing any
        scroll-into-view. The panel is position:fixed and the wrapper is the only
        in-flow child of #root, so this reorder costs nothing visually.
      */}
      <header className={`panel${panelOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="panel__toggle"
          aria-expanded={panelOpen}
          aria-controls="territory-list"
          onClick={() => setPanelOpen((open) => !open)}
        >
          <span>{panelOpen ? 'Hide territories' : 'Show territories'}</span>
          <span aria-hidden="true">{panelOpen ? '▾' : '▴'}</span>
        </button>

        <header className="panel__head">
          <h1>Archipelago</h1>
          <p>One island, six territories of knowledge.</p>
        </header>

        <nav id="territory-list" className="panel__list" aria-label="Territories">
          {DISTRICTS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`entry${focus === d.id ? ' is-active' : ''}`}
              style={{ '--accent': d.accent } as React.CSSProperties}
              // State was carried by a class alone, which is invisible to
              // assistive tech. These are toggles, so aria-pressed is the fit.
              aria-pressed={focus === d.id}
              // These genuinely navigate now — the URL changes and Back works —
              // so the entry is also the current item within its set.
              aria-current={focus === d.id ? 'true' : undefined}
              onClick={() => {
                setFocus(focus === d.id ? null : d.id)
                // Below 720px the sheet covers the island it just flew to.
                setPanelOpen(false)
              }}
            >
              <span className="entry__name">{d.name}</span>
              <span className="entry__blurb">{d.blurb}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="reset"
          onClick={() => setFocus(null)}
          disabled={focus === null}
        >
          Back to the whole island
        </button>
      </header>

      {/*
        The camera flight is the only feedback a sighted user gets on focus.
        This is that same event, spoken. The copy already exists in districts.ts.
        No guard against announcing on load is needed: a live region reads
        mutations, not the content it mounts with.
      */}
      <p className="sr-only" aria-live="polite">
        {focused ? `Viewing ${focused.name}.` : 'Viewing the whole island.'}
      </p>

      {/*
        The detail itself lives in the dossier below, which is a labelled
        complementary landmark — announcing the whole blurb here as well would
        read the same content out twice.
      */}
      <DistrictDossier focus={focus} />

      {/*
        The boundary wraps the canvas alone — see ErrorBoundary's own note. The
        panel above stays mounted whatever the GPU does.
      */}
      <main className="stage">
        <ErrorBoundary
          fallback={
            <div className="scene-down" role="status">
              <p>This island needs WebGL, and your browser did not start it.</p>
              <p>The territories are all still listed — try a different browser to walk them.</p>
            </div>
          }
        >
          {/*
            No `dpr` prop: R3F's configure() re-applies it on every render of
            this component (fiber events-*.js:15848), which would revert
            AdaptiveDpr's choice every time focus or the panel toggles. Seeding
            once here makes AdaptiveDpr the sole writer.
          */}
          {/*
            shadows="percentage" rather than a bare `shadows`, and this is not
            cosmetic. The boolean makes R3F write PCFSoftShadowMap; three 0.185
            has deprecated that and, on its first shadow render, warns and
            reassigns `shadowMap.type = PCFShadowMap` itself. R3F's configure()
            re-runs on every render of this component and re-writes
            PCFSoftShadowMap, so `oldType !== type` is true every single time —
            which sets `needsUpdate` and thaws the shadow map that DistrictLayer
            deliberately froze once the reveal settled. Naming the type three is
            going to land on anyway keeps configure() a no-op, so the freeze
            holds. No visual change: three was already rendering PCF.
          */}
          <Canvas
            shadows="percentage"
            onCreated={({ setDpr }) => setDpr(Math.min(window.devicePixelRatio, 2))}
            camera={{ position: [0, 115, 180], fov: 42, near: 0.5, far: 800 }}
            gl={{ antialias: true }}
          >
            <Suspense fallback={null}>
              <Scene focus={focus} onFocus={setFocus} />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </main>
    </>
  )
}
