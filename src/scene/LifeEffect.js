import { Effect } from 'postprocessing'
import { G } from '../lib/uniforms'

const fragmentShader = /* glsl */ `
uniform sampler2D uLife;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uAspect;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv * vec2(uAspect, 1.0);
  float n = texture2D(uNoise, p * 0.35 + vec2(uTime * 0.02, -uTime * 0.015)).r * 2.0 - 1.0;
  float n2 = texture2D(uNoise, p * 1.4 - vec2(uTime * 0.03)).g * 2.0 - 1.0;
  float m = texture2D(uLife, uv + vec2(n, n2) * 0.014).r;
  float mm = m + n * 0.12 + n2 * 0.05;
  float life = smoothstep(0.32, 0.6, mm);
  float px = max(fwidth(mm), 1e-4);
  float rim = (1.0 - smoothstep(0.0, px * 2.0, abs(mm - 0.4))) * step(0.05, m);

  vec3 c = inputColor.rgb;
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // dead: cold ash, slightly crushed
  vec3 dead = pow(vec3(g), vec3(1.3)) * vec3(0.82, 0.88, 0.95) * 0.85;
  vec3 alive = max(mix(vec3(g), c, 1.12), 0.0);
  vec3 col = mix(dead, alive, life);
  // a faint seam of new growth along the edge
  col += vec3(0.55, 0.9, 0.35) * rim * 0.06;
  outputColor = vec4(col, inputColor.a);
}
`

/** Desaturates the world into ash everywhere except where the life mask is painted. */
export class LifeEffect extends Effect {
  constructor() {
    super('LifeEffect', fragmentShader, {
      uniforms: new Map([
        ['uLife', G.uLife],
        ['uNoise', G.uNoise],
        ['uTime', G.uTime],
        ['uAspect', G.uAspect],
      ]),
    })
  }
}
