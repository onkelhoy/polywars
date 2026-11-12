# @polywar/3d-asset-preview

Web component that shows a 3D asset by path: rotating, orbit/pan/zoom or FPS walk, animation picker.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-ui-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/3d-asset-preview.svg?logo=npm)](https://www.npmjs.com/package/@polywar/3d-asset-preview)

---

## installation

```bash
npm install @polywar/3d-asset-preview
```

### to use in **html**

```html
<script type="module" defer>
  import "@polywar/3d-asset-preview";
</script>

<pw-3d-asset-preview></pw-3d-asset-preview>
```

```js
// in-memory: a glTF (e.g. gltfFromMesh(mesh)) plus maps per mesh/primitive, urls or raw pixels
preview.gltf = Object.assign(gltfFromMesh(quad), { maps: [[{ albedo: { pixels, width, height, channels: 3 }, normal: "/x/normal.png" }]] });
```

Rendering is `@polywar/renderer` (`Renderer`, `Model`, `Grid`, `gltfFromMesh`). The camera pans in the view plane (viewport `pan="screen"`) and the origin dot sits on the asset's own origin.

Properties: `src`, `gltf`, `mode` (`turntable | orbit | fps`), `controls`, `grid`, `toon`, `speed`, light (`ambient`, `sun`, `sun-azimuth`, `sun-elevation`, `lamp`, `lamp-angle`, `lights` opens the panel), `keep-view` (a new model keeps the camera; `frame()` fits it again), `scene` (a `Scene`: `layer => Drawable`, something that draws itself with its own shader, e.g. `GrassPatch`; with or without a model).

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.

## Related Components

- [@papit/web-component](https://github.com/onkelhoy/papit/tree/main/packages/web/engines/web-component): Core utilities, decorators, and base component class
