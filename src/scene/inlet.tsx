import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { INVENTIONS } from '../content/inventions'
import { groupOf } from '../content/navigation'
import { ExhibitHall } from './exhibits'
import { ACCENT, mat, type LandmarkProps } from './landmarkKit'
import { select, useDistrictSelection } from '../state/selection'
import { layoutTimeline, Timeline } from './timeline'

/**
 * Inventors' Inlet — the Habitat's spiral again, for the things people made,
 * with a great cog turning at its centre where the ziggurat stands on the
 * other island.
 */

const AXLE = new THREE.CylinderGeometry(0.16, 0.16, 2.4, 16)
const HUB = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 32)
const RIM = new THREE.TorusGeometry(2.2, 0.28, 16, 96)
const SPOKE = new THREE.BoxGeometry(0.18, 4.1, 0.18)
const TOOTH = new THREE.BoxGeometry(0.42, 0.5, 0.36)
const TEETH = Array.from({ length: 18 }, (_, i) => (i / 18) * Math.PI * 2)
const PIER = new THREE.BoxGeometry(0.7, 3.4, 0.7)
const BASE = new THREE.BoxGeometry(5.2, 0.6, 3.2)
const CHIMNEY = new THREE.CylinderGeometry(0.42, 0.55, 6.4, 24)
const CHIMNEY_CAP = new THREE.CylinderGeometry(0.62, 0.55, 0.4, 24)
const MILESTONE = new THREE.CylinderGeometry(0.34, 0.4, 1.4, 12)

function Cog() {
  const wheel = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    wheel.current.rotation.z -= dt * 0.25
  })
  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={BASE} position={[0, 0.3, 0]} material={mat.stone} />
      <mesh geometry={PIER} position={[-2.1, 2.3, 0]} material={mat.darkStone} />
      <mesh geometry={PIER} position={[2.1, 2.3, 0]} material={mat.darkStone} />
      <mesh geometry={AXLE} rotation={[0, 0, Math.PI / 2]} position={[0, 3.9, 0]} material={mat.steel} />
      {/* noShadow: still turning after the shadow map freezes. */}
      <group ref={wheel} position={[0, 3.9, 0]} rotation={[Math.PI / 2, 0, 0]} userData={{ noShadow: true }}>
        <mesh geometry={HUB} material={mat.brass} />
        <mesh geometry={RIM} rotation={[Math.PI / 2, 0, 0]} material={mat.brass} />
        <mesh geometry={SPOKE} rotation={[Math.PI / 2, 0, 0]} material={mat.brass} />
        <mesh geometry={SPOKE} rotation={[Math.PI / 2, 0, Math.PI / 3]} material={mat.brass} />
        <mesh geometry={SPOKE} rotation={[Math.PI / 2, 0, -Math.PI / 3]} material={mat.brass} />
        <Instances geometry={TOOTH} material={ACCENT.inventions} limit={TEETH.length}>
          {TEETH.map((a, i) => (
            <Instance key={i} position={[Math.cos(a) * 2.55, 0, Math.sin(a) * 2.55]} rotation={[0, -a, 0]} />
          ))}
        </Instances>
      </group>
      <mesh geometry={CHIMNEY} position={[3.6, 3.2, -1.2]} material={mat.ember} />
      <mesh geometry={CHIMNEY_CAP} position={[3.6, 6.6, -1.2]} material={mat.darkStone} />
    </group>
  )
}

export function InventorsInlet({ d, focused }: LandmarkProps) {
  const timeline = useMemo(() => layoutTimeline(d, INVENTIONS), [d])
  const picked = useDistrictSelection(d.id)?.item ?? -1
  const pick = useCallback(
    (i: number) => select(i < 0 ? null : { district: d.id, group: groupOf(d.id, i), item: i }),
    [d.id],
  )

  return (
    <ExhibitHall focused={focused} onClear={() => pick(-1)}>
      <Cog />
      <mesh geometry={MILESTONE} position={[timeline.gate.x, timeline.gate.y + 0.7, timeline.gate.z]} material={mat.stone} />
      <Timeline d={d} focused={focused} layout={timeline} picked={picked} onPick={pick} marker={ACCENT.inventions} />
    </ExhibitHall>
  )
}
