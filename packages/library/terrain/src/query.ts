import { BIOMES, type Biome } from "@polywar/terrain-material";
import type { TerrainData } from "./types";

/** grid position of world x / z: column, row (fractional), clamped to the map */
function at(d: TerrainData, x: number, z: number) {
    const f = (v: number) => Math.min(d.n - 1, Math.max(0, (v / d.size + .5) * (d.n - 1)));
    return [f(x), f(z)];
}

/** bilinear sample of a grid at world x / z */
export function sample(d: TerrainData, grid: ArrayLike<number>, x: number, z: number): number {
    const [gx, gz] = at(d, x, z), i = Math.min(d.n - 2, gx | 0), j = Math.min(d.n - 2, gz | 0), fx = gx - i, fz = gz - j, k = j * d.n + i;
    return grid[k] * (1 - fx) * (1 - fz) + grid[k + 1] * fx * (1 - fz) + grid[k + d.n] * (1 - fx) * fz + grid[k + d.n + 1] * fx * fz;
}

/** nearest node of a grid at world x / z */
export function nearest(d: TerrainData, grid: ArrayLike<number>, x: number, z: number): number {
    const [gx, gz] = at(d, x, z);
    return grid[Math.round(gz) * d.n + Math.round(gx)];
}

export const heightAt = (d: TerrainData, x: number, z: number) => sample(d, d.height, x, z);
export const biomeAt = (d: TerrainData, x: number, z: number): Biome => BIOMES[nearest(d, d.biome, x, z)];
export const slopeAt = (d: TerrainData, x: number, z: number) => sample(d, d.slope, x, z);
/** "ocean", "lake" or null */
export const waterAt = (d: TerrainData, x: number, z: number) => (["", "ocean", "lake"] as const)[nearest(d, d.water, x, z)] || null;
