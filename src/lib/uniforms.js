import { Vector3 } from 'three'

/** Uniform objects shared by many materials; updated once per frame. */
export const G = {
  uTime: { value: 0 },
  uRayO: { value: new Vector3(0, 0, 10) },
  uRayD: { value: new Vector3(0, 0, -1) },
  uRayActive: { value: 0 },
  uPulse: { value: 0 },
}

import { getNoiseTexture } from './noiseTexture'
G.uNoise = { value: getNoiseTexture() }
G.uLife = { value: null }
G.uAspect = { value: 1 }
