export type Placement = { piece: string; matrix: number[] };

/** a lot: rectangle in metres, centred on the origin, long side on X */
export type Lot = { width: number; depth: number };

/** a building style (medieval, ...). The city knows nothing about pieces. */
export type CityStyle<Out = unknown> = {
    name: string;
    /** pieces centred on the origin, fitting the lot */
    build(lot: Lot, seed: number): Placement[];
    /** turns pieces into something drawable (e.g. a GLTF) */
    render?(pieces: Placement[]): Promise<Out>;
};

export type CityOptions = {
    style: string;
    seed: number;
    /** hex radius in grid steps, 1..6 */
    radius: number;
    /** block edge length in metres, about */
    block: number;
    /** street width in metres */
    street: number;
    /** chance a lot stays empty (square) */
    empty: number;
};

export type CityLot = Lot & { cell: number; x: number; z: number; /** radians around Y */ angle: number; seed: number; empty: boolean };

export type City = {
    lots: CityLot[];
    /** street centre lines, [x0, z0, x1, z1] */
    streets: [number, number, number, number][];
    pieces: Placement[];
};
