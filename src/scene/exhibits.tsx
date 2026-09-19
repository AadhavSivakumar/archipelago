import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { setCursor } from './cursor'
import type { District } from './districts'

/**
 * A place within a district worth flying to, in district-local units.
 *
 * Raised by a district when something on it is chosen — a country, an event,
 * a god — and consumed by CameraRig, which frames it, and by the page, which
 * describes it. `spanX`/`spanZ` are half-extents and decide how close the
 * camera comes; `name`, `article` and `kicker` are what the corner card shows.
 */
export type SubFocus = {
  x: number
  z: number
  /** Height above the district's plateau. Floating islets are not at 0. */
  y?: number
  spanX: number
  spanZ: number
  name: string
  article: string
  kicker?: string
  /** Camera height over distance when framing this; 0.6 unless said otherwise. */
  elevation?: number
}

/** One pickable thing in a district: what it is, and where it stands. */
export type Exhibit = {
  name: string
  article: string
  kicker?: string
  /** District-local. */
  x: number
  y: number
  z: number
  /** Rotation about Y, so a marker can face the path it stands on. */
  yaw?: number
  scale?: number
  /** The marker's own colour, via instance colour. */
  color: string
  /** Half-extent to frame, overriding the collection's. */
  extent?: number
  /** Camera height over distance when framing this item. */
  elevation?: number
}

const UP = new THREE.Vector3(0, 1, 0)
const RIGHT = new THREE.Vector3(1, 0, 0)
const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const Q2 = new THREE.Quaternion()
const P = new THREE.Vector3()
const S = new THREE.Vector3()
const C = new THREE.Color()

/**
 * Wraps a district's contents so that, while the district is focused, a click
 * on anything that is not an exhibit clears the selection instead of leaving.
 *
 * The group that wraps every landmark toggles district focus, so without this
 * a click that missed a stele — the path, the ziggurat, the ground between —
 * bubbles up to it and throws the visitor straight back out to the whole
 * archipelago. The Geographical Garden learned this first: a district whose
 * purpose is to be clicked around must not treat a miss as "leave".
 *
 * Unfocused, clicks pass straight through, so that from the whole-archipelago
 * view a click anywhere on the landmark still means "take me there".
 */
export function ExhibitHall({
  focused,
  onClear,
  children,
}: {
  focused: boolean
  onClear: () => void
  children: ReactNode
}) {
  return (
    <group
      onClick={(e) => {
        if (!focused) return
        e.stopPropagation()
        onClear()
      }}
    >
      {children}
    </group>
  )
}

type ExhibitsProps = {
  d: District
  focused: boolean
  items: readonly Exhibit[]
  /** The marker every item is an instance of. */
  geometry: THREE.BufferGeometry
  /** Its material; instance colours multiply this, so it wants to be white. */
  material: THREE.Material
  /** How far above an item its name floats when chosen. */
  labelHeight: number
  /** Half-extent the camera frames when an item is chosen. */
  extent?: number
  /** Camera height over distance for every item here; see SubFocus. */
  elevation?: number
  /** The primary marker's height above each item's own y. */
  lift?: number
  /**
   * Further instanced meshes that share every item's placement — an islet's
   * rock and turf under its totem. They take the same hover and click as the
   * primary, so the whole thing is the target, but only the primary is
   * coloured per item.
   */
  parts?: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; lift?: number }[]
  /**
   * Instances allocated. Fixed when the items change at runtime — a family
   * tree that changes with the pantheon — so the mesh is never rebuilt.
   */
  capacity?: number
  /** Whether the arrow keys walk this collection. Off when another one on
      the same district should have them. */
  keys?: boolean
  /** Instance colour of the chosen marker, if its own colour should change. */
  highlight?: string
  /** A shape drawn flat under the chosen item — a ring of the district's accent. */
  marker?: { geometry: THREE.BufferGeometry; material: THREE.Material; lift?: number }
  picked: number
  onPick: (index: number) => void
  onSubFocus?: (view: SubFocus | null) => void
  /**
   * Maps an item to the district-local point the camera should frame, for
   * items whose parent group moves — the Ideology Isles orbit their rotunda,
   * so an islet's authored position is not where it currently is — or whose
   * point of interest is not the marker itself.
   */
  place?: (item: Exhibit, index: number) => [number, number, number]
  castShadow?: boolean
}

