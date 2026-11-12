// node tools/blender/packs/store.mjs [store-folder]
// Copies the downloaded packs from ~/Developer/3D/store into assets/models (editable sources + .glb).
// Existing files are kept, so hand edits survive a re-run. Then run `npm run assets` to export the .blend files.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../../..");
const STORE = process.argv[2] ?? join(homedir(), "Developer/3D/store");
const MODELS = join(ROOT, "assets/models");
const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const IMPORT = join(ROOT, "tools/blender/import.py");

const copy = (from, to) => {
    if (existsSync(to)) return;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log("copied", to.replace(ROOT + "/", ""));
};
const files = (dir, ext) => readdirSync(dir).filter(f => ext.includes(extname(f).toLowerCase())).sort();
const blender = (...args) => {
    const r = spawnSync(BLENDER, ["-b", "-P", IMPORT, "--", ...args], { encoding: "utf8" });
    for (const line of r.stdout.split("\n")) if (/^(saved|exported)|Error/.test(line)) console.log(line);
};

// packs that ship .blend files: copy them (+ previews, licence)
const BLENDS = [
    ["nature/Blends", "nature"],
    ["Farm Animals by @Quaternius/Blends", "animals/farm"],
    ["Farm Buildings - Sept 2018/Blend", "buildings/farm"],
    ["castle/Blends", "buildings/castle"],
    ["dunguen/Blends", "buildings/dungeon"],
    ["Train Pack - April 2019/Blends", "transport/train"],
    ["Tank Pack - June 2019/Blends", "vehicles/tanks"],
    ["Animated Fish Pack by @Quaternius/Blends", "animals/fish"],
    ["Ultimate Animated Animals - July 2021/Blends", "animals/ultimate"],
    ["Dinosaur Animated Pack - Dec 2018/Blends", "animals/dinosaurs"],
    ["Knight by @Quaternius/Blends", "characters/knight"],
    ["Ultimate Food Pack - Oct 2019/Blends", "props/food"],
];
for (const [from, to] of BLENDS)
{
    const src = join(STORE, from), pack = dirname(src);
    for (const f of files(src, [".blend"])) copy(join(src, f), join(MODELS, to, f));
    for (const f of files(pack, [".txt", ".png", ".jpg", ".gif"])) copy(join(pack, f), join(MODELS, to, "about", f));
}

// Graves ships one .glb
{
    const src = join(STORE, "Graves"), to = join(MODELS, "props/graves");
    copy(join(src, "Graves by jrich01 - AVrXtzi4So.glb"), join(to, "Graves.glb"));
    copy(join(src, "attribution.txt"), join(to, "about", "attribution.txt"));
}

// motorcycle ships a .blend with its texture next to it
{
    const src = join(STORE, "WW2Motorcycle"), to = join(MODELS, "vehicles/ww2-motorcycle");
    copy(join(src, "WW2Motorcycle.blend"), join(to, "model.blend"));
    copy(join(src, "WW2MotorcycleTexture.png"), join(to, "WW2MotorcycleTexture.png"));
}

// FBX-only vehicles: parts + texture into source/, one model.blend with every part
const VEHICLES = [
    ["artillery", "Artillery", ["ArtilleryBase.fbx", "ArtilleryGun.fbx", "ArtilleryWheels.fbx"], "WW2Texture.PNG"],
    ["ww2-tank", "WW2Tank/Mesh", ["TankBody.fbx", "TankTurretHead.fbx", "TankBarrel.fbx", "TankTreads.fbx", "TankWheelHolder.fbx", "TankWheels(all).fbx"], "../TankTexture.PNG"],
    ["ww2-truck", "WW2Truck/WW2Truck", ["TruckFront.fbx", "TruckBack.fbx", "TruckBackCover.fbx", "TruckFrontWheels.fbx", "TruckBackWheels.fbx"], "../WW2TruckTex.PNG"],
    ["ww2-bomber", "WW2Bomber", ["WW2BomberBody.fbx", "WW2BomberInnerLeftRotor.fbx", "WW2BomberFarLeftRotor.fbx", "WW2BomberFrontWheels.fbx", "WW2BomberBackWheels.fbx"], "WW2PlaneTexture.jpg"],
    ["ww2-fighter", "WW2FighterPlane/Base/FBX", ["FighterPlaneBody.fbx", "FighterPlanePropeller.fbx", "FighterPlaneFrontWheels.fbx", "FighterPlaneBackWheel.fbx"], "../../Texture/WW2FightTexture.jpg"],
];
for (const [slug, from, parts, texture] of VEHICLES)
{
    const to = join(MODELS, "vehicles", slug), src = join(STORE, from);
    for (const p of parts) copy(join(src, p), join(to, "source", p));
    copy(join(src, texture), join(to, "source", basename(texture)));
    if (!existsSync(join(to, "model.blend")))
        blender(join(to, "model.blend"), ...parts.map(p => join(to, "source", p)), `--texture=${join(to, "source", basename(texture))}`);
}

// Modular Village: OBJ pieces -> one .glb each (the city generator loads <Piece>.glb), OBJ kept in source/
{
    const src = join(STORE, "Modular Village"), to = join(MODELS, "buildings", "modular-village");
    for (const f of files(src, [".obj", ".mtl"])) copy(join(src, f), join(to, "source", f));
    const todo = files(join(to, "source"), [".obj"]).filter(f => !existsSync(join(to, f.replace(/\.obj$/i, ".glb"))));
    if (todo.length) blender(to, ...todo.map(f => join(to, "source", f)), "--each");
}
