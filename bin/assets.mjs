// npm run assets [-- --all] [-- --no-export] [-- --no-serve]
// 1. exports every .blend in assets/ to .glb (when the .glb is older than any .blend in its folder, or --all)
// 2. writes assets/manifest.json, a tree of every file (the gallery package's generator)
// 3. serves the gallery of everything (packages/library/catalog, its view) until Ctrl+C
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { writeManifest, count } from "../packages/ui/viewport/gallery/bin/manifest.mjs";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = join(ROOT, "assets");
const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const all = process.argv.includes("--all");

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

console.log(`manifest: ${count(writeManifest(ASSETS, "/assets"))} files`);

if (!process.argv.includes("--no-serve"))
{
    const server = spawn("npx", ["@papit/server"], { cwd: join(ROOT, "packages/library/catalog"), stdio: ["inherit", "pipe", "inherit"] });
    server.stdout.on("data", chunk => {
        const port = /server: (\d+)/.exec(String(chunk))?.[1];
        if (port) console.log(`gallery: http://localhost:${port}/views/all/`);
    });
    process.on("SIGINT", () => { server.kill(); process.exit(); });
}
