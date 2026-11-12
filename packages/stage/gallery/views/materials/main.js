import '@polywar/gallery';
import { GRASS_LOOKS, GrassPatch } from '@polywar/grass-material';

// every material: shader materials draw a sample of themselves (scene), textured ones are their baked quads.
// click a tile: pw-3d-asset-preview with its light panel
const gallery = document.querySelector('pw-gallery');
gallery.kinds = ['material'];

const grass = Object.entries(GRASS_LOOKS).map(([name, look]) => ({
    name, group: 'materials/grass', kind: 'material', note: '@polywar/grass-material',
    scene: layer => new GrassPatch(layer, look),
}));

// baked surfaces (mesh-bake): every folder with a model.glb next to its maps
const files = [];
const walk = node => node.assets.forEach(a => 'assets' in a ? walk(a) : files.push(a.file));
try { walk(await (await fetch('/assets/manifest.json')).json()); }
catch (e) { console.warn('materials: no /assets/manifest.json', e); }
const textured = files.filter(f => /\/model\.glb$/.test(f) && files.some(o => o === f.replace(/model\.glb$/, 'color.png'))).map(file => {
    const parts = file.split('/');
    return { name: parts.at(-2), group: `materials/textured/${parts.at(-4)}`, kind: 'material', src: file, note: '@polywar/textured' };
});

gallery.items = [...grass, ...textured];
