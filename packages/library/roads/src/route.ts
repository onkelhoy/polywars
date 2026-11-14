import { GridSearch, alternatives, headings, type GridOptions, type GridResult } from "@polywar/pathfinding";
import type { Grid } from "./grid";
import type { ClassOptions } from "./types";
import { runout } from "./shape";

export const HEADINGS = 16;
export const BRIDGE = 1, TUNNEL = 2;
/** price of crossing the other network (road over rail / rail over road), metres; clearance under a bridge, metres */
const CROSS = 120, CLEAR = 6;
/** keep-away band around the other network, metres */
const BAND = 20;
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
    /** 2 on / 1 next to a road (any class) or a rail: the other network keeps away, crossing costs `CROSS` */
    readonly nearRoad: Uint8Array;
    readonly nearRail: Uint8Array;
    /** bridge deck height over a node (NaN none), tunnel on a node */
    readonly deck: Float32Array;
    readonly tunnel: Uint8Array;

    constructor(readonly grid: Grid, public greed = 1.3) {
        const n = grid.m * grid.m;
        this.used = new Uint8Array(n);
        this.rail = new Uint8Array(n);
        this.nearRoad = new Uint8Array(n);
        this.nearRail = new Uint8Array(n);
        this.deck = new Float32Array(n).fill(NaN);
        this.tunnel = new Uint8Array(n);
    }

    reset() { for (const a of [this.used, this.rail, this.nearRoad, this.nearRail, this.tunnel]) a.fill(0); this.deck.fill(NaN); }

    options(from: number, to: number, c: ClassOptions, rank: number, isRail = false): GridOptions {
        const { m, cell, height, water } = this.grid, used = isRail ? this.rail : this.used, edge = 2;
        const turnCost = c.turn * 16 / HEADINGS;
        const other = isRail ? this.nearRoad : this.nearRail, own = isRail ? this.nearRail : this.nearRoad, deck = this.deck, shore = this.grid.shore;
        // states (node * HEADINGS + heading) reached by a jump: the way goes on straight-ish from there
        const landed = new Set<number>();
        // sharpest turn on one node (heading steps of 22.5°): big roads never turn on the spot, the fillets need room
        const maxTurn = c.minRadius >= 100 ? 1 : c.minRadius >= 40 ? 2 : c.minRadius >= 20 ? 4 : 6;
        const cost = (f: number, t: number, _h: number, previous: number, turn: number) => {
            if (turn > maxTurn) return Infinity;
            if (turn > 1 && previous >= 0 && landed.has(f * HEADINGS + previous)) return Infinity;
            const ti = t % m, tj = (t / m) | 0;
            if (water[t] || ti < edge || tj < edge || ti >= m - edge || tj >= m - edge) return Infinity;
            // under a bridge only with clearance
            if (deck[t] - height[t] < CLEAR) return Infinity;
            const dx = ti - f % m, dz = tj - ((f / m) | 0);
            // a long (knight) move passes two cells on its way: they count too (no slipping between blocked nodes)
            let mid = -1, mid2 = -1;
            if (Math.abs(dx) === 2 || Math.abs(dz) === 2)
            {
                const fi = f % m, fj = (f / m) | 0;
                mid = (fj + Math.trunc(dz / 2)) * m + fi + Math.trunc(dx / 2);
                mid2 = (fj + Math.sign(dz)) * m + fi + Math.sign(dx);
                for (const q of [mid, mid2]) if (water[q] || deck[q] - height[q] < CLEAR) return Infinity;
            }
            else if (dx && dz)
            {
                // a diagonal move between two cells of a way crosses it without a node: not allowed (cross on its node,
                // that is a junction / a level crossing)
                mid = f + dx; mid2 = f + dz * m;
            }
            if (mid >= 0 && !used[f] && !used[t] && used[mid] && used[mid2]) return Infinity;
            const len = Math.hypot(dx, dz) * cell, grade = Math.abs(height[t] - height[f]) / len, r = grade / c.maxGrade;
            let k = 1 + c.climb * r * r;
            if (r > 1) k += 40 * (r - 1);
            if (used[t] >= rank) k *= c.reuse;
            // keep off the river banks
            if (shore[t]) k *= 3;
            // the other network: cross it (a fixed price, so crossings are short and square), never run along it
            let extraCost = 0;
            const o = Math.max(other[t], mid >= 0 ? Math.max(other[mid], other[mid2]) : 0);
            if (o === 2) extraCost += CROSS;
            else if (o === 1) k *= 3;
            // own network nodes beside a way we don't ride: no parallel twins (rail too: one track, not two side by side)
            if (own[t] === 1 && used[t] < rank) k *= 4;
            // sharp turns cost more than gentle ones (a 90° bend is far dearer than four 22.5° ones)
            return len * k + (turn + turn * turn * .5) * turnCost + extraCost;
        };
        type Push = (to: number, heading: number, cost: number, tag: number) => void;
        // jumps may start up to one heading step off the way the route came in (so it never loops round to line up)
        const extra = (node: number, heading: number, push: Push) => {
            if (heading < 0) return;
            for (const turn of [0, 1, -1]) jumps(node, (heading + turn + HEADINGS) % HEADINGS, (to, h, cost, tag) => { landed.add(to * HEADINGS + h); push(to, h, cost + Math.abs(turn) * 1.5 * turnCost, tag); });
        };
        const jumps = (from: number, heading: number, push: Push) => {
            const [dx, dz] = DIRS[heading], fi = from % m, fj = (from / m) | 0, unit = Math.hypot(dx, dz) * cell;
            const cellAt = (s: number) => { const x = fi + dx * s, z = fj + dz * s; return x < 2 || z < 2 || x >= m - 2 || z >= m - 2 ? -1 : z * m + x; };
            // a jump starts and ends on `run` cells of straight dry ground (roads meet bridges / tunnels straight)
            const run = runout(c, cell), lead = run * unit;
            // `cut`: tunnels may run in / out through a cutting (ground higher than the way)
            const straightGround = (s0: number, y: number, cut = false) => {
                for (let q = 1; q <= run; q++)
                {
                    const k = cellAt(s0 + q);
                    if (k < 0 || water[k] || this.tunnel[k] || !Number.isNaN(this.deck[k])) return false;
                    const dy = height[k] - y, g = c.maxGrade * unit * q + 2;
                    if (dy < -g || (!cut && dy > g)) return false;
                }
                return true;
            };
            const leadFlat = straightGround(0, height[from]), leadCut = leadFlat || straightGround(0, height[from], true);
            if (!leadCut) return;
            const node = cellAt(run), i = node % m, j = (node / m) | 0, h0 = leadFlat ? height[node] : height[from];
            const at = (s: number) => cellAt(run + s);
            const a1 = at(1), a2 = at(2);
            if (a1 < 0 || a2 < 0) return;
            const land = (s: number, y: number, cut = false) => straightGround(run + s, y, cut) ? at(s + run) : -1;
            // bridge: water ahead or a valley
            if (leadFlat && c.bridge.max > 0 && (water[a1] || (c.bridge.valley > 0 && height[a2] < h0 - 10)))
            {
                let wet = false, low = Infinity, wetRun = 0, dryAfter = false;
                // water across the line at a wet cell (both sides, cells): a crossing is short along, wide across
                const across = (s: number) => {
                    let n = 0;
                    for (const side of [1, -1]) for (let q = 1; q <= 12; q++)
                    {
                        const x = i + dx * s - dz * q * side, z = j + dz * s + dx * q * side;
                        if (x < 0 || z < 0 || x >= m || z >= m || !water[z * m + x]) break;
                        n++;
                    }
                    return n;
                };
                for (let s = 1; s * unit <= c.bridge.max; s++)
                {
                    const k = at(s);
                    if (k < 0 || !Number.isNaN(this.deck[k])) break;
                    if (water[k])
                    {
                        // one crossing only, and not along the water (a river running beside the line)
                        if (dryAfter) break;
                        wet = true; wetRun++;
                        if (wetRun > 2 && across(s - (wetRun >> 1)) < wetRun - 1) break;
                        continue;
                    }
                    if (wet) dryAfter = true;
                    low = Math.min(low, height[k]);
                    if (s < 2) continue;
                    const len = s * unit, end = height[k];
                    // over water, or a valley at least `valley` m deep
                    if ((wet || (c.bridge.valley > 0 && low < Math.min(h0, end) - c.bridge.valley)) && Math.abs(end - h0) / len <= c.maxGrade)
                    {
                        // no straight landing here: try a little further
                        const l = land(s, end);
                        if (l < 0) continue;
                        push(l, heading, len * c.bridge.cost + 2 * lead, BRIDGE);
                        break;
                    }
                }
            }
            // tunnel: ground ahead rises steeply
            const a3 = at(3);
            if (c.tunnel.max > 0 && a3 >= 0 && Math.max(height[a2], height[a3]) > h0 + 6)
            {
                for (let s = 3; s * unit <= c.tunnel.max; s++)
                {
                    const k = at(s);
                    if (k < 0 || water[k] || this.tunnel[k] || !Number.isNaN(this.deck[k])) break;
                    const len = s * unit, end = height[k];
                    if (Math.abs(end - h0) / len > c.maxGrade) continue;
                    // covered along the middle
                    let covered = true;
                    for (let q = 1; q < s && covered; q++) { const t = q / s; if (height[at(q)] < h0 + (end - h0) * t + (t > .15 && t < .85 ? c.tunnel.cover : 0)) covered = false; }
                    if (covered) { const l = land(s, end, true); if (l < 0) continue; push(l, heading, len * c.tunnel.cost + 2 * lead, TUNNEL); break; }
                }
            }
        };
        return { n: m, headings: HEADINGS, from, to, cost, extra, minCost: cell * Math.min(1, c.reuse * 2), greed: this.greed, limit: m * m * HEADINGS };
    }

    route(from: number, to: number, c: ClassOptions, rank: number, isRail = false): GridResult | null {
        const r = this.search.find(this.options(from, to, c, rank, isRail));
        return r && unloop(r);
    }

    alternatives(from: number, to: number, c: ClassOptions, rank: number, k: number, penalty: number, overlap: number, isRail = false): GridResult[] {
        return alternatives(this.options(from, to, c, rank, isRail), { k, penalty, overlap, spread: 2 }, this.search).map(unloop);
    }

    /** mark a found route as built: its nodes, the nodes under its bridges / tunnels, and the band around it */
    mark(nodes: number[], rank: number, isRail = false, tags: number[] = []) {
        const used = isRail ? this.rail : this.used, near = isRail ? this.nearRail : this.nearRoad, { m, height } = this.grid;
        // band of BAND metres around the way (at least 1 node)
        const r = Math.max(1, Math.round(BAND / this.grid.cell));
        const on = (k: number) => {
            near[k] = 2;
            const i = k % m, j = (k / m) | 0;
            for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++)
            {
                const x = i + a, z = j + b;
                if (x < 0 || z < 0 || x >= m || z >= m || a * a + b * b > r * r) continue;
                if (near[z * m + x] < 1) near[z * m + x] = 1;
            }
        };
        nodes.forEach((k, s) => {
            if (used[k] < rank) used[k] = rank;
            on(k);
            if (!s || !tags[s]) return;
            // a jump: every node on the straight line between its ends
            const a = nodes[s - 1], ai = a % m, aj = (a / m) | 0, bi = k % m, bj = (k / m) | 0, steps = Math.max(Math.abs(bi - ai), Math.abs(bj - aj));
            for (let q = 1; q < steps; q++)
            {
                const t = q / steps, x = Math.round(ai + (bi - ai) * t), z = Math.round(aj + (bj - aj) * t), node = z * m + x;
                // a node wide each side, so lines at an angle can't slip between marked nodes
                for (const o of [0, 1, -1, m, -m])
                {
                    const q = node + o;
                    if (q < 0 || q >= near.length) continue;
                    if (tags[s] === BRIDGE) { const y = height[a] + (height[k] - height[a]) * t; this.deck[q] = Number.isNaN(this.deck[q]) ? y : Math.max(this.deck[q], y); }
                    else this.tunnel[q] = 1;
                }
            }
        });
    }
}

/** (node, heading) search may pass a node twice (a loop to turn cheaply): cut the loop out */
function unloop(r: GridResult): GridResult {
    const seen = new Map<number, number>(), nodes: number[] = [], headings: number[] = [], tags: number[] = [];
    r.nodes.forEach((k, i) => {
        const at = seen.get(k);
        if (at !== undefined)
        {
            for (let q = at + 1; q < nodes.length; q++) seen.delete(nodes[q]);
            nodes.length = headings.length = tags.length = at + 1;
            return;
        }
        seen.set(k, nodes.length);
        nodes.push(k); headings.push(r.headings[i]); tags.push(r.tags[i]);
    });
    return { ...r, nodes, headings, tags };
}
