import type { RigidBody, Shape, World } from "@papit/rigidbody";

export type Vec3 = [number, number, number];

export type DebrisOptions = {
    /** the shared `@papit/rigidbody` world; the host steps it (`world.update(dt)`) before `debris.update(dt)` */
    world: World;
    /** ground height: static tiles are put in the world round moving pieces only (no heightfield in rigidbody) */
    ground?: (x: number, z: number) => number;
    /** tile size, metres. Default 1 */
    tile?: number;
    /** most pieces kept; past it the oldest fade. Default 80 */
    cap?: number;
    /** seconds a piece stays before fading. Default 40 */
    life?: number;
    /** seconds of fading (shrinking away). Default 1.5 */
    fade?: number;
    /** angular damping per second after the first touch (rolling stops). Default 5 */
    roll?: number;
    /** first touch of a piece: speed it hit with, where */
    onland?: (piece: Piece, speed: number, at: Vec3) => void;
};

export type SpawnOptions = {
    shape: Shape;
    mass: number;
    position: Vec3;
    velocity?: Vec3;
    angularVelocity?: Vec3;
    /** quaternion x, y, z, w */
    rotation?: [number, number, number, number];
    /** model space -> body space (column-major 4x4), for a model not centred on its shape */
    local?: ArrayLike<number>;
    friction?: number;
    restitution?: number;
    /** host data (which model, which caliber) */
    data?: unknown;
};

/** One bit: moving as a body, then (settled) out of the world, still drawn where it lay. */
export type Piece = {
    kind: string;
    body: RigidBody;
    local?: ArrayLike<number>;
    data?: unknown;
    age: number;
    /** seconds since it landed */
    rolling: number;
    /** out of the world, lying still */
    settled: boolean;
    landed: boolean;
    /** 1 shown .. 0 gone */
    scale: number;
    fading: boolean;
};
