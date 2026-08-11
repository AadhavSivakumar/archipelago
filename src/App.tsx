import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { DISTRICTS, type DistrictId } from './scene/districts'

export function App() {
  // App state, not transform state — this changes on click, not per frame, so a
  // React re-render is the right tool. Everything the camera does in response
  // runs on the object graph via GSAP.
  const [focus, setFocus] = useState<DistrictId | null>(null)

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 115, 180], fov: 42, near: 0.5, far: 800 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene focus={focus} onFocus={setFocus} />
        </Suspense>
      </Canvas>

      <aside className="panel">
        <header className="panel__head">
          <h1>Archipelago</h1>
          <p>One island, six territories of knowledge.</p>
        </header>

        <nav className="panel__list">
          {DISTRICTS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`entry${focus === d.id ? ' is-active' : ''}`}
              style={{ '--accent': d.accent } as React.CSSProperties}
              onClick={() => setFocus(focus === d.id ? null : d.id)}
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
      </aside>
    </>
  )
}
