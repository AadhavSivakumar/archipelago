import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { EASE, gsap, REDUCED_MOTION, useGSAP } from '../animations/gsap'
import { DISTRICTS, districtPosition, type DistrictId } from './districts'
import { LANDMARKS } from './landmarks'
import { setCursor } from './cursor'

type Props = {
  focus: DistrictId | null
  onFocus: (id: DistrictId | null) => void
  /** Raycast against these to hide labels behind the landmass. */
  occluders: RefObject<THREE.Mesh>
  /** Skip the reveal: the visitor arrived pointed at a district already. */
  deepLinked: boolean
  /**
   * When set, only this district is drawn. Used while the camera is down among
   * the Geographical Garden's map, where the others are all off-frame.
   */
  soloDistrict: DistrictId | null
}

/**
 * Stop re-rendering the shadow map once the scene has settled.
 *
 * The depth pass costs a second draw of the 96,800-triangle terrain plus every
 * landmark, every frame, forever — and after the reveal nothing that casts a
 * shadow moves again. The ornaments that DO keep moving are tagged `noShadow`
 * in landmarks.tsx and skipped by the walk below — both casting and receiving,
 * since the walk stops descending — precisely so their shadows cannot freeze
 * mid-rotation. Tag the smallest subtree that actually changes silhouette.
 *
 * Keyed to the reveal finishing rather than to the camera flight: the flight is
 * skippable now (CameraRig), and a visitor who clicks at 0.5s would otherwise
 * bake half-risen landmarks into the map.
 */
function freezeShadows(gl: THREE.WebGLRenderer) {
  gl.shadowMap.autoUpdate = false
  gl.shadowMap.needsUpdate = true
}

/** How high above each plateau the floating label sits. */
const LABEL_HEIGHT: Record<DistrictId, number> = {
  ideology: 17,
  history: 12,
  geography: 12,
  science: 13,
  art: 11,
  anthropology: 14,
  languages: 12,
  life: 12,
  cosmos: 14,
  inventions: 12,
}

