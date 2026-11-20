export type Vec3 = [number, number, number];

export type ShadowsOptions = {
    /** texels per side of each map (default 1024) */
    size?: number;
    /** half widths in metres of the near (sharp) and far (coarse) squares round the camera (default [12, 45]) */
    radius?: [number, number];
    /** how much sun a shadow takes away 0..1 (default .45): one flat shade, the rest stays */
    strength?: number;
    /** shadows fade from full at `fade[0]` m from the eye to none at `fade[1]` (default [20, 45]) */
    fade?: [number, number];
    /** how far above the square casters may stand, metres (default 120) */
    height?: number;
    /** the far map is redrawn every n-th cast (default 2) */
    farEvery?: number;
};

/** what the materials read (`light.shadow`); `Shadows` is one */
export type ShadowSource = {
    /** the near / far depth textures, null while being drawn or before the first `cast` */
    readonly maps: [WebGLTexture | null, WebGLTexture | null];
    /** world -> shadow clip space per map (column major) */
    readonly matrices: [Float32Array, Float32Array];
    /** one texel's width in metres per map (normal offset against acne) */
    readonly texels: [number, number];
    readonly strength: number;
    readonly fade: [number, number];
    /** the eye the fade is measured from */
    readonly eye: Vec3;
};

/** what the renderer needs from a camera (`@papit/game-engine` Camera fits) */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};
