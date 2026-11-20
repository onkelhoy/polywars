#!/usr/bin/env node
// Writes the generated weapon sounds into assets/audio/effects/weapons/<model>/ (+ sounds.json) and brass/, explosions into assets/audio/effects/explosions/.
// A set whose sounds.json exists is left alone (hand edits win): --force regenerates, --only=kar98k,m1911 picks sets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunSet, brassSet, explosionSet, voice, wav, RATE } from "@polywar/sfx-gen";
import { GUNS, CALIBERS } from "@polywar/weapons";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
let out = path.join(root, "assets/audio/effects/weapons");
const args = process.argv.slice(2), force = args.includes("--force");
const only = args.find(a => a.startsWith("--only="))?.slice(7).split(",");

function write(name, set) {
    const dir = path.join(out, name), json = path.join(dir, "sounds.json");
    if (only && !only.includes(name)) return;
    if (!force && fs.existsSync(json)) return console.log(`keep  ${name}`);
    fs.mkdirSync(dir, { recursive: true });
    const sounds = {};
    let bytes = 0;
    for (const [cue, variants] of Object.entries(set))
        sounds[cue] = variants.map((x, i) => {
            const file = `${cue}-${i + 1}.wav`, data = wav(x, RATE);
            fs.writeFileSync(path.join(dir, file), data);
            bytes += data.length;
            return file;
        });
    fs.writeFileSync(json, JSON.stringify({ rate: RATE, sounds }, null, 4) + "\n");
    console.log(`wrote ${name} (${(bytes / 1024).toFixed(0)} kB)`);
}

// one set per model (the scoped garand shares the garand's); the action comes from weapon.json
const done = new Set();
for (const spec of Object.values(GUNS))
{
    if (done.has(spec.model)) continue;
    done.add(spec.model);
    const file = path.join(root, "assets/models/weapons/guns", spec.model, "weapon.json");
    const weapon = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    const action = weapon.action ?? (spec.kind === "pistol" ? "pistol" : spec.auto ? "auto" : "semi");
    const name = weapon.sounds ?? spec.model;
    write(name, gunSet(name, voice(spec.kind, action, spec.caliber, CALIBERS[spec.caliber].speed)));
}
write("brass", brassSet());
out = path.join(root, "assets/audio/effects");
write("explosions", explosionSet());
