# Verdant Isle

A floating island above an abyss, built with real WebGL 3D (no video backgrounds): vines, butterflies, light rising from the depths, and a **spirit mask that shows through the cursor lens**.

**Stack:** React · Three.js · React Three Fiber · Drei · React Postprocessing · GSAP · custom GLSL shaders.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # regular build → dist/
npm run build:single   # single self-contained index.html → dist-single/
```

## Deployment

Live site: https://wissxi.github.io/webtest3d/

`.github/workflows/deploy.yml` builds the project on every push and publishes `dist/` to the `gh-pages` branch. Pages has to be switched on once: **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `(root)`**.

## What happens on screen

| Interaction | Effect |
| --- | --- |
| Move the cursor | A lens opens a view into the "spirit world": a holographic mask, a topographic X-ray of the island, glyph rings, the butterflies' outlines |
| Move over the meadow | The grass bends away and glows along the trail, then slowly springs back |
| Move near vines and butterflies | Vines lean away; butterflies scatter |
| Click | The island "breathes": the lens bursts open, the butterflies scatter, the light from below flares |
| Scroll | The camera dives under the island, flies to the tree and butterflies, and in the finale the whole world turns into spirit vision |
| Idle for 3.5 s | A "ghost" lens drifts across the scene by itself as a hint |

## How it works

- **Reveal lens** (`src/scene/Spirit.jsx`, `src/lib/TrailMap.js`): the spirit world is a separate `Scene` (via `createPortal`) rendered into an off-screen buffer with the same camera. The cursor paints a screen-space ping-pong **trail map** that decays every frame. A full-screen quad in the main scene mixes the two images through that mask, with noise on the edge, a glowing rim and chromatic aberration. The quad is drawn inside the main render, so bloom also applies to the lens.
- **Grass deformation** (`src/scene/Grass.jsx`): the same technique as "snow" in games. The cursor's point on the ground is painted into a world-space map. The grass vertex shader reads the value and its gradient, bends the blades away from the trail, and adds a bioluminescent glow. 26,000 blades in one instanced draw call.
- **Island** (`src/lib/world.js`): fully procedural. Polar terrain mesh, a rocky underside with strata, a tree built from tapered tubes with instanced leaves, 70 vines with leaves and glowing bulbs. Everything that hangs sways through an `onBeforeCompile` patch (`src/lib/swayMaterial.js`), so the standard PBR lighting is kept.
- **Butterflies** (`src/scene/Butterflies.jsx`): a simple flock simulation on the CPU (30 instances, one draw call). Wings flap in the vertex shader, and the wing pattern is drawn procedurally in the fragment shader.
- **Atmosphere** (`src/scene/Atmosphere.jsx`): an abyss dome, light shafts from below (fresnel plus noise), rising glints and bokeh, fireflies. All particles are `Points` with custom shaders.
- **Post**: Bloom (mipmap blur), ACES tone mapping, a light chromatic aberration, vignette, film grain.

## Performance

- `?debug` shows FPS, draw calls, triangles, and the number of geometries and textures.
- `PerformanceMonitor` from drei lowers the DPR on weak devices.
- The spirit scene isn't rendered at all while the lens is closed.
- Roughly 55 draw calls for the main scene and about 320k triangles (most of them grass).

Other debug flags: `?nointro` skips the intro, `?spirit` shows the spirit world full-screen, `?maskdebug` displays the lens mask itself.
