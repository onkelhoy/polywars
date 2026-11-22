// node tools/weather-sounds.mjs: fetch the CC0 weather recordings (bigsoundbank.com, Joseph Sardin; close strikes from
// freesound.org CC0 uploads, HQ previews), cut each rain /
// wind bed to its steadiest 30 s as a seamless loop, keep thunder whole, encode mono AAC (macOS afconvert) into
// assets/audio/weather/ + sounds.json (the set @polywar/weather-audio reads).
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "assets/audio/weather", TMP = "/tmp/pw-weather-sounds";
// beds are dull + long: 22 kHz is plenty; thunder / strikes keep their crack: 44.1 kHz, higher bitrate
let SR = 22050;
// name: [bigsoundbank id, kind, note]
const SET = {
    "ground-light": ["1289", "bed", "rain on concrete"],
    "ground-heavy": ["1019", "bed", "summer rain on a terrace"],
    water: ["1290", "bed", "rain on a puddle"],
    leaves: ["0555", "bed", "forest dripping after rain"],
    tent: ["1292", "bed", "rain on a plastic tarpaulin"],
    roof: ["1291", "bed", "rain on a wheelbarrow (tin)"],
    "vehicle-light": ["1293", "bed", "rain on a car roof"],
    "vehicle-heavy": ["1294", "bed", "big rain on a car roof"],
    "wind-light": ["0659", "bed", "wind in a tree"],
    "wind-strong": ["1450", "bed", "strong wind and trees"],
    "wind-inside": ["1714", "bed", "wind from inside"],
    "thunder-near-1": ["3113", "near", ""], "thunder-near-2": ["3114", "near", ""], "thunder-near-3": ["3115", "near", ""],
    "thunder-near-4": ["3179", "near", ""], "thunder-near-5": ["3180", "near", ""],
    "thunder-far-1": ["2718", "far", ""], "thunder-far-2": ["3116", "far", ""], "thunder-far-3": ["3181", "far", ""],
    "thunder-far-4": ["3182", "far", ""], "thunder-far-5": ["3183", "far", ""], "thunder-far-6": ["3184", "far", ""],
    // close strikes (crack + bang), freesound CC0: "fs:id_user"
    "strike-1": ["fs:434359_197070", "strike", "csengeri: close lightning strike"],
    "strike-2": ["fs:483684_7588344", "strike", "danielmcadams: super close lightning strike"],
    "strike-3": ["fs:840628_16682330", "strike", "loganzsound: closeup thunder strike"],
    "strike-4": ["fs:264826_1540977", "strike", "Martineerok: thunder (close up)"],
    "strike-5": ["fs:437243_213249", "strike", "Simon Spiers: very close lightning strike"],
    "strike-6": ["fs:336314_2660518", "strike", "supercell10: close lightning strike"],
    "strike-8": ["fs:534023_9395330", "strike", "Fission9: thunderclap"],
};
const LOOP = 30, FADE = 1.5;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const readWav = f => {
    const b = fs.readFileSync(f);
    let o = 12;
    while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
    const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
    return x;
};
const writeWav = (f, x) => {
    const b = Buffer.alloc(44 + x.length * 2);
    b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
    b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(f, b);
};

/** the steadiest LOOP s (least change in 1 s loudness), its end crossfaded into its start */
function loop(x) {
    const secs = Math.floor(x.length / SR), rms = [];
    for (let s = 0; s < secs; s++) { let a = 0; for (let i = s * SR; i < (s + 1) * SR; i++) a += x[i] * x[i]; rms.push(Math.sqrt(a / SR)); }
    const len = Math.min(LOOP, secs - 2);
    let best = 0, score = Infinity;
    for (let s = 0; s + len + FADE + 1 <= secs; s++)
    {
        const w = rms.slice(s, s + len + 2), m = w.reduce((a, b) => a + b, 0) / w.length;
        const v = w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length / (m * m || 1);
        if (v < score) { score = v; best = s; }
    }
    const n = len * SR, f = Math.floor(FADE * SR), start = best * SR, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = x[start + i];
    // equal power: the tail past the loop fades into the head
    for (let i = 0; i < f; i++) { const t = i / f; out[i] = out[i] * Math.sin(t * Math.PI / 2) + x[start + n + i] * Math.cos(t * Math.PI / 2); }
    return out;
}
const normalise = (x, to) => { let s = 0; for (const v of x) s += v * v; const g = to / (Math.sqrt(s / x.length) || 1); for (let i = 0; i < x.length; i++) x[i] *= g; return x; };

const sounds = {};
for (const [name, [id, kind, note]] of Object.entries(SET))
{
    const free = id.startsWith("fs:"), key = free ? id.slice(3) : id, num = key.split("_")[0];
    const mp3 = `${TMP}/${key}.mp3`, wav = `${TMP}/${key}.wav`, cut = `${TMP}/${name}.wav`;
    const url = free ? `https://cdn.freesound.org/previews/${Math.floor(+num / 1000)}/${key}-hq.mp3` : `https://bigsoundbank.com/UPLOAD/mp3/${id}.mp3`;
    if (!fs.existsSync(mp3)) execFileSync("curl", ["-sfL", "-o", mp3, url]);
    SR = kind === "bed" ? 22050 : 44100;
    execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${SR}`, "-c", "1", mp3, wav]);
    let x = readWav(wav);
    // beds even in level (the mixer sets loudness), thunder keeps its own dynamics, peak normalised
    if (kind === "bed") x = normalise(loop(x), .12);
    else
    {
        // strikes: from just before the crack (the loudest moment), at most 25 s
        if (kind === "strike") { let at = 0, p = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > p) { p = Math.abs(x[i]); at = i; } let s = at; const win = SR * .6; while (s > Math.max(0, at - win) && Math.abs(x[s]) > p * .02) s--; s = Math.max(0, s - Math.floor(SR * .05)); x = x.slice(s, s + SR * 25); for (let i = 0; i < SR * .02 && i < x.length; i++) x[i] *= i / (SR * .02); const f = SR * 2; for (let i = 0; i < f && i < x.length; i++) x[x.length - 1 - i] *= i / f; }
        let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); for (let i = 0; i < x.length; i++) x[i] *= .95 / p; }
    writeWav(cut, x);
    execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", kind === "bed" ? "48000" : "128000", cut, `${OUT}/${name}.m4a`]);
    sounds[name] = { kind, seconds: +(x.length / SR).toFixed(2), source: free ? `https://freesound.org/s/${num}/` : `https://bigsoundbank.com/sound-${id}.html`, note };
    console.log(name, sounds[name].seconds + "s");
}
fs.writeFileSync(`${OUT}/sounds.json`, JSON.stringify({ license: "CC0 (bigsoundbank.com, Joseph Sardin; freesound.org uploads listed per sound)", sounds }, null, 2) + "\n");
