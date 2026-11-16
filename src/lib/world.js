import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Object3D,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fbm2, noise2, noise3, rng, smoothstep } from './noise'

/* ------------------------------------------------------------------ */
/*  Island shape                                                       */
/* ------------------------------------------------------------------ */

export const rimRadius = (theta) => {
  const c = Math.cos(theta), s = Math.sin(theta)
  return 3.35 + 0.42 * noise2(c * 1.2 + 3.1, s * 1.2 - 1.7) + 0.16 * noise2(c * 3.7, s * 3.7 + 9.0)
}

export const TREE_BASE = new Vector3(-0.55, 0, -0.5)

export function islandHeight(x, z) {
  const r = Math.hypot(x, z)
  const R = rimRadius(Math.atan2(z, x))
  const t = Math.min(r / R, 1)
  let y = 0.42 * (1 - t * t)
  y += fbm2(x * 0.42 + 7, z * 0.42 - 3, 4) * 0.5
  y += 0.38 * Math.exp(-((x - TREE_BASE.x) ** 2 + (z - TREE_BASE.z) ** 2) / 1.6)
  y -= smoothstep(0.8, 1.0, t) * 0.3
  return y
}
TREE_BASE.y = islandHeight(TREE_BASE.x, TREE_BASE.z)

const tipOffset = new Vector3(0.35, 0, -0.2)

/** Point on the rocky underside. t = 0 is the rim, t = 1 the bottom tip. */
export function bottomPoint(theta, t, out = new Vector3()) {
  const c = Math.cos(theta), s = Math.sin(theta)
  const R = rimRadius(theta)
  const yRim = islandHeight(c * R, s * R)
  const D = 4.9 + 1.3 * noise2(c * 1.4 + 11, s * 1.4 - 4)
  const y = yRim - t * D
  const bulge = Math.pow(1 - t, 0.85) * (1 + 0.14 * Math.sin(t * Math.PI))
  const n = noise3(c * 2.1, y * 0.55, s * 2.1) * Math.pow(Math.sin(t * Math.PI), 0.6)
  const strata = 0.06 * Math.sin(y * 6.5 + noise2(c * 3, s * 3) * 3) * (1 - t) * Math.min(1, t * 18)
  const r = R * bulge * (1 + n * 0.32) + strata
  out.set(c * r + tipOffset.x * t * t, y, s * r + tipOffset.z * t * t)
  return out
}

const SEG = 192

function orientCheck(geo, expect) {
  geo.computeVertexNormals()
  if (!expect(geo)) {
    const idx = geo.index.array
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]
      idx[i + 1] = idx[i + 2]
      idx[i + 2] = t
    }
    geo.index.needsUpdate = true
    geo.computeVertexNormals()
  }
  return geo
}

function buildIslandTop(RINGS = 70, SEG = 192) {
  const pos = [], col = [], idx = []
  const c = new Color()
  const soil = new Color('#1a2a12'), moss = new Color('#2f5c22'), dark = new Color('#0e1a0b')
  const push = (x, z, t) => {
    const y = islandHeight(x, z)
    pos.push(x, y, z)
    const n = fbm2(x * 0.9 + 20, z * 0.9, 3)
    c.copy(soil).lerp(moss, smoothstep(-0.2, 0.35, n)).lerp(dark, smoothstep(0.75, 1.0, t) * 0.7)
    col.push(c.r, c.g, c.b)
  }
  push(0, 0, 0)
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2
      const r = t * rimRadius(th)
      push(Math.cos(th) * r, Math.sin(th) * r, t)
    }
  }
  const ring = (i, j) => 1 + (i - 1) * SEG + (j % SEG)
  for (let j = 0; j < SEG; j++) idx.push(0, ring(1, j + 1), ring(1, j))
  for (let i = 1; i < RINGS; i++)
    for (let j = 0; j < SEG; j++) {
      const a = ring(i, j), b = ring(i, j + 1), cc = ring(i + 1, j + 1), d = ring(i + 1, j)
      idx.push(a, b, d, b, cc, d)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return orientCheck(g, (geo) => geo.attributes.normal.getY(0) > 0)
}

