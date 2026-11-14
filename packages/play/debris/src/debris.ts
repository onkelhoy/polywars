import { Capsule, Hull, RigidBody } from "@papit/rigidbody";
import type { DebrisOptions, Piece, SpawnOptions, Vec3 } from "./types";

/**
 * Small bits (spent cases, chips) as `@papit/rigidbody` bodies in the host's world. A piece flies, lands
 * (`onland`, once), and when it sleeps it leaves the world and lies still as a drawn transform (no cost).
 * More than `cap`, or older than `life`: the oldest shrink away. Ground comes from the host's height function
 * as static tiles made only under pieces still moving.
 */
export class Debris {
    readonly pieces: Piece[] = [];
    private tiles = new Map<string, { body: RigidBody; used: boolean }>();
    private touching = new Set<RigidBody>();
    private last = new Map<RigidBody, number>();

    constructor(readonly options: DebrisOptions) { }

    spawn(kind: string, o: SpawnOptions): Piece {
        const r = o.rotation;
        const body = new RigidBody({
            shape: o.shape, mass: o.mass,
            position: { x: o.position[0], y: o.position[1], z: o.position[2] },
            velocity: o.velocity && { x: o.velocity[0], y: o.velocity[1], z: o.velocity[2] },
            angularVelocity: o.angularVelocity && { x: o.angularVelocity[0], y: o.angularVelocity[1], z: o.angularVelocity[2] },
            rotation: r && { x: r[0], y: r[1], z: r[2], w: r[3] },
            friction: o.friction ?? .6, restitution: o.restitution ?? .25, angularDamping: .4, linearDamping: .05,
        });
        this.options.world.add(body);
        const piece: Piece = { kind, body, local: o.local, data: o.data, age: 0, rolling: 0, settled: false, landed: false, scale: 1, fading: false };
        this.pieces.push(piece);
        const over = this.pieces.length - (this.options.cap ?? 80);
        for (let i = 0, n = 0; i < this.pieces.length && n < over; i++) if (!this.pieces[i].fading) { this.pieces[i].fading = true; n++; }
        return piece;
    }

    /** after `world.update(dt)`: landings, settling, ground tiles, fading */
    update(dt: number) {
        const { world, ground } = this.options, life = this.options.life ?? 40, fade = this.options.fade ?? 1.5;
        // who touches what this step
        this.touching.clear();
        for (const c of world.contacts) if (c.count) { this.touching.add(c.a); this.touching.add(c.b); }
        for (const t of this.tiles.values()) t.used = false;
        for (let i = this.pieces.length - 1; i >= 0; i--)
        {
            const p = this.pieces[i], b = p.body;
            p.age += dt;
            if (p.age > life) p.fading = true;
            if (p.fading) p.scale -= dt / fade;
            if (p.scale <= 0)
            {
                if (!p.settled) world.remove(b);
                this.pieces.splice(i, 1);
                continue;
            }
            if (p.settled) continue;
            const v = b.velocity, speed = Math.hypot(v.x, v.y, v.z);
            if (!p.landed && this.touching.has(b))
            {
                p.landed = true;
                // a case has a rim and a neck: it rolls in a curve and stops, not on and on like a tube
                b.angularDamping = this.options.roll ?? 5;
                b.linearDamping = .8;
                this.options.onland?.(p, this.last.get(b) ?? speed, [b.position.x, b.position.y, b.position.z]);
            }
            this.last.set(b, speed);
            // through the ground (a thin tile missed): put it on top
            if (ground)
            {
                const h = ground(b.position.x, b.position.z);
                if (b.position.y < h - .05) { b.position.y = h + .01; b.velocity.y = 0; }
            }
            // asleep, or a slow roll a while after landing (a slope would keep a capsule going for ever)
            if (p.landed) p.rolling += dt;
            if (b.sleeping || p.rolling > 4 || p.rolling > 1.5 && speed < .3) { this.settle(p); continue; }
            if (ground) this.ground(b.position.x, b.position.z);
        }
        // tiles nobody moving stands over any more
        for (const [key, t] of this.tiles) if (!t.used) { world.remove(t.body); this.tiles.delete(key); }
    }

    private settle(p: Piece) {
        p.settled = true;
        this.options.world.remove(p.body);
        this.last.delete(p.body);
    }

    /** the 3 x 3 tiles round (x, z) */
    private ground(x: number, z: number) {
        const s = this.options.tile ?? 1, g = this.options.ground!, ci = Math.floor(x / s), cj = Math.floor(z / s);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++)
        {
            const key = `${i},${j}`;
            let t = this.tiles.get(key);
            if (!t)
            {
                const x0 = i * s, z0 = j * s, h = [g(x0, z0), g(x0 + s, z0), g(x0, z0 + s), g(x0 + s, z0 + s)];
                const top = [[0, h[0], 0], [s, h[1], 0], [0, h[2], s], [s, h[3], s]], low = Math.min(...h) - .5;
                const points = [...top, ...top.map(([a, , c]) => [a, low, c])].map(([a, b, c]) => ({ x: a, y: b, z: c }));
                t = { body: new RigidBody({ shape: new Hull(points), position: { x: x0, y: 0, z: z0 }, friction: .8 }), used: true };
                this.options.world.add(t.body);
                this.tiles.set(key, t);
            }
            t.used = true;
        }
    }

    /** a piece's model matrix (column-major) into `out`: body x `local`, shrunk while fading */
    matrix<T extends Float32Array | Float64Array>(p: Piece, out: T): T {
        p.body.matrix(out);
        if (p.local) multiply(out, p.local, out);
        const s = Math.max(0, p.scale);
        if (s < 1) for (let k = 0; k < 12; k++) out[k] *= s;
        return out;
    }

    /** remove every piece (and its body) */
    clear() {
        for (const p of this.pieces) if (!p.settled) this.options.world.remove(p.body);
        this.pieces.length = 0;
        for (const t of this.tiles.values()) this.options.world.remove(t.body);
        this.tiles.clear();
    }
}

/**
 * A case-like thing: a capsule for a cylinder of `length` lying along model -z from 0 (the glTF cases of
 * `assets/models/weapons/ammo/`), and the `local` that puts the model on it.
 */
export function cylinderAlongZ(length: number, radius: number) {
    const shape = new Capsule(radius, Math.max(0, length - radius * 2));
    // model -z -> body +y, centred
    const local = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, -length / 2, 0, 1]);
    return { shape, local };
}

function multiply(a: ArrayLike<number>, b: ArrayLike<number>, out: Float32Array | Float64Array) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++)
    {
        let v = 0;
        for (let k = 0; k < 4; k++) v += a[k * 4 + row] * b[c * 4 + k];
        r[c * 4 + row] = v;
    }
    out.set(r);
    return out;
}

export type { Vec3 };
