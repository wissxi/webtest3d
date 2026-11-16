import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Object3D,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { G } from '../lib/uniforms'
import { lifeChunk } from '../lib/glsl'
import { store } from '../lib/store'
import { rng } from '../lib/noise'

export const BUTTERFLY_COUNT = 30

function butterflyGeometry() {
  const pos = [], side = [], uv = [], idx = []
  const N = 6
  const addGrid = (s) => {
    const base = pos.length / 3
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const u = i / N, v = j / N * 2 - 1
        pos.push(u, 0, v * 0.95)
        side.push(s)
        uv.push(u, v)
      }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = base + i * (N + 1) + j, b = a + N + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
  }
  addGrid(-1)
  addGrid(1)
  // body
  const b = pos.length / 3
  pos.push(-0.06, 0.02, -0.55, 0.06, 0.02, -0.55, 0.06, 0.02, 0.6, -0.06, 0.02, 0.6)
  side.push(0, 0, 0, 0)
  uv.push(-1, -1, 1, -1, 1, 1, -1, 1)
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('aSide', new Float32BufferAttribute(side, 1))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

const vertexShader = /* glsl */ `
uniform float uTime;
${lifeChunk}
attribute float aSide;
attribute float aPhase;
attribute float aFreq;
attribute vec3 aColor;
varying vec2 vUv;
varying float vSide;
varying vec3 vColor;
varying float vPhase;
#include <fog_pars_vertex>
void main(){
  vec3 p = position;
  float a = sin(uTime * aFreq + aPhase) * 1.0 + 0.3;
  if (aSide != 0.0) {
    float x = p.x;
    float bendA = a + x * 0.25 * cos(uTime * aFreq + aPhase);
    p.x = aSide * x * cos(bendA);
    p.y = x * sin(bendA);
  }
  // butterflies only exist where the isle is alive
  vec4 origin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float lf = lifeAtClip(projectionMatrix * viewMatrix * origin);
  p *= smoothstep(0.05, 0.9, lf);
  vUv = uv;
  vSide = aSide;
  vColor = aColor;
  vPhase = aPhase;
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSide;
varying vec3 vColor;
varying float vPhase;
#include <fog_pars_fragment>
float ell(vec2 p, vec2 c, vec2 r, float rot){
  p -= c;
  float cs = cos(rot), sn = sin(rot);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  return length(p / r);
}
void main(){
  if (vSide == 0.0) {
    float d = length(vUv * vec2(1.0, 1.0));
    if (abs(vUv.x) > 1.0 - abs(vUv.y) * 0.4) discard;
    vec3 c = vec3(0.01, 0.02, 0.015) + vColor * 0.4 * (1.0 - abs(vUv.y));
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
    return;
  }
  vec2 p = vUv; // x: 0 body → 1 tip, y: -1 rear → 1 front
  float fore = ell(p, vec2(0.5, 0.36), vec2(0.55, 0.36), -0.55);
  float hind = ell(p, vec2(0.36, -0.4), vec2(0.4, 0.42), 0.35);
  float d = min(fore, hind);
  float fw = fwidth(d) * 1.5;
  if (d > 1.0) discard;

  float ang = atan(p.y, p.x);
  float veins = smoothstep(0.86, 1.0, abs(sin(ang * 7.0))) * smoothstep(0.1, 0.4, length(p));
  float edgeBand = smoothstep(0.72, 0.8, d);
  float rim = smoothstep(0.86, 0.92, d) - smoothstep(0.95, 1.0, d);
  float spot = 1.0 - smoothstep(0.08, 0.12, length(p - vec2(0.44, -0.5)));
  float spot2 = 1.0 - smoothstep(0.05, 0.075, length(p - vec2(0.7, 0.55)));

  float shimmer = 0.5 + 0.5 * sin(uTime * 2.0 + vPhase + p.x * 4.0 + p.y * 2.0);
  vec3 base = mix(vColor, vColor.gbr * 0.6 + vec3(0.0, 0.25, 0.3), shimmer * 0.35);
  base *= mix(0.55, 1.4, smoothstep(0.0, 0.6, length(p)));
  vec3 col = base * 0.55 * (1.0 - veins * 0.55);
  col = mix(col, vec3(0.005, 0.015, 0.01), edgeBand);
  col += vColor * rim * 1.1;
  col += vec3(0.5, 1.8, 1.0) * (spot + spot2) * (0.7 + 0.3 * sin(uTime * 3.0 + vPhase));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`

