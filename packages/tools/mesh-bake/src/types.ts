export type Axis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

/** Triangle soup in world space (glTF: metres, Y up). */
export type Triangles = {
    /** 9 numbers per triangle */
    positions: Float32Array;
    /** material index per triangle, -1 = none */
    material: Int16Array;
    materials: { name: string; color: [number, number, number, number] }[];
};

export type BakeSettings = {
    /** side the surface is seen from. Ground: +y. */
    axis: Axis;
    /** baked rectangle in metres, across x up. Default: bounds rounded up to `snap`. */
    size?: [number, number];
    /** centre of the rectangle on the two in-plane axes. Default: bounds centre rounded to `snap`. */
    center?: [number, number];
    /** grid in metres for the two defaults above */
    snap: number;
    /** pixels per metre */
    resolution: number;
    /** supersampling per axis, 1 to 8 */
    samples: number;
    /** blur, normals and ambient wrap around the edges, for pieces that repeat */
    tile: boolean;
    /** normal map strength, 1 = true to the mesh */
    normalStrength: number;
    /** metres the relief is blurred by before the normals: 0 = hard edges */
    soften: number;
    /** metres the ambient occlusion looks around */
    aoRadius: number;
    /** 0 = no ambient occlusion, 1 = true to the mesh, more = darker */
    aoStrength: number;
    /** 0 to 1: how much of the ambient occlusion is also multiplied into the colour map */
    aoInColor: number;
    /** highlight strength of every material, 0 to 1 */
    spec: number;
    /** highlight strength per material name, wins over `spec` */
    specByMaterial: Record<string, number>;
    /** 0 to 1: how much occluded parts lose their highlight */
    specCavity: number;
    /** where the quad sits along the axis */
    plane: "top" | "bottom" | number;
};

/** What the mesh looks like from the axis: per supersample the highest point and its material. */
export type Raster = {
    /** final size in pixels */
    width: number;
    height: number;
    samples: number;
    /** rectangle in metres */
    size: [number, number];
    /** lower left corner of the rectangle on the in-plane axes */
    origin: [number, number];
    /** lowest and highest point along the axis */
    range: [number, number];
    /** (width * samples) x (height * samples), row 0 is the bottom */
    depth: Float32Array;
    material: Int16Array;
    /** 0 to 1: part of the rectangle the mesh covers, the rest is filled from its neighbours */
    coverage: number;
    triangles: number;
};

export type BakeResult = {
    width: number;
    height: number;
    size: [number, number];
    /** rgb, sRGB, row 0 is the top */
    color: Uint8Array;
    /** rgb, tangent space, OpenGL (+Y up) */
    normal: Uint8Array;
    /** grey */
    ao: Uint8Array;
    /** grey */
    spec: Uint8Array;
    /** grey, lowest point black, highest white */
    relief: Uint8Array;
    /** the quad: 4 corners (counter clockwise seen from the axis), its normal and uvs */
    quad: { positions: number[][]; normal: number[]; uvs: number[][] };
    /** metres between the lowest and highest visible point */
    depth: number;
    coverage: number;
    triangles: number;
};

export type BakeFile = { name: string; data: Uint8Array };
