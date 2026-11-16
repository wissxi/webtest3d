import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/** Writes FPS, draw calls, triangles and GPU memory into #perf (enabled with ?debug). */
export function PerfProbe() {
  const acc = useRef({ frames: 0, time: 0 })
  useFrame((state, delta) => {
    const a = acc.current
    a.frames++
    a.time += delta
    if (a.time < 0.5) return
    const el = document.getElementById('perf')
    if (el) {
      const { render, memory } = state.gl.info
      el.textContent =
        `${Math.round(a.frames / a.time)} fps · ${render.calls} draws · ${(render.triangles / 1000).toFixed(0)}k tris\n` +
        `${memory.geometries} geo · ${memory.textures} tex · dpr ${state.viewport.dpr}`
    }
    a.frames = 0
    a.time = 0
  }, 10)
  return null
}
