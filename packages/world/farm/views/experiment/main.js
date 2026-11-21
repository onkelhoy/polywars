import '@polywar/viewport';
import { upload, loadGLTF } from '@papit/game-mesh';
import { loadTexture } from '@polywar/textured';
import { Renderer } from '@polywar/renderer';
import { Scatter } from '@polywar/scatter';
import { Terrain, MAPS } from '@polywar/terrain';
import { linear, coverMap } from '@polywar/terrain-material';
import { Grass } from '@polywar/grass';
import { generateFarm, groundEdits, fencePosts, cropRows, zoneAt } from '@polywar/farm';

// one farm on a tiny real terrain (a few hundred metres, low resolution: grows in a moment)
const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const layer = demo.layer, gl = layer.gl;
const renderer = new Renderer(layer);
renderer.light.fogDensity = .0012;
renderer.light.fogColor = linear('#a9bfd3');
renderer.light.sunDirection = [.45, .64, .62];

// names: "Barn" (farm folder), "props/village/bale" (path under models), nature models by name
const TREES = { hedge: ['CommonTree_1', 'CommonTree_2', 'BirchTree_1', 'Bush_1'], bank: ['Willow_1', 'Willow_2', 'Bush_1', 'BushBerries_1'], wild: ['CommonTree_1', 'CommonTree_3', 'PineTree_1', 'BirchTree_2', 'Bush_2'] };
const ROCKS = ['Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5'];
// crops: [between rows, along a row] metres, `jitter` metres off the row, `skip` chance a plant is missing, `cap` plants per farm
const CROPS = { wheat: { models: ['Wheat'], scale: 1.4, spacing: [1.4, 1], jitter: .35, skip: .15, sway: 2 }, corn: { models: ['Corn_1', 'Corn_2'], scale: 1, spacing: [1.6, 1.2], jitter: .3, skip: .1, sway: 1.2 } };
const CROP_CAP = 40000;
const CROP_MODELS = new Set(Object.values(CROPS).flatMap(c => c.models));
const NATURE = new Set([...Object.values(TREES).flat(), ...ROCKS, ...Object.values(CROPS).flatMap(c => c.models)]);
const url = (name, lod) => {
    const path = name.includes('/') ? name : NATURE.has(name) ? `nature/${name}` : `buildings/farm/${name}`;
    if (lod && path.startsWith('props/')) return undefined;
    // crops: the last two lods (hull, card) look bad, the scatter keeps the best level below instead
    if (lod > 3 && CROP_MODELS.has(name)) return undefined;
    return `/assets/models/${path}${lod ? `.lod${lod}` : ''}.glb`;
};
const scatter = new Scatter(renderer, url, { quality: $('#quality').value, distance: { building: 1500, tree: 900, rock: 400, bush: 300, prop: 250, crop: 120, default: 300 } });
// the world's grass look (bigger, fuller), see @polywar/world GRASS
const GRASS = { settings: { density: 32, sizeScale: 2.6, softBands: .25, lod: 0, falloff: 3 }, look: { bands: 3 }, bladeShare: .25, variation: .16 };
// the world's grass, planted from the terrain's cover map; tufts take the ground's colour (terrain.bakeAlbedo)
const grass = new Grass(layer, { ...GRASS, settings: { ...GRASS.settings, distance: 120, maxTufts: 300_000 }, quality: $('#quality').value });

// fence pieces (assets/models/buildings/farm/fences): per style close / close.L / close.R / open, along -x from the origin
const FENCE_URL = (style, kind) => `/assets/models/buildings/farm/fences/fence.${style}.${kind}.glb`;
const pieces = new Map();
async function piece(style, kind) {
    const k = style + kind;
    if (!pieces.has(k)) pieces.set(k, loadGLTF(FENCE_URL(style, kind)).then(g => {
        const prims = g.meshes.flatMap(m => m.primitives);
        let x0 = Infinity, x1 = -Infinity;
        for (const p of prims) for (let i = 0; i < p.positions.length; i += 3) { x0 = Math.min(x0, p.positions[i]); x1 = Math.max(x1, p.positions[i]); }
        return { prims, x0, x1 };
    }).catch(() => null));
    return pieces.get(k);
}
/**
 * Fence lines from pieces: per edge (corner to corner) as many pieces as fit at about their own length (never squashed
 * below 85% or stretched past 120%; an edge too short for one is left out), sheared to the ground so posts stay upright.
 * Textured pieces (birch) go into a second mesh drawn with their texture.
 */
