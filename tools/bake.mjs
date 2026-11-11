// npm run bake -- <file.glb ...> [options]
// Flattens a relief mesh (cobblestone, stone wall, ...) into one quad + textures:
//   <out>/<Name>/model.glb  quad with uvs, references the maps below
//   <out>/<Name>/albedo.png colour (sRGB)
//   <out>/<Name>/normal.png tangent space normals from the relief (OpenGL, +Y up)
//   <out>/<Name>/spec.png   highlight strength (grey)
//
//   --axis +y      side the surface is seen from: x, y, z with optional sign (default +y, ground). Walls of the village kit: +x
//   --size 2x2     baked rectangle in metres, across x up (default: bounds rounded up to --snap)
//   --center a,b   centre of the rectangle on the two in-plane axes (default: bounds centre rounded to --snap)
//   --snap 0.5     grid for the defaults above
//   --res 256      pixels per metre
//   --strength 1   normal map strength
//   --ao 0.35      darkening of recessed parts in the albedo (0 = off)
//   --spec 0.5     highlight strength, or per material: "Dirt=0,*=0.5"
//   --plane top    where the quad sits along the axis: top, bottom or a number
//   --out <dir>    default: <folder of the glb>-baked
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const SS = 4; // supersampling per axis

// ---------- arguments ----------
const args = process.argv.slice(2);
const files = [], opt = { axis: "+y", snap: "0.5", res: "256", strength: "1", ao: "0.35", spec: "0.5", plane: "top" };
for (let i = 0; i < args.length; i++)
{
    if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i];
    else files.push(args[i]);
}
if (!files.length)
{
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));
    process.exit(1);
}

