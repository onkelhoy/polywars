# @polywar/shadows

Toon sun shadows: two depth maps round the camera, a sharp near one (12 m) and a coarser far one (45 m, redrawn
every 2nd frame), moved in whole texels so edges don't crawl, one nearest sample, a flat share of the sun taken
away, faded out with distance (nothing strong far off).

```ts
import { Shadows } from "@polywar/shadows";
const shadows = new Shadows(gl); // { size: 1024, radius: [12, 45], strength: .45, fade: [20, 45] }
renderer.light.shadow = shadows;               // renderer, grass, terrain read it
// each frame, before the scene:
shadows.cast(camera, light.sunDirection, view => { renderer.begin(view, null); drawCasters(); renderer.reset(); });
```

Materials: `${SHADOW_GLSL}` in the fragment, `sun *= 1.0 - shadowAt(world, normal)`, `bindShadows(gl, u, light.shadow)`.
Texture units `SHADOW_UNITS` (12, 13). View: `views/shadows`.
