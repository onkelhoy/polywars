// World view screenshots headless: `node tools/world-shot.mjs out-prefix "x,z,dist,yawDeg,pitchDeg[,y]" ...`  (env WIRE=overlay/only)
import { chromium } from "playwright";
const [prefix, ...views] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto("http://localhost:4000/packages/library/world/views/world/");
await page.waitForFunction(() => window.world?.data && window.world.roads?.roads, null, { timeout: 240000 });
await page.evaluate(WIRE => { document.body.classList.add("folded"); window.world.setView({ grass: false, ...(WIRE ? { wire: WIRE } : {}) }); }, process.env.WIRE ?? "");
await page.waitForTimeout(3000);
let i = 0;
for (const v of views)
{
    const [x, z, d, yaw, pitch, fy] = v.split(",").map(Number);
    await page.evaluate(([x, z, d, yaw, pitch, fy]) => {
        const demo = document.querySelector("pw-viewport"), cam = demo.layer.camera, c = cam.controllers?.[0] ?? demo.layer.camera.controller;
        const y = Number.isFinite(fy) ? fy : window.world.terrain.groundAt(x, z), ya = yaw * Math.PI / 180, pa = pitch * Math.PI / 180;
        cam.rotation.set([pa, ya, 0]);
        c.start?.(cam);
        c.pivot.set([x, y, z]); c.distance = d;
    }, [x, z, d, yaw, pitch, fy]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${prefix}-${i++}.png` });
}
await browser.close();