async function fenceMesh(lines, styles, g) {
    const plain = { pos: [], nor: [], col: [], uv: [], idx: [] }, tex = { pos: [], nor: [], col: [], uv: [], idx: [] };
    for (let l = 0; l < lines.length; l++) {
        const style = styles[l] ?? '1', line = lines[l];
        const ref = await piece(style, 'close');
        if (!ref) continue;
        const L = ref.x1 - ref.x0;
        let first = true;
        for (let e = 1; e < line.length; e++) {
            const [ex0, ez0] = line[e - 1], [ex1, ez1] = line[e], len = Math.hypot(ex1 - ex0, ez1 - ez0);
            let n = Math.round(len / L);
            if (n < 1 || len / n < L * .85) n = Math.floor(len / (L * .85));
            if (n < 1 || len / n > L * 1.2) continue;
            for (let k = 0; k < n; k++) {
                const ax = ex0 + (ex1 - ex0) * k / n, az = ez0 + (ez1 - ez0) * k / n, bx = ex0 + (ex1 - ex0) * (k + 1) / n, bz = ez0 + (ez1 - ez0) * (k + 1) / n;
                // first piece of a line has both posts, then one post at the far end
                const p = await piece(style, first ? 'close' : 'close.R') ?? ref;
                first = false;
                const ay = g(ax, az), by = g(bx, bz), gl_ = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / gl_, uz = (bz - az) / gl_;
                for (const m of p.prims) {
                    const out = TEXTURED.has(style) && m.uvs ? tex : plain, base = out.pos.length / 3;
                    for (let i = 0; i < m.positions.length; i += 3) {
                        const t = (m.positions[i] - p.x0) / (p.x1 - p.x0), y = m.positions[i + 1], z = m.positions[i + 2];
                        out.pos.push(ax + (bx - ax) * t - uz * z, ay + (by - ay) * t + y, az + (bz - az) * t + ux * z);
                        const nx = m.normals[i], ny = m.normals[i + 1], nz = m.normals[i + 2];
                        out.nor.push(nx * ux - nz * uz, ny, nx * uz + nz * ux);
                        const v = i / 3;
                        if (m.colors) out.col.push(m.colors[v * 4], m.colors[v * 4 + 1], m.colors[v * 4 + 2], 1); else out.col.push(1, 1, 1, 1);
                        if (m.uvs) out.uv.push(m.uvs[v * 2], m.uvs[v * 2 + 1]);
                    }
                    if (m.indices) for (const q of m.indices) out.idx.push(base + q);
                    else for (let q = 0; q < m.positions.length / 3; q++) out.idx.push(base + q);
                }
            }
        }
    }
    const up = b => b.pos.length ? upload(gl, { positions: new Float32Array(b.pos), normals: new Float32Array(b.nor), colors: new Float32Array(b.col), ...(b.uv.length ? { uvs: new Float32Array(b.uv) } : {}), indices: new Uint32Array(b.idx) }) : null;
    return { plain: up(plain), tex: up(tex) };
}
/** fence styles drawn with the birch texture (their material has it in the .blend) */
const TEXTURED = new Set(['poor']);
const birchTex = await loadTexture(gl, '/assets/models/buildings/farm/fences/birch_texture.png', true);
// pixel perfect: no filtering, no mips
gl.bindTexture(gl.TEXTURE_2D, birchTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.bindTexture(gl.TEXTURE_2D, null);
const birch = { albedo: birchTex };

let terrain, farm, edits, fences, info = '';
const settings = () => {
    const base = MAPS.inland, size = +$('#size').value;
    return {
        ...base, seed: +$('#tseed').value, size, height: Math.max(1, +$('#height').value), quality: 'low',
        settings: { resolution: 128 },
        // feature sizes scaled to the tiny map
        base: { ...(base.base ?? {}), scale: size, height: .32, octaves: 4, gain: .5, lacunarity: 2, warp: .4 },
        hills: { scale: size / 3, height: .15 },
        mountains: { coverage: 0, scale: 1400, ridge: 1000, height: 0, sharpness: 1.4, octaves: 3 },
        cities: { count: 0, radius: 40, spacing: 100, maxSlope: .12, flatten: .7, water: .4 },
    };
};

function build() {
    terrain?.destroy();
    const t0 = performance.now();
    // the farm is laid out inside the terrain pipeline: its flatten pads go into the height grid
    terrain = new Terrain(layer, settings(), {
        key: `farm${$('#seed').value}-${$('#radius').value}`, fix: d => {
            const h0 = d.size / 2, base = d.height.slice();
            const at = (x, z) => {
                const fx = Math.max(0, Math.min(d.n - 1.001, (x + h0) / d.cell)), fz = Math.max(0, Math.min(d.n - 1.001, (z + h0) / d.cell));
                const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * d.n + i;
                return (base[k] * (1 - u) + base[k + 1] * u) * (1 - v) + (base[k + d.n] * (1 - u) + base[k + d.n + 1] * u) * v;
            };
            const water = (x, z) => d.water[Math.round((z + h0) / d.cell) * d.n + Math.round((x + h0) / d.cell)] > 0;
            const ground = { height: at, water };
            const r = Math.min(+$('#radius').value, d.size / 2 - 10);
            farm = generateFarm({ x: 0, z: 0, radius: r, entry: { x: -r, z: 0 } }, ground, { seed: +$('#seed').value });
            edits = groundEdits(ground, farm.edits);
            for (const e of farm.edits) {
                if (e.kind !== 'flatten') continue;
                const rr = Math.hypot(e.w, e.d) / 2 + e.blend;
                for (let j = Math.max(0, Math.floor((e.z - rr + h0) / d.cell)); j <= Math.min(d.n - 1, Math.ceil((e.z + rr + h0) / d.cell)); j++)
                    for (let i = Math.max(0, Math.floor((e.x - rr + h0) / d.cell)); i <= Math.min(d.n - 1, Math.ceil((e.x + rr + h0) / d.cell)); i++)
                        d.height[j * d.n + i] = edits.height(i * d.cell - h0, j * d.cell - h0);
            }
        },
    });
    terrain.onchange = data => dress(data, t0);
}

async function dress(data, t0) {
    const g = (x, z) => terrain.groundAt(x, z), t1 = performance.now();
    // paint: dirt / soil / gravel into the terrain's path grid (R cover, G 0 dirt .. 255 gravel)
    const n = 512, cell = data.size / n, h0 = data.size / 2, paint = new Uint8Array(n * n * 2), G = { dirt: 0, soil: 40, gravel: 255 };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const p = edits.paint((i + .5) * cell - h0, (j + .5) * cell - h0);
        if (p) { paint[(j * n + i) * 2] = 255; paint[(j * n + i) * 2 + 1] = G[p]; }
    }
    terrain.material.paths({ data: paint, n, size: data.size });
    // fences: posts on the ground, rails follow the slope
    fences?.plain?.destroy(); fences?.tex?.destroy();
    fences = await fenceMesh(farm.fences, farm.fenceStyles, g);
    // instances: x y z scale yaw tint sway _ (shader yaw turns the other way)
    const batches = new Map();
    const add = (model, kind, x, z, scale, yaw, sway = 0, lift = 0) => {
        let b = batches.get(model);
        if (!b) batches.set(model, b = { model, kind, list: [] });
        b.list.push(x, g(x, z) + lift, z, scale, -yaw, .92 + rand() * .16, sway, 0);
    };
    let r = 1;
    const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (const b of farm.buildings) add(b.asset, 'building', b.x, b.z, 1, b.yaw);
    for (const p of farm.props) add(p.asset, 'prop', p.x, p.z, p.scale, p.yaw, 0, p.lift ?? 0);
    for (const t of farm.trees) {
        const list = TREES[t.kind], m = list[Math.floor(rand() * list.length)], bush = m.startsWith('Bush');
        add(m, bush ? 'bush' : 'tree', t.x, t.z, bush ? .8 + rand() * .6 : 2 + rand() * 1.4, rand() * 6.28, .4);
    }
    let crops = 0;
    const rows = cropRows(farm, Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, c.spacing])));
    let total = 0; for (const xz of rows.values()) total += xz.length / 3;
    const keep = Math.min(1, CROP_CAP / Math.max(1, total));
    for (const [crop, xz] of rows) {
        const c = CROPS[crop];
        for (let i = 0; i < xz.length; i += 3) {
            if (rand() < c.skip || rand() > keep) continue;
            const x = xz[i] + (rand() - .5) * 2 * c.jitter, z = xz[i + 1] + (rand() - .5) * 2 * c.jitter;
            add(c.models[Math.floor(rand() * c.models.length)], 'crop', x, z, c.scale * (.8 + rand() * .4), rand() * 6.28, c.sway); crops++;
        }
    }
    // the land round the farm: wild trees and rocks outside it, in its wood and unused cells
    const zone = zoneAt(farm);
    const wild = (x, z) => {
        if (data.water[Math.round((z + h0) / data.cell) * data.n + Math.round((x + h0) / data.cell)]) return false;
        if (edits.grass(x, z) < 1) return false;
        const zn = zone(x, z);
        return zn === 'wood' || zn === 'none';
    };
    for (let k = 0; k < data.size * data.size / 260; k++) {
        const x = (rand() - .5) * data.size, z = (rand() - .5) * data.size;
        if (!wild(x, z)) continue;
        if (rand() < .25) add(ROCKS[Math.floor(rand() * ROCKS.length)], 'rock', x, z, .5 + rand() * 1.2, rand() * 6.28);
        else { const m = TREES.wild[Math.floor(rand() * TREES.wild.length)], bush = m.startsWith('Bush'); add(m, bush ? 'bush' : 'tree', x, z, bush ? .8 + rand() * .6 : 2 + rand() * 1.4, rand() * 6.28, .4); }
    }
    await scatter.place([...batches.values()].map(b => ({ ...b, data: new Float32Array(b.list), count: b.list.length / 8 })));
    plant(data);
    info = `terrain ${((t1 - t0) | 0)} ms, dress ${((performance.now() - t1) | 0)} ms\nbuildings ${farm.buildings.length}, props ${farm.props.length}\nfields ${farm.fields.map(f => f.crop[0]).join('')}, crops ${crops}\ntrees ${farm.trees.length}, pastures ${farm.pastures.map(p => p.animal).join(' ')}`;
}

