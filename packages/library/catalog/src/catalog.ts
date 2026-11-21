import type { Gallery, GalleryItem } from "@polywar/gallery";
import { Skeleton } from "@polywar/skeleton";
import { Armory } from "@polywar/weapons";

/**
 * Fills a `pw-gallery` with the models of the root `assets/` folder (its manifest). Materials have their own package views.
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

    const armory = await new Armory(location).items().catch(e => (console.warn("catalog: armory", e), []));
    const weapons: GalleryItem[] = armory.map(i => ({ ...i, group: `models/weapons/armory/${i.group}` }));
    gallery.location = location;
    // models only: audio, images, video and materials stay out (heavy, and they broke the page)
    gallery.kinds = ["model"];
    gallery.items = weapons;
}
