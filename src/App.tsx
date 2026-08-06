import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'

export function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 4, 15], fov: 45 }} dpr={[1, 2]}>
        <Scene />
      </Canvas>

      <header className="overlay">
        <h1>archipelago</h1>
        <p>React Three Fiber + GSAP</p>
      </header>
    </>
  )
}
