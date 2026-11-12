import type { Gallery, GalleryItem } from "@polywar/gallery";
import { GRASS_LOOKS, GrassPatch } from "@polywar/grass-material";
import { SHADINGS, ShadingBall } from "@polywar/shading";
import { DEFAULTS, MAPS, Terrain } from "@polywar/terrain";
import { TERRAIN_LOOKS, TerrainSample } from "@polywar/terrain-material";
import { Skeleton } from "@polywar/skeleton";

/**
 * Fills a `pw-gallery` with the whole library: every file of the root `assets/` folder (its manifest),
 * plus the shader materials (shading styles, grass and terrain looks), the generated terrains (map presets, low quality)
 * and the baked surfaces (`model.glb` + maps).
 * Rigged models get a `Skeleton` (bones in the preview; IK when a `rig.json` sits next to the glb).
 */
export async function catalog(gallery: Gallery, location = "/assets") {
    const files: string[] = [];
    try
    {
        const walk = (node: { assets: any[] }) => node.assets.forEach(a => "assets" in a ? walk(a) : files.push(a.file));
        walk(await (await fetch(`${location}/manifest.json`)).json());
    }
    catch (e) { console.warn("catalog: no manifest at", location, e); }
    const known = new Set(files);

    gallery.skin = async (gltf, url) => {
        const rig = url && known.has(url.replace(/\.(glb|gltf)$/i, "") + ".rig.json") ? await Skeleton.rigFor(url) : undefined;
        return new Skeleton(gltf, rig);
    };

    const shadings: GalleryItem[] = Object.entries(SHADINGS).map(([name, shading]) => ({
        name, group: "materials/shading", kind: "material", note: "@polywar/shading",
        scene: layer => new ShadingBall(layer, shading),
    }));
    const grass: GalleryItem[] = Object.entries(GRASS_LOOKS).map(([name, look]) => ({
        name, group: "materials/grass", kind: "material", note: "@polywar/grass-material",
        scene: layer => new GrassPatch(layer, look),
    }));
    const terrainLooks: GalleryItem[] = Object.entries(TERRAIN_LOOKS).map(([name, look]) => ({
        name, group: "materials/terrain", kind: "material", note: "@polywar/terrain-material",
        scene: layer => new TerrainSample(layer, look),
    }));
    const terrains: GalleryItem[] = Object.entries(MAPS).map(([name, map]) => ({
        name, group: "terrain", kind: "model", note: "@polywar/terrain",
        scene: layer => new Terrain(layer, { ...map, quality: "low", mesh: { ...DEFAULTS.mesh, skirt: 0 } }),
    }));
    const textured: GalleryItem[] = files.filter(f => /\/model\.glb$/.test(f) && known.has(f.replace(/model\.glb$/, "color.png"))).map(file => {
        const parts = file.split("/");
        return { name: parts.at(-2)!, group: `materials/textured/${parts.at(-4)}`, kind: "material", src: file, note: "@polywar/textured" };
    });
    gallery.location = location;
    gallery.items = [...shadings, ...grass, ...terrainLooks, ...textured, ...terrains];
}
