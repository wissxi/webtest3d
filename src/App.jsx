import { Suspense, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { Experience } from './scene/Experience'
import { Overlay } from './ui/Overlay'
import { Cursor } from './ui/Cursor'
import { store } from './lib/store'

export default function App() {
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
  const veil = useRef()

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
    if (q.has('spirit')) store.forceReveal = 1
    const tl = gsap.timeline({ delay: 0.25 })
    tl.to(veil.current, { opacity: 0, duration: 1.6, ease: 'power2.inOut' })
      .to(store, { intro: 1, duration: store.intro > 0.9 ? 0.1 : 4.2, ease: 'power2.inOut' }, 0)
      .add(() => veil.current && (veil.current.style.display = 'none'))
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      tl.kill()
    }
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <Experience debug={debug} />
      </Suspense>
      <Overlay />
      <Cursor />
      <div className="veil" ref={veil} />
      {debug && <pre id="perf" className="perf" />}
    </>
  )
}
