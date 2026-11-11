import '@polywar/3d-asset-preview';

const preview = document.querySelector('pw-3d-asset-preview');
const pick = document.querySelector('#pick');
const info = document.querySelector('#info');

// manifest is a tree: { name, assets: (Asset | Assets)[] }, Asset = { name, file, size }
const walk = (node, path) => node.assets.flatMap(a => a.assets ? walk(a, `${path}/${a.name}`) : [{ path: a.file, label: `${path.slice(8)}/${a.name}` }]);
const tree = await (await fetch('/assets/manifest.json')).json();
for (const { path, label } of walk(tree, '/assets').filter(f => f.path.endsWith('.glb')))
    pick.add(new Option(label, path, false, path === preview.src));

pick.onchange = () => preview.src = pick.value;
document.querySelector('#toon').oninput = e => preview.toon = Number(e.target.value);
document.querySelector('#grid').onchange = e => preview.grid = e.target.checked;
preview.addEventListener('load', e => {
    const { triangles, size, animations } = e.detail;
    info.value = `${Math.round(triangles)} tris · ${size.map(v => (v * 100).toFixed(1)).join(' × ')} cm · ${animations.length} animations`;
});
