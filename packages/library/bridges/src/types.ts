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
    /** openings in the parapet / truss where another way joins: `from`..`to` m along the path, `side` +1 = right (sweep +x) */
    gaps?: { from: number; to: number; side: -1 | 1 }[];
};

export type PortalOptions = {
    /** opening width / height (to the arch top), m */
    width: number;
    height: number;
    /** face wall around the opening, m beyond it */
    wall: number;
    /** wing walls length, m (0 = none) */
    wings: number;
    /** how far the lining goes into the hill, m (0: none, a `tunnel` tube follows) */
    depth: number;
    /** hood: roof + side walls from the face `hood` m back over the tube (covers the hole the ground has there), m */
    hood?: number;
    /** paved apron in front of the face, m (covers the ground's edge at the opening) */
    apron?: number;
    stone: RGB;
    /** face wall height over the road (so it meets the hill above the mouth), m; default from height + wall */
    top?: number;
};

export type TunnelOptions = {
    /** opening width / height (to the vault top), m: same as the portal */
    width: number;
    height: number;
    /** walkway width each side, kerb height, m */
    walkway: number;
    kerb: number;
    /** wall lamp spacing, m (alternating sides) */
    lampEvery: number;
    stone: RGB;
    lamp: RGB;
};

export type { Mesh };
