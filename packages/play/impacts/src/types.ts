export type Vec3 = [number, number, number];
/** linear 0..1 */
export type Colour = [number, number, number];

/** What a hit on a surface throws up and leaves behind. */
export type SurfaceLook = {
    /** bits flying off (count at close range, fewer further away) */
    bits: number;
    bitColour: Colour;
    /** m/s off the surface */
    bitSpeed: number;
    /** seconds */
    bitLife: number;
    /** bits that glow (sparks): no shading, fade from bright */
    sparks?: boolean;
    /** a dust puff: count, colour, size m */
    puff: number;
    puffColour: Colour;
    puffSize: number;
    /** the mark left: radius m, centre colour, rim colour; 0 = none */
    mark: number;
    markColour: Colour;
    rimColour: Colour;
};

export type ImpactsSetting = {
    /** hits further than this from the camera make no particles (marks still go on), m (default 150) */
    far?: number;
    /** marks kept, oldest go first (default 600) */
    marks?: number;
    /** particles alive at most (default 3000) */
    particles?: number;
    /** look per surface name; `default` for any other */
    surfaces?: Record<string, SurfaceLook>;
};

/** something marks can stick to: its model matrix (column major 4x4, rigid) written into `out` */
export type Carrier = { matrix(out: Float32Array): ArrayLike<number> };

/** what the renderer needs from a camera; `@papit/game-engine`'s `Camera` fits */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};
