import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, MathUtils, Vector2, Vector3 } from 'three'
import { store } from '../lib/store'

const v = (x, y, z) => new Vector3(x, y, z)

// one key per section of the page
const POS = [v(-1.4, 2.0, 12.6), v(4.8, -5.2, 9.6), v(-4.4, 3.0, 5.6), v(1.6, 5.4, 13)]
const TGT = [v(-2.4, 1.15, 0), v(2.2, -2.4, 0), v(-0.4, 1.7, 0.4), v(2.6, 0.4, 0)]
const INTRO_POS = v(0, -14, 13)
const INTRO_TGT = v(0, -6, 0)

export function CameraRig() {
  const s = useMemo(
    () => ({
      pos: new CatmullRomCurve3(POS, false, 'centripetal'),
      tgt: new CatmullRomCurve3(TGT, false, 'centripetal'),
      P: new Vector3(),
      T: new Vector3(),
      look: new Vector3(0, 0.5, 0),
      par: new Vector2(),
      right: new Vector3(),
      up: new Vector3(),
      dir: new Vector3(),
    }),
    [],
  )

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 8)
    const cam = state.camera
    store.scrollSmooth = MathUtils.damp(store.scrollSmooth, store.scroll, 2.8, dt)
    const p = MathUtils.clamp(store.scrollSmooth, 0, 1)
    s.pos.getPoint(p, s.P)
    s.tgt.getPoint(p, s.T)

    // portrait screens: centre the isle, lift it above the copy and step back
    const aspect = state.size.width / state.size.height
    if (aspect < 1.2) {
      const a = MathUtils.clamp(aspect, 0.4, 1.2)
      const k = MathUtils.mapLinear(a, 0.4, 1.2, 1.55, 1)
      const shift = MathUtils.mapLinear(a, 0.4, 1.2, 0.15, 1)
      s.P.x *= shift
      s.T.x *= shift
      s.dir.subVectors(s.P, s.T).multiplyScalar(k)
      s.T.y -= (1.2 - a) * 1.6
      s.P.copy(s.T).add(s.dir)
    }

    const i = store.intro
    const e = 1 - Math.pow(1 - i, 3)
    s.P.lerpVectors(INTRO_POS, s.P, e)
    s.T.lerpVectors(INTRO_TGT, s.T, e)

    // soft parallax from the pointer
    s.par.x = MathUtils.damp(s.par.x, store.pointer.x, 2, dt)
    s.par.y = MathUtils.damp(s.par.y, store.pointer.y, 2, dt)
    s.right.setFromMatrixColumn(cam.matrixWorld, 0)
    s.up.setFromMatrixColumn(cam.matrixWorld, 1)
    s.P.addScaledVector(s.right, s.par.x * 0.45).addScaledVector(s.up, s.par.y * 0.25)
    // breathing handheld drift
    const t = state.clock.elapsedTime
    s.P.y += Math.sin(t * 0.4) * 0.05
    s.P.x += Math.sin(t * 0.23) * 0.06

    cam.position.copy(s.P)
    s.look.lerp(s.T, 1 - Math.exp(-dt * 6))
    cam.lookAt(s.look)
    store.revealGlobal = Math.max(MathUtils.smoothstep(p, 0.86, 1.0), store.forceReveal || 0)
  }, -2)
  return null
}
