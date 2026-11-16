import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

/**
 * Tileable value-noise texture. Sampling a texture is far cheaper than computing
 * simplex noise per pixel, which matters for the full-screen layers.
 */
function tileNoise(size, period, seed) {
  const lattice = new Float32Array(period * period)
  let s = seed
  for (let i = 0; i < lattice.length; i++) {
    s = (s * 16807) % 2147483647
    lattice[i] = s / 2147483647
  }
  const out = new Float32Array(size * size)
  const f = (t) => t * t * (3 - 2 * t)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * period, gy = (y / size) * period
      const x0 = Math.floor(gx), y0 = Math.floor(gy)
      const tx = f(gx - x0), ty = f(gy - y0)
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period
      const a = lattice[y0 * period + x0], b = lattice[y0 * period + x1]
      const c = lattice[y1 * period + x0], d = lattice[y1 * period + x1]
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
    }
  return out
}

let tex = null
export function getNoiseTexture() {
  if (tex) return tex
  const size = 256
  const layers = [
    [tileNoise(size, 8, 11), tileNoise(size, 16, 12), tileNoise(size, 32, 13)],
    [tileNoise(size, 16, 21), tileNoise(size, 32, 22), tileNoise(size, 64, 23)],
    [tileNoise(size, 4, 31), tileNoise(size, 8, 32), tileNoise(size, 16, 33)],
  ]
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      const [a, b, d] = layers[c]
      data[i * 4 + c] = Math.round((a[i] * 0.55 + b[i] * 0.3 + d[i] * 0.15) * 255)
    }
    data[i * 4 + 3] = 255
  }
  tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
