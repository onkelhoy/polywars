#!/usr/bin/env node
// node bin/manifest.mjs <folder> [--prefix=/url/of/folder] [--out=<file>]
// Writes <folder>/manifest.json, a tree of every file, for <pw-gallery location="...">.
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

/**
 * Scan `folder` into a tree and write it as `manifest.json`:
 *   Assets = { name, assets: (Asset | Assets)[] }, Asset = { name, file, size }
 * `file` is the url (prefix + path inside the folder). Folders first, then files, both sorted.
 */
export function writeManifest(folder, prefix = "/" + relative(process.cwd(), resolve(folder)), out = join(folder, "manifest.json")) {
    prefix = prefix.replace(/\/$/, "");
    const root = resolve(folder);
    const scan = (dir) => {
        const assets = [];
        const names = readdirSync(dir).filter(n => !n.startsWith(".") && n !== "manifest.json").sort();
        for (const name of names.filter(n => statSync(join(dir, n)).isDirectory()))
        {
            const child = scan(join(dir, name));
            if (child.assets.length) assets.push(child);
        }
        for (const name of names.filter(n => !statSync(join(dir, n)).isDirectory()))
        {
            const path = join(dir, name);
            assets.push({ name, file: `${prefix}/${relative(root, path).split("\\").join("/")}`, size: statSync(path).size });
        }
        return { name: basename(dir), assets };
    };
    const tree = scan(root);
    writeFileSync(out, JSON.stringify(tree, null, 1) + "\n");
    return tree;
}

/** number of files in a tree */
export const count = tree => tree.assets.reduce((n, a) => n + ("assets" in a ? count(a) : 1), 0);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const args = process.argv.slice(2);
    const flag = name => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
    const folder = args.find(a => !a.startsWith("--"));
    if (!folder) { console.log("usage: node bin/manifest.mjs <folder> [--prefix=/url] [--out=file]"); process.exit(1); }
    console.log(`manifest: ${count(writeManifest(folder, flag("prefix"), flag("out")))} files`);
}
