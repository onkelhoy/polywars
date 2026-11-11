// npm run assets [-- --all] [-- --no-export]
// 1. exports every .blend in assets/ to .glb (when the .glb is older than any .blend in its folder, or --all)
// 2. writes assets/manifest.json: every file with its kind, for the gallery
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, extname, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = join(ROOT, "assets");
const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const all = process.argv.includes("--all");

const KINDS = {
    model: [".glb", ".gltf"],
    source: [".blend", ".fbx", ".obj", ".mtl"],
    audio: [".mp3", ".wav", ".ogg", ".m4a"],
    image: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"],
};
const kindOf = file => Object.keys(KINDS).find(k => KINDS[k].includes(extname(file).toLowerCase())) ?? "other";

function walk(dir, out = []) {
    for (const name of readdirSync(dir).sort())
    {
        if (name.startsWith(".") || name === "manifest.json") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

if (!process.argv.includes("--no-export"))
{
    const blends = walk(ASSETS).filter(f => f.endsWith(".blend"));
    const newest = dir => Math.max(...blends.filter(b => dirname(b) === dir).map(b => statSync(b).mtimeMs));
    for (const blend of blends)
    {
        const glb = blend.replace(/\.blend$/, ".glb");
        if (!all && existsSync(glb) && statSync(glb).mtimeMs >= newest(dirname(blend))) continue;
        const r = spawnSync(BLENDER, ["-b", blend, "-P", join(ROOT, "tools/blender/export.py")], { encoding: "utf8" });
        const ok = r.status === 0 && /exported/.test(r.stdout);
        console.log(ok ? "exported" : "FAILED  ", relative(ROOT, glb));
        if (!ok) console.log(r.stdout.split("\n").filter(l => /Error|Traceback/.test(l)).join("\n"), r.stderr);
    }
}

const files = walk(ASSETS).map(path => ({
    path: "/" + relative(ROOT, path),
    name: basename(path),
    folder: relative(ASSETS, dirname(path)),
    kind: kindOf(path),
    size: statSync(path).size,
}));
writeFileSync(join(ASSETS, "manifest.json"), JSON.stringify({ files }, null, 1) + "\n");
console.log(`manifest: ${files.length} files`);
