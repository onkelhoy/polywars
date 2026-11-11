import '@polywar/3d-asset-preview';

const preview = document.querySelector('pw-3d-asset-preview');
const pick = document.querySelector('#pick');
const info = document.querySelector('#info');

const { files } = await (await fetch('/assets/manifest.json')).json();
for (const file of files.filter(f => f.kind === 'model'))
{
    const option = new Option(`${file.folder}/${file.name}`, file.path, false, file.path === preview.src);
    pick.add(option);
}

pick.onchange = () => preview.src = pick.value;
document.querySelector('#toon').oninput = e => preview.toon = Number(e.target.value);
document.querySelector('#grid').onchange = e => preview.grid = e.target.checked;
preview.addEventListener('load', e => {
    const { triangles, size, animations } = e.detail;
    info.value = `${Math.round(triangles)} tris · ${size.map(v => (v * 100).toFixed(1)).join(' × ')} cm · ${animations.length} animations`;
});
