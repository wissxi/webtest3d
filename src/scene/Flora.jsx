import { useMemo } from 'react'
import {
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { G } from '../lib/uniforms'
import { lifeChunk } from '../lib/glsl'
import { islandHeight, leafGeometry, rimRadius, TREE_BASE } from '../lib/world'
import { fbm2, rng } from '../lib/noise'

function toInstanced(geo, count) {
  const g = new InstancedBufferGeometry()
  g.index = geo.index
  for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v)
  g.instanceCount = count
  return g
}

function shaderMaterial(vertexShader, fragmentShader) {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {}]),
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    fog: true,
  })
  m.uniforms.uTime = G.uTime
  m.uniforms.uLife = G.uLife
  m.uniforms.uPulse = G.uPulse
  return m
}

/* ------------------------------------------------------------------ */
/*  Flowers: closed grey buds in the dead world, luminous where alive  */
/* ------------------------------------------------------------------ */

const flowerVertex = /* glsl */ `
uniform float uTime;
uniform float uPulse;
${lifeChunk}
attribute float aPetal;
attribute float aKind;
attribute vec4 aOffset; // ground xyz, stem height
attribute vec4 aParams; // scale, yaw, hue, phase
varying float vKind;
varying float vT;
varying float vLife;
varying float vHue;
#include <fog_pars_vertex>
void main(){
  vec4 ground = modelMatrix * vec4(aOffset.xyz, 1.0);
  float life = smoothstep(0.0, 1.0, lifeAtClip(projectionMatrix * viewMatrix * ground));
  vec3 p = position;
  if (aKind < 0.5) {
    float open = mix(0.1, 1.2 + 0.08 * sin(uTime * 1.4 + aParams.w) + uPulse * 0.25, life);
    float c = cos(open), s = sin(open);
    p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    float ca = cos(aPetal), sa = sin(aPetal);
    p = vec3(p.x * ca + p.z * sa, p.y, -p.x * sa + p.z * ca);
    vT = position.y;
  } else {
    p *= mix(0.5, 1.0, life);
    vT = 0.0;
  }
  float sc = aParams.x * mix(0.5, 1.0, life);
  float cy = cos(aParams.y), sy = sin(aParams.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) * sc;
  vec3 head = ground.xyz + vec3(sin(uTime * 1.1 + aParams.w) * 0.015, aOffset.w * mix(0.3, 1.0, life), cos(uTime * 0.9 + aParams.w) * 0.015);
  vec4 mvPosition = viewMatrix * vec4(head + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vKind = aKind;
  vLife = life;
  vHue = aParams.z;
  #include <fog_vertex>
}
`

const flowerFragment = /* glsl */ `
varying float vKind;
varying float vT;
varying float vLife;
varying float vHue;
#include <fog_pars_fragment>
void main(){
  vec3 col;
  if (vKind < 0.5) {
    vec3 mint = vec3(0.35, 0.95, 0.55);
    vec3 alt = vHue > 0.66 ? vec3(0.8, 0.45, 1.0) : vHue > 0.33 ? vec3(0.3, 0.75, 1.0) : mint;
    col = mix(vec3(0.03, 0.2, 0.08), alt, smoothstep(0.1, 0.9, vT));
    col *= 0.08 + 0.55 * vLife;
    col += vec3(0.1, 0.6, 0.3) * (1.0 - vT) * vLife * 0.35;
  } else {
    col = vec3(0.7, 1.25, 0.3) * (0.05 + 0.85 * vLife);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`

function Flowers({ count = 260 }) {
  const { geometry, material } = useMemo(() => {
    const petals = []
    const P = 6
    for (let k = 0; k < P; k++) {
      const g = leafGeometry().toNonIndexed()
      g.scale(0.5, 0.75, 0.5)
      const n = g.attributes.position.count
      g.setAttribute('aPetal', new Float32BufferAttribute(new Array(n).fill((k / P) * Math.PI * 2), 1))
      g.setAttribute('aKind', new Float32BufferAttribute(new Array(n).fill(0), 1))
      petals.push(g)
    }
    const center = new IcosahedronGeometry(0.13, 1)
    center.translate(0, 0.05, 0)
    const cn = center.attributes.position.count
    center.setAttribute('aPetal', new Float32BufferAttribute(new Array(cn).fill(0), 1))
    center.setAttribute('aKind', new Float32BufferAttribute(new Array(cn).fill(1), 1))
    const base = mergeGeometries([...petals, center])
    const g = toInstanced(base, count)

    const r = rng(404)
    const offset = new Float32Array(count * 4)
    const params = new Float32Array(count * 4)
    const clusters = []
    while (clusters.length < 26) {
      const th = r() * Math.PI * 2
      const t = 0.2 + Math.sqrt(r()) * 0.72
      const x = Math.cos(th) * t * rimRadius(th), z = Math.sin(th) * t * rimRadius(th)
      if (Math.hypot(x - TREE_BASE.x, z - TREE_BASE.z) < 0.7) continue
      clusters.push([x, z, 0.25 + r() * 0.4, r()])
    }
    for (let i = 0; i < count; i++) {
      const [cx, cz, cr, hue] = clusters[i % clusters.length]
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cr
      let x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      const th = Math.atan2(z, x)
      const lim = rimRadius(th) * 0.95
      const rr = Math.hypot(x, z)
      if (rr > lim) {
        x *= lim / rr
        z *= lim / rr
      }
      offset.set([x, islandHeight(x, z) - 0.02, z, 0.16 + r() * 0.22 + fbm2(x, z, 2) * 0.05], i * 4)
      params.set([0.075 + r() * 0.055, r() * Math.PI * 2, (hue + r() * 0.25) % 1, r() * 6.28], i * 4)
    }
    g.setAttribute('aOffset', new InstancedBufferAttribute(offset, 4))
    g.setAttribute('aParams', new InstancedBufferAttribute(params, 4))
    return { geometry: g, material: shaderMaterial(flowerVertex, flowerFragment) }
  }, [count])
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}

