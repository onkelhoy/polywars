import '@polywar/3d-asset-preview';
import { TERRAIN_LOOKS, TerrainSample } from '@polywar/terrain-material';

// the material alone: a made up patch with every biome in pw-3d-asset-preview
const $ = s => document.querySelector(s);
const preview = $('#view'), select = $('#look');
select.innerHTML = Object.keys(TERRAIN_LOOKS).map(k => `<option>${k}</option>`).join('');
const show = () => { const look = { ...TERRAIN_LOOKS[select.value], debug: $('#debug').value }; preview.scene = layer => new TerrainSample(layer, look); };
select.onchange = show;
$('#debug').onchange = show;
show();
