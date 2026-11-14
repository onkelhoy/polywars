/** x right, y up, muzzle along -z (glTF model space), metres */
export type Vec3 = [number, number, number];

/** How a round gets chambered: drives sounds and clips. */
export type Action = "bolt" | "straight-pull" | "semi" | "auto" | "lever" | "break" | "pistol";

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
    points: Partial<Record<"muzzle" | "front" | "rear" | "trigger" | "grip" | "fore" | "eject" | "mount", Vec3>>;
    /** hand tuned aimed pose (range view `T`): iron sights; `aim@<scope id>` with that scope on */
    aim?: AimTune;
    [scoped: `aim@${string}`]: AimTune | undefined;
};

/** on top of the computed aim: `offset` camera space metres (x right, y up, z back), `angle` [pitch up, yaw left, roll] degrees */
export type AimTune = { offset: Vec3; angle: Vec3 };

/** `assets/models/weapons/attachments/<id>/scope.json` */
export type ScopeFile = {
    model: string;
    /** magnification min, max */
    zoom: [number, number];
    points: Record<"eyepiece" | "objective" | "mount", Vec3>;
};

export type Weapon = WeaponFile & { id: string; url: string };
export type ScopeData = ScopeFile & { id: string; url: string };
