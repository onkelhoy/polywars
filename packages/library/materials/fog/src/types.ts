/** The fog a material reads; every polywar light has these (missing height fields = plain distance fog). */
export type FogLight = {
    fogColor: [number, number, number];
    /** per metre at `fogBase` height (0 = none) */
    fogDensity: number;
    /** how fast it thins going up, per metre (0 = same at every height) */
    fogFalloff?: number;
    /** world height where the density is `fogDensity` (valley floor) */
    fogBase?: number;
};