// tangent (image right), bitangent (image up), normal (toward the viewer): right handed
const FRAMES = {
    "+x": [[0, 0, -1], [0, 1, 0], [1, 0, 0]], "-x": [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    "+y": [[1, 0, 0], [0, 0, -1], [0, 1, 0]], "-y": [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
    "+z": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "-z": [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
};
const axis = /^[+-]/.test(opt.axis) ? opt.axis : "+" + opt.axis;
const [T, B, N] = FRAMES[axis.toLowerCase()] ?? (console.error(`bake: unknown axis ${opt.axis}`), process.exit(1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) { console.error(`bake: --${name} ${v} is not a number`); process.exit(1); } return n; };
const snap = num(opt.snap, "snap"), res = num(opt.res, "res"), strength = num(opt.strength, "strength"), aoAmount = num(opt.ao, "ao");
const specOf = (() => {
    const table = {};
    for (const part of String(opt.spec).split(","))
    {
        const [k, v] = part.includes("=") ? part.split("=") : ["*", part];
        table[k.trim()] = num(v, "spec");
    }
    return name => table[name] ?? table["*"] ?? .5;
})();

// ---------- glb ----------
function readGLB(path) {
    const buf = readFileSync(path);
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb");
    const jsonLength = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
    const bin = buf.subarray(20 + jsonLength + 8);
    const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const accessor = index => {
        const a = json.accessors[index], view = json.bufferViews[a.bufferView], size = SIZES[a.type], Type = TYPES[a.componentType];
        const stride = view.byteStride ?? size * Type.BYTES_PER_ELEMENT, start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
        const out = new Float64Array(a.count * size);
        const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType];
        for (let i = 0; i < a.count; i++)
            for (let k = 0; k < size; k++) out[i * size + k] = dv[get](start + i * stride + k * Type.BYTES_PER_ELEMENT, true);
        return out;
    };
    return { json, accessor };
}

function multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}
function local(node) {
    if (node.matrix) return node.matrix;
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0];
    return [
        (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
        2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
        2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

/** every triangle in world space: 9 numbers + material index */
function triangles(path) {
    const { json, accessor } = readGLB(path);
    const out = [];
    const visit = (index, parent) => {
        const node = json.nodes[index], m = multiply(parent, local(node));
        if (node.mesh !== undefined)
            for (const prim of json.meshes[node.mesh].primitives)
            {
                const p = accessor(prim.attributes.POSITION);
                const idx = prim.indices === undefined ? Array.from({ length: p.length / 3 }, (_, i) => i) : accessor(prim.indices);
                const world = i => [
                    m[0] * p[i * 3] + m[4] * p[i * 3 + 1] + m[8] * p[i * 3 + 2] + m[12],
                    m[1] * p[i * 3] + m[5] * p[i * 3 + 1] + m[9] * p[i * 3 + 2] + m[13],
                    m[2] * p[i * 3] + m[6] * p[i * 3 + 1] + m[10] * p[i * 3 + 2] + m[14],
                ];
                for (let i = 0; i + 2 < idx.length; i += 3) out.push({ v: [world(idx[i]), world(idx[i + 1]), world(idx[i + 2])], material: prim.material ?? -1 });
            }
        (node.children ?? []).forEach(c => visit(c, m));
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    (json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_, i) => i)).forEach(r => visit(r, identity));
    const materials = (json.materials ?? []).map(m => ({ name: m.name ?? "", color: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1] }));
    return { tris: out, materials };
}

// ---------- png ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function png(width, height, channels, pixels) {
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
        out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
        return out;
    };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = channels === 1 ? 0 : 2;
    const raw = Buffer.alloc((width * channels + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(pixels.buffer, y * width * channels, width * channels).copy(raw, y * (width * channels + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const srgb = v => v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055;
const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));

// ---------- bake ----------
function bake(path) {
    const name = basename(path).replace(/\.glb$/i, "");
    const { tris, materials } = triangles(path);
    if (!tris.length) throw new Error("no triangles");

    // bounds in the bake frame
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const v of t.v)
        [dot(v, T), dot(v, B), dot(v, N)].forEach((c, k) => { min[k] = Math.min(min[k], c); max[k] = Math.max(max[k], c); });
    const up = v => Math.max(snap, Math.ceil(v / snap - 1e-3) * snap);
    const [w, h] = opt.size ? opt.size.split("x").map(v => num(v, "size")) : [up(max[0] - min[0]), up(max[1] - min[1])];
    const [cu, cv] = opt.center ? opt.center.split(",").map(v => num(v, "center")) : [0, 1].map(k => Math.round((min[k] + max[k]) / 2 / snap) * snap);
    const u0 = cu - w / 2, v0 = cv - h / 2;
    const W = Math.round(w * res), H = Math.round(h * res), SW = W * SS, SH = H * SS;

    // z-buffer, seen from +N: the highest point wins
    const height = new Float32Array(SW * SH).fill(-Infinity), mat = new Int16Array(SW * SH).fill(-2);
    for (const t of tris)
    {
        const p = t.v.map(v => [(dot(v, T) - u0) / w * SW, (dot(v, B) - v0) / h * SH, dot(v, N)]);
        const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0]))), x1 = Math.min(SW - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1]))), y1 = Math.min(SH - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
        {
            const px = x + .5, py = y + .5;
            const a = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / area;
            const b = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / area;
            const c = 1 - a - b;
            if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
            const z = a * p[0][2] + b * p[1][2] + c * p[2][2], i = y * SW + x;
            if (z > height[i]) { height[i] = z; mat[i] = t.material; }
        }
    }

    // holes take the nearest filled neighbour (grow until nothing is left)
    let holes = 0;
    for (let i = 0; i < mat.length; i++) if (mat[i] === -2) holes++;
    const coverage = 1 - holes / mat.length;
    if (holes === mat.length) throw new Error("nothing inside the rectangle");
    for (let left = holes; left > 0;)
    {
        const fill = [];
        for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++)
        {
            const i = y * SW + x;
            if (mat[i] !== -2) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= SW || ny >= SH || mat[ny * SW + nx] === -2) continue;
                fill.push(i, ny * SW + nx);
                break;
            }
        }
        for (let k = 0; k < fill.length; k += 2) { mat[fill[k]] = mat[fill[k + 1]]; height[fill[k]] = height[fill[k + 1]]; }
        left -= fill.length / 2;
    }

    // recess: how far a point sits under its (blurred) surroundings, for ao + spec. Wraps, tiles stay seamless.
    const blur = (src, radius) => {
        const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
        for (const [from, to, horizontal] of [[src, tmp, true], [tmp, out, false]])
            for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++)
            {
                let sum = 0;
                for (let k = -radius; k <= radius; k++)
                    sum += horizontal ? from[y * SW + (x + k + SW * 8) % SW] : from[((y + k + SH * 8) % SH) * SW + x];
                to[y * SW + x] = sum / (radius * 2 + 1);
            }
        return out;
    };
    const relief = Math.max(1e-6, max[2] - min[2]);
    const around = blur(height, Math.max(1, Math.round(SS * res * .012)));
    const recess = new Float32Array(SW * SH);
    for (let i = 0; i < recess.length; i++) recess[i] = Math.min(1, Math.max(0, around[i] - height[i]) / Math.min(relief, .03) * 2);

    // resolve to the final size
    const albedo = new Uint8Array(W * H * 3), normal = new Uint8Array(W * H * 3), spec = new Uint8Array(W * H);
    const texel = w / SW; // metres per supersample
    const at = (x, y) => height[((y + SH) % SH) * SW + (x + SW) % SW];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        let r = 0, g = 0, b = 0, nx = 0, ny = 0, nz = 0, s = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++)
        {
            const X = x * SS + sx, Y = y * SS + sy, i = Y * SW + X;
            const m = materials[mat[i]] ?? { name: "", color: [1, 1, 1, 1] };
            const shade = 1 - aoAmount * recess[i];
            r += m.color[0] * shade; g += m.color[1] * shade; b += m.color[2] * shade;
            s += specOf(m.name) * (1 - recess[i]);
            // slope of the relief, limited so a vertical step stays a readable edge
            const limit = 4;
            const dx = Math.max(-limit, Math.min(limit, (at(X + 1, Y) - at(X - 1, Y)) / (2 * texel) * strength));
            const dy = Math.max(-limit, Math.min(limit, (at(X, Y + 1) - at(X, Y - 1)) / (2 * texel) * strength));
            const l = Math.hypot(dx, dy, 1);
            nx += -dx / l; ny += -dy / l; nz += 1 / l;
        }
        const n = SS * SS, l = Math.hypot(nx, ny, nz) || 1;
        const o = ((H - 1 - y) * W + x); // image row 0 is the top (highest B)
        albedo[o * 3] = byte(srgb(r / n)); albedo[o * 3 + 1] = byte(srgb(g / n)); albedo[o * 3 + 2] = byte(srgb(b / n));
        normal[o * 3] = byte(nx / l * .5 + .5); normal[o * 3 + 1] = byte(ny / l * .5 + .5); normal[o * 3 + 2] = byte(nz / l * .5 + .5);
        spec[o] = byte(s / n);
    }

    // quad in the plane, counter clockwise seen from +N
    const d = opt.plane === "top" ? max[2] : opt.plane === "bottom" ? min[2] : num(opt.plane, "plane");
    const corner = (u, v) => [0, 1, 2].map(k => T[k] * u + B[k] * v + N[k] * d);
    const positions = [corner(u0, v0), corner(u0 + w, v0), corner(u0 + w, v0 + h), corner(u0, v0 + h)];
    const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const vertex = Buffer.alloc(4 * 32);
    positions.forEach((p, i) => [...p, ...N, ...uvs[i]].forEach((value, k) => vertex.writeFloatLE(value, i * 32 + k * 4)));
    const index = Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
    const bin = Buffer.concat([vertex, index]);
    const lo = [0, 1, 2].map(k => Math.min(...positions.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...positions.map(p => p[k])));
    const gltf = {
        asset: { version: "2.0", generator: "polywar tools/bake.mjs" },
        extensionsUsed: ["KHR_materials_specular"],
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
        meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{
            name, doubleSided: true,
            pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
            normalTexture: { index: 1 },
            extensions: { KHR_materials_specular: { specularColorTexture: { index: 2 } } },
        }],
        samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
        textures: [{ sampler: 0, source: 0 }, { sampler: 0, source: 1 }, { sampler: 0, source: 2 }],
        images: [{ uri: "albedo.png" }, { uri: "normal.png" }, { uri: "spec.png" }],
        buffers: [{ byteLength: bin.length }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertex.length, byteStride: 32, target: 34962 }, { buffer: 0, byteOffset: vertex.length, byteLength: index.length, target: 34963 }],
        accessors: [
            { bufferView: 0, byteOffset: 0, componentType: 5126, count: 4, type: "VEC3", min: lo, max: hi },
            { bufferView: 0, byteOffset: 12, componentType: 5126, count: 4, type: "VEC3" },
            { bufferView: 0, byteOffset: 24, componentType: 5126, count: 4, type: "VEC2" },
            { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" },
        ],
    };
    let json = Buffer.from(JSON.stringify(gltf));
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
    const chunkHead = (length, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(length, 0); b.writeUInt32LE(type, 4); return b; };

    const out = join(resolve(opt.out ?? dirname(resolve(path)) + "-baked"), name);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "model.glb"), Buffer.concat([head, chunkHead(json.length, 0x4e4f534a), json, chunkHead(bin.length, 0x004e4942), bin]));
    writeFileSync(join(out, "albedo.png"), png(W, H, 3, albedo));
    writeFileSync(join(out, "normal.png"), png(W, H, 3, normal));
    writeFileSync(join(out, "spec.png"), png(W, H, 1, spec));
    console.log(`baked ${name}: ${tris.length} → 2 tris, ${w}x${h} m, ${W}x${H} px, relief ${(relief * 100).toFixed(1)} cm${coverage < .999 ? `, ${(coverage * 100).toFixed(1)}% covered (rest filled)` : ""}`);
}

let failed = 0;
for (const file of files)
    try { bake(file); }
    catch (e) { failed++; console.error(`FAILED ${file}: ${e.message}`); }
process.exit(failed ? 1 : 0);
