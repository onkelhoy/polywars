export type PrecipitationOptions = {
    /** most drops at intensity 1 (default 24000) */
    drops?: number;
    /** m, side of the box of drops round the camera (default 60) */
    box?: number;
    /** m, height of that box (default 30) */
    height?: number;
    /** ground height for splashes, default 0 */
    ground?: (x: number, z: number) => number;
    /** most splashes alive (default 3000) */
    splashes?: number;
};

/** live: what falls and how hard */
export type PrecipitationState = {
    /** 0..1: 0 none, .2 mild drizzle, 1 a downpour */
    intensity: number;
    /** true = snow */
    snow: boolean;
    /** wind m/s along x / z */
    wind: [number, number];
};

/** the look (linear colours, live) */
export type PrecipitationLook = {
    rain: [number, number, number];
    snow: [number, number, number];
    /** rain fall m/s */
    rainSpeed: number;
    snowSpeed: number;
    /** streak length, seconds of motion */
    streak: number;
    /** drop width m */
    width: number;
    /** snow flake size m */
    flake: number;
    /** splash ring radius m */
    splash: number;
    /** wetness gained per s at full rain, lost per s when dry */
    wet: number;
    dry: number;
};
