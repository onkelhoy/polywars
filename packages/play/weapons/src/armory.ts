import type { Scene } from "@polywar/renderer";
import { ArmedGun } from "./armed";
import type { ScopeData, ScopeFile, Vec3, Weapon, WeaponFile } from "./asset-types";

const cache = new Map<string, Promise<unknown>>();
function json<T>(url: string): Promise<T> {
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }));
    return cache.get(url) as Promise<T>;
}

/**
 * Reads weapon / scope files under an assets root (default `/assets`): `weapon(id)` = guns/<id>/weapon.json,
 * `scope(id)` = attachments/<id>/scope.json. `url` on the result is the folder (model at `url + model`).
 */
export class Armory {
    constructor(readonly root = "/assets") { }

    get guns() { return `${this.root}/models/weapons/guns/`; }
    get attachments() { return `${this.root}/models/weapons/attachments/`; }

    /** gun and scope ids that have a weapon.json / scope.json, from the assets manifest */
    async list(): Promise<{ guns: string[]; scopes: string[] }> {
        const files: string[] = [];
        const walk = (node: { assets: any[] }) => node.assets.forEach(a => "assets" in a ? walk(a) : files.push(a.file));
        walk(await json(`${this.root}/manifest.json`));
        const ids = (re: RegExp) => files.map(f => f.match(re)?.[1]).filter((x): x is string => !!x).sort();
        return { guns: ids(/\/weapons\/guns\/([^/]+)\/weapon\.json$/), scopes: ids(/\/weapons\/attachments\/([^/]+)\/scope\.json$/) };
    }

    /** gallery items: every gun bare, plus each gun with each scope it takes (group `scoped/<gun>`) */
    async items(): Promise<{ name: string; group: string; kind: "model"; note: string; scene: Scene }[]> {
        const { guns } = await this.list();
        const weapons = await Promise.all(guns.map(id => this.weapon(id)));
        return weapons.flatMap(w => [
            { name: w.id, group: `guns/${w.action}`, kind: "model" as const, note: w.scopes.length ? `${w.action} · scopes ${w.scopes.length}` : w.action, scene: ArmedGun.scene(this, w.id) },
            ...w.scopes.map(s => ({ name: s, group: `scoped/${w.id}`, kind: "model" as const, note: w.id, scene: ArmedGun.scene(this, w.id, s) })),
        ]);
    }

    async weapon(id: string): Promise<Weapon> {
        const url = `${this.guns}${id}/`;
        return { ...await json<WeaponFile>(`${url}weapon.json`), id, url };
    }

    async scope(id: string): Promise<ScopeData> {
        const url = `${this.attachments}${id}/`;
        return { ...await json<ScopeFile>(`${url}scope.json`), id, url };
    }
}

/**
 * Where a scope sits on a gun: the offset to add to scope model space to get gun model space
 * (both look down -z, so it is a move only). The rings stand on the gun's `mount` point; with no mount
 * it goes over the rear sight. `lift` raises it (high rings).
 */
export function scopeOffset(weapon: WeaponFile, scope: ScopeFile, lift = 0): Vec3 {
    const p = weapon.points, m = scope.points.mount;
    const at = p.mount ?? p.rear ?? [0, 0, 0];
    return [at[0] - m[0], at[1] - m[1] + lift, at[2] - m[2]];
}

/** a scope point in gun model space */
export function onGun(point: Vec3, offset: Vec3): Vec3 {
    return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
}
