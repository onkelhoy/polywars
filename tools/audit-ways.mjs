// Headless audit of the road network on a generated world (no GL): `node tools/audit-ways.mjs [quality] [seed]`.
// Bundles tools/audit/main.ts with @polywar/* mapped to package sources, then runs it.
import { build } from "esbuild";
import { realpathSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = {
    name: "polywar-src",
    setup(b) {
        b.onResolve({ filter: /^@polywar\/[^/]+$/ }, a => {
            const dir = realpathSync(join(root, "node_modules", a.path)), file = join(dir, "src/index.ts");
            return existsSync(file) ? { path: file } : undefined;
        });
    },
};
const out = join(root, "node_modules/.cache/audit-ways.mjs");
await build({ entryPoints: [join(root, "tools/audit/main.ts")], bundle: true, platform: "node", format: "esm", outfile: out, plugins: [src], logLevel: "error" });
await import(pathToFileURL(out).href);
