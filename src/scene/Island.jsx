import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import { Color, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, MeshStandardMaterial, Vector3 } from 'three'
import { leafGeometry } from '../lib/world'
import { swayBasic, swayStandard } from '../lib/swayMaterial'
import { noise3 } from '../lib/noise'
import { store } from '../lib/store'

function useInstances(ref, data, { colors = true } = {}) {
  useLayoutEffect(() => {
    const m = ref.current
    m.instanceMatrix.array.set(data.matrices)
    m.instanceMatrix.needsUpdate = true
    if (colors) m.instanceColor = new InstancedBufferAttribute(data.colors, 3)
    m.geometry.setAttribute('aHang', new InstancedBufferAttribute(data.hang, 1))
    m.geometry.setAttribute('aPhase', new InstancedBufferAttribute(data.phase, 1))
    m.computeBoundingSphere()
  }, [ref, data, colors])
}

function FloatingRock({ position, scale, seed }) {
  const geometry = useMemo(() => {
    const g = new IcosahedronGeometry(1, 3)
    const p = g.attributes.position
    const v = new Vector3()
    const colors = []
    const moss = new Color('#2d5522'), rock = new Color('#30342b'), c = new Color()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const top = v.y > 0.1
      const n = noise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7)
      v.multiplyScalar(1 + n * 0.3)
      v.y = top ? v.y * 0.35 : v.y * (1.35 + 0.4 * noise3(v.x * 3 + seed, 0, v.z * 3))
      p.setXYZ(i, v.x, v.y, v.z)
      c.copy(rock).lerp(moss, top ? 0.85 : Math.max(0, n));
      colors.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new (p.constructor)(new Float32Array(colors), 3))
    g.computeVertexNormals()
    return g
  }, [seed])
  return (
    <Float speed={0.8} rotationIntensity={0.25} floatIntensity={0.6} floatingRange={[-0.25, 0.25]}>
      <mesh geometry={geometry} position={position} scale={scale} raycast={() => null}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} />
      </mesh>
    </Float>
  )
}

export function Island({ world }) {
  const topRef = useRef()
  const leavesRef = useRef()
  const vineLeavesRef = useRef()
  const bulbsRef = useRef()

  const mats = useMemo(() => {
    const leaf = leafGeometry()
    return {
      leafGeo: leaf,
      bulbGeo: new IcosahedronGeometry(1, 1),
      top: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
      bottom: new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }),
      wood: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      vines: swayStandard({ vertexColors: true, roughness: 0.8 }),
      leaves: swayStandard({ side: DoubleSide, roughness: 0.62, emissive: new Color('#0b2a0c'), emissiveIntensity: 0.6 }),
      vineLeaves: swayStandard({ side: DoubleSide, roughness: 0.7, emissive: new Color('#082207') }),
      bulbs: swayBasic({ color: new Color(0.55, 2.6, 1.3), toneMapped: false }),
    }
  }, [])

  useInstances(leavesRef, world.leaves)
  useInstances(vineLeavesRef, world.vineLeaves)
  useInstances(bulbsRef, world.bulbs, { colors: false })

  useLayoutEffect(() => {
    store.groundMesh = topRef.current
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const k = 1 + store.pulse * 0.6 + Math.sin(t * 1.7) * 0.08
    mats.bulbs.color.setRGB(0.55 * k, 2.6 * k, 1.3 * k)
  })

  return (
    <group>
      <mesh ref={topRef} geometry={world.islandTop} material={mats.top} />
      <mesh geometry={world.islandBottom} material={mats.bottom} raycast={() => null} />
      <mesh geometry={world.wood} material={mats.wood} raycast={() => null} />
      <mesh geometry={world.vines} material={mats.vines} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={leavesRef} args={[mats.leafGeo, mats.leaves, world.leaves.count]} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={vineLeavesRef} args={[mats.leafGeo, mats.vineLeaves, world.vineLeaves.count]} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={bulbsRef} args={[mats.bulbGeo, mats.bulbs, world.bulbs.count]} raycast={() => null} frustumCulled={false} />
      {world.boulders.map((b, i) => (
        <mesh key={i} geometry={b.geometry} position={b.position} scale={b.scale} rotation-y={b.rotation} raycast={() => null}>
          <meshStandardMaterial color="#3a4532" roughness={0.9} flatShading />
        </mesh>
      ))}
      <FloatingRock position={[6.2, -1.2, -2.5]} scale={0.7} seed={1} />
      <FloatingRock position={[-5.6, 0.6, -3.4]} scale={0.5} seed={2} />
      <FloatingRock position={[3.6, 2.4, -6.5]} scale={0.42} seed={3} />
      <FloatingRock position={[-4.6, -3.4, 2.2]} scale={0.38} seed={4} />
      <FloatingRock position={[5.2, -4.8, 2.6]} scale={0.3} seed={5} />
    </group>
  )
}
