import "@papit/codeblock";
import "@polywar/share";

const out = document.getElementById("out");
document.addEventListener("scan", e => out.textContent = `scanned: ${JSON.stringify(e.detail)}`);
document.addEventListener("camera-error", e => out.textContent = `camera: ${e.detail.reason}`);
document.getElementById("open").onclick = () => document.getElementById("modal").open();
