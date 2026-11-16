import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from 'three'
import { G } from '../lib/uniforms'
import { lifeChunk } from '../lib/glsl'
import { grassTrail, GRASS_BOUNDS } from '../lib/TrailMap'

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform sampler2D uTrail;
uniform float uBounds;
uniform sampler2D uNoise;
attribute vec3 aOffset;
attribute vec4 aParams; // yaw, height, rand, edge
varying float vH;
varying float vRand;
varying float vTrail;
varying float vEdge;
varying float vClump;
varying float vLife;
${lifeChunk}
#include <fog_pars_vertex>
void main(){
  vec3 p = position;
  float h = p.y;
  float life = lifeAtClip(projectionMatrix * viewMatrix * modelMatrix * vec4(aOffset, 1.0));
  float L = aParams.y * mix(0.42, 1.0, life);
  p.x *= 0.065 * (0.7 + aParams.z * 0.6);
  p.y *= L;
  float c = cos(aParams.x), s = sin(aParams.x);
  vec3 wp = aOffset + vec3(p.x * c, p.y, p.x * s);

  vec2 tuv = aOffset.xz / (uBounds * 2.0) + 0.5;
  float tr = texture2D(uTrail, tuv).r;
  float e = 2.0 / 160.0;
  float gx = texture2D(uTrail, tuv + vec2(e, 0.0)).r - tr;
  float gz = texture2D(uTrail, tuv + vec2(0.0, e)).r - tr;
  vec2 away = -vec2(gx, gz);
  float al = length(away);
  away = al > 1e-4 ? away / al : vec2(0.0);

  vec3 nz = texture2D(uNoise, aOffset.xz * 0.035 + vec2(uTime * 0.012, uTime * 0.004)).rgb;
  float gust = smoothstep(0.25, 0.75, nz.r);
  float sway = mix(0.25, 1.0, life);
  vec2 bend = normalize(vec2(1.0, 0.35)) * (gust * 0.5 + 0.08) * sway
            + vec2(sin(uTime * 2.1 + aOffset.x * 1.7 + aOffset.z), cos(uTime * 1.7 + aOffset.z * 1.3)) * 0.07 * sway
            + vec2(cos(aParams.x * 3.0), sin(aParams.x * 3.0)) * (1.0 - life) * 1.1
            + away * tr * 1.6
            + normalize(aOffset.xz + 1e-4) * uPulse * 0.6;
  float k = h * h;
  wp.xz += bend * k * L;
  wp.y -= (dot(bend, bend) * 0.35 + tr * 0.45) * k * L;

  vH = h;
  vRand = aParams.z;
  vTrail = tr;
  vEdge = aParams.w;
  vClump = nz.b;
  vLife = life;
  vec4 mvPosition = viewMatrix * modelMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
uniform float uPulse;
varying float vH;
varying float vRand;
varying float vTrail;
varying float vEdge;
varying float vClump;
varying float vLife;
#include <fog_pars_fragment>
void main(){
  vec3 base = vec3(0.002, 0.012, 0.004);
  vec3 tip = mix(vec3(0.035, 0.13, 0.02), vec3(0.16, 0.34, 0.04), vRand * vRand);
  tip = mix(tip, vec3(0.2, 0.3, 0.06), step(0.93, vRand) * 0.6);
  tip = mix(vec3(0.16, 0.14, 0.1) * (0.7 + vRand * 0.5), tip, vLife);
  vec3 col = mix(base, tip, pow(vH, 1.5));
  col *= (0.55 + 0.45 * vClump) * (1.0 - vEdge * 0.45);
  col += vec3(0.05, 0.9, 0.45) * smoothstep(0.05, 0.9, vTrail) * pow(vH, 1.6) * 1.8;
  col += vec3(0.1, 0.7, 0.35) * uPulse * pow(vH, 2.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`

export function Grass({ world }) {
  const { geometry, material } = useMemo(() => {
    const g = new InstancedBufferGeometry()
    const pos = []
    const SEGS = 3
    for (let i = 0; i < SEGS; i++) {
      const y = i / SEGS
      const w = 1 - Math.pow(y, 1.3)
      pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0)
    }
    pos.push(0, 1, 0)
    const idx = []
    for (let i = 0; i < SEGS - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const l = (SEGS - 1) * 2
    idx.push(l, l + 1, l + 2)
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.setAttribute('aOffset', new InstancedBufferAttribute(world.grass.offset, 3))
    g.setAttribute('aParams', new InstancedBufferAttribute(world.grass.params, 4))
    g.instanceCount = world.grass.count
    g.boundingSphere = null
    const m = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { uTrail: { value: null }, uBounds: { value: GRASS_BOUNDS } },
      ]),
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      fog: true,
    })
    m.uniforms.uTime = G.uTime
    m.uniforms.uPulse = G.uPulse
    m.uniforms.uNoise = G.uNoise
    m.uniforms.uLife = G.uLife
    return { geometry: g, material: m }
  }, [world])

  useFrame(() => {
    material.uniforms.uTrail.value = grassTrail.texture
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
