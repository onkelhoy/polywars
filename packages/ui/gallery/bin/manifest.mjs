#!/usr/bin/env node
// node bin/manifest.mjs <folder> [--prefix=/url/of/folder] [--out=<file>]
// Writes <folder>/manifest.json listing every file (kind, size, folder) for <pw-gallery location="...">.
// The prefix is the url the folder is served at, default "/" + the folder relative to the current directory.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KINDS = {
    model: [".glb", ".gltf"],
    source: [".blend", ".fbx", ".obj", ".mtl"],
    audio: [".mp3", ".wav", ".ogg", ".m4a", ".flac"],
    image: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"],
};

export const kindOf = file => Object.keys(KINDS).find(k => KINDS[k].includes(extname(file).toLowerCase())) ?? "other";

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

/** Scan `folder`, write `manifest.json` into it, return the manifest. */
export function writeManifest(folder, prefix = "/" + relative(process.cwd(), resolve(folder)), out = join(folder, "manifest.json")) {
    prefix = prefix.replace(/\/$/, "");
    const files = walk(resolve(folder)).map(path => {
        const rel = relative(resolve(folder), path).split("\\").join("/");
        return { path: `${prefix}/${rel}`, name: basename(path), folder: dirname(rel) === "." ? "" : dirname(rel), kind: kindOf(path), size: statSync(path).size };
    });
    const manifest = { files };
    writeFileSync(out, JSON.stringify(manifest, null, 1) + "\n");
    return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const args = process.argv.slice(2);
    const flag = name => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
    const folder = args.find(a => !a.startsWith("--"));
    if (!folder) { console.log("usage: node bin/manifest.mjs <folder> [--prefix=/url] [--out=file]"); process.exit(1); }
    const { files } = writeManifest(folder, flag("prefix"), flag("out"));
    console.log(`manifest: ${files.length} files`);
}
