import type { Cast, Hit, Bullet } from "@polywar/ballistics";
import type { Collider } from "@polywar/mover";
import type { View } from "@polywar/renderer";
import type { AudioMixer } from "@papit/audio";
import type { World } from "@papit/rigidbody";

export type PlayerSetting = {
    /** ground height (terrain, roads, floors: highest wins) */
    ground: (x: number, z: number) => number;
    /** solid things near x / z for the feet */
    colliders?: (x: number, z: number) => Iterable<Collider>;
    /** what bullets hit (ground, props, targets) */
    cast: Cast;
    /** character.json url (body in first person, attachments) */
    character?: string;
    /** gun ids from `GUNS` the player carries (1..9 keys); `<id>@<scope id>` with a scope on */
    guns?: string[];
    /** the assets root (weapon.json / scope.json via `@polywar/armory`), default `/assets` */
    assets?: string;
    /** url of `assets/models/weapons/guns/` (default under `assets`) */
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
    /** the shared `@papit/rigidbody` world (cases go in it; the host steps it). Without: the player makes and steps its own */
    world?: World;
    /** sound mixer; without: one of its own */
    mixer?: AudioMixer;
    /** what's at a point a case landed on, for its sound: "dirt" (default), "stone", "wood", "metal" */
    surface?: (at: [number, number, number]) => string;
    /** draws the scene again for the scope's picture */
    scene?: (view: View) => void;
    /** after the world, before the hands (own depth): e.g. finish SSAO here so the hands get none */
    worldDrawn?: () => void;
    /** live: knocked down (`Knockdown` from `@polywar/explosion` fits): eye lowered `drop`, look offset, `control` 0..1, `hands` 0..1 on the ground */
    pose?: () => { drop: number; pitch: number; yaw: number; roll: number; control: number; look?: number; hands: number } | undefined;
};

export type PlayerEvents = {
    /** a bullet hit something (after the impacts are made) */
    hit?: (bullet: Bullet, hit: Hit) => void;
    /** Esc let go of the mouse */
    exit?: () => void;
};
