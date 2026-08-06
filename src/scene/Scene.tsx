import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Islands } from './Islands'

export function Scene() {
  return (
    <>
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', 16, 40]} />

      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={2.4} />
      <directionalLight position={[-8, 2, -6]} intensity={1} color="#6d8dff" />

      <Islands />

      <ContactShadows position={[0, -3.5, 0]} scale={36} opacity={0.35} blur={2.6} far={10} />

      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2}
        enableDamping
      />
    </>
  )
}
