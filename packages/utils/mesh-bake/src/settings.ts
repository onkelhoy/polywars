import type { Axis, BakeSettings } from "./types";

export const DEFAULTS: BakeSettings = {
    axis: "+y", snap: .5, resolution: 256, samples: 4, tile: true,
    normalStrength: 1, soften: 0,
    aoRadius: .04, aoStrength: 1, aoInColor: 0,
    spec: 1, specByMaterial: {}, specCavity: 1,
    plane: "top",
};

/** tangent (image right), bitangent (image up), normal (toward the viewer): right handed */
export const FRAMES: Record<Axis, [number[], number[], number[]]> = {
    "+x": [[0, 0, -1], [0, 1, 0], [1, 0, 0]], "-x": [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    "+y": [[1, 0, 0], [0, 0, -1], [0, 1, 0]], "-y": [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
    "+z": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "-z": [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
};
export const AXES = Object.keys(FRAMES) as Axis[];
