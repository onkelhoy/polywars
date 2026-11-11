import type { GLTF, Mesh } from "@papit/game-mesh";

export type AssetKind = "model" | "source" | "audio" | "image" | "other";

/** A file. `file` is its url. */
export type Asset = { name: string; file: string; size?: number };
/** A folder of files and folders; `manifest.json` (bin/manifest.mjs) is one of these. Each level is a heading. */
export type Assets = { name: string; assets: (Asset | Assets)[] };

/**
 * Anything the gallery shows. From a manifest, or set through `items` (e.g. generated content).
 * A 3D item needs one of `src` (url), `gltf` or `mesh`.
 */
export type GalleryItem = {
    name: string;
    /** heading path, `a/b/c` shows under "a" then "b/c" */
    group?: string;
    kind: AssetKind;
    src?: string;
    gltf?: GLTF;
    mesh?: Mesh | Mesh[];
    /** bytes, shown in the caption */
    size?: number;
    /** shown in the caption instead of the size */
    note?: string;
};

export type OpenEvent = { item: GalleryItem };
