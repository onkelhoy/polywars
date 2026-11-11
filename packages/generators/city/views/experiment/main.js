import '@polywar/3d-asset-preview';
import { city, getStyle, registerStyle, styleNames } from '@polywar/city';
import { kitSource, medievalStyle } from '@polywar/city-medieval';

const $ = s => document.querySelector(s);
const preview = $('pw-3d-asset-preview');
const register = () => registerStyle(medievalStyle(kitSource($('#base').value, $('#base').value.replace(/\/$/, '') + '-baked')));
register();
$('#style').append(...styleNames().map(n => new Option(n)));

async function generate() {
    const options = { style: $('#style').value, ...Object.fromEntries(['seed', 'radius', 'block', 'street', 'empty'].map(k => [k, Number($('#' + k).value)])) };
    const result = city(options);
    const gltf = await getStyle(options.style).render(result.pieces);
    preview.gltf = gltf;
    $('#info').value = `${result.lots.filter(l => !l.empty).length}/${result.lots.length} lots · ${result.pieces.length} pieces` + (gltf.missing?.length ? ` · ${gltf.missing.length} kit files missing` : '');
}
$('#dice').onclick = () => { $('#seed').value = Math.floor(Math.random() * 1e9); generate(); };
$('#generate').onclick = generate;
$('#base').onchange = () => { register(); generate(); };
document.querySelectorAll('aside input:not(#base), aside select').forEach(i => i.onchange = generate);
generate();
