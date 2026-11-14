// Loads a view headless, runs an optional script in the page, prints page errors and its result, saves a screenshot.
// `node tools/smoke.mjs <path> [out.png] [js to evaluate after load] [wait ms]`
import { chromium } from "playwright";
const [path, out = "/tmp/smoke.png", js = "", wait = "2500"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
page.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !m.text().includes("GL Driver")) console.log(`console.${m.type()}:`, m.text()); });
await page.goto(`${process.env.BASE ?? "http://localhost:4000"}/${path}`);
await page.waitForTimeout(+wait);
if (js) console.log("result:", JSON.stringify(await page.evaluate(js)));
await page.screenshot({ path: out });
await browser.close();
