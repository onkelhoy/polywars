import { mix, smooth, type Vec3 } from "./math";

/** a camera pose: eye position + view angles (radians, yaw 0 = -z, + turns left) */
export type FocusPose = { position: Vec3; pitch: number; yaw: number };

export type FocusTarget = {
    /** where the eye goes (world) */
    eye: Vec3;
    /** what it looks at (world); omit to keep the current view direction */
    look?: Vec3;
    /** seconds to ease in / out, default .6 */
    time?: number;
    /** radians the mouse may nudge the view off the target (springs back), default .12 */
    nudge?: number;
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * "Look at this" for short moments: the camera eases from where it is to `eye`, looking at `look`;
 * the mouse nudges it a little and it springs back. `stop()` eases back to the normal view.
 * Pure: feed it the normal pose each frame, it returns the one to show.
 */
export class Focus {
    /** 0 = normal view, 1 = at the target (eased) */
    amount = 0;
    target?: FocusTarget;
    private going = false;
    private offset: [number, number] = [0, 0];

    start(target: FocusTarget) { this.target = target; this.going = true; }
    stop() { this.going = false; }

    /** easing in or held */
    get active() { return this.going; }
    /** fully there */
    get settled() { return this.going && this.amount > .999; }
    /** any part of the focus is showing */
    get showing() { return this.amount > 0; }

    /** `turn` this frame's mouse turn (pitch, yaw); returns the pose to show */
    update(dt: number, turn: [number, number], normal: FocusPose): FocusPose {
        const t = this.target;
        const time = t?.time ?? .6, step = dt / Math.max(.01, time);
        this.amount = Math.max(0, Math.min(1, this.amount + (this.going ? step : -step)));
        if (!t || this.amount === 0) { this.offset = [0, 0]; if (!this.going) this.target = undefined; return normal; }
        // the nudge: mouse pushes, spring pulls back
        const max = t.nudge ?? .12, back = Math.exp(-dt * 4);
        for (let i = 0; i < 2; i++) this.offset[i] = Math.max(-max, Math.min(max, this.offset[i] * back + turn[i] * .5));
        let pitch = normal.pitch, yaw = normal.yaw;
        if (t.look)
        {
            const d = [t.look[0] - t.eye[0], t.look[1] - t.eye[1], t.look[2] - t.eye[2]];
            pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
            yaw = Math.atan2(-d[0], -d[2]);
        }
        const s = smooth(this.amount);
        return {
            position: [0, 1, 2].map(k => mix(normal.position[k], t.eye[k], s)) as Vec3,
            pitch: mix(normal.pitch, pitch + this.offset[0], s),
            yaw: normal.yaw + wrap(yaw + this.offset[1] - normal.yaw) * s,
        };
    }
}