/**
 * A collection of pickable things, drawn as one instanced mesh.
 *
 * Four districts turned out to want the same thing: many small markers that
 * can be hovered, chosen, named, stepped through with the arrow keys and flown
 * to. Doing that once here means each district is only its content and its
 * layout — the timeline is a spiral of these, the Shores a row, the Arboretum
 * a set of clusters, the Isles an orbit — and the interaction is identical
 * across all of them, which is what makes it learnable.
 *
 * One draw call however many items there are, because they are instances. The
 * hover and the selection are per-instance colours written straight into the
 * instance colour buffer — a few floats, no React render, no reallocation.
 *
 * The parent owns `picked`; this component is the only thing that reads it
 * into the scene, and the one place a selection turns into a SubFocus. Every
 * way of changing the selection — a click, an arrow key, the hall clearing
 * it, leaving the district — goes through `onPick`, so the highlight, the
 * label, the card and the camera can never disagree about what is chosen.
 *
 * Every handler returns early without stopping propagation while the district
 * is not focused, so that from the whole-archipelago view a click on any of
 * these still means "take me to the district", exactly as the Garden's
 * countries behave.
 */
export function Exhibits({
  d,
  focused,
  items,
  geometry,
  material,
  labelHeight,
  extent = 2,
  elevation,
  lift = 0,
  parts,
  capacity,
  keys = true,
  highlight,
  marker,
  picked,
  onPick,
  onSubFocus,
  place,
  castShadow = true,
}: ExhibitsProps) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const partMeshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const hover = useRef(-1)
  // The same fact as the ref, for the pill: a render on entering or leaving
  // an item, not on every move across it.
  const [hovered, setHovered] = useState(-1)
  const n = items.length
  const slots = capacity ?? Math.max(n, 1)

  const paint = (i: number) => {
    if (i < 0 || i >= n || !mesh.current) return
    C.set(items[i].color)
    if (i === picked && highlight) C.set(highlight)
    else if (i === hover.current) C.multiplyScalar(1.35)
    mesh.current.setColorAt(i, C)
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }

  // Matrices and colours, once per items change. Layout effect so the first
  // frame drawn already has them; without it every instance sits at the
  // origin for one frame, which the reveal would faithfully animate.
  useLayoutEffect(() => {
    const meshes = [mesh.current, ...partMeshes.current]
    const lifts = [lift, ...(parts ?? []).map((part) => part.lift ?? 0)]
    meshes.forEach((m, k) => {
      if (!m) return
      items.forEach((it, i) => {
        P.set(it.x, it.y + lifts[k], it.z)
        Q.setFromAxisAngle(UP, it.yaw ?? 0)
        const s = it.scale ?? 1
        S.set(s, s, s)
        M.compose(P, Q, S)
        m.setMatrixAt(i, M)
      })
      // Draw the items there are, not the slots allocated for them.
      m.count = n
      m.instanceMatrix.needsUpdate = true
      // The mesh's own bounds, not the geometry's: three culls an instanced
      // mesh by its bounding sphere, and the geometry's is one marker at the
      // origin.
      if (n > 0) m.computeBoundingSphere()
    })
    for (let i = 0; i < n; i++) paint(i)
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Repaint when the selection moves, and nothing else.
  const prevPicked = useRef(-1)
  useEffect(() => {
    paint(prevPicked.current)
    paint(picked)
    prevPicked.current = picked
  }, [picked]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
    The selection, as somewhere to fly and something to describe. Emitted from
    the state rather than from the click so that every route to a selection
    produces exactly one announcement. "Nothing" is only announced after
    something was — six districts mount with nothing chosen, and none of them
    needs to say so.
  */
  const announced = useRef(false)
  useEffect(() => {
    if (!onSubFocus) return
    if (picked < 0 || picked >= n) {
      if (announced.current) {
        announced.current = false
        onSubFocus(null)
      }
      return
    }
    announced.current = true
    const it = items[picked]
    const [x, y, z] = place ? place(it, picked) : [it.x, it.y, it.z]
    const span = it.extent ?? extent
    onSubFocus({
      x,
      y,
      z,
      spanX: span,
      spanZ: span,
      name: it.name,
      article: it.article,
      kicker: it.kicker,
      elevation: it.elevation ?? elevation,
    })
  }, [picked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the district clears the selection; coming back starts clean.
  useEffect(() => {
    if (!focused && picked >= 0) onPick(-1)
  }, [focused, picked, onPick])

  // Arrow keys walk the collection. With nothing chosen they start it from
  // either end, which on a timeline is the natural way in.
  useEffect(() => {
    if (!focused || !keys || n === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onPick(picked < 0 ? 0 : (picked + 1) % n)
      else if (e.key === 'ArrowLeft') onPick(picked < 0 ? n - 1 : (picked - 1 + n) % n)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, keys, picked, n, onPick])

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!focused) return
    e.stopPropagation()
    const id = e.instanceId ?? -1
    if (id !== hover.current) {
      const prev = hover.current
      hover.current = id
      paint(prev)
      paint(id)
      setHovered(id)
    }
    setCursor('pointer')
  }
  const onOut = () => {
    const prev = hover.current
    hover.current = -1
    paint(prev)
    setHovered(-1)
    setCursor('')
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!focused) return
    e.stopPropagation()
    const id = e.instanceId ?? -1
    if (id < 0) return
    // Choosing the chosen one again clears it: a way back to nothing that is
    // not "choose something else".
    onPick(id === picked ? -1 : id)
  }

  const chosen = focused && picked >= 0 && picked < n ? items[picked] : null
  // Named on hover, so a gallery can be browsed without a label over every
  // work — the name follows the pointer, and stays once clicked.
  const under = focused && hovered >= 0 && hovered < n && hovered !== picked ? items[hovered] : null

  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, slots]}
        castShadow={castShadow}
        receiveShadow
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
      {parts?.map((part, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            partMeshes.current[k] = el
          }}
          args={[part.geometry, part.material, slots]}
          castShadow={castShadow}
          receiveShadow
          onPointerMove={onMove}
          onPointerOut={onOut}
          onClick={onClick}
        />
      ))}

      {marker && chosen && (
        <mesh
          geometry={marker.geometry}
          material={marker.material}
          position={[chosen.x, chosen.y + lift + (marker.lift ?? 0.04), chosen.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
          userData={{ noShadow: true }}
        />
      )}

      {chosen && (
        <Html position={[chosen.x, chosen.y + lift + labelHeight, chosen.z]} center zIndexRange={[8, 0]}>
          <div className="exhibit" aria-hidden="true">
            {chosen.name}
          </div>
        </Html>
      )}
      {under && (
        <Html position={[under.x, under.y + lift + labelHeight, under.z]} center zIndexRange={[7, 0]}>
          <div className="exhibit exhibit--hover" aria-hidden="true">
            {under.name}
          </div>
        </Html>
      )}

      {/* The same fact, spoken: the pill above is aria-hidden because it is
          portalled out of the document order that describes this scene. */}
      <Html position={[0, 0, 0]} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        <p className="sr-only" aria-live="polite">
          {chosen ? `${chosen.name} selected, in ${d.name}.` : ''}
        </p>
      </Html>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Labels in the scene, without fonts and without a DOM node each
// ---------------------------------------------------------------------------

export type LabelAtlas = {
  texture: THREE.CanvasTexture
  /** Per label: u, v, width, height in texture space. */
  cells: [number, number, number, number][]
  /** Height over width of one cell, so the quad matches it. */
  aspect: number
}

const CELL_H = 64
const COLS = 4
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

/**
 * Draws a set of short strings into one texture, one cell each.
 *
 * Text in the scene has two conventional routes and this is neither. drei's
 * <Text> needs a font file, and its default is fetched from a CDN, which this
 * project does not do; <Html> is a DOM node per label, each re-projected every
 * frame, which for sixty year-marks on a timeline is a measurable cost and
 * still occludes wrongly without a raycast per label. A canvas atlas costs
 * nothing per frame, occludes correctly because it is geometry, and uses the
 * system font, so it needs no fetch at all.
 *
 * Stroked before filled so the letters stay legible over grass, sea and stone
 * alike; the fill is white and the stroke a near-black, and the text shrinks
 * to fit its cell rather than clipping.
 */
export function makeLabelAtlas(texts: readonly string[], { cellWidth = 256 } = {}): LabelAtlas {
  const CELL_W = cellWidth
  const rows = Math.max(1, Math.ceil(texts.length / COLS))
  const canvas = document.createElement('canvas')
  canvas.width = CELL_W * COLS
  canvas.height = CELL_H * rows
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(8, 14, 24, 0.9)'
  ctx.fillStyle = '#ffffff'

  const cells: LabelAtlas['cells'] = []
  texts.forEach((text, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const cx = col * CELL_W + CELL_W / 2
    const cy = row * CELL_H + CELL_H / 2

    let size = 34
    ctx.font = `700 ${size}px ${FONT}`
    while (ctx.measureText(text).width > CELL_W - 20 && size > 14) {
      size -= 2
      ctx.font = `700 ${size}px ${FONT}`
    }
    ctx.lineWidth = Math.max(3, size / 6)
    ctx.strokeText(text, cx, cy)
    ctx.fillText(text, cx, cy)

    // flipY is on, so texture v runs bottom-up while canvas y runs top-down.
    cells.push([
      (col * CELL_W) / canvas.width,
      1 - ((row + 1) * CELL_H) / canvas.height,
      CELL_W / canvas.width,
      CELL_H / canvas.height,
    ])
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.anisotropy = 4
  texture.needsUpdate = true
  return { texture, cells, aspect: CELL_H / CELL_W }
}

/** One unit-wide quad per cell aspect in use. */
const LABEL_PLANES = new Map<number, THREE.PlaneGeometry>()
function labelPlane(aspect: number) {
  let plane = LABEL_PLANES.get(aspect)
  if (!plane) {
    plane = new THREE.PlaneGeometry(1, aspect)
    LABEL_PLANES.set(aspect, plane)
  }
  return plane
}

export type LabelPlacement = {
  /** Index into the atlas. */
  cell: number
  x: number
  y: number
  z: number
  /** World width; the height follows the cell's aspect. */
  width: number
  /** For a flat label: rotation about Y, then a lean about its own X. */
  yaw?: number
  pitch?: number
}

/*
  Billboarding, in the vertex shader.

  Each instance's matrix places its label; the quad's own corners are then
  laid out in VIEW space rather than model space, so every label faces the
  camera whatever it is doing. This is what lets the same labels serve the
  district view, the close-up of a chosen exhibit, and every orbit in between,
  and it is why a floating label carries no rotation: the text is never seen
  mirrored, which a fixed-yaw plane would be from the far side.

  The scale is read back from the matrix columns rather than passed in, and
  the model matrix's own scale is included so that the reveal — which grows
  each district from nothing — grows its labels with it.
*/
const BILLBOARD_GLSL = /* glsl */ `
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
vec2 lblScale = vec2(
  length(modelViewMatrix[0].xyz) * length(instanceMatrix[0].xyz),
  length(modelViewMatrix[1].xyz) * length(instanceMatrix[1].xyz)
);
mvPosition.xy += transformed.xy * lblScale;
vLblDepth = -mvPosition.z;
gl_Position = projectionMatrix * mvPosition;
`

/*
  A flat label is ordinary geometry: it lies where its matrix puts it, so it
  can be written ON a surface — the name on a station's panel — and turn with
  it. Only seen from the front, by construction of whatever it is written on.
*/
const FLAT_GLSL = /* glsl */ `
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
vLblDepth = -mvPosition.z;
gl_Position = projectionMatrix * mvPosition;
`

/**
 * Every label of one atlas, as a single instanced mesh.
 *
 * The material is a basic one patched to read its cell from a per-instance
 * attribute: `vMapUv` — three's own map coordinate — is overwritten right after
 * the uv chunk sets it, so the rest of the material carries on as if each
 * instance had been given a texture of its own. Unlit and untonemapped, so the
 * text is the white it was drawn; fog off, so it stays readable at any
 * distance; and invisible to the raycaster, so a label can never be the thing
 * that got clicked instead of what it names.
 */
export function InstancedLabels({
  atlas,
  placements,
  opacity = 1,
  fade,
  capacity,
  billboard = true,
}: {
  atlas: LabelAtlas
  placements: readonly LabelPlacement[]
  opacity?: number
  /** Face the camera (the default), or lie flat where placed. */
  billboard?: boolean
  /**
   * Camera distances between which the labels fade out. Sixty year-marks
   * are notation for someone standing among them; from the district view
   * they are only a fringe of white specks, and from home a smear.
   */
  fade?: [number, number]
  /** Instances allocated, for a set of labels that changes at runtime. */
  capacity?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const n = placements.length
  const slots = capacity ?? Math.max(n, 1)

  /*
    The fade lives in a uniform the material holds by reference, so a change
    of fade is a change of value, not a new material. That matters more than
    it looks: the material is one of this mesh's constructor args, and a new
    one on any render would remount the mesh with every instance back at the
    origin — the matrices below are only written when the placements change.
  */
  const uFade = useRef({ value: new THREE.Vector2(1e6, 2e6) })
  useEffect(() => {
    uFade.current.value.set(fade?.[0] ?? 1e6, fade?.[1] ?? 2e6)
  }, [fade?.[0], fade?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const geometry = useMemo(() => {
    const g = labelPlane(atlas.aspect).clone()
    const cells = new Float32Array(slots * 4)
    placements.forEach((p, i) => cells.set(atlas.cells[p.cell], i * 4))
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4))
    return g
  }, [atlas, placements, slots])

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      opacity,
      alphaTest: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uFade = uFade.current
      shader.vertexShader = `attribute vec4 aCell;\nvarying float vLblDepth;\n${shader.vertexShader}`
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = aCell.xy + uv * aCell.zw;')
        .replace('#include <project_vertex>', billboard ? BILLBOARD_GLSL : FLAT_GLSL)
      shader.fragmentShader = `uniform vec2 uFade;\nvarying float vLblDepth;\n${shader.fragmentShader}`.replace(
        '#include <alphatest_fragment>',
        'diffuseColor.a *= 1.0 - smoothstep(uFade.x, uFade.y, vLblDepth);\n#include <alphatest_fragment>',
      )
    }
    m.customProgramCacheKey = () => (billboard ? 'atlas-label' : 'atlas-label-flat')
    return m
  }, [atlas, opacity, billboard])

  useLayoutEffect(() => {
    const m = mesh.current
    placements.forEach((p, i) => {
      P.set(p.x, p.y, p.z)
      Q.setFromAxisAngle(UP, p.yaw ?? 0)
      if (p.pitch) Q.multiply(Q2.setFromAxisAngle(RIGHT, p.pitch))
      S.set(p.width, p.width, 1)
      M.compose(P, Q, S)
      m.setMatrixAt(i, M)
    })
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (n > 0) m.computeBoundingSphere()
  }, [placements, n])

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, slots]}
      raycast={() => null}
      // Never a shadow caster: a transparent quad would print a black slab on
      // the ground under every word. The walk in DistrictLayer honours this.
      userData={{ noShadow: true }}
    />
  )
}