let bake = false;
function plant(data) {
    const h0 = data.size / 2, zone = zoneAt(farm);
    // the cover map: full cover, taller in pastures (and on unused land), none where the farm asked; the ground paints
    // its grass from it and the tufts plant from it
    terrain.cover(coverMap(data.size, Math.min(2048, Math.ceil(data.size)), (x, z, out) => {
        out.density = data.water[Math.round((z + h0) / data.cell) * data.n + Math.round((x + h0) / data.cell)] ? 0 : edits.grass(x, z);
        const zn = zone(x, z);
        out.height = zn === 'pasture' ? 1.9 : zn === 'none' || zn === 'wood' ? 1.3 : 1;
        out.dry = zn === 'pasture' ? .25 : .1;
        out.flowers = zn === 'pasture' ? .15 : .05;
    }));
    bake = true;
    const out = { density: 0, height: 1, dry: 0, flowers: 0 };
    grass.plant({
        area: { x: -h0, z: -h0, width: data.size, depth: data.size },
        seed: 1,
        height: (x, z) => terrain.groundAt(x, z),
        grow: (x, z) => terrain.coverAt(x, z, out),
        // planted round the camera: full density close, the falloff thins it out to 120 m
        window: 135,
    });
}

for (const id of ['#tseed', '#size', '#height', '#seed', '#radius']) $(id).onchange = build;
$('#quality').onchange = e => { scatter.set({ quality: e.target.value }); grass.set({ quality: e.target.value }); };
const at = (x, z) => terrain.groundAt(x, z);
$('#top').onclick = () => demo.look([0, at(0, 0) + 220, 1], [0, at(0, 0), 0]);
$('#yard').onclick = () => { const c = farm?.court; if (c) demo.look([c.x + 30, at(c.x, c.z) + 14, c.z + 30], [c.x, at(c.x, c.z) + 2, c.z]); };
$('#bench').onclick = () => {
    const v = farm?.view; if (!v) return;
    const y = at(v.x, v.z) + 1.4;
    demo.look([v.x - Math.cos(v.yaw) * 3, y + .6, v.z - Math.sin(v.yaw) * 3], [v.x + Math.cos(v.yaw) * 40, y - 6, v.z + Math.sin(v.yaw) * 40]);
};

let frames = 0, clock = 0;
demo.tick = dt => {
    frames++; clock += dt;
    if (clock < .5) return;
    $('#info').value = `${info}\n${scatter.drawn} drawn, ${(frames / clock).toFixed(0)} fps`;
    frames = clock = 0;
};
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
demo.draw = camera => {
    renderer.begin(camera, [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    if (bake) { const a = terrain.bakeAlbedo(2048, renderer.light); if (a) { grass.ground(a); bake = false; } }
    terrain.draw(camera, renderer.light, demo.time);
    if (fences?.plain) renderer.draw(fences.plain, I);
    if (fences?.tex) renderer.draw(fences.tex, I, { maps: birch });
    scatter.draw(camera, demo.time);
    const e = camera.worldPosition;
    if (e) grass.follow(e.x ?? e[0], e.z ?? e[2]);
    if ($('#grass').checked) grass.draw(camera, renderer.light, demo.time);
};
build();
demo.look([-150, 90, 150], [0, 0, 0]);
