// Merges aim tunes from the range (T, "export all" -> aim.json) into each gun's weapon.json.
// `npm run aim -- ~/Downloads/aim.json`   aim.json: { "<model>": { "aim": {...}, "aim@scope-2": {...} } }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = process.argv[2];
if (!file) { console.log("usage: npm run aim -- <aim.json>"); process.exit(1); }
const tunes = JSON.parse(fs.readFileSync(file.replace(/^~/, process.env.HOME), "utf8"));

/** 4 space JSON with number arrays on one line (as weapon-points.py writes them) */
const format = json => JSON.stringify(json, null, 4).replace(/\[\s+([-\d.e,\s]+?)\s+\]/g, (_, list) => `[${list.split(/,\s*/).join(", ")}]`) + "\n";

for (const [model, keys] of Object.entries(tunes))
{
    const target = path.join(root, "assets/models/weapons/guns", model, "weapon.json");
    if (!fs.existsSync(target)) { console.log(`skip  ${model} (no weapon.json)`); continue; }
    const json = JSON.parse(fs.readFileSync(target, "utf8"));
    for (const [key, tune] of Object.entries(keys))
    {
        const zero = [...tune.offset, ...tune.angle].every(v => v === 0);
        if (zero) delete json[key];
        else json[key] = tune;
        console.log(`${zero ? "clear" : "set  "} ${model} ${key}`);
    }
    fs.writeFileSync(target, format(json));
}
