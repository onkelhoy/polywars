export type Vec3 = [number, number, number];

/** a point light: linear colour, strength, metres until it reaches 0 */
export type PointLight = { position: Vec3; color: Vec3; strength: number; range: number; on?: boolean };
