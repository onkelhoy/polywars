import { loadGLTF, type GLTF } from "@papit/game-mesh";
import type { PieceName } from "./catalog";
import type { Placement } from "./types";

/** where the kit glb files live, `<base>/<Piece>.glb` */
export type PieceSource = (piece: PieceName) => string;
/** flat stone pieces that exist as one quad + maps (`<baked>/<Piece>/model.glb`, see tools/bake-village.mjs) */
export const BAKED: ReadonlySet<string> = new Set(["Cobblestone_Floor_1", "Stone_Floor_1", "Stone_Floor_2", ...[1, 2, 3, 4].map(n => `Cobblestone_Dirt_Transition_${n}`), ...[1, 2, 3, 4, 5].map(n => `Stone_Wall_${n}`)]);
const trim = (s: string) => s.replace(/\/$/, "");
/** `baked`: folder of the baked pieces, used instead of the mesh for every piece in `BAKED` */
export const kitSource = (base: string, baked?: string): PieceSource => piece => baked && BAKED.has(piece) ? `${trim(baked)}/${piece}/model.glb` : `${trim(base)}/${piece}.glb`;

const cache = new Map<string, Promise<GLTF | null>>();
const load = (url: string) => {
    if (!cache.has(url)) cache.set(url, loadGLTF(url).catch(() => { cache.delete(url); return null; }));
    return cache.get(url)!;
};

/**
 * One GLTF with every placement as a node, meshes shared per piece.
 * Only real kit files are drawn; pieces whose glb fails to load are skipped and listed in `missing`.
 */
export async function compose(pieces: Placement[], source: PieceSource): Promise<GLTF & { missing: PieceName[] }> {
    const gltf: GLTF & { missing: PieceName[] } = { meshes: [], nodes: [], skins: [], roots: [], animations: [], missing: [] };
    const roots = new Map<PieceName, number[]>();
    const names = [...new Set(pieces.map(p => p.piece))];
    const files = await Promise.all(names.map(n => load(source(n))));
    names.forEach((name, i) => {
        const file = files[i];
        if (!file)
        {
            gltf.missing.push(name);
            roots.set(name, []);
            return;
        }
        const mesh = gltf.meshes.length, node = gltf.nodes.length;
        gltf.meshes.push(...file.meshes);
        gltf.nodes.push(...file.nodes.map(n => ({ ...n, skin: undefined, mesh: n.mesh === undefined ? undefined : n.mesh + mesh, children: n.children.map(c => c + node) })));
        roots.set(name, file.roots.map(r => r + node));
    });
    for (const p of pieces)
    {
        if (!roots.get(p.piece)!.length) continue;
        gltf.nodes.push({ name: p.piece, children: roots.get(p.piece)!, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], matrix: p.matrix });
        gltf.roots.push(gltf.nodes.length - 1);
    }
    return gltf;
}
