import { Vector2, Vector3, Ray } from 'three'

/**
 * Mutable, render-loop friendly shared state. React never re-renders from this;
 * components read it inside useFrame.
 */
export const store = {
  pointer: new Vector2(0, 0), // NDC, -1..1
  pointerUv: new Vector2(0.5, 0.5), // 0..1, y up
  prevPointerUv: new Vector2(0.5, 0.5),
  pointerActive: false,
  pointerSpeed: 0,
  ray: new Ray(),
  ground: new Vector3(0, -100, 0),
  prevGround: new Vector3(0, -100, 0),
  groundHit: false,
  scroll: 0, // raw 0..1
  scrollSmooth: 0,
  pulse: 0, // click "breath", animated by gsap
  burst: 0, // click reveal burst
  intro: 0, // 0 → 1 intro rise
  lensRadius: 0.13, // fraction of viewport height
  revealGlobal: 0, // finale: whole screen in spirit vision
  time: 0,
}

/** The isle breathes very slowly; shared by the real and the spirit world. */
export function applyIsleMotion(obj, t) {
  obj.position.y = Math.sin(t * 0.35) * 0.08
  obj.rotation.y = Math.sin(t * 0.07) * 0.05
}
