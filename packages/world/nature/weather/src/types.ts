export type CloudKind = "clear" | "cirrus" | "fair" | "towering" | "storm" | "overcast";

/** temperature + moisture 0..1 at a spot (terrain's climate grids fit) */
export type Climate = (x: number, z: number) => { temperature: number; moisture: number };

export type WeatherOptions = {
    seed?: number;
    /** biome climate; default a mild, middling place */
    climate?: Climate;
    /** wind m/s along x / z, carries the humidity field */
    wind?: [number, number];
    /** m across one weather system (default 6000) */
    scale?: number;
    /** game seconds per real second (default 1) */
    speed?: number;
    /** added to humidity everywhere, -1..1 (owner / debug knob) */
    bias?: number;
    /** below this temperature it snows (default .3) */
    snowBelow?: number;
};

export type WeatherSample = {
    /** 0..1 water in the air */
    humidity: number;
    /** 0..1 sky covered by cloud */
    cover: number;
    /** 0..1 how dark / grey the clouds are */
    grey: number;
    kind: CloudKind;
    /** cloud base / top, m above the ground */
    base: number;
    top: number;
    /** 0..1 rain or snow (0 = dry) */
    precipitation: number;
    snow: boolean;
    /** 0..1 thunder chance */
    storm: number;
    temperature: number;
};
