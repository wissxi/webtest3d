import { useEffect, useRef } from 'react'
import gsap from 'gsap'

const SECTIONS = [
  {
    id: 'isle',
    kicker: 'Летающий остров · №01',
    title: ['Verdant', 'Isle'],
    text: 'Островок над бездной, где свет поднимается из глубины, а бабочки помнят дорогу домой.',
    hint: 'Веди курсором — сквозь листву проступает маска духа',
    align: 'left',
    hero: true,
  },
  {
    id: 'vines',
    kicker: '01 — Лианы',
    title: ['Корни', 'во тьме'],
    text: 'Лианы свисают в пустоту и отклоняются от курсора. Единственное солнце этого места — сияние из глубины.',
    align: 'right',
  },
  {
    id: 'wings',
    kicker: '02 — Бабочки',
    title: ['Живое', 'облако'],
    text: 'Они избегают руки и рассыпаются от клика. Проведи по траве — она засветится и примнётся, как снег под шагами.',
    align: 'left',
  },
  {
    id: 'mask',
    kicker: '03 — Маска',
    title: ['Под зелёной', 'кожей'],
    text: 'Под островом спит дух. Ты уже видел его лицо — теперь мир показывает его целиком.',
    align: 'right',
    cta: true,
  },
]

export function Overlay() {
  const root = useRef()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero .word', { yPercent: 110, opacity: 0, duration: 1.6, ease: 'expo.out', stagger: 0.12, delay: 1.6 })
      gsap.from('.hero .fade', { y: 18, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.1, delay: 2.1 })
      gsap.from('.topbar > *', { y: -12, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.08, delay: 1.8 })
    }, root)

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting || e.target.dataset.shown) return
          e.target.dataset.shown = '1'
          gsap.fromTo(e.target.querySelectorAll('.word'), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.3, ease: 'expo.out', stagger: 0.1 })
          gsap.fromTo(e.target.querySelectorAll('.fade'), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.08, delay: 0.25 })
        }),
      { threshold: 0.35 },
    )
    root.current.querySelectorAll('section:not(.hero)').forEach((s) => io.observe(s))

    const dots = root.current.querySelectorAll('.progress i')
    const onScroll = () => {
      const i = Math.round(window.scrollY / window.innerHeight)
      dots.forEach((d, k) => d.classList.toggle('on', k === i))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ctx.revert()
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div className="overlay" ref={root}>
      <header className="topbar">
        <a className="logo" href="#isle">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2c4 3.5 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 2-7.5 6-11Z" />
            <path d="M12 7v15" />
          </svg>
          verdant
        </a>
        <nav>
          {SECTIONS.slice(1).map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.kicker.split('— ')[1]}
            </a>
          ))}
        </nav>
        <span className="tag">WebGL · R3F · GLSL</span>
      </header>

      <div className="progress" aria-hidden="true">
        {SECTIONS.map((s) => (
          <i key={s.id} />
        ))}
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className={`panel ${s.align} ${s.hero ? 'hero' : ''}`}>
          <div className="copy">
            <p className="kicker fade">{s.kicker}</p>
            <h1 className={s.hero ? 'display' : 'title'}>
              {s.title.map((w, i) => (
                <span className="line" key={i}>
                  <span className="word">{w}</span>
                </span>
              ))}
            </h1>
            <p className="text fade">{s.text}</p>
            {s.hint && (
              <p className="hint fade">
                <span className="pulse" /> {s.hint}
              </p>
            )}
            {s.cta && (
              <a className="cta fade" href="#isle">
                Вернуться на остров
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </a>
            )}
          </div>
        </section>
      ))}
      {SECTIONS[0] && (
        <div className="scroll-cue fade" aria-hidden="true">
          <span>scroll</span>
          <i />
        </div>
      )}
    </div>
  )
}
