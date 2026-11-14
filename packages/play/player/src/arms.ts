import { MeshBuilder, upload, type GPUMesh } from "@papit/game-mesh";
import type { Renderer } from "@polywar/renderer";
import { compose, mat4, multiply, type Vec3 } from "@polywar/viewmodel";

export type ArmsLook = {
    sleeve: [number, number, number, number];
    cuff: [number, number, number, number];
    skin: [number, number, number, number];
    /** camera space shoulders (right; the left is mirrored) */
    shoulder: Vec3;
    upper: number;
    forearm: number;
};

/** knight-ish: grey sleeves, a dark cuff, bare hands */
export const KNIGHT_ARMS: ArmsLook = {
    sleeve: [.3, .3, .32, 1], cuff: [.25, .22, .2, 1], skin: [.93, .78, .62, 1],
    shoulder: [.21, -.34, .06], upper: .34, forearm: .36,
};

/**
 * First person arms to the hands on a held item: two boxes per arm bent at the elbow (two bone IK),
 * a hand on each grip. Camera space in, drawn with the camera's world matrix.
 */
export class Arms {
    private box: GPUMesh;
    private hand: GPUMesh;
    private m = mat4();

    constructor(gl: WebGL2RenderingContext, public look: ArmsLook = KNIGHT_ARMS) {
        this.box = upload(gl, new MeshBuilder().box("#ffffff", { at: [0, 0, -.5] }).build());
        this.hand = upload(gl, new MeshBuilder().box("#ffffff", { at: [0, 0, -.5], scale: [1, 1, 1] }).build());
    }

    draw(renderer: Renderer, camera: ArrayLike<number>, hands: { grip: Vec3; fore?: Vec3 }) {
        const s = this.look.shoulder;
        this.arm(renderer, camera, [s[0], s[1], s[2]], hands.grip, [1, -1, .4]);
        if (hands.fore) this.arm(renderer, camera, [-s[0], s[1], s[2]], hands.fore, [-1, -1, .4]);
    }

    private arm(renderer: Renderer, camera: ArrayLike<number>, shoulder: Vec3, hand: Vec3, pole: Vec3) {
        const { upper, forearm } = this.look;
        const d: Vec3 = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
        const reach = Math.hypot(...d) || 1e-6;
        const along = Math.min(reach, upper + forearm - 1e-3);
        const a = (upper * upper - forearm * forearm + along * along) / (2 * along);
        const out = Math.sqrt(Math.max(0, upper * upper - a * a));
        const u: Vec3 = [d[0] / reach, d[1] / reach, d[2] / reach];
        const dot = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
        const side: Vec3 = [pole[0] - u[0] * dot, pole[1] - u[1] * dot, pole[2] - u[2] * dot];
        const sl = Math.hypot(...side) || 1;
        const elbow: Vec3 = [shoulder[0] + u[0] * a + side[0] / sl * out, shoulder[1] + u[1] * a + side[1] / sl * out, shoulder[2] + u[2] * a + side[2] / sl * out];
        // the wrist a hand's length short of the grip (a stretched arm reaches, the hand stays a hand)
        const eh: Vec3 = [hand[0] - elbow[0], hand[1] - elbow[1], hand[2] - elbow[2]], el = Math.hypot(...eh) || 1;
        const toward = (p: Vec3, k: number): Vec3 => [p[0] + eh[0] / el * k, p[1] + eh[1] / el * k, p[2] + eh[2] / el * k];
        const wrist = toward(hand, -.06), cuff = toward(wrist, -.06);
        this.beam(renderer, camera, shoulder, elbow, .075, .075, this.look.sleeve);
        this.beam(renderer, camera, elbow, cuff, .062, .062, this.look.sleeve);
        this.beam(renderer, camera, cuff, wrist, .07, .07, this.look.cuff);
        this.beam(renderer, camera, wrist, toward(hand, .03), .045, .07, this.look.skin, this.hand);
    }

    /** a box from `from` to `to` (camera space), `w` wide `h` high */
    private beam(renderer: Renderer, camera: ArrayLike<number>, from: Vec3, to: Vec3, w: number, h: number, tint: [number, number, number, number], mesh = this.box) {
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], length = Math.hypot(dx, dy, dz) || 1e-6;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
        compose(this.m, from[0], from[1], from[2], yaw, pitch, 0);
        const s = this.m;
        for (let k = 0; k < 3; k++) { s[k] *= w; s[4 + k] *= h; s[8 + k] *= length; }
        renderer.draw(mesh, multiply(mat4(), camera, s), { tint });
    }

    destroy() { this.box.destroy(); this.hand.destroy(); }
}
