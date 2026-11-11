# @polywar/gallery

`<pw-gallery>`: a gallery of assets grouped under headings. 3D tiles turn (drag to turn, click to open in `<pw-3d-asset-preview>`), audio plays, images show. One WebGL canvas draws every 3D tile.

## Usage

```html
<!-- everything in /assets (needs /assets/manifest.json) -->
<pw-gallery></pw-gallery>

<!-- another folder, e.g. a package's own assets -->
<pw-gallery location="/packages/x/asset"></pw-gallery>

<!-- no files, only generated items -->
<pw-gallery location=""></pw-gallery>
```

```js
// a tree, same shape as manifest.json: every level is a heading
gallery.tree = { name: "village", assets: [
    { name: "houses", assets: [{ name: "house.glb", file: "/x/house.glb" }] },
] };

// or flat items, e.g. generated meshes
gallery.items = [
    { name: "house 1", group: "village/houses", kind: "model", mesh },   // Mesh or Mesh[] (game-mesh)
    { name: "tower", group: "village/towers", kind: "model", gltf },     // in-memory glTF
    { name: "theme", group: "audio", kind: "audio", src: "/x.mp3" },
];
```

| Property | Default | |
| --- | --- | --- |
| `location` | `/assets` | served folder with a `manifest.json`; `""` for none |
| `tree` | `null` | an `Assets` tree (`{ name, assets: (Asset \| Assets)[] }`, `Asset = { name, file, size? }`) |
| `items` | `[]` | extra `GalleryItem`s (`src`, `gltf` or `mesh`), shown last |
| `kinds` | `model, audio, image` | kinds visible at start (`model`, `audio`, `image`, `source`, `other`) |
| `search` | `""` | filters names and groups |

Groups: `a/b/c` shows under heading "a", sub-heading "b/c". Manifest files use their folder.

Methods: `open(item)`, `close()`. Event: `open` with `{ item }`.

## Manifest

```bash
node packages/ui/gallery/bin/manifest.mjs <folder> [--prefix=/url/of/folder]
```

Writes `<folder>/manifest.json` as an `Assets` tree. Also importable: `writeManifest(folder, prefix)`, `count(tree)`.

## Views

- `everything`: root `assets/` (`npm run assets` at the repo root serves it)
- `generated`: procedural houses through `items` (no manifest)
