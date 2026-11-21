import type { Random } from "@papit/random";
import { rect } from "./yard";
import { trail } from "./paths";
import type { FarmGround, FarmLayout, FarmOptions, Line } from "./types";

/** the lived in bits: door clutter, stacks on barn sides, carts, a lamp, the sign, sheaves, and the farmer's view spot */
export function dress(layout: FarmLayout, ground: FarmGround, o: FarmOptions, rnd: Random) {
    const P = o.props, { cells } = layout;
    const solid: Line[] = layout.buildings.map(b => rect(b.x, b.z, b.w, b.d, b.yaw, .4));
    const spots: { x: number; z: number; r: number }[] = [];
    const inside = (p: Line, x: number, z: number) => {
        let k = false;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) k = !k; }
        return k;
    };
    const near = (l: Line, x: number, z: number, d: number) => {
        for (let i = 1; i < l.length; i++) {
            const [ax, az] = l[i - 1], [bx, bz] = l[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
            if (Math.hypot(x - ax - dx * t, z - az - dz * t) < d) return true;
        }
        return false;
    };
    const free = (x: number, z: number, r: number) =>
        !solid.some(s => inside(s, x, z)) && !spots.some(s => Math.hypot(s.x - x, s.z - z) < s.r + r)
        && !layout.fences.some(f => near(f, x, z, r + .3)) && !layout.paths.some(p => near(p.line, x, z, p.width / 2 + r * .5))
        && !(ground.water?.(x, z));
    const put = (asset: string, x: number, z: number, yaw: number, r: number, scale = 1, force = false) => {
        if (!force && !free(x, z, r)) return false;
        spots.push({ x, z, r });
        layout.props.push({ asset, x, z, yaw, scale });
        return true;
    };
    const pick = <T>(l: T[]) => l[rnd.int(0, l.length)];

    // buildings: clutter by the door (court side), stacks along a side
    for (const b of layout.buildings) {
        if (b.w < 4) continue;
        const front = b.yaw - (o.yard.pieces.find(p => b.asset.endsWith(p.asset))?.front ?? 0);
        const fx = Math.cos(front), fz = Math.sin(front), sx = -fz, sz = fx;
        const n = rnd.int(1, 4);
        for (let k = 0; k < n; k++) {
            const side = (rnd.chance(.5) ? 1 : -1) * (b.d / 2 - rnd.float(.2, 1)), out = b.w / 2 + rnd.float(.5, 1.2);
            put(pick(P.door), b.x + fx * out + sx * side, b.z + fz * out + sz * side, rnd.float(0, 6.28), .4);
        }
        // a stack against one side wall
        const s = rnd.chance(.5) ? 1 : -1, asset = pick(P.stack), r = asset.endsWith("hay") ? 1.1 : .7;
        for (let k = 0, m = rnd.int(1, 4); k < m; k++) {
            const along = rnd.float(-b.w / 2 + r, b.w / 2 - r), out = b.d / 2 + r + .2;
            put(asset, b.x + fx * along + sx * s * out, b.z + fz * along + sz * s * out, front + rnd.float(-.2, .2), r);
        }
    }
    const court = layout.court;
    if (court) {
        // well bucket, a lamp at the court, a cart or the washing line at its edge
        const well = layout.buildings.find(b => b.asset === "Well");
        if (well) put(pick(P.well), well.x + 1.2, well.z + .4, rnd.float(0, 6.28), .3);
        for (let k = 0; k < 8; k++) {
            const a = court.yaw + Math.PI / 4 + (k % 4) * Math.PI / 2;
            if (put(P.lamp, court.x + Math.cos(a) * 7.5, court.z + Math.sin(a) * 7.5, a, .3)) break;
        }
        for (const asset of P.court) for (let k = 0; k < 12; k++) {
            const a = rnd.float(0, 6.28), d = rnd.float(9, 16);
            if (put(asset, court.x + Math.cos(a) * d, court.z + Math.sin(a) * d, a + Math.PI / 2, asset.includes("cart") ? 1.8 : 1.6)) break;
        }
    }
    // the sign where the lane meets the road
    const e = layout.area.entry, lane = layout.paths.find(p => p.kind === "lane");
    if (e && lane) {
        const l = lane.line, [ax, az] = l[l.length - 2] ?? l[0], [bx, bz] = l[l.length - 1], dir = Math.atan2(bz - az, bx - ax);
        const side = lane.width / 2 + .8;
        put(P.sign, bx - Math.cos(dir) * 4 - Math.sin(dir) * side, bz - Math.sin(dir) * 4 + Math.cos(dir) * side, dir, .4, 1, true);
    }
    // sheaves in a few wheat fields: little rows along the near edge; bales by pasture gates
    for (const f of [] as typeof layout.fields) {
        if (f.crop !== "wheat" || !rnd.chance(.4)) continue;
        const c = cells[f.cells[rnd.int(0, f.cells.length)]];
        const [[ax, az], [bx, bz]] = c.corners, dir = Math.atan2(bz - az, bx - ax);
        for (let k = 0; k < 6; k++) put(P.sheaf, c.x + Math.cos(dir) * (k - 2.5) * 1.6, c.z + Math.sin(dir) * (k - 2.5) * 1.6, rnd.float(0, 6.28), .3);
    }
    for (const g of layout.gates.slice(0, 6)) for (let k = 0; k < 3; k++) put(P.feed, g[0] + rnd.float(-4, 4), g[1] + rnd.float(-4, 4), rnd.float(0, 6.28), .6);
    // wood pile at the wood edge nearest the court
    if (court) {
        let best = -1, bd = Infinity;
        for (const c of cells) if (c.zone === "wood" && c.inside) { const d = Math.hypot(c.x - court.x, c.z - court.z); if (d < bd) { bd = d; best = c.id; } }
        if (best >= 0) { const c = cells[best]; for (const asset of P.wood) put(asset, c.x + rnd.float(-3, 3), c.z + rnd.float(-3, 3), rnd.float(0, 6.28), 1); }
    }
    view(layout, ground, put, rnd, o);
}

