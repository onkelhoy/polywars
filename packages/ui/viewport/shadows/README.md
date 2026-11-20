# @polywar/shadows

Toon sun shadows: one blocky depth map over a square round the camera (moved in whole texels, so the shadow
pixels don't swim), read with one nearest sample, taking a flat share of the sun away.

```ts
import { Shadows } from "@polywar/shadows";
const shadows = new Shadows(gl, { size: 512, radius: 45, strength: .5 });
renderer.light.shadow = shadows;               // renderer, grass, terrain read it
// each frame, before the scene:
shadows.cast(camera, light.sunDirection, view => { renderer.begin(view, null); drawCasters(); renderer.reset(); });
```

Materials: `${SHADOW_GLSL}` in the fragment, `sun *= 1.0 - shadowAt(world, normal)`, `bindShadows(gl, u, light.shadow)`.
Texture unit `SHADOW_UNIT` (12). View: `views/shadows`.
