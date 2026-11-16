# Verdant Isle

A floating island above an abyss, built with real WebGL 3D (no video backgrounds). The island has fallen asleep and faded to ash: gray, with a bare tree. **Wherever the cursor passes, it comes back to life.** Color returns, the grass rises, leaves sprout on the tree, flowers and glowing mushrooms open, and butterflies fly to the living patch. Behind the cursor, life slowly withers again. Scroll to the end and the whole island wakes up.

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

## How it works

**The life mask** (`src/lib/TrailMap.js`, `src/scene/Interaction.jsx`) is a screen-space ping-pong texture. Every frame the cursor paints a soft brush into it, and the old value slowly decays. A click adds an expanding wave, and in the finale a circle grows from the center of the screen. Every shader reads this one texture through `lifeChunk` (`src/lib/glsl.js`), so there is only one render, with no second scene:

| Who | Dead | Alive |
| --- | --- | --- |
| Color (`LifeEffect`, post) | desaturated, cold ash | the original color, slightly richer, with a faint growth seam along the edge |
| Grass (26k → 16k blades) | short, drooping, dry | tall, swaying in the wind, glowing along the cursor's trail |
| Tree and vine leaves, bulbs | none (bare branches) | grow with a small overshoot ("pop") |
| Flowers | closed gray buds | petals open, the centers glow |
| Mushrooms | shriveled | plump caps with a glowing underside |
| Butterflies, fireflies | none | appear; butterflies circle the cursor |

The grass also uses a second, world-space trail map, the same technique as snow in games: blades bend away from the cursor's path and glow.

**The island** (`src/lib/world.js`) is fully procedural: polar terrain, a rocky underside with strata, a tree built from tapered tubes, 70 vines. Things that hang sway through an `onBeforeCompile` patch (`src/lib/swayMaterial.js`), which keeps PBR lighting.

**Atmosphere:** a muted dome (so color stays on the objects), light shafts from the abyss, rising glints, fireflies. Noise comes from a single tileable texture (`src/lib/noiseTexture.js`), not computed per pixel.

## Performance

- `?debug` shows FPS, draw calls, triangles, and the number of geometries and textures.
- `PerformanceMonitor` from drei lowers the DPR on weak devices.
- About 50 draw calls and roughly 250k triangles, rendered in a single pass.

Other debug flags: `?nointro` skips the intro, `?alive` makes the whole island alive at once.
