import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'

/**
 * Ping-pong render target that "paints" a soft brush stroke each frame and decays.
 * Used for the grass deformation map (world space) and the reveal lens (screen space).
 */
export class TrailMap {
  constructor(width, height, { additive = false } = {}) {
    const opts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false }
    this.read = new WebGLRenderTarget(width, height, opts)
    this.write = new WebGLRenderTarget(width, height, opts)
    this.material = new ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uA: { value: new Vector2() },
        uB: { value: new Vector2() },
        uRadius: { value: 0.05 },
        uStrength: { value: 0 },
        uDecay: { value: 0.95 },
        uAspect: { value: 1 },
        uExtraPos: { value: new Vector2(0.5, 0.5) },
        uExtraRadius: { value: 0 },
        uExtraStrength: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uPrev;
        uniform vec2 uA, uB, uExtraPos;
        uniform float uRadius, uStrength, uDecay, uAspect, uExtraRadius, uExtraStrength;
        varying vec2 vUv;
        float seg(vec2 p, vec2 a, vec2 b){
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
          return length(pa - ba * h);
        }
        void main(){
          vec2 asp = vec2(uAspect, 1.0);
          float prev = texture2D(uPrev, vUv).r * uDecay;
          float d = seg(vUv * asp, uA * asp, uB * asp);
          float brush = smoothstep(uRadius, uRadius * 0.35, d) * uStrength;
          float extra = smoothstep(uExtraRadius, uExtraRadius * 0.6, length((vUv - uExtraPos) * asp)) * uExtraStrength;
          float v = ${additive ? 'min(prev + brush * 0.35 + extra, 1.0)' : 'max(max(prev, brush), extra)'};
          gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.scene = new Scene()
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
    this.uniforms = this.material.uniforms
  }

  get texture() {
    return this.read.texture
  }

  setSize(w, h) {
    this.read.setSize(w, h)
    this.write.setSize(w, h)
  }

  update(gl) {
    this.uniforms.uPrev.value = this.read.texture
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(this.write)
    gl.render(this.scene, this.camera)
    gl.setRenderTarget(prev)
    const t = this.read
    this.read = this.write
    this.write = t
  }
}

export const grassTrail = new TrailMap(160, 160, { additive: true })
export const lensTrail = new TrailMap(320, 200)
export const GRASS_BOUNDS = 4.6 // world half-extent mapped onto the grass trail texture
