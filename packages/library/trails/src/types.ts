export type Vec3 = [number, number, number];

/** a road / path as the trails see it (`@polywar/roads` `Road` fits) */
export type Way = { id: number; class: string; points: Vec3[] | [number, number, number][]; width: number; spans?: { kind: string; from: number; to: number }[] };
/** a site (`@polywar/sites` `Site` fits) */
export type Spot = { kind: string; x: number; z: number; radius: number };

/** one thing to place: asset kind (path under `assets/models/`), position, yaw (model +x turned to `cos yaw, -sin yaw`) */
export type Item = { kind: string; x: number; y: number; z: number; yaw: number; scale?: number };

export type TrailWorld = {
    ways: Way[];
    spots: Spot[];
    /** drawn ground height */
    ground: (x: number, z: number) => number;
    /** 0..1 how open (no trees) a spot is; optional: rest spots prefer open ground */
    open?: (x: number, z: number) => number;
    /** metres from (x, z) to the nearest way's edge (<= 0 on a way); optional: nothing is placed on any way */
    clear?: (x: number, z: number) => number;
    /** tunnel mouths / bridge ends: x y z + direction into the tunnel / along the bridge */
    mouths?: { x: number; y: number; z: number; dx: number; dz: number }[];
};

export type TrailOptions = {
    seed: number;
    /** asset kinds */
    assets: { bench: string; lamp: string; streetLamp: string; signpost: string; fence: string; log: string; woodpile: string; rocks: string[] };
    /** classes that are trails (rest spots, fences) */
    trails: string[];
    /** rest spot every ~m along trails, if the place is good */
    restEvery: number;
    /** a rest spot needs this much view (m over the ground ring around it) or this much openness */
    view: number;
    /** fence where the ground beside a trail drops more than `drop` m within `reach` m */
    fence: { drop: number; reach: number; length: number };
    /** street lamps every m on roads inside villages / cities */
    lampEvery: number;
    /** rocks around tunnel mouths */
    rocks: number;
};
