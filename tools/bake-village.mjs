// node tools/bake-village.mjs: bakes the flat stone/ground pieces of the Modular Village kit
// into assets/models/buildings/modular-village/baked/<Piece>/ (see packages/utils/mesh-bake/lib/bin.js).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const KIT = join(ROOT, "assets/models/buildings/modular-village");
const SETS = [
    { pieces: ["Cobblestone_Floor_1", ...[1, 2, 3, 4].map(n => `Cobblestone_Dirt_Transition_${n}`)], args: ["--axis", "+y", "--size", "2x2", "--spec", "Dirt=0.1,*=1"] },
    { pieces: ["Stone_Floor_1", "Stone_Floor_2"], args: ["--axis", "+y", "--size", "1x1", "--spec", "Dirt=0.1,*=1"] },
    { pieces: [1, 2, 3, 4, 5].map(n => `Stone_Wall_${n}`), args: ["--axis", "+x", "--size", "1x1"] },
];
for (const set of SETS)
    spawnSync("node", [join(ROOT, "packages/utils/mesh-bake/lib/bin.js"), ...set.pieces.map(p => join(KIT, p + ".glb")), ...set.args, "--out", join(KIT, "baked")], { stdio: "inherit" });
