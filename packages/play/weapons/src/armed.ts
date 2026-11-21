import type { Layer3D } from "@papit/game-engine";
import { Matrix4 } from "@papit/matrix";
import { Model, Renderer, type Drawable, type Light, type Scene, type View } from "@polywar/renderer";
import { Armory, scopeOffset } from "./armory";

const renderers = new WeakMap<Layer3D, Renderer>();
const rendererOf = (layer: Layer3D) => renderers.get(layer) ?? renderers.set(layer, new Renderer(layer)).get(layer)!;

/**
 * A gun with a scope on it (or bare) as a `Drawable`, for the gallery / `pw-3d-asset-preview` (`scene`).
 * Stands on y 0, centred on x / z. Size is a guess until the models load (gun length 1.2 m).
 */
export class ArmedGun implements Drawable {
    size: [number, number, number] = [.1, .2, 1.2];
    private gun?: Model;
    private scope?: Model;
    private place = Matrix4.create();
    private scopePlace = Matrix4.create();
    private dead = false;

    constructor(readonly layer: Layer3D, readonly armory: Armory, readonly gunId: string, readonly scopeId?: string) {
        this.load();
    }

    private async load() {
        const gl = this.layer.gl, weapon = await this.armory.weapon(this.gunId);
        const scope = this.scopeId ? await this.armory.scope(this.scopeId) : undefined;
        const [gun, sm] = await Promise.all([Model.load(gl, weapon.url + weapon.model), scope ? Model.load(gl, scope.url + scope.model) : undefined]);
        if (this.dead) { gun.destroy(); sm?.destroy(); return; }
        const min = [...gun.bounds.min], max = [...gun.bounds.max];
        const off = scope ? scopeOffset(weapon, scope) : [0, 0, 0];
        if (sm) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], sm.bounds.min[k] + off[k]); max[k] = Math.max(max[k], sm.bounds.max[k] + off[k]); }
        this.size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
        const at = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
        this.place = Matrix4.create().translate(at[0], at[1], at[2]);
        this.scopePlace = Matrix4.create().translate(at[0] + off[0], at[1] + off[1], at[2] + off[2]);
        this.gun = gun;
        this.scope = sm;
    }

    draw(view: View, light: Light, _time: number) {
        if (!this.gun) return;
        const r = rendererOf(this.layer);
        r.light = light;
        r.begin(view, null);
        this.gun.draw(r, this.place);
        this.scope?.draw(r, this.scopePlace);
    }

    destroy() {
        this.dead = true;
        this.gun?.destroy();
        this.scope?.destroy();
    }

    /** a `Scene` for gallery items */
    static scene(armory: Armory, gun: string, scope?: string): Scene {
        return layer => new ArmedGun(layer, armory, gun, scope);
    }
}
