import type { Cast, Hit, Bullet } from "@polywar/ballistics";
import type { Collider } from "@polywar/mover";
import type { View } from "@polywar/renderer";

export type PlayerSetting = {
    /** ground height (terrain, roads, floors: highest wins) */
    ground: (x: number, z: number) => number;
    /** solid things near x / z for the feet */
    colliders?: (x: number, z: number) => Iterable<Collider>;
    /** what bullets hit (ground, props, targets) */
    cast: Cast;
    /** character.json url (body in first person, attachments) */
    character?: string;
    /** gun ids from `GUNS` the player carries (1..9 keys) */
    guns?: string[];
    /** url of `assets/models/weapons/guns/` */
    gunsUrl?: string;
    /** eye over the feet, m (default 1.65) */
    eye?: number;
    /** walk / run speed m/s (default 4.2 / 2x) */
    speed?: number;
    run?: number;
    /** radians per mouse pixel (default .0022) */
    sensitivity?: number;
    /** steepest walkable ground, degrees (default 40) */
    slope?: number;
    /** draws the scene again for the scope's picture */
    scene?: (view: View) => void;
};

export type PlayerEvents = {
    /** a bullet hit something (after the impacts are made) */
    hit?: (bullet: Bullet, hit: Hit) => void;
    /** Esc let go of the mouse */
    exit?: () => void;
};
