# archipelago

Interactive 3D web project built on React Three Fiber and GSAP.

## Stack

| Concern | Choice | Verified at |
| --- | --- | --- |
| 3D renderer | **React Three Fiber** — React renderer for Three.js | 9.7.0 |
| React | **19.x** (R3F v9 peer-requires `>=19 <19.3`) | 19.2.8 |
| 3D helpers | `@react-three/drei` — the v10 line pairs with R3F v9 | 10.7.8 |
| Animation | **GSAP 3** + `@gsap/react` (`useGSAP` hook) | 3.15.0 |
| Three.js | | 0.185.1 |
| Build | Vite + TypeScript | Vite 8, TS 7 |

Do not move React to 19.3+ without checking R3F's peer range first — R3F pins
below it because React bumps its internal reconciler on minor releases.

GSAP has been fully free since April 2025, including all former Club plugins
(ScrollTrigger, SplitText, MorphSVG, etc.). Use them without hesitation — no
license gate, commercial use included.

Add only when actually needed: `@react-three/postprocessing` (effects),
`@react-three/rapier` (physics), `leva` (dev-time controls).

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc && vite build
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

## R3F + GSAP integration rules

These two libraries each own a render loop. Getting the seam right is most of
the work — follow these:

1. **Animate objects, never React state.** Tween `mesh.position` / `.rotation` /
   `material.uniforms.x.value` through a ref. A `setState` per frame re-renders
   the React tree 60×/sec and will tank the frame rate.

   ```tsx
   const ref = useRef<THREE.Mesh>(null!)
   useGSAP(() => {
     gsap.to(ref.current.rotation, { y: Math.PI * 2, duration: 2, ease: 'power2.inOut' })
   }, [])
   ```

2. **Always use `useGSAP()`, never bare `useEffect`.** It handles teardown of
   tweens, timelines and ScrollTriggers on unmount. Pass `{ scope: containerRef }`
   when using selector strings so they don't leak past the component.

3. **One writer per property.** If GSAP tweens `mesh.position.y`, nothing in
   `useFrame` may also write it — last write wins and you get jitter. Pick GSAP
   for scripted/eased sequences, `useFrame` for continuous or physics-driven
   motion.

4. **`frameloop="demand"` requires `invalidate()`.** On-demand rendering doesn't
   know GSAP mutated the scene, so the canvas goes stale mid-tween:

   ```tsx
   const invalidate = useThree((s) => s.invalidate)
   gsap.to(ref.current.position, { x: 5, onUpdate: invalidate })
   ```

   If most of the scene is animated, just use the default `frameloop="always"`.

5. **Scroll: choose one system.** GSAP ScrollTrigger *or* drei's `ScrollControls`
   — never both on the same page. Default to ScrollTrigger when the page has DOM
   content scrolling alongside the canvas.

6. **Prefer `set()` + `to()` over `from()` on scene objects.** `from()` captures
   whatever the target holds when the tween is built and uses it as the
   destination. Under StrictMode's mount → revert → mount cycle it can capture an
   already-zeroed value and animate 0 → 0, leaving the object invisible forever.
   Absolute start and end values make the timeline idempotent no matter how often
   the effect reruns. `fromTo()` is fine — it's only bare `from()` that infers.
   See `src/scene/Islands.tsx`.

7. **Tween after load.** Refs into a `useGLTF` result are null until the model
   resolves. Build the timeline inside `useGSAP` with the loaded object in the
   dependency array, or start it from a Suspense-boundary callback.

## R3F conventions

- **Never allocate in render.** `new THREE.Vector3()` / `new THREE.Color()` in a
  component body allocates every frame. Hoist to module scope or `useMemo`.
- **Share geometries and materials.** Declare once and reuse; for many copies of
  the same mesh use `<Instances>` / `InstancedMesh` rather than N components.
- Wrap anything using `useLoader`/`useGLTF` in `<Suspense>`. Call
  `useGLTF.preload(url)` at module scope for assets needed immediately.
- Keep the `<Canvas>` in one place. Scene contents are components under it;
  don't nest Canvases.
- Prefer drei over hand-rolling — `OrbitControls`, `Environment`, `useTexture`,
  `Html`, `Text` are all better than a local reimplementation.
- Colors: R3F applies sRGB/tone mapping by default. If colors look washed out,
  fix the texture's `colorSpace` rather than tweaking hex values.

## Layout

```
src/
  components/     React (DOM) components
  scene/          R3F scene graph — meshes, lights, cameras, controls
  animations/     reusable GSAP timelines and easing config
  hooks/
  shaders/        .glsl / TSL sources
public/models/    .glb assets (draco/meshopt compressed)
```

## Notes

- Ship `.glb`, not `.gltf` + loose files. Compress with `gltf-transform`.
- Do not add a state library for 3D transforms — refs are the idiom here.
  Zustand is fine for app state that genuinely triggers React re-renders.
