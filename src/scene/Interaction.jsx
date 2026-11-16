import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2, Vector3 } from 'three'
import gsap from 'gsap'
import { store } from '../lib/store'
import { G } from '../lib/uniforms'
import { grassTrail, lensTrail, GRASS_BOUNDS } from '../lib/TrailMap'

/** Pointer → world: ray uniforms, grass deformation map, reveal lens map. */
export function Interaction() {
  const { gl, camera, size } = useThree()
  const tmp = useMemo(
    () => ({ ray: new Raycaster(), local: new Vector3(), groundUv: new Vector2(), prevGroundUv: new Vector2(), ghost: new Vector2(), prevGhost: new Vector2(0.5, 0.5) }),
    [],
  )

  useEffect(() => {
    gl.info.autoReset = false
    const onMove = (e) => {
      store.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
      store.pointerUv.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight)
      if (!store.pointerActive) store.prevPointerUv.copy(store.pointerUv)
      store.pointerActive = true
      store.lastMove = performance.now()
    }
    const onLeave = () => (store.pointerActive = false)
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('a,button')) return
      onMove(e)
      gsap.killTweensOf(store, 'pulse,burst')
      gsap.fromTo(store, { pulse: 0 }, { pulse: 1, duration: 0.35, ease: 'power2.out', yoyo: true, repeat: 1, repeatDelay: 0.15 })
      gsap.fromTo(store, { burst: 0.001 }, { burst: 1, duration: 1.4, ease: 'expo.out', onComplete: () => (store.burst = 0) })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [gl])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)
    gl.info.reset()
    G.uTime.value = state.clock.elapsedTime
    G.uPulse.value = store.pulse

    // cursor ray (also used by vines & butterflies)
    tmp.ray.setFromCamera(store.pointer, camera)
    G.uRayO.value.copy(tmp.ray.ray.origin)
    G.uRayD.value.copy(tmp.ray.ray.direction)
    G.uRayActive.value += ((store.pointerActive ? 1 : 0) - G.uRayActive.value) * (1 - Math.exp(-dt * 6))

    // where does the cursor touch the meadow?
    let hit = false
    if (store.pointerActive && store.groundMesh) {
      const hits = tmp.ray.intersectObject(store.groundMesh, false)
      if (hits.length) {
        tmp.local.copy(hits[0].point)
        store.groundMesh.worldToLocal(tmp.local)
        tmp.groundUv.set(tmp.local.x / (GRASS_BOUNDS * 2) + 0.5, tmp.local.z / (GRASS_BOUNDS * 2) + 0.5)
        if (!store.groundHit) tmp.prevGroundUv.copy(tmp.groundUv)
        hit = true
      }
    }
    const moved = tmp.groundUv.distanceTo(tmp.prevGroundUv)
    const gu = grassTrail.uniforms
    gu.uA.value.copy(tmp.prevGroundUv)
    gu.uB.value.copy(tmp.groundUv)
    gu.uRadius.value = 0.05
    gu.uStrength.value = hit ? Math.min(1, 0.25 + moved * 60) : 0
    gu.uDecay.value = Math.pow(0.99, dt * 60)
    gu.uExtraPos.value.copy(tmp.groundUv)
    gu.uExtraRadius.value = store.burst > 0 && hit ? 0.06 + store.burst * 0.25 : 0
    gu.uExtraStrength.value = store.burst > 0 && hit ? (1 - store.burst) * 0.4 : 0
    grassTrail.update(gl)
    tmp.prevGroundUv.copy(tmp.groundUv)
    store.groundHit = hit

    // idle "ghost" lens: drifts by itself until the visitor moves the mouse
    const idle = !store.lastMove || performance.now() - store.lastMove > 3500
    const ghostTarget = idle && store.intro > 0.95 && !store.pointerActive ? 1 : 0
    store.ghost = (store.ghost ?? 0) + (ghostTarget - (store.ghost ?? 0)) * (1 - Math.exp(-dt * 1.5))
    const t = state.clock.elapsedTime
    tmp.ghost.set(0.5 + Math.sin(t * 0.33) * 0.16, 0.56 + Math.sin(t * 0.51 + 1) * 0.12)

    const aspect = size.width / size.height
    const lu = lensTrail.uniforms
    const usingGhost = !store.pointerActive && store.ghost > 0.02
    const head = usingGhost ? tmp.ghost : store.pointerUv
    const tail = usingGhost ? tmp.prevGhost : store.prevPointerUv
    lu.uA.value.copy(tail)
    lu.uB.value.copy(head)
    lu.uAspect.value = aspect
    lu.uRadius.value = store.lensRadius * (usingGhost ? 0.85 : 1) * (1 + store.pulse * 0.15)
    lu.uStrength.value = store.pointerActive ? 1 : usingGhost ? store.ghost : 0
    lu.uDecay.value = Math.pow(0.9, dt * 60)
    lu.uExtraPos.value.copy(store.pointerUv)
    lu.uExtraRadius.value = store.burst > 0 ? store.burst * 0.75 : 0
    lu.uExtraStrength.value = store.burst > 0 ? 1 - store.burst * store.burst : 0
    lensTrail.update(gl)
    store.prevPointerUv.copy(store.pointerUv)
    tmp.prevGhost.copy(tmp.ghost)
  }, -1)

  return null
}
