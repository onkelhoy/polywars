import { writeGLB } from "./glb";
import { encodePNG } from "./png";
import type { BakeFile, BakeResult } from "./types";

/** The files of one baked piece: `model.glb` (references the maps), `color.png`, `normal.png`, `ao.png`, `spec.png`. */
export async function bakeFiles(result: BakeResult, name: string): Promise<BakeFile[]> {
    const { width, height } = result;
    return [
        { name: "model.glb", data: writeGLB(name, result.quad) },
        { name: "color.png", data: await encodePNG(width, height, 3, result.color) },
        { name: "normal.png", data: await encodePNG(width, height, 3, result.normal) },
        { name: "ao.png", data: await encodePNG(width, height, 1, result.ao) },
        { name: "spec.png", data: await encodePNG(width, height, 1, result.spec) },
    ];
}
