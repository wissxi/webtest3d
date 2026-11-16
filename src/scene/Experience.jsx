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
      <hemisphereLight args={['#3c7a5e', '#0b3a1c', 0.85]} />
      <directionalLight position={[-4, 9, 3]} intensity={1.9} color="#d4ffe6" />
      <directionalLight position={[3, 1.5, -7]} intensity={1.1} color="#6dffb0" />
      {/* the light that lives in the abyss */}
      <pointLight ref={depth} position={[0.4, -9.5, 0.6]} color="#38ff8c" intensity={110} distance={0} decay={2} />
      <pointLight position={[-0.3, 1.4, 1.2]} color="#a6ff9c" intensity={3} distance={6} decay={2} />
    </>
  )
}

function Ready({ onReady }) {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 3) onReady?.()
  })
  return null
}

const MAX_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1

export function Experience({ debug, onReady }) {
  const world = useMemo(() => buildWorld(), [])
  const [dpr, setDpr] = useState(Math.min(MAX_DPR, 1))
  const caOffset = useMemo(() => new Vector2(0.0007, 0.0005), [])
  return (
    <Canvas
      className="webgl"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 40, near: 0.1, far: 220, position: [0, -14, 13] }}
      eventSource={document.getElementById('root')}
      eventPrefix="client"
      fallback={<div className="nogl">Этому браузеру не хватает WebGL 2 — открой сайт в свежем Chrome, Safari или Firefox.</div>}
    >
      <PerformanceMonitor
        bounds={() => [45, 58]}
        flipflops={4}
        onIncline={() => setDpr((d) => Math.min(MAX_DPR, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(0.6, d - 0.2))}
        onFallback={() => setDpr(0.75)}
      />
      <Ready onReady={onReady} />
      <color attach="background" args={['#04170e']} />
      <fogExp2 attach="fog" args={['#072519', 0.028]} />

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

      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.4} luminanceSmoothing={0.3} radius={0.72} levels={6} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} />
        <Vignette offset={0.3} darkness={0.6} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.35} />
      </EffectComposer>

      {debug && <PerfProbe />}
    </Canvas>
  )
}
