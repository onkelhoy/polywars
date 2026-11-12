import type { Vec3 } from "@polywar/renderer";

/**
 * How a surface takes the renderer's light. All optional: `{}` is plain lit.
 * `toon` bands sun and lamp, `unlit` shows the colour as is, `normal` bends the light with a normal map.
 */
export type Shading = {
    toon?: number;
    unlit?: boolean;
    /** a built-in procedural map (`bumps`, `tiles`) or the url of a normal map (OpenGL, +Y up) */
    normal?: "bumps" | "tiles" | string;
    /** normal map repeats over the uvs, u and v */
    repeat?: [number, number];
    /** base colour, linear rgb */
    color?: Vec3;
};

/** the shading styles, by name */
export const SHADINGS: Record<string, Shading> = {
    lit: {},
    "toon 2": { toon: 2 },
    "toon 3": { toon: 3 },
    unlit: { unlit: true },
    "normal mapped": { normal: "bumps", repeat: [12, 6] },
    "normal tiles": { normal: "tiles", repeat: [8, 4] },
};
