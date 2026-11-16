// Aimed / hip screenshots of the player range: `node tools/aim-shot.mjs <base url> <out prefix> [guns,comma,list] [aimed 0..1 ...]`
// Each gun of the list: one picture per aim value (toggled aim, waited until it settles).
import { chromium } from "playwright";
const [base = "http://localhost:4000", out = "/tmp/aim", list = "m1-garand,kar98k", ...aims] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(`${base}/packages/play/player/views/range/?guns=${list}`);
await page.waitForFunction(() => window.player?.carried?.length, null, { timeout: 60000 });
await page.click("#play");
await page.waitForTimeout(1500);
const guns = list.split(",");
for (let i = 0; i < guns.length; i++)
    for (const a of aims.length ? aims : ["1"])
    {
        await page.evaluate(() => { window.player.toggled = false; });
        await page.waitForTimeout(1200);
        await page.evaluate(([i, a]) => { const p = window.player; p.select(i); p.toggled = parseFloat(a) > 0; p.input.locked = true; }, [i, a]);
        // a value with "ms" (e.g. 200ms): aim and shoot that long after starting the raise
        await page.waitForTimeout(a.endsWith("ms") ? parseFloat(a) : +a > 0 ? 2500 : 1200);
        await page.screenshot({ path: `${out}-${guns[i].replace("@", "+")}-${a}.png` });
    }
await browser.close();
