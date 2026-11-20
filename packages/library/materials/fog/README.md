# @polywar/fog

Distance + height fog for every polywar material: one GLSL chunk, its uniforms, a binder.

```ts
import { FOG_GLSL, bindFog } from "@polywar/fog";
// fragment: `${FOG_GLSL}` then `c = applyFog(c, world, eye);` (linear colour)
bindFog(gl, name => uniforms[name], light); // light: { fogColor, fogDensity, fogFalloff?, fogBase? }
```

- `fogDensity`: per metre at `fogBase` height.
- `fogFalloff`: thinning per metre going up (0 = plain distance fog). Valleys fill, hills poke out.
- `fogBase`: world height of the valley floor.

Used by `@polywar/renderer`, `@polywar/grass-material`, `@polywar/terrain-material`, `@polywar/water`.
View: `views/fog` (sliders).
