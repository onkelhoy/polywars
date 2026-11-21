/** x right, y up, muzzle along -z (glTF model space), metres */
export type Vec3 = [number, number, number];

import type { Action } from "./types";

/**
 * `assets/models/weapons/guns/<id>/weapon.json`. Points come from `tools/blender/packs/weapon-points.py`
 * (hand edits win); missing ones fall back to the gun's rig bones where the player reads them.
 */
export type WeaponFile = {
    model: string;
    action: Action;
    /** sound set: folder under `assets/audio/effects/weapons/` */
    sounds: string;
    /** scope ids (folders under `assets/models/weapons/attachments/`) that fit */
    scopes: string[];
    points: Partial<Record<"muzzle" | "front" | "rear" | "trigger" | "grip" | "fore" | "eject" | "mount", Vec3>> & {
        /** unit direction the case flies out (the owner's `exit.shell` empty, its +z) */
        ejectDir?: Vec3;
        /** unit direction the bullet leaves (the `exit.bullet` empty, its +z) */
        muzzleDir?: Vec3;
        /** more than one barrel (the owner's `exit.bullet.L` / `.R`): each muzzle, in barrel order */
        barrels?: Vec3[];
    };
    /** per gun clip timing (frames at `fps`); see `.claude/skills/map-gun` */
    animation?: GunAnimation;
    /** hand tuned aimed pose (range view `T`): iron sights; `aim@<scope id>` with that scope on */
    aim?: AimTune;
    [scoped: `aim@${string}`]: AimTune | undefined;
};

/**
 * On top of the computed aim: `offset` camera space metres (x right, y up, z back), `angle` [pitch up, yaw left, roll]
 * degrees (looks only: aimed shots follow the drawn sights). `zero`: metres where the bullet meets the sights (default the spec's).
 */
export type AimTune = { offset: Vec3; angle: Vec3; zero?: number };

/** `assets/models/weapons/attachments/<id>/scope.json` */
export type ScopeFile = {
    model: string;
    /** magnification min, max */
    zoom: [number, number];
    points: Record<"eyepiece" | "objective" | "mount", Vec3>;
};

export type Weapon = WeaponFile & { id: string; url: string };
export type ScopeData = ScopeFile & { id: string; url: string };

/**
 * One piece of a clip timeline: `clip` played `from` .. `to` (frames, default the whole clip, `reverse` backwards) or
 * `hold` a clip's last frame; `over`: another clip's frame (default 0) layered on top (`only` those bones);
 * `cues`: sounds at frames of the piece's clip.
 */
export type ClipStep = {
    clip?: string; hold?: string; share: number; from?: number; to?: number; reverse?: boolean;
    over?: { clip: string; frame?: number; only?: string[] };
    cues?: Record<string, number>;
};

/** weapon.json `animation`: which frames of the gun's clips things happen at */
export type GunAnimation = {
    fps?: number;
    /** `shoot` clip: frame 0 is the shot, `eject` the frame the case flies */
    /** `last`: the clip of the last round (played, then held at its end while empty, e.g. the slide locked back) */
    shoot?: { clip?: string; eject?: number; last?: string };
    /** bolt / lever / pump `cycle` clip: `eject` the frame the case flies */
    cycle?: { clip?: string; eject?: number };
    /** the clip shown at rest, ready to fire (e.g. `loaded`: hammer cocked) */
    rest?: string;
    /** the reload as clip pieces, each a `share` of its time (`reloadEmpty` when the gun ran dry) */
    reload?: ClipStep[];
    reloadEmpty?: ClipStep[];
    /** break action clips, `{b}` = the barrel's name (L, R): `open` (closed at 0, open at the end), per barrel `shoot`
     * (frame 0 cocked, hammer down at the end), `spent` / `cocked` poses, `cock` (the hammer pulled back), `swap` (case out; reversed = round in),
     * `safety`, the `trigger` bone (a dry pull moves only it) and the frame it's `pulled` at */
    break?: { open: string; barrels: string[]; shoot: string; spent: string; cocked: string; cock?: string; swap: string; safety?: string; trigger?: string; pulled?: number };
    [part: string]: unknown;
};
