import { chromium } from "playwright";
const [base, out, gun = "kar98k"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(`${base}/packages/play/player/views/range/?guns=${gun}`);
await page.waitForFunction(() => window.player?.carried?.length && window.player.bodyHolds, null, { timeout: 60000 });
await page.click("#play");
await page.waitForTimeout(1500);
for (const [aim, pitch] of [[0, 0], [0, .7], [0, -.7], [1, 0], [1, .7]]) {
  await page.evaluate(([a, p]) => { const pl = window.player; pl.toggled = a > 0; pl.pitch = p; pl.input.locked = true; }, [aim, pitch]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}-a${aim}-p${pitch}.png` });
}
await browser.close();
