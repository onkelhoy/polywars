import type { Triangles } from "./types";

const GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READ: Record<number, [keyof DataView, number]> = { 5120: ["getInt8", 1], 5121: ["getUint8", 1], 5122: ["getInt16", 2], 5123: ["getUint16", 2], 5125: ["getUint32", 4], 5126: ["getFloat32", 4] };

function multiply(a: number[], b: number[]) {
    const o = new Array<number>(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}
function local(node: any): number[] {
    if (node.matrix) return node.matrix;
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0];
    return [
        (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
        2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
        2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

/** Every triangle of a `.glb` in world space, with its material colour (`baseColorFactor`). Textures are not read. */
export function readGLB(data: ArrayBuffer | Uint8Array): Triangles {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB) throw new Error("mesh-bake: not a .glb file");
    let json: any, bin: DataView | undefined;
    for (let offset = 12; offset + 8 <= bytes.byteLength;)
    {
        const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
        if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length)));
        else if (type === BIN_CHUNK) bin = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, length);
        offset += 8 + length;
    }
    if (!json || !bin) throw new Error("mesh-bake: the .glb has no mesh data");
    const accessor = (index: number) => {
        const a = json.accessors[index], bufferView = json.bufferViews[a.bufferView], size = SIZES[a.type], [get, width] = READ[a.componentType];
        const stride = bufferView.byteStride ?? size * width, start = (bufferView.byteOffset ?? 0) + (a.byteOffset ?? 0);
        const out = new Float64Array(a.count * size);
        for (let i = 0; i < a.count; i++)
            for (let k = 0; k < size; k++) out[i * size + k] = (bin![get] as any)(start + i * stride + k * width, true);
        return out;
    };

    const positions: number[] = [], material: number[] = [];
    const visit = (index: number, parent: number[]) => {
        const node = json.nodes[index], m = multiply(parent, local(node));
        if (node.mesh !== undefined)
            for (const primitive of json.meshes[node.mesh].primitives)
            {
                if ((primitive.mode ?? 4) !== 4) continue;
                const p = accessor(primitive.attributes.POSITION);
                const indices = primitive.indices === undefined ? undefined : accessor(primitive.indices);
                const count = indices ? indices.length : p.length / 3;
                for (let i = 0; i + 2 < count; i += 3)
                {
                    for (let k = 0; k < 3; k++)
                    {
                        const v = (indices ? indices[i + k] : i + k) * 3;
                        positions.push(
                            m[0] * p[v] + m[4] * p[v + 1] + m[8] * p[v + 2] + m[12],
                            m[1] * p[v] + m[5] * p[v + 1] + m[9] * p[v + 2] + m[13],
                            m[2] * p[v] + m[6] * p[v + 1] + m[10] * p[v + 2] + m[14],
                        );
                    }
                    material.push(primitive.material ?? -1);
                }
            }
        (node.children ?? []).forEach((child: number) => visit(child, m));
    };
    const roots: number[] = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_: unknown, i: number) => i);
    roots.forEach(root => visit(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    return {
        positions: new Float32Array(positions),
        material: new Int16Array(material),
        materials: (json.materials ?? []).map((m: any) => ({ name: m.name ?? "", color: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1] })),
    };
}

/**
 * A `.glb` with one quad whose material points at `color.png`, `normal.png`, `ao.png` and `spec.png` next to it
 * (spec through `KHR_materials_specular`).
 */
export function writeGLB(name: string, quad: { positions: number[][]; normal: number[]; uvs: number[][] }): Uint8Array {
    const vertex = new DataView(new ArrayBuffer(4 * 32));
    quad.positions.forEach((p, i) => [...p, ...quad.normal, ...quad.uvs[i]].forEach((value, k) => vertex.setFloat32(i * 32 + k * 4, value, true)));
    const index = new Uint8Array(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
    const bin = new Uint8Array(vertex.byteLength + index.length);
    bin.set(new Uint8Array(vertex.buffer), 0);
    bin.set(index, vertex.byteLength);
    const bound = (pick: (...values: number[]) => number) => [0, 1, 2].map(k => pick(...quad.positions.map(p => p[k])));
    const gltf = {
        asset: { version: "2.0", generator: "mesh-bake" },
        extensionsUsed: ["KHR_materials_specular"],
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
        meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{
            name, doubleSided: true,
            pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
            normalTexture: { index: 1 },
            occlusionTexture: { index: 2 },
            extensions: { KHR_materials_specular: { specularColorTexture: { index: 3 } } },
        }],
        samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
        textures: [0, 1, 2, 3].map(source => ({ sampler: 0, source })),
        images: [{ uri: "color.png" }, { uri: "normal.png" }, { uri: "ao.png" }, { uri: "spec.png" }],
        buffers: [{ byteLength: bin.length }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: vertex.byteLength, byteStride: 32, target: 34962 },
            { buffer: 0, byteOffset: vertex.byteLength, byteLength: index.length, target: 34963 },
        ],
        accessors: [
            { bufferView: 0, byteOffset: 0, componentType: 5126, count: 4, type: "VEC3", min: bound(Math.min), max: bound(Math.max) },
            { bufferView: 0, byteOffset: 12, componentType: 5126, count: 4, type: "VEC3" },
            { bufferView: 0, byteOffset: 24, componentType: 5126, count: 4, type: "VEC2" },
            { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" },
        ],
    };
    let text = JSON.stringify(gltf);
    text += " ".repeat((4 - new TextEncoder().encode(text).length % 4) % 4);
    const json = new TextEncoder().encode(text);
    const out = new Uint8Array(12 + 8 + json.length + 8 + bin.length), view = new DataView(out.buffer);
    view.setUint32(0, GLB, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
    view.setUint32(12, json.length, true); view.setUint32(16, JSON_CHUNK, true);
    out.set(json, 20);
    view.setUint32(20 + json.length, bin.length, true); view.setUint32(24 + json.length, BIN_CHUNK, true);
    out.set(bin, 28 + json.length);
    return out;
}
