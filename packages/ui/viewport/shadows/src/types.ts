export type Vec3 = [number, number, number];

export type ShadowsOptions = {
    /** texels per side (default 512): fewer = bigger, blockier shadow pixels */
    size?: number;
    /** half width in metres of the shadowed square round the camera (default 45) */
    radius?: number;
    /** how much sun a shadow takes away 0..1 (default .55): one flat shade, the rest stays */
    strength?: number;
    /** how far above the square casters may stand, metres (default 120) */
    height?: number;
};

/** what the materials read (`light.shadow`); `Shadows` is one */
export type ShadowSource = {
    /** the depth texture, null while it is being drawn or before the first `cast` */
    readonly map: WebGLTexture | null;
    /** world -> shadow clip space (column major) */
    readonly matrix: Float32Array;
    readonly strength: number;
    /** one texel's width in metres (normal offset against acne) */
    readonly texel: number;
};

/** what the renderer needs from a camera (`@papit/game-engine` Camera fits) */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};
