import { World, raycast } from "@papit/rigidbody";
import { Vector3 } from "@papit/vector";
import { NearSolids } from "./solids";
import { Vehicle } from "./vehicle";
import type { DriveInput, Point, SolidSource, VehicleSetting } from "./types";

export type VehiclesSetting = {
    ground: (x: number, z: number) => number;
    solids?: SolidSource;
};

/** what a bullet cast returns: `t` 0..1 along the segment (same shape as `@polywar/ballistics` Hit) */
export type VehicleHit = { t: number; point: Vector3; normal: Vector3; surface: string; vehicle: Vehicle };

const IDLE: DriveInput = { throttle: 0, steer: 0 };

/**
 * Cars in one `@papit/rigidbody` world, so they hit each other (and the solids near any of them).
 * `update(dt, inputs)` steps them all in fixed steps; `cast` lets bullets hit their chassis.
 */
export class Vehicles {
    readonly world = new World({ gravity: { x: 0, y: -9.81, z: 0 }, allowSleep: false });
    readonly list: Vehicle[] = [];
    readonly solids: NearSolids;
    private left = 0;
    private dir = new Vector3(0, 0, 0);

    constructor(readonly setting: VehiclesSetting) {
        this.solids = new NearSolids(this.world, setting.solids);
    }

    add(setting: Omit<VehicleSetting, "ground" | "world" | "solids">, at: Point = [0, 0, 0], yaw = 0) {
        const car = new Vehicle({ ...setting, ground: this.setting.ground, world: this.world }, at, yaw);
        car.solids = this.solids;
        this.list.push(car);
        this.solids.gather(this.list.map(c => c.body.position));
        return car;
    }

    /** steps every car; `inputs` for the driven ones (the rest roll / stand with no throttle) */
    update(dt: number, inputs?: Map<Vehicle, DriveInput>) {
        const step = this.world.timestep;
        this.left += Math.min(dt, .25);
        this.solids.gather(this.list.map(c => c.body.position));
        while (this.left >= step)
        {
            this.left -= step;
            for (const car of this.list) car.drive(step, inputs?.get(car) ?? IDLE);
            this.world.step();
        }
    }

    /** first chassis on the segment from -> to (a box hull: rough), or null */
    cast = (from: ArrayLike<number>, to: ArrayLike<number>): VehicleHit | null => {
        const d = this.dir;
        d[0] = to[0] - from[0]; d[1] = to[1] - from[1]; d[2] = to[2] - from[2];
        const length = d.magnitude;
        if (!length) return null;
        d.divide(length);
        const hit = raycast(this.list.map(c => c.body), { x: from[0], y: from[1], z: from[2] }, d, length);
        if (!hit) return null;
        const vehicle = this.list.find(c => c.body === hit.body)!;
        return { t: hit.t / length, point: new Vector3(hit.point), normal: new Vector3(hit.normal), surface: "metal", vehicle };
    };
}
