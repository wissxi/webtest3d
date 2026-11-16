import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DoubleSide,
  HalfFloatType,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { snoise } from '../lib/glsl'
import { G } from '../lib/uniforms'
import { applyIsleMotion, store } from '../lib/store'
import { lensTrail } from '../lib/TrailMap'
import { leafGeometry } from '../lib/world'
import { SpiritButterflies } from './Butterflies'

/* ---------------- materials ---------------- */

const holoVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vLocal;
void main(){
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

/** Topographic "scan" of the real geometry. */
function scanMaterial({ color = '#2dff9a', density = 6, strength = 1 } = {}) {
  return new ShaderMaterial({
    uniforms: { uTime: G.uTime, uColor: { value: new Color(color) }, uDensity: { value: density }, uStrength: { value: strength } },
    vertexShader: holoVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDensity, uStrength;
      uniform vec3 uColor;
      varying vec3 vWorld;
      varying vec3 vN;
      void main(){
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
        float y = vWorld.y * uDensity - uTime * 0.25;
        float f = abs(fract(y) - 0.5);
        float w = fwidth(y) * 1.2;
        float line = 1.0 - smoothstep(0.0, w, f - 0.0) ;
        line = smoothstep(0.5 - w * 2.0, 0.5, f);
        float rad = length(vWorld.xz) * uDensity * 0.6;
        float f2 = abs(fract(rad) - 0.5);
        float line2 = smoothstep(0.5 - fwidth(rad) * 2.0, 0.5, f2) * 0.35;
        float scan = exp(-pow((vWorld.y - (mod(uTime * 1.2, 12.0) - 7.0)) * 2.2, 2.0));
        vec3 col = uColor * (0.006 + fres * 0.12 + (line + line2) * 0.42 + scan * 0.25) * uStrength;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

const maskMaterial = () =>
  new ShaderMaterial({
    uniforms: { uTime: G.uTime, uColor: { value: new Color('#3dffb0') } },
    vertexShader: /* glsl */ `
      attribute vec2 aFace;
      varying vec2 vFace;
      varying vec3 vWorld;
      varying vec3 vN;
      void main(){
        vFace = aFace;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vFace;
      varying vec3 vWorld;
      varying vec3 vN;
      ${snoise}
      float eye(vec2 f){
        vec2 q = vec2(abs(f.x) - 0.3, f.y - 0.06 - (abs(f.x) - 0.3) * 0.28);
        return length(q / vec2(0.165, 0.07));
      }
      void main(){
        vec2 f = vFace;
        float e = eye(f);
        float mouth = length((f - vec2(0.0, -0.47)) / vec2(0.2, 0.022));
        if (e < 1.0 || mouth < 1.0) discard;
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vN), v)), 1.6);
        // carved symmetric filigree
        vec2 sf = vec2(abs(f.x), f.y);
        float n = snoise(vec3(sf * 2.6, 3.0)) + 0.5 * snoise(vec3(sf * 6.0, 7.0));
        float lines = abs(fract(n * 3.0 + uTime * 0.05) - 0.5);
        float carve = smoothstep(0.06, 0.0, lines - 0.0) * 0.0 + smoothstep(0.43, 0.5, lines);
        // forehead sigil
        float sig = smoothstep(0.012, 0.0, abs(length(f - vec2(0.0, 0.5)) - 0.1)) + smoothstep(0.01, 0.0, abs(f.x)) * step(0.28, f.y) * step(f.y, 0.75);
        float eyeRing = smoothstep(1.35, 1.0, e) * 1.0;
        float mouthRing = smoothstep(1.8, 1.0, mouth);
        float tear = smoothstep(0.012, 0.0, abs(abs(f.x) - 0.3)) * step(f.y, -0.02) * step(-0.38, f.y) * (0.5 + 0.5 * sin(f.y * 30.0 + uTime * 3.0));
        float scanl = 0.8 + 0.2 * sin(vWorld.y * 140.0 - uTime * 5.0);
        vec3 col = uColor * (0.03 + fres * 0.85 + carve * 0.32 + sig * 1.1 + tear * 0.6) * scanl;
        col += vec3(0.35, 1.4, 0.95) * (eyeRing * eyeRing + mouthRing * mouthRing * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })

/* ---------------- the mask geometry ---------------- */

function maskGeometry() {
  const g = new SphereGeometry(1, 72, 72, 0, Math.PI, 0.1 * Math.PI, 0.82 * Math.PI)
  const p = g.attributes.position
  const face = new Float32Array(p.count * 2)
  const ex = (v) => Math.exp(v)
  for (let i = 0; i < p.count; i++) {
    // three's sphere: z = sin(phi) sin(theta) ≥ 0 for phi ∈ [0, π] → front half faces +z
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    face[i * 2] = x
    face[i * 2 + 1] = y
    const ax = Math.abs(x)
    let dz = 0
    dz += 0.2 * ex(-(x * x) / 0.005) * (y < 0.32 && y > -0.2 ? 1 : ex(-((y < 0 ? y + 0.2 : y - 0.32) ** 2) / 0.003))
    dz += 0.12 * ex(-(x * x + (y + 0.15) ** 2) / 0.01)
    dz += 0.07 * ex(-((y - 0.25) ** 2) / 0.004) * (1 - Math.min(1, Math.max(0, (ax - 0.45) / 0.15)))
    dz -= 0.09 * ex(-((ax - 0.3) ** 2) / 0.02 - ((y - 0.07) ** 2) / 0.01)
    dz += 0.05 * ex(-((ax - 0.42) ** 2 + (y + 0.14) ** 2) / 0.02)
    dz += 0.04 * ex(-(x * x) / 0.03 - ((y + 0.47) ** 2) / 0.004)
    const chin = y < -0.45 ? 1 - (-0.45 - y) * 0.9 : 1
    p.setXYZ(i, x * 0.8 * chin, y * 1.08, z * 0.6 + dz)
  }
  g.setAttribute('aFace', new (p.constructor)(face, 2))
  g.computeVertexNormals()
  return g
}

function SpiritMask({ anchor }) {
  const group = useRef()
  const { geo, mat, halo, haloMat, eyes } = useMemo(() => {
    const leaf = leafGeometry()
    const halo = []
    for (let i = 0; i < 15; i++) {
      const a = Math.PI * (0.05 + (i / 14) * 0.9) + Math.PI * 0.0
      halo.push({ a, s: 0.45 + Math.sin(i * 1.7) * 0.12 + (i % 2) * 0.12 })
    }
    return {
      geo: maskGeometry(),
      mat: maskMaterial(),
      halo,
      haloMat: scanMaterial({ color: '#53ffb9', density: 22, strength: 1.6 }),
      eyes: { leaf, eyeColor: new Color(0.5, 2.2, 1.4) },
    }
  }, [])
  const look = useMemo(() => new Vector3(), [])
  useFrame((state, dt) => {
    const g = group.current
    const t = state.clock.elapsedTime
    // the mask slowly turns towards the viewer and follows the cursor
    look.copy(state.camera.position)
    look.x += store.pointer.x * 3
    look.y += store.pointer.y * 2
    const q = g.quaternion.clone()
    g.lookAt(look)
    const target = g.quaternion.clone()
    g.quaternion.copy(q).slerp(target, 1 - Math.exp(-dt * 2.5))
    g.position.set(anchor.x, anchor.y + Math.sin(t * 0.8) * 0.06, anchor.z)
  })
  return (
    <group ref={group} position={anchor} scale={0.82}>
      <mesh geometry={geo} material={mat} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.24, 0.08, 0.3]} scale={[0.09, 0.045, 0.04]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial color={eyes.eyeColor} toneMapped={false} />
        </mesh>
      ))}
      {halo.map((h, i) => (
        <mesh
          key={i}
          geometry={eyes.leaf}
          material={haloMat}
          position={[Math.cos(h.a) * 0.95, Math.sin(h.a) * 1.0 + 0.1, -0.25]}
          rotation={[0, 0, h.a - Math.PI / 2]}
          scale={h.s}
        />
      ))}
    </group>
  )
}

function GlyphRing({ radius, y, speed, width = 0.18, segments = 64 }) {
  const ref = useRef()
  const { geo, mat } = useMemo(
    () => ({
      geo: new RingGeometry(radius, radius + width, 256, 1),
      mat: new ShaderMaterial({
        uniforms: { uTime: G.uTime, uSeg: { value: segments } },
        vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime, uSeg;
          varying vec3 vP;
          float h(float n){ return fract(sin(n * 91.345) * 47453.21); }
          void main(){
            float a = atan(vP.y, vP.x) / 6.28318 + 0.5;
            float r = length(vP.xy);
            float cell = floor(a * uSeg);
            float fa = fract(a * uSeg);
            float k = h(cell);
            float glyph = step(0.15, fa) * step(fa, 0.85) * step(0.35, k);
            float rr = fract(r * 9.0);
            glyph *= step(0.2, rr) * step(rr, 0.8 - k * 0.3);
            float flick = 0.6 + 0.4 * sin(uTime * 2.0 + cell * 1.7);
            vec3 col = vec3(0.2, 1.0, 0.65) * (glyph * flick * 0.6 + 0.03);
            gl_FragColor = vec4(col, 1.0);
          }`,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    }),
    [radius, width, segments],
  )
  useFrame((_, dt) => {
    ref.current.rotation.z += dt * speed
  })
  return <mesh ref={ref} geometry={geo} material={mat} position-y={y} rotation-x={-Math.PI / 2} />
}

function SpiritWorld({ world }) {
  const isle = useRef()
  const mats = useMemo(
    () => ({
      top: scanMaterial({ color: '#2bff95', density: 7, strength: 0.7 }),
      bottom: scanMaterial({ color: '#19e0a0', density: 5, strength: 0.75 }),
      wood: scanMaterial({ color: '#7dffc4', density: 5, strength: 0.45 }),
      vines: scanMaterial({ color: '#4dffb0', density: 10, strength: 0.6 }),
    }),
    [],
  )
  useFrame((state) => applyIsleMotion(isle.current, state.clock.elapsedTime))
  return (
    <>
      <group ref={isle}>
        <mesh geometry={world.islandTop} material={mats.top} />
        <mesh geometry={world.islandBottom} material={mats.bottom} />
        <mesh geometry={world.wood} material={mats.wood} />
        <mesh geometry={world.vines} material={mats.vines} />
        <GlyphRing radius={4.3} y={0.15} speed={0.05} />
        <GlyphRing radius={3.1} y={-2.2} speed={-0.08} width={0.12} segments={48} />
        <GlyphRing radius={1.6} y={-4.4} speed={0.12} width={0.1} segments={32} />
      </group>
      <SpiritMask anchor={world.maskAnchor} />
      <SpiritButterflies />
    </>
  )
}

/* ---------------- render + composite ---------------- */

export function Spirit({ world }) {
  const secret = useMemo(() => {
    const s = new Scene()
    s.background = null
    return s
  }, [])
  const fbo = useMemo(() => new WebGLRenderTarget(4, 4, { type: HalfFloatType }), [])
  const { size, gl, camera, viewport } = useThree()

  useEffect(() => {
    const dpr = Math.min(viewport.dpr, 1) * 0.75
    fbo.setSize(Math.round(size.width * dpr), Math.round(size.height * dpr))
  }, [size, viewport.dpr, fbo])

  const quadMat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSecret: { value: fbo.texture },
          uMask: { value: null },
          uNoise: G.uNoise,
          uTime: G.uTime,
          uAspect: { value: 1 },
          uGlobal: { value: 0 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D uSecret;
          uniform sampler2D uMask;
          uniform sampler2D uNoise;
          uniform float uTime, uAspect, uGlobal;
          varying vec2 vUv;
          void main(){
            vec2 uv = vUv;
            vec2 p = uv * vec2(uAspect, 1.0);
            float n = texture2D(uNoise, p * 0.4 + vec2(uTime * 0.03, -uTime * 0.02)).r * 2.0 - 1.0;
            float n2 = texture2D(uNoise, p * 0.9 - vec2(uTime * 0.05, uTime * 0.04)).g * 2.0 - 1.0;
            float m = texture2D(uMask, uv + vec2(n, n2) * 0.012).r;
            float gd = length((uv - 0.5) * vec2(uAspect, 1.0)) + n * 0.04;
            float g = uGlobal > 0.001 ? smoothstep(uGlobal * 1.25, uGlobal * 1.25 - 0.2, gd) : 0.0;
            m = max(m, g);
            float mm = m + n * 0.07;
            float inside = smoothstep(0.42, 0.6, mm);
            float px = max(fwidth(mm), 1e-4);
            float ring = 1.0 - smoothstep(0.0, px * 2.5, abs(mm - 0.47));
            ring *= smoothstep(0.0, 0.004, px) * 0.6 + 0.4;
            vec2 dir = (uv - 0.5) * 0.012 * (ring + 0.25);
            vec3 s;
            s.r = texture2D(uSecret, uv + dir).r;
            s.g = texture2D(uSecret, uv).g;
            s.b = texture2D(uSecret, uv - dir).b;
            vec2 gp = p * 36.0;
            vec2 gg = abs(fract(gp) - 0.5);
            float grid = smoothstep(0.47, 0.5, max(gg.x, gg.y));
            float dots = smoothstep(0.08, 0.0, length(gg - 0.5));
            vec3 tint = vec3(0.004, 0.025, 0.018) + vec3(0.02, 0.12, 0.08) * (grid * 0.5 + dots);
            vec3 col = (s * 0.85 + tint) * inside + vec3(0.25, 1.3, 0.8) * ring * 0.3;
            gl_FragColor = vec4(col, inside * 0.94);
            #ifdef MASK_DEBUG
            gl_FragColor = vec4(m, mm, inside, 1.0);
            #endif
          }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        defines: new URLSearchParams(window.location.search).has('maskdebug') ? { MASK_DEBUG: '' } : {},
      }),
    [fbo],
  )

  const energy = useRef(0)
  const clear = useMemo(() => ({ color: new Color(), alpha: 1 }), [])
  useFrame(() => {
    quadMat.uniforms.uMask.value = lensTrail.texture
    quadMat.uniforms.uAspect.value = size.width / size.height
    quadMat.uniforms.uGlobal.value = store.revealGlobal
    // skip the whole secret render when nothing is revealed
    const want = store.pointerActive || store.ghost > 0.01 || store.burst > 0 || store.revealGlobal > 0.001
    energy.current = want ? 1 : energy.current * 0.95
    if (energy.current < 0.01) {
      quadMat.visible = false
      return
    }
    quadMat.visible = true
    const prev = gl.getRenderTarget()
    gl.getClearColor(clear.color)
    clear.alpha = gl.getClearAlpha()
    gl.setRenderTarget(fbo)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(secret, camera)
    gl.setRenderTarget(prev)
    gl.setClearColor(clear.color, clear.alpha)
  })

  return (
    <>
      {createPortal(<SpiritWorld world={world} />, secret)}
      <mesh material={quadMat} renderOrder={1000} frustumCulled={false} raycast={() => null}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  )
}
