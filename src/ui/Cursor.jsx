import { useEffect, useRef } from 'react'
import { store } from '../lib/store'

/** A ring that trails the pointer and frames the reveal lens. */
export function Cursor() {
  const ring = useRef()
  const dot = useRef()
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf
    let seen = false
    const move = (e) => {
      x = e.clientX
      y = e.clientY
      if (!seen) {
        rx = x
        ry = y
        seen = true
      }
    }
    const loop = () => {
      rx += (x - rx) * 0.16
      ry += (y - ry) * 0.16
      const d = store.lensRadius * 2 * innerHeight * (1 + store.pulse * 0.15)
      if (ring.current) {
        ring.current.style.width = ring.current.style.height = d + 'px'
        ring.current.style.transform = `translate3d(${rx - d / 2}px, ${ry - d / 2}px, 0)`
        ring.current.style.opacity = seen && store.pointerActive ? 1 : 0
      }
      if (dot.current) {
        dot.current.style.transform = `translate3d(${x - 3}px, ${y - 3}px, 0)`
        dot.current.style.opacity = seen && store.pointerActive ? 1 : 0
      }
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', move, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
    }
  }, [])
  return (
    <>
      <div className="cursor-ring" ref={ring} aria-hidden="true">
        <span>дух</span>
      </div>
      <div className="cursor-dot" ref={dot} aria-hidden="true" />
    </>
  )
}
