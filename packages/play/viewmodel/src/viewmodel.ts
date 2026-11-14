import { compose, direction, mat4, mix, multiply, point, smooth, type Mat4, type Vec3 } from "./math";
import { Spring } from "./spring";
import type { Hold, Motion } from "./types";

/**
 * A held gun (or anything) in front of the eye: at the hip pointing at the middle of the view far ahead, or up
 * at the eye with the sight on the middle. It lags behind turns and steps (springs), bobs with the stride,
 * breathes, kicks on a shot, dips on landing, goes down for a reload and across the chest at a sprint.
 * Everything in camera space (eye at 0, -z ahead); `world(camera)` for the world.
 */
export class ViewModel {
    /** item model space -> camera space */
    readonly matrix: Mat4 = mat4();
    /** the view's own recoil to add to the camera this frame: [pitch up, yaw], radians (springs back) */
    readonly view: [number, number] = [0, 0];
    /** a time base for the idle sway */
    clock = 0;
    private hold: Hold;
    /** lag of the gun behind the view: yaw, pitch, roll */
    private turn = new Spring(3, 90, 13);
    /** lag of the position: x, y, z */
    private shift = new Spring(3, 110, 15);
    /** the shot's kick: pitch, yaw, back (z) */
    private kickSpring = new Spring(3, 380, 26);
    private viewSpring = new Spring(2, 160, 20);
    private stride = 0;
    private aimed = 0;

    constructor(hold: Hold) {
        this.hold = hold;
    }

    /** another item in hand (keeps the springs going) */
    set(hold: Hold) { this.hold = hold; }
    get current() { return this.hold; }

    /** A shot: `kick` radians the muzzle jumps up, `side` either way (from `Gun.recoil()`). */
    fire(recoil: { kick: number; side: number }) {
        const w = this.hold.weight ?? 1, a = this.aimed;
        this.kickSpring.kick(recoil.kick * 30 / w, recoil.side * 18 / w, (.6 - a * .25) / w);
        this.viewSpring.kick(recoil.kick * 14, recoil.side * 6);
    }

    update(dt: number, m: Motion) {
        this.clock += dt;
        const h = this.hold, w = h.weight ?? 1;
        const a = smooth(Math.max(0, Math.min(1, m.aimed)));
        this.aimed = a;
        // turning: the gun stays behind a little (less aimed: the shoulder holds it)
        const lag = (.25 - a * .17) / w;
        this.turn.value[0] -= Math.max(-.06, Math.min(.06, m.yaw * lag));
        this.turn.value[1] -= Math.max(-.06, Math.min(.06, m.pitch * lag));
        this.turn.value[2] += Math.max(-.05, Math.min(.05, m.yaw * lag * .8));
        this.shift.value[0] += Math.max(-.02, Math.min(.02, m.yaw * .04 * (1 - a * .7)));
        this.shift.value[1] += Math.max(-.02, Math.min(.02, m.pitch * .04 * (1 - a * .7)));
        if (m.landed) { this.shift.kick(0, -Math.min(m.landed, 10) * .05, 0); this.turn.kick(0, -Math.min(m.landed, 10) * .06, 0); }
        // strafing leans it
        this.turn.target[2] = -(m.strafe ?? 0) * .012 * (1 - a * .6);
        this.turn.stiffness = 90 * w ** -.5;
        this.turn.update(dt); this.shift.update(dt); this.kickSpring.update(dt); this.viewSpring.update(dt);
        this.view[0] = this.viewSpring.value[0]; this.view[1] = this.viewSpring.value[1];

        // stride bob, the breath
        const walk = m.grounded ? Math.min(1, m.speed / 4.5) : 0;
        this.stride += dt * (m.grounded ? m.speed : 0) * 1.25;
        const bob = walk * (1 - a * .82), t = this.clock, breath = (1 + (m.shake ?? 0) * 5) * (1 - a * .55) / w;
        const sprint = m.sprint && a < .1 ? 1 : 0;
        this.sprinting += (sprint - this.sprinting) * (1 - Math.exp(-dt * 8));
        const reload = m.reload !== undefined && m.reload >= 0 ? Math.sin(Math.min(1, m.reload) * Math.PI) : 0;
        this.lowered += (reload - this.lowered) * (1 - Math.exp(-dt * 10));
        const low = this.lowered, run = this.sprinting;

        const ox = Math.cos(this.stride) * .014 * bob + Math.sin(t * 1.1) * .0025 * breath;
        const oy = -Math.abs(Math.sin(this.stride)) * .02 * bob + Math.sin(t * 1.7) * .002 * breath - low * .07 - run * .06;
        const oz = this.kickSpring.value[2] * .06 + low * .03;
        const yaw = Math.sin(t * .8) * .004 * breath + this.kickSpring.value[1] * .03 + run * .7 * (h.fore ? 1 : .4);
        const pitch = Math.sin(t * 1.3 + 1) * .004 * breath + this.kickSpring.value[0] * .03 + low * .35 - run * .25;
        const roll = Math.cos(this.stride) * .03 * bob - low * .55 + run * .35;

        // hip: grip at `hip`, the bore at the middle `converge` ahead; aimed: the sight on the eye line
        const converge = h.converge ?? 30;
        const hipYaw = Math.atan2(h.hip[0], converge), hipPitch = Math.atan2(-h.hip[1], converge);
        const aimAt: Vec3 = [0, 0, -h.eye];
        const P: Vec3 = [mix(h.hip[0], aimAt[0], a), mix(h.hip[1], aimAt[1], a), mix(h.hip[2], aimAt[2], a)];
        const pivot: Vec3 = [mix(h.grip[0], h.sight[0], a), mix(h.grip[1], h.sight[1], a), mix(h.grip[2], h.sight[2], a)];
        const R = compose(mat4(), 0, 0, 0,
            hipYaw * (1 - a) + this.turn.value[0] + yaw,
            hipPitch * (1 - a) + this.turn.value[1] + pitch,
            this.turn.value[2] + roll);
        const T = compose(mat4(), P[0] + this.shift.value[0] + ox, P[1] + this.shift.value[1] + oy, P[2] + this.shift.value[2] + oz);
        const back = compose(mat4(), -pivot[0], -pivot[1], -pivot[2]);
        multiply(this.matrix, T, multiply(mat4(), R, back));
    }
    private sprinting = 0;
    private lowered = 0;

    /** camera space: where the bullet leaves and the way the bore points (unit) */
    get muzzle(): { from: Vec3; direction: Vec3 } {
        const d = direction(this.matrix, [0, 0, -1]), l = Math.hypot(...d);
        return { from: point(this.matrix, this.hold.muzzle), direction: [d[0] / l, d[1] / l, d[2] / l] };
    }

    /** camera space: where the hands go (fore: none for one handed) */
    get hands(): { grip: Vec3; fore?: Vec3 } {
        return { grip: point(this.matrix, this.hold.grip), fore: this.hold.fore ? point(this.matrix, this.hold.fore) : undefined };
    }

    /** the item's world matrix for a camera's world matrix */
    world(camera: ArrayLike<number>, out: Mat4 = mat4()) {
        return multiply(out, camera, this.matrix);
    }
}