const PALETTE = ['#1fe08a', '#5dffb0', '#9cff57', '#22d3c5', '#c4ff6a', '#14b86a'].map((c) => new Color(c))

function makeMaterial() {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {}]),
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    fog: true,
  })
  m.uniforms.uTime = G.uTime
  m.uniforms.uLife = G.uLife
  return m
}

let shared = null
function getShared() {
  if (shared) return shared
  const g = butterflyGeometry()
  const r = rng(99)
  const phase = new Float32Array(BUTTERFLY_COUNT)
  const freq = new Float32Array(BUTTERFLY_COUNT)
  const color = new Float32Array(BUTTERFLY_COUNT * 3)
  const birds = []
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    phase[i] = r() * 6.28
    freq[i] = 11 + r() * 7
    const c = PALETTE[i % PALETTE.length]
    color.set([c.r, c.g, c.b], i * 3)
    const inner = i % 3 === 0
    birds.push({
      pos: new Vector3((r() - 0.5) * 8, r() * 3 - 1, (r() - 0.5) * 8),
      vel: new Vector3(),
      R: inner ? 1.4 + r() * 1.6 : 3.8 + r() * 2.4,
      H: inner ? 1.4 + r() * 1.8 : -2.8 + r() * 4.2,
      w: (0.12 + r() * 0.2) * (r() < 0.5 ? -1 : 1),
      ph: r() * 6.28,
      scale: 0.19 + r() * 0.1,
      attract: i % 4 === 3 ? 0 : 0.55 + r() * 0.45,
      orbit: 0.45 + r() * 1.1,
    })
  }
  g.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1))
  g.setAttribute('aFreq', new InstancedBufferAttribute(freq, 1))
  g.setAttribute('aColor', new InstancedBufferAttribute(color, 3))
  shared = { geometry: g, sim: birds }
  return shared
}

export function Butterflies() {
  const ref = useRef()
  const { geometry, sim } = getShared()
  const material = useMemo(() => makeMaterial(), [])

  const tmp = useMemo(() => ({ o: new Object3D(), target: new Vector3(), acc: new Vector3(), d: new Vector3(), away: new Vector3() }), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const t = state.clock.elapsedTime
    const { o, target, acc, d, away } = tmp
    const lure = store.cursorWorld, lureOn = store.lure
    for (let i = 0; i < sim.length; i++) {
      const b = sim[i]
      const th = t * b.w + b.ph
      target.set(
        Math.cos(th) * b.R + Math.sin(t * 0.31 + b.ph * 2) * 0.6,
        b.H + Math.sin(t * 0.6 + b.ph) * 0.55,
        Math.sin(th) * b.R + Math.cos(t * 0.27 + b.ph) * 0.6,
      )
      // drawn to the living spot under the cursor, circling it
      if (lureOn > 0.01 && b.attract > 0) {
        const k = b.attract * lureOn
        const th2 = t * (0.9 + b.attract) + b.ph * 3
        d.set(
          lure.x + Math.cos(th2) * b.orbit,
          lure.y + Math.sin(t * 1.3 + b.ph) * 0.35 + 0.15,
          lure.z + Math.sin(th2) * b.orbit,
        )
        target.lerp(d, k)
      }
      acc.subVectors(target, b.pos).multiplyScalar(0.9)
      if (acc.length() > 2.4) acc.setLength(2.4)
      acc.sub(b.vel).multiplyScalar(1.6)
      // erratic flutter
      acc.x += Math.sin(t * 5.3 + b.ph * 7) * 1.6
      acc.y += Math.sin(t * 4.1 + b.ph * 3) * 2.2
      acc.z += Math.cos(t * 4.7 + b.ph * 5) * 1.6
      // click: everyone scatters outward
      if (store.burst > 0) {
        away.copy(b.pos).setY(0).normalize()
        acc.addScaledVector(away, 16 * (1 - store.burst))
        acc.y += 10 * (1 - store.burst)
      }
      // keep out of the ground
      if (Math.hypot(b.pos.x, b.pos.z) < 3.6 && b.pos.y < 0.9 && b.pos.y > -1.5) acc.y += 9
      b.vel.addScaledVector(acc, dt)
      if (b.vel.length() > 3.2) b.vel.setLength(3.2)
      b.pos.addScaledVector(b.vel, dt)

      o.position.copy(b.pos)
      o.lookAt(target.copy(b.pos).add(b.vel))
      o.rotateZ(Math.sin(t * 2 + b.ph) * 0.25)
      o.scale.setScalar(b.scale)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geometry, material, BUTTERFLY_COUNT]} frustumCulled={false} raycast={() => null} />
}
