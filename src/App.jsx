import { Suspense, useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { Experience } from './scene/Experience'
import { Overlay } from './ui/Overlay'
import { Cursor } from './ui/Cursor'
import { store } from './lib/store'

gsap.ticker.lagSmoothing(0)

export default function App() {
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
  const veil = useRef()

  // Runs once the first frames are on screen. The veil fades with a CSS transition and
  // the intro uses real time, so a slow first frame can't leave the page black.
  const onReady = useCallback(() => {
    veil.current?.classList.add('gone')
    if (store.intro < 0.9) gsap.to(store, { intro: 1, duration: 3.4, ease: 'power2.inOut' })
    else store.intro = 1
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      store.scroll = max > 0 ? window.scrollY / max : 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    const q = new URLSearchParams(window.location.search)
    if (q.has('nointro')) store.intro = 0.999
    if (q.has('alive')) store.forceReveal = 1
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <Experience debug={debug} onReady={onReady} />
      </Suspense>
      <Overlay />
      <Cursor />
      <div className="veil" ref={veil} />
      {debug && <pre id="perf" className="perf" />}
    </>
  )
}