export function Districts({
  focus,
  onFocus,
  occluders,
  deepLinked,
  soloDistrict,
}: Props) {
  const root = useRef<THREE.Group>(null!)
  const animated = useRef<THREE.Group[]>([])
  const gl = useThree((s) => s.gl)

  // Shadow flags are not inherited in three.js, and setting them by hand on
  // every mesh would bury the geometry. One walk after mount does the same job.
  //
  // useLayoutEffect, not useEffect, and that is load-bearing. The reveal below
  // runs in useGSAP — a layout effect — and its instant-arrival branches
  // (reduced motion, deep link) freeze the shadow map immediately. A passive
  // useEffect runs after the whole layout phase, so the map would be frozen
  // before a single landmark had been marked as a caster, and the island would
  // sit under a permanent shadow map containing no landmarks at all. Declared
  // above the useGSAP so it wins the ordering within the phase.
  //
  // Hand-rolled rather than Object3D.traverse because traverse cannot skip a
  // subtree, and skipping is the whole point: anything under a `noShadow` group
  // is still moving after the map freezes, so it must not be baked into it. A
  // castShadow={false} prop would not survive this walk either way.
  useLayoutEffect(() => {
    const walk = (o: THREE.Object3D) => {
      if (o.userData.noShadow) return

      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }

      for (const child of o.children) walk(child)
    }
    walk(root.current)
  }, [])

  // GSAP owns these inner groups' position.y and scale for the reveal. The outer
  // group carries the fixed district position, so React and GSAP never write the
  // same property.
  useGSAP(() => {
    const groups = animated.current.filter(Boolean)

    // Reduced motion: the landmarks start where they would have ended. Note the
    // end state has to be written explicitly rather than skipped — the initial
    // set() below is what puts them underground, so doing nothing at all would
    // be fine today but would silently break the moment anyone gives these
    // groups a non-identity starting transform.
    if (REDUCED_MOTION || deepLinked) {
      groups.forEach((g) => {
        gsap.set(g.position, { y: 0 })
        gsap.set(g.scale, { x: 1, y: 1, z: 1 })
      })
      // Nothing is going to animate into place, so the scene is settled now.
      freezeShadows(gl)
      return
    }

    const tl = gsap.timeline({ delay: 0.9, onComplete: () => freezeShadows(gl) })
    groups.forEach((g, i) => {
      const at = i * 0.14
      gsap.set(g.position, { y: -22 })
      gsap.set(g.scale, { x: 0.001, y: 0.001, z: 0.001 })
      tl.to(g.position, { y: 0, duration: 1.5, ease: EASE.entrance }, at)
      tl.to(g.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: EASE.pop }, at)
    })
  }, [gl, deepLinked])

  return (
    <group ref={root}>
      {DISTRICTS.map((d, i) => {
        const Landmark = LANDMARKS[d.id]
        return (
          /*
            Hidden, not unmounted: the reveal timeline holds refs to the inner
            groups, and tearing them out from under it would leave those entries
            null and the transforms wherever GSAP last wrote them.
          */
          <group
            key={d.id}
            position={districtPosition(d)}
            visible={soloDistrict === null || soloDistrict === d.id}
          >
            {/*
              The label lives INSIDE the animated group, not beside it. As a
              sibling it was pinned at full height from frame one, so the first
              second of the page showed six pills hanging in mid-air over a
              flat, landmark-less island — and they were clickable there, which
              started a flight into a district that had not risen yet. Inside,
              it rides the same rise and back.out pop as the landmark it names.
            */}
            {/*
              The landmark itself is the primary control, not the pill above
              it. Clicking the thing you are looking at is the obvious gesture,
              and requiring the label instead made the label the only way in —
              a small target floating above a large, inviting one.

              stopPropagation because the island's ground under this landmark
              carries the same handler (Island.tsx). Both resolve to the same
              district, so it changes nothing today; it stops the pair from
              disagreeing later, when a landmark overhangs its neighbour.

              Not keyboard-reachable, and deliberately: the panel already lists
              all six as real buttons, and adding a second set would give a
              screen reader twelve controls with six duplicated names. Same
              reasoning as the marker below, which is aria-hidden for it.
            */}
            <group
              ref={(el) => {
                if (el) animated.current[i] = el
              }}
              onClick={(e) => {
                e.stopPropagation()
                onFocus(focus === d.id ? null : d.id)
              }}
              onPointerOver={(e) => {
                e.stopPropagation()
                setCursor('pointer')
              }}
              onPointerOut={() => setCursor('')}
            >
              <Landmark d={d} focused={focus === d.id} />

            {/*
              `occlude` as a ref array raycasts against the landmass only —
              cheap, and precisely the thing that should hide a label. With no
              custom onOcclude, drei sets display:none on the hidden element,
              which also takes it out of the tab order and out of reach of a
              click, so a far-side label can no longer be pressed through the
              mountain.

              distanceFactor is gone: it scaled the label by 44.3/distance, so
              the 15px pill rendered ~6px at maxDistance and ~3x oversized at
              minDistance, where plateaus 12.5-17.5 units apart collide. Fixed
              screen size reads at every zoom.

              zIndexRange tops out below both `.panel` (z-index 10) and the
              dossier (9) — drei portals this into the canvas wrapper, which
              creates no stacking context, so without the cap a near label
              paints over the page's own chrome.
            */}
            <Html position={[0, LABEL_HEIGHT[d.id], 0]} center occlude={[occluders]} zIndexRange={[8, 0]}>
              <button
                type="button"
                className={`marker${focus === d.id ? ' is-active' : ''}`}
                style={{ '--accent': d.accent } as React.CSSProperties}
                /*
                  Hidden from assistive tech on purpose. These six duplicate the
                  panel's six entries exactly, and exposing both gives twelve
                  controls with six repeated accessible names — which voice
                  control cannot disambiguate ("click Scientific Shores" is
                  ambiguous) and which makes the markers the first six tab stops
                  ahead of the <h1>. The panel is the accessible route to every
                  one of these actions; this is the pointer affordance for it.
                */
                aria-hidden="true"
                tabIndex={-1}
                // Suppresses the native focus a pointer press would otherwise
                // give this button. Parking activeElement on a node that is
                // pruned from the accessibility tree leaves a screen reader
                // with focus it cannot describe. The click still fires.
                onMouseDown={(e) => e.preventDefault()}
                // Toggles, like the panel entry does. Sending `d.id`
                // unconditionally leaves an active marker looking pressed with
                // no way to un-press it: React bails on the identical state, so
                // the rig's dependencies never change and no flight is built.
                onClick={(e) => {
                  e.stopPropagation()
                  onFocus(focus === d.id ? null : d.id)
                }}
              >
                {d.name}
              </button>
            </Html>
            </group>
          </group>
        )
      })}
    </group>
  )
}
