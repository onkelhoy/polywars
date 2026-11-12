// Generated houses / villages -> editable .blend or .glb (kit pieces as separate objects).
//   node tools/blender/export-house.mjs <build code | seed | pieces.json> out.blend [out.glb ...]
//   node tools/blender/export-house.mjs --city '{"seed":4,"radius":1}' out.blend
// Build code = the `m2....` name of a gallery tile (building-builder view). pieces.json = the view's "export json".
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const med = await import(join(ROOT, "packages/library/building-builder/lib/bundle.js"));
const args = process.argv.slice(2);
let pieces, name;
if (args[0] === "--city")
{
    const { city, registerStyle } = await import(join(ROOT, "packages/library/city/lib/bundle.js"));
    registerStyle(med.medievalStyle(med.kitSource("")));
    pieces = city({ style: "medieval", ...JSON.parse(args[1]) }).pieces;
    name = "village";
    args.splice(0, 2);
}
else
{
    const what = args.shift();
    if (existsSync(what)) pieces = JSON.parse(readFileSync(what, "utf8")).pieces ?? JSON.parse(readFileSync(what, "utf8"));
    else
    {
        const parsed = med.decode(what) ?? { settings: med.DEFAULTS, seed: Number(what) >>> 0 };
        pieces = med.building(parsed.settings, parsed.seed).pieces;
    }
    name = "house";
}
const baked = p => `assets/models/buildings/modular-village/baked/${p}/model.glb`;
writeFileSync("/tmp/pw-export.json", JSON.stringify(pieces.map(p => existsSync(join(ROOT, baked(p.piece))) ? { ...p, file: baked(p.piece) } : p)));
const r = spawnSync("/Applications/Blender.app/Contents/MacOS/Blender", ["-b", "-P", join(ROOT, "tools/blender/assemble.py"), "--", "/tmp/pw-export.json", ...args, `name=${name}`], { encoding: "utf8", maxBuffer: 1 << 26 });
console.log((r.stdout.match(/^(MISSING|WROTE).*$/gm) ?? [r.stderr.slice(-600)]).join("\n"));
