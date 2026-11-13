import type { Mesh } from "@papit/game-mesh";
export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

export type BridgeType = "foot-wood" | "slab-stone" | "arch-stone" | "trestle-wood" | "girder";

export type BridgeOptions = {
    /** deck width, m */
    width: number;
    /** ground height under a point (supports go down to it); default 0 */
    ground: (x: number, z: number) => number;
    /** what crosses: rail decks get no parapet gaps, paths get light railings */
    use: "rail" | "road" | "path";
};

export type PortalOptions = {
    /** opening width / height (to the arch top), m */
    width: number;
    height: number;
    /** face wall around the opening, m beyond it */
    wall: number;
    /** wing walls length, m (0 = none) */
    wings: number;
    /** how far the lining goes into the hill, m */
    depth: number;
    stone: RGB;
    /** face wall height over the road (so it meets the hill above the mouth), m; default from height + wall */
    top?: number;
};

export type { Mesh };
