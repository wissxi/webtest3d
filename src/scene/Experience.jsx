import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { Vector2 } from 'three'
import { buildWorld } from '../lib/world'
import { applyIsleMotion, store } from '../lib/store'
import { Island } from './Island'
import { Grass } from './Grass'
import { Butterflies } from './Butterflies'
import { Atmosphere } from './Atmosphere'
import { Spirit } from './Spirit'
import { Interaction } from './Interaction'
import { CameraRig } from './CameraRig'
import { PerfProbe } from './PerfProbe'

function Isle({ world }) {
  const ref = useRef()
  useFrame((state) => applyIsleMotion(ref.current, state.clock.elapsedTime))
  return (
    <group ref={ref}>
      <Island world={world} />
      <Grass world={world} />
    </group>
  )
}

function Lights() {
  const depth = useRef()
  useFrame((state) => {
    const t = state.clock.elapsedTime
    depth.current.intensity = 110 * (1 + Math.sin(t * 0.8) * 0.12 + store.pulse * 0.8)
  })
  return (
    <>
      <hemisphereLight args={['#2c5c4a', '#06210f', 0.5]} />
      <directionalLight position={[-4, 9, 3]} intensity={1.5} color="#d4ffe6" />
      <directionalLight position={[3, 1.5, -7]} intensity={1.1} color="#6dffb0" />
      {/* the light that lives in the abyss */}
      <pointLight ref={depth} position={[0.4, -9.5, 0.6]} color="#38ff8c" intensity={110} distance={0} decay={2} />
      <pointLight position={[-0.3, 1.4, 1.2]} color="#a6ff9c" intensity={3} distance={6} decay={2} />
    </>
  )
}

export function Experience({ debug }) {
  const world = useMemo(() => buildWorld(), [])
  const [dpr, setDpr] = useState(1.5)
  const caOffset = useMemo(() => new Vector2(0.0007, 0.0005), [])
  return (
    <Canvas
      className="webgl"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 40, near: 0.1, far: 220, position: [0, -14, 13] }}
      eventSource={document.getElementById('root')}
      eventPrefix="client"
    >
      <PerformanceMonitor onIncline={() => setDpr(1.5)} onDecline={() => setDpr(1)} flipflops={3} onFallback={() => setDpr(1)} />
      <color attach="background" args={['#010503']} />
      <fogExp2 attach="fog" args={['#03130b', 0.04]} />

      <CameraRig />
      <Interaction />

      <Environment resolution={64} frames={1} environmentIntensity={0.35}>
        <Lightformer form="ring" intensity={3} color="#3dff8f" position={[0, -6, 0]} scale={8} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1.2} color="#bfffe0" position={[0, 6, 0]} scale={[10, 10, 1]} rotation-x={-Math.PI / 2} />
        <Lightformer intensity={0.6} color="#1d6b45" position={[6, 0, -4]} scale={[4, 8, 1]} />
      </Environment>

      <Lights />
      <Atmosphere />
      <Isle world={world} />
      <Butterflies />
      <Spirit world={world} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.32} luminanceSmoothing={0.35} radius={0.78} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} />
        <Vignette offset={0.22} darkness={0.82} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.35} />
      </EffectComposer>

      {debug && <PerfProbe />}
    </Canvas>
  )
}
