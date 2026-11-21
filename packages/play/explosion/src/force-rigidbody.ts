import { Vector3 } from "@papit/vector";
import type { Target, Vec3 } from "./types";

/** what we need of a `@papit/rigidbody` body */
type Body = {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    angularVelocity: { x: number; y: number; z: number };
    inverseMass: number;
    bounds(min: Vector3, max: Vector3): void;
    wake(): void;
};
/** what we need of a `@papit/rigidbody` world */
type World = {
    bodies: Body[];
    segmentCast(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }): { body: Body; t: number } | null;
};

const min = new Vector3(0, 0, 0), max = new Vector3(0, 0, 0);

/** every moving (or sleeping) body in a rigidbody world as a target: woken, pushed, left to settle */
export function bodyTargets(world: World): Target[] {
    const out: Target[] = [];
    for (const body of world.bodies)
    {
        if (!body.inverseMass) continue;
        body.bounds(min, max);
        out.push({
            position: body.position, mass: 1 / body.inverseMass,
            size: Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * .5,
            push(v: Vec3, spin: Vec3) {
                body.wake();
                body.velocity.x += v[0]; body.velocity.y += v[1]; body.velocity.z += v[2];
                body.angularVelocity.x += spin[0]; body.angularVelocity.y += spin[1]; body.angularVelocity.z += spin[2];
            },
            body,
        } as Target & { body: Body });
    }
    return out;
}

/**
 * Cover by rays through a rigidbody world: something static in the way lets `wall` through (default .15, the blast bends
 * round), something that moves lets `prop` through (default .45: a jeep shields you a bit, and gets pushed itself).
 */
export function worldCover(world: World, wall = .15, prop = .45) {
    return (from: Vec3, to: Vec3, target: Target) => {
        const self = (target as Target & { body?: Body }).body;
        // aim a little over the ground on both ends
        const a = { x: from[0], y: from[1] + .3, z: from[2] }, b = { x: to[0], y: to[1], z: to[2] };
        let k = 1;
        for (let i = 0; i < 3; i++)
        {
            const hit = world.segmentCast(a, b);
            if (!hit || hit.body === self) break;
            k *= hit.body.inverseMass ? prop : wall;
            // past it, look again
            const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1, step = hit.t + .3;
            if (step >= l) break;
            a.x += (b.x - a.x) / l * step; a.y += (b.y - a.y) / l * step; a.z += (b.z - a.z) / l * step;
        }
        return k;
    };
}
