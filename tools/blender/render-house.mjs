// node tools/blender/render-house.mjs out.jpg [seed] [settings json] [render args...]: one house through Blender, to check it
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const { building, DEFAULTS } = await import(join(ROOT, "packages/generators/city-medieval/lib/bundle.js"));
const [out, seed = "1", settings = "{}", ...rest] = process.argv.slice(2);
const b = building({ ...DEFAULTS, ...JSON.parse(settings) }, Number(seed));
const baked = p => `assets/models/modular-village-baked/${p}/model.glb`;
const list = b.pieces.map(p => existsSync(join(ROOT, baked(p.piece))) ? { ...p, file: baked(p.piece) } : p);
writeFileSync("/tmp/pw-house.json", JSON.stringify(list));
console.log(JSON.stringify(b.features), b.pieces.length, "pieces");
const r = spawnSync("/Applications/Blender.app/Contents/MacOS/Blender", ["-b", "-P", join(ROOT, "tools/blender/render_pieces.py"), "--", "/tmp/pw-house.json", out, ...rest], { encoding: "utf8" });
console.log((r.stdout.match(/^(MISSING|RENDERED).*$/gm) ?? [r.stderr.slice(-400)]).join("\n"));
