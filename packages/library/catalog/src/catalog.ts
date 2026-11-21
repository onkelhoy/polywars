import type { Gallery, GalleryItem } from "@polywar/gallery";
import { GRASS_LOOKS, GrassPatch } from "@polywar/grass-material";
import { SHADINGS, ShadingBall } from "@polywar/shading";
import { TERRAIN_LOOKS, TerrainSample } from "@polywar/terrain-material";
import { Skeleton } from "@polywar/skeleton";
import { Armory } from "@polywar/weapons";

/**
 * Fills a `pw-gallery` with the whole library: every file of the root `assets/` folder (its manifest),
 * plus the shader materials (shading styles, grass and terrain looks) and the baked surfaces (`model.glb` + maps). No generated terrains (slow to build; see `@polywar/terrain` views).
 * Weapons: every gun, and every gun with each scope it takes (`@polywar/weapons`), under `models/weapons/armory`
 * (pick "models/weapons" in the header for weapons only).
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
    const textured: GalleryItem[] = files.filter(f => /\/model\.glb$/.test(f) && known.has(f.replace(/model\.glb$/, "color.png"))).map(file => {
        const parts = file.split("/");
        return { name: parts.at(-2)!, group: `materials/textured/${parts.at(-4)}`, kind: "material", src: file, note: "@polywar/textured" };
    });
    const armory = await new Armory(location).items().catch(e => (console.warn("catalog: armory", e), []));
    const weapons: GalleryItem[] = armory.map(i => ({ ...i, group: `models/weapons/armory/${i.group}` }));
    gallery.location = location;
    gallery.items = [...shadings, ...grass, ...terrainLooks, ...textured, ...weapons];
}
