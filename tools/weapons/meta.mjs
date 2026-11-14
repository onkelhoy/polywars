// node tools/weapons/meta.mjs
// Writes the hand-kept part of every assets/models/weapons/guns/<id>/weapon.json (action, scopes, sounds),
// keeps `points` (tools/blender/packs/weapon-points.py) and any other key, and formats the files (one point a line).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEAPONS = join(ROOT, "assets/models/weapons");
const SCOPES = ["scope-1", "scope-2", "scope-3"];

/** action: how a round gets chambered (drives sounds + clips). scoped: real sniper variants existed */
const GUNS = {
    "arisaka-type-99": { action: "bolt", scoped: true },
    "beretta-model-57": { action: "auto" },
    "carcano-m1891": { action: "bolt", scoped: true },
    "double-deuce": { action: "break" },
    "general-liu": { action: "semi" },
    "gewehr-43": { action: "semi", scoped: true },
    "gewehr-88": { action: "bolt" },
    "k31": { action: "straight-pull", scoped: true },
    "kar98k": { action: "bolt", scoped: true },
    "kropatschek": { action: "bolt" },
    "lebel-m1886": { action: "bolt", scoped: true },
    "m1903a1-springfield": { action: "bolt", scoped: true },
    "mas-36": { action: "bolt" },
    "p14-enfield": { action: "bolt", scoped: true },
    "remington-model-8": { action: "semi", scoped: true },
    "ross-mk3": { action: "straight-pull", scoped: true },
    "ruger-10-22": { action: "semi", scoped: true },
    "smle-mk3": { action: "bolt", scoped: true },
    "svt-40": { action: "semi", scoped: true },
    "vetterli-m78": { action: "bolt" },
    "vz-52": { action: "semi" },
    "winchester-1866": { action: "lever" },
    "winchester-1895": { action: "lever" },
    "winchester-1910": { action: "semi" },
    "m1-garand": { action: "semi", scoped: true },
    "stg-44": { action: "auto" },
    "thompson-m1": { action: "auto" },
    "ppsh-41": { action: "auto" },
    "m1911": { action: "pistol" },
    "tt-pistol": { action: "pistol" },
    "mauser-c96": { action: "pistol" },
    "mp40": { action: "auto" },
    "mp28": { action: "auto" },
    "sterling": { action: "auto" },
    "ithaca-m37": { action: "pump" },
    "lahti-l39": { action: "semi" },
};

/** JSON with short number arrays on one line */
const format = data => JSON.stringify(data, null, 4).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, xs) => `[${xs.split(/,\s*/).join(", ")}]`) + "\n";

for (const [id, g] of Object.entries(GUNS))
{
    const path = join(WEAPONS, "guns", id, "weapon.json");
    const old = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    const data = {
        model: "model.glb",
        action: g.action,
        // sound set: a folder under assets/audio/effects/weapons/ (sounds.json inside lists the files per event)
        sounds: old.sounds ?? id,
        scopes: g.scoped ? SCOPES : [],
        ...old,
        action: old.action ?? g.action,
        scopes: old.scopes ?? (g.scoped ? SCOPES : []),
    };
    writeFileSync(path, format(data));
}
for (const id of readdirSync(join(WEAPONS, "attachments")))
{
    const path = join(WEAPONS, "attachments", id, "scope.json");
    if (!existsSync(path)) continue;
    const old = JSON.parse(readFileSync(path, "utf8"));
    const zoom = { "scope-1": [2.5, 2.5], "scope-2": [3, 9], "scope-3": [4, 12] }[id] ?? [4, 4];
    writeFileSync(path, format({ model: "model.glb", zoom, ...old }));
}
console.log("weapon.json:", Object.keys(GUNS).length);
