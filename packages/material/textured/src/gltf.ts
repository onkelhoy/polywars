import type { MapUrls } from "./maps";

/**
 * Map urls of a `.glb` / `.gltf`, per mesh and primitive (`result[mesh][primitive]`, `undefined` = no maps).
 * Reads `baseColorTexture`, `normalTexture` and the `KHR_materials_specular` texture.
 * Images inside the glb become blob urls.
 */
export async function readMaps(url: string): Promise<(MapUrls | undefined)[][]> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`textured: ${url} ${response.status}`);
    const data = await response.arrayBuffer();
    const view = new DataView(data);
    let json: any, bin: ArrayBuffer | undefined;
    if (data.byteLength >= 20 && view.getUint32(0, true) === 0x46546c67)
    {
        for (let offset = 12; offset + 8 <= data.byteLength;)
        {
            const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
            if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, offset + 8, length)));
            else if (type === 0x004e4942) bin = data.slice(offset + 8, offset + 8 + length);
            offset += 8 + length;
        }
    }
    else json = JSON.parse(new TextDecoder().decode(data));
    if (!json?.meshes) return [];
    if (!json.images?.length) return json.meshes.map((m: any) => m.primitives.map(() => undefined));

    const base = new URL(url, location.href);
    const images: (string | undefined)[] = json.images.map((image: any) => {
        if (image.uri) return new URL(image.uri, base).href;
        const bufferView = json.bufferViews?.[image.bufferView];
        if (!bufferView || !bin) return undefined;
        const bytes = new Uint8Array(bin, bufferView.byteOffset ?? 0, bufferView.byteLength);
        return URL.createObjectURL(new Blob([bytes], { type: image.mimeType ?? "image/png" }));
    });
    const image = (info?: { index: number }) => info === undefined ? undefined : images[json.textures?.[info.index]?.source];
    const materials: (MapUrls | undefined)[] = (json.materials ?? []).map((m: any) => {
        const specular = m.extensions?.KHR_materials_specular;
        const maps: MapUrls = {
            albedo: image(m.pbrMetallicRoughness?.baseColorTexture),
            normal: image(m.normalTexture),
            spec: image(specular?.specularColorTexture ?? specular?.specularTexture),
        };
        return maps.albedo || maps.normal || maps.spec ? maps : undefined;
    });
    return json.meshes.map((m: any) => m.primitives.map((p: any) => materials[p.material]));
}
