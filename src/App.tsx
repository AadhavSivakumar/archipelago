import { Suspense, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { WikiCard } from './components/WikiCard'
import type { Subject } from './components/wikipedia'
import { DebugOverlay } from './components/DebugOverlay'
import { DistrictDossier } from './components/DistrictDossier'
import { telemetry } from './scene/telemetry'
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

  /*
    Set while the camera is down among the Geographical Garden's world map.

    The map is meant to fill the screen there, and a fixed 370px column over its
    western third is the one thing that stops it — Greenland and the Atlantic sat
    behind the panel. Sliding it out is better than shrinking the framing to
    avoid it: the visitor asked to look at the map, so the map gets the window.

    It comes back the moment the camera pulls up, and every control it holds is
    reachable in the meantime — Escape leaves the district, and the map's own
    click handling covers the rest.
  */
  const [immersive, setImmersive] = useState(false)

  /*
    Leaving the map happens in two steps, and the order is the whole point.

    Down among the world map the island, the ocean, the sky and five of six
    districts are not being drawn. Clearing focus in one go asks the camera to
    start flying back out into a world that is, on that same frame, still
    absent — so the first half second of the retreat is a plate over an empty
    sky, and everything reappears at once partway through. It reads as a glitch
    even though nothing is wrong.

    So: raise this flag, which puts the whole scene back with the camera still
    parked over the map, and only clear focus once it has actually been drawn.
    Two animation frames, not one — the first is the React commit that unhides
    everything, the second is the first frame R3F renders with it all present.
    By the time the camera moves there is a world to move through.
  */
  const [leavingMap, setLeavingMap] = useState(false)

  /** Whatever is chosen inside the focused district, if anything. */
  const [subject, setSubject] = useState<Subject | null>(null)

  const leaveDistrict = useCallback(() => {
    if (!immersive) {
      setFocus(null)
      return
    }
    setLeavingMap(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setFocus(null)))
  }, [immersive, setFocus])

  /*
    The flag is cleared by the scene, not by the timer that set it.

    Clearing it after the same two frames would have been the obvious thing and
    is wrong: `immersive` is raised and lowered from inside the render loop, and
    it does not fall on the frame focus changes — it falls once the camera has
    actually climbed back out past the level-of-detail threshold. Clearing early
    therefore leaves a window where the flag is down and `immersive` is still
    up, which reads as `is-away` again, and the panel slides out, back, and out
    once more in under a second. Letting the scene end the state it started
    keeps the panel's return monotonic.
  */
  useEffect(() => {
    if (!immersive) setLeavingMap(false)
  }, [immersive])

  // Escape leaves a district from anywhere. The reset button was the only way
  // out, and on a phone it sits below the panel's 46dvh fold.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leaveDistrict()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaveDistrict])

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
      <header
        className={`panel${panelOpen ? ' is-open' : ''}${immersive && !leavingMap ? ' is-away' : ''}`}
        // Hidden from assistive tech as well as from view while it is off-screen
        // — a translated element is still in the accessibility tree, and a
        // screen reader would otherwise offer six controls the visitor cannot
        // see and a tab stop that scrolls the page sideways to reach.
        inert={(immersive && !leavingMap) || undefined}
      >
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
          <p>An archipelago of six territories of knowledge.</p>
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
          onClick={leaveDistrict}
          disabled={focus === null}
        >
          Back to the whole archipelago
        </button>
      </header>

      {/*
        The way out, while the panel that normally holds it is off-screen.

        The panel slides away so the map can have the window, which also takes
        the "Back to the whole archipelago" button with it — leaving Escape as
        the only exit, which is not an affordance anyone can see. This is the
        same action in the one place it is still needed, and it disappears again
        the moment the panel returns.

        Rendered outside the panel rather than inside it because it has to
        outlive the panel's `inert`: an inert subtree cannot be clicked, so a
        back button in there would be visible and dead.
      */}
      {immersive && !leavingMap && (
        <button type="button" className="escape" onClick={leaveDistrict}>
          <span aria-hidden="true">←</span> Back
        </button>
      )}

      <DebugOverlay />

      {/*
        The camera flight is the only feedback a sighted user gets on focus.
        This is that same event, spoken. The copy already exists in districts.ts.
        No guard against announcing on load is needed: a live region reads
        mutations, not the content it mounts with.
      */}
      <p className="sr-only" aria-live="polite">
        {focused ? `Viewing ${focused.name}.` : 'Viewing the whole archipelago.'}
      </p>

      {/*
        The detail itself lives in the dossier below, which is a labelled
        complementary landmark — announcing the whole blurb here as well would
        read the same content out twice.
      */}
      {/*
        The dossier gives way to the country card rather than stacking with it.
        Both are the same fixed corner, and both answer "what am I looking at" —
        showing the Garden's own blurb above a paragraph about Chile would be
        answering a question nobody asked twice over.
      */}
      {subject ? <WikiCard {...subject} /> : <DistrictDossier focus={focus} />}

      {/*
        The boundary wraps the canvas alone — see ErrorBoundary's own note. The
        panel above stays mounted whatever the GPU does.
      */}
      <main className="stage">
        <ErrorBoundary
          fallback={
            <div className="scene-down" role="status">
              <p>This archipelago needs WebGL, and your browser did not start it.</p>
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
            onCreated={({ gl, setDpr }) => {
              setDpr(Math.min(window.devicePixelRatio, 2))
              /*
                Count context losses. three already listens for this event and
                calls preventDefault so the browser attempts a restore; these
                listeners only record that it happened. A lost context is a
                black canvas until restored, and on some drivers it happens
                under load — it is the one cause of a black flash this code
                cannot prevent, only make less likely by drawing less. Knowing
                whether it is happening is what decides which of those to do.
              */
              const canvas = gl.domElement
              canvas.addEventListener('webglcontextlost', () => {
                telemetry.contextLosses += 1
                telemetry.lastLossAt = performance.now()
                console.warn('[archipelago] WebGL context lost')
              })
              canvas.addEventListener('webglcontextrestored', () => {
                telemetry.contextRestores += 1
                console.info('[archipelago] WebGL context restored')
              })
            }}
            camera={{ position: [0, 115, 180], fov: 42, near: 0.5, far: 800 }}
            /*
              preserveDrawingBuffer, and it is a workaround rather than a
              feature — so here is exactly what it does and what it costs.

              Without it the browser may discard the drawing buffer after each
              composite, and anything that reads the canvas at the wrong moment
              gets an empty one. Measured here: sixteen captures through the
              flight into the Garden produced two frames of pure black, while
              the fog and clear colour driving those same frames were logged and
              were correct throughout — the scene was fine and the buffer was
              not there. With this flag on, the identical run produced none.

              That is a capture artefact, but it is the same mechanism behind a
              known class of intermittent black flash on real machines, where
              the compositor rather than a screenshot is the reader. It is the
              only cause left standing after the reallocations were removed.

              The cost is that the browser can no longer skip preserving the
              buffer between frames, which is a small per-frame copy. Worth it
              against a flash.
            */
            gl={{
              antialias: true,
              preserveDrawingBuffer: true,
              /*
                On a laptop with two GPUs the browser picks the integrated one
                by default for power, and this scene is not a document. Asking
                for the discrete adapter is a hint the browser may decline, but
                where it is honoured it is the single largest change in frame
                time this page can make, and it costs nothing where it is not.
              */
              powerPreference: 'high-performance',
            }}
          >
            <Suspense fallback={null}>
              <Scene
              focus={focus}
              onFocus={setFocus}
              onImmersive={setImmersive}
              forceWorld={leavingMap}
              onSubject={setSubject}
            />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </main>
    </>
  )
}
