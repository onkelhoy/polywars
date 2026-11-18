import { compose, direction, mat4, mix, multiply, point, smooth, type Mat4, type Vec3 } from "./math";
import { Spring } from "./spring";
import type { Hold, Motion } from "./types";

/**
 * A held gun (or anything) in front of the eye: at the hip pointing at the middle of the view far ahead, or up
 * at the eye with the sight on the middle. It lags behind turns and steps (springs), bobs with the stride,
 * breathes, kicks on a shot, dips on landing, goes down for a reload and across the chest at a sprint.
 * Everything in camera space (eye at 0, -z ahead); `world(camera)` for the world.
 */
/** recoil spring rate (1/s): the peak comes at 1/RECOIL_W s */
const RECOIL_W = 25;

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
    /** the hands losing the gun: pitch up, yaw, lift (m); soft, so quick shots stack */
    private rise = new Spring(3, 45, 2 * Math.sqrt(45) * .9);
    /** recent shots (decays): rapid fire loses more and more control */
    heat = 0;
    /** turn rate (rad/s, yaw), smoothed: a shot while turning kicks out at an angle */
    private turning = 0;
    private stride = 0;
    private aimed = 0;

    constructor(hold: Hold) {
        this.hold = hold;
    }

    /** another item in hand (keeps the springs going) */
    set(hold: Hold) { this.hold = hold; }
    get current() { return this.hold; }

    /** 0..1 how well the shooter holds the recoil: less = a bigger, wilder jump (tired / wounded lower it later) */
    control = .5;

    /** A shot: `kick` radians the muzzle jumps up, `side` either way, `impulse` kg·m/s push back (from `Gun.recoil()`). */
    fire(recoil: { kick: number; side: number; impulse?: number }) {
        const w = this.hold.weight ?? 1, a = this.aimed;
        this.kickSpring.kick(0, recoil.side * 18 / w, 0);
        // one push into a critically damped spring: back toward the body and up in ~40 ms, eased home over ~200 ms.
        // power: caliber energy over the gun's weight; less control and the hip (one hand worse) make it bigger and wilder
        const h = this.hold, hip = (1 - a) * (h.fore ? .5 : 1), loose = 1 - this.control;
        const p = (recoil.impulse ?? 4) / w * (1 - this.control * .6) * (1 + hip * .5);
        const wild = loose * .6 + hip * .8, r = () => (Math.random() * 2 - 1) * wild;
        const v = RECOIL_W * Math.E, up = Math.min(.12, p * .007) * (1 + r() * .4), back = Math.min(.35, p * .014);
        this.recoilSpring.kick(up * v, back * v, up * r() * .6 * v, up * r() * .8 * v);
        // the hands lose it a little: more with each quick shot, tilted by the turn
        const heat = this.heat, lose = (.4 + loose) * (1 + heat * .7);
        const tilt = Math.max(-.7, Math.min(.7, this.turning * .25 + this.turn.value[2] * 3)) + r() * .25;
        const lift = up * lose * 6;
        this.rise.kick(lift * Math.cos(tilt), lift * Math.sin(tilt), lift * .25);
        this.heat = Math.min(6, heat + Math.min(1.5, p * .08));
        this.viewSpring.kick(recoil.kick * 14 * (1 + heat * .35), (recoil.side + Math.sin(tilt) * recoil.kick) * 6);
    }

    update(dt: number, m: Motion) {
        this.clock += dt;
        const h = this.hold, w = h.weight ?? 1;
        // tucked: can't look down the sights
        const a = smooth(Math.max(0, Math.min(1, m.aimed * (1 - this.tucked))));
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
        this.recoilSpring.update(dt);
        this.rise.update(dt);
        this.heat *= Math.exp(-dt * (1.2 + this.control * 1.6));
        if (dt > 0) this.turning += (m.yaw / dt - this.turning) * (1 - Math.exp(-dt * 12));
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

        // moving stirs the sway up, standing still it settles over ~1.5 s
        const stir = Math.min(1, m.speed / 4.5);
        this.stirred += (stir - this.stirred) * (1 - Math.exp(-dt * (stir > this.stirred ? 4 : 1.5)));
        const sway = breath * (1 + this.stirred * 2.5);
        // aimed: no sliding (the eye / rear sight line stays put), only turning round the rear sight
        const slide = 1 - a;
        const ox = (Math.cos(this.stride) * .014 * bob + Math.sin(t * 1.1) * .0025 * breath) * slide;
        const oy = (-Math.abs(Math.sin(this.stride)) * .02 * bob + Math.sin(t * 1.7) * .002 * breath) * slide - low * .07 - run * .06;
        const oz = low * .03;
        const yaw = Math.sin(t * .8) * .004 * sway + this.kickSpring.value[1] * .03 + run * .7 * (h.fore ? 1 : .4);
        const pitch = Math.sin(t * 1.3 + 1) * .004 * sway + low * .35 - run * .25;
        const roll = Math.cos(this.stride) * .03 * bob - low * .55 + run * .35;

        // hip: grip at `hip`, the bore at the middle `converge` ahead; aimed: the sight on the eye line
        const converge = h.converge ?? 30;
        const hipYaw = Math.atan2(h.hip[0], converge), hipPitch = Math.atan2(-h.hip[1], converge);
        const tune = h.aim ?? { offset: [0, 0, 0] as Vec3, angle: [0, 0, 0] as Vec3 };
        const aimAt: Vec3 = [tune.offset[0], tune.offset[1], -h.eye + tune.offset[2]];
        const P: Vec3 = [mix(h.hip[0], aimAt[0], a), mix(h.hip[1], aimAt[1], a), mix(h.hip[2], aimAt[2], a)];
        const pivot: Vec3 = [mix(h.grip[0], h.sight[0], a), mix(h.grip[1], h.sight[1], a), mix(h.grip[2], h.sight[2], a)];
        // aimed: the sight line (not the bore) down the middle of the view, rear and front sight both on it
        const [lineYaw, linePitch] = h.front ? sightLine(h.sight, h.front) : [0, 0];
        const ha = h.hipAngle ?? [0, 0, 0];
        const R = compose(mat4(), 0, 0, 0,
            (hipYaw + ha[1]) * (1 - a) + (tune.angle[1] - lineYaw) * a + this.turn.value[0] + yaw,
            (hipPitch + ha[0]) * (1 - a) + (tune.angle[0] - linePitch) * a + this.turn.value[1] + pitch,
            this.turn.value[2] + roll + tune.angle[2] * a + ha[2] * (1 - a));
        const T = compose(mat4(), P[0] + this.shift.value[0] * slide + ox, P[1] + this.shift.value[1] * slide + oy, P[2] + this.shift.value[2] * slide + oz);
        const back = compose(mat4(), -pivot[0], -pivot[1], -pivot[2]);
        multiply(this.matrix, T, multiply(mat4(), R, back));
        // recoil turns round a point under the bore (the grip), not the sight
        const g = h.grip, rc = this.recoilSpring.value;
        const rs = this.rise.value;
        const kick = multiply(mat4(), compose(mat4(), g[0], g[1] + rs[2], g[2] + rc[1], rc[2] + rs[1], rc[0] + rs[0], rc[3] - rs[1] * .5), compose(mat4(), -g[0], -g[1], -g[2]));
        multiply(this.matrix, this.matrix, kick);
        this.base.set(this.matrix);
        // the world in the way: turned aside / back / tucked round the grip
        this.blocked.update(dt);
        const [by, bb, bt] = this.blocked.value, tk = Math.abs(bt);
        const push = multiply(mat4(), compose(mat4(), g[0], g[1] - tk * .04, g[2] + bb + tk * .06, by, bt * 1.05, -tk * .35 * Math.sign(bt || 1)), compose(mat4(), -g[0], -g[1], -g[2]));
        multiply(this.matrix, this.matrix, push);
    }
    /** the pose before the world pushed it (for `Obstruction`) */
    readonly base: Mat4 = mat4();
    /** yaw aside, back (m), tuck (+1 up, -1 down) */
    private blocked = new Spring(3, 160, 22);
    /** what the world does to the gun (`Obstruction.update`'s result), eased in */
    obstruct(o: { yaw: number; back: number; tuck: number }) {
        this.blocked.target[0] = o.yaw; this.blocked.target[1] = o.back; this.blocked.target[2] = o.tuck;
    }
    /** 0..1 how tucked (no aiming) */
    get tucked() { return Math.min(1, Math.abs(this.blocked.value[2])); }
    /** camera space grip / muzzle of the unpushed pose */
    get free(): { grip: Vec3; muzzle: Vec3 } {
        return { grip: point(this.base, this.hold.grip), muzzle: point(this.base, this.hold.muzzle) };
    }
    private sprinting = 0;
    /** recoil push: muzzle up (rad), back (m), yaw, roll (rad); critically damped */
    private recoilSpring = new Spring(4, RECOIL_W ** 2, 2 * RECOIL_W);
    private stirred = 0;
    private lowered = 0;

    /** camera space: where the bullet leaves and the way the bore points (unit) */
    get muzzle(): { from: Vec3; direction: Vec3 } {
        const d = direction(this.matrix, [0, 0, -1]), l = Math.hypot(...d);
        return { from: point(this.matrix, this.hold.muzzle), direction: [d[0] / l, d[1] / l, d[2] / l] };
    }

    /** how far the gun trails the view's turn: [yaw, pitch] radians (elbows can trail with it) */
    get lag(): [number, number] { return [this.turn.value[0], this.turn.value[1]]; }

    /** camera space: where the hands go (fore: none for one handed) */
    get hands(): { grip: Vec3; fore?: Vec3 } {
        return { grip: point(this.matrix, this.hold.grip), fore: this.hold.fore ? point(this.matrix, this.hold.fore) : undefined };
    }

    /** the item's world matrix for a camera's world matrix */
    world(camera: ArrayLike<number>, out: Mat4 = mat4()) {
        return multiply(out, camera, this.matrix);
    }
}

/** yaw (left +) and pitch (up +) of the line from `a` to `b` in item space (-z ahead) */
export function sightLine(a: Vec3, b: Vec3): [number, number] {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], ahead = Math.max(1e-6, -dz);
    return [Math.atan2(-dx, ahead), Math.atan2(dy, Math.hypot(ahead, dx))];
}
