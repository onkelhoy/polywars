// Roads scenarios view headless: `node tools/scenario-shot.mjs out-prefix [last N]` (top-down figures + info lines)
import { chromium } from "playwright";
const [prefix = "/tmp/sc", last = "6"] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on("pageerror", e => console.log("pageerror:", e.message));
await p.goto("http://localhost:4000/packages/library/roads/views/scenarios/");
await p.waitForFunction(() => document.querySelector("#info")?.value, null, { timeout: 120000 });
console.log((await p.evaluate(() => document.querySelector("#info").value)).split("\n").slice(-last).join("\n"));
const figs = await p.$$("#tops figure");
for (let i = Math.max(0, figs.length - last); i < figs.length; i++) await figs[i].screenshot({ path: `${prefix}-${i}.png` });
await b.close();