function buildIslandBottom() {
  const RINGS = 56
  const pos = [], col = [], idx = []
  const p = new Vector3(), c = new Color()
  const moss = new Color('#20391a'), rock = new Color('#2a2d26'), deep = new Color('#0e100b'), lichen = new Color('#4b6338')
  for (let i = 0; i < RINGS; i++) {
    const t = i / RINGS
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2
      bottomPoint(th, t, p)
      pos.push(p.x, p.y, p.z)
      const n = noise3(p.x * 1.3, p.y * 1.3, p.z * 1.3)
      c.copy(rock).lerp(deep, smoothstep(0.1, 0.95, t))
      c.lerp(moss, Math.max(1 - smoothstep(0.0, 0.16, t), smoothstep(0.15, 0.45, n) * 0.8))
      if (noise3(p.x * 6, p.y * 6, p.z * 6) > 0.42) c.lerp(lichen, 0.5)
      col.push(c.r, c.g, c.b)
    }
  }
  bottomPoint(0, 1, p)
  const tip = pos.length / 3
  pos.push(p.x, p.y - 0.25, p.z)
  col.push(deep.r, deep.g, deep.b)
  const v = (i, j) => i * SEG + (j % SEG)
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = v(i, j), b = v(i, j + 1), cc = v(i + 1, j + 1), d = v(i + 1, j)
      idx.push(a, b, d, b, cc, d)
    }
  for (let j = 0; j < SEG; j++) idx.push(v(RINGS - 1, j), v(RINGS - 1, j + 1), tip)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  // a vertex half-way down should point outwards
  const probe = v(20, 0)
  return orientCheck(g, (geo) => geo.attributes.normal.getX(probe) * geo.attributes.position.getX(probe) > 0)
}

/* ------------------------------------------------------------------ */
/*  Tubes (trunk, branches, roots, vines)                              */
/* ------------------------------------------------------------------ */

export function taperedTube(curve, segs, radial, radiusAt, { hangAt = () => 0, phase = 0, color = '#ffffff' } = {}) {
  const frames = curve.computeFrenetFrames(segs, false)
  const pos = [], nor = [], uv = [], hang = [], ph = [], col = [], idx = []
  const P = new Vector3(), n = new Vector3()
  const cc = new Color(color)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, P)
    const N = frames.normals[i], B = frames.binormals[i]
    const r = radiusAt(t)
    const h = hangAt(t)
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2
      const sin = Math.sin(v), cos = -Math.cos(v)
      n.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize()
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r)
      nor.push(n.x, n.y, n.z)
      uv.push(t, j / radial)
      hang.push(h)
      ph.push(phase)
      col.push(cc.r, cc.g, cc.b)
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('aHang', new Float32BufferAttribute(hang, 1))
  g.setAttribute('aPhase', new Float32BufferAttribute(ph, 1))
  g.setIndex(idx)
  return g
}

/* ------------------------------------------------------------------ */
/*  Leaf                                                               */
/* ------------------------------------------------------------------ */

export function leafGeometry() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.42, 0.18, 0.38, 0.72, 0, 1)
  s.bezierCurveTo(-0.38, 0.72, -0.42, 0.18, 0, 0)
  const g = new ShapeGeometry(s, 3)
  // gentle fold along the midrib
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.35)
  g.translate(0, -0.05, 0)
  g.computeVertexNormals()
  return g
}

/* ------------------------------------------------------------------ */
/*  World assembly                                                     */
/* ------------------------------------------------------------------ */

function instanceData(list) {
  const n = list.length
  const matrices = new Float32Array(n * 16)
  const colors = new Float32Array(n * 3)
  const hang = new Float32Array(n)
  const phase = new Float32Array(n)
  const o = new Object3D()
  list.forEach((l, i) => {
    o.position.copy(l.pos)
    o.quaternion.copy(l.quat)
    o.scale.setScalar(l.scale)
    o.updateMatrix()
    o.matrix.toArray(matrices, i * 16)
    colors.set([l.color.r, l.color.g, l.color.b], i * 3)
    hang[i] = l.hang
    phase[i] = l.phase
  })
  return { count: n, matrices, colors, hang, phase }
}

