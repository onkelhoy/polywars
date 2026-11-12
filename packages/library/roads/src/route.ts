import { GridSearch, alternatives, headings, type GridOptions, type GridResult } from "@polywar/pathfinding";
import type { Grid } from "./grid";
import type { ClassOptions } from "./types";

export const HEADINGS = 16;
export const BRIDGE = 1, TUNNEL = 2;
const DIRS = headings(HEADINGS);

/**
 * Route search on the routing grid for one road class: length, climb (grade² over the class max, steep = very dear),
 * turns, reuse of roads already there (`used[node] >= rank`) and straight bridge / tunnel jumps.
 */
export class Router {
    private search = new GridSearch();
    /** rank of the biggest road on each node (0 none), rail has its own */
    readonly used: Uint8Array;
    readonly rail: Uint8Array;

    constructor(readonly grid: Grid, public greed = 1.3) {
        this.used = new Uint8Array(grid.m * grid.m);
        this.rail = new Uint8Array(grid.m * grid.m);
    }

    options(from: number, to: number, c: ClassOptions, rank: number, isRail = false): GridOptions {
        const { m, cell, height, water } = this.grid, used = isRail ? this.rail : this.used, edge = 2;
        const turnCost = c.turn * 16 / HEADINGS;
        const cost = (f: number, t: number, _h: number, _p: number, turn: number) => {
            const ti = t % m, tj = (t / m) | 0;
            if (water[t] || ti < edge || tj < edge || ti >= m - edge || tj >= m - edge) return Infinity;
            const dx = ti - f % m, dz = tj - ((f / m) | 0), len = Math.hypot(dx, dz) * cell, grade = Math.abs(height[t] - height[f]) / len, r = grade / c.maxGrade;
            let k = 1 + c.climb * r * r;
            if (r > 1) k += 40 * (r - 1);
            if (used[t] >= rank) k *= c.reuse;
            return len * k + turn * turnCost;
        };
        const extra = (node: number, heading: number, push: (to: number, heading: number, cost: number, tag: number) => void) => {
            if (heading < 0) return;
            const [dx, dz] = DIRS[heading], i = node % m, j = (node / m) | 0, unit = Math.hypot(dx, dz) * cell, h0 = height[node];
            const at = (s: number) => { const x = i + dx * s, z = j + dz * s; return x < 2 || z < 2 || x >= m - 2 || z >= m - 2 ? -1 : z * m + x; };
            const a1 = at(1), a2 = at(2);
            if (a1 < 0 || a2 < 0) return;
            // bridge: water ahead or a valley
            if (c.bridge.max > 0 && (water[a1] || height[a2] < h0 - 10))
            {
                let wet = false, low = Infinity;
                for (let s = 1; s * unit <= c.bridge.max; s++)
                {
                    const k = at(s);
                    if (k < 0) break;
                    if (water[k]) { wet = true; continue; }
                    low = Math.min(low, height[k]);
                    if (s < 2) continue;
                    const len = s * unit, end = height[k];
                    // over water, or a valley at least 20 m deep
                    if ((wet || low < Math.min(h0, end) - 20) && Math.abs(end - h0) / len <= c.maxGrade)
                    {
                        push(k, heading, len * c.bridge.cost, BRIDGE);
                        break;
                    }
                }
            }
            // tunnel: ground ahead rises steeply
            if (c.tunnel.max > 0 && height[a2] > h0 + 6)
            {
                for (let s = 3; s * unit <= c.tunnel.max; s++)
                {
                    const k = at(s);
                    if (k < 0 || water[k]) break;
                    const len = s * unit, end = height[k];
                    if (Math.abs(end - h0) / len > c.maxGrade) continue;
                    // covered along the middle
                    let covered = true;
                    for (let q = 1; q < s && covered; q++) { const t = q / s; if (height[at(q)] < h0 + (end - h0) * t + (t > .15 && t < .85 ? c.tunnel.cover : 0)) covered = false; }
                    if (covered) { push(k, heading, len * c.tunnel.cost, TUNNEL); break; }
                }
            }
        };
        return { n: m, headings: HEADINGS, from, to, cost, extra, minCost: cell * Math.min(1, c.reuse * 2), greed: this.greed, limit: m * m * HEADINGS };
    }

    route(from: number, to: number, c: ClassOptions, rank: number, isRail = false): GridResult | null {
        return this.search.find(this.options(from, to, c, rank, isRail));
    }

    alternatives(from: number, to: number, c: ClassOptions, rank: number, k: number, penalty: number, overlap: number, isRail = false): GridResult[] {
        return alternatives(this.options(from, to, c, rank, isRail), { k, penalty, overlap, spread: 2 }, this.search);
    }

    /** mark a found route as built */
    mark(nodes: number[], rank: number, isRail = false) {
        const used = isRail ? this.rail : this.used;
        for (const k of nodes) if (used[k] < rank) used[k] = rank;
    }
}
