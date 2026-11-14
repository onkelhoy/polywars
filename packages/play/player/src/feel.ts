import { AudioMixer } from "@papit/audio";
import { World } from "@papit/rigidbody";
import { Debris, cylinderAlongZ, type Piece } from "@polywar/debris";
import { Matrix4 } from "@papit/matrix";
import { Model, type Renderer } from "@polywar/renderer";
import { direction, point, type Vec3 } from "@polywar/viewmodel";
import { WeaponAudio } from "@polywar/weapon-audio";
import type { Cue, Gun } from "@polywar/weapons";

/** a case model and its body */
type Case = { model: Model; shape: ReturnType<typeof cylinderAlongZ>["shape"]; local: Float32Array; size: number };

export type FeelSetting = {
    world?: World;
    mixer?: AudioMixer;
    ground: (x: number, z: number) => number;
    cast: (from: Vec3, to: Vec3) => { point: Vec3 } | null;
    /** what a case landed on, for its sound ("dirt", "stone", "wood", "metal") */
    surface?: (at: Vec3) => string;
    assets: string;
};

/** where the gun is now: its world matrix (model space -> world), the muzzle (world), the shooter's velocity */
export type GunPlace = { world: ArrayLike<number>; muzzle: Vec3; velocity: Vec3; eject?: Vec3 };

/**
 * Gun feel: the gun's cues (`Gun.oncue`) as sounds (`@polywar/weapon-audio`) and thrown cases
 * (`@polywar/debris` in a `@papit/rigidbody` world). Glue only: the packages do the work.
 */
export class Feel {
    readonly world: World;
    readonly mixer: AudioMixer;
    readonly audio: WeaponAudio;
    readonly debris: Debris;
    /** steps `world` itself (it made it); a host's world is stepped by the host */
    private owns: boolean;
    private cases = new Map<string, Promise<Case | undefined>>();
    private ready = new Map<string, Case>();
    private m = Matrix4.create();

    constructor(readonly setting: FeelSetting) {
        this.owns = !setting.world;
        this.world = setting.world ?? new World();
        this.mixer = setting.mixer ?? new AudioMixer();
        this.audio = new WeaponAudio({ mixer: this.mixer, base: `${setting.assets}/audio/effects/weapons/`, cast: setting.cast });
        this.debris = new Debris({
            world: this.world, ground: setting.ground,
            onland: (p, speed, at) => {
                const size = (p.data as Case | undefined)?.size ?? 1;
                this.audio.brass(setting.surface?.(at) ?? "dirt", at, size, Math.min(1, .25 + speed / 4));
            },
        });
        void this.audio.load("brass");
    }

    /** loads a gun's sounds and case */
    async load(gl: WebGL2RenderingContext, gun: Gun) {
        await Promise.all([this.audio.load(gun.spec.model), this.caseOf(gl, gun.caliber.model)]);
    }

    private caseOf(gl: WebGL2RenderingContext, id: string) {
        let loading = this.cases.get(id);
        if (!loading)
        {
            loading = Model.load(gl, `${this.setting.assets}/models/weapons/ammo/${id}/case.glb`).then(model => {
                const length = -model.bounds.min[2], radius = model.bounds.max[0];
                const c = { model, ...cylinderAlongZ(length, radius), size: length / .063 };
                this.ready.set(id, c);
                return c;
            }).catch(() => undefined);
            this.cases.set(id, loading);
        }
        return loading;
    }

    /** a cue of the held gun at `place` */
    cue(cue: Cue, gun: Gun, place: GunPlace) {
        const set = gun.spec.model, w = place.world, at = point(w, [0, 0, 0]);
        if (cue === "shot") this.audio.shot(set, place.muzzle);
        else if (cue === "eject") this.eject(gun, place);
        else this.audio.part(set, cue, at);
    }

    /** a case out of the port: right, up, a little back, spinning, plus the shooter's own speed */
    private eject(gun: Gun, place: GunPlace) {
        const c = this.ready.get(gun.caliber.model);
        if (!c) return;
        const w = place.world, r = () => Math.random() * 2 - 1;
        const from = point(w, place.eject ?? [.02, .05, -.1]);
        const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
        const right = unit(direction(w, [1, 0, 0])), up = unit(direction(w, [0, 1, 0])), back = unit(direction(w, [0, 0, 1]));
        const pistol = gun.spec.kind === "pistol", out = (pistol ? 2.2 : 3) + r() * .5, lift = 1.6 + r() * .4, rear = .4 + r() * .3;
        const v = place.velocity;
        const velocity: Vec3 = [0, 1, 2].map(k => right[k] * out + up[k] * lift + back[k] * rear + v[k]) as Vec3;
        // lies along the bore: body +y (the case's -z) along the gun's -z
        const rotation = quaternion([right, [-back[0], -back[1], -back[2]], up]);
        this.debris.spawn("case", {
            shape: c.shape, local: c.local, mass: .012 * c.size, position: from, velocity, rotation, data: c,
            angularVelocity: [0, 1, 2].map(k => up[k] * (12 + r() * 6) + right[k] * r() * 15) as Vec3,
        });
    }

    /** every frame: the ear at the camera, physics, debris */
    update(dt: number, ear: Vec3, forward: Vec3) {
        this.audio.setListener(ear, forward);
        if (this.owns) this.world.update(dt);
        this.debris.update(dt);
    }

    /** the cases (world pass) */
    draw(renderer: Renderer) {
        for (const p of this.debris.pieces as Piece[])
        {
            const c = p.data as Case | undefined;
            if (c) c.model.draw(renderer, this.debris.matrix(p, this.m));
        }
    }

    destroy() {
        this.debris.clear();
        for (const c of this.ready.values()) c.model.destroy();
    }
}

/** quaternion [x, y, z, w] of a rotation given by its columns (unit x, y, z axes) */
function quaternion([x, y, z]: Vec3[]): [number, number, number, number] {
    const m00 = x[0], m11 = y[1], m22 = z[2], trace = m00 + m11 + m22;
    if (trace > 0)
    {
        const s = Math.sqrt(trace + 1) * 2;
        return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4];
    }
    if (m00 > m11 && m00 > m22)
    {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
    }
    if (m11 > m22)
    {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
    }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
}