export function buildWorld() {
  const r = rng(7)
  const v = (x, y, z) => new Vector3(x, y, z)
  const o = new Object3D()
  const tmp = new Vector3()

  const islandTop = buildIslandTop()
  const islandBottom = buildIslandBottom()

  /* --- tree --- */
  const b = TREE_BASE.clone().add(v(0, -0.25, 0))
  const trunkCurve = new CatmullRomCurve3([
    b.clone(),
    b.clone().add(v(0.08, 0.8, 0.05)),
    b.clone().add(v(-0.16, 1.6, 0.12)),
    b.clone().add(v(0.07, 2.4, -0.06)),
    b.clone().add(v(-0.02, 3.15, 0.02)),
  ])
  const bark = '#3a2f22'
  const woodParts = [
    taperedTube(trunkCurve, 64, 14, (t) => 0.27 * Math.pow(1 - t, 0.7) + 0.05 + 0.3 * Math.exp(-t * 14), { color: bark }),
  ]
  const clusters = [{ c: trunkCurve.getPointAt(1).add(v(0, 0.35, 0)), rad: 1.05 }]
  const branchEnds = []
  for (let k = 0; k < 7; k++) {
    const t0 = 0.48 + k * 0.065
    const origin = trunkCurve.getPointAt(t0)
    const a = k * 2.399 + r() * 0.5
    const out = v(Math.cos(a), 0, Math.sin(a))
    const len = 1.1 + r() * 0.8
    const end = origin.clone().addScaledVector(out, len).add(v(0, 0.55 + r() * 0.6, 0))
    const mid = origin.clone().addScaledVector(out, len * 0.45).add(v((r() - 0.5) * 0.3, 0.55, (r() - 0.5) * 0.3))
    const curve = new CatmullRomCurve3([origin, mid, end])
    const w = 1 - t0 * 0.55
    woodParts.push(taperedTube(curve, 24, 8, (t) => (0.1 * Math.pow(1 - t, 0.8) + 0.015) * w, { color: bark }))
    clusters.push({ c: end.clone().add(v(0, 0.12, 0)), rad: 0.62 + r() * 0.3 })
    branchEnds.push(end)
  }
  for (let k = 0; k < 6; k++) {
    const a = k * 1.047 + r() * 0.4
    const out = v(Math.cos(a), 0, Math.sin(a))
    const len = 0.9 + r() * 0.7
    const p0 = b.clone().add(v(0, 0.35, 0))
    const p1 = b.clone().addScaledVector(out, len * 0.45).add(v(0, 0.12, 0))
    const p2x = b.x + out.x * len, p2z = b.z + out.z * len
    const p2 = v(p2x, islandHeight(p2x, p2z) - 0.12, p2z)
    woodParts.push(taperedTube(new CatmullRomCurve3([p0, p1, p2]), 20, 8, (t) => 0.13 * Math.pow(1 - t, 0.9) + 0.02, { color: '#33291d' }))
  }
  const wood = mergeGeometries(woodParts)

  /* --- canopy leaves --- */
  const leaves = []
  const cDark = new Color('#123d17'), cMid = new Color('#2f7a2a'), cLight = new Color('#8fd14f')
  const dir = new Vector3()
  for (const cl of clusters) {
    const n = Math.round(520 * cl.rad)
    for (let i = 0; i < n; i++) {
      dir.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1)
      if (dir.lengthSq() > 1 || dir.lengthSq() < 0.01) { i--; continue }
      dir.normalize()
      const depth = 0.45 + 0.55 * Math.sqrt(r())
      const pos = cl.c.clone().add(tmp.copy(dir).multiplyScalar(cl.rad * depth).multiply(v(1, 0.68, 1)))
      o.position.copy(pos)
      o.lookAt(tmp.copy(pos).add(dir).add(v(0, 0.6, 0)))
      o.rotateZ(r() * Math.PI * 2)
      o.rotateX((r() - 0.5) * 0.9)
      const col = cDark.clone().lerp(cMid, depth).lerp(cLight, Math.max(0, dir.y) * depth * 0.55 + r() * 0.12)
      leaves.push({ pos, quat: o.quaternion.clone(), scale: 0.15 + r() * 0.12, color: col, hang: 0.9 + r() * 0.8, phase: r() * 6.28 })
    }
  }

  /* --- vines --- */
  const vineParts = []
  const vineLeaves = []
  const bulbs = []
  const vineGreen = new Color('#2c5a22'), vineLeafA = new Color('#1d5420'), vineLeafB = new Color('#62b23c')
  const addVine = (anchor, out, L, opts = {}) => {
    const phase = r() * 6.28
    const pts = [anchor.clone(), anchor.clone().addScaledVector(out, 0.22).add(v(0, -0.28, 0))]
    const steps = Math.max(3, Math.round(L / 0.7))
    const wob = r() * 6.28
    for (let k = 1; k <= steps; k++) {
      const f = k / steps
      pts.push(
        pts[1].clone().add(v(Math.sin(wob + f * 3.1) * 0.22 * f + out.x * f * 0.25, -L * f, Math.cos(wob + f * 2.7) * 0.22 * f + out.z * f * 0.25)),
      )
    }
    const curve = new CatmullRomCurve3(pts)
    const len = curve.getLength()
    const radius = opts.radius ?? 0.028
    vineParts.push(
      taperedTube(curve, Math.max(12, Math.round(len * 10)), 4, (t) => radius * (1 - t * 0.6), {
        hangAt: (t) => t * len,
        phase,
        color: opts.color ?? vineGreen,
      }),
    )
    if (opts.leaves === false) return
    for (let s = 0.08; s < len - 0.05; s += 0.075 + r() * 0.08) {
      const t = s / len
      const pos = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const side = v(r() - 0.5, 0, r() - 0.5).normalize()
      o.position.copy(pos)
      o.lookAt(tmp.copy(pos).add(side))
      o.rotateX(-0.6 + r() * 0.5)
      o.rotateZ((r() - 0.5) * 1.6)
      pos.addScaledVector(side, 0.02)
      vineLeaves.push({
        pos,
        quat: o.quaternion.clone(),
        scale: (0.07 + r() * 0.07) * (1 - t * 0.35),
        color: vineLeafA.clone().lerp(vineLeafB, r() * 0.7),
        hang: s,
        phase,
      })
      void tan
    }
    if (r() < 0.75) {
      bulbs.push({ pos: curve.getPointAt(1).add(v(0, -0.02, 0)), quat: o.quaternion.clone(), scale: 0.03 + r() * 0.035, color: new Color(1, 1, 1), hang: len, phase })
    }
    for (let k = 0; k < 2; k++)
      if (r() < 0.35) {
        const t = 0.3 + r() * 0.6
        bulbs.push({ pos: curve.getPointAt(t), quat: o.quaternion.clone(), scale: 0.018 + r() * 0.015, color: new Color(1, 1, 1), hang: t * len, phase })
      }
  }

  const anchor = new Vector3()
  for (let i = 0; i < 54; i++) {
    const th = r() * Math.PI * 2
    const t = 0.03 + Math.pow(r(), 1.4) * 0.55
    bottomPoint(th, t, anchor)
    const out = v(Math.cos(th), 0, Math.sin(th))
    anchor.addScaledVector(out, -0.04)
    addVine(anchor.clone(), out, 1.2 + r() * 4.2 * (1 - t * 0.6))
  }
  // dangling roots
  for (let i = 0; i < 16; i++) {
    const th = r() * Math.PI * 2
    const t = 0.25 + r() * 0.6
    bottomPoint(th, t, anchor)
    const out = v(Math.cos(th), 0, Math.sin(th))
    addVine(anchor.clone().addScaledVector(out, -0.08), out, 0.6 + r() * 1.5, { radius: 0.05, color: new Color('#2b2419'), leaves: false })
  }
  // vines falling from the canopy
  for (const e of branchEnds) {
    const n = 1 + Math.floor(r() * 2)
    for (let k = 0; k < n; k++) {
      const a = r() * 6.28
      addVine(e.clone().add(v(Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3)), v(Math.cos(a), 0, Math.sin(a)), 0.9 + r() * 1.6, { radius: 0.016 })
    }
  }
  const vines = mergeGeometries(vineParts)

  /* --- grass --- */
  const GRASS = 16000
  const gOffset = new Float32Array(GRASS * 3)
  const gParams = new Float32Array(GRASS * 4) // yaw, height, rand, edge
  let gi = 0
  while (gi < GRASS) {
    const th = r() * Math.PI * 2
    const t = Math.sqrt(r()) * 0.985
    const R = rimRadius(th)
    const x = Math.cos(th) * t * R, z = Math.sin(th) * t * R
    const dTree = Math.hypot(x - TREE_BASE.x, z - TREE_BASE.z)
    if (dTree < 0.38) continue
    const patch = fbm2(x * 0.7 - 5, z * 0.7 + 2, 3)
    if (patch < -0.28 && r() < 0.7) continue
    gOffset.set([x, islandHeight(x, z) - 0.02, z], gi * 3)
    gParams.set([r() * Math.PI * 2, (0.22 + r() * 0.32) * (1 + patch * 0.6) * (1 - smoothstep(0.85, 1, t) * 0.4), r(), t], gi * 4)
    gi++
  }

  /* --- boulders --- */
  const boulders = []
  const bPos = [[1.6, 0.9], [-2.1, 1.3], [0.9, -2.0], [2.3, -0.6], [-1.4, -1.9]]
  bPos.forEach(([x, z], i) => {
    const g = new IcosahedronGeometry(1, 2)
    const p = g.attributes.position
    for (let k = 0; k < p.count; k++) {
      tmp.fromBufferAttribute(p, k)
      const d = 1 + noise3(tmp.x * 1.6 + i * 3, tmp.y * 1.6, tmp.z * 1.6) * 0.35
      tmp.multiplyScalar(d)
      p.setXYZ(k, tmp.x, tmp.y * 0.7, tmp.z)
    }
    g.computeVertexNormals()
    const s = 0.18 + r() * 0.28
    boulders.push({ geometry: g, position: [x, islandHeight(x, z) + s * 0.25, z], scale: s, rotation: r() * 6 })
  })

  return {
    islandTop,
    islandTopProxy: buildIslandTop(14, 40),
    islandBottom,
    wood,
    vines,
    leaves: instanceData(leaves),
    vineLeaves: instanceData(vineLeaves),
    bulbs: instanceData(bulbs),
    grass: { count: GRASS, offset: gOffset, params: gParams },
    boulders,
    maskAnchor: new Vector3(0.25, 1.75, 1.35),
  }
}
