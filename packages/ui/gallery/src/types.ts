import type { GLTF, Mesh } from "@papit/game-mesh";

export type AssetKind = "model" | "source" | "audio" | "image" | "other";

/** One file in a `manifest.json` (written by the `gallery-manifest` bin). */
export type ManifestFile = { path: string; name: string; folder: string; kind: AssetKind; size: number };
export type Manifest = { files: ManifestFile[] };

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
