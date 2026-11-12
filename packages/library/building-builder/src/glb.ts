import type { GLTF } from "@papit/game-mesh";
import type { MapUrls } from "@polywar/textured";

/**
 * A GLTF (as `@papit/game-mesh` reads it, + optional `maps` per mesh/primitive) as one binary .glb.
 * Positions, normals, uvs, indices; node matrices or TRS. Colour: a primitive with one colour gets it as material colour, else vertex colours.
 * Maps become embedded images on a material (albedo, normal, occlusion, `KHR_materials_specular`).
 * Generic: belongs in `@papit/game-mesh` (no writer there yet).
 */
export async function writeGLB(gltf: GLTF & { maps?: (MapUrls | undefined)[][] }): Promise<ArrayBuffer> {
    const chunks: Uint8Array[] = [];
    let length = 0;
    const bufferViews: any[] = [], accessors: any[] = [], images: any[] = [], textures: any[] = [], materials: any[] = [];
    const view = (bytes: Uint8Array, target?: number) => {
        const pad = (4 - (length % 4)) % 4;
        if (pad) { chunks.push(new Uint8Array(pad)); length += pad; }
        bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
        chunks.push(bytes);
        length += bytes.byteLength;
        return bufferViews.length - 1;
    };
    const accessor = (data: Float32Array | Uint16Array | Uint32Array, type: string, size: number, minmax = false, target = 34962) => {
        const a: any = {
            bufferView: view(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target),
            componentType: data instanceof Float32Array ? 5126 : data instanceof Uint16Array ? 5123 : 5125,
            count: data.length / size, type,
        };
        if (minmax)
        {
            const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
            for (let i = 0; i < data.length; i++) { const k = i % size; min[k] = Math.min(min[k], data[i]); max[k] = Math.max(max[k], data[i]); }
            Object.assign(a, { min, max });
        }
        accessors.push(a);
        return accessors.length - 1;
    };

    // one material per distinct set of maps, images embedded once per url
    const imageOf = new Map<string, Promise<number>>();
    const image = (url: string) => {
        if (!imageOf.has(url)) imageOf.set(url, fetch(url).then(r => r.arrayBuffer()).then(data => {
            images.push({ bufferView: view(new Uint8Array(data)), mimeType: "image/png" });
            textures.push({ source: images.length - 1 });
            return textures.length - 1;
        }));
        return imageOf.get(url)!;
    };
    const materialOf = new Map<string, number>();
    /** `color`: one linear rgba for the whole primitive (written as the material colour), else vertex colours */
    const plain = (color?: number[]) => {
        const k = color ? color.map(c => c.toFixed(4)).join(",") : "";
        if (!materialOf.has(k))
        {
            materials.push({ name: color ? `colour ${materials.length}` : "vertex colour", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1, ...(color ? { baseColorFactor: color } : {}) } });
            materialOf.set(k, materials.length - 1);
        }
        return materialOf.get(k)!;
    };
    /** the single colour of a primitive, if all vertices share it */
    const uniform = (colors?: Float32Array) => {
        if (!colors) return undefined;
        for (let i = 4; i < colors.length; i++) if (Math.abs(colors[i] - colors[i % 4]) > 1e-4) return undefined;
        return [...colors.subarray(0, 4)];
    };
    const material = async (maps?: MapUrls, color?: number[]) => {
        if (!maps) return plain(color);
        const k = JSON.stringify(maps);
        if (!materialOf.has(k))
        {
            const m: any = { pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } };
            if (maps.albedo) m.pbrMetallicRoughness.baseColorTexture = { index: await image(maps.albedo) };
            if (maps.normal) m.normalTexture = { index: await image(maps.normal) };
            if (maps.ao) m.occlusionTexture = { index: await image(maps.ao) };
            if (maps.spec) m.extensions = { KHR_materials_specular: { specularColorTexture: { index: await image(maps.spec) } } };
            materials.push(m);
            materialOf.set(k, materials.length - 1);
        }
        return materialOf.get(k)!;
    };

    const meshes = [];
    for (let mi = 0; mi < gltf.meshes.length; mi++)
    {
        const primitives = [];
        for (let pi = 0; pi < gltf.meshes[mi].primitives.length; pi++)
        {
            const p = gltf.meshes[mi].primitives[pi], attributes: Record<string, number> = {};
            attributes.POSITION = accessor(p.positions, "VEC3", 3, true);
            attributes.NORMAL = accessor(p.normals, "VEC3", 3);
            const maps = gltf.maps?.[mi]?.[pi], color = maps ? undefined : uniform(p.colors);
            if (p.colors && !color && !maps) attributes.COLOR_0 = accessor(p.colors, "VEC4", 4);
            if (p.uvs) attributes.TEXCOORD_0 = accessor(p.uvs, "VEC2", 2);
            const prim: any = { attributes, material: await material(maps, color) };
            if (p.indices) prim.indices = accessor(p.indices, "SCALAR", 1, false, 34963);
            primitives.push(prim);
        }
        meshes.push({ name: gltf.meshes[mi].name, primitives });
    }
    // glTF nodes form a tree: a node reused under several parents (one kit piece placed many times) is copied, meshes stay shared
    const nodes: any[] = [];
    const copy = (index: number): number => {
        const n = gltf.nodes[index], at = nodes.length;
        nodes.push({
            ...(n.name ? { name: n.name } : {}),
            ...(n.mesh !== undefined ? { mesh: n.mesh } : {}),
            ...(n.matrix ? { matrix: [...n.matrix] } : { translation: n.translation, rotation: n.rotation, scale: n.scale }),
        });
        if (n.children.length) nodes[at].children = n.children.map(copy);
        return at;
    };
    const roots = gltf.roots.map(copy);
    const json: any = {
        asset: { version: "2.0", generator: "polywar city-medieval" },
        scene: 0, scenes: [{ nodes: roots }], nodes, meshes, materials, accessors, bufferViews,
        buffers: [{ byteLength: length }],
    };
    if (images.length) Object.assign(json, { images, textures, samplers: [{ wrapS: 10497, wrapT: 10497 }] });
    if (materials.some(m => m.extensions)) json.extensionsUsed = ["KHR_materials_specular"];
    for (const t of textures) t.sampler = 0;

    const bin = new Uint8Array(length + ((4 - (length % 4)) % 4));
    let offset = 0;
    for (const c of chunks) { bin.set(c, offset); offset += c.byteLength; }
    let text = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (text.byteLength % 4)) % 4;
    if (jsonPad) { const t = new Uint8Array(text.byteLength + jsonPad).fill(0x20); t.set(text); text = t; }
    const total = 12 + 8 + text.byteLength + 8 + bin.byteLength, out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(text, 20);
    const b = 20 + text.byteLength;
    dv.setUint32(b, bin.byteLength, true); dv.setUint32(b + 4, 0x004e4942, true); u8.set(bin, b + 8);
    return out;
}