/** the farmer's bench: the cell that looks out the most (higher than its surroundings, open downhill), a log facing the drop */
function view(layout: FarmLayout, ground: FarmGround, put: (a: string, x: number, z: number, yaw: number, r: number, s?: number, force?: boolean) => boolean, rnd: Random, o: FarmOptions) {
    const { cells } = layout, court = layout.court, P = o.props.view;
    if (!court) return;
    let best = -1, bs = -Infinity, look = 0;
    for (const c of cells) {
        if (!c.inside || c.water || c.blocked || c.zone === "yard" || c.zone === "field" || c.zone === "pasture") continue;
        // nothing fenced right in front: no fence within 8 m
        if (layout.fences.some(f => f.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < 8))) continue;
        const d = Math.hypot(c.x - court.x, c.z - court.z);
        if (d < 30) continue;
        // sample the drop in 8 directions at 40 m: the deepest one is the view
        let drop = -Infinity, dir = 0;
        for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4, h = ground.height(c.x + Math.cos(a) * 40, c.z + Math.sin(a) * 40);
            if (c.y - h > drop) { drop = c.y - h; dir = a; }
        }
        const s = drop + c.y * .2 - d * .02 - c.slope * 20;
        if (s > bs) { bs = s; best = c.id; look = dir; }
    }
    if (best < 0) return;
    const c = cells[best], fx = Math.cos(look), fz = Math.sin(look);
    // the log lies across the view, the stump at its end with a lantern, a fire pit in front
    put(P.seat, c.x, c.z, look + Math.PI / 2, 1.5, 1, true);
    put(P.side, c.x - fz * 2.2, c.z + fx * 2.2, rnd.float(0, 6.28), .6, 1, true);
    put(P.light, c.x - fz * 2.2, c.z + fx * 2.2, 0, .1, 1, true);
    layout.props[layout.props.length - 1].lift = .55;
    put(P.fire, c.x + fx * 2.2, c.z + fz * 2.2, rnd.float(0, 6.28), .7, 1, true);
    layout.view = { x: c.x, z: c.z, yaw: look };
    trail(layout, [c.x - fx * 1.5, c.z - fz * 1.5], o);
}
