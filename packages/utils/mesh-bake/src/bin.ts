import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Args } from "@papit/arguments";
import { Terminal } from "@papit/terminal";
import { AXES, DEFAULTS, bake, bakeFiles, readGLB } from "./index";
import type { Axis, BakeSettings } from "./types";

const HELP = `mesh-bake <file.glb ...> [options]
Flattens a relief mesh (cobblestone, stone wall, ...) into one quad + maps:
  <out>/<Name>/model.glb   quad with uvs, references the maps
  <out>/<Name>/color.png   colour (sRGB)
  <out>/<Name>/normal.png  tangent space normals from the relief (OpenGL, +Y up)
  <out>/<Name>/ao.png      ambient occlusion (grey)
  <out>/<Name>/spec.png    highlight strength (grey)

  --axis +y          side the surface is seen from: x, y, z with optional sign (ground: +y)
  --size 2x2         baked rectangle in metres, across x up (default: bounds rounded up to --snap)
  --center a,b       centre of the rectangle on the two in-plane axes (default: bounds centre rounded to --snap)
  --snap 0.5         grid for the two defaults above
  --res 256          pixels per metre
  --samples 4        supersampling per axis (1-8)
  --no-tile          the piece does not repeat: no wrapping at the edges
  --strength 1       normal map strength
  --soften 0         metres the relief is blurred by before the normals
  --ao 1             ambient occlusion strength (0 = off)
  --ao-radius 0.04   metres the ambient occlusion looks around
  --ao-color 0       0-1: ambient occlusion also multiplied into the colour map
  --spec 1           highlight strength, or per material: "Dirt=0.1,*=1"
  --spec-cavity 1    0-1: occluded parts lose their highlight
  --plane top        where the quad sits along the axis: top, bottom or a number
  --out <dir>        default: <folder of the glb>-baked
Values that start with a minus need "=": --axis=-y, --center=-0.5,0.5`;

const fail = (message: string): never => { Terminal.error(message); process.exit(1); };
const args = new Args(process.argv.slice(2), ["no-tile", "help"]);
const files = args.values;
if (!files.length || args.has("help"))
{
    Terminal.write(HELP);
    process.exit(args.has("help") ? 0 : 1);
}
const number = (key: string, fallback?: number): number => {
    if (!args.has(key) && fallback === undefined) return fail(`--${key} needs a number`);
    if (!args.has(key)) return fallback!;
    return args.number(key) ?? fail(`--${key} ${args.string(key)} is not a number`);
};
const pair = (key: string, separator: string): [number, number] | undefined => {
    if (!args.has(key)) return undefined;
    const p = String(args.string(key)).split(separator).map(Number);
    return p.length === 2 && p.every(Number.isFinite) ? p as [number, number] : fail(`--${key} ${args.string(key)}: expected two numbers with "${separator}" between`);
};
const given = (args.string("axis") ?? "+y").toLowerCase(), axis = /^[+-]/.test(given) ? given : "+" + given;
if (!AXES.includes(axis as Axis)) fail(`unknown axis ${given}`);
const specByMaterial: Record<string, number> = {};
let spec = DEFAULTS.spec;
for (const part of String(args.string("spec") ?? DEFAULTS.spec).split(","))
{
    const [key, value] = part.includes("=") ? part.split("=") : ["*", part];
    if (!Number.isFinite(Number(value))) fail(`--spec ${args.string("spec")}: ${value} is not a number`);
    if (key.trim() === "*") spec = Number(value); else specByMaterial[key.trim()] = Number(value);
}
const plane = args.string("plane") ?? "top";
const settings: BakeSettings = {
    axis: axis as Axis, size: pair("size", "x"), center: pair("center", ","), snap: number("snap", DEFAULTS.snap),
    resolution: number("res", DEFAULTS.resolution), samples: number("samples", DEFAULTS.samples), tile: !args.has("no-tile"),
    normalStrength: number("strength", DEFAULTS.normalStrength), soften: number("soften", DEFAULTS.soften),
    aoStrength: number("ao", DEFAULTS.aoStrength), aoRadius: number("ao-radius", DEFAULTS.aoRadius), aoInColor: number("ao-color", DEFAULTS.aoInColor),
    spec, specByMaterial, specCavity: number("spec-cavity", DEFAULTS.specCavity),
    plane: plane === "top" || plane === "bottom" ? plane : number("plane"),
};

let failed = 0;
(async function () {
for (const file of files)
    try
    {
        const name = basename(file).replace(/\.glb$/i, "");
        const result = bake(readGLB(readFileSync(file)), settings);
        const out = join(resolve(args.string("out") ?? dirname(resolve(file)) + "-baked"), name);
        mkdirSync(out, { recursive: true });
        for (const f of await bakeFiles(result, name)) writeFileSync(join(out, f.name), f.data);
        const holes = result.coverage < .999 ? `, ${(result.coverage * 100).toFixed(1)}% covered (rest filled)` : "";
        Terminal.success(Terminal.bold(name), `${result.triangles} → 2 tris, ${result.size.join("x")} m, ${result.width}x${result.height} px, relief ${(result.depth * 100).toFixed(1)} cm${holes}`);
    }
    catch (e) { failed++; Terminal.error(file, (e as Error).message); }
process.exit(failed ? 1 : 0);
}());
