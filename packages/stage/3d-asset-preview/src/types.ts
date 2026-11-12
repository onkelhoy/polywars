export type PreviewMode = "turntable" | "orbit" | "fps";
export type LoadEvent = { src: string; animations: string[]; triangles: number; size: [number, number, number] };

/** draws over the model each frame; `matrix` is the model's placement (model space -> world) */
export type Overlay = (renderer: import("@polywar/renderer").Renderer, model: import("@polywar/renderer").Model, matrix: import("@papit/matrix").Matrix4) => void;
