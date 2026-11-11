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
gallery.items = [
    { name: "house 1", group: "village/houses", kind: "model", mesh },   // Mesh or Mesh[] (game-mesh)
    { name: "tower", group: "village/towers", kind: "model", gltf },     // in-memory glTF
    { name: "theme", group: "audio", kind: "audio", src: "/x.mp3" },
];
```

| Property | Default | |
| --- | --- | --- |
| `location` | `/assets` | served folder with a `manifest.json`; `""` for none |
| `items` | `[]` | extra `GalleryItem`s, shown after the manifest ones |
| `kinds` | `model, audio, image` | kinds visible at start (`model`, `audio`, `image`, `source`, `other`) |
| `search` | `""` | filters names and groups |

Groups: `a/b/c` shows under heading "a", sub-heading "b/c". Manifest files use their folder.

Methods: `open(item)`, `close()`. Event: `open` with `{ item }`.

## Manifest

```bash
node packages/ui/gallery/bin/manifest.mjs <folder> [--prefix=/url/of/folder]
```

Writes `<folder>/manifest.json`. Also importable: `writeManifest(folder, prefix)`.

## Views

- `experiment`: root `assets/`
- `generated`: procedural houses through `items` (no manifest)
