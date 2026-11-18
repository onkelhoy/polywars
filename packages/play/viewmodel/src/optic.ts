import { Vector3 } from "@papit/vector";

export type OpticSetting = {
    /** magnification */
    zoom: number;
    /** held in the hands (binoculars): breathing, tremor and every mouse move shake it; else on a tripod (steady) */
    handheld: boolean;
};

/**
 * Looking through an optic: the view's shake as an offset (pitch, yaw, radians). No slowing the mouse down: every
 * move goes straight through and kicks a loose spring, so held at 7x tiny moves make it jag; breathing + a hand
 * tremor on top. A tripod only breathes a little.
 */
export class Optic {
    readonly offset = new Vector3(0, 0, 0);
    private kick = new Vector3(0, 0, 0);
    private speed = new Vector3(0, 0, 0);
    private t = Math.random() * 100;

    constructor(readonly setting: OpticSetting) {}

    get zoom() { return this.setting.zoom; }

    /** `turn` this frame's mouse turn (pitch, yaw) radians */
    update(dt: number, turn: [number, number]) {
        const held = this.setting.handheld, t = (this.t += dt);
        // the mouse kicks the spring (held: loose, overshoots; tripod: stiff, damped)
        const k = held ? 140 : 400, damp = held ? 7 : 30;
        this.speed.add(new Vector3(turn[0], turn[1], 0).multiply(held ? 9 : 1));
        this.speed.add(this.kick.clone.multiply(-k * dt)).multiply(Math.exp(-damp * dt));
        this.kick.add(this.speed.clone.multiply(dt));
        const breath = (held ? .0022 : .00025) * Math.sin(t * 1.6), drift = (held ? .0012 : .0001) * Math.sin(t * .7 + 1.3);
        const tremor = held ? .00045 : 0;
        const shake = new Vector3(
            breath + tremor * (Math.sin(t * 41) * .6 + Math.sin(t * 67 + 2) * .4),
            drift + tremor * (Math.sin(t * 47 + 1) * .6 + Math.sin(t * 59 + 4) * .4),
            0,
        );
        this.offset.set(this.kick.clone.add(shake));
        return this.offset;
    }
}
