import type { Mesh } from "@papit/game-mesh";
import type { Scene, TexturedGLTF } from "@polywar/3d-asset-preview";

/** `model` and `material` are 3D tiles */
export type AssetKind = "model" | "material" | "source" | "audio" | "image" | "video" | "other";

/** A file. `file` is its url. */
export type Asset = { name: string; file: string; size?: number };
/** A folder of files and folders; `manifest.json` (bin/manifest.mjs) is one of these. Each level is a heading. */
export type Assets = { name: string; assets: (Asset | Assets)[] };

/**
 * Anything the gallery shows. From a manifest, or set through `items` (e.g. generated content).
 * A 3D item needs one of `src` (url), `gltf` (maps too), `mesh` or `scene` (draws itself, e.g. a material sample).
 */
export type GalleryItem = {
    name: string;
    /** heading path, `a/b/c` shows under "a" then "b/c" */
    group?: string;
    kind: AssetKind;
    src?: string;
    gltf?: TexturedGLTF;
    mesh?: Mesh | Mesh[];
    scene?: Scene;
    /** bytes, shown in the caption */
    size?: number;
    /** shown in the caption instead of the size */
    note?: string;
};

export type OpenEvent = { item: GalleryItem };
