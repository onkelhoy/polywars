import { Box, RigidBody, type World } from "@papit/rigidbody";
import type { Solid, SolidSource } from "./types";

/** the solids near some points as static bodies in a world; ones left behind leave it */
export class NearSolids {
    /** the bodies in the world now (wheel casts use these) */
    bodies: RigidBody[] = [];
    private near = new Map<Solid, RigidBody>();
    private found = new Set<Solid>();

    constructor(private world: World, private source?: SolidSource) { }

    /** keep the solids within ~8 m of each x / z pair */
    gather(points: ArrayLike<number>[]) {
        const src = this.source;
        if (!src) return;
        const found = this.found, R = 4;
        found.clear();
        for (const p of points)
        {
            const x = p[0], z = p[2];
            if (typeof src === "function") { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of src(x + i * R, z + j * R)) found.add(s); }
            else for (const s of src) if (s.max[0] > x - 2 * R && s.min[0] < x + 2 * R && s.max[2] > z - 2 * R && s.min[2] < z + 2 * R) found.add(s);
        }
        let changed = false;
        for (const [s, b] of this.near) if (!found.has(s)) { this.world.remove(b); this.near.delete(s); changed = true; }
        for (const s of found) if (!this.near.has(s))
        {
            const { min, max } = s;
            this.near.set(s, this.world.add(new RigidBody({
                shape: new Box(Math.max(.02, max[0] - min[0]), Math.max(.02, max[1] - min[1]), Math.max(.02, max[2] - min[2])),
                position: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
            })));
            changed = true;
        }
        if (changed) this.bodies = [...this.near.values()];
    }
}
