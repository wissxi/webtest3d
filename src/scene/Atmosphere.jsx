import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
} from 'three'
import { G } from '../lib/uniforms'
import { lifeChunk } from '../lib/glsl'
import { rng } from '../lib/noise'

/* ---------------- sky / abyss dome ---------------- */

function Dome() {
  const material = useMemo(() => {
    const m = new ShaderMaterial({
      uniforms: { uTime: G.uTime, uPulse: G.uPulse, uNoise: G.uNoise },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        uniform sampler2D uNoise;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 top = vec3(0.004, 0.022, 0.016);
          vec3 mid = vec3(0.012, 0.058, 0.036);
          vec3 col = mix(mid, top, smoothstep(-0.15, 0.85, d.y));
          vec2 uv = vec2(atan(d.z, d.x) / 6.2832, d.y * 0.5);
          float n = texture2D(uNoise, uv * vec2(3.0, 2.0) + vec2(uTime * 0.004, 0.0)).r;
          float abyss = pow(max(-d.y, 0.0), 1.8);
          col += vec3(0.02, 0.2, 0.1) * abyss * (0.6 + 0.7 * n) * (1.0 + uPulse);
          col += vec3(0.06, 0.45, 0.24) * pow(max(-d.y, 0.0), 8.0);
          // drifting haze bands around the horizon
          float haze = texture2D(uNoise, uv * vec2(5.0, 6.0) + vec2(-uTime * 0.006, uTime * 0.002)).g;
          col += vec3(0.012, 0.06, 0.035) * haze * (1.0 - abs(d.y));
          // keep the empty sky muted, so life shows on things rather than as a green disc
          col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.18);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
    return m
  }, [])
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[90, 48, 24]} />
    </mesh>
  )
}

/* ---------------- god rays from below ---------------- */

