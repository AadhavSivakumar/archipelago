import { Environment, Lightformer, OrbitControls, Sky } from '@react-three/drei'
import { CameraRig } from './CameraRig'
import { Districts } from './DistrictLayer'
import { Island, Water } from './Island'
import type { DistrictId } from './districts'

/** Shared by the sky shader and the shadow-casting sun so they agree. */
const SUN: [number, number, number] = [46, 34, 26]

type Props = {
  focus: DistrictId | null
  onFocus: (id: DistrictId) => void
}

export function Scene({ focus, onFocus }: Props) {
  return (
    <>
      <Sky sunPosition={SUN} turbidity={5} rayleigh={1.6} mieCoefficient={0.008} mieDirectionalG={0.82} />
      <fog attach="fog" args={['#bcd2e4', 70, 210]} />

      {/*
        A procedural environment rather than an HDRI preset: drei's presets are
        fetched from a CDN at runtime, which would add a network dependency to a
        statically hosted page. Lightformers give the metals something to
        reflect without leaving the bundle.
      */}
      <Environment resolution={256}>
        <Lightformer form="ring" intensity={3.2} color="#ffe6bd" scale={16} position={[24, 18, -12]} />
        <Lightformer form="rect" intensity={0.9} color="#9fc4ff" scale={[80, 40]} position={[-40, 20, -20]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#7fb0d8" scale={[90, 90]} position={[0, -30, 0]} rotation-x={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.7} color="#dceaff" scale={[90, 40]} position={[0, 40, 0]} rotation-x={Math.PI / 2} />
      </Environment>

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#cfe4ff', '#4a5a44', 0.6]} />
      <directionalLight
        castShadow
        position={SUN}
        intensity={2.8}
        color="#fff2dc"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-52}
        shadow-camera-right={52}
        shadow-camera-top={52}
        shadow-camera-bottom={-52}
      />

      <Island />
      <Water />
      <Districts focus={focus} onFocus={onFocus} />

      <CameraRig focus={focus} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        minDistance={14}
        maxDistance={110}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  )
}
