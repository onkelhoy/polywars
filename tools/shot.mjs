// Headless screenshot of a dev server page: `node tools/shot.mjs <url> <out.png> [wait ms] [selector]`
import { chromium } from "playwright";
const [url, out, wait = "8000", sel] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
page.on("pageerror", e => console.log("pageerror:", e.message));
await page.goto(url);
await page.waitForTimeout(+wait);
if (sel) await page.locator(sel).screenshot({ path: out }); else await page.screenshot({ path: out });
await browser.close();
