// node tools/blender/render-city.mjs out.jpg [city options json] [render args...]: a medieval village through Blender, to check it
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const { medievalStyle, kitSource } = await import(join(ROOT, "packages/generators/city-medieval/lib/bundle.js"));
const { city, registerStyle } = await import(join(ROOT, "packages/generators/city/lib/bundle.js"));
const [out, options = "{}", ...rest] = process.argv.slice(2);
registerStyle(medievalStyle(kitSource("")));
const c = city({ style: "medieval", ...JSON.parse(options) });
const baked = p => `assets/models/buildings/modular-village/baked/${p}/model.glb`;
const list = c.pieces.map(p => existsSync(join(ROOT, baked(p.piece))) ? { ...p, file: baked(p.piece) } : p);
writeFileSync("/tmp/pw-city.json", JSON.stringify(list));
console.log(c.lots.length, "lots,", c.lots.filter(l => l.empty).length, "squares,", c.pieces.length, "pieces");
const r = spawnSync("/Applications/Blender.app/Contents/MacOS/Blender", ["-b", "-P", join(ROOT, "tools/blender/render_pieces.py"), "--", "/tmp/pw-city.json", out, ...rest], { encoding: "utf8", maxBuffer: 1 << 26 });
console.log((r.stdout.match(/^(MISSING|RENDERED).*$/gm) ?? [r.stderr.slice(-400)]).join("\n"));
