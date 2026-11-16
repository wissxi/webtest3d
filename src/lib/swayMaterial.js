import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { G } from './uniforms'
import { lifeChunk } from './glsl'

const header = /* glsl */ `
uniform float uTime;
uniform vec3 uRayO;
uniform vec3 uRayD;
uniform float uRayActive;
uniform float uPulse;
attribute float aHang;
attribute float aPhase;
${lifeChunk}
vec3 swayOffset(vec3 wp, float h, float ph){
  float a = h * h * 0.022 + h * 0.012;
  vec3 o = vec3(
    sin(uTime * 0.9 + ph + h * 0.7) * a + sin(uTime * 2.3 + ph * 3.1 + wp.y) * 0.006,
    0.0,
    cos(uTime * 0.7 + ph * 1.7 + h * 0.5) * a);
  o += vec3(sin(uTime * 3.0 + ph), 0.0, cos(uTime * 2.6 + ph)) * a * uPulse * 0.8;
  // pushed away from the cursor ray
  vec3 oc = wp - uRayO;
  float tt = max(dot(oc, uRayD), 0.0);
  vec3 away = wp - (uRayO + uRayD * tt);
  float d = length(away);
  float push = smoothstep(0.85, 0.0, d) * uRayActive * clamp(h, 0.25, 2.2);
  o += normalize(away + vec3(1e-5)) * push * 0.32;
  return o;
}
`

const project = /* glsl */ `
#ifdef GROW
  // leaves, bulbs: wither to nothing in the dead world, pop back where life returns
  vec4 growOrigin = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
  float lf = lifeAtClip(projectionMatrix * viewMatrix * growOrigin);
  lf = smoothstep(0.0, 1.0, lf);
  transformed *= lf * (1.0 + 0.35 * sin(lf * 3.14159));
#endif
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelMatrix * mvPosition;
mvPosition.xyz += swayOffset(mvPosition.xyz, aHang, aPhase);
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`

function inject(material, grow) {
  if (grow) material.defines = { ...(material.defines || {}), GROW: '' }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + header)
      .replace('#include <project_vertex>', project)
  }
  material.customProgramCacheKey = () => (grow ? 'sway-grow' : 'sway')
  return material
}

export const swayStandard = (params, grow = false) => inject(new MeshStandardMaterial(params), grow)
export const swayBasic = (params, grow = false) => inject(new MeshBasicMaterial(params), grow)
