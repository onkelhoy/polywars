export type Vec3 = [number, number, number];

/** what drives the sky each frame (`@polywar/weather` gives cover / grey / drift) */
export type SkyState = {
    /** unit, towards the sun */
    sun: Vec3;
    /** unit, towards the moon (`setTime` sets both) */
    moon: Vec3;
    /** 0 new .. .5 full .. 1 new */
    phase: number;
    /** 0..1 sky covered */
    cover: number;
    /** 0..1 grey, heavy clouds */
    grey: number;
    /** m the clouds have blown */
    drift: [number, number];
    /** cloud base height, m */
    base: number;
};

/** the look, linear colours (live) */
export type SkyLook = {
    zenith: Vec3;
    horizon: Vec3;
    overcastZenith: Vec3;
    overcastHorizon: Vec3;
    sunColour: Vec3;
    /** lit cloud tops */
    cloudLit: Vec3;
    /** cloud undersides on a fair day (Ghibli blue-lilac) */
    cloudShade: Vec3;
    /** rain cloud undersides */
    cloudDark: Vec3;
    /** m across one cloud cell */
    cloudScale: number;
    /** toon bands on the clouds, 0 = smooth */
    bands: number;
    /** cirrus up high, 0..1 */
    cirrus: number;
    /** m to fade the cloud layer into the horizon */
    reach: number;
    nightZenith: Vec3;
    nightHorizon: Vec3;
};

/** the light fields the sky sets (`@polywar/renderer`'s `Light` fits) */
export type SkyLight = {
    sunDirection?: Vec3; sunColor: Vec3; sunStrength: number; sky: Vec3; ground: Vec3; ambient: number;
    fogColor: Vec3; fogDensity: number;
};