function LightShafts() {
  const shafts = useMemo(() => {
    const r = rng(5)
    const list = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5
      const rad = 1.2 + r() * 4.6
      const geo = new CylinderGeometry(0.9 + r() * 1.4, 0.12 + r() * 0.25, 22, 20, 1, true)
      geo.translate(0, 11, 0)
      const mat = new ShaderMaterial({
        uniforms: { uTime: G.uTime, uPulse: G.uPulse, uNoise: G.uNoise, uSeed: { value: r() * 10 }, uIntensity: { value: 0.3 + r() * 0.25 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vV;
          void main(){
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uPulse, uSeed, uIntensity;
          uniform sampler2D uNoise;
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vV;
          void main(){
            float facing = abs(dot(normalize(vN), normalize(vV)));
            float soft = pow(facing, 3.0);
            float y = vUv.y;
            float fade = smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.45, 0.95, y));
            float n = texture2D(uNoise, vec2(vUv.x * 2.0 + uSeed, y * 1.5 - uTime * 0.05)).r;
            float n2 = texture2D(uNoise, vec2(vUv.x * 3.0 - uSeed, y * 3.0 - uTime * 0.09)).g;
            float a = soft * fade * (0.3 + 0.7 * n * n2) * uIntensity * (1.0 + uPulse * 2.0);
            a *= 0.75 + 0.25 * sin(uTime * 0.6 + uSeed * 3.0);
            vec3 col = mix(vec3(0.15, 1.0, 0.55), vec3(0.6, 1.0, 0.45), y);
            gl_FragColor = vec4(col * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      })
      list.push({
        geo,
        mat,
        position: [Math.cos(a) * rad, -17, Math.sin(a) * rad - 1.5],
        rotation: [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25 + Math.cos(a) * -0.08],
      })
    }
    return list
  }, [])
  return shafts.map((s, i) => (
    <mesh key={i} geometry={s.geo} material={s.mat} position={s.position} rotation={s.rotation} renderOrder={5} raycast={() => null} />
  ))
}

/* ---------------- particles: rising glints & bokeh from the depths ---------------- */

function DepthParticles({ count = 480 }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const { geometry, material } = useMemo(() => {
    const r = rng(11)
    const base = [], size = [], speed = [], seed = [], kind = []
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const rad = Math.sqrt(r()) * 13
      base.push(Math.cos(a) * rad, -22 + r() * 28, Math.sin(a) * rad - 1)
      const k = r() < 0.22 ? 1 : 0
      kind.push(k)
      size.push(k ? 2 + r() * 4 : 1 + Math.pow(r(), 3) * 10)
      speed.push(0.25 + r() * 0.7)
      seed.push(r())
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(base, 3))
    g.setAttribute('aSize', new Float32BufferAttribute(size, 1))
    g.setAttribute('aSpeed', new Float32BufferAttribute(speed, 1))
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1))
    g.setAttribute('aKind', new Float32BufferAttribute(kind, 1))
    const m = new ShaderMaterial({
      uniforms: { uTime: G.uTime, uPulse: G.uPulse, uPR: { value: 1 }, uLife: G.uLife },
      vertexShader: /* glsl */ `
        uniform float uTime, uPR, uPulse;
        ${lifeChunk}
        attribute float aSize, aSpeed, aSeed, aKind;
        varying float vAlpha;
        varying float vKind;
        varying float vSeed;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + 22.0 + uTime * aSpeed * (1.0 + uPulse * 2.0), 28.0) - 22.0;
          p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.5;
          p.z += cos(uTime * 0.25 + aSeed * 20.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 40.0);
          gl_PointSize = aSize * uPR * (12.0 / -mv.z) * (aKind > 0.5 ? (0.6 + tw * 0.8) : 1.0);
          vAlpha = smoothstep(6.0, 1.0, p.y) * smoothstep(-22.0, -18.0, p.y) * tw;
          vAlpha *= smoothstep(0.4, 2.5, -mv.z);
          vAlpha *= mix(0.3, 1.0, lifeAtClip(gl_Position));
          vKind = aKind;
          vSeed = aSeed;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vKind;
        varying float vSeed;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a;
          if (vKind > 0.5) {
            float core = smoothstep(0.18, 0.0, d);
            float cross = max(smoothstep(0.035, 0.0, abs(uv.x)), smoothstep(0.035, 0.0, abs(uv.y))) * smoothstep(0.5, 0.0, d);
            a = core + cross * 0.8;
          } else {
            a = smoothstep(0.5, 0.38, d) * (0.35 + 0.65 * smoothstep(0.25, 0.48, d)) * 0.55;
          }
          vec3 col = mix(vec3(0.2, 1.0, 0.55), vec3(0.85, 1.0, 0.5), vSeed);
          gl_FragColor = vec4(col * a * vAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [count])
  material.uniforms.uPR.value = dpr
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} raycast={() => null} />
}

/* ---------------- fireflies around the isle ---------------- */

function Fireflies({ count = 220 }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const { geometry, material } = useMemo(() => {
    const r = rng(23)
    const base = [], seed = []
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const rad = 0.5 + Math.sqrt(r()) * 5.5
      base.push(Math.cos(a) * rad, -1.5 + r() * 5, Math.sin(a) * rad)
      seed.push(r())
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(base, 3))
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1))
    const m = new ShaderMaterial({
      uniforms: { uTime: G.uTime, uPR: { value: 1 }, uPulse: G.uPulse, uLife: G.uLife },
      vertexShader: /* glsl */ `
        uniform float uTime, uPR, uPulse;
        ${lifeChunk}
        attribute float aSeed;
        varying float vA;
        void main(){
          vec3 p = position;
          float s = aSeed * 100.0;
          p += vec3(sin(uTime * 0.4 + s), sin(uTime * 0.55 + s * 1.3) * 0.6, cos(uTime * 0.35 + s * 0.7)) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = smoothstep(0.2, 1.0, sin(uTime * (0.7 + aSeed) + s) * 0.5 + 0.5);
          vA = blink * (1.0 + uPulse * 2.0) * lifeAtClip(gl_Position);
          gl_PointSize = (3.0 + aSeed * 4.0) * uPR * (8.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a;
          gl_FragColor = vec4(vec3(0.75, 2.4, 0.9) * a * vA, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [count])
  material.uniforms.uPR.value = dpr
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={7} raycast={() => null} />
}

/* ---------------- glowing core deep below ---------------- */

function AbyssGlow() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: G.uTime, uPulse: G.uPulse },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime, uPulse;
          varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5) * 2.0;
            float a = pow(max(1.0 - d, 0.0), 3.0) * (0.8 + 0.2 * sin(uTime * 0.8)) * (1.0 + uPulse);
            gl_FragColor = vec4(vec3(0.15, 0.9, 0.5) * a * 0.9, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    [],
  )
  return (
    <mesh position={[0.5, -19, -1]} rotation-x={-Math.PI / 2} material={material} raycast={() => null}>
      <planeGeometry args={[26, 26]} />
    </mesh>
  )
}

export function Atmosphere() {
  return (
    <>
      <Dome />
      <AbyssGlow />
      <LightShafts />
      <DepthParticles />
      <Fireflies />
    </>
  )
}
