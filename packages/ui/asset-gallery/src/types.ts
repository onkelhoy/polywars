export type AssetKind = "model" | "source" | "audio" | "image" | "other";
export type AssetFile = { path: string; name: string; folder: string; kind: AssetKind; size: number };
export type Manifest = { files: AssetFile[] };
export type OpenEvent = { file: AssetFile };
