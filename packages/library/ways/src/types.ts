import type { Mesh } from "@papit/game-mesh";
import type { Profile } from "@polywar/sweep";
export type Vec3 = [number, number, number];

/** what ways read of a road network (`@polywar/roads` `Network` fits) */
export type Way = { id: number; class: string; points: [number, number, number][]; width: number; spans: { kind: string; from: number; to: number }[]; /** roads of one chain join into one sweep */ chain?: number };
export type WayJunction = { id: number; x: number; z: number; y: number; roads: { road: number; angle: number; class: string }[] };

export type WaysInput = {
    roads: Way[];
    junctions?: WayJunction[];
    /** drawn ground height */
    ground: (x: number, z: number) => number;
    /** lake / swamp / river water under (x, z): trails get boardwalks there */
    wet?: (x: number, z: number) => boolean;
    /** water surface height at a wet spot */
    surface?: (x: number, z: number) => number;
};

/** a bridge, boardwalk or tunnel mouth that was built (`kind`: `bridge-<type>`, `boardwalk`, `portal`) */
export type Structure = { kind: string; road: number; x: number; y: number; z: number; to: Vec3 };

export type ClassStyle = { profile: Profile | null; step: number; lift: number; bands?: { every: number; shade: number } };

export type WaysResult = { mesh?: Mesh; sleepers: { data: Float32Array; count: number }; structures: Structure[] };
export type { Mesh };