/* ------------------------------------------------------------------ */
/*  Bioluminescent mushrooms around the roots                          */
/* ------------------------------------------------------------------ */

const shroomVertex = /* glsl */ `
uniform float uTime;
${lifeChunk}
attribute float aCap;
attribute vec4 aOffset; // ground xyz, scale
attribute vec2 aParams; // yaw, seed
varying float vCap;
varying float vLife;
varying vec3 vLocal;
varying float vSeed;
#include <fog_pars_vertex>
void main(){
  vec4 ground = modelMatrix * vec4(aOffset.xyz, 1.0);
  float life = smoothstep(0.0, 1.0, lifeAtClip(projectionMatrix * viewMatrix * ground));
  vec3 p = position;
  // dead: shrivelled and slumped; alive: plump caps
  p.y *= mix(0.45, 1.0, life);
  if (aCap > 0.5) p.xz *= mix(0.55, 1.0 + 0.04 * sin(uTime * 2.0 + aParams.y * 9.0), life);
  float cy = cos(aParams.x), sy = sin(aParams.x);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) * aOffset.w;
  vec4 mvPosition = viewMatrix * vec4(ground.xyz + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vCap = aCap;
  vLife = life;
  vLocal = position;
  vSeed = aParams.y;
  #include <fog_vertex>
}
`

const shroomFragment = /* glsl */ `
uniform float uTime;
uniform float uPulse;
varying float vCap;
varying float vLife;
varying vec3 vLocal;
varying float vSeed;
#include <fog_pars_fragment>
void main(){
  vec3 col;
  float glow = vLife * (0.75 + 0.25 * sin(uTime * 1.6 + vSeed * 20.0)) * (1.0 + uPulse);
  if (vCap > 0.5) {
    float spots = smoothstep(0.75, 0.9, sin(vLocal.x * 22.0 + vSeed * 7.0) * sin(vLocal.z * 22.0) * 0.5 + 0.5);
    float under = 1.0 - smoothstep(0.0, 0.25, vLocal.y - 0.9);
    col = vec3(0.04, 0.12, 0.1) + vec3(0.1, 1.2, 0.95) * glow * (0.35 + under * 0.9 + spots * 0.8);
  } else {
    col = vec3(0.12, 0.14, 0.12) + vec3(0.05, 0.4, 0.3) * glow * 0.4;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`

function Mushrooms({ count = 70 }) {
  const { geometry, material } = useMemo(() => {
    const stem = new CylinderGeometry(0.16, 0.22, 0.9, 10, 1, true)
    stem.translate(0, 0.45, 0)
    stem.setAttribute('aCap', new Float32BufferAttribute(new Array(stem.attributes.position.count).fill(0), 1))
    const cap = new SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    cap.scale(1, 0.55, 1)
    cap.translate(0, 0.86, 0)
    cap.setAttribute('aCap', new Float32BufferAttribute(new Array(cap.attributes.position.count).fill(1), 1))
    const g = toInstanced(mergeGeometries([stem, cap]), count)
    const r = rng(77)
    const offset = new Float32Array(count * 4)
    const params = new Float32Array(count * 2)
    const spots = [
      [TREE_BASE.x, TREE_BASE.z, 0.45, 1.2],
      [1.6, 0.9, 0.15, 0.5],
      [-2.1, 1.3, 0.15, 0.55],
      [0.9, -2.0, 0.15, 0.5],
    ]
    for (let i = 0; i < count; i++) {
      const [cx, cz, rin, rout] = spots[i < count * 0.55 ? 0 : 1 + (i % 3)]
      const a = r() * Math.PI * 2, d = rin + Math.pow(r(), 1.5) * (rout - rin)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      offset.set([x, islandHeight(x, z) - 0.03, z, 0.05 + Math.pow(r(), 2) * 0.12], i * 4)
      params.set([r() * Math.PI * 2, r()], i * 2)
    }
    g.setAttribute('aOffset', new InstancedBufferAttribute(offset, 4))
    g.setAttribute('aParams', new InstancedBufferAttribute(params, 2))
    return { geometry: g, material: shaderMaterial(shroomVertex, shroomFragment) }
  }, [count])
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}

export function Flora() {
  return (
    <>
      <Flowers />
      <Mushrooms />
    </>
  )
}
